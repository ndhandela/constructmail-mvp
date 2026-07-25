"""
POMAR Vendor Management: lets a GC invite an outside company's user (a
"sub") onto one project, scoped to Daily Logs only — see
services/vendor_access.py for the access-check side of this. Deliberately
not layered on project_members/project_invites (routers/projects.py):
those grant broad, all-module access meant for the project owner's own
staff, and this feature explicitly does not want that for a stranger's
account. "vendors" here means invited people (users rows), not the
vendors directory (routers/vendors.py, `vendors` table) — a project owner
can optionally look up a directory vendor's on-file email to prefill the
invite (frontend-side only), but the resulting access grant always
targets a users row, never a vendors row.
"""
import os
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.email_service import send_email
from services.magic_link import issue_magic_link
from services.project_helpers import require_project_member

router = APIRouter(prefix="/api/project-vendors", tags=["Vendor Management"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")

# A vendor row counts as "stale" if they have an accepted grant but no log
# in this many days — drives the dashboard status badge and the "Logs 7d"
# column's window. Pulled into a named constant since we expect to tune
# this per trade later.
STALE_DAYS = 7


async def _find_or_create_lead_account(conn, email: str, name: str) -> int:
    """Same shape as routers/marketplace.py's _find_or_create_lead_account
    (not shared/extracted — that one is private to marketplace.py and this
    module has its own account_source). Never demotes an existing account
    of any type/status; only creates a brand-new lead the first time this
    email is seen."""
    email = email.lower().strip()
    existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
    if existing:
        return existing["id"]
    row = await conn.fetchrow(
        """INSERT INTO users (email, name, account_type, account_status, account_source)
           VALUES ($1, $2, 'sub', 'lead', 'project_vendor_invite')
           RETURNING id""",
        email, name,
    )
    return row["id"]


async def _send_invite_email(email: str, project_name: str, role: Optional[str], is_reinvite: bool):
    # Lands the vendor on /daily-logs after verifying (rather than the
    # default /auth/verify -> dashboard), so the pending-invite banner
    # they need is right there when they land.
    pool = await get_pool()
    async with pool.acquire() as conn:
        link = await issue_magic_link(conn, email, FRONTEND_URL, path="/daily-logs")
    subject = f"{'Reinvited' if is_reinvite else 'Invited'} to log site work on {project_name}"
    role_line = f" as <strong>{role}</strong>" if role else ""
    await send_email(
        to=email,
        subject=subject,
        html=f"""<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <p>You've been {'re-' if is_reinvite else ''}invited to submit daily site logs
             for <strong>{project_name}</strong> on POMAR{role_line}.</p>
          <a href="{link}" style="display:inline-block;padding:12px 24px;background:#D97706;color:#fff;
             text-decoration:none;border-radius:100px;font-weight:600;">Accept invite</a>
          <p style="color:#666;font-size:13px;">This link expires in 24 hours.</p>
        </div>""",
    )


class InviteVendorRequest(BaseModel):
    userId: int
    email: str
    role: Optional[str] = None


@router.post("/projects/{project_id}/invite")
async def invite_vendor(project_id: int, req: InviteVendorRequest):
    email = req.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "A valid email is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_project_member(conn, project_id, req.userId, roles=("owner",))

        project = await conn.fetchrow("SELECT id, name FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        vendor_user_id = await _find_or_create_lead_account(conn, email, email.split("@")[0])
        if vendor_user_id == req.userId:
            raise HTTPException(400, "You can't invite yourself")

        existing = await conn.fetchrow(
            "SELECT status FROM project_vendor_access WHERE project_id = $1 AND vendor_user_id = $2",
            project_id, vendor_user_id,
        )
        if existing and existing["status"] == "accepted":
            raise HTTPException(409, "This vendor already has access to this project")

        row = await conn.fetchrow(
            """INSERT INTO project_vendor_access (project_id, vendor_user_id, invited_by_user_id, role, status, invited_at)
               VALUES ($1, $2, $3, $4, 'invited', NOW())
               ON CONFLICT (project_id, vendor_user_id) DO UPDATE
                   SET status = 'invited', role = EXCLUDED.role,
                       invited_by_user_id = EXCLUDED.invited_by_user_id,
                       invited_at = NOW(), removed_at = NULL
               RETURNING *""",
            project_id, vendor_user_id, req.userId, req.role,
        )

    await _send_invite_email(email, project["name"], req.role, is_reinvite=bool(existing))

    return {"success": True, "access": dict(row)}


class AcceptVendorRequest(BaseModel):
    userId: int


@router.post("/{access_id}/accept")
async def accept_vendor_invite(access_id: int, req: AcceptVendorRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await conn.fetchrow("SELECT * FROM project_vendor_access WHERE id = $1", access_id)
        if not access:
            raise HTTPException(404, "Invite not found")
        if access["vendor_user_id"] != req.userId:
            raise HTTPException(403, "This invite is not addressed to you")
        if access["status"] != "invited":
            raise HTTPException(400, f"This invite is {access['status']}, not pending")

        async with conn.transaction():
            row = await conn.fetchrow(
                """UPDATE project_vendor_access SET status = 'accepted', accepted_at = NOW()
                   WHERE id = $1 RETURNING *""",
                access_id,
            )
            # Auto-trial on first-ever accept for this user+module. A
            # previously-canceled subscription (e.g. an admin turned off a
            # trial) is reactivated to 'trial' rather than left canceled;
            # an already trial/active row is left untouched.
            await conn.execute(
                """INSERT INTO module_subscriptions (user_id, module, status)
                   VALUES ($1, 'daily_logs', 'trial')
                   ON CONFLICT (user_id, module) DO UPDATE
                       SET status = CASE WHEN module_subscriptions.status = 'canceled'
                                         THEN 'trial' ELSE module_subscriptions.status END,
                           updated_at = NOW()""",
                req.userId,
            )

    return {"success": True, "access": dict(row)}


@router.post("/{access_id}/remove")
async def remove_vendor_access(access_id: int, userId: int):
    """Revokes this one project's access only. module_subscriptions is
    left alone on purpose — it's a per-user, per-module (not per-project)
    row, and the same person may still be an accepted vendor on a
    different GC's project. Existing daily_logs rows are untouched (no
    cascade from project_vendor_access), so the GC keeps the sub's
    history after removal."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await conn.fetchrow("SELECT project_id, status FROM project_vendor_access WHERE id = $1", access_id)
        if not access:
            raise HTTPException(404, "Vendor access record not found")
        await require_project_member(conn, access["project_id"], userId, roles=("owner",))
        if access["status"] == "removed":
            raise HTTPException(400, "This vendor's access is already removed")

        row = await conn.fetchrow(
            "UPDATE project_vendor_access SET status = 'removed', removed_at = NOW() WHERE id = $1 RETURNING *",
            access_id,
        )
    return {"success": True, "access": dict(row)}


class ReinviteRequest(BaseModel):
    userId: int


@router.post("/{access_id}/reinvite")
async def reinvite_vendor(access_id: int, req: ReinviteRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await conn.fetchrow(
            """SELECT pva.*, p.name AS project_name, u.email AS vendor_email
               FROM project_vendor_access pva
               JOIN projects p ON p.id = pva.project_id
               JOIN users u ON u.id = pva.vendor_user_id
               WHERE pva.id = $1""",
            access_id,
        )
        if not access:
            raise HTTPException(404, "Vendor access record not found")
        await require_project_member(conn, access["project_id"], req.userId, roles=("owner",))
        if access["status"] != "removed":
            raise HTTPException(400, "Only a removed vendor can be reinvited")

        row = await conn.fetchrow(
            """UPDATE project_vendor_access
               SET status = 'invited', invited_at = NOW(), invited_by_user_id = $2, removed_at = NULL
               WHERE id = $1 RETURNING *""",
            access_id, req.userId,
        )

    await _send_invite_email(access["vendor_email"], access["project_name"], access["role"], is_reinvite=True)

    return {"success": True, "access": dict(row)}


@router.get("/projects/{project_id}/vendors")
async def get_vendors_for_dashboard(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_project_member(conn, project_id, userId, roles=("owner",))

        rows = await conn.fetch(
            """SELECT pva.id AS access_id, pva.vendor_user_id, u.name AS vendor_name, u.email AS vendor_email,
                      pva.role, pva.status, pva.invited_at, pva.accepted_at, pva.removed_at,
                      MAX(dl.log_date) AS last_log_date,
                      COUNT(dl.id) FILTER (WHERE dl.log_date >= CURRENT_DATE - $2::int) AS logs_last_7d
               FROM project_vendor_access pva
               JOIN users u ON u.id = pva.vendor_user_id
               LEFT JOIN daily_logs dl
                      ON dl.project_id = pva.project_id AND dl.logged_by_user_id = pva.vendor_user_id
               WHERE pva.project_id = $1
               GROUP BY pva.id, u.name, u.email
               ORDER BY pva.invited_at DESC""",
            project_id, STALE_DAYS,
        )

    vendors = []
    for r in rows:
        v = dict(r)
        v["is_stale"] = bool(
            v["status"] == "accepted"
            and (v["last_log_date"] is None or v["last_log_date"] < date.today() - timedelta(days=STALE_DAYS))
        )
        vendors.append(v)

    return {"success": True, "vendors": vendors, "stale_days": STALE_DAYS}

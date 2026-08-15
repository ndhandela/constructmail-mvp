"""
POMAR Invoice Tracker — external accountant invites.

Deliberately a separate invite mechanism from routers/team.py's GC Owner ->
team-member flow (which grants broad, all-module access meant for the
company's own staff) and from routers/project_vendor_access.py's vendor
flow (project-scoped). An accountant invite is company-scoped and grants
read-only access to Invoice Tracker only, across every project in that
company — see services/invoice_helpers.py for the access-check side and
company_accountant_access's table comment in db.py for the schema.

A GC owner triggers this in-app (invite_accountant below); POMAR staff can
also trigger the identical grant from the admin portal
(routers/admin.py's invite_accountant_admin) — both funnel through
services/invoice_helpers.upsert_accountant_invite so the resulting row is
indistinguishable except for which of invited_by_user_id/invited_by_admin_id
is set.
"""
import os
from typing import Optional

import bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.access_control import require_feature_flag
from services.email_service import send_email
from services.invoice_helpers import find_or_create_accountant_lead_account, upsert_accountant_invite
from services.magic_link import issue_magic_link

router = APIRouter(prefix="/api/invoice-accountants", tags=["Invoice Tracker"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")


async def _require_company_owner(conn, user_id: int, company_id: int):
    user = await conn.fetchrow("SELECT company_id, permission_level FROM users WHERE id = $1", user_id)
    if not user or user["company_id"] != company_id:
        raise HTTPException(403, "You do not have access to this company")
    if user["permission_level"] != "owner":
        raise HTTPException(403, "Only the company owner can manage accountant access")


async def _send_invite_email(email: str, company_name: str, is_reinvite: bool):
    # Lands the accountant on /accountant after verifying (a standalone
    # route with no sidebar/nav chrome — see App.js) rather than the
    # default /auth/verify -> dashboard, since an accountant never reaches
    # the dashboard at all.
    pool = await get_pool()
    async with pool.acquire() as conn:
        link = await issue_magic_link(conn, email, FRONTEND_URL, path="/accountant")
    subject = f"{'Reinvited' if is_reinvite else 'Invited'} to view invoices for {company_name} on POMAR"
    await send_email(
        to=email,
        subject=subject,
        html=f"""<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <p>You've been {'re-' if is_reinvite else ''}invited to view and download invoices
             for <strong>{company_name}</strong> on POMAR Invoice Tracker.</p>
          <a href="{link}" style="display:inline-block;padding:12px 24px;background:#D97706;color:#fff;
             text-decoration:none;border-radius:100px;font-weight:600;">Accept invite</a>
          <p style="color:#666;font-size:13px;">This link expires in 24 hours.</p>
        </div>""",
    )


class InviteAccountantRequest(BaseModel):
    userId: int
    email: str
    name: Optional[str] = None
    # Which projects this accountant can see invoices for — mirrors
    # routers/team.py's InviteTeammateRequest.projectIds. Unlike that
    # flow, an accountant grant with an empty list is a valid, deliberate
    # "no project access yet" state (fail-closed default), not just "no
    # projects to grant" — see accountant_project_access's table comment.
    projectIds: list[int] = []


async def _set_accountant_project_access(conn, company_accountant_access_id: int, company_id: int, project_ids: list[int]):
    """Replaces the full set of granted projects for one accountant grant
    — shared by invite (fresh or re-invite) and the standalone edit
    endpoint below, mirroring routers/team.py's update_member_projects
    replace-in-place semantics."""
    valid_rows = await conn.fetch(
        "SELECT id FROM projects WHERE company_id = $1 AND id = ANY($2::int[])",
        company_id, project_ids,
    )
    valid_ids = [r["id"] for r in valid_rows]
    await conn.execute(
        "DELETE FROM accountant_project_access WHERE company_accountant_access_id = $1",
        company_accountant_access_id,
    )
    for pid in valid_ids:
        await conn.execute(
            """INSERT INTO accountant_project_access (company_accountant_access_id, project_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING""",
            company_accountant_access_id, pid,
        )


@router.post("/companies/{company_id}/invite")
async def invite_accountant(company_id: int, req: InviteAccountantRequest):
    email = req.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "A valid email is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await _require_company_owner(conn, req.userId, company_id)
        await require_feature_flag(conn, req.userId, "invoice_tracker")

        company = await conn.fetchrow("SELECT id, name FROM companies WHERE id = $1", company_id)
        if not company:
            raise HTTPException(404, "Company not found")

        accountant_user_id = await find_or_create_accountant_lead_account(
            conn, email, req.name or email.split("@")[0],
        )
        if accountant_user_id == req.userId:
            raise HTTPException(400, "You can't invite yourself")

        existing = await conn.fetchrow(
            "SELECT status FROM company_accountant_access WHERE company_id = $1 AND accountant_user_id = $2",
            company_id, accountant_user_id,
        )
        if existing and existing["status"] == "accepted":
            raise HTTPException(409, "This accountant already has access to this company")

        async with conn.transaction():
            row = await upsert_accountant_invite(
                conn, company_id, accountant_user_id, invited_by_user_id=req.userId,
            )
            await _set_accountant_project_access(conn, row["id"], company_id, req.projectIds)

    await _send_invite_email(email, company["name"], is_reinvite=bool(existing))
    return {"success": True, "access": dict(row)}


class AcceptAccountantInviteRequest(BaseModel):
    userId: int
    password: Optional[str] = None


@router.post("/{access_id}/accept")
async def accept_accountant_invite(access_id: int, req: AcceptAccountantInviteRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await conn.fetchrow("SELECT * FROM company_accountant_access WHERE id = $1", access_id)
        if not access:
            raise HTTPException(404, "Invite not found")
        if access["accountant_user_id"] != req.userId:
            raise HTTPException(403, "This invite is not addressed to you")
        if access["status"] != "invited":
            raise HTTPException(400, f"This invite is {access['status']}, not pending")

        # Same first-accept password-setup rule as
        # routers/project_vendor_access.py's accept_vendor_invite — the
        # lead account created by the invite has no password yet, and a
        # follow-up email isn't reliably testable in local dev.
        user = await conn.fetchrow("SELECT password_hash FROM users WHERE id = $1", req.userId)
        needs_password = user and not user["password_hash"]
        if needs_password:
            if not req.password or len(req.password) < 8:
                raise HTTPException(400, "Set a password (at least 8 characters) to accept this invite.")

        async with conn.transaction():
            if needs_password:
                password_hash = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt(12)).decode()
                await conn.execute(
                    "UPDATE users SET password_hash = $1 WHERE id = $2", password_hash, req.userId,
                )
            row = await conn.fetchrow(
                """UPDATE company_accountant_access SET status = 'accepted', accepted_at = NOW()
                   WHERE id = $1 RETURNING *""",
                access_id,
            )

    return {"success": True, "access": dict(row)}


@router.post("/{access_id}/remove")
async def remove_accountant_access(access_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await conn.fetchrow("SELECT company_id, status FROM company_accountant_access WHERE id = $1", access_id)
        if not access:
            raise HTTPException(404, "Accountant access record not found")
        await _require_company_owner(conn, userId, access["company_id"])
        if access["status"] == "removed":
            raise HTTPException(400, "This accountant's access is already removed")

        row = await conn.fetchrow(
            "UPDATE company_accountant_access SET status = 'removed', removed_at = NOW() WHERE id = $1 RETURNING *",
            access_id,
        )
    return {"success": True, "access": dict(row)}


@router.get("/mine")
async def list_my_accountant_access(userId: int):
    """What the standalone accountant view (frontend AccountantInvoiceView)
    falls back to once an invite has already been accepted — /api/auth/me
    only surfaces *pending* invites (see routers/auth.py's get_me), so a
    returning accountant on a later login needs this to know which
    company(ies) they can see."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT caa.company_id, c.name AS company_name
               FROM company_accountant_access caa
               JOIN companies c ON c.id = caa.company_id
               WHERE caa.accountant_user_id = $1 AND caa.status = 'accepted'
               ORDER BY caa.accepted_at DESC""",
            userId,
        )
    return {"success": True, "companies": [dict(r) for r in rows]}


@router.get("/companies/{company_id}")
async def list_company_accountants(company_id: int, userId: int):
    """project_names closes the original visibility gap this feature was
    built for — the owner-facing accountant list in Company Settings can
    now show "which invoices (by project) is this accountant seeing"
    without a separate view."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _require_company_owner(conn, userId, company_id)
        rows = await conn.fetch(
            """SELECT caa.id AS access_id, caa.accountant_user_id, u.name AS accountant_name,
                      u.email AS accountant_email, caa.status, caa.invited_at, caa.accepted_at, caa.removed_at,
                      COALESCE(
                          (SELECT array_agg(p.name ORDER BY p.name)
                           FROM accountant_project_access apa
                           JOIN projects p ON p.id = apa.project_id
                           WHERE apa.company_accountant_access_id = caa.id),
                          ARRAY[]::text[]
                      ) AS project_names
               FROM company_accountant_access caa
               JOIN users u ON u.id = caa.accountant_user_id
               WHERE caa.company_id = $1
               ORDER BY caa.invited_at DESC""",
            company_id,
        )
    return {"success": True, "accountants": [dict(r) for r in rows]}


@router.get("/{access_id}/projects")
async def get_accountant_projects(access_id: int, requesterId: int):
    """Mirrors routers/team.py's get_member_projects — lets the owner see
    and edit an existing accountant grant's project scope after the fact,
    not just at invite time."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await conn.fetchrow(
            "SELECT company_id FROM company_accountant_access WHERE id = $1", access_id,
        )
        if not access:
            raise HTTPException(404, "Accountant access record not found")
        await _require_company_owner(conn, requesterId, access["company_id"])

        rows = await conn.fetch(
            """SELECT p.id, p.name, (apa.project_id IS NOT NULL) AS has_access
               FROM projects p
               LEFT JOIN accountant_project_access apa
                   ON apa.project_id = p.id AND apa.company_accountant_access_id = $1
               WHERE p.company_id = $2 ORDER BY p.created_at""",
            access_id, access["company_id"],
        )
    return {"success": True, "projects": [dict(r) for r in rows]}


class UpdateAccountantProjectsRequest(BaseModel):
    requesterId: int
    projectIds: list[int]


@router.put("/{access_id}/projects")
async def update_accountant_projects(access_id: int, req: UpdateAccountantProjectsRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await conn.fetchrow(
            "SELECT company_id FROM company_accountant_access WHERE id = $1", access_id,
        )
        if not access:
            raise HTTPException(404, "Accountant access record not found")
        await _require_company_owner(conn, req.requesterId, access["company_id"])

        async with conn.transaction():
            await _set_accountant_project_access(conn, access_id, access["company_id"], req.projectIds)
    return {"success": True}

"""
Access model + status computation for POMAR Permit Tracker (routers/permits.py).

Mirrors services/document_helpers.py exactly: "GC on this project" is never a
stored role — it's resolved on every request by comparing the caller's
company_id against projects.company_id (the project's owning company).
Nothing here is ever cached or stored globally; require_project_permit_access
is called fresh per request.

Unlike Documents, a Sub has NO default visibility into a project's permits at
all (not even ones its own company created — GC/Sub creation is GC-only to
begin with). A Sub only sees a permit once explicitly granted view-only
access via permit_access_grants, mirroring document_access_grants exactly
(same schema shape, just pointed at permit_id).

Status (Active / Expiring Soon / Expired) is always computed at read time
via compute_permit_status — never stored, never trusted from the client.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException

from services.access_control import require_feature_flag


class PermitAccess:
    __slots__ = ("kind", "company_id")

    def __init__(self, kind: str, company_id: int):
        self.kind = kind  # "gc" | "sub"
        self.company_id = company_id

    @property
    def is_gc(self) -> bool:
        return self.kind == "gc"


def require_gc(access: "PermitAccess", action: str = "do this") -> None:
    """Small shared gate for the GC-only actions (create/edit/delete a
    permit, manage project_permit_type_settings/default_expiring_soon_days,
    grant/revoke Sub access) — access.kind is already resolved per-request
    by require_project_permit_access, this just asserts it."""
    if not access.is_gc:
        raise HTTPException(403, f"Only the project's GC can {action}")


async def require_project_permit_access(conn, user_id: int, project_id: int) -> PermitAccess:
    project = await conn.fetchrow("SELECT id, company_id FROM projects WHERE id = $1", project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    user = await conn.fetchrow("SELECT company_id FROM users WHERE id = $1", user_id)
    if not user or not user["company_id"]:
        raise HTTPException(403, "Your account isn't linked to a company")

    if user["company_id"] == project["company_id"]:
        await require_feature_flag(conn, user_id, "permits")
        return PermitAccess("gc", user["company_id"])

    member = await conn.fetchrow(
        "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if member:
        await require_feature_flag(conn, user_id, "permits")
        return PermitAccess("sub", user["company_id"])

    vendor = await conn.fetchrow(
        """SELECT 1 FROM project_vendor_access
           WHERE project_id = $1 AND vendor_user_id = $2 AND status = 'accepted'""",
        project_id, user_id,
    )
    if vendor:
        return PermitAccess("sub", user["company_id"])

    raise HTTPException(403, "You do not have access to this project")


async def list_sub_companies_for_project(conn, project_id: int, owner_company_id: int):
    """Candidate companies for the grant-access picker — identical query to
    document_helpers.list_sub_companies_for_project, duplicated rather than
    imported cross-module since the two access models are independent (a
    company with project access has no automatic permit visibility)."""
    rows = await conn.fetch(
        """SELECT DISTINCT c.id, c.name FROM companies c
           WHERE c.id != $2 AND (
             EXISTS (
               SELECT 1 FROM project_members pm JOIN users u ON u.id = pm.user_id
               WHERE pm.project_id = $1 AND u.company_id = c.id
             )
             OR EXISTS (
               SELECT 1 FROM project_vendor_access pva JOIN users u ON u.id = pva.vendor_user_id
               WHERE pva.project_id = $1 AND pva.status = 'accepted' AND u.company_id = c.id
             )
           )
           ORDER BY c.name""",
        project_id, owner_company_id,
    )
    return [dict(r) for r in rows]


async def get_expiring_soon_days(conn, project_id: int, permit_type: str) -> int:
    """Per (project_id, permit_type) override, falling back to the project's
    default_expiring_soon_days when no override row exists — the single
    lookup every status computation goes through."""
    override = await conn.fetchval(
        "SELECT expiring_soon_days FROM project_permit_type_settings WHERE project_id = $1 AND permit_type = $2",
        project_id, permit_type,
    )
    if override is not None:
        return override
    default = await conn.fetchval(
        "SELECT default_expiring_soon_days FROM projects WHERE id = $1", project_id,
    )
    return default if default is not None else 30


def compute_permit_status(expiration_date: date, expiring_soon_days: int, today: Optional[date] = None) -> str:
    """The single reusable status function — expiring_soon_days is always
    passed in as a parameter (from get_expiring_soon_days), never hardcoded
    here. today defaults to date.today() but is accepted as a parameter so
    callers computing status for many permits in a loop can pin one 'today'
    for the whole batch rather than re-evaluating it per row."""
    today = today or date.today()
    if expiration_date < today:
        return "expired"
    if expiration_date <= today + timedelta(days=expiring_soon_days):
        return "expiring_soon"
    return "active"


async def require_permit_access_grant(conn, permit_id: int, company_id: int) -> None:
    granted = await conn.fetchrow(
        """SELECT 1 FROM permit_access_grants
           WHERE permit_id = $1 AND granted_to_company_id = $2 AND revoked_at IS NULL""",
        permit_id, company_id,
    )
    if not granted:
        raise HTTPException(403, "You do not have access to this permit")

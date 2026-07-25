"""
Access model for cross-company "vendor" (sub) module grants — a second,
independent path alongside project_members/feature_flags. See
routers/project_vendor_access.py's module docstring for the full
rationale.

A caller reaches a gated route in exactly one of two ways:
  1. "member" path — the existing pattern every other module uses: a
     project_members row for this project, plus the company-wide
     feature_flags gate (services/access_control.require_feature_flag).
  2. "vendor" path — an ACCEPTED project_vendor_access row for this exact
     (project_id, user_id), plus a 'trial' or 'active' module_subscriptions
     row for (user_id, module). No feature_flags/company_id involvement —
     this is an individual grant, not a company license, and works even
     for lead-status accounts that require_feature_flag would otherwise
     hard-block.
"""
from fastapi import HTTPException

from services.access_control import require_feature_flag

# Modules that can be reached via the vendor-access path at all. Kept as an
# explicit allowlist (rather than accepting any module string) so a future
# module doesn't become vendor-accessible just because someone reuses this
# helper against it without deciding that on purpose.
VENDOR_ACCESSIBLE_MODULES = ("daily_logs",)


class ModuleAccess:
    __slots__ = ("kind", "role")

    def __init__(self, kind: str, role: str | None):
        self.kind = kind      # "member" | "vendor"
        self.role = role      # project_members.role, or project_vendor_access.role (trade)

    @property
    def is_vendor(self) -> bool:
        return self.kind == "vendor"


async def require_module_access(conn, user_id: int, project_id: int, module: str) -> ModuleAccess:
    member_role = await conn.fetchval(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if member_role is not None:
        await require_feature_flag(conn, user_id, module)
        return ModuleAccess("member", member_role)

    if module not in VENDOR_ACCESSIBLE_MODULES:
        raise HTTPException(403, "You do not have access to this project")

    vendor_row = await conn.fetchrow(
        """SELECT role FROM project_vendor_access
           WHERE project_id = $1 AND vendor_user_id = $2 AND status = 'accepted'""",
        project_id, user_id,
    )
    if not vendor_row:
        raise HTTPException(403, "You do not have access to this project")

    sub = await conn.fetchrow(
        "SELECT status FROM module_subscriptions WHERE user_id = $1 AND module = $2",
        user_id, module,
    )
    if not sub or sub["status"] not in ("trial", "active"):
        raise HTTPException(403, f"Your access to {module} is not active")

    return ModuleAccess("vendor", vendor_row["role"])

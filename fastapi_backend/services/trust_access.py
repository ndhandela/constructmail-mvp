from fastapi import HTTPException

from services.access_control import require_feature_flag

TRUST_ROLES = ("owner", "site_data", "compliance_reviewer")


async def require_trust_module(conn, user_id: int) -> dict:
    """Fail closed for POMAR Trust: 403 unless the user's company is India-region
    AND has the 'trust' feature flag enabled. A flat 403 either way — never
    distinguishes "wrong region" from "not enabled" in the response, so nothing
    about module existence leaks to a US org probing the API."""
    row = await conn.fetchrow(
        """SELECT u.company_id, c.region FROM users u
           JOIN companies c ON c.id = u.company_id WHERE u.id = $1""",
        user_id,
    )
    if row is None or row["region"] != "IN":
        raise HTTPException(403, "POMAR Trust isn't available for your account.")
    await require_feature_flag(conn, user_id, "trust")
    return {"user_id": user_id, "company_id": row["company_id"]}


async def require_trust_role(conn, user_id: int, allowed: tuple) -> dict:
    """require_trust_module plus a role check. Company owners always resolve to
    the 'owner' role regardless of the trust_role column, matching the "GC Owner:
    full access" requirement without needing that column kept in sync for owners."""
    ctx = await require_trust_module(conn, user_id)
    user = await conn.fetchrow(
        "SELECT permission_level, trust_role FROM users WHERE id = $1", user_id
    )
    effective_role = "owner" if user["permission_level"] == "owner" else user["trust_role"]
    if effective_role is None or effective_role not in allowed:
        raise HTTPException(403, "Your role doesn't have access to this action.")
    ctx["effective_role"] = effective_role
    return ctx


async def require_trust_project(conn, user_id: int, project_id: int, allowed: tuple) -> dict:
    """require_trust_role plus ownership: the project must belong to the caller's
    company. Mirrors the company_id match checks in routers/team.py and
    routers/vendors.py rather than trusting a bare project_id from the client."""
    ctx = await require_trust_role(conn, user_id, allowed)
    project = await conn.fetchrow(
        "SELECT * FROM trust_projects WHERE id = $1 AND company_id = $2",
        project_id, ctx["company_id"],
    )
    if not project:
        raise HTTPException(404, "Project not found")
    ctx["project"] = dict(project)
    return ctx

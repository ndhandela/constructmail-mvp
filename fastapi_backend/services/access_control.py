import json
from fastapi import HTTPException


async def require_module_access(conn, user_id: int, module: str):
    """Raise 403 if the user's company doesn't have this module enabled.
    Users with no company_id (legacy accounts predating the company
    model) are allowed through — this isn't a 'forgot to configure' case,
    it's a different account type."""
    row = await conn.fetchrow(
        """SELECT c.active_modules FROM users u
           JOIN companies c ON c.id = u.company_id
           WHERE u.id = $1""",
        user_id,
    )
    if row is None:
        return
    active_modules = row["active_modules"]
    if isinstance(active_modules, str):
        active_modules = json.loads(active_modules)
    if not (active_modules or {}).get(module, False):
        raise HTTPException(403, f"Your company doesn't have {module} enabled. Contact your account owner.")


async def require_feature_flag(conn, user_id: int, feature_key: str):
    """Fail closed: raise 403 unless an explicit enabled=true row exists
    (company-specific takes precedence over global). No row at all =
    blocked, not allowed — this is intentional, so nothing is silently
    open just because it was never configured."""
    row = await conn.fetchrow(
        """SELECT c.id AS company_id FROM users u
           JOIN companies c ON c.id = u.company_id WHERE u.id = $1""",
        user_id,
    )
    if row is None:
        return  # legacy no-company account, same exception as above
    company_id = row["company_id"]

    flag = await conn.fetchrow(
        "SELECT is_enabled FROM feature_flags WHERE company_id = $1 AND feature_key = $2",
        company_id, feature_key,
    )
    if flag is None:
        flag = await conn.fetchrow(
            "SELECT is_enabled FROM feature_flags WHERE is_global = true AND feature_key = $1",
            feature_key,
        )
    if flag is None or not flag["is_enabled"]:
        raise HTTPException(403, f"The {feature_key} feature isn't enabled for your account.")

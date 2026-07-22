from fastapi import HTTPException

MODULE_KEYS = ("mail", "clash", "vendors", "marketplace", "trust", "capital")


async def require_feature_flag(conn, user_id: int, feature_key: str):
    """Fail closed: raise 403 unless an explicit enabled=true row exists
    (company-specific takes precedence over global). No row at all =
    blocked, not allowed — this is intentional, so nothing is silently
    open just because it was never configured.

    Also the single source of truth for module access (mail/clash/vendors/
    marketplace) — those are just feature_key values like any other flag,
    there's no separate module-level check anymore."""
    row = await conn.fetchrow(
        """SELECT c.id AS company_id FROM users u
           JOIN companies c ON c.id = u.company_id WHERE u.id = $1""",
        user_id,
    )
    if row is None:
        return  # legacy no-company account, allowed through — a different
        # account type, not a "forgot to configure" case
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


async def get_active_modules(conn, company_id) -> dict:
    """Non-raising counterpart to require_feature_flag for the 4 module
    keys, used to render UI lock/unlock state (e.g. ModuleLockedNotice).
    require_feature_flag is what actually enforces access; this just
    mirrors its same company-specific-then-global-then-false precedence.
    No company (legacy account) returns {} — matches the frontend's
    isModuleLocked treating an empty object as "not locked"."""
    if company_id is None:
        return {}
    result = {}
    for key in MODULE_KEYS:
        row = await conn.fetchrow(
            "SELECT is_enabled FROM feature_flags WHERE company_id = $1 AND feature_key = $2",
            company_id, key,
        )
        if row is None:
            row = await conn.fetchrow(
                "SELECT is_enabled FROM feature_flags WHERE is_global = true AND feature_key = $1",
                key,
            )
        result[key] = bool(row["is_enabled"]) if row else False
    return result

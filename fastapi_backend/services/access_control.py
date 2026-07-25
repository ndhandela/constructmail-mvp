from fastapi import HTTPException

MODULE_KEYS = ("mail", "clash", "vendors", "marketplace", "trust", "capital", "daily_logs", "invoice_tracker")


async def require_feature_flag(conn, user_id: int, feature_key: str):
    """Fail closed: raise 403 unless an explicit enabled=true row exists
    (company-specific takes precedence over global). No row at all =
    blocked, not allowed — this is intentional, so nothing is silently
    open just because it was never configured.

    Also the single source of truth for module access (mail/clash/vendors/
    marketplace) — those are just feature_key values like any other flag,
    there's no separate module-level check anymore."""
    account = await conn.fetchrow(
        "SELECT account_status, restricted_module FROM users WHERE id = $1", user_id,
    )
    if account and account["account_status"] == "lead":
        # Lead accounts (marketplace gc-signup/claim-listing, and accountant
        # invites — see routers/invoice_accountant_access.py) have no
        # company_id, which would otherwise hit the "legacy no-company
        # account, allowed through" bypass below and get full module access
        # for free. They get their own narrow set of routes instead
        # (routers/marketplace.py, services/invoice_helpers.py), never
        # anything gated by this function.
        raise HTTPException(403, "Lead accounts don't have module access.")
    if account and account["restricted_module"] and account["restricted_module"] != feature_key:
        # A team member scoped to one module (routers/team.py's
        # restrictedModule) — everything else 403s regardless of what the
        # company's own feature_flags allow, same "fail closed" spirit as
        # the lead-account check above.
        raise HTTPException(403, f"Your account only has access to {account['restricted_module']}.")

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


async def get_active_modules(conn, company_id, user_id=None) -> dict:
    """Non-raising counterpart to require_feature_flag for the module keys,
    used to render UI lock/unlock state (e.g. ModuleLockedNotice, Sidebar).
    require_feature_flag is what actually enforces access; this just
    mirrors its same company-specific-then-global-then-false precedence,
    plus the same restricted_module narrowing so a scoped team member's
    sidebar doesn't show modules they'd 403 on. No company (legacy
    account) returns {} — matches the frontend's isModuleLocked treating
    an empty object as "not locked"."""
    if company_id is None:
        return {}
    restricted_module = None
    if user_id is not None:
        restricted_module = await conn.fetchval(
            "SELECT restricted_module FROM users WHERE id = $1", user_id,
        )
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
        enabled = bool(row["is_enabled"]) if row else False
        if restricted_module and key != restricted_module:
            enabled = False
        result[key] = enabled
    return result

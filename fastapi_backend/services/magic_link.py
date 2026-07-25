import secrets

FRONTEND_URL_DEFAULT = "https://pomar.ai"


async def issue_magic_link(conn, email: str, origin: str, path: str = "/auth/verify") -> str:
    """Token-generation half of routers/auth.py's send_magic_link, factored
    out so callers who need to email the link themselves (marketplace
    gc-signup/claim-listing — the recipient isn't sitting in an
    authenticated frontend session to click a link shown in-page, unlike
    today's send_magic_link flow) can reuse the exact same sessions-table
    logic instead of duplicating it. send_magic_link's own behavior is
    unchanged by this extraction.

    `path` lets a caller land the verified user somewhere other than the
    default post-verify route (e.g. routers/project_vendor_access.py sends
    subs to /daily-logs so their pending-invite banner is right there) —
    every existing caller omits it and keeps today's behavior."""
    magic_token = secrets.token_hex(32)
    await conn.execute(
        "INSERT INTO sessions (email, magic_token) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET magic_token = $2, expires_at = NOW() + INTERVAL '24 hours'",
        email, magic_token,
    )
    return f"{origin}{path}?token={magic_token}"

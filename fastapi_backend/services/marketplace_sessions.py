import secrets
from fastapi import Header, HTTPException
from db import get_pool

SESSION_TTL_SQL = "NOW() + INTERVAL '30 days'"


async def issue_session_token(conn, user_id: int) -> str:
    """Bearer token for the public-facing marketplace routes only (GET
    .../full, POST .../dispute) — see migration 026 in db.py for why these
    two routes need real proof of identity instead of this app's usual
    client-supplied userId param."""
    token = secrets.token_hex(32)
    await conn.execute(
        f"INSERT INTO marketplace_session_tokens (token, user_id, expires_at) VALUES ($1, $2, {SESSION_TTL_SQL})",
        token, user_id,
    )
    return token


async def require_session_user(authorization: str = Header(None)) -> int:
    """FastAPI dependency: resolves an `Authorization: Bearer <token>` header
    to a user_id via marketplace_session_tokens, or raises 401. Scoped to the
    new marketplace routes — every other route in this app keeps the
    existing bare-userId-param convention untouched."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = authorization[len("Bearer "):]
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id FROM marketplace_session_tokens WHERE token = $1 AND expires_at > NOW()",
            token,
        )
    if not row:
        raise HTTPException(401, "Invalid or expired session")
    return row["user_id"]

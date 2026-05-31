from datetime import datetime
from fastapi import APIRouter, HTTPException
from db import get_pool
from services.outlook_helpers import get_outlook_emails, get_outlook_thread, refresh_access_token

router = APIRouter(prefix="/api/outlook", tags=["Outlook"])


async def _get_valid_token(conn, user_id: int) -> str:
    user = await conn.fetchrow(
        "SELECT outlook_access_token, outlook_refresh_token, outlook_token_expires FROM users WHERE id = $1", user_id
    )
    if not user or not user["outlook_access_token"]:
        raise HTTPException(401, "Outlook not connected")
    access_token = user["outlook_access_token"]
    if user["outlook_token_expires"] and user["outlook_token_expires"] < datetime.utcnow():
        new_tokens = await refresh_access_token(user["outlook_refresh_token"])
        access_token = new_tokens["access_token"]
        await conn.execute(
            "UPDATE users SET outlook_access_token=$1, outlook_refresh_token=$2, outlook_token_expires=$3 WHERE id=$4",
            new_tokens["access_token"], new_tokens.get("refresh_token"), new_tokens.get("expires_at"), user_id,
        )
    return access_token


@router.get("/emails")
async def outlook_emails(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access_token = await _get_valid_token(conn, userId)
    return await get_outlook_emails(access_token, 15)


@router.get("/thread/{conversation_id}")
async def outlook_thread(conversation_id: str, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access_token = await _get_valid_token(conn, userId)
    return await get_outlook_thread(access_token, conversation_id)

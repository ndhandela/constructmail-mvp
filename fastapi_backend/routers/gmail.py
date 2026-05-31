from fastapi import APIRouter, HTTPException
from db import get_pool
from services.gmail_helpers import get_gmail_emails, get_gmail_thread

router = APIRouter(prefix="/api/gmail", tags=["Gmail"])


@router.get("/emails")
async def gmail_emails(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT gmail_access_token FROM users WHERE id = $1", userId)
    if not user or not user["gmail_access_token"]:
        raise HTTPException(401, "Gmail not connected")
    return await get_gmail_emails(user["gmail_access_token"], 15)


@router.get("/thread/{thread_id}")
async def gmail_thread(thread_id: str, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT gmail_access_token FROM users WHERE id = $1", userId)
    if not user or not user["gmail_access_token"]:
        raise HTTPException(401, "Gmail not connected")
    return await get_gmail_thread(user["gmail_access_token"], thread_id)

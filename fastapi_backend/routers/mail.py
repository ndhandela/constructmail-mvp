"""
POMAR Mail — reply endpoints (Gmail + Outlook)

Draft-then-review-then-send workflow: draft_replies rows are created by the AI
analysis pipeline (see routers/ai.py) with status='pending_review'. Nothing here
ever sends automatically — every send is a user-triggered POST from the Action
Queue review card.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.gmail_helpers import get_gmail_message_meta, refresh_gmail_token, send_gmail_reply
from services.outlook_helpers import get_outlook_message_meta, refresh_access_token as refresh_outlook_token, send_outlook_reply

router = APIRouter(prefix="/api/mail", tags=["Mail Reply"])


# ── Token helpers ─────────────────────────────────────────────────────────────

async def _get_valid_gmail_token(conn, user_id: int) -> str:
    user = await conn.fetchrow(
        "SELECT gmail_access_token, gmail_refresh_token FROM users WHERE id = $1", user_id
    )
    if not user or not user["gmail_access_token"]:
        raise HTTPException(401, "Gmail not connected")
    if not user["gmail_refresh_token"]:
        return user["gmail_access_token"]
    refreshed = await refresh_gmail_token(user["gmail_refresh_token"])
    access_token = refreshed["access_token"]
    await conn.execute("UPDATE users SET gmail_access_token=$1 WHERE id=$2", access_token, user_id)
    return access_token


async def _get_valid_outlook_token(conn, user_id: int) -> str:
    user = await conn.fetchrow(
        "SELECT outlook_access_token, outlook_refresh_token, outlook_token_expires FROM users WHERE id = $1",
        user_id,
    )
    if not user or not user["outlook_access_token"]:
        raise HTTPException(401, "Outlook not connected")
    access_token = user["outlook_access_token"]
    if user["outlook_token_expires"] and user["outlook_token_expires"] < datetime.utcnow():
        new_tokens = await refresh_outlook_token(user["outlook_refresh_token"])
        access_token = new_tokens["access_token"]
        await conn.execute(
            "UPDATE users SET outlook_access_token=$1, outlook_refresh_token=$2, outlook_token_expires=$3 WHERE id=$4",
            new_tokens["access_token"], new_tokens.get("refresh_token"), new_tokens.get("expires_at"), user_id,
        )
    return access_token


# ── Request models ────────────────────────────────────────────────────────────

class ReplyRequest(BaseModel):
    draft_reply_id: UUID


class EditDraftRequest(BaseModel):
    edited_body: str


# ── Drafts CRUD (review queue) ────────────────────────────────────────────────

async def _fetch_draft_or_404(conn, draft_id: UUID):
    draft = await conn.fetchrow("SELECT * FROM draft_replies WHERE id = $1", draft_id)
    if not draft:
        raise HTTPException(404, "Draft reply not found")
    return dict(draft)


@router.get("/drafts")
async def list_drafts(userId: int):
    """Pending drafts for the Action Queue review card, enriched with live sender/snippet."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM draft_replies WHERE user_id = $1 AND status = 'pending_review' ORDER BY created_at DESC",
            userId,
        )
        drafts = [dict(r) for r in rows]

        for draft in drafts:
            try:
                if draft["provider"] == "gmail":
                    token = await _get_valid_gmail_token(conn, userId)
                    meta = await get_gmail_message_meta(token, draft["source_email_id"])
                else:
                    token = await _get_valid_outlook_token(conn, userId)
                    meta = await get_outlook_message_meta(token, draft["source_email_id"])
                draft["from"] = meta.get("from")
                draft["to"] = meta.get("to")
                draft["subject"] = meta.get("subject")
                draft["snippet"] = meta.get("snippet")
            except Exception:
                # Provider fetch failed (token revoked, message deleted, etc.) — still
                # show the draft so it isn't silently dropped from the queue.
                draft["from"] = draft["to"] = draft["subject"] = draft["snippet"] = None

    return drafts


@router.patch("/drafts/{draft_id}")
async def update_draft(draft_id: UUID, req: EditDraftRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _fetch_draft_or_404(conn, draft_id)
        row = await conn.fetchrow(
            "UPDATE draft_replies SET edited_body = $1 WHERE id = $2 RETURNING *",
            req.edited_body, draft_id,
        )
    return {"success": True, "draft": dict(row)}


@router.post("/drafts/{draft_id}/discard")
async def discard_draft(draft_id: UUID):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _fetch_draft_or_404(conn, draft_id)
        row = await conn.fetchrow(
            "UPDATE draft_replies SET status = 'discarded' WHERE id = $1 RETURNING *",
            draft_id,
        )
    return {"success": True, "draft": dict(row)}


# ── Send endpoints ────────────────────────────────────────────────────────────

@router.post("/gmail/reply")
async def gmail_reply(req: ReplyRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        draft = await _fetch_draft_or_404(conn, req.draft_reply_id)
        if draft["provider"] != "gmail":
            raise HTTPException(400, "Draft is not a Gmail reply")
        if draft["status"] not in ("pending_review", "approved"):
            raise HTTPException(400, f"Draft already {draft['status']}")

        access_token = await _get_valid_gmail_token(conn, draft["user_id"])
        body = draft["edited_body"] or draft["ai_generated_body"]
        original = await get_gmail_message_meta(access_token, draft["source_email_id"])

        result = await send_gmail_reply(
            access_token,
            thread_id=draft["thread_id"],
            original_message_id=draft["source_email_id"],
            to=original["from"],
            subject=original["subject"],
            body=body,
        )

        await conn.execute(
            "UPDATE draft_replies SET status='sent', sent_at=NOW(), sent_message_id=$1 WHERE id=$2",
            result.get("id"), draft["id"],
        )
    return {"success": True, "sent_message_id": result.get("id")}


@router.post("/outlook/reply")
async def outlook_reply(req: ReplyRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        draft = await _fetch_draft_or_404(conn, req.draft_reply_id)
        if draft["provider"] != "outlook":
            raise HTTPException(400, "Draft is not an Outlook reply")
        if draft["status"] not in ("pending_review", "approved"):
            raise HTTPException(400, f"Draft already {draft['status']}")

        access_token = await _get_valid_outlook_token(conn, draft["user_id"])
        body = draft["edited_body"] or draft["ai_generated_body"]

        result = await send_outlook_reply(access_token, draft["source_email_id"], body)

        await conn.execute(
            "UPDATE draft_replies SET status='sent', sent_at=NOW(), sent_message_id=$1 WHERE id=$2",
            result.get("id"), draft["id"],
        )
    return {"success": True, "sent_message_id": result.get("id")}


# ── Reconnect banner support ──────────────────────────────────────────────────

@router.get("/connection-status")
async def connection_status(userId: int):
    """Tells the frontend whether a connected account still needs to reconnect
    to grant the new gmail.send / Mail.Send scopes."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            """SELECT gmail_access_token, gmail_send_scope_granted,
                      outlook_access_token, outlook_send_scope_granted
               FROM users WHERE id = $1""",
            userId,
        )
    if not user:
        raise HTTPException(404, "User not found")
    return {
        "gmail": {
            "connected": bool(user["gmail_access_token"]),
            "send_enabled": bool(user["gmail_send_scope_granted"]),
        },
        "outlook": {
            "connected": bool(user["outlook_access_token"]),
            "send_enabled": bool(user["outlook_send_scope_granted"]),
        },
    }

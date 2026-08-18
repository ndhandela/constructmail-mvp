"""
Versioned Terms of Service / Privacy Policy consent gate. legal_documents
holds the current active version's content per doc_type; user_consents is
an append-only acceptance log (see services/legal_helpers.py). No admin UI
in this pass — bumping a version is a direct DB update, after which every
user's consent_required flips back to true until they re-accept.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db import get_pool
from services.legal_helpers import DOC_TYPES, get_active_legal_documents, get_client_ip, get_consent_status

router = APIRouter(prefix="/api/legal", tags=["Legal"])


@router.get("/current")
async def current_documents():
    pool = await get_pool()
    async with pool.acquire() as conn:
        active = await get_active_legal_documents(conn)
    missing = [d for d in DOC_TYPES if d not in active]
    if missing:
        raise HTTPException(500, f"No active legal document configured for: {', '.join(missing)}")
    return active


@router.get("/consent-status")
async def consent_status(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await get_consent_status(conn, userId)


class AcceptConsentRequest(BaseModel):
    userId: int
    doc_type: str
    version: str


@router.post("/accept")
async def accept_consent(req: AcceptConsentRequest, request: Request):
    if req.doc_type not in DOC_TYPES:
        raise HTTPException(400, f"doc_type must be one of: {', '.join(DOC_TYPES)}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        active = await conn.fetchrow(
            "SELECT version FROM legal_documents WHERE doc_type = $1 AND is_active = TRUE",
            req.doc_type,
        )
        if not active or active["version"] != req.version:
            raise HTTPException(400, "This version is no longer current. Please refresh and try again.")

        await conn.execute(
            """INSERT INTO user_consents (user_id, doc_type, version, ip_address, user_agent)
               VALUES ($1, $2, $3, $4, $5)""",
            req.userId, req.doc_type, req.version, get_client_ip(request), request.headers.get("user-agent"),
        )

    return {"success": True}

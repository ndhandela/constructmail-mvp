"""
POMAR Trust — upload + parse pipeline.

Synchronous for v1, per spec: the upload request itself runs the parse and
Claude classification before responding. Raw file bytes go to R2
(services/r2_storage.py) and are never written to Postgres or local disk.
"""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from db import get_pool
from services import r2_storage
from services.trust_access import require_trust_project
from services.trust_ai import classify_extractions
from services.trust_parsers import chunk_text, chunk_whatsapp_messages, parse_email_thread, parse_whatsapp_export
from services.user_service import log_trust_activity

router = APIRouter(prefix="/api/trust", tags=["Trust Uploads"])

UPLOAD_ROLES = ("site_data", "compliance_reviewer", "owner")


async def _run_parse_pipeline(conn, upload_id: int, upload_type: str, content: bytes, is_eml: bool):
    """Parses the raw upload into text chunks, classifies each chunk with
    Claude, and stores trust_extractions (+ trust_change_alerts for any
    change_trigger). Returns the extraction count."""
    if upload_type == "whatsapp":
        messages = parse_whatsapp_export(content.decode("utf-8", errors="replace"))
        chunks = chunk_whatsapp_messages(messages)
    else:
        thread_text = parse_email_thread(content, is_eml)
        chunks = chunk_text(thread_text)

    extraction_count = 0
    for chunk in chunks:
        if not chunk.strip():
            continue
        for extraction in await classify_extractions(chunk):
            excerpt = (extraction.get("excerpt") or "")[:500]
            row = await conn.fetchrow(
                """INSERT INTO trust_extractions (upload_id, extraction_type, content_summary, source_excerpt, confidence)
                   VALUES ($1,$2,$3,$4,$5) RETURNING id""",
                upload_id, extraction.get("type"), extraction.get("summary"), excerpt, extraction.get("confidence"),
            )
            extraction_count += 1
            if extraction.get("type") == "change_trigger" and extraction.get("sub_type"):
                await conn.execute(
                    """INSERT INTO trust_change_alerts (project_id, extraction_id, alert_type, severity, description)
                       SELECT tu.project_id, $1, $2, $3, $4 FROM trust_uploads tu WHERE tu.id = $5""",
                    row["id"], extraction["sub_type"], extraction.get("severity") or "low",
                    extraction.get("summary"), upload_id,
                )
    return extraction_count


@router.post("/projects/{project_id}/uploads")
async def create_upload(
    project_id: int,
    userId: int = Form(...),
    upload_type: str = Form(...),
    file: Optional[UploadFile] = File(None),
    pasted_text: Optional[str] = Form(None),
):
    if upload_type not in ("whatsapp", "email"):
        raise HTTPException(400, "upload_type must be 'whatsapp' or 'email'")
    if not file and not pasted_text:
        raise HTTPException(400, "Provide either a file or pasted_text")

    if file:
        content = await file.read()
        filename = file.filename or f"{upload_type}-upload.txt"
        is_eml = filename.lower().endswith(".eml")
    else:
        content = pasted_text.encode("utf-8")
        filename = "pasted-thread.txt"
        is_eml = False

    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_project(conn, userId, project_id, UPLOAD_ROLES)

        upload = await conn.fetchrow(
            """INSERT INTO trust_uploads (project_id, upload_type, storage_path, uploaded_by, parse_status)
               VALUES ($1,$2,'',$3,'pending') RETURNING id""",
            project_id, upload_type, userId,
        )
        upload_id = upload["id"]

        storage_path = await r2_storage.upload_trust_file(ctx["company_id"], project_id, upload_id, filename, content)
        await conn.execute("UPDATE trust_uploads SET storage_path = $1 WHERE id = $2", storage_path, upload_id)

        try:
            extraction_count = await _run_parse_pipeline(conn, upload_id, upload_type, content, is_eml)
            await conn.execute("UPDATE trust_uploads SET parse_status = 'parsed' WHERE id = $1", upload_id)
            parse_status = "parsed"
        except Exception as e:
            logging.exception("Trust upload parse failed for upload_id=%s", upload_id)
            await conn.execute("UPDATE trust_uploads SET parse_status = 'failed' WHERE id = $1", upload_id)
            parse_status = "failed"
            extraction_count = 0

        await log_trust_activity(
            userId, ctx["company_id"], "upload_parsed", "trust_uploads", upload_id,
            {"project_id": project_id, "upload_type": upload_type, "parse_status": parse_status, "extraction_count": extraction_count},
        )

    return {"success": True, "upload_id": upload_id, "parse_status": parse_status, "extraction_count": extraction_count}


@router.get("/projects/{project_id}/uploads")
async def list_uploads(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_trust_project(conn, userId, project_id, UPLOAD_ROLES)
        rows = await conn.fetch(
            "SELECT * FROM trust_uploads WHERE project_id = $1 ORDER BY uploaded_at DESC", project_id,
        )
    return {"success": True, "uploads": [dict(r) for r in rows]}


@router.get("/uploads/{upload_id}/extractions")
async def list_extractions(upload_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        upload = await conn.fetchrow("SELECT project_id FROM trust_uploads WHERE id = $1", upload_id)
        if not upload:
            raise HTTPException(404, "Upload not found")
        await require_trust_project(conn, userId, upload["project_id"], UPLOAD_ROLES)
        rows = await conn.fetch(
            "SELECT * FROM trust_extractions WHERE upload_id = $1 ORDER BY created_at", upload_id,
        )
    return {"success": True, "extractions": [dict(r) for r in rows]}

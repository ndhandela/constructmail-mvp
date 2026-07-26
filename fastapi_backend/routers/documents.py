"""
POMAR Documents — project-scoped file storage (contracts, drawings,
submittals, ...) shared between a GC and its Subs.

Access is enforced entirely through services/document_helpers.py's
require_project_document_access, never inline role checks scattered across
this file — see that module's docstring for the full GC/Sub resolution
rules. category is freeform text (nullable) for v1, no fixed enum.
"""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from db import get_pool
from services import r2_storage
from services.document_helpers import (
    document_response,
    list_sub_companies_for_project,
    require_can_delete_document,
    require_project_document_access,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["Documents"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB — drawings/submittals run larger than invoice PDFs

DOCUMENT_COLUMNS = """d.id, d.company_id, d.project_id, d.filename, d.content_type, d.size_bytes,
                      d.category, d.created_at,
                      d.uploaded_by_user_id, u.name AS uploaded_by_name,
                      d.uploader_company_id, uc.name AS uploader_company_name"""

DOCUMENT_JOINS = """FROM documents d
                     JOIN users u ON u.id = d.uploaded_by_user_id
                     JOIN companies uc ON uc.id = d.uploader_company_id"""


@router.get("")
async def list_documents(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_document_access(conn, userId, project_id)

        if access.is_gc:
            rows = await conn.fetch(
                f"""SELECT {DOCUMENT_COLUMNS} {DOCUMENT_JOINS}
                    WHERE d.project_id = $1 AND d.deleted_at IS NULL
                    ORDER BY d.created_at DESC""",
                project_id,
            )
        else:
            rows = await conn.fetch(
                f"""SELECT {DOCUMENT_COLUMNS} {DOCUMENT_JOINS}
                    WHERE d.project_id = $1 AND d.deleted_at IS NULL
                      AND (d.uploader_company_id = $2
                           OR EXISTS (
                             SELECT 1 FROM document_access_grants g
                             WHERE g.document_id = d.id AND g.granted_to_company_id = $2 AND g.revoked_at IS NULL
                           ))
                    ORDER BY d.created_at DESC""",
                project_id, access.company_id,
            )

        documents = [dict(r) for r in rows]

        sub_companies = []
        if access.is_gc:
            doc_ids = [d["id"] for d in documents]
            grant_rows = await conn.fetch(
                """SELECT g.document_id, g.granted_to_company_id AS company_id, c.name AS company_name
                   FROM document_access_grants g
                   JOIN companies c ON c.id = g.granted_to_company_id
                   WHERE g.document_id = ANY($1::int[]) AND g.revoked_at IS NULL""",
                doc_ids,
            )
            grants_by_doc = {}
            for g in grant_rows:
                grants_by_doc.setdefault(g["document_id"], []).append(
                    {"company_id": g["company_id"], "company_name": g["company_name"]}
                )
            for d in documents:
                d["grants"] = grants_by_doc.get(d["id"], [])

            sub_companies = await list_sub_companies_for_project(conn, project_id, access.company_id)

    return {
        "success": True,
        "documents": documents,
        "access_kind": access.kind,
        "can_write": True,
        "sub_companies": sub_companies,
    }


@router.post("/upload")
async def upload_document(
    userId: int = Form(...),
    project_id: int = Form(...),
    category: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    if not file or not file.filename:
        raise HTTPException(400, "A file is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_document_access(conn, userId, project_id)
        project = await conn.fetchrow("SELECT company_id FROM projects WHERE id = $1", project_id)

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, "File must be smaller than 50MB")

        # Row inserted first (r2_key filled in after upload) so the R2 key
        # can use the real documents.id per the module's key-naming spec —
        # see services/r2_storage.upload_document's docstring. Wrapped in a
        # transaction so a failed upload rolls back the placeholder row.
        async with conn.transaction():
            placeholder = await conn.fetchrow(
                """INSERT INTO documents (company_id, project_id, filename, r2_key, content_type, size_bytes,
                                           uploaded_by_user_id, uploader_company_id, category)
                   VALUES ($1,$2,$3,'',$4,$5,$6,$7,$8)
                   RETURNING id""",
                project["company_id"], project_id, file.filename, file.content_type, len(content),
                userId, access.company_id, (category or "").strip() or None,
            )
            r2_key = await r2_storage.upload_document(
                access.company_id, project_id, placeholder["id"], file.filename, content,
            )
            await conn.execute("UPDATE documents SET r2_key = $1 WHERE id = $2", r2_key, placeholder["id"])

            row = await conn.fetchrow(
                f"""SELECT {DOCUMENT_COLUMNS} {DOCUMENT_JOINS} WHERE d.id = $1""",
                placeholder["id"],
            )

    return {"success": True, "document": document_response(dict(row))}


@router.get("/{document_id}/download")
async def download_document(document_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow(
            "SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL", document_id,
        )
        if not document:
            raise HTTPException(404, "Document not found")

        access = await require_project_document_access(conn, userId, document["project_id"])
        if not access.is_gc and document["uploader_company_id"] != access.company_id:
            granted = await conn.fetchrow(
                """SELECT 1 FROM document_access_grants
                   WHERE document_id = $1 AND granted_to_company_id = $2 AND revoked_at IS NULL""",
                document_id, access.company_id,
            )
            if not granted:
                raise HTTPException(403, "You do not have access to this document")

        url = await r2_storage.get_document_url(document["r2_key"])

    return {"success": True, "url": url, "expires_in": r2_storage.DOCUMENT_URL_EXPIRES_IN}


class GrantAccessRequest(BaseModel):
    userId: int
    granted_to_company_id: int


@router.post("/{document_id}/grant")
async def grant_document_access(document_id: int, req: GrantAccessRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow(
            "SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL", document_id,
        )
        if not document:
            raise HTTPException(404, "Document not found")

        access = await require_project_document_access(conn, req.userId, document["project_id"])
        if not access.is_gc:
            raise HTTPException(403, "Only the project's GC can manage document access")

        candidates = await list_sub_companies_for_project(conn, document["project_id"], access.company_id)
        if not any(c["id"] == req.granted_to_company_id for c in candidates):
            raise HTTPException(400, "That company does not have access to this project")

        row = await conn.fetchrow(
            """INSERT INTO document_access_grants (document_id, granted_to_company_id, granted_by_user_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (document_id, granted_to_company_id) DO UPDATE
                   SET revoked_at = NULL, granted_by_user_id = EXCLUDED.granted_by_user_id
               RETURNING *""",
            document_id, req.granted_to_company_id, req.userId,
        )

    return {"success": True, "grant": dict(row)}


class RevokeAccessRequest(BaseModel):
    userId: int
    granted_to_company_id: int


@router.post("/{document_id}/revoke")
async def revoke_document_access(document_id: int, req: RevokeAccessRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow(
            "SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL", document_id,
        )
        if not document:
            raise HTTPException(404, "Document not found")

        access = await require_project_document_access(conn, req.userId, document["project_id"])
        if not access.is_gc:
            raise HTTPException(403, "Only the project's GC can manage document access")

        row = await conn.fetchrow(
            """UPDATE document_access_grants SET revoked_at = NOW()
               WHERE document_id = $1 AND granted_to_company_id = $2 AND revoked_at IS NULL
               RETURNING *""",
            document_id, req.granted_to_company_id,
        )
        if not row:
            raise HTTPException(404, "No active grant found for that company")

    return {"success": True, "grant": dict(row)}


@router.delete("/{document_id}")
async def delete_document(document_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        document = await conn.fetchrow(
            "SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL", document_id,
        )
        if not document:
            raise HTTPException(404, "Document not found")

        access = await require_project_document_access(conn, userId, document["project_id"])
        await require_can_delete_document(conn, userId, access, document)

        await conn.execute("UPDATE documents SET deleted_at = NOW() WHERE id = $1", document_id)

    return {"success": True}

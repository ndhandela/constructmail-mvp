"""
POMAR Documents — project-scoped file storage (contracts, drawings,
submittals, ...) shared between a GC and its Subs, optionally organized
into single-level folders.

Access is enforced entirely through services/document_helpers.py's
require_project_document_access, never inline role checks scattered across
this file — see that module's docstring for the full GC/Sub resolution
rules. category is freeform text (nullable) for v1, no fixed enum.

Folders never nest (no parent_id) and are GC-only to create/manage. A
document with folder_id set has no per-document access override — its
visibility comes entirely from folder_access, not document_access_grants
(root documents, folder_id NULL, keep the original per-document grant
behavior unchanged).
"""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from db import get_pool
from services import r2_storage
from services.document_helpers import (
    company_has_folder_access,
    document_response,
    list_sub_companies_for_project,
    require_can_delete_document,
    require_can_upload_to_folder,
    require_folder_in_project,
    require_gc,
    require_project_document_access,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["Documents"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB — drawings/submittals run larger than invoice PDFs

DOCUMENT_COLUMNS = """d.id, d.company_id, d.project_id, d.folder_id, d.filename, d.content_type, d.size_bytes,
                      d.category, d.created_at,
                      d.uploaded_by_user_id, u.name AS uploaded_by_name,
                      d.uploader_company_id, uc.name AS uploader_company_name"""

DOCUMENT_JOINS = """FROM documents d
                     JOIN users u ON u.id = d.uploaded_by_user_id
                     JOIN companies uc ON uc.id = d.uploader_company_id"""


@router.get("")
async def list_documents(project_id: int, userId: int, folder_id: Optional[int] = None):
    """folder_id omitted means the project root (folder_id IS NULL) — the
    same documents that would have shown up before folders existed, so the
    root view's behavior is unchanged. Passing a folder_id scopes the list
    to that one folder's contents instead."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_document_access(conn, userId, project_id)

        if folder_id is not None:
            await require_folder_in_project(conn, folder_id, project_id)
            if not access.is_gc and not await company_has_folder_access(conn, folder_id, access.company_id):
                raise HTTPException(403, "You do not have access to this folder")

        if access.is_gc:
            rows = await conn.fetch(
                f"""SELECT {DOCUMENT_COLUMNS} {DOCUMENT_JOINS}
                    WHERE d.project_id = $1 AND d.deleted_at IS NULL
                      AND d.folder_id IS NOT DISTINCT FROM $2
                    ORDER BY d.created_at DESC""",
                project_id, folder_id,
            )
        elif folder_id is not None:
            # Folder access was already confirmed above — folder_access is
            # the sole authority for folder contents, so every document in
            # an accessible folder is visible with no further per-document
            # check (unlike the root branch below).
            rows = await conn.fetch(
                f"""SELECT {DOCUMENT_COLUMNS} {DOCUMENT_JOINS}
                    WHERE d.project_id = $1 AND d.deleted_at IS NULL AND d.folder_id = $2
                    ORDER BY d.created_at DESC""",
                project_id, folder_id,
            )
        else:
            rows = await conn.fetch(
                f"""SELECT {DOCUMENT_COLUMNS} {DOCUMENT_JOINS}
                    WHERE d.project_id = $1 AND d.deleted_at IS NULL AND d.folder_id IS NULL
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
            # Root-level documents only — a folder-scoped document never has
            # document_access_grants rows (grant/revoke on documents reject
            # folder-scoped ones), so there's nothing to look up for those.
            doc_ids = [d["id"] for d in documents if d["folder_id"] is None]
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
    folder_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
):
    if not file or not file.filename:
        raise HTTPException(400, "A file is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_document_access(conn, userId, project_id)
        project = await conn.fetchrow("SELECT company_id FROM projects WHERE id = $1", project_id)

        if folder_id is not None:
            await require_folder_in_project(conn, folder_id, project_id)
            await require_can_upload_to_folder(conn, access, folder_id)

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, "File must be smaller than 50MB")

        # The R2 key (services/r2_storage.upload_document) is derived from
        # project_id/folder_id/filename alone, not the not-yet-known
        # documents.id, so — unlike the old shape this replaced — there's no
        # need to insert a placeholder row before uploading: the key is
        # already fully known up front.
        r2_key = await r2_storage.upload_document(project_id, file.filename, content, folder_id=folder_id)

        row = await conn.fetchrow(
            """INSERT INTO documents (company_id, project_id, folder_id, filename, r2_key, content_type, size_bytes,
                                       uploaded_by_user_id, uploader_company_id, category)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               RETURNING id""",
            project["company_id"], project_id, folder_id, file.filename, r2_key, file.content_type, len(content),
            userId, access.company_id, (category or "").strip() or None,
        )
        row = await conn.fetchrow(
            f"""SELECT {DOCUMENT_COLUMNS} {DOCUMENT_JOINS} WHERE d.id = $1""", row["id"],
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
        if not access.is_gc:
            if document["folder_id"] is not None:
                # Folder-scoped document — folder_access is the sole
                # authority, no document_access_grants fallback (matches
                # the list endpoint's folder branch).
                if not await company_has_folder_access(conn, document["folder_id"], access.company_id):
                    raise HTTPException(403, "You do not have access to this document")
            elif document["uploader_company_id"] != access.company_id:
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
        require_gc(access, "manage document access")
        if document["folder_id"] is not None:
            raise HTTPException(400, "This document's access is controlled by its folder — manage access on the folder instead.")

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
        require_gc(access, "manage document access")
        if document["folder_id"] is not None:
            raise HTTPException(400, "This document's access is controlled by its folder — manage access on the folder instead.")

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


# ── Folders ──────────────────────────────────────────────────────────────
# Single-level only (no parent_id). Nested under /api/documents rather than
# a bare /api/projects/... prefix, same as invoices.py's own project-scoped
# picker endpoints (/api/invoices/projects/{id}/work-items).

class CreateFolderRequest(BaseModel):
    userId: int
    name: str


@router.post("/projects/{project_id}/folders")
async def create_folder(project_id: int, req: CreateFolderRequest):
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(400, "Folder name is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_document_access(conn, req.userId, project_id)
        require_gc(access, "create folders")

        row = await conn.fetchrow(
            "INSERT INTO folders (project_id, name, created_by) VALUES ($1,$2,$3) RETURNING *",
            project_id, name, req.userId,
        )

    return {"success": True, "folder": dict(row)}


@router.get("/projects/{project_id}/folders")
async def list_folders(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_document_access(conn, userId, project_id)

        if access.is_gc:
            rows = await conn.fetch(
                "SELECT * FROM folders WHERE project_id = $1 ORDER BY name", project_id,
            )
        else:
            rows = await conn.fetch(
                """SELECT f.* FROM folders f
                   JOIN folder_access fa ON fa.folder_id = f.id
                   WHERE f.project_id = $1 AND fa.company_id = $2
                   ORDER BY f.name""",
                project_id, access.company_id,
            )

        folders = [dict(r) for r in rows]

        sub_companies = []
        if access.is_gc:
            folder_ids = [f["id"] for f in folders]
            grant_rows = await conn.fetch(
                """SELECT fa.folder_id, fa.company_id, c.name AS company_name
                   FROM folder_access fa JOIN companies c ON c.id = fa.company_id
                   WHERE fa.folder_id = ANY($1::int[])""",
                folder_ids,
            )
            grants_by_folder = {}
            for g in grant_rows:
                grants_by_folder.setdefault(g["folder_id"], []).append(
                    {"company_id": g["company_id"], "company_name": g["company_name"]}
                )
            for f in folders:
                f["granted_companies"] = grants_by_folder.get(f["id"], [])

            sub_companies = await list_sub_companies_for_project(conn, project_id, access.company_id)

    return {
        "success": True,
        "folders": folders,
        "access_kind": access.kind,
        "sub_companies": sub_companies,
    }


class GrantFolderAccessRequest(BaseModel):
    userId: int
    company_id: int


@router.post("/folders/{folder_id}/access")
async def grant_folder_access(folder_id: int, req: GrantFolderAccessRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        folder = await conn.fetchrow("SELECT * FROM folders WHERE id = $1", folder_id)
        if not folder:
            raise HTTPException(404, "Folder not found")

        access = await require_project_document_access(conn, req.userId, folder["project_id"])
        require_gc(access, "manage folder access")

        candidates = await list_sub_companies_for_project(conn, folder["project_id"], access.company_id)
        if not any(c["id"] == req.company_id for c in candidates):
            raise HTTPException(400, "That company does not have access to this project")

        row = await conn.fetchrow(
            """INSERT INTO folder_access (folder_id, company_id, granted_by)
               VALUES ($1, $2, $3)
               ON CONFLICT (folder_id, company_id) DO NOTHING
               RETURNING *""",
            folder_id, req.company_id, req.userId,
        )
        if row is None:
            # Already granted — granting twice is idempotent (no revoked_at
            # to reset here, unlike document grants), just return the
            # existing row.
            row = await conn.fetchrow(
                "SELECT * FROM folder_access WHERE folder_id = $1 AND company_id = $2", folder_id, req.company_id,
            )

    return {"success": True, "access": dict(row)}


@router.delete("/folders/{folder_id}/access/{company_id}")
async def revoke_folder_access(folder_id: int, company_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        folder = await conn.fetchrow("SELECT * FROM folders WHERE id = $1", folder_id)
        if not folder:
            raise HTTPException(404, "Folder not found")

        access = await require_project_document_access(conn, userId, folder["project_id"])
        require_gc(access, "manage folder access")

        result = await conn.execute(
            "DELETE FROM folder_access WHERE folder_id = $1 AND company_id = $2", folder_id, company_id,
        )
        if result == "DELETE 0":
            raise HTTPException(404, "No access grant found for that company")

    return {"success": True}

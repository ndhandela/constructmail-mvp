"""
Access model for POMAR Documents (routers/documents.py).

"GC on this project" is never a stored role — it's resolved on every
request by comparing the caller's company_id against projects.company_id
(the project's owning company). The same company can be the GC-owner on one
project and a Sub on another, so nothing here is ever cached or stored
globally; require_project_document_access is called fresh per request.

Getting onto a project at all (before the GC/Sub split even applies) reuses
the two existing mechanisms other modules already use for cross-company
users, rather than inventing a third:
  1. project_members — the broad mechanism used when a company's own real
     staff (or another real company's staff, invited the normal way) join a
     project. Subject to the normal company-wide 'documents' feature-flag
     gate (services/access_control.py).
  2. project_vendor_access — the same limited-account mechanism Daily Logs
     uses for a lead Sub account (routers/project_vendor_access.py). This
     path deliberately skips require_feature_flag, the same bypass
     services/vendor_access.py's "vendor" path uses — a lead account 403s
     on it unconditionally regardless of feature_key.

Once a company's access `kind` ("gc" | "sub") is known, actual document
visibility is enforced inline in routers/documents.py's list/download
queries per the module spec: a GC sees every document on the project; a
Sub sees only uploader_company_id = its own company_id, plus documents with
an active (revoked_at IS NULL) document_access_grants row for its
company_id.
"""
from typing import Optional

from fastapi import HTTPException

from services.access_control import require_feature_flag


class DocumentAccess:
    __slots__ = ("kind", "company_id")

    def __init__(self, kind: str, company_id: int):
        self.kind = kind  # "gc" | "sub"
        self.company_id = company_id

    @property
    def is_gc(self) -> bool:
        return self.kind == "gc"


async def require_project_document_access(conn, user_id: int, project_id: int) -> DocumentAccess:
    project = await conn.fetchrow("SELECT id, company_id FROM projects WHERE id = $1", project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    user = await conn.fetchrow("SELECT company_id FROM users WHERE id = $1", user_id)
    if not user or not user["company_id"]:
        raise HTTPException(403, "Your account isn't linked to a company")

    if user["company_id"] == project["company_id"]:
        await require_feature_flag(conn, user_id, "documents")
        return DocumentAccess("gc", user["company_id"])

    member = await conn.fetchrow(
        "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if member:
        await require_feature_flag(conn, user_id, "documents")
        return DocumentAccess("sub", user["company_id"])

    vendor = await conn.fetchrow(
        """SELECT 1 FROM project_vendor_access
           WHERE project_id = $1 AND vendor_user_id = $2 AND status = 'accepted'""",
        project_id, user_id,
    )
    if vendor:
        return DocumentAccess("sub", user["company_id"])

    raise HTTPException(403, "You do not have access to this project")


async def list_sub_companies_for_project(conn, project_id: int, owner_company_id: int):
    """Candidate companies for the grant-access picker (routers/documents.py's
    grant endpoint and the list endpoint's sub_companies field) — every
    distinct company, other than the project's own owner, that has at least
    one user on this project via either mechanism
    require_project_document_access accepts above."""
    rows = await conn.fetch(
        """SELECT DISTINCT c.id, c.name FROM companies c
           WHERE c.id != $2 AND (
             EXISTS (
               SELECT 1 FROM project_members pm JOIN users u ON u.id = pm.user_id
               WHERE pm.project_id = $1 AND u.company_id = c.id
             )
             OR EXISTS (
               SELECT 1 FROM project_vendor_access pva JOIN users u ON u.id = pva.vendor_user_id
               WHERE pva.project_id = $1 AND pva.status = 'accepted' AND u.company_id = c.id
             )
           )
           ORDER BY c.name""",
        project_id, owner_company_id,
    )
    return [dict(r) for r in rows]


async def require_can_delete_document(conn, user_id: int, access: DocumentAccess, document) -> None:
    """Soft-delete requires the caller to be either the GC-owner company
    (any of its users on the project) or the document's own uploader —
    mirrors services/invoice_helpers.py's require_can_modify_invoice shape,
    but at company grain rather than permission_level, matching how every
    other Documents rule is framed."""
    if access.is_gc:
        return
    if document["uploaded_by_user_id"] != user_id:
        raise HTTPException(403, "Only the uploader or the project's GC can delete this document")


def document_response(row) -> dict:
    """Excludes r2_key from every API response — it's an internal R2 object
    key, never a usable url on its own. Callers get a download link only
    from GET /api/documents/{id}/download, which mints a short-lived
    presigned url on demand (services/r2_storage.py)."""
    d = dict(row)
    d.pop("r2_key", None)
    return d

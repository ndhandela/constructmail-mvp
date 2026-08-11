"""
POMAR Permit Tracker — project-scoped permit records (building permits,
inspections, licenses, ...) shared between a GC and its Subs.

Access follows the exact same GC/Sub resolution as Documents
(services/permit_helpers.py mirrors services/document_helpers.py), but with
a stricter default: a Sub has NO visibility into a project's permits at all
until a GC explicitly grants view-only access to one specific permit via
permit_access_grants (same schema shape as document_access_grants). Only a
GC can create/edit/delete permits or manage the expiring-soon thresholds.

Status (Active / Expiring Soon / Expired) is never stored — every read
computes it via services/permit_helpers.compute_permit_status against the
per-(project,permit_type) threshold in project_permit_type_settings, falling
back to projects.default_expiring_soon_days.
"""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.permit_helpers import (
    compute_permit_status,
    get_expiring_soon_days,
    list_sub_companies_for_project,
    require_gc,
    require_permit_access_grant,
    require_project_permit_access,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/permits", tags=["Permit Tracker"])

PERMIT_COLUMNS = """p.id, p.project_id, p.permit_type, p.permit_number, p.issuing_authority,
                    p.issue_date, p.expiration_date, p.document_id, p.notes,
                    p.created_by, u.name AS created_by_name, p.created_at, p.updated_at"""

PERMIT_JOINS = "FROM permits p JOIN users u ON u.id = p.created_by"


async def _permit_response(conn, row) -> dict:
    d = dict(row)
    threshold = await get_expiring_soon_days(conn, d["project_id"], d["permit_type"])
    d["status"] = compute_permit_status(d["expiration_date"], threshold)
    d["expiring_soon_days"] = threshold
    return d


@router.get("")
async def list_permits(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_permit_access(conn, userId, project_id)

        if access.is_gc:
            rows = await conn.fetch(
                f"SELECT {PERMIT_COLUMNS} {PERMIT_JOINS} WHERE p.project_id = $1 ORDER BY p.expiration_date",
                project_id,
            )
        else:
            rows = await conn.fetch(
                f"""SELECT {PERMIT_COLUMNS} {PERMIT_JOINS}
                    WHERE p.project_id = $1
                      AND EXISTS (
                        SELECT 1 FROM permit_access_grants g
                        WHERE g.permit_id = p.id AND g.granted_to_company_id = $2 AND g.revoked_at IS NULL
                      )
                    ORDER BY p.expiration_date""",
                project_id, access.company_id,
            )

        today = date.today()
        permits = []
        for row in rows:
            d = dict(row)
            threshold = await get_expiring_soon_days(conn, project_id, d["permit_type"])
            d["status"] = compute_permit_status(d["expiration_date"], threshold, today)
            d["expiring_soon_days"] = threshold
            permits.append(d)

        grants_by_permit = {}
        sub_companies = []
        if access.is_gc:
            permit_ids = [p["id"] for p in permits]
            grant_rows = await conn.fetch(
                """SELECT g.permit_id, g.granted_to_company_id AS company_id, c.name AS company_name
                   FROM permit_access_grants g
                   JOIN companies c ON c.id = g.granted_to_company_id
                   WHERE g.permit_id = ANY($1::int[]) AND g.revoked_at IS NULL""",
                permit_ids,
            )
            for g in grant_rows:
                grants_by_permit.setdefault(g["permit_id"], []).append(
                    {"company_id": g["company_id"], "company_name": g["company_name"]}
                )
            for p in permits:
                p["grants"] = grants_by_permit.get(p["id"], [])

            sub_companies = await list_sub_companies_for_project(conn, project_id, access.company_id)

    return {
        "success": True,
        "permits": permits,
        "access_kind": access.kind,
        "can_write": access.is_gc,
        "sub_companies": sub_companies,
    }


@router.get("/{permit_id}")
async def get_permit(permit_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"SELECT {PERMIT_COLUMNS} {PERMIT_JOINS} WHERE p.id = $1", permit_id)
        if not row:
            raise HTTPException(404, "Permit not found")

        access = await require_project_permit_access(conn, userId, row["project_id"])
        if not access.is_gc:
            await require_permit_access_grant(conn, permit_id, access.company_id)

        permit = await _permit_response(conn, row)

    return {"success": True, "permit": permit}


@router.get("/projects/{project_id}/status-summary")
async def permit_status_summary(project_id: int, userId: int):
    """Lightweight badge feed for the Project Detail hub card — GC-only
    (a Sub's default-zero permit visibility shouldn't leak an aggregate
    expiring/expired signal about permits it can't otherwise see)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_permit_access(conn, userId, project_id)
        require_gc(access, "view the permit status summary")

        rows = await conn.fetch(
            "SELECT permit_type, expiration_date FROM permits WHERE project_id = $1", project_id,
        )
        today = date.today()
        has_expired = False
        has_expiring_soon = False
        for row in rows:
            threshold = await get_expiring_soon_days(conn, project_id, row["permit_type"])
            status = compute_permit_status(row["expiration_date"], threshold, today)
            if status == "expired":
                has_expired = True
            elif status == "expiring_soon":
                has_expiring_soon = True

    return {"success": True, "has_expired": has_expired, "has_expiring_soon": has_expiring_soon}


class CreatePermitRequest(BaseModel):
    userId: int
    permit_type: str
    permit_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    issue_date: Optional[date] = None
    expiration_date: date
    document_id: Optional[int] = None
    notes: Optional[str] = None


async def _validate_document_id(conn, document_id: Optional[int], project_id: int) -> None:
    if document_id is None:
        return
    document = await conn.fetchrow(
        "SELECT id FROM documents WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL",
        document_id, project_id,
    )
    if not document:
        raise HTTPException(400, "That document was not found on this project")


@router.post("/projects/{project_id}")
async def create_permit(project_id: int, req: CreatePermitRequest):
    permit_type = (req.permit_type or "").strip()
    if not permit_type:
        raise HTTPException(400, "Permit type is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_permit_access(conn, req.userId, project_id)
        require_gc(access, "create permits")
        await _validate_document_id(conn, req.document_id, project_id)

        row = await conn.fetchrow(
            f"""INSERT INTO permits (project_id, permit_type, permit_number, issuing_authority,
                                      issue_date, expiration_date, document_id, notes, created_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                RETURNING id""",
            project_id, permit_type, (req.permit_number or "").strip() or None,
            (req.issuing_authority or "").strip() or None, req.issue_date, req.expiration_date,
            req.document_id, (req.notes or "").strip() or None, req.userId,
        )
        row = await conn.fetchrow(f"SELECT {PERMIT_COLUMNS} {PERMIT_JOINS} WHERE p.id = $1", row["id"])
        permit = await _permit_response(conn, row)

    return {"success": True, "permit": permit}


class UpdatePermitRequest(BaseModel):
    userId: int
    permit_type: Optional[str] = None
    permit_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    issue_date: Optional[date] = None
    expiration_date: Optional[date] = None
    document_id: Optional[int] = None
    notes: Optional[str] = None


@router.patch("/{permit_id}")
async def update_permit(permit_id: int, req: UpdatePermitRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        permit = await conn.fetchrow("SELECT * FROM permits WHERE id = $1", permit_id)
        if not permit:
            raise HTTPException(404, "Permit not found")

        access = await require_project_permit_access(conn, req.userId, permit["project_id"])
        require_gc(access, "edit permits")

        updates = req.model_dump(exclude={"userId"}, exclude_unset=True)
        if "permit_type" in updates:
            permit_type = (updates["permit_type"] or "").strip()
            if not permit_type:
                raise HTTPException(400, "Permit type is required")
            updates["permit_type"] = permit_type
        for text_field in ("permit_number", "issuing_authority", "notes"):
            if text_field in updates:
                updates[text_field] = (updates[text_field] or "").strip() or None
        if "document_id" in updates:
            await _validate_document_id(conn, updates["document_id"], permit["project_id"])

        if not updates:
            row = permit
        else:
            set_clause = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(updates.keys()))
            row = await conn.fetchrow(
                f"UPDATE permits SET {set_clause}, updated_at = NOW() WHERE id = $1 RETURNING *",
                permit_id, *updates.values(),
            )

        row = await conn.fetchrow(f"SELECT {PERMIT_COLUMNS} {PERMIT_JOINS} WHERE p.id = $1", row["id"])
        result = await _permit_response(conn, row)

    return {"success": True, "permit": result}


@router.delete("/{permit_id}")
async def delete_permit(permit_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        permit = await conn.fetchrow("SELECT * FROM permits WHERE id = $1", permit_id)
        if not permit:
            raise HTTPException(404, "Permit not found")

        access = await require_project_permit_access(conn, userId, permit["project_id"])
        require_gc(access, "delete permits")

        await conn.execute("DELETE FROM permits WHERE id = $1", permit_id)

    return {"success": True}


# ── Sub view-access grants ──────────────────────────────────────────────
# Mirrors routers/documents.py's grant/revoke endpoints exactly (same
# request shape, same POST /revoke rather than DELETE), just against
# permit_access_grants instead of document_access_grants.

class GrantAccessRequest(BaseModel):
    userId: int
    granted_to_company_id: int


@router.post("/{permit_id}/grant")
async def grant_permit_access(permit_id: int, req: GrantAccessRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        permit = await conn.fetchrow("SELECT * FROM permits WHERE id = $1", permit_id)
        if not permit:
            raise HTTPException(404, "Permit not found")

        access = await require_project_permit_access(conn, req.userId, permit["project_id"])
        require_gc(access, "manage permit access")

        candidates = await list_sub_companies_for_project(conn, permit["project_id"], access.company_id)
        if not any(c["id"] == req.granted_to_company_id for c in candidates):
            raise HTTPException(400, "That company does not have access to this project")

        row = await conn.fetchrow(
            """INSERT INTO permit_access_grants (permit_id, granted_to_company_id, granted_by_user_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (permit_id, granted_to_company_id) DO UPDATE
                   SET revoked_at = NULL, granted_by_user_id = EXCLUDED.granted_by_user_id
               RETURNING *""",
            permit_id, req.granted_to_company_id, req.userId,
        )

    return {"success": True, "grant": dict(row)}


class RevokeAccessRequest(BaseModel):
    userId: int
    granted_to_company_id: int


@router.post("/{permit_id}/revoke")
async def revoke_permit_access(permit_id: int, req: RevokeAccessRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        permit = await conn.fetchrow("SELECT * FROM permits WHERE id = $1", permit_id)
        if not permit:
            raise HTTPException(404, "Permit not found")

        access = await require_project_permit_access(conn, req.userId, permit["project_id"])
        require_gc(access, "manage permit access")

        row = await conn.fetchrow(
            """UPDATE permit_access_grants SET revoked_at = NOW()
               WHERE permit_id = $1 AND granted_to_company_id = $2 AND revoked_at IS NULL
               RETURNING *""",
            permit_id, req.granted_to_company_id,
        )
        if not row:
            raise HTTPException(404, "No active grant found for that company")

    return {"success": True, "grant": dict(row)}


# ── Per-permit-type expiring-soon threshold settings ────────────────────

@router.get("/projects/{project_id}/settings")
async def get_permit_type_settings(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_permit_access(conn, userId, project_id)
        require_gc(access, "view permit settings")

        default_days = await conn.fetchval(
            "SELECT default_expiring_soon_days FROM projects WHERE id = $1", project_id,
        )
        overrides = await conn.fetch(
            """SELECT permit_type, expiring_soon_days FROM project_permit_type_settings
               WHERE project_id = $1 ORDER BY permit_type""",
            project_id,
        )
        override_by_type = {r["permit_type"]: r["expiring_soon_days"] for r in overrides}

        used_types = await conn.fetch(
            "SELECT DISTINCT permit_type FROM permits WHERE project_id = $1 ORDER BY permit_type",
            project_id,
        )

        permit_types = sorted(set(override_by_type.keys()) | {r["permit_type"] for r in used_types})
        settings = [
            {
                "permit_type": permit_type,
                "expiring_soon_days": override_by_type.get(permit_type, default_days),
                "is_custom": permit_type in override_by_type,
            }
            for permit_type in permit_types
        ]

    return {
        "success": True,
        "default_expiring_soon_days": default_days,
        "permit_type_settings": settings,
    }


class SetPermitTypeSettingRequest(BaseModel):
    userId: int
    expiring_soon_days: int


@router.put("/projects/{project_id}/settings/{permit_type}")
async def set_permit_type_setting(project_id: int, permit_type: str, req: SetPermitTypeSettingRequest):
    if req.expiring_soon_days < 0:
        raise HTTPException(400, "expiring_soon_days must be zero or greater")

    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_permit_access(conn, req.userId, project_id)
        require_gc(access, "manage permit settings")

        row = await conn.fetchrow(
            """INSERT INTO project_permit_type_settings (project_id, permit_type, expiring_soon_days)
               VALUES ($1, $2, $3)
               ON CONFLICT (project_id, permit_type) DO UPDATE
                   SET expiring_soon_days = EXCLUDED.expiring_soon_days, updated_at = NOW()
               RETURNING *""",
            project_id, permit_type, req.expiring_soon_days,
        )

    return {"success": True, "setting": dict(row)}


@router.delete("/projects/{project_id}/settings/{permit_type}")
async def reset_permit_type_setting(project_id: int, permit_type: str, userId: int):
    """Reverts a permit_type to the project's default_expiring_soon_days by
    removing its override row — the natural undo for the PUT above."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_permit_access(conn, userId, project_id)
        require_gc(access, "manage permit settings")

        result = await conn.execute(
            "DELETE FROM project_permit_type_settings WHERE project_id = $1 AND permit_type = $2",
            project_id, permit_type,
        )
        if result == "DELETE 0":
            raise HTTPException(404, "No custom setting found for that permit type")

    return {"success": True}


class UpdateDefaultThresholdRequest(BaseModel):
    userId: int
    default_expiring_soon_days: int


@router.put("/projects/{project_id}/default-expiring-soon-days")
async def update_default_expiring_soon_days(project_id: int, req: UpdateDefaultThresholdRequest):
    if req.default_expiring_soon_days < 0:
        raise HTTPException(400, "default_expiring_soon_days must be zero or greater")

    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_permit_access(conn, req.userId, project_id)
        require_gc(access, "manage permit settings")

        row = await conn.fetchrow(
            "UPDATE projects SET default_expiring_soon_days = $2 WHERE id = $1 RETURNING id, default_expiring_soon_days",
            project_id, req.default_expiring_soon_days,
        )

    return {"success": True, "default_expiring_soon_days": row["default_expiring_soon_days"]}

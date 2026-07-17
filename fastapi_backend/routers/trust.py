"""
POMAR Trust — project CRUD + dashboard summary.

Every endpoint resolves the caller through services/trust_access.py first:
403 for any company that isn't India-region with the 'trust' feature flag
enabled, matching the spec's "no US org ever sees this" requirement at the
API layer (nav visibility is just a cosmetic mirror of this, see
routers/profile.py's company_region field).
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.trust_access import require_trust_module, require_trust_project, require_trust_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/trust", tags=["Trust"])


class CreateProjectRequest(BaseModel):
    userId: int
    project_name: str
    rera_registration_number: Optional[str] = None
    rera_state: Optional[str] = "TG"
    unit_count: Optional[int] = None


@router.post("/projects")
async def create_project(req: CreateProjectRequest):
    if req.rera_state != "TG":
        raise HTTPException(400, "Only TG-RERA (Telangana) is supported in v1")
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_role(conn, req.userId, ("compliance_reviewer", "owner"))
        try:
            row = await conn.fetchrow(
                """INSERT INTO trust_projects (company_id, project_name, rera_registration_number, rera_state, unit_count)
                   VALUES ($1,$2,$3,$4,$5) RETURNING *""",
                ctx["company_id"], req.project_name.strip(), req.rera_registration_number, req.rera_state, req.unit_count,
            )
        except Exception:
            logger.exception(
                "trust_projects insert failed for company_id=%s user_id=%s project_name=%r",
                ctx["company_id"], req.userId, req.project_name,
            )
            raise HTTPException(500, "Could not create the project — please try again.")

        if row is None:
            # Should be unreachable (a failed INSERT ... RETURNING raises rather than
            # returning None), but fail loudly instead of silently 200-ing with no data
            # if that assumption is ever wrong.
            logger.error(
                "trust_projects insert returned no row for company_id=%s user_id=%s project_name=%r",
                ctx["company_id"], req.userId, req.project_name,
            )
            raise HTTPException(500, "Project was not saved — please try again.")

    return {"success": True, "project": dict(row)}


@router.get("/projects")
async def list_projects(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_module(conn, userId)
        rows = await conn.fetch(
            "SELECT * FROM trust_projects WHERE company_id = $1 ORDER BY created_at DESC",
            ctx["company_id"],
        )
    return {"success": True, "projects": [dict(r) for r in rows]}


@router.get("/projects/{project_id}/dashboard")
async def project_dashboard(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_project(conn, userId, project_id, ("site_data", "compliance_reviewer", "owner"))
        open_alert_count = await conn.fetchval(
            "SELECT COUNT(*) FROM trust_change_alerts WHERE project_id = $1 AND status = 'open'",
            project_id,
        )
        last_qpr = await conn.fetchrow(
            """SELECT id, quarter, due_date, status, filed_at FROM trust_qpr_drafts
               WHERE project_id = $1 ORDER BY generated_at DESC LIMIT 1""",
            project_id,
        )
        upload_count = await conn.fetchval(
            "SELECT COUNT(*) FROM trust_uploads WHERE project_id = $1", project_id,
        )
    return {
        "success": True,
        "project": ctx["project"],
        "open_alert_count": open_alert_count,
        "upload_count": upload_count,
        "last_qpr": dict(last_qpr) if last_qpr else None,
    }

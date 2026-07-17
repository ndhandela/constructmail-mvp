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
from services.project_helpers import create_project_and_membership
from services.state_rera_profiles import STATE_RERA_PROFILES, get_state_profile
from services.trust_access import require_trust_module, require_trust_project, require_trust_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/trust", tags=["Trust"])

PROJECT_MODES = ("standalone", "link_existing", "create_linked")


class CreateProjectRequest(BaseModel):
    userId: int
    project_name: str
    rera_registration_number: Optional[str] = None
    rera_state: Optional[str] = "TG"
    unit_count: Optional[int] = None
    mode: Optional[str] = "standalone"
    existing_project_id: Optional[int] = None


@router.get("/state-profiles")
async def list_state_profiles(userId: int):
    """Backs the state dropdown at project creation and the QPR Generator's
    implemented/not-yet-implemented check — the frontend never hardcodes
    state names, it renders whatever this registry currently has."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_trust_module(conn, userId)
    return {
        "success": True,
        "states": [
            {"code": code, "label": profile["label"], "implemented": profile["implemented"]}
            for code, profile in STATE_RERA_PROFILES.items()
        ],
    }


@router.post("/projects")
async def create_project(req: CreateProjectRequest):
    # Any recognized state can have a project created for it — Change Alerts
    # and Audit Trail are state-agnostic, only QPR generation is gated on
    # get_state_profile(...).implemented (see routers/trust_qpr.py). An
    # unrecognized code still 400s, via get_state_profile.
    get_state_profile(req.rera_state)

    mode = req.mode or "standalone"
    if mode not in PROJECT_MODES:
        raise HTTPException(400, f"mode must be one of: {', '.join(PROJECT_MODES)}")
    if mode == "link_existing" and not req.existing_project_id:
        raise HTTPException(400, "existing_project_id is required for mode 'link_existing'")

    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_role(conn, req.userId, ("compliance_reviewer", "owner"))

        linked_project_id = None
        if mode == "link_existing":
            # Same org check as everywhere else a project_id comes in from
            # the client — never trust that it's actually this company's.
            existing = await conn.fetchrow(
                "SELECT id FROM projects WHERE id = $1 AND company_id = $2",
                req.existing_project_id, ctx["company_id"],
            )
            if not existing:
                raise HTTPException(400, "That project doesn't belong to your company.")
            linked_project_id = existing["id"]
        elif mode == "create_linked":
            # create_project_and_membership performs the exact same action as
            # routers/projects.py's own POST /api/projects, which restricts
            # project creation to the company owner — Trust honors that same
            # rule here rather than giving reviewers a side door into it.
            user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", req.userId)
            if not user or user["permission_level"] != "owner":
                raise HTTPException(
                    403,
                    "Only the company owner can create a new shared project. "
                    "Ask your GC Owner, or link to an existing project instead.",
                )

        try:
            async with conn.transaction():
                if mode == "create_linked":
                    linked = await create_project_and_membership(
                        conn, req.userId, ctx["company_id"], req.project_name.strip(),
                    )
                    linked_project_id = linked["id"]

                row = await conn.fetchrow(
                    """INSERT INTO trust_projects
                         (company_id, project_name, rera_registration_number, rera_state, unit_count, linked_project_id)
                       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *""",
                    ctx["company_id"], req.project_name.strip(), req.rera_registration_number,
                    req.rera_state, req.unit_count, linked_project_id,
                )
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "trust_projects insert failed for company_id=%s user_id=%s project_name=%r mode=%s",
                ctx["company_id"], req.userId, req.project_name, mode,
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


@router.get("/projects/{project_id}")
async def get_project(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_project(conn, userId, project_id, ("site_data", "compliance_reviewer", "owner"))
        project = dict(ctx["project"])
        project["linked_project"] = None
        if project.get("linked_project_id"):
            linked = await conn.fetchrow(
                "SELECT id, name FROM projects WHERE id = $1", project["linked_project_id"],
            )
            if linked:
                project["linked_project"] = dict(linked)
    return {"success": True, "project": project}


@router.get("/projects")
async def list_projects(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_module(conn, userId)
        rows = await conn.fetch(
            """SELECT tp.*, p.name AS linked_project_name FROM trust_projects tp
               LEFT JOIN projects p ON p.id = tp.linked_project_id
               WHERE tp.company_id = $1 ORDER BY tp.created_at DESC""",
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

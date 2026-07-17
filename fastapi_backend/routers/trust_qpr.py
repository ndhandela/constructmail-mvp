"""
POMAR Trust — QPR (Quarterly Progress Report) generator.

Draft-then-review-then-file, same shape as routers/mail.py's draft_replies:
nothing here files with the state RERA authority automatically — 'filed' just
marks the draft reviewed and locked in POMAR, the actual filing happens on
the RERA portal by the user.
"""

import calendar
import json
import re
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.trust_access import require_trust_project
from services.trust_ai import synthesize_qpr
from services.user_service import log_trust_activity

router = APIRouter(prefix="/api/trust", tags=["Trust QPR"])

# GET/PATCH require reviewer or owner per spec; draft generation is treated
# the same way since site_data's stated scope is "upload + view extraction
# results only" (never QPR content).
REVIEW_ROLES = ("compliance_reviewer", "owner")

_QUARTER_RE = re.compile(r"^Q([1-4])-(\d{4})$")


def _quarter_date_range(quarter: str) -> tuple[date, date]:
    """Parses "Q{1-4}-{YYYY}" as an Indian financial-year quarter (Apr-Mar),
    the convention RERA quarterly filings follow — Q1=Apr-Jun, Q2=Jul-Sep,
    Q3=Oct-Dec, Q4=Jan-Mar of the following calendar year. YYYY is the FY
    start year, so "Q3-2026" means FY2026-27 Q3 = Oct-Dec 2026."""
    match = _QUARTER_RE.match(quarter)
    if not match:
        raise HTTPException(400, "quarter must look like 'Q3-2026'")
    q, fy_start_year = int(match.group(1)), int(match.group(2))
    start_month = 4 + (q - 1) * 3
    year_offset = start_month // 13  # Q4 rolls start_month past 12 into next year
    start_month = ((start_month - 1) % 12) + 1
    start_year = fy_start_year + year_offset
    end_month = start_month + 2
    end_year = start_year
    if end_month > 12:
        end_month -= 12
        end_year += 1
    start = date(start_year, start_month, 1)
    end = date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])
    return start, end


def _qpr_due_date(quarter_end: date) -> date:
    """TG-RERA (and most state RERA rules) require the QPR within 7 days of
    quarter end."""
    return quarter_end + timedelta(days=7)


class GenerateQprRequest(BaseModel):
    userId: int
    financials: Optional[dict] = None


@router.post("/projects/{project_id}/qpr-draft")
async def generate_qpr_draft(project_id: int, quarter: str, req: GenerateQprRequest):
    start, end = _quarter_date_range(quarter)
    due_date = _qpr_due_date(end)

    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_project(conn, req.userId, project_id, REVIEW_ROLES)

        existing = await conn.fetchrow(
            "SELECT id, status FROM trust_qpr_drafts WHERE project_id = $1 AND quarter = $2",
            project_id, quarter,
        )
        if existing and existing["status"] == "filed":
            raise HTTPException(400, f"The {quarter} QPR is already filed and can't be regenerated")

        extractions = await conn.fetch(
            """SELECT te.* FROM trust_extractions te
               JOIN trust_uploads tu ON tu.id = te.upload_id
               WHERE tu.project_id = $1
                 AND te.extraction_type IN ('progress_update', 'milestone')
                 AND te.created_at::date BETWEEN $2 AND $3
               ORDER BY te.created_at""",
            project_id, start, end,
        )

        draft = await synthesize_qpr(ctx["project"], [dict(e) for e in extractions], req.financials or {})

        row = await conn.fetchrow(
            """INSERT INTO trust_qpr_drafts
                 (project_id, quarter, due_date, physical_progress_pct, financial_progress_pct, escrow_status, draft_json, status, generated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',NOW())
               ON CONFLICT (project_id, quarter) DO UPDATE SET
                 due_date = $3, physical_progress_pct = $4, financial_progress_pct = $5,
                 escrow_status = $6, draft_json = $7, status = 'draft', generated_at = NOW(), filed_at = NULL
               RETURNING *""",
            project_id, quarter, due_date,
            draft.get("physical_progress_pct"), draft.get("financial_progress_pct"),
            draft.get("escrow_status"), json.dumps(draft),
        )

        await log_trust_activity(
            req.userId, ctx["company_id"], "qpr_draft_generated", "trust_qpr_drafts", row["id"],
            {"project_id": project_id, "quarter": quarter},
        )

    return {"success": True, "draft": dict(row)}


@router.get("/projects/{project_id}/qpr-drafts")
async def list_qpr_drafts(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_trust_project(conn, userId, project_id, REVIEW_ROLES)
        rows = await conn.fetch(
            "SELECT * FROM trust_qpr_drafts WHERE project_id = $1 ORDER BY generated_at DESC", project_id,
        )
    return {"success": True, "drafts": [dict(r) for r in rows]}


@router.get("/projects/{project_id}/qpr-draft/{draft_id}")
async def get_qpr_draft(project_id: int, draft_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_trust_project(conn, userId, project_id, REVIEW_ROLES)
        row = await conn.fetchrow(
            "SELECT * FROM trust_qpr_drafts WHERE id = $1 AND project_id = $2", draft_id, project_id,
        )
    if not row:
        raise HTTPException(404, "Draft not found")
    return {"success": True, "draft": dict(row)}


class UpdateQprRequest(BaseModel):
    userId: int
    physical_progress_pct: Optional[float] = None
    financial_progress_pct: Optional[float] = None
    escrow_status: Optional[str] = None
    draft_json: Optional[dict] = None
    status: Optional[str] = None


@router.patch("/projects/{project_id}/qpr-draft/{draft_id}")
async def update_qpr_draft(project_id: int, draft_id: int, req: UpdateQprRequest):
    if req.status is not None and req.status not in ("draft", "reviewed", "filed"):
        raise HTTPException(400, "status must be 'draft', 'reviewed', or 'filed'")

    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_project(conn, req.userId, project_id, REVIEW_ROLES)
        existing = await conn.fetchrow(
            "SELECT * FROM trust_qpr_drafts WHERE id = $1 AND project_id = $2", draft_id, project_id,
        )
        if not existing:
            raise HTTPException(404, "Draft not found")

        row = await conn.fetchrow(
            """UPDATE trust_qpr_drafts SET
                 physical_progress_pct = COALESCE($1, physical_progress_pct),
                 financial_progress_pct = COALESCE($2, financial_progress_pct),
                 escrow_status = COALESCE($3, escrow_status),
                 draft_json = COALESCE($4, draft_json),
                 status = COALESCE($5, status),
                 filed_at = CASE WHEN $5 = 'filed' THEN NOW() ELSE filed_at END
               WHERE id = $6 RETURNING *""",
            req.physical_progress_pct, req.financial_progress_pct, req.escrow_status,
            json.dumps(req.draft_json) if req.draft_json is not None else None, req.status, draft_id,
        )

        if req.status == "filed" and existing["status"] != "filed":
            await log_trust_activity(
                req.userId, ctx["company_id"], "qpr_filed", "trust_qpr_drafts", draft_id,
                {"project_id": project_id, "quarter": row["quarter"]},
            )

    return {"success": True, "draft": dict(row)}

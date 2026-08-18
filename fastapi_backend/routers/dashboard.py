"""
POMAR Dashboard — portfolio-level read-only aggregate consumed by the
Projects Overview page (frontend/src/modules/project-hub/pages/
ProjectsOverviewPage.js). Joins data Capital Tracker (budget/work-items),
Milestones, and Daily Logs already own; adds no new tables/columns, and
never writes to any of their tables — see services/capital_helpers.py and
services/daily_log_helpers.py for the individual rollups this composes.

Scoped the same way routers/capital.py's list_capital_projects is: the
'capital' feature flag plus the caller's own project_members rows, since
budget/progress is this endpoint's core signal and every project it can
ever return already went through that same gate. daily_logs data is
additionally gated per-company via is_feature_enabled (non-raising) so a
company without Daily Logs enabled just gets last_log: null per project
instead of a 403 for the whole dashboard.
"""
import logging

from fastapi import APIRouter

from db import get_pool
from services.access_control import is_feature_enabled, require_feature_flag
from services.capital_helpers import (
    classify_project_risk,
    get_project_budget_summary,
    get_project_next_milestone,
    get_project_progress_pct,
    get_spend_by_work_item,
)
from services.daily_log_helpers import get_project_last_log

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _phase_label(project_row) -> str:
    """A short "where's this project at" label for the card — project
    location when set (the more specific, human-entered value), otherwise
    the project's own lifecycle status (planning/active/on_hold/completed)
    title-cased. Not a new concept: both columns already exist on
    projects (see routers/projects.py's get_projects)."""
    if project_row["location"]:
        return project_row["location"]
    return (project_row["status"] or "active").replace("_", " ").title()


@router.get("/summary")
async def dashboard_summary(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")

        company_id = await conn.fetchval("SELECT company_id FROM users WHERE id = $1", userId)
        daily_logs_enabled = await is_feature_enabled(conn, company_id, "daily_logs")

        rows = await conn.fetch(
            """SELECT p.id, p.name, p.location, p.status
               FROM projects p
               JOIN project_members pm ON pm.project_id = p.id
               WHERE pm.user_id = $1
               ORDER BY p.created_at""",
            userId,
        )

        projects = []
        for row in rows:
            project_id = row["id"]

            budget_summary = await get_project_budget_summary(conn, project_id)
            budgeted = budget_summary["total_budgeted"]
            actual = budget_summary["total_actual"]

            work_items = (await get_spend_by_work_item(conn, project_id))["work_items"]
            progress_pct = get_project_progress_pct(work_items)

            next_milestone = await get_project_next_milestone(conn, project_id)
            last_log = await get_project_last_log(conn, project_id) if daily_logs_enabled else None

            risk_status = classify_project_risk(
                budgeted,
                actual,
                progress_pct,
                milestone_overdue=bool(next_milestone and next_milestone["overdue"]),
                milestone_due_soon=bool(next_milestone and next_milestone["due_soon"]),
            )

            projects.append({
                "id": project_id,
                "name": row["name"],
                "phase_label": _phase_label(row),
                "status": row["status"],
                "budget_total": budgeted,
                "budget_spent": actual,
                "budget_spent_pct": round((actual / budgeted) * 100, 1) if budgeted else None,
                "progress_pct": progress_pct,
                "risk_status": risk_status,
                "next_milestone": next_milestone,
                "last_log": last_log,
            })

    return {"success": True, "projects": projects}

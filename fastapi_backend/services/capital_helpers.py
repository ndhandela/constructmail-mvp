from datetime import date, timedelta
from typing import Optional

# Shared building block for every committed/spent rollup below. A budget
# item's committed amount is its own manually-entered committed_amount
# (BudgetItemsTab.js's "Committed Amount" field) PLUS every invoice linked
# to it via routers/invoices.py's budget_item_id, regardless of status —
# invoiced is committed whether or not it's been paid yet. Its spent
# amount is actual_spent PLUS only the invoices actually marked 'paid'.
# Previously these rollups only ever read the two manual columns, so
# uploading/paying an invoice against a budget item never moved either
# figure (see routers/invoices.py's STATUSES for the 'pending'/'paid'
# values actual_spent's filter checks against).
_ITEM_TOTALS_CTE = """
    WITH item_totals AS (
        SELECT bi.id, bi.project_id, bi.work_item_id, bi.category_id, bi.budgeted_amount,
               bi.committed_amount + COALESCE(inv.committed, 0) AS committed_amount,
               bi.actual_spent + COALESCE(inv.spent, 0) AS actual_spent
        FROM budget_items bi
        LEFT JOIN (
            SELECT budget_item_id,
                   SUM(amount) AS committed,
                   SUM(amount) FILTER (WHERE status = 'paid') AS spent
            FROM invoices
            WHERE budget_item_id IS NOT NULL
            GROUP BY budget_item_id
        ) inv ON inv.budget_item_id = bi.id
    )
"""


async def get_budget_items(conn, project_id: int) -> list:
    """Every budget item on a project, with committed_amount/actual_spent
    already folded in with their linked invoices (see _ITEM_TOTALS_CTE) —
    used by routers/capital.py's list_budget_items."""
    rows = await conn.fetch(
        _ITEM_TOTALS_CTE + """
        SELECT it.id, it.project_id, it.work_item_id, it.category_id, it.budgeted_amount,
               it.committed_amount, it.actual_spent,
               bi.notes, bi.created_at, bi.updated_at,
               c.name AS category_name, wi.name AS work_item_name
        FROM item_totals it
        JOIN budget_items bi ON bi.id = it.id
        JOIN categories c ON c.id = it.category_id
        JOIN work_items wi ON wi.id = it.work_item_id
        WHERE it.project_id = $1
        ORDER BY wi.sequence NULLS LAST, wi.id, c.name
        """,
        project_id,
    )
    return [dict(r) for r in rows]


async def get_project_budget_summary(conn, project_id: int) -> dict:
    """Project-wide budgeted/committed/actual totals across every work
    item's budget_items. Pulled out of routers/capital.py so future
    features (milestone-linked draw schedules, admin reporting) can call
    the same computation instead of re-deriving it inline."""
    row = await conn.fetchrow(
        _ITEM_TOTALS_CTE + """
        SELECT COALESCE(SUM(budgeted_amount), 0) AS total_budgeted,
               COALESCE(SUM(committed_amount), 0) AS total_committed,
               COALESCE(SUM(actual_spent), 0) AS total_actual
        FROM item_totals WHERE project_id = $1
        """,
        project_id,
    )

    total_budgeted = float(row["total_budgeted"])
    total_committed = float(row["total_committed"])
    total_actual = float(row["total_actual"])

    return {
        "total_budgeted": total_budgeted,
        "total_committed": total_committed,
        "total_actual": total_actual,
        "variance": total_budgeted - total_actual,
    }


async def get_project_milestone_summary(conn, project_id: int) -> dict:
    """Lightweight rollup for the Projects Overview dashboard card. Milestone
    status is a manually-set dropdown (not_started/in_progress/at_risk/
    complete — see MilestonesTab.js's STATUS_OPTIONS) with no existing
    due-date-based at-risk computation, so this derives one: a non-complete
    milestone counts as overdue if it's manually flagged (risk_flag or
    status='at_risk') OR its target_date has passed, and as due_soon if
    target_date falls within the next 7 days. complete milestones never
    count either way."""
    rows = await conn.fetch(
        "SELECT target_date, status, risk_flag FROM milestones WHERE project_id = $1 AND status != 'complete'",
        project_id,
    )
    today = date.today()
    overdue = 0
    due_soon = 0
    for row in rows:
        if row["risk_flag"] or row["status"] == "at_risk" or (row["target_date"] and row["target_date"] < today):
            overdue += 1
        elif row["target_date"] and row["target_date"] <= today + timedelta(days=7):
            due_soon += 1

    if overdue:
        return {"status": "overdue", "count": overdue, "label": f"{overdue} overdue"}
    if due_soon:
        return {"status": "due_soon", "count": due_soon, "label": f"{due_soon} due this week"}
    return {"status": "on_schedule", "count": 0, "label": "On schedule"}


async def get_project_upcoming_milestones(conn, project_id: int, limit: int = 3) -> list:
    """The soonest not-yet-complete milestones across every work item on the
    project, nearest first — backs both get_project_next_milestone below
    (limit=1) and the Projects Overview "Milestones" tooltip (routers/
    dashboard.py, limit=3), so a single query serves both instead of
    fetching the same rows twice per request. due_soon uses the same 7-day
    window as get_project_milestone_summary for consistency."""
    rows = await conn.fetch(
        """SELECT m.name, m.target_date
           FROM milestones m JOIN work_items wi ON wi.id = m.work_item_id
           WHERE wi.project_id = $1 AND m.status != 'complete'
           ORDER BY m.target_date ASC NULLS LAST, m.id
           LIMIT $2""",
        project_id, limit,
    )
    today = date.today()
    milestones = []
    for row in rows:
        target = row["target_date"]
        if target is None:
            milestones.append({"name": row["name"], "due_date": None, "overdue": False, "due_soon": False})
            continue
        milestones.append({
            "name": row["name"],
            "due_date": target.isoformat(),
            "overdue": target < today,
            "due_soon": today <= target <= today + timedelta(days=7),
        })
    return milestones


async def get_project_next_milestone(conn, project_id: int) -> Optional[dict]:
    """The single soonest not-yet-complete milestone — distinct from
    get_project_milestone_summary's aggregate count above (that answers
    "how many are overdue"; this answers "what's next")."""
    milestones = await get_project_upcoming_milestones(conn, project_id, limit=1)
    return milestones[0] if milestones else None


def get_project_progress_pct(work_items: list) -> float:
    """Budget-dollar-weighted average of work_items.percent_complete —
    project-wide counterpart to get_spend_by_work_item's per-item "60% done
    but 85% spent" comparison, reusing its already-fetched work_items list
    rather than a second query. Falls back to a plain average when no
    work item has any budget dollars behind it yet (weighting by zero would
    otherwise divide by zero), and to 0 when there are no work items at
    all."""
    if not work_items:
        return 0.0
    total_budgeted = sum(wi["budgeted_amount"] for wi in work_items)
    if total_budgeted <= 0:
        return round(sum(wi["percent_complete"] for wi in work_items) / len(work_items), 1)
    weighted = sum(wi["percent_complete"] * wi["budgeted_amount"] for wi in work_items)
    return round(weighted / total_budgeted, 1)


# Percentage points project-wide spend% is allowed to run ahead of
# project-wide progress% before that alone counts as "at risk" (see
# classify_project_risk). Matches the 15-point gap frontend/src/modules/
# capital/capitalUtils.js's progressColor() already used for this exact
# "60% done but 85% spent" comparison at the single-work-item level
# (currently unreferenced by any page, but its threshold is the closest
# prior art in the app, so this reuses its number rather than inventing a
# new one).
RISK_PACE_GAP_THRESHOLD_PCT = 15


def classify_project_risk(
    total_budgeted: float,
    total_actual: float,
    progress_pct: float,
    milestone_overdue: bool = False,
    milestone_due_soon: bool = False,
) -> str:
    """Single source of truth for the Projects Overview dashboard's risk
    status — reused for both the per-project donut color and the portfolio
    comparison-chart bar color (routers/dashboard.py) so the two visuals
    never disagree. Priority: actual spend over the approved total always
    wins ('over_budget') regardless of pace/milestones; short of that, a
    close/overdue next milestone OR spend running significantly ahead of
    physical progress both independently mean 'at_risk'; otherwise
    'on_track'."""
    if total_budgeted > 0 and total_actual > total_budgeted:
        return "over_budget"

    spend_pct = (total_actual / total_budgeted * 100) if total_budgeted else 0.0
    if milestone_overdue or milestone_due_soon:
        return "at_risk"
    if (spend_pct - progress_pct) >= RISK_PACE_GAP_THRESHOLD_PCT:
        return "at_risk"
    return "on_track"


async def get_spend_by_work_item(conn, project_id: int) -> dict:
    """Per-work-item budget rollup (allotted/committed/spent, joined
    against that work item's own status/percent_complete) — the "60% done
    but 85% spent" view: budget alone can't tell you whether spend is
    tracking ahead of or behind physical progress. Since migration 013,
    budget_items belong to exactly one work_item (not a shared category),
    so this is a straight GROUP BY rather than the category-mediated join
    it used to be."""
    rows = await conn.fetch(
        _ITEM_TOTALS_CTE + """
        SELECT wi.id AS work_item_id, wi.name, wi.status AS work_item_status,
               wi.percent_complete,
               COALESCE(SUM(it.budgeted_amount), 0) AS budgeted_amount,
               COALESCE(SUM(it.committed_amount), 0) AS committed_amount,
               COALESCE(SUM(it.actual_spent), 0) AS actual_spent,
               COUNT(it.id) AS budget_item_count
        FROM work_items wi
        LEFT JOIN item_totals it ON it.work_item_id = wi.id
        WHERE wi.project_id = $1
        GROUP BY wi.id, wi.name, wi.status, wi.percent_complete
        ORDER BY wi.sequence NULLS LAST, wi.id
        """,
        project_id,
    )

    work_items = []
    for row in rows:
        budgeted = float(row["budgeted_amount"])
        actual = float(row["actual_spent"])
        spend_percent = round((actual / budgeted) * 100, 1) if budgeted else None
        work_items.append({
            "work_item_id": row["work_item_id"],
            "name": row["name"],
            "work_item_status": row["work_item_status"],
            "percent_complete": float(row["percent_complete"]),
            "budgeted_amount": budgeted,
            "committed_amount": float(row["committed_amount"]),
            "actual_spent": actual,
            "spend_percent": spend_percent,
            "budget_item_count": row["budget_item_count"],
        })

    return {"work_items": work_items}


async def get_spend_by_category(conn, project_id: int) -> dict:
    """Per-category budget rollup, summed across every work item in the
    project — the cross-work-item view that a single work item's own
    budget_items can't show on their own, since the same category (e.g.
    "Electrical") can tag budget_items under several different work
    items."""
    rows = await conn.fetch(
        _ITEM_TOTALS_CTE + """
        SELECT c.id AS category_id, c.name,
               COALESCE(SUM(it.budgeted_amount), 0) AS budgeted_amount,
               COALESCE(SUM(it.committed_amount), 0) AS committed_amount,
               COALESCE(SUM(it.actual_spent), 0) AS actual_spent,
               COUNT(it.id) AS budget_item_count
        FROM categories c
        LEFT JOIN item_totals it ON it.category_id = c.id
        WHERE c.project_id = $1
        GROUP BY c.id, c.name
        ORDER BY c.name
        """,
        project_id,
    )

    categories = []
    for row in rows:
        budgeted = float(row["budgeted_amount"])
        actual = float(row["actual_spent"])
        spend_percent = round((actual / budgeted) * 100, 1) if budgeted else None
        categories.append({
            "category_id": row["category_id"],
            "name": row["name"],
            "budgeted_amount": budgeted,
            "committed_amount": float(row["committed_amount"]),
            "actual_spent": actual,
            "spend_percent": spend_percent,
            "budget_item_count": row["budget_item_count"],
        })

    return {"categories": categories}

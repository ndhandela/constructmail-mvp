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

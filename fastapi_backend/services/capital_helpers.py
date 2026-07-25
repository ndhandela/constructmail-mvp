async def get_project_budget_summary(conn, project_id: int) -> dict:
    """Project-wide budgeted/committed/actual totals across every work
    item's budget_items. Pulled out of routers/capital.py so future
    features (milestone-linked draw schedules, admin reporting) can call
    the same computation instead of re-deriving it inline."""
    row = await conn.fetchrow(
        """SELECT COALESCE(SUM(budgeted_amount), 0) AS total_budgeted,
                  COALESCE(SUM(committed_amount), 0) AS total_committed,
                  COALESCE(SUM(actual_spent), 0) AS total_actual
           FROM budget_items WHERE project_id = $1""",
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
        """SELECT wi.id AS work_item_id, wi.name, wi.status AS work_item_status,
                  wi.percent_complete,
                  COALESCE(SUM(bi.budgeted_amount), 0) AS budgeted_amount,
                  COALESCE(SUM(bi.committed_amount), 0) AS committed_amount,
                  COALESCE(SUM(bi.actual_spent), 0) AS actual_spent,
                  COUNT(bi.id) AS budget_item_count
           FROM work_items wi
           LEFT JOIN budget_items bi ON bi.work_item_id = wi.id
           WHERE wi.project_id = $1
           GROUP BY wi.id, wi.name, wi.status, wi.percent_complete
           ORDER BY wi.sequence NULLS LAST, wi.id""",
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
        """SELECT c.id AS category_id, c.name,
                  COALESCE(SUM(bi.budgeted_amount), 0) AS budgeted_amount,
                  COALESCE(SUM(bi.committed_amount), 0) AS committed_amount,
                  COALESCE(SUM(bi.actual_spent), 0) AS actual_spent,
                  COUNT(bi.id) AS budget_item_count
           FROM categories c
           LEFT JOIN budget_items bi ON bi.category_id = c.id
           WHERE c.project_id = $1
           GROUP BY c.id, c.name
           ORDER BY c.name""",
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

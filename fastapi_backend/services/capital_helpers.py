async def get_project_budget_summary(conn, project_id: int) -> dict:
    """Aggregates budget_items into project-level totals and a per-category
    breakdown. Pulled out of routers/capital.py so future features (milestone-
    linked draw schedules, admin reporting) can call the same computation
    instead of re-deriving it inline."""
    rows = await conn.fetch(
        """SELECT category, budgeted_amount, committed_amount, actual_spent
           FROM budget_items WHERE project_id = $1 ORDER BY category""",
        project_id,
    )

    categories = []
    total_budgeted = total_committed = total_actual = 0
    for row in rows:
        budgeted = float(row["budgeted_amount"])
        committed = float(row["committed_amount"])
        actual = float(row["actual_spent"])
        total_budgeted += budgeted
        total_committed += committed
        total_actual += actual
        categories.append({
            "category": row["category"],
            "budgeted_amount": budgeted,
            "committed_amount": committed,
            "actual_spent": actual,
            "variance": budgeted - actual,
        })

    return {
        "total_budgeted": total_budgeted,
        "total_committed": total_committed,
        "total_actual": total_actual,
        "variance": total_budgeted - total_actual,
        "categories": categories,
    }

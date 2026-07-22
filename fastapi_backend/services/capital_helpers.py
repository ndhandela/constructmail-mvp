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


async def get_project_progress_summary(conn, project_id: int) -> dict:
    """Per-category work_items rollup (% complete, by count) joined against
    the same budget figures get_project_budget_summary already computes —
    this is the "60% done but 85% spent" view: budget alone can't tell you
    whether spend is tracking ahead of or behind physical progress."""
    rows = await conn.fetch(
        """SELECT bi.id AS budget_item_id, bi.category, bi.budgeted_amount,
                  bi.committed_amount, bi.actual_spent,
                  wi.status AS work_item_status, wi.percent_complete
           FROM budget_items bi
           LEFT JOIN work_items wi ON wi.budget_item_id = bi.id
           WHERE bi.project_id = $1
           ORDER BY bi.category""",
        project_id,
    )

    by_category: dict[int, dict] = {}
    for row in rows:
        cat = by_category.setdefault(row["budget_item_id"], {
            "budget_item_id": row["budget_item_id"],
            "category": row["category"],
            "budgeted_amount": float(row["budgeted_amount"]),
            "committed_amount": float(row["committed_amount"]),
            "actual_spent": float(row["actual_spent"]),
            "work_item_count": 0,
            "complete_count": 0,
            "_percent_total": 0.0,
        })
        if row["work_item_status"] is not None:
            cat["work_item_count"] += 1
            cat["_percent_total"] += float(row["percent_complete"])
            if row["work_item_status"] == "complete":
                cat["complete_count"] += 1

    categories = []
    for cat in by_category.values():
        count = cat.pop("work_item_count")
        percent_total = cat.pop("_percent_total")
        cat["work_item_count"] = count
        cat["percent_complete"] = round(percent_total / count, 1) if count else None
        spend_pct = (
            round((cat["actual_spent"] / cat["budgeted_amount"]) * 100, 1)
            if cat["budgeted_amount"] else None
        )
        cat["spend_percent"] = spend_pct
        categories.append(cat)

    return {"categories": categories}

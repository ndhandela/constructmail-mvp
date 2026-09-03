"""
THE ONE INTEGRATION POINT between Orders and Stock.

record_receipt() is the entire surface area of contact between the two
modules. It is called from exactly one place — routers/orders.py, when a
vendor order transitions to 'received' — and it is the only function in the
codebase that reads Orders data and writes Stock data (or vice versa).

Contract:
  * Does nothing unless the order's company has the 'stock' feature flag
    enabled. A company with Orders but not Stock sees no effect at all.
  * Matches each order line's item_description against inventory_items.name
    on the SAME project, case-insensitively and trimmed. No fuzzy matching.
  * For every match, writes ONE 'in' inventory_transaction (qty = the line's
    qty, source_order_id = the order id) and refreshes that item's
    last_known_unit_cost from the line's unit_cost.
  * Hands every UNMATCHED line back to the caller in the return value —
    routers/orders.py surfaces them in the mark-received response so the
    user knows which lines didn't land in inventory, rather than silently
    dropping them.
  * Idempotent: if 'in' rows already exist for this order (a double
    receive), it writes nothing more and reports them as already recorded.

To remove the Orders<->Stock coupling entirely: delete this file and the
single `await record_receipt(...)` call in routers/orders.py's
mark-received handler. Nothing else references either side of it.
"""
from services.access_control import is_feature_enabled


async def record_receipt(conn, order_row) -> dict:
    """order_row is a plain orders table row (asyncpg Record / dict-like).
    Returns {stock_enabled, matched: [...], unmatched: [...],
    already_recorded: bool}."""
    result = {"stock_enabled": False, "matched": [], "unmatched": [], "already_recorded": False}

    company_id = await conn.fetchval(
        "SELECT company_id FROM projects WHERE id = $1", order_row["project_id"]
    )
    if not await is_feature_enabled(conn, company_id, "stock"):
        return result
    result["stock_enabled"] = True

    existing = await conn.fetchval(
        "SELECT 1 FROM inventory_transactions WHERE source_order_id = $1 LIMIT 1",
        order_row["id"],
    )
    if existing:
        result["already_recorded"] = True
        return result

    lines = await conn.fetch(
        "SELECT * FROM order_line_items WHERE order_id = $1 ORDER BY id",
        order_row["id"],
    )
    if not lines:
        return result

    inv_items = await conn.fetch(
        "SELECT id, name FROM inventory_items WHERE project_id = $1",
        order_row["project_id"],
    )
    by_name = {row["name"].strip().lower(): row["id"] for row in inv_items}

    logged_by = order_row["purchased_by_user_id"] or order_row["created_by"]

    for line in lines:
        key = (line["item_description"] or "").strip().lower()
        item_id = by_name.get(key)
        if not item_id:
            result["unmatched"].append({
                "item_description": line["item_description"],
                "qty": line["qty"],
                "unit": line["unit"],
            })
            continue

        txn = await conn.fetchrow(
            """INSERT INTO inventory_transactions
                   (inventory_item_id, type, qty, source_order_id, logged_by_user_id, notes)
               VALUES ($1, 'in', $2, $3, $4, $5)
               RETURNING id""",
            item_id, line["qty"], order_row["id"], logged_by,
            f"Received against order #{order_row['id']}",
        )
        # Keep reorder suggestions costed off the most recent real purchase.
        if line["unit_cost"] and line["unit_cost"] > 0:
            await conn.execute(
                "UPDATE inventory_items SET last_known_unit_cost = $2, updated_at = NOW() WHERE id = $1",
                item_id, line["unit_cost"],
            )
        result["matched"].append({
            "inventory_item_id": item_id,
            "item_description": line["item_description"],
            "qty": line["qty"],
            "transaction_id": txn["id"],
        })

    return result

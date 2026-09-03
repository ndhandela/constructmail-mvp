"""
Helpers for POMAR Stock (routers/stock.py).

The one rule that matters: an inventory item's on-hand quantity is ALWAYS
computed by summing inventory_transactions — 'in' adds qty, 'out' subtracts
qty, 'adjustment' adds qty as a signed correction. There is no stored
current-stock column anywhere, and nothing in this module or in
services/receipt_integration.py ever writes one.

needs_reorder is on_hand < reorder_threshold. The red/amber/green dot the
list view shows is derived the same way (stock_status below) so the two
never disagree.

Access mirrors routers/capital.py / services/order_helpers.py: reads require
project membership, writes require the company owner or this project's own
'owner' member role. Stock shares no code with Orders beyond neither — this
file is a sibling of order_helpers.py, not a dependency of it.
"""
from decimal import Decimal

from fastapi import HTTPException

# 'in' adds, 'out' subtracts, 'adjustment' is a signed correction (a
# recount of -3 is stored as qty = -3 and added as-is).
ON_HAND_EXPR = """
    COALESCE(SUM(
        CASE t.type
            WHEN 'in' THEN t.qty
            WHEN 'out' THEN -t.qty
            WHEN 'adjustment' THEN t.qty
            ELSE 0
        END
    ), 0)
"""

TRANSACTION_TYPES = ("in", "out", "adjustment")


async def require_project_member(conn, project_id: int, user_id: int):
    member = await conn.fetchrow(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if not member:
        raise HTTPException(403, "You do not have access to this project")
    return member


async def require_project_owner(conn, project_id: int, user_id: int):
    user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", user_id)
    if user and user["permission_level"] == "owner":
        return
    member = await require_project_member(conn, project_id, user_id)
    if member["role"] != "owner":
        raise HTTPException(403, "Only the project owner can manage Stock")


def stock_status(on_hand: Decimal, reorder_threshold: Decimal) -> str:
    on_hand = Decimal(on_hand or 0)
    reorder_threshold = Decimal(reorder_threshold or 0)
    if on_hand <= 0:
        return "red"
    if on_hand < reorder_threshold:
        return "amber"
    return "green"


def _decorate(row) -> dict:
    d = dict(row)
    on_hand = Decimal(d.pop("on_hand", 0) or 0)
    threshold = Decimal(d["reorder_threshold"] or 0)
    d["on_hand"] = on_hand
    d["needs_reorder"] = on_hand < threshold
    d["stock_status"] = stock_status(on_hand, threshold)
    return d


async def get_inventory_item(conn, item_id: int):
    row = await conn.fetchrow(
        f"""SELECT i.*, {ON_HAND_EXPR} AS on_hand
            FROM inventory_items i
            LEFT JOIN inventory_transactions t ON t.inventory_item_id = i.id
            WHERE i.id = $1
            GROUP BY i.id""",
        item_id,
    )
    return _decorate(row) if row else None


async def get_inventory_items(conn, project_id: int) -> list:
    rows = await conn.fetch(
        f"""SELECT i.*, {ON_HAND_EXPR} AS on_hand
            FROM inventory_items i
            LEFT JOIN inventory_transactions t ON t.inventory_item_id = i.id
            WHERE i.project_id = $1
            GROUP BY i.id
            ORDER BY i.name""",
        project_id,
    )
    return [_decorate(r) for r in rows]


async def get_reorder_suggestions(conn, project_id: int) -> list:
    """Every item currently below its reorder threshold, with the suggested
    top-up: reorder_qty units at last_known_unit_cost each."""
    suggestions = []
    for item in await get_inventory_items(conn, project_id):
        if not item["needs_reorder"]:
            continue
        reorder_qty = Decimal(item["reorder_qty"] or 0)
        unit_cost = Decimal(item["last_known_unit_cost"] or 0)
        suggestions.append({
            "inventory_item_id": item["id"],
            "name": item["name"],
            "unit": item["unit"],
            "on_hand": item["on_hand"],
            "reorder_threshold": Decimal(item["reorder_threshold"] or 0),
            "suggested_qty": reorder_qty,
            "suggested_unit_cost": unit_cost,
            "suggested_cost": reorder_qty * unit_cost,
        })
    return suggestions


async def get_transactions(conn, item_id: int) -> list:
    rows = await conn.fetch(
        """SELECT t.*, u.name AS logged_by_name
           FROM inventory_transactions t
           LEFT JOIN users u ON u.id = t.logged_by_user_id
           WHERE t.inventory_item_id = $1
           ORDER BY t.created_at DESC, t.id DESC""",
        item_id,
    )
    return [dict(r) for r in rows]

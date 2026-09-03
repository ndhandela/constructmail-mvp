"""
Helpers for POMAR Orders (routers/orders.py).

Two things live here that the router leans on heavily:

1.  Order totals are never stored. get_order_total() sums
    order_line_items.line_total for an order every time it's needed, and the
    router recomputes each line's line_total (= qty * unit_cost) on write.

2.  The committed-vs-actual budget split. Unlike Invoice Tracker (which folds
    invoices into the budget rollup at read time via a CTE), Orders mutates
    budget_items.committed_amount / actual_spent directly:

      vendor order, status draft|sent   -> its total sits in committed_amount
      vendor order, status received|closed -> its total sits in actual_spent
      direct purchase, status logged    -> its total sits in actual_spent
      anything else / no budget_item_id -> no budget footprint

    _budget_footprint() returns the (committed, actual) pair an order
    currently contributes. The router, inside one transaction, calls
    remove_budget_effect() with the pre-change row, makes the change, then
    add_budget_effect() with the post-change row — so an edit that moves a
    line item, flips the type, retargets budget_item_id, or advances status
    all stay consistent with a single pattern.

Access mirrors routers/capital.py exactly: reads require project membership,
writes require the company owner or this project's own 'owner' member role.
"""
from decimal import Decimal

from fastapi import HTTPException

VENDOR_STATUS_FLOW = ["draft", "sent", "received", "closed"]
DIRECT_STATUS_FLOW = ["draft", "logged"]

ORDER_COLUMNS = """
    o.id, o.project_id, o.work_item_id, o.order_type, o.vendor_id,
    o.vendor_name_freetext, o.purchased_by_user_id, o.purchase_date,
    o.status, o.budget_item_id, o.notes, o.attachment_url, o.created_by,
    o.created_at, o.updated_at
"""


async def require_project_member(conn, project_id: int, user_id: int):
    member = await conn.fetchrow(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if not member:
        raise HTTPException(403, "You do not have access to this project")
    return member


async def require_project_owner(conn, project_id: int, user_id: int):
    """A write requires the caller to be either the company owner or this
    specific project's owner — same gating as routers/capital.py."""
    user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", user_id)
    if user and user["permission_level"] == "owner":
        return
    member = await require_project_member(conn, project_id, user_id)
    if member["role"] != "owner":
        raise HTTPException(403, "Only the project owner can manage Orders")


async def require_work_item_in_project(conn, work_item_id: int, project_id: int):
    row = await conn.fetchrow(
        "SELECT id FROM work_items WHERE id = $1 AND project_id = $2",
        work_item_id, project_id,
    )
    if not row:
        raise HTTPException(404, "Work item not found on this project")


async def require_budget_item_in_project(conn, budget_item_id: int, project_id: int):
    row = await conn.fetchrow(
        "SELECT id FROM budget_items WHERE id = $1 AND project_id = $2",
        budget_item_id, project_id,
    )
    if not row:
        raise HTTPException(404, "Budget item not found on this project")


async def require_vendor_exists(conn, vendor_id: int):
    row = await conn.fetchrow("SELECT id FROM vendors WHERE id = $1", vendor_id)
    if not row:
        raise HTTPException(404, "Vendor not found")


def status_flow_for(order_type: str) -> list:
    return DIRECT_STATUS_FLOW if order_type == "direct" else VENDOR_STATUS_FLOW


# ── Totals ───────────────────────────────────────────────────────────────

async def get_order_total(conn, order_id: int) -> Decimal:
    """SUM(line_total) for this order — the order's total is ALWAYS this,
    never a stored column."""
    value = await conn.fetchval(
        "SELECT COALESCE(SUM(line_total), 0) FROM order_line_items WHERE order_id = $1",
        order_id,
    )
    return Decimal(value or 0)


# ── Budget footprint ─────────────────────────────────────────────────────

def _budget_footprint(order_row, total: Decimal):
    """(committed_delta, actual_delta) this order currently contributes to
    its linked budget_item. (0, 0) when it has no budget_item_id or its
    type/status combination carries no footprint (e.g. a direct purchase
    still in 'draft')."""
    if not order_row["budget_item_id"]:
        return Decimal(0), Decimal(0)
    total = Decimal(total or 0)
    if order_row["order_type"] == "vendor":
        if order_row["status"] in ("draft", "sent"):
            return total, Decimal(0)
        if order_row["status"] in ("received", "closed"):
            return Decimal(0), total
    elif order_row["order_type"] == "direct":
        if order_row["status"] == "logged":
            return Decimal(0), total
    return Decimal(0), Decimal(0)


async def _apply_budget_delta(conn, budget_item_id, committed_delta: Decimal, actual_delta: Decimal):
    if not budget_item_id or (committed_delta == 0 and actual_delta == 0):
        return
    await conn.execute(
        """UPDATE budget_items
           SET committed_amount = committed_amount + $2,
               actual_spent = actual_spent + $3,
               updated_at = NOW()
           WHERE id = $1""",
        budget_item_id, committed_delta, actual_delta,
    )


async def add_budget_effect(conn, order_row, total: Decimal):
    committed, actual = _budget_footprint(order_row, total)
    await _apply_budget_delta(conn, order_row["budget_item_id"], committed, actual)


async def remove_budget_effect(conn, order_row, total: Decimal):
    committed, actual = _budget_footprint(order_row, total)
    await _apply_budget_delta(conn, order_row["budget_item_id"], -committed, -actual)


# ── Serialization ────────────────────────────────────────────────────────

async def serialize_order(conn, order_row, include_line_items: bool = True) -> dict:
    d = dict(order_row)

    vendor_display = order_row["vendor_name_freetext"]
    if order_row["vendor_id"]:
        vendor_display = await conn.fetchval(
            "SELECT name FROM vendors WHERE id = $1", order_row["vendor_id"]
        ) or vendor_display
    d["vendor_display_name"] = vendor_display

    d["work_item_name"] = await conn.fetchval(
        "SELECT name FROM work_items WHERE id = $1", order_row["work_item_id"]
    )
    d["purchased_by_name"] = None
    if order_row["purchased_by_user_id"]:
        d["purchased_by_name"] = await conn.fetchval(
            "SELECT name FROM users WHERE id = $1", order_row["purchased_by_user_id"]
        )
    d["created_by_name"] = await conn.fetchval(
        "SELECT name FROM users WHERE id = $1", order_row["created_by"]
    )

    if order_row["budget_item_id"]:
        bi = await conn.fetchrow(
            """SELECT c.name AS category_name, wi.name AS work_item_name
               FROM budget_items bi
               JOIN categories c ON c.id = bi.category_id
               JOIN work_items wi ON wi.id = bi.work_item_id
               WHERE bi.id = $1""",
            order_row["budget_item_id"],
        )
        d["budget_item_label"] = (
            f"{bi['work_item_name']} · {bi['category_name']}" if bi else None
        )
    else:
        d["budget_item_label"] = None

    if include_line_items:
        lines = await conn.fetch(
            "SELECT * FROM order_line_items WHERE order_id = $1 ORDER BY id",
            order_row["id"],
        )
        d["line_items"] = [dict(r) for r in lines]

    d["total"] = await get_order_total(conn, order_row["id"])
    return d

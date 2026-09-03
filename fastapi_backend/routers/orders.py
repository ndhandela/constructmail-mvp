"""
POMAR Orders — lightweight procurement tracking per project.

An order is either a *vendor order* (order_type='vendor': you're about to buy
something from a sub/supplier — flows draft -> sent -> received -> closed) or
a *direct purchase* (order_type='direct': someone already bought it, you're
just recording it — flows draft -> logged, no "sent" state).

Budget effect (see services/order_helpers.py for the full rules):
  * a vendor order in draft/sent adds its total to the linked
    budget_item's committed_amount
  * marking it received moves that total from committed_amount to actual_spent
  * a direct purchase adds straight to actual_spent when logged, and never
    touches committed_amount

Order total is never stored — it's always SUM(order_line_items.line_total).

Gated entirely by the 'orders' feature flag. Independent of Capital Tracker's
'capital' flag: this router has its own work-item / budget-item picker
endpoints (same approach routers/invoices.py takes) so Orders works with
Capital Tracker's UI disabled — it only needs the underlying work_items /
budget_items rows to exist. Independent of Stock's 'stock' flag too: the only
Stock contact is the single record_receipt() call in mark_received below.
"""
import logging
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.access_control import require_feature_flag
from services.order_helpers import (
    ORDER_COLUMNS,
    add_budget_effect,
    get_order_total,
    remove_budget_effect,
    require_budget_item_in_project,
    require_project_member,
    require_project_owner,
    require_vendor_exists,
    require_work_item_in_project,
    serialize_order,
    status_flow_for,
)
from services.receipt_integration import record_receipt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders", tags=["Orders"])

ORDER_TYPES = ("vendor", "direct")


def _dec(value) -> Decimal:
    return Decimal(str(value if value is not None else 0))


class LineItemInput(BaseModel):
    item_description: str
    qty: float = 0
    unit: Optional[str] = None
    unit_cost: float = 0


class CreateOrderRequest(BaseModel):
    userId: int
    work_item_id: int
    order_type: str = "vendor"
    vendor_id: Optional[int] = None
    vendor_name_freetext: Optional[str] = None
    purchased_by_user_id: Optional[int] = None
    purchase_date: Optional[date] = None
    status: Optional[str] = None
    budget_item_id: Optional[int] = None
    notes: Optional[str] = None
    attachment_url: Optional[str] = None
    line_items: List[LineItemInput] = []


class UpdateOrderRequest(BaseModel):
    userId: int
    work_item_id: Optional[int] = None
    order_type: Optional[str] = None
    vendor_id: Optional[int] = None
    vendor_name_freetext: Optional[str] = None
    purchased_by_user_id: Optional[int] = None
    purchase_date: Optional[date] = None
    status: Optional[str] = None
    budget_item_id: Optional[int] = None
    notes: Optional[str] = None
    attachment_url: Optional[str] = None
    # Sentinel: absent means "leave line items alone"; present (even []) means
    # "replace the whole set with this".
    line_items: Optional[List[LineItemInput]] = None


class LineItemRequest(BaseModel):
    userId: int
    item_description: str
    qty: float = 0
    unit: Optional[str] = None
    unit_cost: float = 0


class MarkReceivedRequest(BaseModel):
    userId: int
    purchase_date: Optional[date] = None


class SimpleUserRequest(BaseModel):
    userId: int


# ── helpers ──────────────────────────────────────────────────────────────

async def _load_order_or_404(conn, order_id: int):
    row = await conn.fetchrow(
        f"SELECT {ORDER_COLUMNS} FROM orders o WHERE o.id = $1", order_id
    )
    if not row:
        raise HTTPException(404, "Order not found")
    return row


def _normalize_identity(order_type: str, vendor_id, vendor_name_freetext):
    """A vendor order keeps vendor_id and drops the free-text name; a direct
    purchase keeps the free-text 'purchased from' and drops vendor_id."""
    if order_type == "direct":
        return None, (vendor_name_freetext or None)
    return vendor_id, None


async def _replace_line_items(conn, order_id: int, line_items: List[LineItemInput]):
    await conn.execute("DELETE FROM order_line_items WHERE order_id = $1", order_id)
    for li in line_items:
        desc = (li.item_description or "").strip()
        if not desc:
            raise HTTPException(400, "Every line item needs a description")
        qty, unit_cost = _dec(li.qty), _dec(li.unit_cost)
        await conn.execute(
            """INSERT INTO order_line_items (order_id, item_description, qty, unit, unit_cost, line_total)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            order_id, desc, qty, (li.unit or "").strip() or None, unit_cost, qty * unit_cost,
        )


# ── list / filter ────────────────────────────────────────────────────────

@router.get("")
async def list_orders(
    userId: int,
    project_id: int,
    work_item_id: Optional[int] = None,
    vendor_id: Optional[int] = None,
    status: Optional[str] = None,
    order_type: Optional[str] = None,
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "orders")
        await require_project_member(conn, project_id, userId)

        clauses = ["o.project_id = $1"]
        params = [project_id]
        for value, column in (
            (work_item_id, "o.work_item_id"),
            (vendor_id, "o.vendor_id"),
            (status, "o.status"),
            (order_type, "o.order_type"),
        ):
            if value is not None:
                params.append(value)
                clauses.append(f"{column} = ${len(params)}")

        rows = await conn.fetch(
            f"""SELECT {ORDER_COLUMNS} FROM orders o
                WHERE {' AND '.join(clauses)}
                ORDER BY o.created_at DESC, o.id DESC""",
            *params,
        )
        orders = [await serialize_order(conn, r) for r in rows]

    return {"success": True, "orders": orders}


# ── pickers (gated by 'orders', not 'capital') ───────────────────────────

@router.get("/projects/{project_id}/work-items")
async def list_work_items_for_orders(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "orders")
        await require_project_member(conn, project_id, userId)
        rows = await conn.fetch(
            "SELECT id, name, status FROM work_items WHERE project_id = $1 ORDER BY sequence NULLS LAST, id",
            project_id,
        )
    return {"success": True, "work_items": [dict(r) for r in rows]}


@router.get("/projects/{project_id}/budget-items")
async def list_budget_items_for_orders(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "orders")
        await require_project_member(conn, project_id, userId)
        rows = await conn.fetch(
            """SELECT bi.id, c.name AS category_name, wi.name AS work_item_name
               FROM budget_items bi
               JOIN categories c ON c.id = bi.category_id
               JOIN work_items wi ON wi.id = bi.work_item_id
               WHERE bi.project_id = $1
               ORDER BY wi.sequence NULLS LAST, wi.id, c.name""",
            project_id,
        )
    return {
        "success": True,
        "budget_items": [
            {"id": r["id"], "label": f"{r['work_item_name']} · {r['category_name']}"}
            for r in rows
        ],
    }


@router.get("/projects/{project_id}/vendors")
async def list_vendors_for_orders(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "orders")
        await require_project_member(conn, project_id, userId)
        rows = await conn.fetch(
            """SELECT v.id, v.name, v.trade
               FROM project_vendors pv
               JOIN vendors v ON v.id = pv.vendor_id
               WHERE pv.project_id = $1
               ORDER BY v.name""",
            project_id,
        )
    return {"success": True, "vendors": [dict(r) for r in rows]}


# ── CRUD ─────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}")
async def create_order(project_id: int, req: CreateOrderRequest):
    if req.order_type not in ORDER_TYPES:
        raise HTTPException(400, "order_type must be 'vendor' or 'direct'")

    flow = status_flow_for(req.order_type)
    status = req.status or "draft"
    if status == "received":
        raise HTTPException(400, "Use the mark-received action to receive a vendor order")
    if status not in flow:
        raise HTTPException(400, f"status must be one of {flow}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "orders")
        project = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")
        await require_project_owner(conn, project_id, req.userId)
        await require_work_item_in_project(conn, req.work_item_id, project_id)
        if req.budget_item_id is not None:
            await require_budget_item_in_project(conn, req.budget_item_id, project_id)
        vendor_id, vendor_freetext = _normalize_identity(
            req.order_type, req.vendor_id, req.vendor_name_freetext
        )
        if vendor_id is not None:
            await require_vendor_exists(conn, vendor_id)

        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO orders
                       (project_id, work_item_id, order_type, vendor_id, vendor_name_freetext,
                        purchased_by_user_id, purchase_date, status, budget_item_id, notes,
                        attachment_url, created_by)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                   RETURNING id""",
                project_id, req.work_item_id, req.order_type, vendor_id, vendor_freetext,
                req.purchased_by_user_id, req.purchase_date, status, req.budget_item_id,
                (req.notes or "").strip() or None, (req.attachment_url or "").strip() or None,
                req.userId,
            )
            await _replace_line_items(conn, row["id"], req.line_items)
            order_row = await _load_order_or_404(conn, row["id"])
            await add_budget_effect(conn, order_row, await get_order_total(conn, row["id"]))
            result = await serialize_order(conn, order_row)

    return {"success": True, "order": result}


@router.get("/{order_id}")
async def get_order(order_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        order_row = await _load_order_or_404(conn, order_id)
        await require_feature_flag(conn, userId, "orders")
        await require_project_member(conn, order_row["project_id"], userId)
        result = await serialize_order(conn, order_row)
    return {"success": True, "order": result}


@router.patch("/{order_id}")
async def update_order(order_id: int, req: UpdateOrderRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        order_row = await _load_order_or_404(conn, order_id)
        await require_feature_flag(conn, req.userId, "orders")
        await require_project_owner(conn, order_row["project_id"], req.userId)
        project_id = order_row["project_id"]

        new_type = req.order_type or order_row["order_type"]
        if new_type not in ORDER_TYPES:
            raise HTTPException(400, "order_type must be 'vendor' or 'direct'")

        if req.status is not None:
            if req.status == "received":
                raise HTTPException(400, "Use the mark-received action to receive a vendor order")
            if req.status not in status_flow_for(new_type):
                raise HTTPException(400, f"status must be one of {status_flow_for(new_type)}")
            if order_row["status"] == "received" and req.status != "closed":
                raise HTTPException(400, "A received order can only move to 'closed'")

        if req.work_item_id is not None:
            await require_work_item_in_project(conn, req.work_item_id, project_id)
        if req.budget_item_id is not None:
            await require_budget_item_in_project(conn, req.budget_item_id, project_id)

        provided = req.model_dump(exclude_unset=True, exclude={"userId", "line_items"})
        merged = dict(order_row)
        merged.update(provided)
        merged["order_type"] = new_type
        merged["vendor_id"], merged["vendor_name_freetext"] = _normalize_identity(
            new_type, merged.get("vendor_id"), merged.get("vendor_name_freetext")
        )
        if merged["vendor_id"] is not None and merged["vendor_id"] != order_row["vendor_id"]:
            await require_vendor_exists(conn, merged["vendor_id"])

        async with conn.transaction():
            await remove_budget_effect(conn, order_row, await get_order_total(conn, order_id))

            await conn.execute(
                """UPDATE orders SET
                       work_item_id = $2, order_type = $3, vendor_id = $4,
                       vendor_name_freetext = $5, purchased_by_user_id = $6,
                       purchase_date = $7, status = $8, budget_item_id = $9,
                       notes = $10, attachment_url = $11, updated_at = NOW()
                   WHERE id = $1""",
                order_id, merged["work_item_id"], merged["order_type"], merged["vendor_id"],
                merged["vendor_name_freetext"], merged["purchased_by_user_id"],
                merged["purchase_date"], merged["status"], merged["budget_item_id"],
                merged["notes"], merged["attachment_url"],
            )

            if req.line_items is not None:
                await _replace_line_items(conn, order_id, req.line_items)

            new_row = await _load_order_or_404(conn, order_id)
            await add_budget_effect(conn, new_row, await get_order_total(conn, order_id))
            result = await serialize_order(conn, new_row)

    return {"success": True, "order": result}


@router.delete("/{order_id}")
async def delete_order(order_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        order_row = await _load_order_or_404(conn, order_id)
        await require_feature_flag(conn, userId, "orders")
        await require_project_owner(conn, order_row["project_id"], userId)

        async with conn.transaction():
            await remove_budget_effect(conn, order_row, await get_order_total(conn, order_id))
            await conn.execute("DELETE FROM orders WHERE id = $1", order_id)

    return {"success": True}


# ── line items ───────────────────────────────────────────────────────────

@router.post("/{order_id}/line-items")
async def add_line_item(order_id: int, req: LineItemRequest):
    desc = (req.item_description or "").strip()
    if not desc:
        raise HTTPException(400, "Description is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        order_row = await _load_order_or_404(conn, order_id)
        await require_feature_flag(conn, req.userId, "orders")
        await require_project_owner(conn, order_row["project_id"], req.userId)

        qty, unit_cost = _dec(req.qty), _dec(req.unit_cost)
        async with conn.transaction():
            await remove_budget_effect(conn, order_row, await get_order_total(conn, order_id))
            await conn.execute(
                """INSERT INTO order_line_items (order_id, item_description, qty, unit, unit_cost, line_total)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                order_id, desc, qty, (req.unit or "").strip() or None, unit_cost, qty * unit_cost,
            )
            await add_budget_effect(conn, order_row, await get_order_total(conn, order_id))
            result = await serialize_order(conn, order_row)

    return {"success": True, "order": result}


@router.patch("/line-items/{line_id}")
async def update_line_item(line_id: int, req: LineItemRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        line = await conn.fetchrow("SELECT * FROM order_line_items WHERE id = $1", line_id)
        if not line:
            raise HTTPException(404, "Line item not found")
        order_row = await _load_order_or_404(conn, line["order_id"])
        await require_feature_flag(conn, req.userId, "orders")
        await require_project_owner(conn, order_row["project_id"], req.userId)

        desc = (req.item_description or "").strip()
        if not desc:
            raise HTTPException(400, "Description is required")
        qty, unit_cost = _dec(req.qty), _dec(req.unit_cost)
        async with conn.transaction():
            await remove_budget_effect(conn, order_row, await get_order_total(conn, order_row["id"]))
            await conn.execute(
                """UPDATE order_line_items
                   SET item_description = $2, qty = $3, unit = $4, unit_cost = $5, line_total = $6
                   WHERE id = $1""",
                line_id, desc, qty, (req.unit or "").strip() or None, unit_cost, qty * unit_cost,
            )
            await add_budget_effect(conn, order_row, await get_order_total(conn, order_row["id"]))
            result = await serialize_order(conn, order_row)

    return {"success": True, "order": result}


@router.delete("/line-items/{line_id}")
async def delete_line_item(line_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        line = await conn.fetchrow("SELECT * FROM order_line_items WHERE id = $1", line_id)
        if not line:
            raise HTTPException(404, "Line item not found")
        order_row = await _load_order_or_404(conn, line["order_id"])
        await require_feature_flag(conn, userId, "orders")
        await require_project_owner(conn, order_row["project_id"], userId)

        async with conn.transaction():
            await remove_budget_effect(conn, order_row, await get_order_total(conn, order_row["id"]))
            await conn.execute("DELETE FROM order_line_items WHERE id = $1", line_id)
            await add_budget_effect(conn, order_row, await get_order_total(conn, order_row["id"]))
            result = await serialize_order(conn, order_row)

    return {"success": True, "order": result}


# ── mark received (vendor orders only) ───────────────────────────────────

@router.post("/{order_id}/mark-received")
async def mark_received(order_id: int, req: MarkReceivedRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        order_row = await _load_order_or_404(conn, order_id)
        await require_feature_flag(conn, req.userId, "orders")
        await require_project_owner(conn, order_row["project_id"], req.userId)

        if order_row["order_type"] != "vendor":
            raise HTTPException(400, "Only vendor orders can be marked received")
        if order_row["status"] not in ("draft", "sent"):
            raise HTTPException(400, f"An order in '{order_row['status']}' can't be marked received")

        async with conn.transaction():
            await remove_budget_effect(conn, order_row, await get_order_total(conn, order_id))
            await conn.execute(
                """UPDATE orders SET status = 'received',
                       purchase_date = COALESCE($2, purchase_date, CURRENT_DATE),
                       updated_at = NOW()
                   WHERE id = $1""",
                order_id, req.purchase_date,
            )
            new_row = await _load_order_or_404(conn, order_id)
            await add_budget_effect(conn, new_row, await get_order_total(conn, order_id))

            # THE integration point — the only Orders<->Stock contact.
            receipt = await record_receipt(conn, new_row)
            result = await serialize_order(conn, new_row)

    return {"success": True, "order": result, "receipt": receipt}

"""
POMAR Stock — lightweight per-project inventory.

An inventory_item carries only its reorder settings and last known unit cost.
Its on-hand quantity is ALWAYS computed by summing inventory_transactions
(see services/stock_helpers.ON_HAND_EXPR) — there is no stored stock column,
here or anywhere.

Transactions are logged manually (usage = 'out', starting stock = 'in', a
recount correction = 'adjustment' with a signed qty) OR written by
services/receipt_integration.record_receipt() when a vendor order is
received (type 'in', source_order_id set). This router never calls into
Orders; that direction of the coupling lives entirely in Orders'
mark-received handler.

Gated entirely by the 'stock' feature flag, independent of both 'orders' and
'capital'.
"""
import logging
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.access_control import is_feature_enabled, require_feature_flag
from services.stock_helpers import (
    TRANSACTION_TYPES,
    get_inventory_item,
    get_inventory_items,
    get_reorder_suggestions,
    get_transactions,
    require_project_member,
    require_project_owner,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stock", tags=["Stock"])


def _dec(value) -> Decimal:
    return Decimal(str(value if value is not None else 0))


class CreateItemRequest(BaseModel):
    userId: int
    name: str
    unit: Optional[str] = None
    reorder_threshold: float = 0
    reorder_qty: float = 0
    last_known_unit_cost: float = 0


class UpdateItemRequest(BaseModel):
    userId: int
    name: Optional[str] = None
    unit: Optional[str] = None
    reorder_threshold: Optional[float] = None
    reorder_qty: Optional[float] = None
    last_known_unit_cost: Optional[float] = None


class LogTransactionRequest(BaseModel):
    userId: int
    type: str
    qty: float
    notes: Optional[str] = None


@router.get("")
async def list_inventory_items(userId: int, project_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "stock")
        await require_project_member(conn, project_id, userId)
        items = await get_inventory_items(conn, project_id)
        # Does the "Create Order" affordance on the reorder card render? Only
        # if this company also has Orders. Stock stays fully usable without it.
        company_id = await conn.fetchval("SELECT company_id FROM users WHERE id = $1", userId)
        orders_enabled = await is_feature_enabled(conn, company_id, "orders")
    return {"success": True, "items": items, "orders_enabled": orders_enabled}


@router.get("/projects/{project_id}/reorder-suggestions")
async def reorder_suggestions(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "stock")
        await require_project_member(conn, project_id, userId)
        suggestions = await get_reorder_suggestions(conn, project_id)
        company_id = await conn.fetchval("SELECT company_id FROM users WHERE id = $1", userId)
        orders_enabled = await is_feature_enabled(conn, company_id, "orders")
    return {"success": True, "suggestions": suggestions, "orders_enabled": orders_enabled}


@router.post("/projects/{project_id}")
async def create_inventory_item(project_id: int, req: CreateItemRequest):
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(400, "Name is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "stock")
        project = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")
        await require_project_owner(conn, project_id, req.userId)

        row = await conn.fetchrow(
            """INSERT INTO inventory_items
                   (project_id, name, unit, reorder_threshold, reorder_qty, last_known_unit_cost, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               RETURNING id""",
            project_id, name, (req.unit or "").strip() or None,
            _dec(req.reorder_threshold), _dec(req.reorder_qty), _dec(req.last_known_unit_cost),
            req.userId,
        )
        item = await get_inventory_item(conn, row["id"])

    return {"success": True, "item": item}


@router.get("/{item_id}")
async def get_item_detail(item_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await get_inventory_item(conn, item_id)
        if not item:
            raise HTTPException(404, "Inventory item not found")
        await require_feature_flag(conn, userId, "stock")
        await require_project_member(conn, item["project_id"], userId)
        transactions = await get_transactions(conn, item_id)

    return {"success": True, "item": item, "transactions": transactions}


@router.patch("/{item_id}")
async def update_inventory_item(item_id: int, req: UpdateItemRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        base = await conn.fetchrow("SELECT * FROM inventory_items WHERE id = $1", item_id)
        if not base:
            raise HTTPException(404, "Inventory item not found")
        await require_feature_flag(conn, req.userId, "stock")
        await require_project_owner(conn, base["project_id"], req.userId)

        fields, values = [], []
        for column in ("name", "unit", "reorder_threshold", "reorder_qty", "last_known_unit_cost"):
            value = getattr(req, column)
            if value is None:
                continue
            if column in ("name", "unit"):
                value = (value or "").strip() or (None if column == "unit" else value)
                if column == "name" and not value:
                    raise HTTPException(400, "Name can't be blank")
            else:
                value = _dec(value)
            values.append(value)
            fields.append(f"{column} = ${len(values) + 1}")

        if fields:
            values_with_id = [item_id, *values]
            await conn.execute(
                f"UPDATE inventory_items SET {', '.join(fields)}, updated_at = NOW() WHERE id = $1",
                *values_with_id,
            )
        item = await get_inventory_item(conn, item_id)

    return {"success": True, "item": item}


@router.delete("/{item_id}")
async def delete_inventory_item(item_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        base = await conn.fetchrow("SELECT project_id FROM inventory_items WHERE id = $1", item_id)
        if not base:
            raise HTTPException(404, "Inventory item not found")
        await require_feature_flag(conn, userId, "stock")
        await require_project_owner(conn, base["project_id"], userId)
        # inventory_transactions cascade (FK ON DELETE CASCADE).
        await conn.execute("DELETE FROM inventory_items WHERE id = $1", item_id)

    return {"success": True}


@router.post("/{item_id}/transactions")
async def log_transaction(item_id: int, req: LogTransactionRequest):
    if req.type not in TRANSACTION_TYPES:
        raise HTTPException(400, f"type must be one of {list(TRANSACTION_TYPES)}")
    qty = _dec(req.qty)
    if req.type in ("in", "out") and qty <= 0:
        raise HTTPException(400, "qty must be greater than zero for an 'in' or 'out' transaction")
    if req.type == "adjustment" and qty == 0:
        raise HTTPException(400, "An adjustment of zero has no effect")

    pool = await get_pool()
    async with pool.acquire() as conn:
        base = await conn.fetchrow("SELECT project_id FROM inventory_items WHERE id = $1", item_id)
        if not base:
            raise HTTPException(404, "Inventory item not found")
        await require_feature_flag(conn, req.userId, "stock")
        await require_project_owner(conn, base["project_id"], req.userId)

        await conn.execute(
            """INSERT INTO inventory_transactions
                   (inventory_item_id, type, qty, logged_by_user_id, notes)
               VALUES ($1,$2,$3,$4,$5)""",
            item_id, req.type, qty, req.userId, (req.notes or "").strip() or None,
        )
        item = await get_inventory_item(conn, item_id)
        transactions = await get_transactions(conn, item_id)

    return {"success": True, "item": item, "transactions": transactions}

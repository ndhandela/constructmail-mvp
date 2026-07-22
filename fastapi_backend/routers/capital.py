"""
POMAR Capital Tracker — budget-vs-actual tracking per project.

Unlike Trust, this module has no region restriction and no project concept
of its own: budget_items hangs directly off the generic `projects` table, so
access follows the same project_members membership every other module
(Mail/Clash/Vendors) already uses. The only extra gate is the 'capital'
feature flag, checked on every route via services/access_control.py.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.access_control import require_feature_flag
from services.capital_helpers import get_project_budget_summary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/capital", tags=["Capital Tracker"])


class CreateBudgetItemRequest(BaseModel):
    userId: int
    category: str
    budgeted_amount: float = 0
    committed_amount: float = 0
    actual_spent: float = 0
    notes: Optional[str] = None


class UpdateBudgetItemRequest(BaseModel):
    userId: int
    committed_amount: Optional[float] = None
    actual_spent: Optional[float] = None
    notes: Optional[str] = None


async def _require_project_member(conn, project_id: int, user_id: int):
    member = await conn.fetchrow(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if not member:
        raise HTTPException(403, "You do not have access to this project")
    return member


async def _require_project_owner(conn, project_id: int, user_id: int):
    """A budget_item write requires the caller to be either the company
    owner or this specific project's owner — matches the ownership gating
    in routers/projects.py's create_project/_require_project_owner rather
    than opening writes to every contributor/viewer on the project."""
    user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", user_id)
    if user and user["permission_level"] == "owner":
        return
    member = await _require_project_member(conn, project_id, user_id)
    if member["role"] != "owner":
        raise HTTPException(403, "Only the project owner can manage budget items")


@router.get("/projects")
async def list_capital_projects(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")

        rows = await conn.fetch(
            """SELECT p.id, p.name, p.project_number, p.client_name, p.status, pm.role AS member_role
               FROM projects p
               JOIN project_members pm ON pm.project_id = p.id
               WHERE pm.user_id = $1
               ORDER BY p.created_at""",
            userId,
        )

        projects = []
        for row in rows:
            project = dict(row)
            project["budget_summary"] = await get_project_budget_summary(conn, project["id"])
            projects.append(project)

    return {"success": True, "projects": projects}


@router.get("/projects/{project_id}/items")
async def list_budget_items(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")
        await _require_project_member(conn, project_id, userId)

        rows = await conn.fetch(
            "SELECT * FROM budget_items WHERE project_id = $1 ORDER BY category",
            project_id,
        )
        summary = await get_project_budget_summary(conn, project_id)

    return {"success": True, "items": [dict(r) for r in rows], "budget_summary": summary}


@router.post("/projects/{project_id}/items")
async def create_budget_item(project_id: int, req: CreateBudgetItemRequest):
    if not req.category or not req.category.strip():
        raise HTTPException(400, "Category is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "capital")

        project = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        await _require_project_owner(conn, project_id, req.userId)

        row = await conn.fetchrow(
            """INSERT INTO budget_items (project_id, category, budgeted_amount, committed_amount, actual_spent, notes)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *""",
            project_id, req.category.strip(), req.budgeted_amount, req.committed_amount,
            req.actual_spent, req.notes,
        )

    return {"success": True, "item": dict(row)}


@router.patch("/items/{item_id}")
async def update_budget_item(item_id: int, req: UpdateBudgetItemRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "capital")

        item = await conn.fetchrow("SELECT project_id FROM budget_items WHERE id = $1", item_id)
        if not item:
            raise HTTPException(404, "Budget item not found")

        await _require_project_owner(conn, item["project_id"], req.userId)

        fields, values = [], []
        if req.committed_amount is not None:
            values.append(req.committed_amount)
            fields.append(f"committed_amount = ${len(values)}")
        if req.actual_spent is not None:
            values.append(req.actual_spent)
            fields.append(f"actual_spent = ${len(values)}")
        if req.notes is not None:
            values.append(req.notes)
            fields.append(f"notes = ${len(values)}")

        if not fields:
            row = await conn.fetchrow("SELECT * FROM budget_items WHERE id = $1", item_id)
            return {"success": True, "item": dict(row)}

        fields.append("updated_at = NOW()")
        values.append(item_id)
        query = f"UPDATE budget_items SET {', '.join(fields)} WHERE id = ${len(values)} RETURNING *"
        row = await conn.fetchrow(query, *values)

    return {"success": True, "item": dict(row)}

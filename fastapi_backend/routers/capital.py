"""
POMAR Capital Tracker — budget-vs-actual tracking per project.

Since migration 013, work_items is the root entity: milestones and
budget_items each hang off a single work_item_id, and categories are
project-scoped tags shared across every work item (so the same category can
group budget_items under several different work items, enabling the
spend-by-category rollup below). Unlike Trust, this module has no region
restriction and no project concept of its own: everything FKs straight into
the generic `projects` table, so access follows the same project_members
membership every other module (Mail/Clash/Vendors) already uses. The only
extra gate is the 'capital' feature flag, checked on every route via
services/access_control.py.

Category endpoints live under /api/projects/{project_id}/categories (not
/api/capital/...) since categories are shared, reusable data — created once
per project and picked from a dropdown in both the milestone and budget item
forms, not a per-work-item concept.
"""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.access_control import require_feature_flag
from services.capital_helpers import (
    get_project_budget_summary,
    get_spend_by_category,
    get_spend_by_work_item,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/capital", tags=["Capital Tracker"])

# Categories + spend-by-category live under /api/projects/{project_id}/... —
# a separate router (same pattern as routers/marketplace.py's router +
# pages_router) since they're project-scoped rather than /api/capital-scoped.
project_router = APIRouter(prefix="/api/projects", tags=["Capital Tracker"])


class CreateCategoryRequest(BaseModel):
    userId: int
    name: str


class CreateBudgetItemRequest(BaseModel):
    userId: int
    work_item_id: int
    category_id: int
    budgeted_amount: float = 0
    committed_amount: float = 0
    actual_spent: float = 0
    notes: Optional[str] = None


class UpdateBudgetItemRequest(BaseModel):
    userId: int
    work_item_id: Optional[int] = None
    category_id: Optional[int] = None
    committed_amount: Optional[float] = None
    actual_spent: Optional[float] = None
    notes: Optional[str] = None


class CreateMilestoneRequest(BaseModel):
    userId: int
    work_item_id: int
    name: str
    target_date: Optional[date] = None
    actual_date: Optional[date] = None
    status: str = "not_started"
    risk_flag: bool = False
    risk_source: Optional[str] = None
    notes: Optional[str] = None


class UpdateMilestoneRequest(BaseModel):
    userId: int
    work_item_id: Optional[int] = None
    name: Optional[str] = None
    target_date: Optional[date] = None
    actual_date: Optional[date] = None
    status: Optional[str] = None
    risk_flag: Optional[bool] = None
    risk_source: Optional[str] = None
    notes: Optional[str] = None


class CreateWorkItemRequest(BaseModel):
    userId: int
    name: str
    status: str = "not_started"
    percent_complete: float = 0
    sequence: Optional[int] = None
    due_date: Optional[date] = None


class UpdateWorkItemRequest(BaseModel):
    userId: int
    name: Optional[str] = None
    status: Optional[str] = None
    percent_complete: Optional[float] = None
    sequence: Optional[int] = None
    due_date: Optional[date] = None


async def _require_project_member(conn, project_id: int, user_id: int):
    member = await conn.fetchrow(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if not member:
        raise HTTPException(403, "You do not have access to this project")
    return member


async def _require_project_owner(conn, project_id: int, user_id: int):
    """A write requires the caller to be either the company owner or this
    specific project's owner — matches the ownership gating in
    routers/projects.py's create_project/_require_project_owner rather than
    opening writes to every contributor/viewer on the project."""
    user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", user_id)
    if user and user["permission_level"] == "owner":
        return
    member = await _require_project_member(conn, project_id, user_id)
    if member["role"] != "owner":
        raise HTTPException(403, "Only the project owner can manage Capital Tracker data")


async def _require_work_item_in_project(conn, work_item_id: int, project_id: int):
    work_item = await conn.fetchrow(
        "SELECT id FROM work_items WHERE id = $1 AND project_id = $2",
        work_item_id, project_id,
    )
    if not work_item:
        raise HTTPException(404, "Work item not found on this project")


async def _require_category_in_project(conn, category_id: int, project_id: int):
    category = await conn.fetchrow(
        "SELECT id FROM categories WHERE id = $1 AND project_id = $2",
        category_id, project_id,
    )
    if not category:
        raise HTTPException(404, "Category not found on this project")


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


# ── Categories (project-scoped, shared across work items) ─────────────────

@project_router.get("/{project_id}/categories")
async def list_categories(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")
        await _require_project_member(conn, project_id, userId)

        rows = await conn.fetch(
            "SELECT * FROM categories WHERE project_id = $1 ORDER BY name",
            project_id,
        )

    return {"success": True, "categories": [dict(r) for r in rows]}


@project_router.post("/{project_id}/categories")
async def create_category(project_id: int, req: CreateCategoryRequest):
    if not req.name or not req.name.strip():
        raise HTTPException(400, "Name is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "capital")

        project = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        await _require_project_owner(conn, project_id, req.userId)

        existing = await conn.fetchrow(
            "SELECT * FROM categories WHERE project_id = $1 AND name = $2",
            project_id, req.name.strip(),
        )
        if existing:
            # Reuse rather than error — the shared category picker is meant
            # to let a caller "create inline" without first checking whether
            # the name already exists.
            return {"success": True, "category": dict(existing)}

        row = await conn.fetchrow(
            "INSERT INTO categories (project_id, name) VALUES ($1, $2) RETURNING *",
            project_id, req.name.strip(),
        )

    return {"success": True, "category": dict(row)}


# ── Spend rollups ───────────────────────────────────────────────────────

@project_router.get("/{project_id}/spend-by-category")
async def spend_by_category(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")
        await _require_project_member(conn, project_id, userId)

        result = await get_spend_by_category(conn, project_id)

    return {"success": True, **result}


@router.get("/projects/{project_id}/spend-by-work-item")
async def spend_by_work_item(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")
        await _require_project_member(conn, project_id, userId)

        result = await get_spend_by_work_item(conn, project_id)

    return {"success": True, **result}


# ── Budget items ────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/items")
async def list_budget_items(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")
        await _require_project_member(conn, project_id, userId)

        rows = await conn.fetch(
            """SELECT bi.*, c.name AS category_name, wi.name AS work_item_name
               FROM budget_items bi
               JOIN categories c ON c.id = bi.category_id
               JOIN work_items wi ON wi.id = bi.work_item_id
               WHERE bi.project_id = $1
               ORDER BY wi.sequence NULLS LAST, wi.id, c.name""",
            project_id,
        )
        summary = await get_project_budget_summary(conn, project_id)

    return {"success": True, "items": [dict(r) for r in rows], "budget_summary": summary}


@router.post("/projects/{project_id}/items")
async def create_budget_item(project_id: int, req: CreateBudgetItemRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "capital")

        project = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        await _require_project_owner(conn, project_id, req.userId)
        await _require_work_item_in_project(conn, req.work_item_id, project_id)
        await _require_category_in_project(conn, req.category_id, project_id)

        row = await conn.fetchrow(
            """INSERT INTO budget_items
                   (project_id, work_item_id, category_id, budgeted_amount, committed_amount, actual_spent, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *""",
            project_id, req.work_item_id, req.category_id, req.budgeted_amount,
            req.committed_amount, req.actual_spent, req.notes,
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
        project_id = item["project_id"]

        await _require_project_owner(conn, project_id, req.userId)

        if req.work_item_id is not None:
            await _require_work_item_in_project(conn, req.work_item_id, project_id)
        if req.category_id is not None:
            await _require_category_in_project(conn, req.category_id, project_id)

        fields, values = [], []
        for column in ("work_item_id", "category_id", "committed_amount", "actual_spent", "notes"):
            value = getattr(req, column)
            if value is not None:
                values.append(value)
                fields.append(f"{column} = ${len(values)}")

        if not fields:
            row = await conn.fetchrow("SELECT * FROM budget_items WHERE id = $1", item_id)
            return {"success": True, "item": dict(row)}

        fields.append("updated_at = NOW()")
        values.append(item_id)
        query = f"UPDATE budget_items SET {', '.join(fields)} WHERE id = ${len(values)} RETURNING *"
        row = await conn.fetchrow(query, *values)

    return {"success": True, "item": dict(row)}


# ── Milestones ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/milestones")
async def list_milestones(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")
        await _require_project_member(conn, project_id, userId)

        rows = await conn.fetch(
            """SELECT m.*, wi.name AS work_item_name
               FROM milestones m
               JOIN work_items wi ON wi.id = m.work_item_id
               WHERE m.project_id = $1
               ORDER BY wi.sequence NULLS LAST, wi.id, m.target_date NULLS LAST, m.id""",
            project_id,
        )

    return {"success": True, "milestones": [dict(r) for r in rows]}


@router.post("/projects/{project_id}/milestones")
async def create_milestone(project_id: int, req: CreateMilestoneRequest):
    if not req.name or not req.name.strip():
        raise HTTPException(400, "Name is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "capital")

        project = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        await _require_project_owner(conn, project_id, req.userId)
        await _require_work_item_in_project(conn, req.work_item_id, project_id)

        row = await conn.fetchrow(
            """INSERT INTO milestones (project_id, work_item_id, name, target_date, actual_date, status, risk_flag, risk_source, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING *""",
            project_id, req.work_item_id, req.name.strip(), req.target_date, req.actual_date,
            req.status, req.risk_flag, req.risk_source, req.notes,
        )

    return {"success": True, "milestone": dict(row)}


@router.patch("/milestones/{milestone_id}")
async def update_milestone(milestone_id: int, req: UpdateMilestoneRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "capital")

        milestone = await conn.fetchrow("SELECT project_id FROM milestones WHERE id = $1", milestone_id)
        if not milestone:
            raise HTTPException(404, "Milestone not found")
        project_id = milestone["project_id"]

        await _require_project_owner(conn, project_id, req.userId)

        if req.work_item_id is not None:
            await _require_work_item_in_project(conn, req.work_item_id, project_id)

        fields, values = [], []
        for column in ("work_item_id", "name", "target_date", "actual_date", "status", "risk_flag", "risk_source", "notes"):
            value = getattr(req, column)
            if value is not None:
                values.append(value)
                fields.append(f"{column} = ${len(values)}")

        if not fields:
            row = await conn.fetchrow("SELECT * FROM milestones WHERE id = $1", milestone_id)
            return {"success": True, "milestone": dict(row)}

        fields.append("updated_at = NOW()")
        values.append(milestone_id)
        query = f"UPDATE milestones SET {', '.join(fields)} WHERE id = ${len(values)} RETURNING *"
        row = await conn.fetchrow(query, *values)

    return {"success": True, "milestone": dict(row)}


# ── Work items ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/work-items")
async def list_work_items(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")
        await _require_project_member(conn, project_id, userId)

        rows = await conn.fetch(
            "SELECT * FROM work_items WHERE project_id = $1 ORDER BY sequence NULLS LAST, id",
            project_id,
        )

    return {"success": True, "work_items": [dict(r) for r in rows]}


@router.post("/projects/{project_id}/work-items")
async def create_work_item(project_id: int, req: CreateWorkItemRequest):
    if not req.name or not req.name.strip():
        raise HTTPException(400, "Name is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "capital")

        project = await conn.fetchrow("SELECT id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        await _require_project_owner(conn, project_id, req.userId)

        row = await conn.fetchrow(
            """INSERT INTO work_items (project_id, name, status, percent_complete, sequence, due_date)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *""",
            project_id, req.name.strip(), req.status, req.percent_complete, req.sequence, req.due_date,
        )

    return {"success": True, "work_item": dict(row)}


@router.patch("/work-items/{work_item_id}")
async def update_work_item(work_item_id: int, req: UpdateWorkItemRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "capital")

        work_item = await conn.fetchrow("SELECT project_id FROM work_items WHERE id = $1", work_item_id)
        if not work_item:
            raise HTTPException(404, "Work item not found")
        project_id = work_item["project_id"]

        await _require_project_owner(conn, project_id, req.userId)

        fields, values = [], []
        for column in ("name", "status", "percent_complete", "sequence", "due_date"):
            value = getattr(req, column)
            if value is not None:
                values.append(value)
                fields.append(f"{column} = ${len(values)}")

        if not fields:
            row = await conn.fetchrow("SELECT * FROM work_items WHERE id = $1", work_item_id)
            return {"success": True, "work_item": dict(row)}

        fields.append("updated_at = NOW()")
        values.append(work_item_id)
        query = f"UPDATE work_items SET {', '.join(fields)} WHERE id = ${len(values)} RETURNING *"
        row = await conn.fetchrow(query, *values)

    return {"success": True, "work_item": dict(row)}


@router.delete("/work-items/{work_item_id}")
async def delete_work_item(work_item_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")

        work_item = await conn.fetchrow("SELECT project_id FROM work_items WHERE id = $1", work_item_id)
        if not work_item:
            raise HTTPException(404, "Work item not found")

        await _require_project_owner(conn, work_item["project_id"], userId)

        # Cascades to this work item's milestones/budget_items (ON DELETE
        # CASCADE FKs — see db.py) and nulls the optional work_item_id tag on
        # any daily_logs/invoices rows that reference it (ON DELETE SET NULL).
        await conn.execute("DELETE FROM work_items WHERE id = $1", work_item_id)

    return {"success": True}

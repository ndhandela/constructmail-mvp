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
from services.capital_helpers import get_project_budget_summary, get_project_progress_summary

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


class CreateMilestoneRequest(BaseModel):
    userId: int
    name: str
    target_date: Optional[str] = None
    actual_date: Optional[str] = None
    status: str = "not_started"
    risk_flag: bool = False
    risk_source: Optional[str] = None
    notes: Optional[str] = None


class UpdateMilestoneRequest(BaseModel):
    userId: int
    name: Optional[str] = None
    target_date: Optional[str] = None
    actual_date: Optional[str] = None
    status: Optional[str] = None
    risk_flag: Optional[bool] = None
    risk_source: Optional[str] = None
    notes: Optional[str] = None


class CreateWorkItemRequest(BaseModel):
    userId: int
    name: str
    budget_item_id: Optional[int] = None
    milestone_id: Optional[int] = None
    status: str = "not_started"
    percent_complete: float = 0
    sequence: Optional[int] = None
    due_date: Optional[str] = None


class UpdateWorkItemRequest(BaseModel):
    userId: int
    name: Optional[str] = None
    budget_item_id: Optional[int] = None
    milestone_id: Optional[int] = None
    status: Optional[str] = None
    percent_complete: Optional[float] = None
    sequence: Optional[int] = None
    due_date: Optional[str] = None


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
        progress = await get_project_progress_summary(conn, project_id)

    progress_by_item = {c["budget_item_id"]: c for c in progress["categories"]}
    items = []
    for r in rows:
        item = dict(r)
        cat_progress = progress_by_item.get(item["id"])
        item["percent_complete"] = cat_progress["percent_complete"] if cat_progress else None
        item["spend_percent"] = cat_progress["spend_percent"] if cat_progress else None
        item["work_item_count"] = cat_progress["work_item_count"] if cat_progress else 0
        items.append(item)

    return {"success": True, "items": items, "budget_summary": summary}


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


# ── Milestones ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/milestones")
async def list_milestones(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "capital")
        await _require_project_member(conn, project_id, userId)

        rows = await conn.fetch(
            "SELECT * FROM milestones WHERE project_id = $1 ORDER BY target_date NULLS LAST, id",
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

        row = await conn.fetchrow(
            """INSERT INTO milestones (project_id, name, target_date, actual_date, status, risk_flag, risk_source, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *""",
            project_id, req.name.strip(), req.target_date, req.actual_date,
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

        await _require_project_owner(conn, milestone["project_id"], req.userId)

        fields, values = [], []
        for column in ("name", "target_date", "actual_date", "status", "risk_flag", "risk_source", "notes"):
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

        if req.budget_item_id is not None:
            budget_item = await conn.fetchrow(
                "SELECT id FROM budget_items WHERE id = $1 AND project_id = $2",
                req.budget_item_id, project_id,
            )
            if not budget_item:
                raise HTTPException(404, "Budget item not found on this project")

        if req.milestone_id is not None:
            milestone = await conn.fetchrow(
                "SELECT id FROM milestones WHERE id = $1 AND project_id = $2",
                req.milestone_id, project_id,
            )
            if not milestone:
                raise HTTPException(404, "Milestone not found on this project")

        row = await conn.fetchrow(
            """INSERT INTO work_items (project_id, budget_item_id, milestone_id, name, status, percent_complete, sequence, due_date)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *""",
            project_id, req.budget_item_id, req.milestone_id, req.name.strip(),
            req.status, req.percent_complete, req.sequence, req.due_date,
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

        if req.budget_item_id is not None:
            budget_item = await conn.fetchrow(
                "SELECT id FROM budget_items WHERE id = $1 AND project_id = $2",
                req.budget_item_id, project_id,
            )
            if not budget_item:
                raise HTTPException(404, "Budget item not found on this project")

        if req.milestone_id is not None:
            milestone = await conn.fetchrow(
                "SELECT id FROM milestones WHERE id = $1 AND project_id = $2",
                req.milestone_id, project_id,
            )
            if not milestone:
                raise HTTPException(404, "Milestone not found on this project")

        fields, values = [], []
        for column in ("name", "budget_item_id", "milestone_id", "status", "percent_complete", "sequence", "due_date"):
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

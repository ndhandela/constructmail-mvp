"""
POMAR Task Tracker — a simple, flat, assignable per-project task list. A
lightweight companion to Capital/Invoice/Permit Tracker, not a scheduling or
dependency system: no subtasks, no ordering, no due-date reminders — just
title/description/assignee/due date/status.

Access follows the same GC/Sub resolution as Permits/Documents (see
services/task_helpers.py), but unlike Permits there's no per-task grant
system — any project participant sees the full flat list. Write access is
narrower for a Sub than a GC (see task_helpers.require_can_modify_task /
require_can_delete_task).
"""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.task_helpers import (
    list_assignable_users_for_project,
    require_can_delete_task,
    require_can_modify_task,
    require_project_task_access,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tasks", tags=["Task Tracker"])

TASK_COLUMNS = """t.id, t.project_id, t.title, t.description, t.assigned_to,
                   au.name AS assigned_to_name, au.email AS assigned_to_email,
                   t.due_date, t.status, t.created_by, cu.name AS created_by_name,
                   t.created_at, t.updated_at"""

TASK_JOINS = """FROM tasks t
                 JOIN users cu ON cu.id = t.created_by
                 LEFT JOIN users au ON au.id = t.assigned_to"""


def _task_response(row, access, user_id: int) -> dict:
    d = dict(row)
    d["can_edit"] = access.is_gc or d["created_by"] == user_id or d["assigned_to"] == user_id
    d["can_delete"] = access.is_gc or d["created_by"] == user_id
    return d


async def _validate_assignee(conn, project_id: int, assigned_to: Optional[int]) -> None:
    if assigned_to is None:
        return
    candidates = await list_assignable_users_for_project(conn, project_id)
    if not any(c["id"] == assigned_to for c in candidates):
        raise HTTPException(400, "That user does not have access to this project")


@router.get("")
async def list_tasks(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_task_access(conn, userId, project_id)

        rows = await conn.fetch(
            f"""SELECT {TASK_COLUMNS} {TASK_JOINS}
                WHERE t.project_id = $1
                ORDER BY t.status ASC, t.due_date ASC NULLS LAST, t.created_at DESC""",
            project_id,
        )
        tasks = [_task_response(row, access, userId) for row in rows]
        assignable_users = await list_assignable_users_for_project(conn, project_id)

    return {
        "success": True,
        "tasks": tasks,
        "access_kind": access.kind,
        "is_gc": access.is_gc,
        "assignable_users": assignable_users,
    }


class CreateTaskRequest(BaseModel):
    userId: int
    title: str
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    due_date: Optional[date] = None


@router.post("/projects/{project_id}")
async def create_task(project_id: int, req: CreateTaskRequest):
    title = (req.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_project_task_access(conn, req.userId, project_id)
        await _validate_assignee(conn, project_id, req.assigned_to)

        row = await conn.fetchrow(
            """INSERT INTO tasks (project_id, title, description, assigned_to, due_date, created_by)
               VALUES ($1,$2,$3,$4,$5,$6)
               RETURNING id""",
            project_id, title, (req.description or "").strip() or None,
            req.assigned_to, req.due_date, req.userId,
        )
        row = await conn.fetchrow(f"SELECT {TASK_COLUMNS} {TASK_JOINS} WHERE t.id = $1", row["id"])
        task = _task_response(row, access, req.userId)

    return {"success": True, "task": task}


class UpdateTaskRequest(BaseModel):
    userId: int
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    due_date: Optional[date] = None
    status: Optional[str] = None


@router.patch("/{task_id}")
async def update_task(task_id: int, req: UpdateTaskRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        task = await conn.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
        if not task:
            raise HTTPException(404, "Task not found")

        access = await require_project_task_access(conn, req.userId, task["project_id"])
        require_can_modify_task(access, task, req.userId)

        updates = req.model_dump(exclude={"userId"}, exclude_unset=True)
        if "title" in updates:
            title = (updates["title"] or "").strip()
            if not title:
                raise HTTPException(400, "Title is required")
            updates["title"] = title
        if "description" in updates:
            updates["description"] = (updates["description"] or "").strip() or None
        if "assigned_to" in updates:
            await _validate_assignee(conn, task["project_id"], updates["assigned_to"])
        if "status" in updates and updates["status"] not in ("open", "done"):
            raise HTTPException(400, "status must be 'open' or 'done'")

        if not updates:
            row = task
        else:
            set_clause = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(updates.keys()))
            row = await conn.fetchrow(
                f"UPDATE tasks SET {set_clause}, updated_at = NOW() WHERE id = $1 RETURNING *",
                task_id, *updates.values(),
            )

        row = await conn.fetchrow(f"SELECT {TASK_COLUMNS} {TASK_JOINS} WHERE t.id = $1", row["id"])
        result = _task_response(row, access, req.userId)

    return {"success": True, "task": result}


@router.delete("/{task_id}")
async def delete_task(task_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        task = await conn.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
        if not task:
            raise HTTPException(404, "Task not found")

        access = await require_project_task_access(conn, userId, task["project_id"])
        require_can_delete_task(access, task, userId)

        await conn.execute("DELETE FROM tasks WHERE id = $1", task_id)

    return {"success": True}

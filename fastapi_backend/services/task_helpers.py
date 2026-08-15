"""
Access model for POMAR Task Tracker (routers/tasks.py).

Mirrors services/permit_helpers.py's GC/Sub resolution exactly: "GC on this
project" is never a stored role — it's resolved fresh on every request by
comparing the caller's company_id against projects.company_id, then falling
back to a project_members row (a teammate invited under a different
company_id) or an ACCEPTED project_vendor_access row (an outside sub).

Unlike Permits, Task Tracker has no per-record access-grant system: any
project participant — GC, a project_members teammate, or an accepted
project_vendor_access sub — sees the full flat task list for their project.
This is a lightweight shared list, not a document library with independent
visibility per row.

Write rules: a GC can create/edit/delete any task on their project. A Sub
can create tasks and edit (including toggling status) only the tasks they
created or are currently assigned to. Deleting is GC-only or the task's own
creator, so a Sub with edit access to their own task can't remove someone
else's.
"""
from fastapi import HTTPException

from services.access_control import require_feature_flag


class TaskAccess:
    __slots__ = ("kind", "company_id")

    def __init__(self, kind: str, company_id: int):
        self.kind = kind  # "gc" | "sub"
        self.company_id = company_id

    @property
    def is_gc(self) -> bool:
        return self.kind == "gc"


async def require_project_task_access(conn, user_id: int, project_id: int) -> TaskAccess:
    project = await conn.fetchrow("SELECT id, company_id FROM projects WHERE id = $1", project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    user = await conn.fetchrow("SELECT company_id FROM users WHERE id = $1", user_id)
    if not user or not user["company_id"]:
        raise HTTPException(403, "Your account isn't linked to a company")

    if user["company_id"] == project["company_id"]:
        await require_feature_flag(conn, user_id, "tasks")
        return TaskAccess("gc", user["company_id"])

    member = await conn.fetchrow(
        "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if member:
        await require_feature_flag(conn, user_id, "tasks")
        return TaskAccess("sub", user["company_id"])

    vendor = await conn.fetchrow(
        """SELECT 1 FROM project_vendor_access
           WHERE project_id = $1 AND vendor_user_id = $2 AND status = 'accepted'""",
        project_id, user_id,
    )
    if vendor:
        return TaskAccess("sub", user["company_id"])

    raise HTTPException(403, "You do not have access to this project")


def require_can_modify_task(access: TaskAccess, task, user_id: int) -> None:
    """GC can edit any task on their project. A Sub is limited to tasks they
    created or are assigned to — covers both field edits and the
    mark-complete status toggle, since both go through the same PATCH."""
    if access.is_gc:
        return
    if task["created_by"] == user_id or task["assigned_to"] == user_id:
        return
    raise HTTPException(403, "You can only edit tasks you created or are assigned to")


def require_can_delete_task(access: TaskAccess, task, user_id: int) -> None:
    if access.is_gc or task["created_by"] == user_id:
        return
    raise HTTPException(403, "Only the task's creator or the project's GC can delete it")


async def list_assignable_users_for_project(conn, project_id: int):
    """Candidates for the assignee picker: the project's own project_members
    (GC company teammates with project access) plus any Sub with an
    accepted project_vendor_access invite — the same two populations
    require_project_task_access resolves callers against, just listed out
    at user (not company) granularity, since a task is assigned to one
    person. LEFT JOIN companies since a freshly-invited sub is very often a
    lead account with no company_id yet."""
    rows = await conn.fetch(
        """SELECT u.id, u.name AS user_name, u.email, c.name AS company_name, 'member' AS kind
           FROM project_members pm
           JOIN users u ON u.id = pm.user_id
           LEFT JOIN companies c ON c.id = u.company_id
           WHERE pm.project_id = $1
           UNION
           SELECT u.id, u.name AS user_name, u.email, c.name AS company_name, 'sub' AS kind
           FROM project_vendor_access pva
           JOIN users u ON u.id = pva.vendor_user_id
           LEFT JOIN companies c ON c.id = u.company_id
           WHERE pva.project_id = $1 AND pva.status = 'accepted'
           ORDER BY company_name, user_name""",
        project_id,
    )
    return [dict(r) for r in rows]

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.project_helpers import get_or_create_default_project

router = APIRouter(prefix="/api/projects", tags=["Projects"])

# Roles allowed to create new projects. Ownership of a project is tied to a
# single user account (see projects.user_id), so only roles that plausibly
# hold the prime contract get to originate one.
PROJECT_CREATOR_ROLES = ("GC", "Owner")


class CreateProjectRequest(BaseModel):
    userId: int
    name: str
    project_number: Optional[str] = None
    client_name: Optional[str] = None


@router.get("")
async def get_projects(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await get_or_create_default_project(conn, userId)
        rows = await conn.fetch(
            """SELECT p.id, p.name, p.project_number, p.client_name, pm.role AS member_role
               FROM projects p
               JOIN project_members pm ON pm.project_id = p.id
               WHERE pm.user_id = $1
               ORDER BY p.created_at""",
            userId,
        )
    return {"success": True, "projects": [dict(r) for r in rows]}


@router.post("")
async def create_project(req: CreateProjectRequest):
    if not req.name or not req.name.strip():
        raise HTTPException(400, "Project name is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT role FROM users WHERE id = $1", req.userId)
        if not user:
            raise HTTPException(404, "User not found")
        if user["role"] not in PROJECT_CREATOR_ROLES:
            raise HTTPException(
                403,
                "Only General Contractors or Owners can create projects. "
                "Ask your GC or Owner to create the project and invite you.",
            )

        async with conn.transaction():
            project = await conn.fetchrow(
                """INSERT INTO projects (user_id, name, project_number, client_name)
                   VALUES ($1, $2, $3, $4)
                   RETURNING id, name, project_number, client_name""",
                req.userId, req.name.strip(), req.project_number, req.client_name,
            )
            await conn.execute(
                "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')",
                project["id"], req.userId,
            )

    return {"success": True, "project": dict(project)}

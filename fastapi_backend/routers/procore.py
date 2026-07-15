import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.procore_helpers import get_projects, create_rfi

router = APIRouter(prefix="/api/procore", tags=["Procore"])


class CreateRFIRequest(BaseModel):
    userId: str
    projectId: str
    rfiData: dict


class ProjectLinkRequest(BaseModel):
    projectId: int
    procoreProjectId: str


@router.get("/status")
async def procore_status(userId: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT access_token FROM procore_tokens WHERE user_id = $1", userId)
    return {"connected": row is not None}


@router.get("/projects")
async def procore_projects(userId: str):
    key = os.getenv("TOKEN_ENCRYPTION_KEY")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT pgp_sym_decrypt(access_token::bytea, $2) AS access_token FROM procore_tokens WHERE user_id = $1",
            userId, key,
        )
    if not row:
        raise HTTPException(401, "Procore not connected")
    projects = await get_projects(row["access_token"])
    return {"projects": projects}


@router.post("/create-rfi")
async def procore_create_rfi(req: CreateRFIRequest):
    key = os.getenv("TOKEN_ENCRYPTION_KEY")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT pgp_sym_decrypt(access_token::bytea, $2) AS access_token FROM procore_tokens WHERE user_id = $1",
            req.userId, key,
        )
    if not row:
        raise HTTPException(401, "Procore not connected")
    rfi = await create_rfi(row["access_token"], req.projectId, req.rfiData)
    return {"success": True, "rfi": rfi}


@router.delete("/disconnect")
async def procore_disconnect(userId: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM procore_tokens WHERE user_id = $1", userId)
    return {"success": True}


@router.get("/project-link")
async def get_project_link(projectId: int):
    """The Procore project this POMAR project is mapped to, if any — lets
    Clash's Procore picker pre-select/lock instead of asking every time."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT procore_project_id FROM project_procore_links WHERE project_id = $1",
            projectId,
        )
    return {"procoreProjectId": row["procore_project_id"] if row else None}


@router.post("/project-link")
async def set_project_link(req: ProjectLinkRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO project_procore_links (project_id, procore_project_id)
               VALUES ($1, $2)
               ON CONFLICT (project_id) DO UPDATE SET procore_project_id = EXCLUDED.procore_project_id""",
            req.projectId, req.procoreProjectId,
        )
    return {"success": True}

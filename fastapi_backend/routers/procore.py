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

"""
POMAR Daily Logs — per-project field logbook (crew, weather, delays,
materials, safety, site photos).

Same shape as Capital Tracker: daily_logs hangs directly off the generic
`projects` table, so access follows the same project_members membership
every other module (Mail/Clash/Vendors/Capital) already uses. No region
restriction. The only extra gate is the 'daily_logs' feature flag, checked
on every route via services/access_control.py.

Photos are uploaded synchronously on create, the same way Trust's upload
endpoint (routers/trust_uploads.py) pushes raw bytes to R2 before
responding — see services/r2_storage.py's daily-log-photos bucket.
"""

import logging
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from db import get_pool
from services import r2_storage
from services.access_control import require_feature_flag

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/daily-logs", tags=["Daily Logs"])

DELAY_CATEGORIES = ("weather", "material", "labor", "other")
PAGE_SIZE = 20
EDIT_WINDOW = timedelta(hours=48)


class UpdateLogRequest(BaseModel):
    userId: int
    weather: Optional[str] = None
    crew_count: Optional[int] = None
    work_performed: Optional[str] = None
    delays_notes: Optional[str] = None
    delay_category: Optional[str] = None
    materials_notes: Optional[str] = None
    safety_notes: Optional[str] = None


async def _require_project_member(conn, project_id: int, user_id: int):
    member = await conn.fetchrow(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if not member:
        raise HTTPException(403, "You do not have access to this project")
    return member


async def _require_can_edit_log(conn, log, user_id: int):
    """Mirrors capital.py's _require_project_owner shape, but the rule here
    is time-boxed rather than role-boxed: the logging user can edit within
    EDIT_WINDOW of log_date, company owners can always edit, and everyone
    else (including other project members) cannot — a field log is one
    person's on-the-day record, not a shared spreadsheet row."""
    user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", user_id)
    if user and user["permission_level"] == "owner":
        return
    await _require_project_member(conn, log["project_id"], user_id)
    if log["logged_by_user_id"] != user_id:
        raise HTTPException(403, "Only the logging user or a company owner can edit this log")
    if date.today() - log["log_date"] > timedelta(days=2):
        raise HTTPException(403, "This log is outside the 48-hour edit window")


async def _photo_response(photo) -> dict:
    p = dict(photo)
    p["url"] = await r2_storage.get_daily_log_photo_url(p["storage_path"])
    return p


@router.post("/projects/{project_id}/logs")
async def create_log(
    project_id: int,
    userId: int = Form(...),
    log_date: date = Form(...),
    weather: Optional[str] = Form(None),
    crew_count: Optional[int] = Form(None),
    work_performed: Optional[str] = Form(None),
    delays_notes: Optional[str] = Form(None),
    delay_category: Optional[str] = Form(None),
    materials_notes: Optional[str] = Form(None),
    safety_notes: Optional[str] = Form(None),
    photos: List[UploadFile] = File(default=[]),
):
    if delay_category and delay_category not in DELAY_CATEGORIES:
        raise HTTPException(400, f"delay_category must be one of {DELAY_CATEGORIES}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "daily_logs")

        project = await conn.fetchrow("SELECT id, company_id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        await _require_project_member(conn, project_id, userId)

        log = await conn.fetchrow(
            """INSERT INTO daily_logs (project_id, logged_by_user_id, log_date, weather, crew_count,
                                        work_performed, delays_notes, delay_category, materials_notes, safety_notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               RETURNING *""",
            project_id, userId, log_date, weather, crew_count,
            work_performed, delays_notes, delay_category, materials_notes, safety_notes,
        )
        log_id = log["id"]

        saved_photos = []
        for photo in photos:
            if not photo or not photo.filename:
                continue
            content = await photo.read()
            storage_path = await r2_storage.upload_daily_log_photo(
                project["company_id"], project_id, log_id, photo.filename, content,
            )
            row = await conn.fetchrow(
                """INSERT INTO daily_log_photos (daily_log_id, storage_path)
                   VALUES ($1,$2) RETURNING *""",
                log_id, storage_path,
            )
            saved_photos.append(await _photo_response(row))

    return {"success": True, "log": dict(log), "photos": saved_photos}


@router.get("/projects/{project_id}/logs")
async def list_logs(
    project_id: int,
    userId: int,
    page: int = 1,
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
):
    if page < 1:
        raise HTTPException(400, "page must be >= 1")

    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "daily_logs")
        await _require_project_member(conn, project_id, userId)

        conditions = ["project_id = $1"]
        params = [project_id]
        if from_ is not None:
            params.append(from_)
            conditions.append(f"log_date >= ${len(params)}")
        if to is not None:
            params.append(to)
            conditions.append(f"log_date <= ${len(params)}")

        where_clause = " AND ".join(conditions)
        offset = (page - 1) * PAGE_SIZE
        # Fetch one extra row to know whether another page follows, without
        # a separate COUNT(*) query — same "don't load everything" spirit as
        # not loading photos on this list view (see module docstring).
        params.append(PAGE_SIZE + 1)
        limit_param = len(params)
        params.append(offset)
        offset_param = len(params)

        rows = await conn.fetch(
            f"""SELECT * FROM daily_logs WHERE {where_clause}
                ORDER BY log_date DESC, id DESC
                LIMIT ${limit_param} OFFSET ${offset_param}""",
            *params,
        )

    has_more = len(rows) > PAGE_SIZE
    logs = [dict(r) for r in rows[:PAGE_SIZE]]
    return {"success": True, "logs": logs, "page": page, "page_size": PAGE_SIZE, "has_more": has_more}


@router.get("/logs/{log_id}")
async def get_log(log_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        log = await conn.fetchrow("SELECT * FROM daily_logs WHERE id = $1", log_id)
        if not log:
            raise HTTPException(404, "Log not found")

        await require_feature_flag(conn, userId, "daily_logs")
        await _require_project_member(conn, log["project_id"], userId)

        photo_rows = await conn.fetch(
            "SELECT * FROM daily_log_photos WHERE daily_log_id = $1 ORDER BY uploaded_at", log_id,
        )
        photos = [await _photo_response(p) for p in photo_rows]

    return {"success": True, "log": dict(log), "photos": photos}


@router.patch("/logs/{log_id}")
async def update_log(log_id: int, req: UpdateLogRequest):
    if req.delay_category and req.delay_category not in DELAY_CATEGORIES:
        raise HTTPException(400, f"delay_category must be one of {DELAY_CATEGORIES}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        log = await conn.fetchrow("SELECT * FROM daily_logs WHERE id = $1", log_id)
        if not log:
            raise HTTPException(404, "Log not found")

        await require_feature_flag(conn, req.userId, "daily_logs")
        await _require_can_edit_log(conn, log, req.userId)

        fields, values = [], []
        for column in ("weather", "crew_count", "work_performed", "delays_notes",
                        "delay_category", "materials_notes", "safety_notes"):
            value = getattr(req, column)
            if value is not None:
                values.append(value)
                fields.append(f"{column} = ${len(values)}")

        if not fields:
            return {"success": True, "log": dict(log)}

        fields.append("updated_at = NOW()")
        values.append(log_id)
        query = f"UPDATE daily_logs SET {', '.join(fields)} WHERE id = ${len(values)} RETURNING *"
        row = await conn.fetchrow(query, *values)

    return {"success": True, "log": dict(row)}


@router.delete("/logs/{log_id}/photos/{photo_id}")
async def delete_log_photo(log_id: int, photo_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        log = await conn.fetchrow("SELECT * FROM daily_logs WHERE id = $1", log_id)
        if not log:
            raise HTTPException(404, "Log not found")

        await require_feature_flag(conn, userId, "daily_logs")
        await _require_can_edit_log(conn, log, userId)

        photo = await conn.fetchrow(
            "SELECT id FROM daily_log_photos WHERE id = $1 AND daily_log_id = $2", photo_id, log_id,
        )
        if not photo:
            raise HTTPException(404, "Photo not found on this log")

        await conn.execute("DELETE FROM daily_log_photos WHERE id = $1", photo_id)

    return {"success": True}

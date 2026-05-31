import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.ai_helpers import summarize_email_thread, extract_action_items, detect_signals, process_meeting_notes

router = APIRouter(prefix="/api", tags=["AI"])


async def get_or_create_default_project(conn, user_id: int) -> int:
    row = await conn.fetchrow("SELECT id FROM projects WHERE user_id = $1 AND name = $2", user_id, "Default Project")
    if row:
        return row["id"]
    row = await conn.fetchrow("INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id", user_id, "Default Project")
    return row["id"]


class SummarizeRequest(BaseModel):
    emailText: str
    userId: int
    projectId: Optional[int] = None


class ExtractActionsRequest(BaseModel):
    emailText: str
    userId: int
    projectId: Optional[int] = None


class DetectSignalsRequest(BaseModel):
    emailText: str
    userId: int
    projectId: Optional[int] = None


class ProcessMeetingRequest(BaseModel):
    notesText: str
    userId: int
    projectId: Optional[int] = None


@router.post("/summarize")
async def summarize(req: SummarizeRequest):
    if not req.emailText.strip():
        raise HTTPException(400, "emailText required and cannot be empty")
    result = await summarize_email_thread(req.emailText)
    pool = await get_pool()
    async with pool.acquire() as conn:
        p_id = req.projectId or await get_or_create_default_project(conn, req.userId)
        row = await conn.fetchrow(
            "INSERT INTO email_threads (project_id, raw_text, summary, decisions) VALUES ($1,$2,$3,$4) RETURNING *",
            p_id, req.emailText, result["summary"], json.dumps(result.get("decisions")),
        )
    return {
        "id": row["id"],
        "summary": result["summary"],
        "decisions": result.get("decisions"),
        "open_items": result.get("open_items"),
        "key_people": result.get("key_people"),
    }


@router.post("/extract-actions")
async def extract_actions(req: ExtractActionsRequest):
    if not req.emailText.strip():
        raise HTTPException(400, "emailText required")
    actions = await extract_action_items(req.emailText)
    pool = await get_pool()
    async with pool.acquire() as conn:
        p_id = req.projectId or await get_or_create_default_project(conn, req.userId)
        saved = []
        for action in actions:
            row = await conn.fetchrow(
                "INSERT INTO action_items (project_id, description, assigned_to, due_date, source_type) VALUES ($1,$2,$3,$4,$5) RETURNING *",
                p_id, action["action"], action.get("assigned_to"), action.get("due_date"), "email",
            )
            saved.append(dict(row))
    return saved


@router.post("/process-meeting")
async def process_meeting(req: ProcessMeetingRequest):
    if not req.notesText.strip():
        raise HTTPException(400, "notesText required")
    result = await process_meeting_notes(req.notesText)
    pool = await get_pool()
    async with pool.acquire() as conn:
        p_id = req.projectId or await get_or_create_default_project(conn, req.userId)
        notes_row = await conn.fetchrow(
            "INSERT INTO meeting_notes (project_id, raw_text, attendees, decisions, action_items, open_issues, summary) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            p_id, req.notesText,
            json.dumps(result.get("attendees", [])),
            json.dumps(result.get("decisions", [])),
            json.dumps(result.get("action_items", [])),
            json.dumps(result.get("open_issues", [])),
            result.get("summary"),
        )
        saved_actions = []
        for action in result.get("action_items", []):
            row = await conn.fetchrow(
                "INSERT INTO action_items (project_id, description, assigned_to, due_date, source_type) VALUES ($1,$2,$3,$4,$5) RETURNING *",
                p_id, action["action"], action.get("owner"), action.get("due_date"), "meeting",
            )
            saved_actions.append(dict(row))
    return {
        "id": notes_row["id"],
        "attendees": result.get("attendees"),
        "decisions": result.get("decisions"),
        "action_items": saved_actions,
        "open_issues": result.get("open_issues"),
        "summary": result.get("summary"),
    }


@router.post("/detect-signals")
async def detect_signals_route(req: DetectSignalsRequest):
    if not req.emailText.strip():
        raise HTTPException(400, "emailText required")
    result = await detect_signals(req.emailText)
    pool = await get_pool()
    async with pool.acquire() as conn:
        p_id = req.projectId or await get_or_create_default_project(conn, req.userId)
        saved = []
        for signal in result.get("signals", []):
            if signal.get("confidence", 0) >= 0.5:
                row = await conn.fetchrow(
                    "INSERT INTO signals (project_id, raw_text, signal_type, confidence) VALUES ($1,$2,$3,$4) RETURNING *",
                    p_id, signal.get("excerpt"), signal.get("type"), signal.get("confidence"),
                )
                saved.append(dict(row))
    return saved


@router.get("/recent-summaries")
async def recent_summaries(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM email_threads WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1) ORDER BY created_at DESC LIMIT 5",
            userId,
        )
    return [dict(r) for r in rows]


@router.get("/open-actions")
async def open_actions(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM action_items WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1) AND status = 'open' ORDER BY due_date ASC LIMIT 10",
            userId,
        )
    return [dict(r) for r in rows]


@router.get("/recent-signals")
async def recent_signals(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM signals WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1) ORDER BY created_at DESC LIMIT 5",
            userId,
        )
    return [dict(r) for r in rows]

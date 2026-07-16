import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.ai_helpers import summarize_email_thread, extract_action_items, detect_signals, process_meeting_notes
from services.project_helpers import get_or_create_personal_mail_project, require_project_member
from services.access_control import require_module_access, require_feature_flag
from routers.connect import enqueue_mail_signal

router = APIRouter(prefix="/api", tags=["AI"])


class SummarizeRequest(BaseModel):
    emailText: str
    userId: int
    projectId: Optional[int] = None
    # Present only when this summarize call originated from a live inbox thread
    # selection (not pasted text) — required to file a draft_replies row.
    provider: Optional[str] = None
    threadId: Optional[str] = None
    sourceEmailId: Optional[str] = None


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


async def _maybe_create_draft_reply(conn, req: "SummarizeRequest", result: dict) -> Optional[str]:
    """File a pending_review draft_replies row if the thread came from a live inbox
    selection and Claude flagged it as needing a reply. Never sends anything."""
    if not (req.provider and req.threadId and req.sourceEmailId):
        return None
    if req.provider not in ("gmail", "outlook"):
        return None
    if not result.get("needs_reply") or not result.get("suggested_reply"):
        return None

    existing = await conn.fetchval(
        "SELECT id FROM draft_replies WHERE source_email_id = $1 AND status = 'pending_review'",
        req.sourceEmailId,
    )
    if existing:
        return str(existing)

    row = await conn.fetchrow(
        """INSERT INTO draft_replies (user_id, source_email_id, provider, thread_id, ai_generated_body)
           VALUES ($1, $2, $3, $4, $5) RETURNING id""",
        req.userId, req.sourceEmailId, req.provider, req.threadId, result["suggested_reply"],
    )
    return str(row["id"])


@router.post("/summarize")
async def summarize(req: SummarizeRequest):
    if not req.emailText.strip():
        raise HTTPException(400, "emailText required and cannot be empty")
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_module_access(conn, req.userId, "mail")
        await require_feature_flag(conn, req.userId, "mail_intelligence")
        result = await summarize_email_thread(req.emailText)
        if req.projectId:
            await require_project_member(conn, req.projectId, req.userId)
        p_id = req.projectId or await get_or_create_personal_mail_project(conn, req.userId)
        row = await conn.fetchrow(
            "INSERT INTO email_threads (project_id, raw_text, summary, decisions) VALUES ($1,$2,$3,$4) RETURNING *",
            p_id, req.emailText, result["summary"], json.dumps(result.get("decisions")),
        )
        draft_reply_id = await _maybe_create_draft_reply(conn, req, result)
    return {
        "id": row["id"],
        "summary": result["summary"],
        "decisions": result.get("decisions"),
        "open_items": result.get("open_items"),
        "key_people": result.get("key_people"),
        "draft_reply_id": draft_reply_id,
    }


@router.post("/extract-actions")
async def extract_actions(req: ExtractActionsRequest):
    if not req.emailText.strip():
        raise HTTPException(400, "emailText required")
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_module_access(conn, req.userId, "mail")
        actions = await extract_action_items(req.emailText)
        if req.projectId:
            await require_project_member(conn, req.projectId, req.userId)
        p_id = req.projectId or await get_or_create_personal_mail_project(conn, req.userId)
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
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_module_access(conn, req.userId, "mail")
        result = await process_meeting_notes(req.notesText)
        if req.projectId:
            await require_project_member(conn, req.projectId, req.userId)
        p_id = req.projectId or await get_or_create_personal_mail_project(conn, req.userId)
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
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_module_access(conn, req.userId, "mail")
        result = await detect_signals(req.emailText)
        if req.projectId:
            await require_project_member(conn, req.projectId, req.userId)
        p_id = req.projectId or await get_or_create_personal_mail_project(conn, req.userId)
        saved = []
        for signal in result.get("signals", []):
            if signal.get("confidence", 0) >= 0.5:
                row = await conn.fetchrow(
                    "INSERT INTO signals (project_id, raw_text, signal_type, confidence) VALUES ($1,$2,$3,$4) RETURNING *",
                    p_id, signal.get("excerpt"), signal.get("type"), signal.get("confidence"),
                )
                saved_row = dict(row)
                saved.append(saved_row)
                # Auto-enqueue RFI/Change Order signals into Connect queue
                await enqueue_mail_signal(saved_row, user_id=req.userId)
    return saved


@router.get("/recent-summaries")
async def recent_summaries(userId: int, projectId: Optional[int] = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if projectId:
            await require_project_member(conn, projectId, userId)
            rows = await conn.fetch(
                "SELECT * FROM email_threads WHERE project_id = $1 ORDER BY created_at DESC LIMIT 5",
                projectId,
            )
        else:
            rows = await conn.fetch(
                """SELECT et.* FROM email_threads et
                   WHERE et.project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)
                   ORDER BY et.created_at DESC LIMIT 5""",
                userId,
            )
    return [dict(r) for r in rows]


@router.get("/open-actions")
async def open_actions(userId: int, projectId: Optional[int] = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if projectId:
            await require_project_member(conn, projectId, userId)
            rows = await conn.fetch(
                "SELECT * FROM action_items WHERE project_id = $1 AND status = 'open' ORDER BY due_date ASC LIMIT 10",
                projectId,
            )
        else:
            rows = await conn.fetch(
                """SELECT ai.* FROM action_items ai
                   WHERE ai.project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)
                   AND ai.status = 'open' ORDER BY ai.due_date ASC LIMIT 10""",
                userId,
            )
    return [dict(r) for r in rows]


@router.get("/recent-signals")
async def recent_signals(userId: int, projectId: Optional[int] = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if projectId:
            await require_project_member(conn, projectId, userId)
            rows = await conn.fetch(
                "SELECT * FROM signals WHERE project_id = $1 ORDER BY created_at DESC LIMIT 5",
                projectId,
            )
        else:
            rows = await conn.fetch(
                """SELECT s.* FROM signals s
                   WHERE s.project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)
                   ORDER BY s.created_at DESC LIMIT 5""",
                userId,
            )
    return [dict(r) for r in rows]

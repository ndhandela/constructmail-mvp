import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Any
from db import get_pool
from services.clash_helpers import analyze_clash_report, draft_clash_rfi
from services.project_helpers import require_project_member
from services.access_control import require_module_access, require_feature_flag
from routers.connect import enqueue_clash_report


async def _require_module_if_numeric(conn, user_id: str, module: str):
    """clash_assignments/clash_reports carry userId as a legacy TEXT column (see
    _require_member_if_project_scoped below) — only real numeric user ids can be
    resolved to a company, so non-numeric legacy ids are let through unchecked."""
    if user_id and str(user_id).isdigit():
        await require_module_access(conn, int(user_id), module)


async def _require_member_if_project_scoped(conn, project_id: Optional[int], user_id: str):
    """clash_assignments/clash_reports carry userId as a legacy TEXT column, so
    membership can only be checked when it's actually a numeric user id."""
    if project_id is None:
        return
    if not user_id or not str(user_id).isdigit():
        raise HTTPException(403, "You do not have access to this project")
    await require_project_member(conn, project_id, int(user_id))


async def _resolve_project_or_require_one(conn, user_id: int) -> int:
    """
    When no projectId is passed, fall back to the user's most recent project
    instead of silently creating a "Default Project". Raises if they have none.
    """
    row = await conn.fetchrow(
        """SELECT p.id FROM projects p
           JOIN project_members pm ON pm.project_id = p.id
           WHERE pm.user_id = $1
           ORDER BY p.created_at DESC
           LIMIT 1""",
        user_id,
    )
    if not row:
        raise HTTPException(400, "Create a project first before using Clash.")
    return row["id"]

router = APIRouter(prefix="/api/clash", tags=["Clash"])


class AnalyzeRequest(BaseModel):
    userId: int
    summary: dict
    topClashes: list
    testName: str


class DraftRFIRequest(BaseModel):
    clashName: str
    status: str
    distance: str
    item1: dict
    item2: dict
    clashPoint: str
    discipline: str
    priority: str


class AssignmentRequest(BaseModel):
    userId: str
    projectKey: str
    projectId: Optional[int] = None
    clashName: str
    assignedTo: Optional[str] = None
    discipline: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "open"


class SaveReportRequest(BaseModel):
    userId: str
    testName: Optional[str] = "Clash Test"
    fileName: Optional[str] = "report.html"
    summary: Optional[dict] = None
    projectKey: Optional[str] = None
    projectId: Optional[int] = None


class AgendaPDFRequest(BaseModel):
    testName: Optional[str] = None
    fileName: Optional[str] = None
    clashes: Optional[List[Any]] = []
    assignments: Optional[List[Any]] = []


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_module_access(conn, req.userId, "clash")
        await require_feature_flag(conn, req.userId, "clash_detection")
    analysis = await analyze_clash_report(req.summary, req.topClashes, req.testName)
    return {"analysis": analysis}


@router.post("/draft-rfi")
async def draft_rfi(req: DraftRFIRequest):
    return await draft_clash_rfi(
        req.clashName, req.status, req.distance,
        req.item1, req.item2, req.clashPoint, req.discipline, req.priority
    )


@router.get("/assignments")
async def get_assignments(userId: str, projectKey: str, projectId: Optional[int] = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _require_member_if_project_scoped(conn, projectId, userId)
        if projectId:
            rows = await conn.fetch(
                "SELECT * FROM clash_assignments WHERE project_key = $1 AND project_id = $2",
                projectKey, projectId,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM clash_assignments WHERE user_id = $1 AND project_key = $2", userId, projectKey
            )
    return {"assignments": [dict(r) for r in rows]}


@router.post("/assignments")
async def save_assignment(req: AssignmentRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _require_module_if_numeric(conn, req.userId, "clash")
        await _require_member_if_project_scoped(conn, req.projectId, req.userId)
        project_id = req.projectId
        if project_id is None and req.userId and str(req.userId).isdigit():
            project_id = await _resolve_project_or_require_one(conn, int(req.userId))
        row = await conn.fetchrow(
            """INSERT INTO clash_assignments (user_id, project_key, project_id, clash_name, assigned_to, discipline, notes, status, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
               ON CONFLICT (user_id, project_key, clash_name)
               DO UPDATE SET project_id=$3, assigned_to=$5, discipline=$6, notes=$7, status=$8, updated_at=NOW()
               RETURNING *""",
            req.userId, req.projectKey, project_id, req.clashName,
            req.assignedTo, req.discipline, req.notes, req.status or "open",
        )
    return {"assignment": dict(row)}


@router.post("/reports")
async def save_report(req: SaveReportRequest):
    pool = await get_pool()
    summary = req.summary or {}
    async with pool.acquire() as conn:
        await _require_module_if_numeric(conn, req.userId, "clash")
        await _require_member_if_project_scoped(conn, req.projectId, req.userId)
        project_id = req.projectId
        if project_id is None and req.userId and str(req.userId).isdigit():
            project_id = await _resolve_project_or_require_one(conn, int(req.userId))
        row = await conn.fetchrow(
            """INSERT INTO clash_reports (user_id, test_name, file_name, total_clashes, new_clashes, active_clashes, reviewed_clashes, critical_clashes, high_clashes, project_key, project_id, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING *""",
            req.userId, req.testName, req.fileName,
            summary.get("total", 0), summary.get("New", 0), summary.get("Active", 0),
            summary.get("Reviewed", 0), summary.get("Critical", 0), summary.get("High", 0),
            req.projectKey, project_id,
        )
        report_row = dict(row)
    # Auto-enqueue high/critical clashes into Connect queue
    user_id = int(req.userId) if req.userId and str(req.userId).isdigit() else None
    await enqueue_clash_report(report_row, user_id=user_id)
    return {"report": report_row}


@router.get("/reports")
async def get_reports(userId: str, projectId: Optional[int] = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _require_member_if_project_scoped(conn, projectId, userId)
        if projectId:
            rows = await conn.fetch(
                "SELECT * FROM clash_reports WHERE project_id = $1 ORDER BY created_at DESC LIMIT 10",
                projectId,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM clash_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", userId
            )
    return {"reports": [dict(r) for r in rows]}


@router.post("/agenda-pdf")
async def agenda_pdf(req: AgendaPDFRequest):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.colors import HexColor

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        width, height = A4

        # Header
        c.setFillColor(HexColor("#0E1B2C"))
        c.rect(0, height - 80, width, 80, fill=1, stroke=0)
        c.setFillColor(HexColor("#FFFFFF"))
        c.setFont("Helvetica-Bold", 20)
        c.drawString(50, height - 30, "POMAR Clash")
        c.setFont("Helvetica", 10)
        c.drawString(50, height - 50, "BIM Coordination Meeting Agenda")

        # Title
        c.setFillColor(HexColor("#0E1B2C"))
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, height - 110, req.testName or "Clash Test")
        c.setFont("Helvetica", 9)
        c.setFillColor(HexColor("#475569"))
        c.drawString(50, height - 125, req.fileName or "")

        # Clash list
        assignment_map = {a.get("clash_name"): a for a in (req.assignments or [])}
        y = height - 160

        c.setFillColor(HexColor("#0E1B2C"))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(50, y, "CLASH")
        c.drawString(200, y, "SEVERITY")
        c.drawString(300, y, "STATUS")
        y -= 15

        def severity(dist):
            d = abs(dist or 0)
            if d >= 0.5: return "Critical", "#DC2626"
            if d >= 0.2: return "High", "#D97706"
            if d >= 0.05: return "Medium", "#2563EB"
            return "Low", "#475569"

        for clash in (req.clashes or []):
            if y < 80:
                c.showPage()
                y = height - 60
            sev_label, sev_color = severity(clash.get("distance", 0))
            a = assignment_map.get(clash.get("name", ""), {})
            c.setFillColor(HexColor("#0E1B2C"))
            c.setFont("Helvetica", 7)
            c.drawString(50, y, str(clash.get("name", ""))[:30])
            c.setFillColor(HexColor(sev_color))
            c.setFont("Helvetica-Bold", 7)
            c.drawString(200, y, sev_label)
            c.setFillColor(HexColor("#475569"))
            c.setFont("Helvetica", 7)
            c.drawString(300, y, str(a.get("status", "open")))
            y -= 14

        # Footer
        c.setFillColor(HexColor("#475569"))
        c.setFont("Helvetica", 7)
        c.drawCentredString(width / 2, 20, "POMAR Clash · TechDen Solutions · pomar.ai")
        c.save()
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=POMAR-Clash-Agenda.pdf"},
        )
    except Exception as e:
        raise HTTPException(500, str(e))

"""
POMAR Trust — change alerts and buyer notices.

Draft-then-review-then-send, same shape as routers/mail.py: draft-notice never
sends anything, it only stores a Claude-drafted notice body for review.
send-notice is the one user-triggered action that records proof-of-send —
there's no live delivery integration in v1, the user sends via their own
channel (WhatsApp/email/etc.) and pastes back a proof reference.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.trust_access import require_trust_role
from services.trust_ai import draft_buyer_notice
from services.user_service import log_trust_activity

router = APIRouter(prefix="/api/trust", tags=["Trust Alerts"])

REVIEW_ROLES = ("compliance_reviewer", "owner")
ANY_TRUST_ROLE = ("site_data", "compliance_reviewer", "owner")


async def _get_alert_or_404(conn, alert_id: int, company_id: int):
    alert = await conn.fetchrow(
        """SELECT tca.* FROM trust_change_alerts tca
           JOIN trust_projects tp ON tp.id = tca.project_id
           WHERE tca.id = $1 AND tp.company_id = $2""",
        alert_id, company_id,
    )
    if not alert:
        raise HTTPException(404, "Alert not found")
    return dict(alert)


@router.get("/projects/{project_id}/alerts")
async def list_alerts(project_id: int, userId: int, status: Optional[str] = "open"):
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_role(conn, userId, ANY_TRUST_ROLE)
        project = await conn.fetchrow(
            "SELECT id FROM trust_projects WHERE id = $1 AND company_id = $2", project_id, ctx["company_id"],
        )
        if not project:
            raise HTTPException(404, "Project not found")
        if status:
            rows = await conn.fetch(
                "SELECT * FROM trust_change_alerts WHERE project_id = $1 AND status = $2 ORDER BY detected_at DESC",
                project_id, status,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM trust_change_alerts WHERE project_id = $1 ORDER BY detected_at DESC", project_id,
            )
    return {"success": True, "alerts": [dict(r) for r in rows]}


class DraftNoticeRequest(BaseModel):
    userId: int


@router.post("/alerts/{alert_id}/draft-notice")
async def draft_notice(alert_id: int, req: DraftNoticeRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_role(conn, req.userId, REVIEW_ROLES)
        alert = await _get_alert_or_404(conn, alert_id, ctx["company_id"])
        extraction = None
        if alert.get("extraction_id"):
            extraction = await conn.fetchrow(
                "SELECT * FROM trust_extractions WHERE id = $1", alert["extraction_id"],
            )

        content = await draft_buyer_notice(alert, dict(extraction) if extraction else None)
        await conn.execute("UPDATE trust_change_alerts SET status = 'notice_drafted' WHERE id = $1", alert_id)

        await log_trust_activity(
            req.userId, ctx["company_id"], "notice_drafted", "trust_change_alerts", alert_id,
            {"project_id": alert["project_id"]},
        )

    return {"success": True, "alert_id": alert_id, "draft_content": content}


class SendNoticeRequest(BaseModel):
    userId: int
    unit_reference: str
    content: str
    proof_reference: str


@router.post("/alerts/{alert_id}/send-notice")
async def send_notice(alert_id: int, req: SendNoticeRequest):
    if not req.proof_reference.strip():
        raise HTTPException(400, "proof_reference is required — paste a screenshot filename, message ID, etc.")

    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_role(conn, req.userId, REVIEW_ROLES)
        alert = await _get_alert_or_404(conn, alert_id, ctx["company_id"])

        notice = await conn.fetchrow(
            """INSERT INTO trust_buyer_notices
                 (project_id, alert_id, unit_reference, notice_type, content, sent_by, delivery_status, proof_reference)
               VALUES ($1,$2,$3,'change_disclosure',$4,$5,'confirmed',$6)
               RETURNING *""",
            alert["project_id"], alert_id, req.unit_reference, req.content, req.userId, req.proof_reference.strip(),
        )
        await conn.execute("UPDATE trust_change_alerts SET status = 'resolved' WHERE id = $1", alert_id)

        await log_trust_activity(
            req.userId, ctx["company_id"], "notice_sent", "trust_buyer_notices", notice["id"],
            {"project_id": alert["project_id"], "alert_id": alert_id},
        )

    return {"success": True, "notice": dict(notice)}


class DismissAlertRequest(BaseModel):
    userId: int


@router.post("/alerts/{alert_id}/dismiss")
async def dismiss_alert(alert_id: int, req: DismissAlertRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_role(conn, req.userId, REVIEW_ROLES)
        alert = await _get_alert_or_404(conn, alert_id, ctx["company_id"])
        await conn.execute("UPDATE trust_change_alerts SET status = 'dismissed' WHERE id = $1", alert_id)
        await log_trust_activity(
            req.userId, ctx["company_id"], "alert_dismissed", "trust_change_alerts", alert_id,
            {"project_id": alert["project_id"]},
        )
    return {"success": True}


@router.get("/projects/{project_id}/audit-trail")
async def audit_trail(
    project_id: int, userId: int,
    notice_type: Optional[str] = None, delivery_status: Optional[str] = None,
    sort: str = "desc",
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        ctx = await require_trust_role(conn, userId, ANY_TRUST_ROLE)
        project = await conn.fetchrow(
            "SELECT id FROM trust_projects WHERE id = $1 AND company_id = $2", project_id, ctx["company_id"],
        )
        if not project:
            raise HTTPException(404, "Project not found")

        conditions = ["tbn.project_id = $1"]
        params = [project_id]
        p = 2
        if notice_type:
            conditions.append(f"tbn.notice_type = ${p}")
            params.append(notice_type)
            p += 1
        if delivery_status:
            conditions.append(f"tbn.delivery_status = ${p}")
            params.append(delivery_status)
            p += 1
        order = "DESC" if sort.lower() != "asc" else "ASC"

        rows = await conn.fetch(
            f"""SELECT tbn.*, tca.alert_type, tca.severity, u.email AS sent_by_email
                FROM trust_buyer_notices tbn
                LEFT JOIN trust_change_alerts tca ON tca.id = tbn.alert_id
                LEFT JOIN users u ON u.id = tbn.sent_by
                WHERE {' AND '.join(conditions)}
                ORDER BY tbn.sent_at {order}""",
            *params,
        )
    return {"success": True, "notices": [dict(r) for r in rows]}

"""
POMAR Connect V1
- Queue population (Mail signals, Clash reports, Vendor compliance daily job)
- REST endpoints: GET/PATCH/POST /api/connect/queue, GET /api/connect/log
- APScheduler daily vendor compliance job at 7:00 AM
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool
from services.project_helpers import require_project_member
from services.procore_helpers import create_rfi

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/connect", tags=["connect"])

# ── APScheduler (starts once on first router import) ─────────────────────────
scheduler = AsyncIOScheduler()


# ── Pydantic models ───────────────────────────────────────────────────────────

class StatusUpdate(BaseModel):
    status: str  # reviewed | pushed | dismissed


class PushRequest(BaseModel):
    user_id: Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _insert_queue_item(conn, *, module: str, type_: str, title: str,
                              detail: str, priority: str, source_id: str,
                              pmis_target: str, user_id: Optional[int],
                              project_id: Optional[int] = None):
    """Insert into connect_queue only if same source_id not already pending."""
    existing = await conn.fetchval(
        "SELECT id FROM connect_queue WHERE source_id=$1 AND status='pending'",
        source_id,
    )
    if existing:
        return None
    row = await conn.fetchrow(
        """INSERT INTO connect_queue
           (module, type, title, detail, priority, source_id, pmis_target, user_id, project_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *""",
        module, type_, title, detail, priority, source_id, pmis_target, user_id, project_id,
    )
    return dict(row)


async def _log_action(conn, *, queue_item_id, action: str, module: str,
                       status: str, error_message: Optional[str] = None,
                       user_id: Optional[int] = None, project_id: Optional[int] = None):
    await conn.execute(
        """INSERT INTO connect_log (queue_item_id, action, module, status, error_message, user_id, project_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
        queue_item_id, action, module, status, error_message, user_id, project_id,
    )


async def _get_procore_access_token(conn, user_id: Optional[int]) -> Optional[str]:
    """Same decrypt pattern routers/procore.py's own endpoints use — one
    access_token per user_id in procore_tokens, symmetrically encrypted with
    TOKEN_ENCRYPTION_KEY."""
    if not user_id:
        return None
    key = os.getenv("TOKEN_ENCRYPTION_KEY")
    row = await conn.fetchrow(
        "SELECT pgp_sym_decrypt(access_token::bytea, $2) AS access_token FROM procore_tokens WHERE user_id = $1",
        str(user_id), key,
    )
    return row["access_token"] if row else None


async def _get_procore_project_id(conn, project_id: Optional[int]) -> Optional[str]:
    """The POMAR project -> Procore project mapping already set up via
    GET/POST /api/procore/project-link (project_procore_links)."""
    if not project_id:
        return None
    row = await conn.fetchrow(
        "SELECT procore_project_id FROM project_procore_links WHERE project_id = $1",
        project_id,
    )
    return row["procore_project_id"] if row else None


# ── Task 2a: Mail → Queue (called from ai.py after signal detection) ──────────

async def enqueue_mail_signal(signal_row: dict, user_id: Optional[int] = None):
    """
    Call this after a signal row is saved to `signals`.
    signal_type: 'rfi' | 'change_order'
    """
    signal_type = signal_row.get("signal_type", "rfi").lower()
    if signal_type not in ("rfi", "change_order"):
        return
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _insert_queue_item(
            conn,
            module="mail",
            type_=signal_type,
            title=f"{'RFI' if signal_type == 'rfi' else 'Change Order'} signal detected in email",
            detail=signal_row.get("raw_text", ""),
            priority="high",
            source_id=str(signal_row["id"]),
            pmis_target="procore",
            user_id=user_id,
            project_id=signal_row.get("project_id"),
        )


# ── Task 2b: Clash → Queue (called from clash.py after report save) ───────────

async def enqueue_clash_report(report_row: dict, user_id: Optional[int] = None):
    """
    Call this after a clash_report row is saved.
    Enqueue if critical_clashes > 0 or high_clashes > 0.
    """
    critical = report_row.get("critical_clashes", 0) or 0
    high = report_row.get("high_clashes", 0) or 0
    if critical == 0 and high == 0:
        return
    priority = "high" if critical > 0 else "medium"
    title = f"{critical} critical / {high} high clashes in {report_row.get('test_name', 'report')}"
    detail = (
        f"File: {report_row.get('file_name','')}\n"
        f"Total: {report_row.get('total_clashes',0)} | "
        f"Critical: {critical} | High: {high}"
    )
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _insert_queue_item(
            conn,
            module="clash",
            type_="clash",
            title=title,
            detail=detail,
            priority=priority,
            source_id=str(report_row["id"]),
            pmis_target="procore",
            user_id=user_id,
            project_id=report_row.get("project_id"),
        )


# ── Task 2c: Vendor compliance daily job ─────────────────────────────────────

async def run_vendor_compliance_job():
    """
    Runs daily at 7:00 AM.
    Flags: COI expiring within 7 days, insurance_status='expired', no email (proxy for missing W9).
    """
    logger.info("Running vendor compliance job...")
    pool = await get_pool()
    async with pool.acquire() as conn:
        # COI expiring in 7 days
        expiring = await conn.fetch(
            """SELECT id, name, insurance_expiry FROM vendors
               WHERE insurance_expiry IS NOT NULL
               AND insurance_expiry BETWEEN NOW() AND NOW() + INTERVAL '7 days'
               AND connect_status IS DISTINCT FROM 'queued'"""
        )
        for v in expiring:
            await _insert_queue_item(
                conn,
                module="vendor",
                type_="compliance",
                title=f"COI expiring soon: {v['name']}",
                detail=f"Insurance expires on {v['insurance_expiry']}. Contact vendor to renew COI.",
                priority="high",
                source_id=f"vendor-coi-{v['id']}",
                pmis_target="procore",
                user_id=None,
            )
            await conn.execute(
                "UPDATE vendors SET connect_status='queued' WHERE id=$1", v["id"]
            )

        # Expired insurance
        expired = await conn.fetch(
            """SELECT id, name FROM vendors
               WHERE insurance_status='expired'
               AND connect_status IS DISTINCT FROM 'queued'"""
        )
        for v in expired:
            await _insert_queue_item(
                conn,
                module="vendor",
                type_="compliance",
                title=f"Insurance expired: {v['name']}",
                detail=f"Vendor {v['name']} has expired insurance. Resolve before next project use.",
                priority="high",
                source_id=f"vendor-expired-{v['id']}",
                pmis_target="procore",
                user_id=None,
            )
            await conn.execute(
                "UPDATE vendors SET connect_status='queued' WHERE id=$1", v["id"]
            )

        # Missing contact email (W9 proxy)
        no_email = await conn.fetch(
            """SELECT id, name FROM vendors
               WHERE (email IS NULL OR email='')
               AND connect_status IS DISTINCT FROM 'queued'
               LIMIT 50"""
        )
        for v in no_email:
            await _insert_queue_item(
                conn,
                module="vendor",
                type_="compliance",
                title=f"Missing W9 / contact info: {v['name']}",
                detail=f"Vendor {v['name']} has no email on file. W9 likely missing.",
                priority="medium",
                source_id=f"vendor-w9-{v['id']}",
                pmis_target="procore",
                user_id=None,
            )
            await conn.execute(
                "UPDATE vendors SET connect_status='queued' WHERE id=$1", v["id"]
            )

    logger.info("Vendor compliance job complete.")


def start_scheduler():
    if not scheduler.running:
        scheduler.add_job(
            run_vendor_compliance_job,
            trigger="cron",
            hour=7,
            minute=0,
            id="vendor_compliance_daily",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler started — vendor compliance job scheduled at 07:00 daily")


# ── Task 3: REST Endpoints ────────────────────────────────────────────────────

@router.get("/queue")
async def get_queue(user_id: Optional[int] = None, project_id: Optional[int] = None):
    """Return all pending queue items, high priority first, newest first."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if project_id and user_id:
            await require_project_member(conn, project_id, user_id)
        query = """
            SELECT id, module, type, title, detail, priority, pmis_target, status, created_at, project_id
            FROM connect_queue
            WHERE status = 'pending'
        """
        params = []
        p = 1
        if user_id:
            query += f" AND (user_id = ${p} OR user_id IS NULL)"
            params.append(user_id)
            p += 1
        if project_id:
            query += f" AND (project_id = ${p} OR project_id IS NULL)"
            params.append(project_id)
            p += 1
        query += """
            ORDER BY
              CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
              created_at DESC
        """
        rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


@router.patch("/queue/{item_id}/status")
async def update_queue_status(item_id: UUID, body: StatusUpdate):
    """Update status of a queue item: reviewed | pushed | dismissed."""
    if body.status not in ("reviewed", "pushed", "dismissed"):
        raise HTTPException(400, "status must be reviewed, pushed, or dismissed")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE connect_queue SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
            body.status, item_id,
        )
        if not row:
            raise HTTPException(404, "Queue item not found")
    return {"success": True, "item": dict(row)}


@router.post("/queue/{item_id}/push")
async def push_queue_item(item_id: UUID, body: PushRequest = PushRequest()):
    """
    Push item to Procore (RFIs for real; change_order returns an honest
    "needs manual entry" result since Procore change orders require an
    existing commitment/prime contract reference, not just a title) or
    Kahua (not implemented — no working Kahua call exists in this repo yet).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow(
            "SELECT * FROM connect_queue WHERE id=$1", item_id
        )
        if not item:
            raise HTTPException(404, "Queue item not found")
        item = dict(item)

        if item.get("project_id") and body.user_id:
            await require_project_member(conn, item["project_id"], body.user_id)

        target = item.get("pmis_target") or "procore"
        action_label = f"{item['type'].upper()} pushed to {target.capitalize()}"
        project_id = item.get("project_id")

        async def _fail(status: str, error_msg: str, http_status: int):
            await conn.execute(
                "UPDATE connect_queue SET status=$1, updated_at=NOW() WHERE id=$2",
                status, item_id,
            )
            await _log_action(
                conn, queue_item_id=item_id, action=action_label, module=item["module"],
                status="failed", error_message=error_msg,
                user_id=body.user_id, project_id=project_id,
            )
            raise HTTPException(http_status, error_msg)

        if target == "kahua":
            await _fail("failed", "Kahua push not yet implemented", 501)

        if item["type"] == "change_order":
            message = (
                "Procore requires an existing commitment or prime contract "
                "(with line items) to create a change order — a title and "
                "description alone aren't enough. This item needs manual "
                "entry in Procore."
            )
            await conn.execute(
                "UPDATE connect_queue SET status='needs_manual', updated_at=NOW() WHERE id=$1",
                item_id,
            )
            await _log_action(
                conn, queue_item_id=item_id, action=f"{action_label} (manual entry required)",
                module=item["module"], status="success",
                user_id=body.user_id, project_id=project_id,
            )
            return {"success": True, "manual_entry_required": True, "message": message}

        if item["type"] != "rfi":
            await _fail("failed", f"Procore push for '{item['type']}' items isn't implemented yet", 501)

        procore_project_id = await _get_procore_project_id(conn, project_id)
        if not procore_project_id:
            await _fail(
                "failed",
                "This project isn't linked to a Procore project yet — link it from Procore settings first.",
                400,
            )

        push_user_id = body.user_id or item.get("user_id")
        access_token = await _get_procore_access_token(conn, push_user_id)
        if not access_token:
            await _fail("failed", "Procore isn't connected for this user", 401)

        rfi_data = {
            "title": item["title"],
            "description": item.get("detail") or "",
            "priority": item.get("priority") or "medium",
        }

        try:
            await create_rfi(access_token, procore_project_id, rfi_data)
        except Exception as exc:
            await _fail("failed", f"Procore RFI creation failed: {exc}", 502)

        await conn.execute(
            "UPDATE connect_queue SET status='pushed', updated_at=NOW() WHERE id=$1",
            item_id,
        )
        await _log_action(
            conn,
            queue_item_id=item_id,
            action=action_label,
            module=item["module"],
            status="success",
            user_id=body.user_id,
            project_id=project_id,
        )
        return {"success": True, "message": f"Pushed to {target.capitalize()}"}


@router.get("/log")
async def get_log(user_id: Optional[int] = None, project_id: Optional[int] = None, limit: int = 20):
    """Return last N automation log entries."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if project_id and user_id:
            await require_project_member(conn, project_id, user_id)
        query = """SELECT cl.id, cl.action, cl.module, cl.status, cl.error_message, cl.created_at,
                          cq.title AS queue_title, cq.type AS queue_type
                   FROM connect_log cl
                   LEFT JOIN connect_queue cq ON cq.id = cl.queue_item_id
                   WHERE 1=1"""
        params = []
        p = 1
        if user_id:
            query += f" AND (cl.user_id = ${p} OR cl.user_id IS NULL)"
            params.append(user_id)
            p += 1
        if project_id:
            query += f" AND (cl.project_id = ${p} OR cl.project_id IS NULL)"
            params.append(project_id)
            p += 1
        query += f" ORDER BY cl.created_at DESC LIMIT ${p}"
        params.append(limit)
        rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


@router.get("/kpis")
async def get_kpis(user_id: Optional[int] = None, project_id: Optional[int] = None):
    """KPI counts for the Connect dashboard header cards."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if project_id:
            if user_id:
                await require_project_member(conn, project_id, user_id)
            pending_count = await conn.fetchval(
                "SELECT COUNT(*) FROM connect_queue WHERE status='pending' AND (project_id=$1 OR project_id IS NULL)",
                project_id,
            )
            rfis_today = await conn.fetchval(
                """SELECT COUNT(*) FROM connect_queue
                   WHERE type IN ('rfi','change_order')
                   AND DATE(created_at) = CURRENT_DATE
                   AND (project_id=$1 OR project_id IS NULL)""",
                project_id,
            )
            clash_alerts = await conn.fetchval(
                "SELECT COUNT(*) FROM connect_queue WHERE module='clash' AND status='pending' AND (project_id=$1 OR project_id IS NULL)",
                project_id,
            )
        else:
            pending_count = await conn.fetchval(
                "SELECT COUNT(*) FROM connect_queue WHERE status='pending'"
            )
            rfis_today = await conn.fetchval(
                """SELECT COUNT(*) FROM connect_queue
                   WHERE type IN ('rfi','change_order')
                   AND DATE(created_at) = CURRENT_DATE"""
            )
            clash_alerts = await conn.fetchval(
                "SELECT COUNT(*) FROM connect_queue WHERE module='clash' AND status='pending'"
            )
        total_vendors = await conn.fetchval("SELECT COUNT(*) FROM vendors")
        flagged_vendors = await conn.fetchval(
            """SELECT COUNT(DISTINCT id) FROM vendors
               WHERE insurance_status='expired'
               OR (insurance_expiry IS NOT NULL AND insurance_expiry < NOW() + INTERVAL '7 days')
               OR (email IS NULL OR email='')"""
        )
        compliance_pct = (
            round(((total_vendors - flagged_vendors) / total_vendors) * 100)
            if total_vendors else 100
        )

    return {
        "pending_actions": int(pending_count),
        "rfis_drafted_today": int(rfis_today),
        "clash_alerts": int(clash_alerts),
        "vendor_compliance_pct": int(compliance_pct),
    }

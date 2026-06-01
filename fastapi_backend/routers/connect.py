"""
POMAR Connect V1
- Queue population (Mail signals, Clash reports, Vendor compliance daily job)
- REST endpoints: GET/PATCH/POST /api/connect/queue, GET /api/connect/log
- APScheduler daily vendor compliance job at 7:00 AM
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool

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
                              pmis_target: str, user_id: Optional[int]):
    """Insert into connect_queue only if same source_id not already pending."""
    existing = await conn.fetchval(
        "SELECT id FROM connect_queue WHERE source_id=$1 AND status='pending'",
        source_id,
    )
    if existing:
        return None
    row = await conn.fetchrow(
        """INSERT INTO connect_queue
           (module, type, title, detail, priority, source_id, pmis_target, user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *""",
        module, type_, title, detail, priority, source_id, pmis_target, user_id,
    )
    return dict(row)


async def _log_action(conn, *, queue_item_id, action: str, module: str,
                       status: str, error_message: Optional[str] = None,
                       user_id: Optional[int] = None):
    await conn.execute(
        """INSERT INTO connect_log (queue_item_id, action, module, status, error_message, user_id)
           VALUES ($1,$2,$3,$4,$5,$6)""",
        queue_item_id, action, module, status, error_message, user_id,
    )


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
async def get_queue(user_id: Optional[int] = None):
    """Return all pending queue items, high priority first, newest first."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT id, module, type, title, detail, priority, pmis_target, status, created_at
            FROM connect_queue
            WHERE status = 'pending'
        """
        params = []
        if user_id:
            query += " AND (user_id = $1 OR user_id IS NULL)"
            params.append(user_id)
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
    Push item to Procore or Kahua.
    Real integration: plug in Procore/Kahua SDK calls here.
    Currently simulates push and logs the result.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow(
            "SELECT * FROM connect_queue WHERE id=$1", item_id
        )
        if not item:
            raise HTTPException(404, "Queue item not found")
        item = dict(item)

        target = item.get("pmis_target") or "procore"
        action_label = f"{item['type'].upper()} pushed to {target.capitalize()}"

        # ── Procore integration stub ──────────────────────────────────────
        # When Procore OAuth is live, replace the block below with:
        #   from services.procore_helpers import create_rfi
        #   rfi = await create_rfi(user_id, project_id, rfi_data)
        # ─────────────────────────────────────────────────────────────────
        push_success = True  # stub — always succeeds
        error_msg = None

        if push_success:
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
            )
            return {"success": True, "message": f"Pushed to {target.capitalize()}"}
        else:
            await _log_action(
                conn,
                queue_item_id=item_id,
                action=action_label,
                module=item["module"],
                status="failed",
                error_message=error_msg,
                user_id=body.user_id,
            )
            raise HTTPException(500, f"Push failed: {error_msg}")


@router.get("/log")
async def get_log(user_id: Optional[int] = None, limit: int = 20):
    """Return last N automation log entries."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT cl.id, cl.action, cl.module, cl.status, cl.error_message, cl.created_at,
                      cq.title AS queue_title, cq.type AS queue_type
               FROM connect_log cl
               LEFT JOIN connect_queue cq ON cq.id = cl.queue_item_id
               ORDER BY cl.created_at DESC
               LIMIT $1""",
            limit,
        )
    return [dict(r) for r in rows]


@router.get("/kpis")
async def get_kpis(user_id: Optional[int] = None):
    """KPI counts for the Connect dashboard header cards."""
    pool = await get_pool()
    async with pool.acquire() as conn:
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

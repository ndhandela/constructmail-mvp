"""
POMAR Trust — QPR due-date reminders.

Daily APScheduler job (own scheduler instance, mirrors routers/connect.py's
vendor-compliance job pattern), started from main.py's lifespan. Scans
non-filed QPR drafts for the 7/3/1-day-out and overdue thresholds and emails
compliance_reviewer/owner users once per threshold — trust_reminders'
UNIQUE(qpr_draft_id, reminder_type) is what makes re-running this daily a
no-op once a given threshold has already fired for a draft.
"""

import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import get_pool
from services.email_service import send_email

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

_THRESHOLDS = {7: "due_7d", 3: "due_3d", 1: "due_1d"}


def _reminder_type_for(due_date: date, today: date) -> str | None:
    days_left = (due_date - today).days
    if days_left < 0:
        return "overdue"
    return _THRESHOLDS.get(days_left)


async def run_trust_reminder_job():
    pool = await get_pool()
    today = date.today()
    async with pool.acquire() as conn:
        drafts = await conn.fetch(
            """SELECT qd.id, qd.quarter, qd.due_date, tp.project_name, tp.company_id
               FROM trust_qpr_drafts qd
               JOIN trust_projects tp ON tp.id = qd.project_id
               WHERE qd.status != 'filed' AND qd.due_date IS NOT NULL"""
        )
        for draft in drafts:
            reminder_type = _reminder_type_for(draft["due_date"], today)
            if not reminder_type:
                continue

            inserted = await conn.fetchrow(
                """INSERT INTO trust_reminders (qpr_draft_id, reminder_type, channel)
                   VALUES ($1, $2, 'email')
                   ON CONFLICT (qpr_draft_id, reminder_type) DO NOTHING
                   RETURNING id""",
                draft["id"], reminder_type,
            )
            if not inserted:
                continue  # already reminded for this threshold

            recipients = await conn.fetch(
                """SELECT email FROM users
                   WHERE company_id = $1 AND (permission_level = 'owner' OR trust_role = 'compliance_reviewer')""",
                draft["company_id"],
            )
            subject = (
                f"POMAR Trust: {draft['project_name']} QPR is overdue"
                if reminder_type == "overdue"
                else f"POMAR Trust: {draft['project_name']} QPR due {'today' if reminder_type == 'due_1d' else f'in {reminder_type[4]} days'}"
            )
            body = (
                f"<p>The {draft['quarter']} QPR for <strong>{draft['project_name']}</strong> "
                f"{'is overdue (was due' if reminder_type == 'overdue' else 'is due'} "
                f"{draft['due_date'].isoformat()}.</p><p>Review and file it in POMAR Trust.</p>"
            )
            for recipient in recipients:
                await send_email(to=recipient["email"], subject=subject, html=body)

    logger.info("Trust reminder job complete.")


def start_scheduler():
    if not scheduler.running:
        scheduler.add_job(
            run_trust_reminder_job,
            trigger="cron",
            hour=8,
            minute=0,
            id="trust_reminders_daily",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler started — Trust QPR reminder job scheduled at 08:00 daily")

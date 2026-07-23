"""
Marketplace — verified-badge recompute.

Hourly APScheduler job (own scheduler instance, mirrors
services/trust_reminders.py's / routers/connect.py's job pattern), started
from main.py's lifespan.

IMPORTANT — do not add a way for Admin (or anyone) to set
marketplace_listings.verified directly. This flag is a factual claim ("a GC
who added or reviewed this listing has a real project relationship with this
vendor"), and a manually-toggleable badge on unverified review content is
exactly the kind of deceptive-endorsement exposure the FTC's review/
endorsement guidance targets. The only source of truth is a real row in
project_vendors — the private vendor-project relationship table — linking
the listing (via its vendors.marketplace_listing_id back-reference) to a
project owned by the same company as whoever added or reviewed the listing.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import get_pool

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

# Listings never linked to a private vendors row (vendors.marketplace_listing_id)
# — e.g. a sub-claimed listing a GC has never added to their own vendor
# directory — can never verify. That's intentional/conservative, not a bug:
# there's no project_vendors relationship to check against.
_RECOMPUTE_SQL = """
    WITH listing_company AS (
        SELECT ml.id AS listing_id,
               COALESCE(submitter.company_id, reviewer.company_id) AS company_id
        FROM marketplace_listings ml
        LEFT JOIN users submitter ON submitter.id = ml.submitted_by_user_id
        LEFT JOIN LATERAL (
            SELECT u.company_id
            FROM marketplace_reviews mr
            JOIN users u ON u.id = mr.reviewer_user_id
            WHERE mr.listing_id = ml.id
            ORDER BY mr.created_at ASC
            LIMIT 1
        ) reviewer ON true
    )
    UPDATE marketplace_listings ml
    SET verified = EXISTS (
            SELECT 1
            FROM vendors v
            JOIN project_vendors pv ON pv.vendor_id = v.id
            JOIN projects p ON p.id = pv.project_id
            JOIN listing_company lc ON lc.listing_id = ml.id
            WHERE v.marketplace_listing_id = ml.id
              AND lc.company_id IS NOT NULL
              AND p.company_id = lc.company_id
        ),
        updated_at = NOW()
    WHERE ml.status = 'active'
    RETURNING ml.id, ml.verified
"""


async def run_verification_job():
    pool = await get_pool()
    async with pool.acquire() as conn:
        before = {r["id"]: r["verified"] for r in await conn.fetch(
            "SELECT id, verified FROM marketplace_listings WHERE status = 'active'"
        )}
        rows = await conn.fetch(_RECOMPUTE_SQL)
        changed = [r for r in rows if before.get(r["id"]) != r["verified"]]

    if changed:
        from services.user_service import log_marketplace_activity
        for row in changed:
            await log_marketplace_activity(
                action="verified_badge_changed",
                resource_type="marketplace_listing",
                resource_id=str(row["id"]),
                changes={"verified": row["verified"]},
                is_system=True,
            )
    logger.info("Marketplace verification job complete — %d listing(s) changed.", len(changed))


def start_scheduler():
    if not scheduler.running:
        scheduler.add_job(
            run_verification_job,
            trigger="interval",
            hours=1,
            id="marketplace_verification_hourly",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler started — Marketplace verified-badge job scheduled hourly")

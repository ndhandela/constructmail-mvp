"""
Per-user (not per-project) preferences for the new left nav's pinned
favorites — see db.py's user_pinned_apps table (migration 017). Pin choices
follow a user across whichever project is currently selected, unlike
everything else in this app that's scoped to ProjectContext.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_pool

router = APIRouter(prefix="/api/user-preferences", tags=["User Preferences"])

# Mirrors Project Detail's category-card keys (frontend/src/modules/
# project-hub/pages/ProjectDetailPage.js) — not DB-enforced (app_key has no
# CHECK constraint, see migration 017) so new cards can ship without a
# migration, but validated here so a typo'd key can't get silently pinned.
VALID_APP_KEYS = {"budget", "schedule", "invoices", "daily_logs", "project_subs", "documents"}

# New users' nav starts with these two pinned rather than empty — see
# migration 017's note on users.pinned_apps_seeded.
DEFAULT_PINNED_APPS = ["budget", "schedule"]


class PinAppRequest(BaseModel):
    userId: int
    appKey: str


@router.get("/pinned-apps")
async def get_pinned_apps(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        seeded = await conn.fetchval("SELECT pinned_apps_seeded FROM users WHERE id = $1", userId)
        if seeded is None:
            raise HTTPException(404, "User not found")
        if not seeded:
            async with conn.transaction():
                for app_key in DEFAULT_PINNED_APPS:
                    await conn.execute(
                        "INSERT INTO user_pinned_apps (user_id, app_key) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                        userId, app_key,
                    )
                await conn.execute("UPDATE users SET pinned_apps_seeded = true WHERE id = $1", userId)
        rows = await conn.fetch(
            "SELECT app_key FROM user_pinned_apps WHERE user_id = $1 ORDER BY pinned_at", userId,
        )
    return {"success": True, "pinnedApps": [r["app_key"] for r in rows]}


@router.post("/pinned-apps")
async def pin_app(req: PinAppRequest):
    if req.appKey not in VALID_APP_KEYS:
        raise HTTPException(400, f"appKey must be one of: {', '.join(sorted(VALID_APP_KEYS))}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO user_pinned_apps (user_id, app_key) VALUES ($1, $2)
               ON CONFLICT (user_id, app_key) DO NOTHING""",
            req.userId, req.appKey,
        )
        # A deliberate pin/unpin action always counts as "seeded" — otherwise
        # unpinning a default before any pin would leave the row false and
        # the next GET would silently re-seed the defaults out from under it.
        await conn.execute("UPDATE users SET pinned_apps_seeded = true WHERE id = $1", req.userId)
    return {"success": True}


@router.delete("/pinned-apps/{app_key}")
async def unpin_app(app_key: str, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM user_pinned_apps WHERE user_id = $1 AND app_key = $2", userId, app_key,
        )
        await conn.execute("UPDATE users SET pinned_apps_seeded = true WHERE id = $1", userId)
    return {"success": True}

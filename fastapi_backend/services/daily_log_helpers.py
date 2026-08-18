"""
Read-only helper for POMAR Dashboard (routers/dashboard.py). routers/
daily_logs.py itself has no single-row "most recent log" lookup — its own
list_logs endpoint is a paginated feed, not a summary — so this adds one
without touching that router or its access-control model.
"""
from typing import Optional


async def get_project_last_log(conn, project_id: int) -> Optional[dict]:
    """Most recent daily log for a project by submission time (created_at,
    not log_date — log_date is a bare DATE with no time-of-day, and the
    dashboard card wants to show e.g. "Today, 8:05 AM"). excerpt prefers
    work_performed (the "what happened" field) and falls back to
    delays_notes/safety_notes so a log that only recorded a delay or a
    safety note still shows something instead of a blank excerpt."""
    row = await conn.fetchrow(
        """SELECT created_at, work_performed, delays_notes, safety_notes
           FROM daily_logs WHERE project_id = $1
           ORDER BY created_at DESC LIMIT 1""",
        project_id,
    )
    if not row:
        return None

    excerpt = (row["work_performed"] or row["delays_notes"] or row["safety_notes"] or "").strip()
    if len(excerpt) > 100:
        excerpt = excerpt[:97] + "..."

    return {"logged_at": row["created_at"].isoformat(), "excerpt": excerpt}

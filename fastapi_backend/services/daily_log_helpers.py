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
    dashboard card wants to show e.g. "Today, 8:05 AM"). excerpt/full_text
    prefer work_performed (the "what happened" field) and fall back to
    delays_notes/safety_notes so a log that only recorded a delay or a
    safety note still shows something instead of a blank excerpt. excerpt
    is truncated for the card's one-line row; full_text is the same string
    untruncated, for the "Last log" tooltip (routers/dashboard.py) in case
    the card's excerpt got cut off. logged_by is the logging user's name,
    for that same tooltip."""
    row = await conn.fetchrow(
        """SELECT dl.created_at, dl.work_performed, dl.delays_notes, dl.safety_notes,
                  u.name AS logged_by_name
           FROM daily_logs dl JOIN users u ON u.id = dl.logged_by_user_id
           WHERE dl.project_id = $1
           ORDER BY dl.created_at DESC LIMIT 1""",
        project_id,
    )
    if not row:
        return None

    full_text = (row["work_performed"] or row["delays_notes"] or row["safety_notes"] or "").strip()
    excerpt = full_text if len(full_text) <= 100 else f"{full_text[:97]}..."

    return {
        "logged_at": row["created_at"].isoformat(),
        "excerpt": excerpt,
        "full_text": full_text,
        "logged_by": row["logged_by_name"],
    }

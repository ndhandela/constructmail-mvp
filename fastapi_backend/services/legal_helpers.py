"""
Consent-status resolution for the versioned ToS/Privacy Policy consent gate
(routers/legal.py). A user's standing for a doc_type is never stored or
cached — it's resolved fresh on every check as "does their most recent
user_consents row for that doc_type match the currently active
legal_documents version," so bumping a version (a direct DB update, no
admin UI in this pass — see db.py's _seed_legal_documents) immediately
re-requires consent for every user with no backfill needed.
"""
from fastapi import Request

DOC_TYPES = ("tos", "privacy")


async def get_active_legal_documents(conn) -> dict:
    rows = await conn.fetch(
        "SELECT doc_type, version, content, effective_date FROM legal_documents WHERE is_active = TRUE"
    )
    return {row["doc_type"]: dict(row) for row in rows}


async def get_consent_status(conn, user_id: int) -> dict:
    active = await get_active_legal_documents(conn)
    status = {}
    consent_required = False
    for doc_type in DOC_TYPES:
        active_doc = active.get(doc_type)
        current_version = active_doc["version"] if active_doc else None
        latest = await conn.fetchrow(
            """SELECT version FROM user_consents
               WHERE user_id = $1 AND doc_type = $2
               ORDER BY accepted_at DESC LIMIT 1""",
            user_id, doc_type,
        )
        accepted_version = latest["version"] if latest else None
        accepted = current_version is not None and accepted_version == current_version
        if current_version is not None and not accepted:
            consent_required = True
        status[doc_type] = {
            "current_version": current_version,
            "accepted_version": accepted_version,
            "accepted": accepted,
        }
    status["consent_required"] = consent_required
    return status


def get_client_ip(request: Request) -> str:
    # Deployed behind a proxy (see DEPLOY.md) — the real client address is
    # the first hop in X-Forwarded-For, not request.client.host (which
    # would just be the proxy).
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""

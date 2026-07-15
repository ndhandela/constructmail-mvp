from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.email_service import send_email

router = APIRouter(tags=["Misc"])


class ContactRequest(BaseModel):
    name: str
    email: str
    message: str
    company: Optional[str] = None
    source: Optional[str] = "contact"  # "contact" or "demo"


@router.get("/api/health")
async def health():
    return {"status": "ok"}


@router.get("/")
async def root():
    return {
        "message": "ConstructMail Intelligence API",
        "status": "running",
        "version": "2.0.0 (FastAPI)",
    }


@router.post("/api/contact")
async def contact(req: ContactRequest):
    if not req.name or not req.email or not req.message:
        raise HTTPException(400, "Name, email and message are required")
    label = "Demo Request" if req.source == "demo" else "Consultation Request"
    await send_email(
        to="connect@techdensolutions.com",
        subject=f"New {label} - {req.company or 'No Company'} - {req.name}",
        html=f"""
        <h2 style="color: #002e4a;">New {label}</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
          <tr><td style="padding:12px;border:1px solid #ddd;font-weight:bold;background:#f5f5f5;">Name</td><td style="padding:12px;border:1px solid #ddd;">{req.name}</td></tr>
          <tr><td style="padding:12px;border:1px solid #ddd;font-weight:bold;background:#f5f5f5;">Email</td><td style="padding:12px;border:1px solid #ddd;">{req.email}</td></tr>
          <tr><td style="padding:12px;border:1px solid #ddd;font-weight:bold;background:#f5f5f5;">Company</td><td style="padding:12px;border:1px solid #ddd;">{req.company or '-'}</td></tr>
          <tr><td style="padding:12px;border:1px solid #ddd;font-weight:bold;background:#f5f5f5;">Message</td><td style="padding:12px;border:1px solid #ddd;">{req.message}</td></tr>
        </table>
        """,
    )
    return {"success": True, "message": "Message sent successfully"}


@router.get("/api/debug/user-data/{user_id}")
async def debug_user_data(user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        projects = await conn.fetch("SELECT * FROM projects WHERE user_id = $1", user_id)
        signals = await conn.fetch("SELECT * FROM signals LIMIT 10")
    return {
        "user": dict(user) if user else None,
        "projects": [dict(r) for r in projects],
        "allSignals": [dict(r) for r in signals],
    }


@router.get("/api/activity/feed")
async def get_activity_feed(userId: int, limit: int = 20):
    """
    Merged recent-activity feed across a user's projects, tagged by project and
    module. Powers the "All projects" option in the Header switcher. Marketplace
    is browse-oriented and intentionally excluded.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        project_names = {
            r["id"]: r["name"]
            for r in await conn.fetch(
                """SELECT p.id, p.name FROM projects p
                   JOIN project_members pm ON pm.project_id = p.id
                   WHERE pm.user_id = $1""",
                userId,
            )
        }

        mail_summaries = await conn.fetch(
            """SELECT id, project_id, summary AS title, created_at FROM email_threads
               WHERE project_id = ANY($1::int[]) ORDER BY created_at DESC LIMIT $2""",
            list(project_names.keys()), limit,
        )
        mail_signals = await conn.fetch(
            """SELECT id, project_id, signal_type, raw_text, created_at FROM signals
               WHERE project_id = ANY($1::int[]) ORDER BY created_at DESC LIMIT $2""",
            list(project_names.keys()), limit,
        )
        clash_reports = await conn.fetch(
            """SELECT id, project_id, test_name, total_clashes, created_at FROM clash_reports
               WHERE project_id = ANY($1::int[]) ORDER BY created_at DESC LIMIT $2""",
            list(project_names.keys()), limit,
        )
        vendor_links = await conn.fetch(
            """SELECT pv.id, pv.project_id, v.name AS vendor_name, pv.created_at
               FROM project_vendors pv JOIN vendors v ON v.id = pv.vendor_id
               WHERE pv.project_id = ANY($1::int[]) ORDER BY pv.created_at DESC LIMIT $2""",
            list(project_names.keys()), limit,
        )
        connect_items = await conn.fetch(
            """SELECT id, project_id, title, created_at FROM connect_queue
               WHERE project_id = ANY($1::int[]) ORDER BY created_at DESC LIMIT $2""",
            list(project_names.keys()), limit,
        )

    items = []
    for r in mail_summaries:
        items.append({
            "module": "mail", "type": "summary",
            "title": (r["title"] or "")[:120] or "Email thread summarized",
            "project_id": r["project_id"], "project_name": project_names.get(r["project_id"]),
            "created_at": r["created_at"],
        })
    for r in mail_signals:
        items.append({
            "module": "mail", "type": "signal",
            "title": f"{r['signal_type'] or 'Signal'} detected: {(r['raw_text'] or '')[:80]}",
            "project_id": r["project_id"], "project_name": project_names.get(r["project_id"]),
            "created_at": r["created_at"],
        })
    for r in clash_reports:
        items.append({
            "module": "clash", "type": "clash_report",
            "title": f"{r['test_name'] or 'Clash report'} — {r['total_clashes']} clashes",
            "project_id": r["project_id"], "project_name": project_names.get(r["project_id"]),
            "created_at": r["created_at"],
        })
    for r in vendor_links:
        items.append({
            "module": "vendor", "type": "vendor_linked",
            "title": f"{r['vendor_name']} linked to project",
            "project_id": r["project_id"], "project_name": project_names.get(r["project_id"]),
            "created_at": r["created_at"],
        })
    for r in connect_items:
        items.append({
            "module": "connect", "type": "queue_item",
            "title": r["title"],
            "project_id": r["project_id"], "project_name": project_names.get(r["project_id"]),
            "created_at": r["created_at"],
        })

    items.sort(key=lambda i: i["created_at"], reverse=True)
    return {"success": True, "items": items[:limit]}


@router.get("/api/clients")
async def get_clients_list(admin_token: str = None):
    # Simple endpoint — auth handled separately in admin router
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, email, name, company FROM users ORDER BY created_at DESC LIMIT 50")
    return {"success": True, "clients": [dict(r) for r in rows]}

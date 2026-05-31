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
    await send_email(
        to="connect@techdensolutions.com",
        subject=f"New Consultation Request - {req.company or 'No Company'} - {req.name}",
        html=f"""
        <h2 style="color: #002e4a;">New Consultation Request</h2>
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


@router.get("/api/clients")
async def get_clients_list(admin_token: str = None):
    # Simple endpoint — auth handled separately in admin router
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, email, name, company FROM users ORDER BY created_at DESC LIMIT 50")
    return {"success": True, "clients": [dict(r) for r in rows]}

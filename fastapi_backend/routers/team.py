import os
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import get_pool
from services.email_service import send_email
from services.project_helpers import accept_pending_invites

router = APIRouter(prefix="/api/team", tags=["Team"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")


class InviteTeammateRequest(BaseModel):
    userId: int
    email: str
    fullName: str


@router.post("/invite")
async def invite_teammate(req: InviteTeammateRequest):
    email = req.email.lower().strip()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            owner = await conn.fetchrow(
                "SELECT company_id, permission_level FROM users WHERE id = $1", req.userId
            )
            if not owner:
                raise HTTPException(404, "User not found")
            if owner["permission_level"] != "owner":
                raise HTTPException(403, "Only the company owner can invite teammates")
            if not owner["company_id"]:
                raise HTTPException(400, "Your account is not linked to a company")

            existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
            if existing:
                raise HTTPException(400, "An account with this email already exists.")

            invite_token = secrets.token_hex(32)
            invite_expires = datetime.utcnow() + timedelta(days=7)
            company = await conn.fetchrow("SELECT name FROM companies WHERE id = $1", owner["company_id"])
            user = await conn.fetchrow(
                """INSERT INTO users (email, name, full_name, company, company_id, permission_level,
                                       password_hash, invite_token, invite_token_expires, created_at)
                   VALUES ($1,$2,$3,$4,$5,'member',NULL,$6,$7,NOW())
                   RETURNING id""",
                email, req.fullName.strip(), req.fullName.strip(),
                company["name"] if company else None, owner["company_id"], invite_token, invite_expires,
            )
            await accept_pending_invites(conn, user["id"], email)

    invite_url = f"{FRONTEND_URL}/accept-invite?token={invite_token}"
    first_name = req.fullName.strip().split(" ")[0]
    company_name = company["name"] if company else "your team"
    await send_email(
        to=email,
        subject=f"You're invited to join {company_name} on POMAR",
        html=f"""
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #0E1B2C;">You're invited</h2>
          <p>Hi {first_name},</p>
          <p>You've been invited to join <strong>{company_name}</strong> on POMAR. Set your password to get started.</p>
          <a href="{invite_url}" style="display:inline-block;padding:12px 24px;background:#D97706;color:white;border-radius:100px;text-decoration:none;font-weight:600;margin:20px 0;">
            Set Your Password
          </a>
          <p style="color:#666;font-size:13px;">This link expires in 7 days.</p>
        </div>""",
    )
    return {"success": True, "userId": user["id"]}


@router.get("")
async def list_team(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        requester = await conn.fetchrow("SELECT company_id FROM users WHERE id = $1", userId)
        if not requester:
            raise HTTPException(404, "User not found")
        if not requester["company_id"]:
            return {"success": True, "team": []}
        rows = await conn.fetch(
            """SELECT id, email, full_name, name, permission_level,
                      (invite_token IS NOT NULL) as invite_pending, created_at
               FROM users WHERE company_id = $1 ORDER BY created_at ASC""",
            requester["company_id"],
        )
    return {"success": True, "team": [dict(r) for r in rows]}

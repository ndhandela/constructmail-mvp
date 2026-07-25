import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import get_pool
from services.access_control import MODULE_KEYS
from services.email_service import send_email
from services.project_helpers import accept_pending_invites

router = APIRouter(prefix="/api/team", tags=["Team"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")


class InviteTeammateRequest(BaseModel):
    userId: int
    email: str
    fullName: str
    projectIds: list[int] = []
    # Scopes the new teammate to exactly one module (e.g. "invoice_tracker")
    # instead of the company's full set of enabled modules — see
    # services/access_control.require_feature_flag, which 403s any other
    # feature_key once this is set. None (the default) keeps today's
    # behavior: full access to whatever the company has enabled.
    restrictedModule: Optional[str] = None


@router.post("/invite")
async def invite_teammate(req: InviteTeammateRequest):
    if req.restrictedModule is not None and req.restrictedModule not in MODULE_KEYS:
        raise HTTPException(400, f"restrictedModule must be one of {MODULE_KEYS}")

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
                                       password_hash, invite_token, invite_token_expires, restricted_module, created_at)
                   VALUES ($1,$2,$3,$4,$5,'member',NULL,$6,$7,$8,NOW())
                   RETURNING id""",
                email, req.fullName.strip(), req.fullName.strip(),
                company["name"] if company else None, owner["company_id"], invite_token, invite_expires,
                req.restrictedModule,
            )
            await accept_pending_invites(conn, user["id"], email)

            if req.projectIds:
                valid_projects = await conn.fetch(
                    "SELECT id FROM projects WHERE id = ANY($1::int[]) AND company_id = $2",
                    req.projectIds, owner["company_id"],
                )
                for project in valid_projects:
                    await conn.execute(
                        """INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'contributor')
                           ON CONFLICT (project_id, user_id) DO NOTHING""",
                        project["id"], user["id"],
                    )

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
            """SELECT id, email, full_name, name, permission_level, trust_role, restricted_module,
                      (invite_token IS NOT NULL) as invite_pending, created_at
               FROM users WHERE company_id = $1 ORDER BY created_at ASC""",
            requester["company_id"],
        )
    return {"success": True, "team": [dict(r) for r in rows]}


class UpdateRestrictedModuleRequest(BaseModel):
    requesterId: int
    restricted_module: Optional[str] = None  # null clears it


@router.put("/{member_user_id}/restricted-module")
async def update_member_restricted_module(member_user_id: int, req: UpdateRestrictedModuleRequest):
    if req.restricted_module is not None and req.restricted_module not in MODULE_KEYS:
        raise HTTPException(400, f"restricted_module must be one of {MODULE_KEYS}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        requester = await conn.fetchrow(
            "SELECT company_id, permission_level FROM users WHERE id = $1", req.requesterId
        )
        member = await conn.fetchrow(
            "SELECT company_id, permission_level FROM users WHERE id = $1", member_user_id
        )
        if not requester or not member or requester["company_id"] != member["company_id"]:
            raise HTTPException(403, "Not authorized")
        if requester["permission_level"] != "owner":
            raise HTTPException(403, "Only the company owner can change this")
        if member["permission_level"] == "owner":
            raise HTTPException(400, "The company owner can't be restricted to a single module")

        row = await conn.fetchrow(
            "UPDATE users SET restricted_module = $1 WHERE id = $2 RETURNING id, restricted_module",
            req.restricted_module, member_user_id,
        )
    return {"success": True, "restricted_module": row["restricted_module"]}


class UpdateTrustRoleRequest(BaseModel):
    requesterId: int
    trust_role: Optional[str] = None  # null clears it


@router.put("/{member_user_id}/trust-role")
async def update_member_trust_role(member_user_id: int, req: UpdateTrustRoleRequest):
    if req.trust_role is not None and req.trust_role not in ("owner", "site_data", "compliance_reviewer"):
        raise HTTPException(400, "trust_role must be 'owner', 'site_data', or 'compliance_reviewer'")
    pool = await get_pool()
    async with pool.acquire() as conn:
        requester = await conn.fetchrow(
            "SELECT company_id, permission_level FROM users WHERE id = $1", req.requesterId
        )
        member = await conn.fetchrow(
            "SELECT company_id FROM users WHERE id = $1", member_user_id
        )
        if not requester or not member or requester["company_id"] != member["company_id"]:
            raise HTTPException(403, "Not authorized")
        if requester["permission_level"] != "owner":
            raise HTTPException(403, "Only the company owner can change this")

        row = await conn.fetchrow(
            "UPDATE users SET trust_role = $1 WHERE id = $2 RETURNING id, trust_role",
            req.trust_role, member_user_id,
        )
    return {"success": True, "trust_role": row["trust_role"]}


@router.get("/{member_user_id}/projects")
async def get_member_projects(member_user_id: int, requesterId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        requester = await conn.fetchrow(
            "SELECT company_id, permission_level FROM users WHERE id = $1", requesterId
        )
        member = await conn.fetchrow(
            "SELECT company_id FROM users WHERE id = $1", member_user_id
        )
        if not requester or not member or requester["company_id"] != member["company_id"]:
            raise HTTPException(403, "Not authorized")
        if requester["permission_level"] != "owner":
            raise HTTPException(403, "Only the company owner can view this")
        rows = await conn.fetch(
            """SELECT p.id, p.name, (pm.user_id IS NOT NULL) AS has_access
               FROM projects p
               LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
               WHERE p.company_id = $2 ORDER BY p.created_at""",
            member_user_id, requester["company_id"],
        )
    return {"success": True, "projects": [dict(r) for r in rows]}


class UpdateMemberProjectsRequest(BaseModel):
    requesterId: int
    projectIds: list[int]


@router.put("/{member_user_id}/projects")
async def update_member_projects(member_user_id: int, req: UpdateMemberProjectsRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        requester = await conn.fetchrow(
            "SELECT company_id, permission_level FROM users WHERE id = $1", req.requesterId
        )
        member = await conn.fetchrow(
            "SELECT company_id, permission_level FROM users WHERE id = $1", member_user_id
        )
        if not requester or not member or requester["company_id"] != member["company_id"]:
            raise HTTPException(403, "Not authorized")
        if requester["permission_level"] != "owner":
            raise HTTPException(403, "Only the company owner can change this")

        async with conn.transaction():
            valid_ids = await conn.fetch(
                "SELECT id FROM projects WHERE company_id = $1 AND id = ANY($2::int[])",
                requester["company_id"], req.projectIds,
            )
            valid_ids = [r["id"] for r in valid_ids]

            await conn.execute(
                """DELETE FROM project_members
                   WHERE user_id = $1 AND project_id IN (
                       SELECT id FROM projects WHERE company_id = $2
                   ) AND NOT (project_id = ANY($3::int[]))""",
                member_user_id, requester["company_id"], valid_ids,
            )
            role = "owner" if member["permission_level"] == "owner" else "contributor"
            for pid in valid_ids:
                await conn.execute(
                    """INSERT INTO project_members (project_id, user_id, role)
                       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING""",
                    pid, member_user_id, role,
                )
    return {"success": True}

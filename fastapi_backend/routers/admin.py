import json
import logging
import os
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.admin_auth import get_current_admin, require_super_admin, create_token, hash_password, verify_password
from services.email_service import send_email
from services.project_helpers import accept_pending_invites
from services import user_service

router = APIRouter(prefix="/api/admin", tags=["Admin"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class CreateAdminRequest(BaseModel):
    email: str
    password: str
    admin_level: str
    company_id: Optional[int] = None
    permissions: Optional[dict] = None


class UpdateAdminRequest(BaseModel):
    is_active: Optional[bool] = None
    permissions: Optional[dict] = None


class PricingRequest(BaseModel):
    module_name: str
    monthly_price: Optional[float] = 0
    billing_cycle: Optional[str] = "monthly"
    is_global: Optional[bool] = False
    company_id: Optional[int] = None


class FeatureFlagsRequest(BaseModel):
    feature_name: str
    is_enabled: bool = True
    is_global: bool = True
    company_id: Optional[int] = None


class CreateCompanyRequest(BaseModel):
    companyName: str
    ownerEmail: str
    ownerFullName: str


@router.post("/auth/login")
async def admin_login(req: AdminLoginRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        admin = await conn.fetchrow(
            "SELECT id, email, password_hash, admin_level, company_id, is_active FROM admin_users WHERE email = $1",
            req.email.lower().strip(),
        )
    if not admin:
        raise HTTPException(401, "Admin user not found")
    if not admin["is_active"]:
        raise HTTPException(401, "Admin account is deactivated")
    if not verify_password(req.password, admin["password_hash"]):
        raise HTTPException(401, "Invalid password")
    token = create_token(dict(admin))
    pool2 = await get_pool()
    async with pool2.acquire() as conn:
        await conn.execute("UPDATE admin_users SET last_login = NOW() WHERE id = $1", admin["id"])
        await user_service.log_admin_activity(admin["id"], "admin_login", "admin_users", admin["id"])
    return {"success": True, "token": token, "admin": {"id": admin["id"], "email": admin["email"], "admin_level": admin["admin_level"]}}


@router.post("/auth/logout")
async def admin_logout(admin: dict = Depends(get_current_admin)):
    await user_service.log_admin_activity(admin["id"], "admin_logout", "admin_users", admin["id"])
    return {"success": True, "message": "Logged out"}


@router.get("/me")
async def get_admin_me(admin: dict = Depends(get_current_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, admin_level, company_id, is_active, created_at, last_login FROM admin_users WHERE id = $1",
            admin["id"],
        )
    if not row:
        raise HTTPException(404, "Admin not found")
    return {"success": True, "admin": dict(row)}


@router.get("/companies")
async def get_companies(limit: int = 50, offset: int = 0, admin: dict = Depends(require_super_admin)):
    result = await user_service.get_all_companies(limit, offset)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return result


@router.get("/companies/{company_id}")
async def get_company(company_id: int, admin: dict = Depends(require_super_admin)):
    result = await user_service.get_company(company_id)
    if not result["success"]:
        raise HTTPException(404, result["error"])
    return result


@router.post("/companies")
async def create_company(req: CreateCompanyRequest, admin: dict = Depends(require_super_admin)):
    owner_email = req.ownerEmail.lower().strip()
    invite_token = secrets.token_hex(32)
    invite_expires = datetime.utcnow() + timedelta(days=7)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", owner_email)
            if existing:
                raise HTTPException(400, "An account with this email already exists.")
            company = await conn.fetchrow(
                "INSERT INTO companies (name) VALUES ($1) RETURNING id", req.companyName.strip(),
            )
            user = await conn.fetchrow(
                """INSERT INTO users (email, name, full_name, company, company_id, permission_level,
                                       password_hash, invite_token, invite_token_expires, created_at)
                   VALUES ($1,$2,$3,$4,$5,'owner',NULL,$6,$7,NOW())
                   RETURNING id""",
                owner_email, req.ownerFullName.strip(), req.ownerFullName.strip(), req.companyName.strip(),
                company["id"], invite_token, invite_expires,
            )
            await accept_pending_invites(conn, user["id"], owner_email)

    invite_url = f"{FRONTEND_URL}/accept-invite?token={invite_token}"
    first_name = req.ownerFullName.strip().split(" ")[0]
    try:
        email_sent = await send_email(
            to=owner_email,
            subject="You're invited to POMAR",
            html=f"""
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #0E1B2C;">Welcome to POMAR</h2>
              <p>Hi {first_name},</p>
              <p>You've been set up as the owner of <strong>{req.companyName.strip()}</strong> on POMAR. Set your password to get started.</p>
              <a href="{invite_url}" style="display:inline-block;padding:12px 24px;background:#D97706;color:white;border-radius:100px;text-decoration:none;font-weight:600;margin:20px 0;">
                Set Your Password
              </a>
              <p style="color:#666;font-size:13px;">This link expires in 7 days.</p>
            </div>""",
        )
    except Exception as e:
        logging.error(f"create_company: invite email failed for {owner_email!r}: {e}")
        email_sent = False

    await user_service.log_admin_activity(
        admin["id"], "company_created", "companies", company["id"],
        {"companyName": req.companyName, "ownerEmail": owner_email},
    )
    return {"success": True, "companyId": company["id"], "userId": user["id"], "email_sent": email_sent}


@router.get("/users")
async def get_admin_users(limit: int = 50, offset: int = 0, admin: dict = Depends(require_super_admin)):
    result = await user_service.get_all_admin_users(limit, offset)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return result


@router.post("/users")
async def create_admin_user(req: CreateAdminRequest, admin: dict = Depends(require_super_admin)):
    result = await user_service.create_admin_user(req.dict())
    if not result["success"]:
        raise HTTPException(400, result["error"])
    await user_service.log_admin_activity(admin["id"], "admin_user_created", "admin_users", result["admin"]["id"], {"email": req.email})
    return result


@router.put("/users/{admin_id}")
async def update_admin_user(admin_id: int, req: UpdateAdminRequest, admin: dict = Depends(require_super_admin)):
    result = await user_service.update_admin_user(admin_id, req.dict(exclude_none=True))
    if not result["success"]:
        raise HTTPException(400, result["error"])
    await user_service.log_admin_activity(admin["id"], "admin_user_updated", "admin_users", admin_id, req.dict())
    return result


@router.delete("/users/{admin_id}")
async def delete_admin_user(admin_id: int, admin: dict = Depends(require_super_admin)):
    result = await user_service.delete_admin_user(admin_id)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    await user_service.log_admin_activity(admin["id"], "admin_user_deleted", "admin_users", admin_id, {})
    return result


@router.get("/activity-log")
async def get_activity_log(
    limit: int = 100, offset: int = 0,
    admin_id: Optional[int] = None, action: Optional[str] = None, resource_type: Optional[str] = None,
    admin: dict = Depends(require_super_admin),
):
    filters = {k: v for k, v in {"admin_id": admin_id, "action": action, "resource_type": resource_type}.items() if v}
    result = await user_service.get_activity_log(limit, offset, filters)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return result


@router.post("/pricing")
async def save_pricing(req: PricingRequest, admin: dict = Depends(require_super_admin)):
    is_global = req.is_global or False
    # module_pricing has two unique constraints: (module_name, is_global) dedupes
    # global rows, (company_id, module_name) dedupes per-company rows. Which one
    # applies depends on is_global, since company_id is NULL for global rows and
    # Postgres never treats NULL = NULL as a conflict.
    if not is_global and req.company_id is None:
        raise HTTPException(400, "company_id is required when is_global is false")
    company_id = req.company_id if not is_global else None
    conflict_target = "(module_name, is_global)" if is_global else "(company_id, module_name)"
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""INSERT INTO module_pricing (is_global, company_id, module_name, monthly_price, billing_cycle, is_active, updated_by_admin_id)
               VALUES ($1,$2,$3,$4,$5,true,$6)
               ON CONFLICT {conflict_target} DO UPDATE SET company_id=$2, monthly_price=$4, billing_cycle=$5, updated_at=NOW(), updated_by_admin_id=$6
               RETURNING *""",
            is_global, company_id, req.module_name, req.monthly_price or 0, req.billing_cycle or "monthly", admin["id"],
        )
    await user_service.log_admin_activity(admin["id"], "pricing_updated", "module_pricing", row["id"], {"module_name": req.module_name, "is_global": is_global, "company_id": company_id})
    return {"success": True, "pricing": dict(row)}


@router.get("/pricing")
async def get_pricing(admin: dict = Depends(require_super_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT mp.*, c.name AS company_name FROM module_pricing mp
               LEFT JOIN companies c ON c.id = mp.company_id
               ORDER BY mp.is_global DESC, mp.module_name ASC"""
        )
    return {"success": True, "pricing": [dict(r) for r in rows]}


@router.post("/feature-flags")
async def save_feature_flags(req: FeatureFlagsRequest, admin: dict = Depends(require_super_admin)):
    # feature_flags has two unique constraints: (feature_key, is_global) dedupes
    # global rows, (company_id, feature_key) dedupes per-company rows. Which one
    # applies depends on is_global, since company_id is NULL for global rows and
    # Postgres never treats NULL = NULL as a conflict.
    if not req.is_global and req.company_id is None:
        raise HTTPException(400, "company_id is required when is_global is false")
    company_id = req.company_id if not req.is_global else None
    conflict_target = "(feature_key, is_global)" if req.is_global else "(company_id, feature_key)"
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            f"""INSERT INTO feature_flags (is_global, company_id, feature_key, feature_name, is_enabled, updated_by_admin_id)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT {conflict_target} DO UPDATE SET is_enabled=$5, updated_by_admin_id=$6, updated_at=NOW()""",
            req.is_global, company_id, req.feature_name, req.feature_name, req.is_enabled, admin["id"],
        )
    await user_service.log_admin_activity(
        admin["id"], "feature_flags_updated", "feature_flags", None,
        {"feature_name": req.feature_name, "is_global": req.is_global, "company_id": company_id},
    )
    return {"success": True, "message": "Feature flag updated"}


@router.get("/feature-flags")
async def get_feature_flags(admin: dict = Depends(require_super_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT ff.feature_key AS key, ff.feature_name AS name, ff.module, ff.is_enabled AS enabled,
                      ff.is_global, ff.company_id, c.name AS company_name
               FROM feature_flags ff
               LEFT JOIN companies c ON c.id = ff.company_id
               ORDER BY ff.is_global DESC, ff.module, ff.feature_name ASC"""
        )
    return {"success": True, "flags": [dict(r) for r in rows]}


@router.get("/analytics")
async def admin_analytics(admin: dict = Depends(require_super_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        users_total = await conn.fetchval("SELECT COUNT(*) FROM users")
        users_last30 = await conn.fetchval("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days'")
        signups_by_day = await conn.fetch(
            "SELECT DATE(created_at) AS day, COUNT(*)::int AS count FROM users WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day"
        )
        vendors_total = await conn.fetchval("SELECT COUNT(*) FROM vendors")
        vendors_insurance = await conn.fetch("SELECT insurance_status, COUNT(*)::int AS count FROM vendors GROUP BY insurance_status")
        vendors_by_trade = await conn.fetch(
            "SELECT trade, COUNT(*)::int AS count FROM vendors WHERE trade IS NOT NULL AND trade != '' GROUP BY trade ORDER BY count DESC LIMIT 8"
        )
        reviews_total = await conn.fetchval("SELECT COUNT(*) FROM vendor_reviews")
        avg_rating = await conn.fetchval(
            "SELECT ROUND(AVG((rating_reliability + rating_cost + rating_quality + rating_communication + rating_insurance)::numeric / 5), 1) FROM vendor_reviews"
        )

    return {
        "success": True,
        "users": {"total": users_total, "last30Days": users_last30, "signupsByDay": [dict(r) for r in signups_by_day]},
        "vendors": {"total": vendors_total, "byInsurance": [dict(r) for r in vendors_insurance], "byTrade": [dict(r) for r in vendors_by_trade]},
        "reviews": {"total": reviews_total, "avgRating": float(avg_rating or 0)},
    }


class UpdateModulesRequest(BaseModel):
    modules: dict  # e.g. {"mail": true, "marketplace": true}


@router.put("/companies/{company_id}/modules")
async def update_company_modules(
    company_id: int,
    req: UpdateModulesRequest,
    admin: dict = Depends(require_super_admin),
):
    """Enable or disable individual modules for a company."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id, active_modules FROM companies WHERE id = $1", company_id)
        if not existing:
            raise HTTPException(404, "Company not found")
        # asyncpg returns jsonb columns as raw JSON text (no codec registered
        # on this pool), not a dict.
        existing_modules = existing["active_modules"] or {}
        if isinstance(existing_modules, str):
            existing_modules = json.loads(existing_modules)
        merged = {**existing_modules, **req.modules}
        row = await conn.fetchrow(
            """
            UPDATE companies
            SET active_modules = $1::jsonb, updated_at = NOW()
            WHERE id = $2
            RETURNING id, active_modules
            """,
            json.dumps(merged),
            company_id,
        )
    await user_service.log_admin_activity(
        admin["id"], "modules_updated", "companies", row["id"],
        {"company_id": company_id, "modules": req.modules},
    )
    active_modules = row["active_modules"]
    if isinstance(active_modules, str):
        active_modules = json.loads(active_modules)
    return {"success": True, "active_modules": active_modules}

import logging
import os
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.admin_auth import get_current_admin, require_super_admin, require_admin, create_token, hash_password, verify_password
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
    region: Optional[str] = "US"
    entityName: Optional[str] = None


class UpdateCompanyDetailsRequest(BaseModel):
    region: Optional[str] = None
    entityName: Optional[str] = None


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
async def create_company(req: CreateCompanyRequest, admin: dict = Depends(require_admin)):
    owner_email = req.ownerEmail.lower().strip()
    invite_token = secrets.token_hex(32)
    invite_expires = datetime.utcnow() + timedelta(days=7)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", owner_email)
            if existing:
                raise HTTPException(400, "An account with this email already exists.")
            region = req.region if req.region in ("US", "IN") else "US"
            company = await conn.fetchrow(
                "INSERT INTO companies (name, region, entity_name) VALUES ($1,$2,$3) RETURNING id",
                req.companyName.strip(), region, (req.entityName or "").strip() or None,
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

            # Mail/Clash/Vendors are free and on by default; Marketplace stays
            # opt-in. Feature flags are the single source of truth for module
            # access — seeded here so nothing needs to be manually configured
            # after company creation.
            await conn.execute(
                """INSERT INTO feature_flags (company_id, feature_key, feature_name, module, is_enabled, is_global)
                   VALUES
                     ($1, 'mail', 'Mail Access', 'mail', true, false),
                     ($1, 'clash', 'Clash Access', 'clash', true, false),
                     ($1, 'vendors', 'Vendors Access', 'vendors', true, false),
                     ($1, 'marketplace', 'Marketplace Access', 'marketplace', false, false),
                     ($1, 'trust', 'POMAR Trust Access', 'trust', false, false),
                     ($1, 'capital', 'Capital Tracker Access', 'capital', false, false)
                   ON CONFLICT (company_id, feature_key) DO NOTHING""",
                company["id"],
            )

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
    module_key: Optional[str] = None, company_id: Optional[int] = None,
    admin: dict = Depends(require_admin),
):
    filters = {k: v for k, v in {
        "admin_id": admin_id, "action": action, "resource_type": resource_type,
        "module_key": module_key, "company_id": company_id,
    }.items() if v}
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
    conflict_target = "(module_name) WHERE is_global = true" if is_global else "(company_id, module_name)"
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
    conflict_target = "(feature_key) WHERE is_global = true" if req.is_global else "(company_id, feature_key)"
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
            """SELECT ff.id, ff.feature_key, ff.feature_name, ff.module, ff.is_enabled,
                      ff.is_global, ff.company_id, c.name AS company_name
               FROM feature_flags ff
               LEFT JOIN companies c ON c.id = ff.company_id
               ORDER BY ff.is_global DESC, ff.module, ff.feature_name ASC"""
        )
    return {"success": True, "flags": [dict(r) for r in rows]}


@router.delete("/feature-flags/{flag_id}")
async def delete_feature_flag(flag_id: int, admin: dict = Depends(require_super_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("DELETE FROM feature_flags WHERE id = $1 RETURNING id", flag_id)
    if not row:
        raise HTTPException(404, "Feature flag not found")
    await user_service.log_admin_activity(admin["id"], "feature_flag_deleted", "feature_flags", flag_id, {})
    return {"success": True}


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


class UpdateStatusRequest(BaseModel):
    status: str  # 'active' | 'inactive'


@router.put("/companies/{company_id}/status")
async def update_company_status(
    company_id: int,
    req: UpdateStatusRequest,
    admin: dict = Depends(require_super_admin),
):
    if req.status not in ("active", "inactive"):
        raise HTTPException(400, "status must be 'active' or 'inactive'")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE companies SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status",
            req.status, company_id,
        )
    if not row:
        raise HTTPException(404, "Company not found")
    await user_service.log_admin_activity(
        admin["id"], "company_status_updated", "companies", company_id, {"status": req.status},
    )
    return {"success": True, "status": row["status"]}


@router.put("/companies/{company_id}/details")
async def update_company_details(
    company_id: int,
    req: UpdateCompanyDetailsRequest,
    admin: dict = Depends(require_super_admin),
):
    if req.region is not None and req.region not in ("US", "IN"):
        raise HTTPException(400, "region must be 'US' or 'IN'")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """UPDATE companies SET
                 region = COALESCE($1, region),
                 entity_name = COALESCE($2, entity_name),
                 updated_at = NOW()
               WHERE id = $3 RETURNING id, region, entity_name""",
            req.region, req.entityName, company_id,
        )
    if not row:
        raise HTTPException(404, "Company not found")
    await user_service.log_admin_activity(
        admin["id"], "company_details_updated", "companies", company_id,
        {"region": req.region, "entityName": req.entityName},
    )
    return {"success": True, "region": row["region"], "entity_name": row["entity_name"]}


@router.get("/companies/{company_id}/team")
async def get_company_team(company_id: int, admin: dict = Depends(require_super_admin)):
    """Trust-role assignment for Super Admin, mirroring the GC Owner-facing
    equivalent in routers/team.py's PUT /api/team/{member_user_id}/trust-role."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, email, full_name, name, permission_level, trust_role
               FROM users WHERE company_id = $1 ORDER BY created_at ASC""",
            company_id,
        )
    return {"success": True, "team": [dict(r) for r in rows]}


class UpdateTrustRoleRequest(BaseModel):
    trust_role: Optional[str] = None  # null clears it


@router.put("/team/{member_user_id}/trust-role")
async def admin_update_trust_role(
    member_user_id: int, req: UpdateTrustRoleRequest, admin: dict = Depends(require_super_admin),
):
    if req.trust_role is not None and req.trust_role not in ("owner", "site_data", "compliance_reviewer"):
        raise HTTPException(400, "trust_role must be 'owner', 'site_data', or 'compliance_reviewer'")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE users SET trust_role = $1 WHERE id = $2 RETURNING id, company_id, trust_role",
            req.trust_role, member_user_id,
        )
    if not row:
        raise HTTPException(404, "User not found")
    await user_service.log_admin_activity(
        admin["id"], "trust_role_updated", "users", member_user_id, {"trust_role": req.trust_role},
    )
    return {"success": True, "trust_role": row["trust_role"]}

import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from db import get_pool
from services.admin_auth import get_current_admin, require_super_admin, create_token, hash_password, verify_password
from services import user_service

router = APIRouter(prefix="/api/admin", tags=["Admin"])


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class CreateAdminRequest(BaseModel):
    email: str
    password: str
    admin_level: str
    client_id: Optional[int] = None
    permissions: Optional[dict] = None


class UpdateAdminRequest(BaseModel):
    is_active: Optional[bool] = None
    permissions: Optional[dict] = None


class PricingRequest(BaseModel):
    module_name: str
    monthly_price: Optional[float] = 0
    billing_cycle: Optional[str] = "monthly"
    is_global: Optional[bool] = False
    client_id: Optional[int] = None


class FeatureFlagsRequest(BaseModel):
    flags: List[dict]


@router.post("/auth/login")
async def admin_login(req: AdminLoginRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        admin = await conn.fetchrow(
            "SELECT id, email, password_hash, admin_level, client_id, is_active FROM admin_users WHERE email = $1",
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
            "SELECT id, email, admin_level, client_id, is_active, created_at, last_login FROM admin_users WHERE id = $1",
            admin["id"],
        )
    if not row:
        raise HTTPException(404, "Admin not found")
    return {"success": True, "admin": dict(row)}


@router.get("/clients")
async def get_clients(limit: int = 50, offset: int = 0, admin: dict = Depends(require_super_admin)):
    result = await user_service.get_all_clients(limit, offset)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return result


@router.get("/clients/{client_id}")
async def get_client(client_id: int, admin: dict = Depends(require_super_admin)):
    result = await user_service.get_client(client_id)
    if not result["success"]:
        raise HTTPException(404, result["error"])
    return result


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
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO module_pricing (is_global, client_id, module_name, monthly_price, billing_cycle, is_active, updated_by_admin_id)
               VALUES ($1,$2,$3,$4,$5,true,$6)
               ON CONFLICT (module_name, is_global) DO UPDATE SET monthly_price=$4, billing_cycle=$5, updated_at=NOW(), updated_by_admin_id=$6
               RETURNING *""",
            req.is_global or False, req.client_id, req.module_name, req.monthly_price or 0, req.billing_cycle or "monthly", admin["id"],
        )
    await user_service.log_admin_activity(admin["id"], "pricing_updated", "module_pricing", row["id"], {"module_name": req.module_name})
    return {"success": True, "pricing": dict(row)}


@router.get("/pricing")
async def get_pricing(admin: dict = Depends(require_super_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM module_pricing WHERE is_global = true ORDER BY module_name ASC")
    return {"success": True, "pricing": [dict(r) for r in rows]}


@router.post("/feature-flags")
async def save_feature_flags(req: FeatureFlagsRequest, admin: dict = Depends(require_super_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        for flag in req.flags:
            await conn.execute(
                """INSERT INTO feature_flags (is_global, feature_key, feature_name, module, is_enabled, updated_by_admin_id)
                   VALUES (true,$1,$2,$3,$4,$5)
                   ON CONFLICT (feature_key, is_global) DO UPDATE SET is_enabled=$4, updated_by_admin_id=$5, updated_at=NOW()""",
                flag["key"], flag["name"], flag["module"], flag["enabled"], admin["id"],
            )
    await user_service.log_admin_activity(admin["id"], "feature_flags_updated", "feature_flags", None, {"count": len(req.flags)})
    return {"success": True, "message": "Feature flags updated"}


@router.get("/feature-flags")
async def get_feature_flags(admin: dict = Depends(require_super_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT feature_key as key, feature_name as name, module, is_enabled as enabled FROM feature_flags WHERE is_global = true ORDER BY module, feature_name ASC"
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

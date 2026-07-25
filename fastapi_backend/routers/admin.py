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
from services.invoice_helpers import find_or_create_accountant_lead_account, upsert_accountant_invite
from services.magic_link import issue_magic_link
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


class InviteAccountantAdminRequest(BaseModel):
    email: str
    name: Optional[str] = None


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
                     ($1, 'capital', 'Capital Tracker Access', 'capital', false, false),
                     ($1, 'daily_logs', 'Daily Logs Access', 'daily_logs', false, false),
                     ($1, 'invoice_tracker', 'Invoice Tracker Access', 'invoice_tracker', false, false)
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


@router.post("/companies/{company_id}/invite-accountant")
async def invite_accountant_admin(
    company_id: int, req: InviteAccountantAdminRequest, admin: dict = Depends(require_super_admin),
):
    """Admin-portal counterpart to routers/invoice_accountant_access.py's
    GC-owner-triggered invite_accountant — same grant, same
    company_accountant_access row, but with invited_by_admin_id set
    instead of invited_by_user_id since there's no acting `users` row
    here. Doesn't require the company to have 'invoice_tracker' enabled —
    POMAR staff may be setting this up as part of turning the module on
    for a client, not after."""
    email = req.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "A valid email is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        company = await conn.fetchrow("SELECT id, name FROM companies WHERE id = $1", company_id)
        if not company:
            raise HTTPException(404, "Company not found")

        accountant_user_id = await find_or_create_accountant_lead_account(
            conn, email, req.name or email.split("@")[0],
        )

        existing = await conn.fetchrow(
            "SELECT status FROM company_accountant_access WHERE company_id = $1 AND accountant_user_id = $2",
            company_id, accountant_user_id,
        )
        if existing and existing["status"] == "accepted":
            raise HTTPException(409, "This accountant already has access to this company")

        row = await upsert_accountant_invite(conn, company_id, accountant_user_id, invited_by_admin_id=admin["id"])
        link = await issue_magic_link(conn, email, FRONTEND_URL, path="/accountant")

    is_reinvite = bool(existing)
    try:
        email_sent = await send_email(
            to=email,
            subject=f"{'Reinvited' if is_reinvite else 'Invited'} to view invoices for {company['name']} on POMAR",
            html=f"""<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
              <p>You've been {'re-' if is_reinvite else ''}invited to view and download invoices
                 for <strong>{company['name']}</strong> on POMAR Invoice Tracker.</p>
              <a href="{link}" style="display:inline-block;padding:12px 24px;background:#D97706;color:#fff;
                 text-decoration:none;border-radius:100px;font-weight:600;">Accept invite</a>
              <p style="color:#666;font-size:13px;">This link expires in 24 hours.</p>
            </div>""",
        )
    except Exception as e:
        logging.error(f"invite_accountant_admin: invite email failed for {email!r}: {e}")
        email_sent = False

    await user_service.log_admin_activity(
        admin["id"], "accountant_invited", "company_accountant_access", row["id"],
        {"company_id": company_id, "email": email},
    )
    return {"success": True, "access": dict(row), "email_sent": email_sent}


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


# ── Marketplace: removal requests, admin-added listings, review moderation ──

@router.get("/marketplace/removal-requests")
async def list_removal_requests(
    status: Optional[str] = None, limit: int = 50, offset: int = 0,
    admin: dict = Depends(require_admin),
):
    pool = await get_pool()
    query = """SELECT rr.*, mvd.name AS listing_name
               FROM marketplace_removal_requests rr
               JOIN marketplace_listings ml ON ml.id = rr.listing_id
               LEFT JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id
               WHERE 1=1"""
    params = []
    if status:
        params.append(status)
        query += f" AND rr.status = ${len(params)}"
    query += f" ORDER BY rr.created_at DESC LIMIT ${len(params)+1} OFFSET ${len(params)+2}"
    params.extend([limit, offset])
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        total = await conn.fetchval("SELECT COUNT(*) FROM marketplace_removal_requests")
    return {"success": True, "requests": [dict(r) for r in rows], "total": total}


class ResolveRemovalRequestRequest(BaseModel):
    status: str  # 'approved' | 'denied'
    resolution_note: Optional[str] = None


@router.patch("/marketplace/removal-requests/{request_id}")
async def resolve_removal_request(
    request_id: str, req: ResolveRemovalRequestRequest, admin: dict = Depends(require_admin),
):
    if req.status not in ("approved", "denied"):
        raise HTTPException(400, "status must be 'approved' or 'denied'")
    pool = await get_pool()
    async with pool.acquire() as conn:
        removal_request = await conn.fetchrow(
            "SELECT * FROM marketplace_removal_requests WHERE id = $1", request_id
        )
        if not removal_request:
            raise HTTPException(404, "Removal request not found")
        async with conn.transaction():
            updated = await conn.fetchrow(
                """UPDATE marketplace_removal_requests
                   SET status = $1, resolution_note = $2, resolved_by_admin_id = $3, resolved_at = NOW()
                   WHERE id = $4 RETURNING *""",
                req.status, req.resolution_note, admin["id"], request_id,
            )
            if req.status == "approved":
                # Confirmed legitimate by Admin — only now does the listing
                # actually come down, never automatically on request alone
                # (see routers/marketplace.py's request_listing_removal).
                await conn.execute(
                    "UPDATE marketplace_listings SET status = 'removed', updated_at = NOW() WHERE id = $1",
                    updated["listing_id"],
                )
    await user_service.log_admin_activity(
        admin["id"], "removal_request_resolved", "marketplace_removal_request", None,
        {"request_id": request_id, "status": req.status},
    )
    return {"success": True, "request": dict(updated)}


class AdminCreateListingRequest(BaseModel):
    listing_type_slug: str
    name: str
    trade: Optional[str] = None
    location: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    attestation_note: str


@router.post("/marketplace/listings")
async def admin_create_listing(req: AdminCreateListingRequest, admin: dict = Depends(require_admin)):
    """Admin path for the same attestation-required listing add as
    routers/marketplace.py's POST /api/marketplace/listings — the GC path
    there requires an active, type='gc' account; this is the Admin
    equivalent, attesting on the platform's behalf."""
    from routers.marketplace import CreateListingRequest, _create_listing_with_attestation

    create_req = CreateListingRequest(**req.dict())
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            listing = await _create_listing_with_attestation(conn, create_req, None, admin.get("company_id"))
    await user_service.log_admin_activity(
        admin["id"], "listing_added", "marketplace_listing", None,
        {"attestation_note": listing["attestation_note"]},
    )
    return {"success": True, "listing": listing}


class HideReviewRequest(BaseModel):
    reason: str


@router.patch("/marketplace/reviews/{review_id}/hide")
async def hide_review(review_id: str, req: HideReviewRequest, admin: dict = Depends(require_admin)):
    """Admin can only hide/remove a review, never edit its content — see the
    identical rationale on routers/marketplace.py's update_review (Section
    230: the platform moderates visibility, it doesn't editorialize what a
    reviewer said)."""
    if not req.reason or not req.reason.strip():
        raise HTTPException(400, "reason is required")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """UPDATE marketplace_reviews
               SET is_hidden = true, hidden_by_admin_id = $1, hidden_reason = $2, hidden_at = NOW()
               WHERE id = $3 RETURNING *""",
            admin["id"], req.reason.strip(), review_id,
        )
    if not row:
        raise HTTPException(404, "Review not found")
    await user_service.log_admin_activity(
        admin["id"], "review_hidden", "marketplace_review", None, {"review_id": review_id, "reason": req.reason},
    )
    return {"success": True, "review": dict(row)}

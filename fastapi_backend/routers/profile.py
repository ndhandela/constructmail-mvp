import bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.access_control import get_active_modules

router = APIRouter(prefix="/api/profile", tags=["Profile"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_user(conn, user_id: int):
    row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(404, "User not found")
    return row


# ── Request models ────────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name:  Optional[str] = None
    phone:      Optional[str] = None
    job_title:  Optional[str] = None


class UpdateCompanyRequest(BaseModel):
    company_name:    Optional[str] = None
    company_phone:   Optional[str] = None
    company_address: Optional[str] = None
    company_city:    Optional[str] = None
    company_state:   Optional[str] = None
    company_zip:     Optional[str] = None
    company_website: Optional[str] = None
    company_size:    Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password:     str
    new_password:         str
    confirm_new_password: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def get_profile(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await _get_user(conn, userId)
        company = await conn.fetchrow(
            "SELECT * FROM clients WHERE user_id = $1", userId
        )
        active_modules = await get_active_modules(conn, user["company_id"])

    profile = {
        "id":               user["id"],
        "email":            user["email"],
        "name":             user["name"],
        "full_name":        user["full_name"],
        "first_name":       user["first_name"],
        "last_name":        user["last_name"],
        "phone":            user["phone"],
        "job_title":        user["job_title"],
        "avatar_url":       user["avatar_url"],
        "role":             user["role"],
        "company":          user["company"],
        "company_id":       user["company_id"],
        "permission_level": user["permission_level"],
        "active_modules":   active_modules,
    }

    company_data = dict(company) if company else {
        "company_name":    user["company"],
        "company_phone":   None,
        "company_address": None,
        "company_city":    None,
        "company_state":   None,
        "company_zip":     None,
        "company_website": None,
        "company_size":    None,
    }
    # strip internal id/user_id from response
    company_data.pop("id", None)
    company_data.pop("user_id", None)

    return {"success": True, "profile": profile, "company": company_data}


@router.put("")
async def update_profile(req: UpdateProfileRequest, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _get_user(conn, userId)

        updates = {k: v for k, v in req.dict().items() if v is not None}
        if not updates:
            raise HTTPException(400, "No fields provided to update")

        set_parts = ", ".join(
            f"{col} = ${i+2}" for i, col in enumerate(updates)
        )
        set_parts += f", updated_at = NOW()"
        values = list(updates.values())

        row = await conn.fetchrow(
            f"""UPDATE users SET {set_parts} WHERE id = $1
                RETURNING id, email, name, full_name, first_name, last_name,
                          phone, job_title, avatar_url, role, company""",
            userId, *values,
        )

    return {"success": True, "profile": dict(row)}


@router.put("/company")
async def update_company(req: UpdateCompanyRequest, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await _get_user(conn, userId)

        # Only admin or owner roles may update company info
        allowed_roles = {"admin", "owner", "Admin", "Owner"}
        if user["role"] not in allowed_roles:
            raise HTTPException(403, "Only account admins can update company information")

        updates = {k: v for k, v in req.dict().items() if v is not None}
        if not updates:
            raise HTTPException(400, "No fields provided to update")

        # Upsert into clients table
        existing = await conn.fetchrow(
            "SELECT id FROM clients WHERE user_id = $1", userId
        )

        if not existing:
            cols = ", ".join(updates.keys())
            placeholders = ", ".join(f"${i+2}" for i in range(len(updates)))
            row = await conn.fetchrow(
                f"""INSERT INTO clients (user_id, {cols})
                    VALUES ($1, {placeholders})
                    RETURNING *""",
                userId, *updates.values(),
            )
        else:
            set_parts = ", ".join(
                f"{col} = ${i+2}" for i, col in enumerate(updates)
            )
            set_parts += ", updated_at = NOW()"
            row = await conn.fetchrow(
                f"""UPDATE clients SET {set_parts} WHERE user_id = $1
                    RETURNING *""",
                userId, *updates.values(),
            )

    result = dict(row)
    result.pop("id", None)
    result.pop("user_id", None)
    return {"success": True, "company": result}


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest, userId: int):
    if req.new_password != req.confirm_new_password:
        raise HTTPException(400, "New passwords do not match")
    if len(req.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")

    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, password_hash FROM users WHERE id = $1", userId
        )
        if not user:
            raise HTTPException(404, "User not found")
        if not user["password_hash"]:
            raise HTTPException(400, "This account uses magic link login and does not have a password")

        if not bcrypt.checkpw(req.current_password.encode(), user["password_hash"].encode()):
            raise HTTPException(400, "Current password is incorrect")

        new_hash = bcrypt.hashpw(req.new_password.encode(), bcrypt.gensalt(12)).decode()
        await conn.execute(
            "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
            new_hash, userId,
        )

    return {"success": True, "message": "Password updated successfully"}

import json
import bcrypt
from db import get_pool


async def get_all_clients(limit: int = 50, offset: int = 0) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT u.id, u.email, u.name, u.company, u.created_at,
                      COUNT(DISTINCT p.id) as project_count,
                      cs.active_modules, cs.created_at as subscription_date
               FROM users u
               LEFT JOIN projects p ON u.id = p.user_id
               LEFT JOIN client_subscriptions cs ON u.id = cs.client_id
               GROUP BY u.id, cs.id
               ORDER BY u.created_at DESC LIMIT $1 OFFSET $2""",
            limit, offset,
        )
        total = await conn.fetchval("SELECT COUNT(*) FROM users")
        return {"success": True, "clients": [dict(r) for r in rows], "total": total}


async def get_client(client_id: int) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT u.id, u.email, u.name, u.company, u.created_at,
                      COUNT(DISTINCT p.id) as project_count, cs.active_modules
               FROM users u
               LEFT JOIN projects p ON u.id = p.user_id
               LEFT JOIN client_subscriptions cs ON u.id = cs.client_id
               WHERE u.id = $1 GROUP BY u.id, cs.id""",
            client_id,
        )
        if not row:
            return {"success": False, "error": "Client not found"}
        return {"success": True, "client": dict(row)}


async def get_all_admin_users(limit: int = 50, offset: int = 0) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT a.id, a.email, a.admin_level, a.client_id, a.permissions,
                      a.is_active, a.created_at, a.last_login,
                      u.name as client_name, u.company as client_company
               FROM admin_users a LEFT JOIN users u ON a.client_id = u.id
               ORDER BY a.created_at DESC LIMIT $1 OFFSET $2""",
            limit, offset,
        )
        total = await conn.fetchval("SELECT COUNT(*) FROM admin_users")
        return {"success": True, "admins": [dict(r) for r in rows], "total": total}


async def create_admin_user(data: dict) -> dict:
    pool = await get_pool()
    email = data.get("email")
    password = data.get("password")
    admin_level = data.get("admin_level")
    client_id = data.get("client_id")
    permissions = data.get("permissions", {"pricing": True, "features": True, "users": True})

    if not email or not password or not admin_level:
        return {"success": False, "error": "Email, password, and admin_level required"}
    if admin_level not in ("super_admin", "client_admin"):
        return {"success": False, "error": "Invalid admin_level"}
    if admin_level == "client_admin" and not client_id:
        return {"success": False, "error": "client_id required for client_admin"}

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()

    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """INSERT INTO admin_users (email, password_hash, admin_level, client_id, permissions, is_active)
                   VALUES ($1,$2,$3,$4,$5,true)
                   RETURNING id, email, admin_level, client_id, permissions, is_active, created_at""",
                email, password_hash, admin_level, client_id, json.dumps(permissions),
            )
            return {"success": True, "admin": dict(row)}
        except Exception as e:
            if "23505" in str(e):
                return {"success": False, "error": "Email already exists"}
            return {"success": False, "error": str(e)}


async def update_admin_user(admin_id: int, updates: dict) -> dict:
    pool = await get_pool()
    allowed = ["is_active", "permissions"]
    fields, values = [], []
    p = 1
    for key, val in updates.items():
        if key in allowed:
            fields.append(f"{key} = ${p}")
            values.append(json.dumps(val) if key == "permissions" else val)
            p += 1
    if not fields:
        return {"success": False, "error": "No valid fields to update"}
    values.append(admin_id)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE admin_users SET {', '.join(fields)}, updated_at = NOW() WHERE id = ${p} RETURNING *", *values
        )
        if not row:
            return {"success": False, "error": "Admin user not found"}
        return {"success": True, "admin": dict(row)}


async def delete_admin_user(admin_id: int) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("DELETE FROM admin_users WHERE id = $1 RETURNING id, email", admin_id)
        if not row:
            return {"success": False, "error": "Admin user not found"}
        return {"success": True, "deleted": dict(row)}


async def get_activity_log(limit: int = 100, offset: int = 0, filters: dict = {}) -> dict:
    pool = await get_pool()
    query = "SELECT aal.*, au.email as admin_email FROM admin_activity_log aal LEFT JOIN admin_users au ON aal.admin_user_id = au.id WHERE 1=1"
    params = []
    p = 1
    if filters.get("admin_id"):
        query += f" AND aal.admin_user_id = ${p}"
        params.append(filters["admin_id"])
        p += 1
    if filters.get("action"):
        query += f" AND aal.action = ${p}"
        params.append(filters["action"])
        p += 1
    if filters.get("resource_type"):
        query += f" AND aal.resource_type = ${p}"
        params.append(filters["resource_type"])
        p += 1
    query += f" ORDER BY aal.created_at DESC LIMIT ${p} OFFSET ${p+1}"
    params.extend([limit, offset])
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        total = await conn.fetchval("SELECT COUNT(*) FROM admin_activity_log")
        return {"success": True, "logs": [dict(r) for r in rows], "total": total}


async def log_admin_activity(admin_user_id: int, action: str, resource_type: str, resource_id, changes=None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                """INSERT INTO admin_activity_log (admin_user_id, action, resource_type, resource_id, changes)
                   VALUES ($1,$2,$3,$4,$5)""",
                admin_user_id, action, resource_type, resource_id,
                json.dumps(changes) if changes else None,
            )
        except Exception as e:
            print("Log activity error:", e)

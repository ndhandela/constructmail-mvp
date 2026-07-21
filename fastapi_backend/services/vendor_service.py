import bcrypt
from db import get_pool


ALLOWED_VENDOR_FIELDS = [
    "name", "trade", "phone", "email", "address", "city", "state", "zip",
    "website", "insurance_status", "insurance_expiry"
]


async def create_vendor(data: dict, project_id: int | None = None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """INSERT INTO vendors (name, trade, phone, email, address, city, state, zip, website, insurance_status, insurance_expiry)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *""",
                    data.get("name"), data.get("trade"), data.get("phone"), data.get("email"),
                    data.get("address"), data.get("city"), data.get("state"), data.get("zip"),
                    data.get("website"), data.get("insurance_status"), data.get("insurance_expiry"),
                )
                # Link to the project the user was scoped to when they added
                # this vendor — otherwise it's created but invisible the
                # moment a project filter is applied (search_vendors inner-
                # joins project_vendors), which looked like "vendors don't
                # load after I add one."
                if project_id:
                    await conn.execute(
                        """INSERT INTO project_vendors (project_id, vendor_id) VALUES ($1,$2)
                           ON CONFLICT (project_id, vendor_id) DO NOTHING""",
                        project_id, row["id"],
                    )
            return {"success": True, "vendor": dict(row)}
        except Exception as e:
            return {"success": False, "error": str(e)}


async def get_vendor(vendor_id: int) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM vendors WHERE id = $1", vendor_id)
        if not row:
            return {"success": False, "error": "Vendor not found"}
        return {"success": True, "vendor": dict(row)}


async def search_vendors(filters: dict) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        select_clause = "SELECT v.*"
        from_clause = "FROM vendors v"
        params = []
        p = 1

        if filters.get("project_id"):
            select_clause = "SELECT DISTINCT v.*"
            from_clause += f" JOIN project_vendors pv ON pv.vendor_id = v.id AND pv.project_id = ${p}"
            params.append(int(filters["project_id"]))
            p += 1

        query = f"{select_clause} {from_clause} WHERE 1=1"

        if filters.get("search"):
            query += f" AND (LOWER(v.name) LIKE LOWER(${p}) OR LOWER(v.trade) LIKE LOWER(${p}))"
            params.append(f"%{filters['search']}%")
            p += 1
        if filters.get("trade"):
            query += f" AND LOWER(v.trade) = LOWER(${p})"
            params.append(filters["trade"])
            p += 1
        if filters.get("city"):
            query += f" AND LOWER(v.city) = LOWER(${p})"
            params.append(filters["city"])
            p += 1
        if filters.get("insurance_status"):
            query += f" AND v.insurance_status = ${p}"
            params.append(filters["insurance_status"])
            p += 1
        if filters.get("min_rating"):
            query += f" AND v.avg_rating >= ${p}"
            params.append(float(filters["min_rating"]))
            p += 1

        sort_map = {"rating": "v.avg_rating DESC", "name": "v.name ASC", "newest": "v.created_at DESC", "reviews": "v.review_count DESC"}
        query += f" ORDER BY {sort_map.get(filters.get('sort', 'newest'), 'v.created_at DESC')}"

        limit = int(filters.get("limit", 50))
        offset = int(filters.get("offset", 0))
        query += f" LIMIT ${p} OFFSET ${p+1}"
        params.extend([limit, offset])

        rows = await conn.fetch(query, *params)
        return {"success": True, "vendors": [dict(r) for r in rows], "total": len(rows)}


async def link_vendor_to_project(vendor_id: int, project_id: int) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        vendor = await conn.fetchval("SELECT id FROM vendors WHERE id = $1", vendor_id)
        if not vendor:
            return {"success": False, "error": "Vendor not found"}
        project = await conn.fetchval("SELECT id FROM projects WHERE id = $1", project_id)
        if not project:
            return {"success": False, "error": "Project not found"}
        row = await conn.fetchrow(
            """INSERT INTO project_vendors (project_id, vendor_id) VALUES ($1,$2)
               ON CONFLICT (project_id, vendor_id) DO NOTHING RETURNING *""",
            project_id, vendor_id,
        )
        if not row:
            row = await conn.fetchrow(
                "SELECT * FROM project_vendors WHERE project_id = $1 AND vendor_id = $2",
                project_id, vendor_id,
            )
        return {"success": True, "link": dict(row)}


async def update_vendor(vendor_id: int, updates: dict) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        fields, values = [], []
        p = 1
        for key, val in updates.items():
            if key in ALLOWED_VENDOR_FIELDS and val is not None:
                fields.append(f"{key} = ${p}")
                values.append(val)
                p += 1
        if not fields:
            return {"success": False, "error": "No valid fields to update"}
        values.append(vendor_id)
        row = await conn.fetchrow(
            f"UPDATE vendors SET {', '.join(fields)}, updated_at = NOW() WHERE id = ${p} RETURNING *", *values
        )
        if not row:
            return {"success": False, "error": "Vendor not found"}
        return {"success": True, "vendor": dict(row)}


async def _update_vendor_rating(conn, vendor_id: int):
    await conn.execute(
        """UPDATE vendors SET
           avg_rating = (SELECT AVG((rating_reliability + rating_cost + rating_quality + rating_communication + rating_insurance) / 5.0) FROM vendor_reviews WHERE vendor_id = $1),
           review_count = (SELECT COUNT(*) FROM vendor_reviews WHERE vendor_id = $1)
           WHERE id = $1""",
        vendor_id,
    )


async def add_review(vendor_id: int, user_id: int, review_data: dict) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM vendor_reviews WHERE vendor_id = $1 AND user_id = $2", vendor_id, user_id)
        if existing:
            return {"success": False, "error": "User has already reviewed this vendor"}
        row = await conn.fetchrow(
            """INSERT INTO vendor_reviews (vendor_id, user_id, rating_reliability, rating_cost, rating_quality, rating_communication, rating_insurance, comment)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *""",
            vendor_id, user_id,
            review_data.get("rating_reliability"), review_data.get("rating_cost"),
            review_data.get("rating_quality"), review_data.get("rating_communication"),
            review_data.get("rating_insurance"), review_data.get("comment"),
        )
        await _update_vendor_rating(conn, vendor_id)
        return {"success": True, "review": dict(row)}


async def get_vendor_reviews(vendor_id: int, limit: int = 10, offset: int = 0) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT vr.*, u.name as reviewer_name FROM vendor_reviews vr
               LEFT JOIN users u ON vr.user_id = u.id
               WHERE vr.vendor_id = $1 ORDER BY vr.created_at DESC LIMIT $2 OFFSET $3""",
            vendor_id, limit, offset,
        )
        return {"success": True, "reviews": [dict(r) for r in rows]}


async def bulk_import_vendors(vendors_array: list, user_id: int, project_id: int | None = None) -> dict:
    pool = await get_pool()
    imported, failed = [], []
    async with pool.acquire() as conn:
        for i, vendor in enumerate(vendors_array):
            if not vendor.get("name") or not vendor.get("trade"):
                failed.append({"row": i + 1, "error": "Missing name or trade"})
                continue
            try:
                row = await conn.fetchrow(
                    """INSERT INTO vendors (name, trade, phone, email, address, city, state, zip, website, insurance_status)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (name, city) DO NOTHING RETURNING id""",
                    vendor.get("name"), vendor.get("trade"), vendor.get("phone"),
                    vendor.get("email"), vendor.get("address"), vendor.get("city"),
                    vendor.get("state"), vendor.get("zip"), vendor.get("website"),
                    vendor.get("insurance_status", "not_verified"),
                )
                if row:
                    imported.append({"id": row["id"], "name": vendor["name"]})
                    await conn.execute(
                        "INSERT INTO vendor_imports (user_id, vendor_id, import_date, source) VALUES ($1,$2,NOW(),'csv')",
                        user_id, row["id"],
                    )
                    # Same project-linking gap as create_vendor — an
                    # imported vendor is invisible under a project filter
                    # until it's tied to that project.
                    if project_id:
                        await conn.execute(
                            """INSERT INTO project_vendors (project_id, vendor_id) VALUES ($1,$2)
                               ON CONFLICT (project_id, vendor_id) DO NOTHING""",
                            project_id, row["id"],
                        )
            except Exception as e:
                failed.append({"row": i + 1, "error": str(e)})
    return {"success": True, "imported": imported, "failed": failed}


async def claim_vendor_account(vendor_id: int, email: str, password: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM vendor_accounts WHERE vendor_id = $1", vendor_id)
        if existing:
            return {"success": False, "error": "Vendor account already claimed"}
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()
        row = await conn.fetchrow(
            "INSERT INTO vendor_accounts (vendor_id, email, password_hash, is_verified) VALUES ($1,$2,$3,false) RETURNING id",
            vendor_id, email, password_hash,
        )
        return {"success": True, "account": dict(row)}

import json
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.project_helpers import require_project_member

router = APIRouter(prefix="/api/marketplace", tags=["Marketplace"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _has_marketplace_license(user_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT active_modules FROM client_subscriptions WHERE client_id = $1",
            user_id,
        )
    if not row or not row["active_modules"]:
        return False
    # asyncpg returns jsonb columns as raw JSON text (no codec registered on
    # this pool), not a dict.
    active_modules = row["active_modules"]
    if isinstance(active_modules, str):
        active_modules = json.loads(active_modules)
    return bool(active_modules.get("marketplace"))


async def _require_marketplace_license(user_id: int):
    """Raise 403 if the user's client does not have marketplace = true."""
    if not await _has_marketplace_license(user_id):
        raise HTTPException(403, "Marketplace license required")


# ── Request models ────────────────────────────────────────────────────────────

class CreateListingRequest(BaseModel):
    listing_type_slug: str
    name: str
    trade: Optional[str] = None
    location: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None


class ReviewRequest(BaseModel):
    rating: int
    comment: Optional[str] = None


class SaveToProjectRequest(BaseModel):
    projectId: int


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/license")
async def get_marketplace_license(userId: int):
    """Self-service license check — lets the dashboard render Marketplace as
    a locked card instead of guessing via a 403 probe."""
    return {"success": True, "licensed": await _has_marketplace_license(userId)}


@router.get("/types")
async def get_listing_types():
    """Public — returns all active listing types."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, slug, label FROM marketplace_listing_types WHERE is_active = true ORDER BY label"
        )
    return {"success": True, "types": [dict(r) for r in rows]}


@router.get("/listings")
async def get_listings(
    userId: int,
    type: Optional[str] = Query(None, description="Listing type slug, e.g. 'vendor'"),
):
    await _require_marketplace_license(userId)
    pool = await get_pool()
    async with pool.acquire() as conn:
        if type:
            rows = await conn.fetch(
                """
                SELECT
                    ml.id, ml.status, ml.created_at,
                    mlt.slug  AS listing_type,
                    mlt.label AS listing_type_label,
                    mvd.name, mvd.trade, mvd.location,
                    mvd.contact_email, mvd.contact_phone,
                    mvd.website, mvd.description,
                    COALESCE(AVG(mr.rating), 0)::numeric(3,2) AS avg_rating,
                    COUNT(mr.id)::int                          AS review_count
                FROM marketplace_listings ml
                JOIN marketplace_listing_types mlt ON mlt.id = ml.listing_type_id
                LEFT JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id
                LEFT JOIN marketplace_reviews        mr  ON mr.listing_id  = ml.id
                WHERE ml.status = 'active' AND mlt.slug = $1
                GROUP BY ml.id, mlt.slug, mlt.label,
                         mvd.name, mvd.trade, mvd.location,
                         mvd.contact_email, mvd.contact_phone,
                         mvd.website, mvd.description
                ORDER BY ml.created_at DESC
                """,
                type,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT
                    ml.id, ml.status, ml.created_at,
                    mlt.slug  AS listing_type,
                    mlt.label AS listing_type_label,
                    mvd.name, mvd.trade, mvd.location,
                    mvd.contact_email, mvd.contact_phone,
                    mvd.website, mvd.description,
                    COALESCE(AVG(mr.rating), 0)::numeric(3,2) AS avg_rating,
                    COUNT(mr.id)::int                          AS review_count
                FROM marketplace_listings ml
                JOIN marketplace_listing_types mlt ON mlt.id = ml.listing_type_id
                LEFT JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id
                LEFT JOIN marketplace_reviews        mr  ON mr.listing_id  = ml.id
                WHERE ml.status = 'active'
                GROUP BY ml.id, mlt.slug, mlt.label,
                         mvd.name, mvd.trade, mvd.location,
                         mvd.contact_email, mvd.contact_phone,
                         mvd.website, mvd.description
                ORDER BY ml.created_at DESC
                """
            )
    return {"success": True, "listings": [dict(r) for r in rows]}


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str, userId: int):
    await _require_marketplace_license(userId)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                ml.id, ml.status, ml.created_at,
                mlt.slug  AS listing_type,
                mlt.label AS listing_type_label,
                mvd.name, mvd.trade, mvd.location,
                mvd.contact_email, mvd.contact_phone,
                mvd.website, mvd.description,
                COALESCE(AVG(mr.rating), 0)::numeric(3,2) AS avg_rating,
                COUNT(mr.id)::int                          AS review_count
            FROM marketplace_listings ml
            JOIN marketplace_listing_types mlt ON mlt.id = ml.listing_type_id
            LEFT JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id
            LEFT JOIN marketplace_reviews        mr  ON mr.listing_id  = ml.id
            WHERE ml.id = $1
            GROUP BY ml.id, mlt.slug, mlt.label,
                     mvd.name, mvd.trade, mvd.location,
                     mvd.contact_email, mvd.contact_phone,
                     mvd.website, mvd.description
            """,
            listing_id,
        )
        if not row:
            raise HTTPException(404, "Listing not found")

        reviews = await conn.fetch(
            """
            SELECT id, rating, comment, created_at,
                   reviewer_user_id
            FROM marketplace_reviews
            WHERE listing_id = $1
            ORDER BY created_at DESC
            """,
            listing_id,
        )

    return {
        "success": True,
        "listing": dict(row),
        "reviews": [dict(r) for r in reviews],
    }


@router.post("/listings")
async def create_listing(req: CreateListingRequest, userId: int):
    await _require_marketplace_license(userId)
    pool = await get_pool()
    async with pool.acquire() as conn:
        listing_type = await conn.fetchrow(
            "SELECT id FROM marketplace_listing_types WHERE slug = $1 AND is_active = true",
            req.listing_type_slug,
        )
        if not listing_type:
            raise HTTPException(400, f"Unknown listing type: {req.listing_type_slug}")

        listing = await conn.fetchrow(
            """
            INSERT INTO marketplace_listings
                (listing_type_id, submitted_by_user_id, status)
            VALUES ($1, $2, 'active')
            RETURNING id, status, created_at
            """,
            listing_type["id"],
            userId,
        )

        details = await conn.fetchrow(
            """
            INSERT INTO marketplace_vendor_details
                (listing_id, name, trade, location,
                 contact_email, contact_phone, website, description)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING *
            """,
            listing["id"],
            req.name, req.trade, req.location,
            req.contact_email, req.contact_phone,
            req.website, req.description,
        )

    return {
        "success": True,
        "listing": {**dict(listing), **dict(details)},
    }


@router.post("/listings/{listing_id}/reviews")
async def add_review(listing_id: str, req: ReviewRequest, userId: int):
    await _require_marketplace_license(userId)
    if not (1 <= req.rating <= 5):
        raise HTTPException(400, "Rating must be between 1 and 5")

    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT id FROM marketplace_listings WHERE id = $1", listing_id
        )
        if not exists:
            raise HTTPException(404, "Listing not found")

        duplicate = await conn.fetchval(
            "SELECT id FROM marketplace_reviews WHERE listing_id = $1 AND reviewer_user_id = $2",
            listing_id, userId,
        )
        if duplicate:
            raise HTTPException(409, "You have already reviewed this listing")

        review = await conn.fetchrow(
            """
            INSERT INTO marketplace_reviews
                (listing_id, reviewer_user_id, rating, comment)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            """,
            listing_id, userId, req.rating, req.comment,
        )

    return {"success": True, "review": dict(review)}


# ── Save a listing to a specific project ─────────────────────────────────────

@router.post("/listings/{listing_id}/save-to-project")
async def save_listing_to_project(listing_id: str, req: SaveToProjectRequest, userId: int):
    await _require_marketplace_license(userId)
    pool = await get_pool()
    async with pool.acquire() as conn:
        listing_exists = await conn.fetchval(
            "SELECT id FROM marketplace_listings WHERE id = $1", listing_id
        )
        if not listing_exists:
            raise HTTPException(404, "Listing not found")
        project_exists = await conn.fetchval(
            "SELECT id FROM projects WHERE id = $1", req.projectId
        )
        if not project_exists:
            raise HTTPException(404, "Project not found")
        await require_project_member(conn, req.projectId, userId)

        row = await conn.fetchrow(
            """INSERT INTO project_marketplace_saves (project_id, listing_id, saved_by_user_id)
               VALUES ($1,$2,$3)
               ON CONFLICT (project_id, listing_id) DO NOTHING RETURNING *""",
            req.projectId, listing_id, userId,
        )
        if not row:
            row = await conn.fetchrow(
                "SELECT * FROM project_marketplace_saves WHERE project_id = $1 AND listing_id = $2",
                req.projectId, listing_id,
            )
    return {"success": True, "save": dict(row)}


@router.get("/projects/{project_id}/saved-listings")
async def get_project_saved_listings(project_id: int, userId: int):
    await _require_marketplace_license(userId)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_project_member(conn, project_id, userId)
        rows = await conn.fetch(
            """
            SELECT
                ml.id, ml.status, ml.created_at,
                mlt.slug  AS listing_type,
                mlt.label AS listing_type_label,
                mvd.name, mvd.trade, mvd.location,
                mvd.contact_email, mvd.contact_phone,
                mvd.website, mvd.description,
                pms.created_at AS saved_at
            FROM project_marketplace_saves pms
            JOIN marketplace_listings ml ON ml.id = pms.listing_id
            JOIN marketplace_listing_types mlt ON mlt.id = ml.listing_type_id
            LEFT JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id
            WHERE pms.project_id = $1
            ORDER BY pms.created_at DESC
            """,
            project_id,
        )
    return {"success": True, "listings": [dict(r) for r in rows]}


# ── Share private vendor to marketplace ──────────────────────────────────────

@router.post("/vendors/{vendor_id}/share-to-marketplace")
async def share_vendor_to_marketplace(vendor_id: int, userId: int):
    await _require_marketplace_license(userId)
    pool = await get_pool()
    async with pool.acquire() as conn:
        vendor = await conn.fetchrow(
            "SELECT * FROM vendors WHERE id = $1", vendor_id
        )
        if not vendor:
            raise HTTPException(404, "Vendor not found")
        if vendor["shared_to_marketplace"]:
            raise HTTPException(409, "Vendor already shared to marketplace")

        listing_type = await conn.fetchrow(
            "SELECT id FROM marketplace_listing_types WHERE slug = 'vendor'"
        )
        if not listing_type:
            raise HTTPException(500, "Vendor listing type not configured")

        listing = await conn.fetchrow(
            """
            INSERT INTO marketplace_listings
                (listing_type_id, submitted_by_user_id, status)
            VALUES ($1, $2, 'active')
            RETURNING id
            """,
            listing_type["id"], userId,
        )

        await conn.execute(
            """
            INSERT INTO marketplace_vendor_details
                (listing_id, name, trade, location,
                 contact_email, contact_phone, website)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            """,
            listing["id"],
            vendor["name"],
            vendor["trade"],
            f"{vendor['city'] or ''}, {vendor['state'] or ''}".strip(", "),
            vendor["email"],
            vendor["phone"],
            vendor["website"],
        )

        updated = await conn.fetchrow(
            """
            UPDATE vendors
            SET shared_to_marketplace = true,
                marketplace_listing_id = $1,
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
            """,
            listing["id"], vendor_id,
        )

    return {"success": True, "vendor": dict(updated)}

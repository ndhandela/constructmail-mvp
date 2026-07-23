import html
import json
import os
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.project_helpers import require_project_member
from services.access_control import require_feature_flag
from services.marketplace_sessions import require_session_user
from services.magic_link import issue_magic_link
from services.email_service import send_email
from services.user_service import log_marketplace_activity

router = APIRouter(prefix="/api/marketplace", tags=["Marketplace"])

# Separate, unprefixed router for the crawlable HTML listing page — a
# genuinely different concern (serving a page vs a JSON API), so it gets its
# own top-level path instead of living under /api/marketplace/... or trying
# to content-negotiate on Accept from the same route as get_listing below.
pages_router = APIRouter(tags=["Marketplace Pages"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _has_marketplace_license(user_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            await require_feature_flag(conn, user_id, "marketplace")
            return True
        except HTTPException:
            return False


async def _require_marketplace_license(user_id: int):
    """Raise 403 if the user's company does not have marketplace = true."""
    if not await _has_marketplace_license(user_id):
        raise HTTPException(403, "Marketplace license required")


async def _get_account(conn, user_id: int):
    row = await conn.fetchrow(
        "SELECT id, account_type, account_status, company_id FROM users WHERE id = $1",
        user_id,
    )
    if not row:
        raise HTTPException(404, "Account not found")
    return row


async def _find_or_create_lead_account(conn, email: str, name: str, account_type: str, source: str) -> int:
    """Shared by gc-signup/claim-listing. If the email already has an
    account (of any type/status), it's left completely untouched — this
    never demotes an existing invited/active account, it only ever creates
    a brand-new lead the first time a given email is seen."""
    email = email.lower().strip()
    existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
    if existing:
        return existing["id"]
    row = await conn.fetchrow(
        """INSERT INTO users (email, name, account_type, account_status, account_source)
           VALUES ($1, $2, $3, 'lead', $4)
           RETURNING id""",
        email, name, account_type, source,
    )
    return row["id"]


async def _email_magic_link(conn, email: str, origin: str, subject: str, intro_html: str):
    link = await issue_magic_link(conn, email, origin)
    await send_email(
        to=email,
        subject=subject,
        html=f"""
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          {intro_html}
          <a href="{link}" style="display:inline-block;padding:12px 24px;background:#D97706;color:white;border-radius:100px;text-decoration:none;font-weight:600;margin:20px 0;">
            Continue
          </a>
          <p style="color:#666;font-size:13px;">This link expires in 24 hours.</p>
        </div>""",
    )


_PUBLIC_LISTING_FIELDS = """
    ml.id, ml.verified, ml.created_at,
    (ml.claimed_by IS NOT NULL) AS is_claimed,
    mlt.slug  AS listing_type,
    mlt.label AS listing_type_label,
    mvd.name, mvd.trade, mvd.city, mvd.state, mvd.location,
    COALESCE(AVG(mr.rating) FILTER (WHERE mr.is_hidden = false), 0)::numeric(3,2) AS avg_rating,
    COUNT(mr.id) FILTER (WHERE mr.is_hidden = false)::int                        AS review_count
"""


@router.get("/license")
async def check_marketplace_license(userId: int):
    """Self-serve license probe for the in-app (authenticated, company-
    licensed) Marketplace experience — MarketplaceApp.js calls this to
    decide whether to render the locked-upgrade card. Kept as its own
    endpoint (rather than having the frontend probe GET /listings for a
    403) specifically because /listings is now public/unauthenticated and
    would never 403, which would otherwise silently bypass the paywall."""
    return {"success": True, "hasLicense": await _has_marketplace_license(userId)}


# ── Public routes (no auth) ─────────────────────────────────────────────────

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
    type: Optional[str] = Query(None, description="Listing type slug, e.g. 'vendor'"),
    trade: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Free-text search on business name"),
):
    """Public directory search/filter. Deliberately returns only business
    name, trade, city/state, rating summary, and the computed verified flag
    — no contact_email/contact_phone/website, no review text. Full contact
    info + reviews live behind GET /listings/{id}/full."""
    pool = await get_pool()
    conditions = ["ml.status = 'active'"]
    params = []

    def add(cond, val):
        params.append(val)
        conditions.append(cond.format(len(params)))

    if type:
        add("mlt.slug = ${}", type)
    if trade:
        add("mvd.trade ILIKE ${}", trade)
    if city:
        add("mvd.city ILIKE ${}", city)
    if state:
        add("mvd.state = ${}", state.upper())
    if q:
        add("mvd.name ILIKE ${}", f"%{q}%")

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {_PUBLIC_LISTING_FIELDS}
            FROM marketplace_listings ml
            JOIN marketplace_listing_types mlt ON mlt.id = ml.listing_type_id
            LEFT JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id
            LEFT JOIN marketplace_reviews        mr  ON mr.listing_id  = ml.id
            WHERE {' AND '.join(conditions)}
            GROUP BY ml.id, mlt.slug, mlt.label, mvd.name, mvd.trade, mvd.city, mvd.state, mvd.location
            ORDER BY ml.created_at DESC
            """,
            *params,
        )
    return {"success": True, "listings": [dict(r) for r in rows]}


async def _fetch_public_listing(conn, listing_id: str):
    row = await conn.fetchrow(
        f"""
        SELECT {_PUBLIC_LISTING_FIELDS}
        FROM marketplace_listings ml
        JOIN marketplace_listing_types mlt ON mlt.id = ml.listing_type_id
        LEFT JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id
        LEFT JOIN marketplace_reviews        mr  ON mr.listing_id  = ml.id
        WHERE ml.id = $1 AND ml.status = 'active'
        GROUP BY ml.id, mlt.slug, mlt.label, mvd.name, mvd.trade, mvd.city, mvd.state, mvd.location
        """,
        listing_id,
    )
    return row


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str):
    """Public listing detail — same field restriction as the list endpoint.
    No reviews array here (only the aggregate rating) — full review text is
    gated behind /full."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await _fetch_public_listing(conn, listing_id)
        if not row:
            raise HTTPException(404, "Listing not found")
    return {"success": True, "listing": dict(row)}


@router.get("/listings/{listing_id}/full")
async def get_listing_full(listing_id: str, user_id: int = Depends(require_session_user)):
    """Gated full-info: contact details + full review text + reviewer's GC
    company name (never their personal name). Available to any type='gc'
    account regardless of status (lead or active) or company license — this
    is deliberately the free-signup unlock path, not the paid module."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        account = await _get_account(conn, user_id)
        if account["account_type"] != "gc":
            raise HTTPException(403, "Only GC accounts can view full listing details")

        row = await conn.fetchrow(
            """
            SELECT
                ml.id, ml.status, ml.verified, ml.created_at,
                mlt.slug  AS listing_type,
                mlt.label AS listing_type_label,
                mvd.name, mvd.trade, mvd.city, mvd.state, mvd.location,
                mvd.contact_email, mvd.contact_phone, mvd.website, mvd.description,
                COALESCE(AVG(mr.rating) FILTER (WHERE mr.is_hidden = false), 0)::numeric(3,2) AS avg_rating,
                COUNT(mr.id) FILTER (WHERE mr.is_hidden = false)::int                        AS review_count
            FROM marketplace_listings ml
            JOIN marketplace_listing_types mlt ON mlt.id = ml.listing_type_id
            LEFT JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id
            LEFT JOIN marketplace_reviews        mr  ON mr.listing_id  = ml.id
            WHERE ml.id = $1 AND ml.status = 'active'
            GROUP BY ml.id, mlt.slug, mlt.label, mvd.name, mvd.trade, mvd.city, mvd.state,
                     mvd.location, mvd.contact_email, mvd.contact_phone, mvd.website, mvd.description
            """,
            listing_id,
        )
        if not row:
            raise HTTPException(404, "Listing not found")

        reviews = await conn.fetch(
            """
            SELECT mr.id, mr.rating, mr.comment, mr.created_at,
                   c.name AS reviewer_company_name
            FROM marketplace_reviews mr
            LEFT JOIN users u ON u.id = mr.reviewer_user_id
            LEFT JOIN companies c ON c.id = u.company_id
            WHERE mr.listing_id = $1 AND mr.is_hidden = false
            ORDER BY mr.created_at DESC
            """,
            listing_id,
        )

    return {
        "success": True,
        "listing": dict(row),
        "reviews": [dict(r) for r in reviews],
    }


# ── Lead-account creation (public, unauthenticated) ─────────────────────────

class GcSignupRequest(BaseModel):
    email: str
    name: str


class ClaimListingRequest(BaseModel):
    email: str
    name: str
    listing_id: str


@router.post("/gc-signup")
async def gc_signup(req: GcSignupRequest, request: Request):
    """Public. Creates (or finds) a type='gc', status='lead' account and
    emails a magic link to confirm the address — the free unlock path into
    GET /listings/{id}/full, entirely separate from the invite-only GC
    Owner flow (routers/admin.py, routers/team.py) and from Feature Flags."""
    origin = request.headers.get("origin", FRONTEND_URL)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            user_id = await _find_or_create_lead_account(conn, req.email, req.name, "gc", "marketplace_gc_gate")
        await _email_magic_link(
            conn, req.email, origin,
            subject="Confirm your email to view vendor contact info on POMAR",
            intro_html=f"<h2 style='color:#0E1B2C;'>Almost there</h2><p>Hi {html.escape(req.name.split(' ')[0] or 'there')},</p><p>Click below to confirm your email and unlock full vendor contact info on POMAR Marketplace.</p>",
        )
    await log_marketplace_activity(
        action="gc_lead_signup", resource_type="user", resource_id=str(user_id), user_id=user_id,
    )
    return {"success": True}


@router.post("/claim-listing")
async def claim_listing(req: ClaimListingRequest, request: Request):
    """Public. Creates (or finds) a type='sub', status='lead' account and
    links it to the listing being claimed via marketplace_listings.claimed_by."""
    origin = request.headers.get("origin", FRONTEND_URL)
    pool = await get_pool()
    async with pool.acquire() as conn:
        listing = await conn.fetchrow("SELECT id, claimed_by FROM marketplace_listings WHERE id = $1", req.listing_id)
        if not listing:
            raise HTTPException(404, "Listing not found")

        async with conn.transaction():
            user_id = await _find_or_create_lead_account(conn, req.email, req.name, "sub", "marketplace_claim")
            if listing["claimed_by"] and listing["claimed_by"] != user_id:
                raise HTTPException(409, "This listing has already been claimed")
            await conn.execute(
                "UPDATE marketplace_listings SET claimed_by = $1, updated_at = NOW() WHERE id = $2",
                user_id, req.listing_id,
            )
        await _email_magic_link(
            conn, req.email, origin,
            subject="Confirm your email to manage your POMAR Marketplace listing",
            intro_html=f"<h2 style='color:#0E1B2C;'>Almost there</h2><p>Hi {html.escape(req.name.split(' ')[0] or 'there')},</p><p>Click below to confirm your email and manage your business listing on POMAR Marketplace.</p>",
        )
    await log_marketplace_activity(
        action="listing_claimed", resource_type="marketplace_listing", resource_id=req.listing_id, user_id=user_id,
    )
    return {"success": True}


# ── Request models (authenticated write routes) ─────────────────────────────

class CreateListingRequest(BaseModel):
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


class ReviewRequest(BaseModel):
    rating: int
    comment: Optional[str] = None


class ReviewUpdateRequest(BaseModel):
    rating: int
    comment: Optional[str] = None


class DisputeRequest(BaseModel):
    message: str


class RemovalRequestRequest(BaseModel):
    requester_name: str
    requester_email: str
    business_name: str
    reason: str


class SaveToProjectRequest(BaseModel):
    projectId: int


# ── Vendor add (Admin/active-GC only, with attestation) ─────────────────────

async def _create_listing_with_attestation(conn, req: CreateListingRequest, submitted_by_user_id: int, adder_company_id: Optional[int]):
    if not req.attestation_note or not req.attestation_note.strip():
        raise HTTPException(400, "attestation_note is required")

    listing_type = await conn.fetchrow(
        "SELECT id FROM marketplace_listing_types WHERE slug = $1 AND is_active = true",
        req.listing_type_slug,
    )
    if not listing_type:
        raise HTTPException(400, f"Unknown listing type: {req.listing_type_slug}")

    listing = await conn.fetchrow(
        """
        INSERT INTO marketplace_listings
            (listing_type_id, submitted_by_user_id, status, attestation_note)
        VALUES ($1, $2, 'active', $3)
        RETURNING id, status, created_at, attestation_note
        """,
        listing_type["id"], submitted_by_user_id, req.attestation_note.strip(),
    )

    details = await conn.fetchrow(
        """
        INSERT INTO marketplace_vendor_details
            (listing_id, name, trade, location, city, state,
             contact_email, contact_phone, website, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        """,
        listing["id"],
        req.name, req.trade, req.location, req.city, req.state,
        req.contact_email, req.contact_phone,
        req.website, req.description,
    )

    # Verified-badge computation (services/marketplace_verification.py) only
    # works for listings linked to a private vendors row — this listing was
    # created directly on the public marketplace, not shared from an
    # existing private vendor, so there's no such row yet. Upserting one for
    # the adding GC's company gives the verification job real project_vendors
    # data to check against, same as share_vendor_to_marketplace already does
    # in reverse below.
    if adder_company_id:
        await conn.execute(
            """
            INSERT INTO vendors (name, trade, phone, email, city, state, website,
                                  shared_to_marketplace, marketplace_listing_id)
            VALUES ($1, COALESCE($2, 'Other'), $3, $4, $5, $6, $7, true, $8)
            ON CONFLICT (name, city) DO UPDATE SET
                shared_to_marketplace = true, marketplace_listing_id = $8, updated_at = NOW()
            """,
            req.name, req.trade, req.contact_phone, req.contact_email,
            req.city, req.state, req.website, listing["id"],
        )

    return {**dict(listing), **dict(details)}


@router.post("/listings")
async def create_listing(req: CreateListingRequest, userId: int):
    await _require_marketplace_license(userId)
    pool = await get_pool()
    async with pool.acquire() as conn:
        account = await _get_account(conn, userId)
        if account["account_type"] != "gc" or account["account_status"] != "active":
            raise HTTPException(403, "Only active GC accounts can add marketplace listings")
        async with conn.transaction():
            listing = await _create_listing_with_attestation(conn, req, userId, account["company_id"])
    await log_marketplace_activity(
        action="listing_added", resource_type="marketplace_listing", resource_id=str(listing["id"]),
        changes={"attestation_note": listing["attestation_note"]}, user_id=userId, company_id=account["company_id"],
    )
    return {"success": True, "listing": listing}


# ── Reviews ───────────────────────────────────────────────────────────────

@router.post("/listings/{listing_id}/reviews")
async def add_review(listing_id: str, req: ReviewRequest, userId: int):
    await _require_marketplace_license(userId)
    if not (1 <= req.rating <= 5):
        raise HTTPException(400, "Rating must be between 1 and 5")

    pool = await get_pool()
    async with pool.acquire() as conn:
        account = await _get_account(conn, userId)
        if account["account_type"] != "gc":
            raise HTTPException(403, "Only GC accounts can review listings")

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
    await log_marketplace_activity(
        action="review_created", resource_type="marketplace_review", resource_id=str(review["id"]),
        changes={"rating": req.rating}, user_id=userId, company_id=account["company_id"],
    )
    return {"success": True, "review": dict(review)}


@router.patch("/reviews/{review_id}")
async def update_review(review_id: str, req: ReviewUpdateRequest, userId: int):
    """Editable only by the original author — no Admin content-edit
    capability exists anywhere in this codebase (see routers/admin.py's
    hide_review, which only ever toggles visibility, never content). Admin
    silently rewriting what a reviewer said would misattribute speech that
    isn't theirs — Section 230 protection for user-generated content depends
    on the platform not editorializing it, only moderating (hide/remove)."""
    if not (1 <= req.rating <= 5):
        raise HTTPException(400, "Rating must be between 1 and 5")
    pool = await get_pool()
    async with pool.acquire() as conn:
        review = await conn.fetchrow("SELECT * FROM marketplace_reviews WHERE id = $1", review_id)
        if not review:
            raise HTTPException(404, "Review not found")
        if review["reviewer_user_id"] != userId:
            raise HTTPException(403, "Only the original author can edit this review")
        updated = await conn.fetchrow(
            """UPDATE marketplace_reviews SET rating = $1, comment = $2, updated_at = NOW()
               WHERE id = $3 RETURNING *""",
            req.rating, req.comment, review_id,
        )
        company_id = await conn.fetchval("SELECT company_id FROM users WHERE id = $1", userId)
    await log_marketplace_activity(
        action="review_edited", resource_type="marketplace_review", resource_id=review_id,
        changes={"rating": req.rating}, user_id=userId, company_id=company_id,
    )
    return {"success": True, "review": dict(updated)}


@router.post("/reviews/{review_id}/dispute")
async def dispute_review(review_id: str, req: DisputeRequest, user_id: int = Depends(require_session_user)):
    """Available to the sub who claimed the listing this review is on.
    Notifies the reviewing GC with a link to edit their own review — never
    exposes either party's contact info to the other; everything routes
    through POMAR."""
    if not req.message or not req.message.strip():
        raise HTTPException(400, "message is required")
    pool = await get_pool()
    async with pool.acquire() as conn:
        review = await conn.fetchrow(
            """SELECT mr.id, mr.listing_id, ml.claimed_by, u.email AS gc_email, u.first_name
               FROM marketplace_reviews mr
               JOIN marketplace_listings ml ON ml.id = mr.listing_id
               JOIN users u ON u.id = mr.reviewer_user_id
               WHERE mr.id = $1""",
            review_id,
        )
        if not review:
            raise HTTPException(404, "Review not found")
        if review["claimed_by"] != user_id:
            raise HTTPException(403, "Only the sub who claimed this listing can dispute its reviews")

        dispute = await conn.fetchrow(
            """INSERT INTO marketplace_dispute_messages (review_id, sub_account_id, message)
               VALUES ($1, $2, $3) RETURNING id, created_at""",
            review_id, user_id, req.message.strip(),
        )

    edit_link = f"{FRONTEND_URL}/marketplace?review={review_id}"
    await send_email(
        to=review["gc_email"],
        subject="A business has disputed your POMAR Marketplace review",
        html=f"""
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color:#0E1B2C;">Review disputed</h2>
          <p>Hi {html.escape(review['first_name'] or 'there')},</p>
          <p>The business you reviewed on POMAR Marketplace has disputed it:</p>
          <blockquote style="border-left:3px solid #D97706;padding-left:12px;color:#333;">{html.escape(req.message.strip())}</blockquote>
          <a href="{edit_link}" style="display:inline-block;padding:12px 24px;background:#D97706;color:white;border-radius:100px;text-decoration:none;font-weight:600;margin:20px 0;">
            Review or edit your review
          </a>
        </div>""",
    )
    await log_marketplace_activity(
        action="dispute_message_sent", resource_type="marketplace_review", resource_id=review_id, user_id=user_id,
    )
    return {"success": True, "dispute": dict(dispute)}


# ── Listing removal request (public, unauthenticated) ───────────────────────

@router.post("/listings/{listing_id}/removal-request")
async def request_listing_removal(listing_id: str, req: RemovalRequestRequest):
    """Public — an unclaimed listing has no account tied to it yet, so
    there's nothing to authenticate. Never auto-removes: Admin confirms
    legitimacy first (see routers/admin.py's resolve_removal_request),
    otherwise a competitor could get a rival's listing pulled just by
    filing a request."""
    if not req.reason or not req.reason.strip():
        raise HTTPException(400, "reason is required")
    pool = await get_pool()
    async with pool.acquire() as conn:
        listing = await conn.fetchrow(
            "SELECT mvd.name FROM marketplace_listings ml JOIN marketplace_vendor_details mvd ON mvd.listing_id = ml.id WHERE ml.id = $1",
            listing_id,
        )
        if not listing:
            raise HTTPException(404, "Listing not found")
        if listing["name"].strip().lower() != req.business_name.strip().lower():
            raise HTTPException(400, "business_name does not match this listing")

        row = await conn.fetchrow(
            """INSERT INTO marketplace_removal_requests
                   (listing_id, requester_name, requester_email, business_name, reason)
               VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at""",
            listing_id, req.requester_name, req.requester_email, req.business_name, req.reason.strip(),
        )
    await log_marketplace_activity(
        action="removal_request_submitted", resource_type="marketplace_removal_request", resource_id=str(row["id"]),
        changes={"requester_email": req.requester_email}, is_system=True,
    )
    return {"success": True, "request": dict(row)}


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
                (listing_id, name, trade, location, city, state,
                 contact_email, contact_phone, website)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            """,
            listing["id"],
            vendor["name"],
            vendor["trade"],
            f"{vendor['city'] or ''}, {vendor['state'] or ''}".strip(", "),
            vendor["city"], vendor["state"],
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


# ── SEO-crawlable HTML page ──────────────────────────────────────────────────

@pages_router.get("/marketplace/listings/{listing_id}", response_class=HTMLResponse)
async def listing_seo_page(listing_id: str):
    """Server-rendered HTML for crawlers/first paint — this app is CRA
    (client-rendered only, no react-router/SSR/SSG; see App.js), so the
    normal frontend route for this same path would ship an empty shell that
    only gets real content after the JS bundle runs. This route renders the
    public listing fields directly as real HTML (title/meta/OG/JSON-LD +
    a human-readable summary), then links into the interactive React app
    for full details/contact-info/reviews, rather than attempting to embed
    the CRA build's (hashed, environment-specific) JS bundle from the API
    process, which this service has no reliable way to locate.
    NOTE: for this to have real SEO value in production, the domain that
    serves pomar.ai must route /marketplace/listings/* requests to this API
    service rather than to the static CRA build — that's a hosting/DNS
    configuration outside this codebase; verify it's wired before relying on
    this for search indexing."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await _fetch_public_listing(conn, listing_id)
    if not row:
        raise HTTPException(404, "Listing not found")

    # Raw values feed JSON-LD (json.dumps does its own correct JSON string
    # escaping) — HTML-escaping these first would embed literal HTML
    # entities like "&amp;" into structured data as if that were the real
    # business name, which is wrong data, not just a display glitch.
    raw_name = row["name"] or "Vendor"
    raw_trade = row["trade"] or ""
    raw_location = ", ".join(filter(None, [row["city"], row["state"]])) or (row["location"] or "")
    rating = float(row["avg_rating"] or 0)
    review_count = row["review_count"] or 0
    raw_description = f"{raw_name} is a{f' {raw_trade.lower()}' if raw_trade else ''} listed on POMAR Marketplace" + (
        f", rated {rating:.1f}/5 from {review_count} review{'s' if review_count != 1 else ''}." if review_count else "."
    )

    name, trade, location, description = (
        html.escape(raw_name), html.escape(raw_trade), html.escape(raw_location), html.escape(raw_description),
    )
    verified_badge = "✓ Verified" if row["verified"] else ""
    title = f"{name}{f' — {trade}' if trade else ''}{f', {location}' if location else ''} | POMAR Marketplace"
    app_link = f"{FRONTEND_URL}/marketplace/listings/{listing_id}"

    json_ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": raw_name,
        "description": raw_description,
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": rating,
            "reviewCount": review_count,
        },
    })
    # A business name/description containing the literal substring
    # "</script>" would otherwise prematurely close this tag in the browser
    # (JSON string escaping alone doesn't prevent that — it's an HTML
    # tokenizer concern, not a JSON one).
    json_ld = json_ld.replace("</", "<\\/")

    return HTMLResponse(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<meta name="description" content="{description}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="business.business">
<script type="application/ld+json">
{json_ld}
</script>
</head>
<body>
<h1>{name}{f' <small>{verified_badge}</small>' if verified_badge else ''}</h1>
<p>{trade}{f' · {location}' if location else ''}</p>
<p>Rating: {rating:.1f}/5 ({review_count} review{'s' if review_count != 1 else ''})</p>
<p><a href="{app_link}">View full details and contact info on POMAR Marketplace →</a></p>
</body>
</html>""")

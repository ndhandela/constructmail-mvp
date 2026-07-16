import csv
import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services import vendor_service
from services.project_helpers import require_project_member
from services.access_control import require_feature_flag

router = APIRouter(prefix="/api/vendors", tags=["Vendors"])


class CreateVendorRequest(BaseModel):
    userId: int
    name: str
    trade: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    website: Optional[str] = None
    insurance_status: Optional[str] = None
    insurance_expiry: Optional[str] = None


class ReviewRequest(BaseModel):
    userId: int
    rating_reliability: Optional[int] = None
    rating_cost: Optional[int] = None
    rating_quality: Optional[int] = None
    rating_communication: Optional[int] = None
    rating_insurance: Optional[int] = None
    comment: Optional[str] = None


class ClaimRequest(BaseModel):
    email: str
    password: str


class LinkProjectRequest(BaseModel):
    projectId: int
    userId: int


@router.post("")
async def create_vendor(req: CreateVendorRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, req.userId, "vendors")
    result = await vendor_service.create_vendor(req.dict(exclude={"userId"}))
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return {"success": True, "vendor": result["vendor"]}


@router.get("")
async def search_vendors(
    userId: int,
    search: Optional[str] = None,
    trade: Optional[str] = None,
    city: Optional[str] = None,
    insurance_status: Optional[str] = None,
    min_rating: Optional[str] = None,
    project_id: Optional[int] = None,
    sort: str = "newest",
    limit: int = 50,
    offset: int = 0,
):
    parsed_min_rating = float(min_rating) if min_rating else None
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_feature_flag(conn, userId, "vendors")
        if project_id is not None:
            await require_project_member(conn, project_id, userId)
    filters = {k: v for k, v in {
        "search": search, "trade": trade, "city": city,
        "insurance_status": insurance_status, "min_rating": parsed_min_rating,
        "project_id": project_id, "sort": sort, "limit": limit, "offset": offset,
    }.items() if v is not None}
    result = await vendor_service.search_vendors(filters)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return {"success": True, "vendors": result["vendors"], "total": result["total"]}


@router.get("/{vendor_id}")
async def get_vendor(vendor_id: int):
    result = await vendor_service.get_vendor(vendor_id)
    if not result["success"]:
        raise HTTPException(404, result["error"])
    return {"success": True, "vendor": result["vendor"]}


@router.put("/{vendor_id}")
async def update_vendor(vendor_id: int, updates: dict):
    result = await vendor_service.update_vendor(vendor_id, updates)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return {"success": True, "vendor": result["vendor"]}


@router.post("/{vendor_id}/reviews")
async def add_review(vendor_id: int, req: ReviewRequest):
    result = await vendor_service.add_review(vendor_id, req.userId, req.dict(exclude={"userId"}))
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return {"success": True, "review": result["review"]}


@router.get("/{vendor_id}/reviews")
async def get_reviews(vendor_id: int, limit: int = 10, offset: int = 0):
    result = await vendor_service.get_vendor_reviews(vendor_id, limit, offset)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return {"success": True, "reviews": result["reviews"]}


@router.post("/bulk-import")
async def bulk_import(file: UploadFile = File(...), userId: int = Form(...)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
    vendors = list(reader)
    result = await vendor_service.bulk_import_vendors(vendors, userId)
    return {"success": True, "imported": result["imported"], "failed": result["failed"]}


@router.post("/{vendor_id}/link-project")
async def link_vendor_to_project(vendor_id: int, req: LinkProjectRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_project_member(conn, req.projectId, req.userId, roles=("owner", "contributor"))
    result = await vendor_service.link_vendor_to_project(vendor_id, req.projectId)
    if not result["success"]:
        raise HTTPException(404, result["error"])
    return {"success": True, "link": result["link"]}


@router.post("/{vendor_id}/claim")
async def claim_vendor(vendor_id: int, req: ClaimRequest):
    result = await vendor_service.claim_vendor_account(vendor_id, req.email, req.password)
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return {"success": True, "account": result["account"]}

"""
POMAR Invoice Tracker — upload and track vendor invoice PDFs against a
project, optionally tagged to a Capital Tracker work item / budget item.

Deliberately does not require the 'capital' feature flag: work_item_id/
budget_item_id are both nullable on the invoices row, and the picker
endpoints below (list_project_work_items/list_project_budget_items) are
gated by 'invoice_tracker' alone rather than reusing routers/capital.py's
'capital'-gated ones — a company can run Invoice Tracker with Capital
Tracker off, filing invoices at the project level only.

Access is enforced by services/invoice_helpers.py, which has two paths: a
normal company teammate (project_members + the 'invoice_tracker' flag,
optionally narrowed by users.restricted_module) and a read-only external
accountant (company_accountant_access — see routers/invoice_accountant_access.py).
"""

import logging
import secrets
from datetime import date
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from db import get_pool
from services import r2_storage
from services.invoice_helpers import (
    invoice_response,
    require_can_modify_invoice,
    require_company_invoice_access,
    require_project_invoice_access,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/invoices", tags=["Invoice Tracker"])

STATUSES = ("pending", "paid")
MAX_PDF_SIZE = 20 * 1024 * 1024  # 20MB

INVOICE_COLUMNS = """i.id, i.company_id, i.project_id, i.work_item_id, i.budget_item_id, i.uploaded_by,
                     i.vendor_name, i.invoice_number, i.amount, i.invoice_date, i.due_date, i.status,
                     i.notes, i.created_at, i.updated_at"""


class UpdateInvoiceRequest(BaseModel):
    userId: int
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    amount: Optional[float] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    work_item_id: Optional[int] = None
    budget_item_id: Optional[int] = None


# ── Projects / work-items / budget-items pickers ──────────────────────────
# Own endpoints (not routers/capital.py's) so the picker works even when
# Capital Tracker's own 'capital' flag is off — see module docstring.

@router.get("/projects")
async def list_invoice_projects(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT company_id FROM users WHERE id = $1", userId)
        if not user or not user["company_id"]:
            return {"success": True, "projects": []}
        await require_company_invoice_access(conn, userId, user["company_id"])

        rows = await conn.fetch(
            """SELECT p.id, p.name FROM projects p
               JOIN project_members pm ON pm.project_id = p.id
               WHERE pm.user_id = $1
               ORDER BY p.created_at""",
            userId,
        )
    return {"success": True, "projects": [dict(r) for r in rows]}


@router.get("/projects/{project_id}/work-items")
async def list_project_work_items(project_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_project_invoice_access(conn, userId, project_id)
        rows = await conn.fetch(
            "SELECT id, name FROM work_items WHERE project_id = $1 ORDER BY sequence NULLS LAST, id",
            project_id,
        )
    return {"success": True, "work_items": [dict(r) for r in rows]}


@router.get("/projects/{project_id}/budget-items")
async def list_project_budget_items(project_id: int, userId: int, work_item_id: Optional[int] = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await require_project_invoice_access(conn, userId, project_id)

        if work_item_id is not None:
            wi = await conn.fetchrow(
                "SELECT id FROM work_items WHERE id = $1 AND project_id = $2", work_item_id, project_id,
            )
            if not wi:
                raise HTTPException(404, "Work item not found on this project")
            rows = await conn.fetch(
                """SELECT bi.id, bi.budgeted_amount, c.name AS category_name
                   FROM budget_items bi JOIN categories c ON c.id = bi.category_id
                   WHERE bi.work_item_id = $1 ORDER BY c.name""",
                work_item_id,
            )
        else:
            rows = await conn.fetch(
                """SELECT bi.id, bi.budgeted_amount, bi.work_item_id, c.name AS category_name
                   FROM budget_items bi
                   JOIN categories c ON c.id = bi.category_id
                   WHERE bi.project_id = $1 ORDER BY c.name""",
                project_id,
            )
    return {"success": True, "budget_items": [dict(r) for r in rows]}


# ── Invoices ────────────────────────────────────────────────────────────

@router.get("")
async def list_invoices(
    userId: int,
    companyId: int,
    project_id: Optional[int] = None,
    work_item_id: Optional[int] = None,
    budget_item_id: Optional[int] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    if status is not None and status not in STATUSES:
        raise HTTPException(400, f"status must be one of {STATUSES}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        access = await require_company_invoice_access(conn, userId, companyId)

        conditions = ["i.company_id = $1"]
        params = [companyId]

        # A non-owner company member only sees invoices for projects
        # they're actually a member of — an owner (and an accountant, whose
        # grant is company-wide by design) sees every project's invoices.
        if access.kind == "member":
            user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", userId)
            if not (user and user["permission_level"] == "owner"):
                params.append(userId)
                conditions.append(
                    f"EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = i.project_id AND pm.user_id = ${len(params)})"
                )

        if project_id is not None:
            params.append(project_id)
            conditions.append(f"i.project_id = ${len(params)}")
        if work_item_id is not None:
            params.append(work_item_id)
            conditions.append(f"i.work_item_id = ${len(params)}")
        if budget_item_id is not None:
            params.append(budget_item_id)
            conditions.append(f"i.budget_item_id = ${len(params)}")
        if status is not None:
            params.append(status)
            conditions.append(f"i.status = ${len(params)}")
        if date_from is not None:
            params.append(date_from)
            conditions.append(f"i.invoice_date >= ${len(params)}")
        if date_to is not None:
            params.append(date_to)
            conditions.append(f"i.invoice_date <= ${len(params)}")

        where_clause = " AND ".join(conditions)
        rows = await conn.fetch(
            f"""SELECT {INVOICE_COLUMNS}, p.name AS project_name, wi.name AS work_item_name,
                       u.name AS uploaded_by_name
                FROM invoices i
                JOIN projects p ON p.id = i.project_id
                LEFT JOIN work_items wi ON wi.id = i.work_item_id
                JOIN users u ON u.id = i.uploaded_by
                WHERE {where_clause}
                ORDER BY i.invoice_date DESC NULLS LAST, i.id DESC""",
            *params,
        )

    return {"success": True, "invoices": [dict(r) for r in rows], "can_write": access.can_write}


@router.post("/projects/{project_id}")
async def create_invoice(
    project_id: int,
    userId: int = Form(...),
    vendor_name: str = Form(...),
    invoice_number: Optional[str] = Form(None),
    amount: float = Form(...),
    invoice_date: Optional[date] = Form(None),
    due_date: Optional[date] = Form(None),
    status: str = Form("pending"),
    notes: Optional[str] = Form(None),
    work_item_id: Optional[int] = Form(None),
    budget_item_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
):
    if not vendor_name.strip():
        raise HTTPException(400, "Vendor name is required")
    if amount <= 0:
        raise HTTPException(400, "Amount must be greater than 0")
    if status not in STATUSES:
        raise HTTPException(400, f"status must be one of {STATUSES}")
    if not file or not file.filename:
        raise HTTPException(400, "A PDF file is required")
    if not file.filename.lower().endswith(".pdf") and file.content_type != "application/pdf":
        raise HTTPException(400, "Only PDF files are accepted")

    pool = await get_pool()
    async with pool.acquire() as conn:
        project = await conn.fetchrow("SELECT id, company_id FROM projects WHERE id = $1", project_id)
        if not project:
            raise HTTPException(404, "Project not found")

        await require_project_invoice_access(conn, userId, project_id)

        if work_item_id is not None:
            wi = await conn.fetchrow(
                "SELECT id FROM work_items WHERE id = $1 AND project_id = $2", work_item_id, project_id,
            )
            if not wi:
                raise HTTPException(404, "Work item not found on this project")
        if budget_item_id is not None:
            if work_item_id is None:
                raise HTTPException(400, "Select a work item before selecting a budget item")
            bi = await conn.fetchrow(
                "SELECT id FROM budget_items WHERE id = $1 AND work_item_id = $2", budget_item_id, work_item_id,
            )
            if not bi:
                raise HTTPException(404, "Budget item not found on this work item")

        content = await file.read()
        if len(content) > MAX_PDF_SIZE:
            raise HTTPException(400, "PDF must be smaller than 20MB")

        # Uploaded before the row exists — see r2_storage.upload_invoice_pdf's
        # docstring for why the storage key uses a random token instead of
        # the not-yet-known invoice id.
        upload_token = secrets.token_hex(8)
        storage_path = await r2_storage.upload_invoice_pdf(
            project["company_id"], project_id, upload_token, file.filename, content,
        )

        row = await conn.fetchrow(
            f"""INSERT INTO invoices AS i (company_id, project_id, work_item_id, budget_item_id, uploaded_by,
                                            vendor_name, invoice_number, amount, invoice_date, due_date, status,
                                            pdf_storage_path, notes)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                RETURNING {INVOICE_COLUMNS}""",
            project["company_id"], project_id, work_item_id, budget_item_id, userId,
            vendor_name.strip(), invoice_number, amount, invoice_date, due_date, status,
            storage_path, notes,
        )

    return {"success": True, "invoice": invoice_response(row)}


@router.patch("/{invoice_id}")
async def update_invoice(invoice_id: int, req: UpdateInvoiceRequest):
    if req.status is not None and req.status not in STATUSES:
        raise HTTPException(400, f"status must be one of {STATUSES}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        invoice = await conn.fetchrow("SELECT * FROM invoices WHERE id = $1", invoice_id)
        if not invoice:
            raise HTTPException(404, "Invoice not found")

        await require_project_invoice_access(conn, req.userId, invoice["project_id"])

        if req.work_item_id is not None:
            wi = await conn.fetchrow(
                "SELECT id FROM work_items WHERE id = $1 AND project_id = $2",
                req.work_item_id, invoice["project_id"],
            )
            if not wi:
                raise HTTPException(404, "Work item not found on this project")
        if req.budget_item_id is not None:
            effective_work_item_id = req.work_item_id if req.work_item_id is not None else invoice["work_item_id"]
            if effective_work_item_id is None:
                raise HTTPException(400, "Select a work item before selecting a budget item")
            bi = await conn.fetchrow(
                "SELECT id FROM budget_items WHERE id = $1 AND work_item_id = $2",
                req.budget_item_id, effective_work_item_id,
            )
            if not bi:
                raise HTTPException(404, "Budget item not found on this work item")

        fields, values = [], []
        for column in ("vendor_name", "invoice_number", "amount", "invoice_date", "due_date",
                        "status", "notes", "work_item_id", "budget_item_id"):
            value = getattr(req, column)
            if value is not None:
                values.append(value)
                fields.append(f"{column} = ${len(values)}")

        if not fields:
            return {"success": True, "invoice": invoice_response(invoice)}

        fields.append("updated_at = NOW()")
        values.append(invoice_id)
        query = f"UPDATE invoices AS i SET {', '.join(fields)} WHERE id = ${len(values)} RETURNING {INVOICE_COLUMNS}"
        row = await conn.fetchrow(query, *values)

    return {"success": True, "invoice": invoice_response(row)}


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: int, userId: int):
    """The underlying R2 object is left in place, same as every other
    upload-backed delete in this codebase (see routers/daily_logs.py's
    delete_log_photo) — there's no R2 delete_object call anywhere yet."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        invoice = await conn.fetchrow("SELECT * FROM invoices WHERE id = $1", invoice_id)
        if not invoice:
            raise HTTPException(404, "Invoice not found")

        await require_project_invoice_access(conn, userId, invoice["project_id"])
        await require_can_modify_invoice(conn, userId, invoice)

        await conn.execute("DELETE FROM invoices WHERE id = $1", invoice_id)

    return {"success": True}


@router.get("/{invoice_id}/download-url")
async def get_invoice_download_url(invoice_id: int, userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        invoice = await conn.fetchrow("SELECT * FROM invoices WHERE id = $1", invoice_id)
        if not invoice:
            raise HTTPException(404, "Invoice not found")

        access = await require_company_invoice_access(conn, userId, invoice["company_id"])
        if access.kind == "member":
            member = await conn.fetchrow(
                "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
                invoice["project_id"], userId,
            )
            user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", userId)
            is_owner = bool(user and user["permission_level"] == "owner")
            if not member and not is_owner:
                raise HTTPException(403, "You do not have access to this project")

        url = await r2_storage.get_invoice_pdf_url(invoice["pdf_storage_path"])

    return {"success": True, "url": url, "expires_in": r2_storage.INVOICE_URL_EXPIRES_IN}

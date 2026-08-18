"""
Access model for POMAR Invoice Tracker (routers/invoices.py,
routers/invoice_accountant_access.py).

A caller reaches invoice data one of two ways, mirroring
services/vendor_access.py's "member" vs "vendor" split:
  1. "member" path — a company teammate (owner, or a team member optionally
     scoped via users.restricted_module — see services/access_control.py)
     with a project_members row for the invoice's project, plus the
     company-wide 'invoice_tracker' feature flag. Can create/view/edit
     status; delete is further limited to the company owner or the
     invoice's own uploader (require_can_modify_invoice below).
  2. "accountant" path — an ACCEPTED company_accountant_access row for
     this exact (company_id, user_id), narrowed by whatever project_ids
     that grant has in accountant_project_access (see migration 019 — a
     grant with zero rows there sees zero invoices, fail-closed, not
     company-wide). No project_members/feature_flags involvement — this
     works even for lead-status accounts require_feature_flag would
     otherwise hard-block. Never allowed to write.
"""
from typing import FrozenSet, Optional

from fastapi import HTTPException

from services.access_control import require_feature_flag


async def get_project_invoice_summary(conn, project_id: int) -> dict:
    """Overdue count + total dollar amount rollup for the Projects Overview
    dashboard card and its "Invoices" tooltip (routers/dashboard.py, which
    wants the dollar total alongside the count). There's no stored
    'overdue' status (STATUSES below is just pending/paid) — overdue is
    derived at read time as a pending invoice whose due_date has passed,
    same as any other status shown here."""
    row = await conn.fetchrow(
        """SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total_amount
           FROM invoices
           WHERE project_id = $1 AND status = 'pending'
             AND due_date IS NOT NULL AND due_date < CURRENT_DATE""",
        project_id,
    )
    count = row["count"]
    total_amount = float(row["total_amount"])
    if count:
        return {"status": "overdue", "count": count, "total_amount": total_amount, "label": f"{count} overdue"}
    return {"status": "none_overdue", "count": 0, "total_amount": 0.0, "label": "None overdue"}


class InvoiceAccess:
    __slots__ = ("kind", "can_write", "project_ids")

    def __init__(self, kind: str, can_write: bool, project_ids: Optional[FrozenSet[int]] = None):
        self.kind = kind  # "member" | "accountant"
        self.can_write = can_write
        # Only meaningful for kind == "accountant" — the set of project_ids
        # this grant is scoped to (empty set means none, not unrestricted).
        # None for "member", whose scoping instead runs through
        # project_members, applied separately by each caller.
        self.project_ids = project_ids

    @property
    def is_accountant(self) -> bool:
        return self.kind == "accountant"


async def _is_accountant(conn, user_id: int) -> bool:
    row = await conn.fetchrow(
        "SELECT account_type, account_status FROM users WHERE id = $1", user_id,
    )
    return bool(row and row["account_type"] == "accountant" and row["account_status"] == "lead")


async def require_company_invoice_access(conn, user_id: int, company_id: int) -> InvoiceAccess:
    """Company-wide check — used by the main invoice list (optionally
    filtered to one project) and the accountant view alike."""
    if await _is_accountant(conn, user_id):
        row = await conn.fetchrow(
            """SELECT id, status FROM company_accountant_access
               WHERE company_id = $1 AND accountant_user_id = $2 AND status = 'accepted'""",
            company_id, user_id,
        )
        if not row:
            raise HTTPException(403, "You do not have accountant access to this company")
        project_rows = await conn.fetch(
            "SELECT project_id FROM accountant_project_access WHERE company_accountant_access_id = $1",
            row["id"],
        )
        project_ids = frozenset(r["project_id"] for r in project_rows)
        return InvoiceAccess("accountant", can_write=False, project_ids=project_ids)

    user = await conn.fetchrow("SELECT company_id FROM users WHERE id = $1", user_id)
    if not user or user["company_id"] != company_id:
        raise HTTPException(403, "You do not have access to this company")
    await require_feature_flag(conn, user_id, "invoice_tracker")
    return InvoiceAccess("member", can_write=True)


async def require_project_invoice_access(conn, user_id: int, project_id: int) -> InvoiceAccess:
    """Project-scoped check for endpoints that always target one project
    (create/upload, and the work-items/budget-items picker) — accountants
    never reach these, since their grant has no project_members rows at
    all and they're read-only anyway."""
    if await _is_accountant(conn, user_id):
        raise HTTPException(403, "Accountant accounts are read-only")

    await require_feature_flag(conn, user_id, "invoice_tracker")
    member = await conn.fetchrow(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        project_id, user_id,
    )
    if not member:
        raise HTTPException(403, "You do not have access to this project")
    return InvoiceAccess("member", can_write=True)


async def require_can_modify_invoice(conn, user_id: int, invoice) -> None:
    """Delete requires the caller to be either the company owner or the
    invoice's own uploader — mirrors routers/daily_logs.py's
    _require_can_edit_log shape (logging user or company owner), not
    capital.py's stricter project-owner-only rule, since Invoice Tracker's
    restricted role is explicitly meant to let a scoped team member
    upload/edit without being a project owner."""
    user = await conn.fetchrow("SELECT permission_level FROM users WHERE id = $1", user_id)
    if user and user["permission_level"] == "owner":
        return
    if invoice["uploaded_by"] != user_id:
        raise HTTPException(403, "Only the uploader or a company owner can delete this invoice")


async def find_or_create_accountant_lead_account(conn, email: str, name: str) -> int:
    """Never demotes an existing account of any type/status — only creates
    a brand-new lead the first time this email is seen. Mirrors
    routers/project_vendor_access.py's _find_or_create_lead_account, but
    with its own account_source and no company/company_id linkage: an
    accountant's own company_id stays NULL regardless of which GC invited
    them — unlike a vendor, they're not "joining" the inviting company,
    just granted read-only access to it via company_accountant_access."""
    email = email.lower().strip()
    existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
    if existing:
        return existing["id"]
    row = await conn.fetchrow(
        """INSERT INTO users (email, name, account_type, account_status, account_source)
           VALUES ($1, $2, 'accountant', 'lead', 'invoice_accountant_invite')
           RETURNING id""",
        email, name,
    )
    return row["id"]


async def upsert_accountant_invite(
    conn, company_id: int, accountant_user_id: int,
    invited_by_user_id: Optional[int] = None, invited_by_admin_id: Optional[int] = None,
):
    """Shared by both invite entry points — a GC owner in-app
    (routers/invoice_accountant_access.py) and POMAR staff from the admin
    portal (routers/admin.py) — since the resulting grant is identical
    either way, only who triggered it differs. ON CONFLICT lets either
    entry point re-invite a removed accountant by upserting the same row."""
    return await conn.fetchrow(
        """INSERT INTO company_accountant_access
               (company_id, accountant_user_id, invited_by_user_id, invited_by_admin_id, status, invited_at)
           VALUES ($1, $2, $3, $4, 'invited', NOW())
           ON CONFLICT (company_id, accountant_user_id) DO UPDATE
               SET status = 'invited', invited_by_user_id = EXCLUDED.invited_by_user_id,
                   invited_by_admin_id = EXCLUDED.invited_by_admin_id,
                   invited_at = NOW(), removed_at = NULL
           RETURNING *""",
        company_id, accountant_user_id, invited_by_user_id, invited_by_admin_id,
    )


def invoice_response(row) -> dict:
    """Excludes pdf_storage_path from every API response — it's an
    internal R2 object key, never a usable url on its own. Callers get a
    download link only from GET /api/invoices/{id}/download-url, which
    mints a short-lived presigned url on demand (services/r2_storage.py)."""
    d = dict(row)
    d.pop("pdf_storage_path", None)
    return d

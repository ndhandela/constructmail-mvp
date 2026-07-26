"""
POMAR Trust file storage — Cloudflare R2 (S3-compatible), private bucket.

Raw WhatsApp/email uploads contain buyer PII and are never written to Postgres
or local disk — only the returned object key is stored (trust_uploads.storage_path).
This is a separate bucket/credential set from the existing DNC XML Editor
downloads bucket; nothing here touches that bucket.

boto3 is synchronous, so calls are pushed to a thread via asyncio.to_thread
rather than blocking the FastAPI event loop.

Daily Logs uses a THIRD, separate bucket/credential set (R2_DAILYLOGS_*,
below) rather than reusing the Trust bucket — the two have opposite access
patterns. Trust uploads are PII-sensitive and server-side-only (see
download_trust_file's docstring: no public/shareable URL is ever generated).
Daily log photos are site photos meant to render in a frontend gallery, so
they need presigned GET urls handed back to the browser — a capability
deliberately not added to the Trust bucket/functions above.

Invoice Tracker uses a FOURTH, separate bucket/credential set (R2_INVOICES_*,
below) rather than reusing an existing one — invoice PDFs carry vendor/
financial data and get their own dedicated bucket, same "presigned GET,
short expiry, regenerated per read" shape as Daily Logs (not Trust's
server-only shape), since invoices need to be downloadable from the browser.

POMAR Documents uses a FIFTH, separate bucket/credential set (R2_DOCUMENTS_*,
below) — a GC and its Subs share project documents across company
boundaries, so keeping this on its own bucket avoids ever mixing document
objects into another module's namespace. Same "presigned GET, regenerated
per read" shape as Invoice Tracker.
"""

import asyncio
import os
from typing import Optional

import boto3

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_TRUST_ENDPOINT_URL"],
            aws_access_key_id=os.environ["R2_TRUST_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_TRUST_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
    return _client


def _bucket() -> str:
    return os.environ["R2_TRUST_BUCKET_NAME"]


def _storage_key(company_id: int, project_id: int, upload_id: int, filename: str) -> str:
    safe_name = os.path.basename(filename)
    return f"trust-uploads/{company_id}/{project_id}/{upload_id}/{safe_name}"


async def upload_trust_file(company_id: int, project_id: int, upload_id: int, filename: str, content: bytes) -> str:
    key = _storage_key(company_id, project_id, upload_id, filename)

    def _put():
        _get_client().put_object(Bucket=_bucket(), Key=key, Body=content)

    await asyncio.to_thread(_put)
    return key


async def download_trust_file(storage_path: str) -> bytes:
    """Server-side only — the bucket has Public Access disabled and nothing in
    this module ever generates a public/shareable URL for an object."""
    def _get():
        obj = _get_client().get_object(Bucket=_bucket(), Key=storage_path)
        return obj["Body"].read()

    return await asyncio.to_thread(_get)


# TODO: lifecycle/retention policy — raw uploads should auto-delete once
# trust_uploads.parse_status = 'parsed' is confirmed for a few days. Not built
# in v1; would be either an R2 lifecycle rule keyed off object age, or a small
# cron alongside services/trust_reminders.py that calls delete_object() once
# parse_status is 'parsed' and old enough.


# ── Daily Logs photo bucket ─────────────────────────────────────────────
# Separate client/bucket/credentials from the Trust bucket above — see the
# module docstring for why. Reuses the same lazy-singleton + asyncio.to_thread
# shape as _get_client/upload_trust_file rather than introducing a new one.

_dailylogs_client = None


def _get_dailylogs_client():
    global _dailylogs_client
    if _dailylogs_client is None:
        _dailylogs_client = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_DAILYLOGS_ENDPOINT_URL"],
            aws_access_key_id=os.environ["R2_DAILYLOGS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_DAILYLOGS_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
    return _dailylogs_client


def _dailylogs_bucket() -> str:
    return os.environ["R2_DAILYLOGS_BUCKET_NAME"]


def _dailylogs_storage_key(company_id: int, project_id: int, daily_log_id: int, filename: str) -> str:
    safe_name = os.path.basename(filename)
    return f"daily-log-photos/{company_id}/{project_id}/{daily_log_id}/{safe_name}"


async def upload_daily_log_photo(company_id: int, project_id: int, daily_log_id: int, filename: str, content: bytes) -> str:
    key = _dailylogs_storage_key(company_id, project_id, daily_log_id, filename)

    def _put():
        _get_dailylogs_client().put_object(Bucket=_dailylogs_bucket(), Key=key, Body=content)

    await asyncio.to_thread(_put)
    return key


async def get_daily_log_photo_url(storage_path: str, expires_in: int = 3600) -> str:
    """Presigned GET url, not cached/stored — callers regenerate on every
    read so a long-lived gallery session never serves an expired link (see
    routers/daily_logs.py, which calls this at response time)."""
    def _presign():
        return _get_dailylogs_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": _dailylogs_bucket(), "Key": storage_path},
            ExpiresIn=expires_in,
        )

    return await asyncio.to_thread(_presign)


# ── Invoice Tracker PDF bucket ──────────────────────────────────────────
# Fourth, separate client/bucket/credentials — see the module docstring for
# why. Reuses the same lazy-singleton + asyncio.to_thread shape as the two
# buckets above rather than introducing a new one.

_invoices_client = None


def _get_invoices_client():
    global _invoices_client
    if _invoices_client is None:
        _invoices_client = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_INVOICES_ENDPOINT_URL"],
            aws_access_key_id=os.environ["R2_INVOICES_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_INVOICES_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
    return _invoices_client


def _invoices_bucket() -> str:
    return os.environ["R2_INVOICES_BUCKET_NAME"]


def _invoices_storage_key(company_id: int, project_id: int, upload_token: str, filename: str) -> str:
    safe_name = os.path.basename(filename)
    return f"invoice-pdfs/{company_id}/{project_id}/{upload_token}/{safe_name}"


async def upload_invoice_pdf(company_id: int, project_id: int, upload_token: str, filename: str, content: bytes) -> str:
    """upload_token is a caller-generated random id (routers/invoices.py
    uses secrets.token_hex), not the invoices.id row — the PDF is uploaded
    before the row exists (its pdf_storage_path column is NOT NULL, so the
    row can only be inserted once the key is known), unlike Daily Logs
    where photos are a separate table inserted after their parent log row."""
    key = _invoices_storage_key(company_id, project_id, upload_token, filename)

    def _put():
        _get_invoices_client().put_object(Bucket=_invoices_bucket(), Key=key, Body=content)

    await asyncio.to_thread(_put)
    return key


# Short expiry (15 min, well under Daily Logs' 1 hour default) — invoice
# PDFs carry vendor/financial data, so the signed-download endpoint
# (routers/invoices.py) is meant to be called right before the browser
# uses the link, not cached for a long gallery-style session.
INVOICE_URL_EXPIRES_IN = 900


async def get_invoice_pdf_url(storage_path: str, expires_in: int = INVOICE_URL_EXPIRES_IN) -> str:
    """Presigned GET url, not cached/stored — regenerated on every request
    (routers/invoices.py's download-url endpoint) so nothing durable in
    Postgres or the frontend ever holds a link past its short expiry."""
    def _presign():
        return _get_invoices_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": _invoices_bucket(), "Key": storage_path},
            ExpiresIn=expires_in,
        )

    return await asyncio.to_thread(_presign)


# ── POMAR Documents bucket ──────────────────────────────────────────────
# Fifth, separate client/bucket/credentials — see the module docstring for
# why. Reuses the same lazy-singleton + asyncio.to_thread shape as the
# buckets above.

_documents_client = None


def _get_documents_client():
    global _documents_client
    if _documents_client is None:
        _documents_client = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_DOCUMENTS_ENDPOINT_URL"],
            aws_access_key_id=os.environ["R2_DOCUMENTS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_DOCUMENTS_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
    return _documents_client


def _documents_bucket() -> str:
    return os.environ["R2_DOCUMENTS_BUCKET_NAME"]


def _documents_storage_key(project_id: int, filename: str, folder_id: Optional[int] = None) -> str:
    """{project_id}/{folder_id}/{filename} inside a folder, {project_id}/
    {filename} at root — deliberately predictable (no company_id or
    document_id component) so routers/documents.py never needs a DB lookup
    beyond the document row itself to resolve where a file lives.

    Trade-off: two uploads with the same filename to the same project/folder
    collide on the same R2 key (the second PUT silently overwrites the
    first's object), since nothing document-specific is in the key. Accepted
    per the module's key-naming spec rather than worked around, since
    solving it would mean reintroducing a DB lookup (or a document/token
    component) this structure is explicitly meant to avoid."""
    safe_name = os.path.basename(filename)
    if folder_id is not None:
        return f"{project_id}/{folder_id}/{safe_name}"
    return f"{project_id}/{safe_name}"


async def upload_document(project_id: int, filename: str, content: bytes, folder_id: Optional[int] = None) -> str:
    key = _documents_storage_key(project_id, filename, folder_id)

    def _put():
        _get_documents_client().put_object(Bucket=_documents_bucket(), Key=key, Body=content)

    await asyncio.to_thread(_put)
    return key


DOCUMENT_URL_EXPIRES_IN = 900


async def get_document_url(storage_path: str, expires_in: int = DOCUMENT_URL_EXPIRES_IN) -> str:
    """Presigned GET url, not cached/stored — regenerated on every request
    (routers/documents.py's download endpoint)."""
    def _presign():
        return _get_documents_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": _documents_bucket(), "Key": storage_path},
            ExpiresIn=expires_in,
        )

    return await asyncio.to_thread(_presign)

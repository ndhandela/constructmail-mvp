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
"""

import asyncio
import os

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

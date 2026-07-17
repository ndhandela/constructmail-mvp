"""
POMAR Trust file storage — Cloudflare R2 (S3-compatible), private bucket.

Raw WhatsApp/email uploads contain buyer PII and are never written to Postgres
or local disk — only the returned object key is stored (trust_uploads.storage_path).
This is a separate bucket/credential set from the existing DNC XML Editor
downloads bucket; nothing here touches that bucket.

boto3 is synchronous, so calls are pushed to a thread via asyncio.to_thread
rather than blocking the FastAPI event loop.
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

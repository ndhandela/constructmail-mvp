import os
import logging
import httpx
from dotenv import load_dotenv
from db import get_pool

load_dotenv()

FROM_NAME = "TechDen Solutions"

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


async def _log_email_result(to: str, level: str, message: str, detail: str = None):
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO system_logs (source, level, message, detail, user_email)
                   VALUES ('email', $1, $2, $3, $4)""",
                level, message, detail, to,
            )
    except Exception:
        logging.exception("Failed to log email result to system_logs")


async def send_email(to: str, subject: str, html: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                BREVO_API_URL,
                headers={"api-key": os.getenv("BREVO_API_KEY")},
                json={
                    "sender": {"name": FROM_NAME, "email": os.getenv("BREVO_FROM_EMAIL")},
                    "to": [{"email": to}],
                    "subject": subject,
                    "htmlContent": html,
                },
            )
        if response.status_code in (200, 201):
            await _log_email_result(to, "info", f"Email sent: {subject}")
            return True
        error_msg = f"send_email failed for {to!r}: {response.status_code} {response.text}"
        logging.error(error_msg)
        await _log_email_result(to, "error", f"Email failed: {subject}", error_msg)
        return False
    except Exception as e:
        error_msg = f"send_email failed for {to!r}: {e}"
        logging.error(error_msg)
        await _log_email_result(to, "error", f"Email failed: {subject}", error_msg)
        return False

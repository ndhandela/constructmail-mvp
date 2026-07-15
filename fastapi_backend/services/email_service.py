import os
import logging
import httpx
from dotenv import load_dotenv

load_dotenv()

FROM_NAME = "TechDen Solutions"

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


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
            return True
        logging.error(f"send_email failed for {to!r}: {response.status_code} {response.text}")
        return False
    except Exception as e:
        logging.error(f"send_email failed for {to!r}: {e}")
        return False

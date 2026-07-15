import asyncio
import os
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()

FROM_NAME = "TechDen Solutions"

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_TIMEOUT = 10


def _send_email_sync(to: str, subject: str, html: str) -> None:
    gmail_user = os.getenv("GMAIL_USER")
    gmail_password = os.getenv("GMAIL_APP_PASSWORD")

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{FROM_NAME} <{gmail_user}>"
    message["To"] = to
    message.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as server:
        server.starttls()
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, to, message.as_string())


async def send_email(to: str, subject: str, html: str) -> bool:
    try:
        await asyncio.to_thread(_send_email_sync, to, subject, html)
        return True
    except Exception as e:
        logging.error(f"send_email failed for {to!r}: {e}")
        return False

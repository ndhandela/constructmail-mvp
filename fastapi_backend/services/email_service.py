import asyncio
import os
import logging
import smtplib
import socket
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

    # smtp.gmail.com resolves to both A (IPv4) and AAAA (IPv6) records, and
    # Render's outbound network doesn't support IPv6 - if the stdlib resolver
    # picks the AAAA address first the connection fails immediately with
    # "Network is unreachable". Resolve an IPv4 address explicitly and
    # connect to that instead of letting smtplib resolve SMTP_HOST itself.
    ipv4_addr = socket.getaddrinfo(SMTP_HOST, SMTP_PORT, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]

    with smtplib.SMTP(timeout=SMTP_TIMEOUT) as server:
        server.connect(ipv4_addr, SMTP_PORT)
        # starttls() does TLS SNI (and hostname/cert verification, if a
        # verifying context is ever passed) against self._host, which
        # connect() never touches - it's still '' here since we didn't pass
        # a host to SMTP(). Set it to SMTP_HOST so the TLS handshake targets
        # "smtp.gmail.com", not the raw IP we actually connected to.
        server._host = SMTP_HOST
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

import os
import base64
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

CLIENT_CONFIG = {
    "web": {
        "client_id": os.getenv("GMAIL_CLIENT_ID"),
        "client_secret": os.getenv("GMAIL_CLIENT_SECRET"),
        "redirect_uris": [os.getenv("GMAIL_REDIRECT_URI")],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}


def get_google_auth_url() -> str:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = os.getenv("GMAIL_REDIRECT_URI")
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    return auth_url


async def get_access_token(code: str) -> dict:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = os.getenv("GMAIL_REDIRECT_URI")
    flow.fetch_token(code=code)
    creds = flow.credentials
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
    }


def _get_email_body(payload: dict) -> str:
    if payload.get("parts"):
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    body_data = payload.get("body", {}).get("data", "")
    if body_data:
        return base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="replace")
    return ""


def _get_header(headers: list, name: str) -> str:
    for h in headers:
        if h.get("name") == name:
            return h.get("value", "")
    return ""


async def get_gmail_emails(access_token: str, max_results: int = 15) -> list:
    creds = Credentials(token=access_token)
    service = build("gmail", "v1", credentials=creds)

    response = service.users().messages().list(
        userId="me", maxResults=max_results, q="is:unread OR label:INBOX"
    ).execute()

    messages = response.get("messages", [])
    emails = []
    for msg in messages:
        full = service.users().messages().get(userId="me", id=msg["id"], format="full").execute()
        headers = full["payload"]["headers"]
        emails.append({
            "id": msg["id"],
            "threadId": full.get("threadId"),
            "from": _get_header(headers, "From"),
            "to": _get_header(headers, "To"),
            "subject": _get_header(headers, "Subject"),
            "date": _get_header(headers, "Date"),
            "body": _get_email_body(full["payload"]),
            "labels": full.get("labelIds", []),
        })
    return emails


async def get_gmail_thread(access_token: str, thread_id: str) -> list:
    creds = Credentials(token=access_token)
    service = build("gmail", "v1", credentials=creds)
    thread = service.users().threads().get(userId="me", id=thread_id, format="full").execute()
    result = []
    for msg in thread.get("messages", []):
        headers = msg["payload"]["headers"]
        result.append({
            "id": msg["id"],
            "from": _get_header(headers, "From"),
            "to": _get_header(headers, "To"),
            "subject": _get_header(headers, "Subject"),
            "date": _get_header(headers, "Date"),
            "body": _get_email_body(msg["payload"]),
        })
    return result

import os
import base64
from email.message import EmailMessage
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

# Google silently adds "openid" to the granted scope set whenever userinfo.email /
# userinfo.profile are requested. oauthlib's strict scope-matching otherwise raises
# that as a hard error on token exchange, so it must be relaxed.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
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


def get_google_auth_url() -> dict:
    """Returns the auth URL plus the PKCE code_verifier that generated it.

    google_auth_oauthlib's Flow auto-generates a code_verifier per instance and
    embeds its S256 challenge in the authorization URL. Since the URL is built here
    and the token is exchanged later in get_access_token() with a brand-new Flow
    instance, the verifier must be threaded through the caller (stored client-side
    and sent back with the code) — otherwise Google rejects the exchange with
    "invalid_grant: Missing code verifier".
    """
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = os.getenv("GMAIL_REDIRECT_URI")
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    return {"auth_url": auth_url, "code_verifier": flow.code_verifier}


async def get_access_token(code: str, code_verifier: str = None) -> dict:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES, code_verifier=code_verifier)
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


async def refresh_gmail_token(refresh_token: str) -> dict:
    """Exchange a stored refresh token for a fresh access token."""
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=os.getenv("GMAIL_CLIENT_ID"),
        client_secret=os.getenv("GMAIL_CLIENT_SECRET"),
        token_uri="https://oauth2.googleapis.com/token",
    )
    creds.refresh(GoogleAuthRequest())
    return {"access_token": creds.token}


async def get_gmail_message_meta(access_token: str, message_id: str) -> dict:
    """Fetch from/to/subject/snippet for a single message (used to render review cards)."""
    creds = Credentials(token=access_token)
    service = build("gmail", "v1", credentials=creds)
    full = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    headers = full["payload"]["headers"]
    return {
        "id": message_id,
        "from": _get_header(headers, "From"),
        "to": _get_header(headers, "To"),
        "subject": _get_header(headers, "Subject"),
        "snippet": full.get("snippet", ""),
    }


async def send_gmail_reply(
    access_token: str, thread_id: str, original_message_id: str, to: str, subject: str, body: str
) -> dict:
    """Send a reply within an existing Gmail thread.

    Gmail's `threadId` alone doesn't establish RFC822 threading — the In-Reply-To and
    References headers must be set to the original message's Message-ID, otherwise most
    clients render the reply as a new, disconnected message.
    """
    creds = Credentials(token=access_token)
    service = build("gmail", "v1", credentials=creds)

    orig = service.users().messages().get(
        userId="me", id=original_message_id, format="metadata",
        metadataHeaders=["Message-ID", "References"],
    ).execute()
    orig_headers = orig.get("payload", {}).get("headers", [])
    rfc_message_id = _get_header(orig_headers, "Message-ID")
    prior_references = _get_header(orig_headers, "References")
    references = f"{prior_references} {rfc_message_id}".strip() if prior_references else rfc_message_id

    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    if rfc_message_id:
        message["In-Reply-To"] = rfc_message_id
    if references:
        message["References"] = references
    message.set_content(body)

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    sent = service.users().messages().send(
        userId="me", body={"raw": raw, "threadId": thread_id}
    ).execute()
    return {"id": sent.get("id"), "threadId": sent.get("threadId")}

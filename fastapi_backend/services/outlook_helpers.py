import os
import httpx
from msal import ConfidentialClientApplication
from dotenv import load_dotenv

load_dotenv()


def _get_msal_client() -> ConfidentialClientApplication:
    tenant_id = os.getenv("MICROSOFT_TENANT_ID", "common")
    return ConfidentialClientApplication(
        client_id=os.getenv("MICROSOFT_CLIENT_ID"),
        client_credential=os.getenv("MICROSOFT_CLIENT_SECRET"),
        authority=f"https://login.microsoftonline.com/{tenant_id}",
    )


def get_microsoft_auth_url() -> str:
    tenant_id = os.getenv("MICROSOFT_TENANT_ID", "common")
    params = {
        "client_id": os.getenv("MICROSOFT_CLIENT_ID"),
        "redirect_uri": os.getenv("MICROSOFT_REDIRECT_URI"),
        "response_type": "code",
        "scope": "https://graph.microsoft.com/.default offline_access",
        "state": "constructmail_oauth",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize?{query}"


async def get_access_token(code: str) -> dict:
    client = _get_msal_client()
    result = client.acquire_token_by_authorization_code(
        code=code,
        scopes=["https://graph.microsoft.com/.default"],
        redirect_uri=os.getenv("MICROSOFT_REDIRECT_URI"),
    )
    return {
        "access_token": result.get("access_token"),
        "refresh_token": result.get("refresh_token"),
        "expires_at": result.get("id_token_claims", {}).get("exp"),
    }


async def refresh_access_token(refresh_token: str) -> dict:
    client = _get_msal_client()
    result = client.acquire_token_by_refresh_token(
        refresh_token=refresh_token,
        scopes=["https://graph.microsoft.com/.default"],
    )
    return {
        "access_token": result.get("access_token"),
        "refresh_token": result.get("refresh_token"),
        "expires_at": result.get("id_token_claims", {}).get("exp"),
    }


async def get_outlook_emails(access_token: str, max_results: int = 15) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            "https://graph.microsoft.com/v1.0/me/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "$top": max_results,
                "$orderby": "receivedDateTime DESC",
                "$select": "id,conversationId,subject,from,toRecipients,body,receivedDateTime,bodyPreview",
            },
        )
        response.raise_for_status()
        msgs = response.json().get("value", [])

    return [
        {
            "id": m["id"],
            "conversationId": m["conversationId"],
            "threadId": m["conversationId"],
            "from": m["from"]["emailAddress"]["address"],
            "to": ", ".join(r["emailAddress"]["address"] for r in m.get("toRecipients", [])),
            "subject": m["subject"],
            "date": m["receivedDateTime"],
            "body": m["body"]["content"],
            "bodyPreview": m.get("bodyPreview"),
        }
        for m in msgs
    ]


async def get_outlook_message_meta(access_token: str, message_id: str) -> dict:
    """Fetch from/to/subject/snippet for a single message (used to render review cards)."""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"https://graph.microsoft.com/v1.0/me/messages/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"$select": "id,subject,from,toRecipients,bodyPreview"},
        )
        response.raise_for_status()
        m = response.json()
    return {
        "id": m["id"],
        "from": m["from"]["emailAddress"]["address"],
        "to": ", ".join(r["emailAddress"]["address"] for r in m.get("toRecipients", [])),
        "subject": m["subject"],
        "snippet": m.get("bodyPreview", ""),
    }


async def send_outlook_reply(access_token: str, message_id: str, comment: str) -> dict:
    """Send a reply to an Outlook message with a custom body.

    Graph's simple `/reply` endpoint only accepts a short comment appended above the
    quoted original — it can't replace the body outright. Since the review workflow
    always supplies a full AI-drafted (and possibly edited) body, we use the
    createReply -> PATCH body -> send chain instead, which lets us set the exact body
    while Graph still handles recipients, subject prefixing, and threading.
    """
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        create = await client.post(
            f"https://graph.microsoft.com/v1.0/me/messages/{message_id}/createReply",
            headers=headers, json={},
        )
        create.raise_for_status()
        draft_id = create.json()["id"]

        patch = await client.patch(
            f"https://graph.microsoft.com/v1.0/me/messages/{draft_id}",
            headers=headers,
            json={"body": {"contentType": "Text", "content": comment}},
        )
        patch.raise_for_status()

        send = await client.post(
            f"https://graph.microsoft.com/v1.0/me/messages/{draft_id}/send",
            headers=headers,
        )
        send.raise_for_status()

    return {"id": draft_id}


async def get_outlook_thread(access_token: str, conversation_id: str) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            "https://graph.microsoft.com/v1.0/me/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "$filter": f"conversationId eq '{conversation_id}'",
                "$orderby": "receivedDateTime ASC",
                "$select": "id,subject,from,toRecipients,body,receivedDateTime",
            },
        )
        response.raise_for_status()
        msgs = response.json().get("value", [])

    return [
        {
            "id": m["id"],
            "from": m["from"]["emailAddress"]["address"],
            "to": ", ".join(r["emailAddress"]["address"] for r in m.get("toRecipients", [])),
            "subject": m["subject"],
            "date": m["receivedDateTime"],
            "body": m["body"]["content"],
        }
        for m in msgs
    ]

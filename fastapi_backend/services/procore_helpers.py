import os
import httpx
from dotenv import load_dotenv

load_dotenv()

COMPANY_ID = 4284114
FALLBACK_MANAGER_ID = 99519


def _get_config() -> dict:
    return {
        "client_id": os.getenv("PROCORE_SANDBOX_CLIENT_ID") or os.getenv("PROCORE_CLIENT_ID"),
        "client_secret": os.getenv("PROCORE_SANDBOX_CLIENT_SECRET") or os.getenv("PROCORE_CLIENT_SECRET"),
        "redirect_uri": os.getenv("PROCORE_SANDBOX_REDIRECT_URI") or os.getenv("PROCORE_REDIRECT_URI"),
        "base_url": os.getenv("PROCORE_BASE_URL", "https://sandbox.procore.com"),
    }


def get_auth_url(state: str = "") -> str:
    cfg = _get_config()
    params = f"response_type=code&client_id={cfg['client_id']}&redirect_uri={cfg['redirect_uri']}&state={state}"
    return f"{cfg['base_url']}/oauth/authorize?{params}"


async def exchange_code_for_token(code: str) -> dict:
    cfg = _get_config()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{cfg['base_url']}/oauth/token",
            json={
                "grant_type": "authorization_code",
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "redirect_uri": cfg["redirect_uri"],
                "code": code,
            },
        )
        response.raise_for_status()
        return response.json()


async def refresh_access_token(refresh_token: str) -> dict:
    cfg = _get_config()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{cfg['base_url']}/oauth/token",
            json={
                "grant_type": "refresh_token",
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "redirect_uri": cfg["redirect_uri"],
                "refresh_token": refresh_token,
            },
        )
        response.raise_for_status()
        return response.json()


def _procore_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Procore-Company-Id": str(COMPANY_ID),
    }


async def get_projects(access_token: str) -> list:
    cfg = _get_config()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{cfg['base_url']}/rest/v1.0/projects",
            headers=_procore_headers(access_token),
            params={"company_id": COMPANY_ID, "per_page": 100},
        )
        response.raise_for_status()
        return response.json()


async def get_project_users(access_token: str, project_id: str) -> list:
    cfg = _get_config()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{cfg['base_url']}/rest/v1.0/projects/{project_id}/users",
            headers=_procore_headers(access_token),
            params={"per_page": 100},
        )
        response.raise_for_status()
        return response.json()


def _sanitize(text: str) -> str:
    if not text:
        return ""
    replacements = {
        "—": "-", "–": "-",
        "‘": "'", "’": "'",
        "“": '"', "”": '"',
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return "".join(c for c in text if ord(c) < 128).strip()


def _map_priority(priority: str) -> str:
    return {"Critical": "high", "High": "high", "Medium": "medium", "Low": "low"}.get(priority, "medium")


async def create_rfi(access_token: str, project_id: str, rfi_data: dict) -> dict:
    cfg = _get_config()
    manager_id = rfi_data.get("assigneeId") or FALLBACK_MANAGER_ID
    try:
        users = await get_project_users(access_token, project_id)
        if users:
            manager_id = users[0]["id"]
    except Exception:
        pass

    subject = _sanitize(rfi_data.get("title", "")) or "Clash RFI"
    question = _sanitize(rfi_data.get("description", "")) or subject

    payload = {
        "rfi": {
            "subject": subject,
            "question": {"body": question},
            "priority": _map_priority(rfi_data.get("priority", "")),
            "reference": _sanitize("POMAR Clash - " + rfi_data.get("clashName", "")),
            "rfi_manager_id": manager_id,
            "draft": True,
        }
    }
    if rfi_data.get("dueDate"):
        payload["rfi"]["due_date"] = rfi_data["dueDate"]

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{cfg['base_url']}/rest/v1.0/projects/{project_id}/rfis",
            headers=_procore_headers(access_token),
            json=payload,
        )
        response.raise_for_status()
        return response.json()

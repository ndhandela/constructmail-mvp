import secrets
import bcrypt
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.email_service import send_email
from services.project_helpers import accept_pending_invites
from services.access_control import get_active_modules
from services.magic_link import issue_magic_link
from services.marketplace_sessions import issue_session_token
import os

router = APIRouter(prefix="/api/auth", tags=["Auth"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://pomar.ai")

# Mirrors the `value`s in frontend/src/modules/shared/auth/Auth.js's ROLES
# (excluding the empty placeholder option).
VALID_ROLES = ("GC", "Subcontractor", "Owner", "VDC", "Other")


class MagicLinkRequest(BaseModel):
    email: str


class VerifyTokenRequest(BaseModel):
    token: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


class GmailCallbackRequest(BaseModel):
    code: str
    userId: int
    codeVerifier: Optional[str] = None


class OutlookCallbackRequest(BaseModel):
    code: str
    userId: int


class UpdateRoleRequest(BaseModel):
    userId: int
    role: str


@router.post("/send-magic-link")
async def send_magic_link(req: MagicLinkRequest, request: Request):
    origin = request.headers.get("origin", FRONTEND_URL)
    pool = await get_pool()
    async with pool.acquire() as conn:
        magic_link = await issue_magic_link(conn, req.email, origin)
    return {"message": "Magic link generated", "magicLink": magic_link, "email": req.email}


@router.post("/verify-token")
async def verify_token(req: VerifyTokenRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            "SELECT * FROM sessions WHERE magic_token = $1 AND expires_at > NOW()", req.token
        )
        if not session:
            raise HTTPException(400, "Invalid or expired token")
        email = session["email"]
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
        if not user:
            user = await conn.fetchrow(
                "INSERT INTO users (email, name, company) VALUES ($1, $2, $3) RETURNING *",
                email, email.split("@")[0], "Construction Company",
            )
        user_id = user["id"]
        await conn.execute("UPDATE users SET last_login = NOW() WHERE id = $1", user_id)
        await conn.execute("UPDATE sessions SET is_verified = TRUE WHERE magic_token = $1", req.token)
        await accept_pending_invites(conn, user_id, email)
        # Every magic-link login (not just marketplace lead flows) gets a
        # session token now, since GET .../full and POST .../dispute accept
        # both lead and already-invited active accounts uniformly and need
        # a single auth mechanism that works for both.
        session_token = await issue_session_token(conn, user_id)
    return {"success": True, "userId": user_id, "email": email, "sessionToken": session_token}


@router.get("/me")
async def get_me(userId: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, name, full_name, company, role, permission_level, company_id, trust_role FROM users WHERE id = $1", userId
        )
        if not row:
            raise HTTPException(401, "User not found")
        user = dict(row)
        user["active_modules"] = await get_active_modules(conn, user["company_id"])
        user["company_region"] = await conn.fetchval(
            "SELECT region FROM companies WHERE id = $1", user["company_id"]
        ) if user["company_id"] else None
        # Surfaces any pending Vendor Management invites on every /me call
        # (already fetched on every page load) rather than a dedicated
        # endpoint — see routers/project_vendor_access.py.
        pending_invites = await conn.fetch(
            """SELECT pva.id AS access_id, pva.project_id, p.name AS project_name, pva.role, pva.invited_at,
                      u2.name AS invited_by_name
               FROM project_vendor_access pva
               JOIN projects p ON p.id = pva.project_id
               JOIN users u2 ON u2.id = pva.invited_by_user_id
               WHERE pva.vendor_user_id = $1 AND pva.status = 'invited'
               ORDER BY pva.invited_at DESC""",
            userId,
        )
        user["pending_vendor_invites"] = [dict(r) for r in pending_invites]
    return user


@router.patch("/role")
async def update_role(req: UpdateRoleRequest):
    """
    Magic-link sign-in (verify_token) creates users with no role. This lets
    the frontend collect it afterward — required before the user can do
    anything role-gated, like creating a project.
    """
    if req.role not in VALID_ROLES:
        raise HTTPException(400, f"role must be one of: {', '.join(VALID_ROLES)}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, role", req.role, req.userId
        )
        if not row:
            raise HTTPException(404, "User not found")
    return {"success": True, "role": row["role"]}


@router.post("/accept-invite")
async def accept_invite(req: AcceptInviteRequest):
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id FROM users WHERE invite_token = $1 AND invite_token_expires > NOW()", req.token
        )
        if not user:
            raise HTTPException(400, "Invalid or expired invite link. Please ask your company owner to resend it.")
        password_hash = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt(12)).decode()
        await conn.execute(
            "UPDATE users SET password_hash = $1, invite_token = NULL, invite_token_expires = NULL WHERE id = $2",
            password_hash, user["id"],
        )
    return {"success": True, "userId": user["id"]}


@router.post("/login")
async def login(req: LoginRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, password_hash, company_id FROM users WHERE email = $1", req.email.lower().strip()
        )
        if not user:
            raise HTTPException(401, "No account found with this email.")
        if not user["password_hash"]:
            raise HTTPException(401, "This account uses magic link login. Please use the sign in link option.")
        if not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
            raise HTTPException(401, "Incorrect password.")
        # Company status is checked only after the password succeeds, so a
        # wrong-password guess still gets "Incorrect password" and never
        # learns whether the account's company has been deactivated.
        if user["company_id"]:
            company = await conn.fetchrow("SELECT status FROM companies WHERE id = $1", user["company_id"])
            if company and company["status"] != "active":
                raise HTTPException(403, "Your company account has been deactivated. Contact your POMAR administrator.")
    return {"success": True, "userId": user["id"]}


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, full_name, name FROM users WHERE email = $1", req.email.lower().strip())
        if not user:
            return {"success": True, "message": "If an account exists, a reset link has been sent."}
        token = secrets.token_hex(32)
        expires = datetime.utcnow() + timedelta(hours=1)
        await conn.execute("UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3", token, expires, user["id"])

    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    first_name = (user["full_name"] or user["name"] or "there").split(" ")[0]
    await send_email(
        to=req.email,
        subject="Reset your POMAR password",
        html=f"""
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #0E1B2C;">Reset your password</h2>
          <p>Hi {first_name},</p>
          <p>You requested a password reset for your POMAR account.</p>
          <a href="{reset_url}" style="display:inline-block;padding:12px 24px;background:#D97706;color:white;border-radius:100px;text-decoration:none;font-weight:600;margin:20px 0;">
            Reset Password
          </a>
          <p style="color:#666;font-size:13px;">This link expires in 1 hour.</p>
        </div>""",
    )
    return {"success": True, "message": "If an account exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()", req.token)
        if not user:
            raise HTTPException(400, "Invalid or expired reset link. Please request a new one.")
        password_hash = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt(12)).decode()
        await conn.execute(
            "UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
            password_hash, user["id"],
        )
    return {"success": True, "message": "Password updated successfully."}


@router.get("/gmail-url")
async def gmail_url():
    from services.gmail_helpers import get_google_auth_url
    result = get_google_auth_url()
    return {"authUrl": result["auth_url"], "codeVerifier": result["code_verifier"]}


@router.post("/gmail-callback")
async def gmail_callback(req: GmailCallbackRequest):
    from services.gmail_helpers import get_access_token
    tokens = await get_access_token(req.code, req.codeVerifier)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET gmail_access_token = $1, gmail_refresh_token = $2, gmail_send_scope_granted = TRUE WHERE id = $3",
            tokens["access_token"], tokens.get("refresh_token"), req.userId,
        )
    return {"success": True, "message": "Gmail connected successfully"}


@router.get("/outlook-url")
async def outlook_url():
    from services.outlook_helpers import get_microsoft_auth_url
    return {"authUrl": get_microsoft_auth_url()}


@router.post("/outlook-callback")
async def outlook_callback_post(req: OutlookCallbackRequest):
    from services.outlook_helpers import get_access_token
    tokens = await get_access_token(req.code)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET outlook_access_token = $1, outlook_refresh_token = $2, outlook_token_expires = $3, outlook_send_scope_granted = TRUE WHERE id = $4",
            tokens["access_token"], tokens.get("refresh_token"), tokens.get("expires_at"), req.userId,
        )
    return {"success": True, "message": "Outlook connected successfully"}


@router.get("/outlook-callback")
async def outlook_callback_get(code: str = None, error: str = None, error_description: str = None):
    from fastapi.responses import HTMLResponse
    if error:
        return HTMLResponse(f"""
            <html><body><p>Error: {error_description}</p>
            <script>window.opener.postMessage({{type:'OUTLOOK_CALLBACK',error:'{error_description}'}},'*');window.close();</script>
            </body></html>""")
    if code:
        return HTMLResponse(f"""
            <html><body><p>Connecting to Outlook...</p>
            <script>window.opener.postMessage({{type:'OUTLOOK_CALLBACK',code:'{code}'}},'*');window.close();</script>
            </body></html>""")
    raise HTTPException(400, "No authorization code received")


@router.get("/procore-url")
async def procore_url(userId: str = ""):
    """Also the "Reconnect" entry point (PmisSetupCard) — not just first-time
    setup. No separate reconnect endpoint needed: the callback below does an
    ON CONFLICT UPDATE, so re-running this same flow overwrites whatever
    token was already stored for this user rather than requiring it to be
    cleared first. That also means a cancelled/failed reconnect attempt
    leaves the previous (possibly still-working) token in place instead of
    leaving the user disconnected."""
    from services.procore_helpers import get_auth_url
    return {"url": get_auth_url(userId)}


@router.get("/procore/callback")
async def procore_callback(code: str = None, state: str = ""):
    from fastapi.responses import HTMLResponse
    from services.procore_helpers import exchange_code_for_token
    from db import get_pool
    if not code:
        raise HTTPException(400, "No code received")
    tokens = await exchange_code_for_token(code)
    import os as _os
    key = _os.getenv("TOKEN_ENCRYPTION_KEY")
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO procore_tokens (user_id, access_token, refresh_token, expires_at)
               VALUES ($1, pgp_sym_encrypt($2, $3), pgp_sym_encrypt($4, $3), NOW() + INTERVAL '2 hours')
               ON CONFLICT (user_id) DO UPDATE SET
                 access_token = pgp_sym_encrypt($2, $3),
                 refresh_token = pgp_sym_encrypt($4, $3),
                 expires_at = NOW() + INTERVAL '2 hours'""",
            state, tokens["access_token"], key, tokens.get("refresh_token"),
        )
    return HTMLResponse("<script>window.opener&&window.opener.postMessage({type:'PROCORE_CONNECTED'},'*');window.close();</script>")

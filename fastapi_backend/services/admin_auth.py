import os
import json
from datetime import datetime, timedelta
from typing import Optional
import bcrypt
import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("ADMIN_JWT_SECRET", "your-secret-key-change-in-production")
JWT_EXPIRY_HOURS = 24

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(admin: dict) -> str:
    payload = {
        "id": admin["id"],
        "email": admin["email"],
        "admin_level": admin["admin_level"],
        "client_id": admin.get("client_id"),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_admin(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    return decode_token(credentials.credentials)


async def require_super_admin(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    admin = decode_token(credentials.credentials)
    if admin.get("admin_level") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return admin

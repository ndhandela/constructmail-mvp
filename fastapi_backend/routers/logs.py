from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from db import get_pool
from services.admin_auth import require_admin

router = APIRouter(tags=["Logs"])


class FrontendErrorRequest(BaseModel):
    message: str
    detail: Optional[str] = None
    userEmail: Optional[str] = None


@router.post("/api/logs/frontend-error")
async def log_frontend_error(req: FrontendErrorRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO system_logs (source, level, message, detail, user_email)
               VALUES ('frontend', 'error', $1, $2, $3)""",
            req.message, req.detail, req.userEmail,
        )
    return {"success": True}


@router.get("/api/admin/logs")
async def get_logs(
    source: Optional[str] = None,
    level: Optional[str] = None,
    companyId: Optional[int] = None,
    search: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    admin: dict = Depends(require_admin),
):
    conditions = []
    params = []
    p = 1
    if source:
        conditions.append(f"sl.source = ${p}")
        params.append(source)
        p += 1
    if level:
        conditions.append(f"sl.level = ${p}")
        params.append(level)
        p += 1
    if companyId:
        conditions.append(f"sl.company_id = ${p}")
        params.append(companyId)
        p += 1
    if search:
        conditions.append(f"(sl.message ILIKE ${p} OR sl.detail ILIKE ${p})")
        params.append(f"%{search}%")
        p += 1
    if startDate:
        conditions.append(f"sl.created_at >= ${p}")
        params.append(startDate)
        p += 1
    if endDate:
        conditions.append(f"sl.created_at <= ${p}")
        params.append(endDate)
        p += 1

    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT sl.*, c.name AS company_name FROM system_logs sl
                LEFT JOIN companies c ON c.id = sl.company_id{where_clause}
                ORDER BY sl.created_at DESC LIMIT ${p} OFFSET ${p + 1}""",
            *params, limit, offset,
        )
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM system_logs sl{where_clause}", *params
        )
    return {"success": True, "logs": [dict(r) for r in rows], "total": total}

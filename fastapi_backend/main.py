import logging
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from db import init_db, get_pool
from routers import ai, auth, gmail, outlook, clash, procore, vendors, admin, misc, marketplace, profile, mail, projects, team, logs
from routers import connect as connect_router
from routers import trust, trust_uploads, trust_qpr, trust_alerts, capital, daily_logs, project_vendor_access
from routers import invoices, invoice_accountant_access
from routers import documents
from services import trust_reminders, marketplace_verification


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    connect_router.start_scheduler()
    trust_reminders.start_scheduler()
    marketplace_verification.start_scheduler()
    yield


app = FastAPI(
    title="ConstructMail Intelligence API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(misc.router)
app.include_router(projects.router)
app.include_router(ai.router)
app.include_router(auth.router)
app.include_router(gmail.router)
app.include_router(outlook.router)
app.include_router(mail.router)
app.include_router(clash.router)
app.include_router(procore.router)
app.include_router(vendors.router)
app.include_router(marketplace.router)
app.include_router(marketplace.pages_router)
app.include_router(profile.router)
app.include_router(team.router)
app.include_router(admin.router)
app.include_router(logs.router)
app.include_router(connect_router.router)
app.include_router(trust.router)
app.include_router(trust_uploads.router)
app.include_router(trust_qpr.router)
app.include_router(trust_alerts.router)
app.include_router(capital.router)
app.include_router(capital.project_router)
app.include_router(daily_logs.router)
app.include_router(project_vendor_access.router)
app.include_router(invoices.router)
app.include_router(invoice_accountant_access.router)
app.include_router(documents.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO system_logs (source, level, message, detail) VALUES ('server', 'error', $1, $2)",
                str(exc), traceback.format_exc(),
            )
    except Exception:
        logging.exception("Failed to log unhandled exception to system_logs")
    # JSON, not plain text: every frontend fetch call does `await res.json()`
    # unconditionally (matching FastAPI's own {"detail": ...} shape from
    # HTTPException), so a plain-text body throws a parse error client-side
    # that gets swallowed by the calling code's generic catch block —
    # turning a real server error into a misleading "Network error" message
    # with no indication of what actually failed.
    return JSONResponse({"detail": "Internal Server Error"}, status_code=500)

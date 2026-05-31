from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import init_db
from routers import ai, auth, gmail, outlook, clash, procore, vendors, admin, misc


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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
app.include_router(ai.router)
app.include_router(auth.router)
app.include_router(gmail.router)
app.include_router(outlook.router)
app.include_router(clash.router)
app.include_router(procore.router)
app.include_router(vendors.router)
app.include_router(admin.router)

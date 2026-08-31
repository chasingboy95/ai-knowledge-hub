from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.core.config import get_settings
from backend.app.db.session import dispose_engine
from backend.app.api.router import api_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()
    try:
        yield
    finally:
        await dispose_engine()


app = FastAPI(
    title="AI Knowledge Hub API",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(api_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

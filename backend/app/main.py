from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api.errors import error_response
from backend.app.core.config import get_settings
from backend.app.db.session import dispose_engine
from backend.app.api.router import api_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings.cache_clear()
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


@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(_: Request, exc: StarletteHTTPException):
    return error_response(exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, __: RequestValidationError):
    return error_response(422)


@app.exception_handler(Exception)
async def handle_unexpected_error(_: Request, __: Exception):
    return error_response(500)


@app.get("/health", response_model=dict[str, str])
async def health() -> dict[str, str]:
    return {"status": "ok"}

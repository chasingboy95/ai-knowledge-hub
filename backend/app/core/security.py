import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from backend.app.core.config import Settings, get_settings

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(
    user_id: UUID,
    expires_delta: timedelta | None = None,
    token_type: str = "access",
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    now = datetime.now(timezone.utc)
    expires_delta = expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "type": token_type, "iat": now, "exp": now + expires_delta},
        settings.jwt_secret_key,
        algorithm="HS256",
    )


def decode_access_token(token: str, settings: Settings | None = None) -> UUID:
    settings = settings or get_settings()
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=["HS256"],
        options={"require": ["sub", "type", "iat", "exp"]},
    )
    if (
        not isinstance(payload.get("sub"), str)
        or not isinstance(payload.get("type"), str)
        or isinstance(payload.get("iat"), bool)
        or not isinstance(payload.get("iat"), int)
        or isinstance(payload.get("exp"), bool)
        or not isinstance(payload.get("exp"), int)
    ):
        raise jwt.InvalidTokenError("invalid claim types")
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("invalid token type")
    try:
        return UUID(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise jwt.InvalidTokenError("invalid subject") from exc


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

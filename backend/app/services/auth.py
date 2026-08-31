from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings
from backend.app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from backend.app.db.base import utc_now
from backend.app.models.user import RefreshToken, User


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def register_user(session: AsyncSession, email: str, password: str, full_name: str | None) -> User:
    normalized = normalize_email(email)
    if await session.scalar(select(User).where(User.email == normalized)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=normalized, password_hash=hash_password(password), full_name=full_name)
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from exc
    await session.refresh(user)
    return user


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User:
    user = await session.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return user


async def issue_tokens(session: AsyncSession, user: User, settings: Settings) -> tuple[str, str]:
    access_token = create_access_token(user.id, settings=settings)
    refresh_token = create_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=utc_now() + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await session.commit()
    return access_token, refresh_token


async def rotate_refresh_token(session: AsyncSession, token: str, settings: Settings) -> tuple[User, str, str]:
    token_hash = hash_refresh_token(token)
    stored = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    now = utc_now()
    if stored is None:
        await session.rollback()
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await session.get(User, stored.user_id)
    if user is None or not user.is_active:
        await session.rollback()
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    refresh_token = create_refresh_token()
    replacement = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token),
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )
    session.add(replacement)
    await session.flush()
    result = await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .values(revoked_at=now, replaced_by=replacement.id)
    )
    if result.rowcount != 1:
        await session.rollback()
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    access_token = create_access_token(user.id, settings=settings)
    await session.commit()
    return user, access_token, refresh_token


async def revoke_refresh_token(session: AsyncSession, token: str) -> None:
    stored = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(token))
    )
    if stored is not None and stored.revoked_at is None:
        stored.revoked_at = utc_now()
        await session.commit()

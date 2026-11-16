from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.db.session import get_db_session
from backend.app.models.organization import Membership
from backend.app.schemas.auth import Credentials, RefreshRequest, RegisterRequest, TokenResponse
from backend.app.services.audit import record_audit_log
from backend.app.services.auth import (
    authenticate_user,
    issue_tokens,
    register_user,
    revoke_refresh_token,
    rotate_refresh_token,
)

router = APIRouter()


def token_response(access_token: str, refresh_token: str, settings: Settings) -> TokenResponse:
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, session: AsyncSession = Depends(get_db_session), settings: Settings = Depends(get_settings)):
    user = await register_user(session, data.email, data.password, data.full_name)
    access_token, refresh_token = await issue_tokens(session, user, settings)
    return token_response(access_token, refresh_token, settings)


@router.post("/login", response_model=TokenResponse)
async def login(data: Credentials, session: AsyncSession = Depends(get_db_session), settings: Settings = Depends(get_settings)):
    user = await authenticate_user(session, data.email, data.password)
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token, refresh_token = await issue_tokens(session, user, settings)

    membership = await session.scalar(select(Membership).where(Membership.user_id == user.id))
    if membership:
        await record_audit_log(
            db=session,
            organization_id=membership.organization_id,
            user_id=user.id,
            event_type="AUTH_LOGIN",
            resource_type="user",
            resource_id=str(user.id),
            payload={"email": user.email},
        )

    return token_response(access_token, refresh_token, settings)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, session: AsyncSession = Depends(get_db_session), settings: Settings = Depends(get_settings)):
    _, access_token, refresh_token = await rotate_refresh_token(session, data.refresh_token, settings)
    return token_response(access_token, refresh_token, settings)


@router.post("/logout", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def logout(data: RefreshRequest, session: AsyncSession = Depends(get_db_session)) -> Response:
    await revoke_refresh_token(session, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

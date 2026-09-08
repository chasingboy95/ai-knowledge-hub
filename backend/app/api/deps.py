import jwt
from collections.abc import Awaitable, Callable
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.core.security import decode_access_token
from backend.app.db.session import get_db_session
from backend.app.models.user import User
from backend.app.models.organization import Membership
from backend.app.services.authorization import load_membership, membership_has_permission

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> User:
    try:
        user_id = decode_access_token(token, settings=settings)
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid access token")
    return user


async def get_membership(
    organization_id: UUID, current_user: User, db: AsyncSession
) -> Membership:
    membership = await load_membership(db, current_user.id, organization_id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this organization")
    return membership


async def get_current_membership(
    organization_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> Membership:
    return await get_membership(organization_id, current_user, db)


def require_permission(permission_code: str) -> Callable[..., Awaitable[Membership]]:
    async def permission_dependency(
        organization_id: UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> Membership:
        membership = await get_membership(organization_id, current_user, db)
        if not membership_has_permission(membership, permission_code):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return membership

    return permission_dependency

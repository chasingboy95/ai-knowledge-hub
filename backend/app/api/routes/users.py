from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_current_user
from backend.app.core.security import hash_password, verify_password
from backend.app.db.session import get_db_session
from backend.app.models.user import User
from backend.app.schemas.user import (
    PasswordChangeRequest,
    UserPasswordChangeResponse,
    UserRead,
    UserUpdate,
)

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def profile(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserRead)
async def update_profile(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    user.full_name = data.full_name
    await session.commit()
    await session.refresh(user)
    return user


@router.post(
    "/me/password",
    response_model=UserPasswordChangeResponse,
    status_code=status.HTTP_200_OK,
)
async def change_password(
    data: PasswordChangeRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserPasswordChangeResponse:
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="原密码不正确",
        )
    user.password_hash = hash_password(data.new_password)
    await session.commit()
    return UserPasswordChangeResponse(message="密码修改成功")

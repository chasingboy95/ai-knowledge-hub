from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.organization import Membership
from backend.app.models.rbac import Role


async def load_membership(
    db: AsyncSession, user_id: UUID, organization_id: UUID
) -> Membership | None:
    return await db.scalar(
        select(Membership)
        .where(Membership.user_id == user_id, Membership.organization_id == organization_id)
        .options(selectinload(Membership.role).selectinload(Role.permissions))
    )


def membership_has_permission(membership: Membership | None, permission_code: str) -> bool:
    return membership is not None and membership.role is not None and any(
        permission.code == permission_code for permission in membership.role.permissions
    )


async def authorize_membership(
    db: AsyncSession, user_id: UUID, organization_id: UUID, permission_code: str
) -> Membership:
    membership = await load_membership(db, user_id, organization_id)
    if not membership_has_permission(membership, permission_code):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    return membership

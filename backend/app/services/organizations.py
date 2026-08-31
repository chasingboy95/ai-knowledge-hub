import secrets
from datetime import timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.security import hash_refresh_token
from backend.app.db.base import utc_now
from backend.app.models.organization import Membership, Organization, OrganizationInvitation
from backend.app.models.rbac import Role
from backend.app.models.user import User
from backend.app.services.auth import normalize_email
from backend.app.services.authorization import authorize_membership
from backend.app.services.rbac import seed_rbac

VALID_ROLES = {"OWNER", "ADMIN", "EDITOR", "VIEWER"}


async def create_organization(db: AsyncSession, user: User, name: str, slug: str) -> Organization:
    if await db.scalar(select(Organization).where(Organization.slug == slug)):
        raise HTTPException(status_code=409, detail="Organization slug already exists")
    await seed_rbac(db)
    owner = await db.scalar(select(Role).where(Role.code == "OWNER"))
    organization = Organization(name=name, slug=slug)
    db.add(organization)
    await db.flush()
    db.add(Membership(user_id=user.id, organization_id=organization.id, role_id=owner.id))
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Organization slug already exists") from exc
    await db.refresh(organization)
    return organization


async def create_invitation(db: AsyncSession, organization_id: UUID, user: User, email: str, role_code: str):
    actor_membership = await authorize_membership(db, user.id, organization_id, "member:invite")
    role_code = role_code.upper()
    if role_code not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Invalid role")
    if role_code == "OWNER" and actor_membership.role.code != "OWNER":
        raise HTTPException(status_code=403, detail="Permission denied")
    await seed_rbac(db)
    role = await db.scalar(select(Role).where(Role.code == role_code))
    token = secrets.token_urlsafe(32)
    invitation = OrganizationInvitation(
        organization_id=organization_id, email=normalize_email(email),
        token_hash=hash_refresh_token(token), role_id=role.id,
        expires_at=utc_now() + timedelta(days=7), created_by=user.id,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    return invitation, token


async def accept_invitation(db: AsyncSession, token: str, user: User) -> Membership:
    invitation = await db.scalar(
        select(OrganizationInvitation).where(
            OrganizationInvitation.token_hash == hash_refresh_token(token)
        )
    )
    now = utc_now()
    if invitation is None or invitation.accepted_at is not None or invitation.expires_at <= now:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.email != normalize_email(user.email):
        raise HTTPException(status_code=404, detail="Invitation not found")
    result = await db.execute(
        update(OrganizationInvitation)
        .where(
            OrganizationInvitation.id == invitation.id,
            OrganizationInvitation.accepted_at.is_(None),
            OrganizationInvitation.expires_at > now,
        )
        .values(accepted_at=now)
    )
    if result.rowcount != 1:
        await db.rollback()
        raise HTTPException(status_code=404, detail="Invitation not found")
    membership = Membership(user_id=user.id, organization_id=invitation.organization_id, role_id=invitation.role_id)
    db.add(membership)
    invitation.accepted_at = now
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=404, detail="Invitation not found") from exc
    await db.refresh(membership)
    return membership


async def remove_member(db: AsyncSession, organization_id: UUID, user_id: UUID, actor_id: UUID) -> None:
    organization = await db.scalar(
        select(Organization).where(Organization.id == organization_id).with_for_update()
    )
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    actor_membership = await authorize_membership(db, actor_id, organization_id, "member:remove")
    membership = await db.scalar(select(Membership).options(selectinload(Membership.role)).where(
        Membership.organization_id == organization_id, Membership.user_id == user_id
    ))
    if membership is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if membership.role and membership.role.code == "OWNER":
        if not actor_membership.role or actor_membership.role.code != "OWNER":
            raise HTTPException(status_code=403, detail="Permission denied")
        if actor_id == user_id:
            raise HTTPException(status_code=409, detail="Owner cannot remove themselves")
        owner_count = await db.scalar(select(func.count()).select_from(Membership).join(Role).where(
            Membership.organization_id == organization_id, Role.code == "OWNER"
        ))
        if owner_count <= 1:
            raise HTTPException(status_code=409, detail="Cannot remove the last owner")
    await db.delete(membership)
    await db.commit()

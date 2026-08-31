from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.api.deps import get_current_user, get_db_session, require_permission
from backend.app.core.config import Settings, get_settings
from backend.app.models.organization import Membership, Organization
from backend.app.models.user import User
from backend.app.schemas.organization import InvitationAcceptResponse, InvitationCreate, InvitationResponse, MemberResponse, OrganizationCreate, OrganizationResponse
from backend.app.services.organizations import accept_invitation, create_invitation, create_organization, remove_member

router = APIRouter()
invitation_router = APIRouter()


@router.post("", response_model=OrganizationResponse, status_code=201)
async def create(data: OrganizationCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    return await create_organization(db, user, data.name, data.slug)


@router.get("", response_model=list[OrganizationResponse])
async def list_organizations(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    return list((await db.scalars(select(Organization).join(Membership).where(Membership.user_id == user.id))).all())


@router.get("/{organization_id}", response_model=OrganizationResponse)
async def get_organization(organization_id: UUID, _: Membership = Depends(require_permission("organization:read")), db: AsyncSession = Depends(get_db_session)):
    organization = await db.scalar(
        select(Organization).where(Organization.id == organization_id)
    )
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization


@router.post("/{organization_id}/invitations", response_model=InvitationResponse, response_model_exclude_none=True, status_code=201)
async def invite(organization_id: UUID, data: InvitationCreate, _: Membership = Depends(require_permission("member:invite")), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session), settings: Settings = Depends(get_settings)):
    invitation, token = await create_invitation(db, organization_id, user, data.email, data.role)
    response = {"invitation_id": invitation.id}
    if settings.environment == "development":
        response["invite_token"] = token
    return response


@router.get("/{organization_id}/members", response_model=list[MemberResponse])
async def members(organization_id: UUID, _: Membership = Depends(require_permission("organization:read")), db: AsyncSession = Depends(get_db_session)):
    values = (await db.scalars(select(Membership).options(selectinload(Membership.user), selectinload(Membership.role)).where(Membership.organization_id == organization_id))).all()
    return [{"id": m.id, "user_id": m.user_id, "organization_id": m.organization_id, "email": m.user.email, "full_name": m.user.full_name, "role": m.role.code if m.role else ""} for m in values]


@router.delete("/{organization_id}/members/{user_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def remove(organization_id: UUID, user_id: UUID, current_user: User = Depends(get_current_user), _: Membership = Depends(require_permission("member:remove")), db: AsyncSession = Depends(get_db_session)):
    await remove_member(db, organization_id, user_id, current_user.id)


@invitation_router.post("/invitations/{token}/accept", response_model=InvitationAcceptResponse, status_code=201)
async def accept(token: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    membership = await accept_invitation(db, token, user)
    return {"id": membership.id, "organization_id": membership.organization_id, "user_id": membership.user_id}

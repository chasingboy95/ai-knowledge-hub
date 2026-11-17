from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.api.deps import get_current_user, get_db_session, require_permission
from backend.app.core.config import Settings, get_settings
from backend.app.db.base import utc_now
from backend.app.models.organization import Membership, Organization, OrganizationInvitation
from backend.app.models.user import User
from backend.app.schemas.organization import (
    InvitationAcceptResponse,
    InvitationCreate,
    InvitationResponse,
    MemberResponse,
    MemberRoleUpdate,
    MyMembershipResponse,
    OrganizationCreate,
    OrganizationResponse,
    PendingInvitationResponse,
)
from backend.app.services.audit import record_audit_log
from backend.app.services.auth import normalize_email
from backend.app.services.authorization import load_membership
from backend.app.services.organizations import (
    accept_invitation,
    accept_invitation_by_id,
    create_invitation,
    create_organization,
    remove_member,
    update_member_role,
)

router = APIRouter()
invitation_router = APIRouter()


@router.post("", response_model=OrganizationResponse, status_code=201)
async def create(data: OrganizationCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    org = await create_organization(db, user, data.name, data.slug)
    await record_audit_log(
        db=db,
        organization_id=org.id,
        user_id=user.id,
        event_type="ORGANIZATION_CREATE",
        resource_type="organization",
        resource_id=str(org.id),
        payload={"name": org.name, "slug": org.slug},
    )
    return org


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


@router.get("/{organization_id}/my-membership", response_model=MyMembershipResponse)
async def my_membership(
    organization_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    membership = await load_membership(db, user.id, organization_id)
    if membership is None:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    role_code = membership.role.code if membership.role else "VIEWER"
    permissions = [p.code for p in (membership.role.permissions if membership.role else [])]
    return {
        "organization_id": organization_id,
        "role": role_code,
        "permissions": permissions,
    }


@router.post("/{organization_id}/invitations", response_model=InvitationResponse, response_model_exclude_none=True, status_code=201)
async def invite(organization_id: UUID, data: InvitationCreate, _: Membership = Depends(require_permission("member:invite")), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session), settings: Settings = Depends(get_settings)):
    invitation, token = await create_invitation(db, organization_id, user, data.email, data.role)
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        user_id=user.id,
        event_type="MEMBER_INVITE",
        resource_type="invitation",
        resource_id=str(invitation.id),
        payload={"email": data.email, "role": data.role},
    )
    response = {"invitation_id": invitation.id}
    if settings.environment == "development":
        response["invite_token"] = token
    return response


@router.get("/{organization_id}/members", response_model=list[MemberResponse])
async def members(organization_id: UUID, _: Membership = Depends(require_permission("organization:read")), db: AsyncSession = Depends(get_db_session)):
    values = (await db.scalars(select(Membership).options(selectinload(Membership.user), selectinload(Membership.role)).where(Membership.organization_id == organization_id))).all()
    return [{"id": m.id, "user_id": m.user_id, "organization_id": m.organization_id, "email": m.user.email, "full_name": m.user.full_name, "role": m.role.code if m.role else ""} for m in values]


@router.patch("/{organization_id}/members/{user_id}", response_model=MemberResponse)
async def update_member(
    organization_id: UUID,
    user_id: UUID,
    data: MemberRoleUpdate,
    current_user: User = Depends(get_current_user),
    _: Membership = Depends(require_permission("member:invite")),
    db: AsyncSession = Depends(get_db_session),
):
    membership = await update_member_role(
        db, organization_id, user_id, data.role, current_user.id
    )
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        user_id=current_user.id,
        event_type="MEMBER_ROLE_UPDATE",
        resource_type="membership",
        resource_id=str(membership.id),
        payload={"user_id": str(user_id), "role": data.role},
    )
    return {
        "id": membership.id,
        "user_id": membership.user_id,
        "organization_id": membership.organization_id,
        "email": membership.user.email,
        "full_name": membership.user.full_name,
        "role": membership.role.code if membership.role else "",
    }


@router.delete("/{organization_id}/members/{user_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def remove(organization_id: UUID, user_id: UUID, current_user: User = Depends(get_current_user), _: Membership = Depends(require_permission("member:remove")), db: AsyncSession = Depends(get_db_session)):
    await remove_member(db, organization_id, user_id, current_user.id)
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        user_id=current_user.id,
        event_type="MEMBER_REMOVE",
        resource_type="user",
        resource_id=str(user_id),
    )


@invitation_router.get("/invitations/pending", response_model=list[PendingInvitationResponse])
async def list_pending_invitations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    now = utc_now()
    invitations = (
        await db.scalars(
            select(OrganizationInvitation)
            .options(
                selectinload(OrganizationInvitation.organization),
                selectinload(OrganizationInvitation.role),
                selectinload(OrganizationInvitation.creator),
            )
            .where(
                OrganizationInvitation.email == normalize_email(user.email),
                OrganizationInvitation.accepted_at.is_(None),
                OrganizationInvitation.expires_at > now,
            )
            .order_by(OrganizationInvitation.created_at.desc())
        )
    ).all()
    return [
        {
            "id": inv.id,
            "organization_id": inv.organization_id,
            "organization_name": inv.organization.name if inv.organization else "",
            "organization_slug": inv.organization.slug if inv.organization else "",
            "role": inv.role.code if inv.role else "VIEWER",
            "invited_by": inv.creator.email if inv.creator else None,
            "created_at": inv.created_at,
            "expires_at": inv.expires_at,
        }
        for inv in invitations
    ]


@invitation_router.post(
    "/invitations/{invitation_id}/accept-pending",
    response_model=InvitationAcceptResponse,
    status_code=201,
)
async def accept_pending_invitation(
    invitation_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    membership = await accept_invitation_by_id(db, invitation_id, user)
    await record_audit_log(
        db=db,
        organization_id=membership.organization_id,
        user_id=user.id,
        event_type="MEMBER_ACCEPT_INVITE",
        resource_type="membership",
        resource_id=str(membership.id),
        payload={"email": user.email, "invitation_id": str(invitation_id)},
    )
    return {
        "id": membership.id,
        "organization_id": membership.organization_id,
        "user_id": membership.user_id,
    }


@invitation_router.post("/invitations/{token}/accept", response_model=InvitationAcceptResponse, status_code=201)
async def accept(token: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    membership = await accept_invitation(db, token, user)
    await record_audit_log(
        db=db,
        organization_id=membership.organization_id,
        user_id=user.id,
        event_type="MEMBER_ACCEPT_INVITE",
        resource_type="membership",
        resource_id=str(membership.id),
        payload={"email": user.email},
    )
    return {"id": membership.id, "organization_id": membership.organization_id, "user_id": membership.user_id}

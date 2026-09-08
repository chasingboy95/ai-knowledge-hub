from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.user import User
from backend.app.models.workspace import Workspace
from backend.app.services.authorization import authorize_membership


async def create_workspace(db: AsyncSession, organization_id: UUID, user: User, name: str, slug: str) -> Workspace:
    await authorize_membership(db, user.id, organization_id, "workspace:create")
    if await db.scalar(select(Workspace).where(Workspace.organization_id == organization_id, Workspace.slug == slug)):
        raise HTTPException(status_code=409, detail="Workspace slug already exists")
    workspace = Workspace(organization_id=organization_id, name=name, slug=slug, created_by=user.id)
    db.add(workspace)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Workspace slug already exists") from exc
    await db.refresh(workspace)
    return workspace


async def update_workspace(db: AsyncSession, user_id: UUID, organization_id: UUID, workspace_id: UUID, name: str | None, slug: str | None) -> Workspace:
    await authorize_membership(db, user_id, organization_id, "workspace:update")
    workspace = await db.scalar(select(Workspace).where(
        Workspace.id == workspace_id, Workspace.organization_id == organization_id
    ))
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if slug is not None and slug != workspace.slug and await db.scalar(select(Workspace).where(
        Workspace.organization_id == workspace.organization_id, Workspace.slug == slug
    )):
        raise HTTPException(status_code=409, detail="Workspace slug already exists")
    if name is not None:
        workspace.name = name
    if slug is not None:
        workspace.slug = slug
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Workspace slug already exists") from exc
    await db.refresh(workspace)
    return workspace


async def delete_workspace(db: AsyncSession, user_id: UUID, organization_id: UUID, workspace_id: UUID) -> None:
    await authorize_membership(db, user_id, organization_id, "workspace:delete")
    workspace = await db.scalar(select(Workspace).where(
        Workspace.id == workspace_id, Workspace.organization_id == organization_id
    ))
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    await db.delete(workspace)
    await db.commit()

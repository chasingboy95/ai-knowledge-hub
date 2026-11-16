from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_current_user, get_db_session, require_permission
from backend.app.models.organization import Membership
from backend.app.models.user import User
from backend.app.models.workspace import Workspace
from backend.app.schemas.workspace import WorkspaceCreate, WorkspaceResponse, WorkspaceUpdate
from backend.app.services.audit import record_audit_log
from backend.app.services.workspaces import create_workspace, delete_workspace, update_workspace

router = APIRouter()


async def scoped_workspace(db: AsyncSession, organization_id: UUID, workspace_id: UUID) -> Workspace:
    workspace = await db.scalar(select(Workspace).where(Workspace.id == workspace_id, Workspace.organization_id == organization_id))
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


@router.post("/{organization_id}/workspaces", response_model=WorkspaceResponse, status_code=201)
async def create(organization_id: UUID, data: WorkspaceCreate, _: Membership = Depends(require_permission("workspace:create")), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    ws = await create_workspace(db, organization_id, user, data.name, data.slug)
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=ws.id,
        user_id=user.id,
        event_type="WORKSPACE_CREATE",
        resource_type="workspace",
        resource_id=str(ws.id),
        payload={"name": ws.name, "slug": ws.slug},
    )
    return ws


@router.get("/{organization_id}/workspaces", response_model=list[WorkspaceResponse])
async def list_workspaces(organization_id: UUID, _: Membership = Depends(require_permission("workspace:read")), db: AsyncSession = Depends(get_db_session)):
    return list((await db.scalars(select(Workspace).where(Workspace.organization_id == organization_id))).all())


@router.get("/{organization_id}/workspaces/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(organization_id: UUID, workspace_id: UUID, _: Membership = Depends(require_permission("workspace:read")), db: AsyncSession = Depends(get_db_session)):
    return await scoped_workspace(db, organization_id, workspace_id)


@router.patch("/{organization_id}/workspaces/{workspace_id}", response_model=WorkspaceResponse)
async def update(organization_id: UUID, workspace_id: UUID, data: WorkspaceUpdate, user: User = Depends(get_current_user), _: Membership = Depends(require_permission("workspace:update")), db: AsyncSession = Depends(get_db_session)):
    ws = await update_workspace(db, user.id, organization_id, workspace_id, data.name, data.slug)
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=user.id,
        event_type="WORKSPACE_UPDATE",
        resource_type="workspace",
        resource_id=str(ws.id),
        payload={"name": data.name, "slug": data.slug},
    )
    return ws


@router.delete("/{organization_id}/workspaces/{workspace_id}", response_model=None, status_code=204)
async def delete(organization_id: UUID, workspace_id: UUID, user: User = Depends(get_current_user), _: Membership = Depends(require_permission("workspace:delete")), db: AsyncSession = Depends(get_db_session)):
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=None,
        user_id=user.id,
        event_type="WORKSPACE_DELETE",
        resource_type="workspace",
        resource_id=str(workspace_id),
    )
    await delete_workspace(db, user.id, organization_id, workspace_id)
    return Response(status_code=204)

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_current_user, get_db_session, require_permission
from backend.app.api.routes.documents import get_pipeline, get_storage
from backend.app.models.organization import Membership
from backend.app.models.user import User
from backend.app.schemas.knowledge import (
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
)
from backend.app.services.audit import record_audit_log
from backend.app.services.knowledge import (
    create_knowledge_base,
    delete_knowledge_base,
    get_knowledge_base,
    list_knowledge_bases,
    update_knowledge_base,
)
from backend.app.services.pipeline.document_pipeline import DocumentPipelineService
from backend.app.services.storage.base import StorageService

router = APIRouter()


@router.post(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases",
    response_model=KnowledgeBaseResponse,
    status_code=201,
)
async def create(
    organization_id: UUID,
    workspace_id: UUID,
    data: KnowledgeBaseCreate,
    _: Membership = Depends(require_permission("knowledge:create")),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    kb = await create_knowledge_base(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user=user,
        name=data.name,
        slug=data.slug,
        description=data.description,
    )
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=user.id,
        event_type="KNOWLEDGE_BASE_CREATE",
        resource_type="knowledge_base",
        resource_id=str(kb.id),
        payload={"name": kb.name, "slug": kb.slug},
    )
    return kb


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases",
    response_model=list[KnowledgeBaseResponse],
)
async def list_kbs(
    organization_id: UUID,
    workspace_id: UUID,
    _: Membership = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db_session),
):
    return await list_knowledge_bases(db, organization_id, workspace_id)


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases/{kb_id}",
    response_model=KnowledgeBaseResponse,
)
async def get_kb(
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    _: Membership = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db_session),
):
    return await get_knowledge_base(db, organization_id, workspace_id, kb_id)


@router.patch(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases/{kb_id}",
    response_model=KnowledgeBaseResponse,
)
async def update(
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    data: KnowledgeBaseUpdate,
    user: User = Depends(get_current_user),
    _: Membership = Depends(require_permission("knowledge:update")),
    db: AsyncSession = Depends(get_db_session),
):
    kb = await update_knowledge_base(
        db=db,
        user_id=user.id,
        organization_id=organization_id,
        workspace_id=workspace_id,
        kb_id=kb_id,
        name=data.name,
        description=data.description,
    )
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=user.id,
        event_type="KNOWLEDGE_BASE_UPDATE",
        resource_type="knowledge_base",
        resource_id=str(kb.id),
        payload={"name": data.name, "description": data.description},
    )
    return kb


@router.delete(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases/{kb_id}",
    response_model=None,
    status_code=204,
)
async def delete(
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    user: User = Depends(get_current_user),
    _: Membership = Depends(require_permission("knowledge:delete")),
    db: AsyncSession = Depends(get_db_session),
    storage: StorageService = Depends(get_storage),
    pipeline: DocumentPipelineService = Depends(get_pipeline),
):
    await delete_knowledge_base(
        db=db,
        user_id=user.id,
        organization_id=organization_id,
        workspace_id=workspace_id,
        kb_id=kb_id,
        storage=storage,
        vector_store=pipeline.get_vector_store(db),
    )
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=user.id,
        event_type="KNOWLEDGE_BASE_DELETE",
        resource_type="knowledge_base",
        resource_id=str(kb_id),
    )
    return Response(status_code=204)

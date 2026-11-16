from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_current_user, get_db_session, require_permission
from backend.app.core.config import Settings, get_settings
from backend.app.models.organization import Membership
from backend.app.models.user import User
from backend.app.schemas.document import DocumentDetailResponse, DocumentResponse
from backend.app.services.knowledge import (
    create_document,
    delete_document,
    get_document,
    list_documents,
)
from backend.app.services.pipeline.document_pipeline import DocumentPipelineService, get_default_pipeline
from backend.app.services.storage.base import StorageService
from backend.app.services.storage.local import LocalStorageService

router = APIRouter()


def get_storage(settings: Settings = Depends(get_settings)) -> StorageService:
    return LocalStorageService(base_dir=settings.storage_dir)


def get_pipeline(settings: Settings = Depends(get_settings)) -> DocumentPipelineService:
    return get_default_pipeline(settings)


@router.post(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases/{kb_id}/documents",
    response_model=DocumentResponse,
    status_code=201,
)
async def upload(
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    _: Membership = Depends(require_permission("document:upload")),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: StorageService = Depends(get_storage),
    pipeline: DocumentPipelineService = Depends(get_pipeline),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename cannot be empty")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    mime_type = file.content_type or "application/octet-stream"
    doc = await create_document(
        db=db,
        storage=storage,
        organization_id=organization_id,
        workspace_id=workspace_id,
        kb_id=kb_id,
        user=user,
        filename=file.filename,
        file_bytes=file_bytes,
        mime_type=mime_type,
    )

    background_tasks.add_task(pipeline.process_document, doc.id)
    return doc


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases/{kb_id}/documents",
    response_model=list[DocumentResponse],
)
async def list_docs(
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    _: Membership = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db_session),
):
    return await list_documents(db, organization_id, workspace_id, kb_id)


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases/{kb_id}/documents/{document_id}",
    response_model=DocumentDetailResponse,
)
async def get_doc(
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    document_id: UUID,
    _: Membership = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db_session),
):
    return await get_document(db, organization_id, workspace_id, kb_id, document_id, include_chunks=True)


@router.post(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases/{kb_id}/documents/{document_id}/reindex",
    response_model=DocumentResponse,
    status_code=200,
)
async def reindex(
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    document_id: UUID,
    background_tasks: BackgroundTasks,
    _: Membership = Depends(require_permission("document:upload")),
    db: AsyncSession = Depends(get_db_session),
    pipeline: DocumentPipelineService = Depends(get_pipeline),
):
    doc = await get_document(db, organization_id, workspace_id, kb_id, document_id)
    background_tasks.add_task(pipeline.reindex_document, doc.id)
    return doc


@router.delete(
    "/{organization_id}/workspaces/{workspace_id}/knowledge-bases/{kb_id}/documents/{document_id}",
    response_model=None,
    status_code=204,
)
async def delete_doc(
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    document_id: UUID,
    user: User = Depends(get_current_user),
    _: Membership = Depends(require_permission("document:delete")),
    db: AsyncSession = Depends(get_db_session),
    storage: StorageService = Depends(get_storage),
    pipeline: DocumentPipelineService = Depends(get_pipeline),
):
    await delete_document(
        db=db,
        storage=storage,
        user_id=user.id,
        organization_id=organization_id,
        workspace_id=workspace_id,
        kb_id=kb_id,
        document_id=document_id,
        vector_store=pipeline.get_vector_store(db),
    )
    return Response(status_code=204)

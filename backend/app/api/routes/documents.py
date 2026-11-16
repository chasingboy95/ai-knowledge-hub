from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_current_user, get_db_session, require_permission
from backend.app.core.config import Settings, get_settings
from backend.app.models.organization import Membership
from backend.app.models.user import User
from backend.app.schemas.document import DocumentDetailResponse, DocumentResponse
from backend.app.services.audit import record_audit_log
from backend.app.services.knowledge import (
    create_document,
    delete_document,
    get_document,
    list_documents,
)
from backend.app.services.pipeline.document_pipeline import DocumentPipelineService, get_default_pipeline
from backend.app.services.storage import StorageService, get_storage_service

router = APIRouter()


def get_storage(settings: Settings = Depends(get_settings)) -> StorageService:
    return get_storage_service(settings)


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

    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=user.id,
        event_type="DOCUMENT_UPLOAD",
        resource_type="document",
        resource_id=str(doc.id),
        payload={"filename": file.filename, "size_bytes": len(file_bytes), "mime_type": mime_type},
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
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=user.id,
        event_type="DOCUMENT_DELETE",
        resource_type="document",
        resource_id=str(document_id),
    )
    return Response(status_code=204)

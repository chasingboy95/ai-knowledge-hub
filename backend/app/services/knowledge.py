import re
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.document import Document, DocumentChunk, DocumentStatus
from backend.app.models.knowledge import KnowledgeBase
from backend.app.models.user import User
from backend.app.models.workspace import Workspace
from backend.app.services.authorization import authorize_membership
from backend.app.services.storage.base import StorageService
from backend.app.services.storage.local import compute_hash
from backend.app.services.vector_store.base import VectorStore


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[-\s]+", "-", cleaned) or "default"


async def ensure_workspace_in_org(
    db: AsyncSession, organization_id: UUID, workspace_id: UUID
) -> Workspace:
    workspace = await db.scalar(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.organization_id == organization_id
        )
    )
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


async def create_knowledge_base(
    db: AsyncSession,
    organization_id: UUID,
    workspace_id: UUID,
    user: User,
    name: str,
    slug: str | None = None,
    description: str | None = None,
) -> KnowledgeBase:
    await authorize_membership(db, user.id, organization_id, "knowledge:create")
    await ensure_workspace_in_org(db, organization_id, workspace_id)

    final_slug = slug or slugify(name)
    existing = await db.scalar(
        select(KnowledgeBase).where(
            KnowledgeBase.workspace_id == workspace_id, KnowledgeBase.slug == final_slug
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Knowledge base slug already exists")

    kb = KnowledgeBase(
        organization_id=organization_id,
        workspace_id=workspace_id,
        name=name,
        slug=final_slug,
        description=description,
        created_by=user.id,
    )
    db.add(kb)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Knowledge base slug already exists") from exc
    await db.refresh(kb)
    return kb


async def get_knowledge_base(
    db: AsyncSession, organization_id: UUID, workspace_id: UUID, kb_id: UUID
) -> KnowledgeBase:
    await ensure_workspace_in_org(db, organization_id, workspace_id)
    kb = await db.scalar(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id,
            KnowledgeBase.organization_id == organization_id,
            KnowledgeBase.workspace_id == workspace_id,
        )
    )
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


async def list_knowledge_bases(
    db: AsyncSession, organization_id: UUID, workspace_id: UUID
) -> list[KnowledgeBase]:
    await ensure_workspace_in_org(db, organization_id, workspace_id)
    query = (
        select(KnowledgeBase)
        .where(
            KnowledgeBase.organization_id == organization_id,
            KnowledgeBase.workspace_id == workspace_id,
        )
        .order_by(KnowledgeBase.created_at.desc())
    )
    return list((await db.scalars(query)).all())


async def update_knowledge_base(
    db: AsyncSession,
    user_id: UUID,
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    name: str | None = None,
    description: str | None = None,
) -> KnowledgeBase:
    await authorize_membership(db, user_id, organization_id, "knowledge:update")
    kb = await get_knowledge_base(db, organization_id, workspace_id, kb_id)

    if name is not None:
        kb.name = name
    if description is not None:
        kb.description = description

    await db.commit()
    await db.refresh(kb)
    return kb


async def delete_knowledge_base(
    db: AsyncSession,
    user_id: UUID,
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    storage: StorageService | None = None,
    vector_store: VectorStore | None = None,
) -> None:
    await authorize_membership(db, user_id, organization_id, "knowledge:delete")
    kb = await get_knowledge_base(db, organization_id, workspace_id, kb_id)

    # Fetch all documents to clean up storage and vector store
    docs = (
        await db.scalars(
            select(Document).where(Document.knowledge_base_id == kb.id)
        )
    ).all()

    for doc in docs:
        if storage:
            try:
                await storage.delete_file(doc.storage_path)
            except Exception:
                pass
        if vector_store:
            try:
                await vector_store.delete_by_document(str(doc.id))
            except Exception:
                pass

    await db.delete(kb)
    await db.commit()


# =========================================================================
# Documents
# =========================================================================

async def create_document(
    db: AsyncSession,
    storage: StorageService,
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    user: User,
    filename: str,
    file_bytes: bytes,
    mime_type: str,
) -> Document:
    await authorize_membership(db, user.id, organization_id, "document:upload")
    kb = await get_knowledge_base(db, organization_id, workspace_id, kb_id)

    doc_id = uuid4()
    rel_path = f"{organization_id}/{kb.id}/{doc_id}/{filename}"
    storage_path = await storage.save_file(file_bytes, rel_path)
    content_hash = compute_hash(file_bytes)

    doc = Document(
        id=doc_id,
        organization_id=organization_id,
        workspace_id=workspace_id,
        knowledge_base_id=kb.id,
        filename=filename,
        file_size=len(file_bytes),
        mime_type=mime_type,
        storage_path=storage_path,
        content_hash=content_hash,
        status=DocumentStatus.UPLOADED.value,
        created_by=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def get_document(
    db: AsyncSession,
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    document_id: UUID,
    include_chunks: bool = False,
) -> Document:
    await get_knowledge_base(db, organization_id, workspace_id, kb_id)
    query = select(Document).where(
        Document.id == document_id,
        Document.organization_id == organization_id,
        Document.workspace_id == workspace_id,
        Document.knowledge_base_id == kb_id,
    )
    if include_chunks:
        query = query.options(selectinload(Document.chunks))

    doc = await db.scalar(query)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def list_documents(
    db: AsyncSession,
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
) -> list[Document]:
    await get_knowledge_base(db, organization_id, workspace_id, kb_id)
    query = (
        select(Document)
        .where(
            Document.organization_id == organization_id,
            Document.workspace_id == workspace_id,
            Document.knowledge_base_id == kb_id,
        )
        .order_by(Document.created_at.desc())
    )
    return list((await db.scalars(query)).all())


async def delete_document(
    db: AsyncSession,
    storage: StorageService,
    user_id: UUID,
    organization_id: UUID,
    workspace_id: UUID,
    kb_id: UUID,
    document_id: UUID,
    vector_store: VectorStore | None = None,
) -> None:
    await authorize_membership(db, user_id, organization_id, "document:delete")
    doc = await get_document(db, organization_id, workspace_id, kb_id, document_id)

    # Delete from storage if possible
    try:
        await storage.delete_file(doc.storage_path)
    except Exception:
        pass

    # Delete from vector store if provided
    if vector_store:
        try:
            await vector_store.delete_by_document(str(doc.id))
        except Exception:
            pass

    await db.delete(doc)
    await db.commit()

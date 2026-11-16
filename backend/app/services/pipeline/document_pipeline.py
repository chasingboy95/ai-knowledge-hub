import logging
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.app.core.config import Settings, get_settings
from backend.app.db.session import get_session_factory
from backend.app.models.document import Document, DocumentChunk, DocumentStatus
from backend.app.services.chunking.recursive import RecursiveCharacterChunker
from backend.app.services.embeddings import get_embedding_provider
from backend.app.services.embeddings.base import EmbeddingProvider
from backend.app.services.parsers import get_parser_for_filename
from backend.app.services.storage.base import StorageService
from backend.app.services.storage.local import LocalStorageService
from backend.app.services.vector_store import get_in_memory_vector_store
from backend.app.services.vector_store.base import VectorRecord, VectorStore
from backend.app.services.vector_store.pgvector import PGVectorStore

logger = logging.getLogger(__name__)


class DocumentPipelineService:
    def __init__(
        self,
        storage_service: StorageService,
        chunker: RecursiveCharacterChunker,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore | None = None,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
    ):
        self.storage_service = storage_service
        self.chunker = chunker
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store
        self._session_factory = session_factory

    @property
    def session_factory(self) -> async_sessionmaker[AsyncSession]:
        return self._session_factory or get_session_factory()

    def get_vector_store(self, session: AsyncSession) -> VectorStore:
        if self.vector_store is not None:
            return self.vector_store
        bind = session.get_bind()
        if bind and bind.dialect.name == "postgresql":
            return PGVectorStore(session)
        return get_in_memory_vector_store()

    async def process_document_with_session(self, session: AsyncSession, document_id: UUID) -> None:
        doc = await session.get(Document, document_id)
        if not doc:
            logger.warning("Document %s not found for pipeline processing", document_id)
            return

        try:
            # 1. PARSING
            doc.status = DocumentStatus.PARSING.value
            doc.error_message = None
            await session.commit()

            raw_bytes = await self.storage_service.read_file(doc.storage_path)
            parser = get_parser_for_filename(doc.filename)
            parsed_doc = await parser.parse(raw_bytes, doc.filename)

            # 2. CHUNKING
            doc.status = DocumentStatus.CHUNKING.value
            await session.commit()

            chunks = self.chunker.chunk_document(parsed_doc)

            # 3. EMBEDDING
            doc.status = DocumentStatus.EMBEDDING.value
            await session.commit()

            texts = [c.content for c in chunks]
            embeddings: list[list[float]] = []
            if texts:
                embeddings = await self.embedding_provider.embed_texts(texts)

            # 4. PERSIST CHUNKS & VECTOR
            # Clear old chunks first (e.g. for reindex)
            await session.execute(
                delete(DocumentChunk).where(DocumentChunk.document_id == doc.id)
            )
            vstore = self.get_vector_store(session)
            if vstore:
                await vstore.delete_by_document(str(doc.id))

            created_chunks: list[DocumentChunk] = []
            vector_records: list[VectorRecord] = []

            for idx, c in enumerate(chunks):
                emb = embeddings[idx] if idx < len(embeddings) else None
                chunk_entity = DocumentChunk(
                    document_id=doc.id,
                    organization_id=doc.organization_id,
                    workspace_id=doc.workspace_id,
                    knowledge_base_id=doc.knowledge_base_id,
                    chunk_index=c.chunk_index,
                    content=c.content,
                    token_count=c.token_count,
                    metadata_json=c.metadata,
                    embedding=emb,
                )
                session.add(chunk_entity)
                created_chunks.append(chunk_entity)

            await session.flush()

            if vstore and texts:
                for chunk_entity in created_chunks:
                    if chunk_entity.embedding is not None:
                        vector_records.append(
                            VectorRecord(
                                id=str(chunk_entity.id),
                                chunk_id=str(chunk_entity.id),
                                document_id=str(doc.id),
                                organization_id=str(doc.organization_id),
                                workspace_id=str(doc.workspace_id),
                                knowledge_base_id=str(doc.knowledge_base_id),
                                embedding=chunk_entity.embedding if isinstance(chunk_entity.embedding, list) else list(chunk_entity.embedding),
                                content=chunk_entity.content,
                                metadata=chunk_entity.metadata_json,
                            )
                        )
                await vstore.upsert(vector_records)

            doc.chunk_count = len(chunks)
            doc.token_count = sum(c.token_count for c in chunks)
            doc.status = DocumentStatus.READY.value
            doc.error_message = "No extractable text found in document" if len(chunks) == 0 else None
            await session.commit()

        except Exception as exc:
            logger.exception("Failed to process document %s: %s", document_id, exc)
            await session.rollback()
            # Fetch document fresh to set failure status
            try:
                failed_doc = await session.get(Document, document_id)
                if failed_doc:
                    failed_doc.status = DocumentStatus.FAILED.value
                    failed_doc.error_message = str(exc)[:500]
                    await session.commit()
            except Exception:
                logger.exception("Could not record failure status for document %s", document_id)

    async def process_document(self, document_id: UUID) -> None:
        async with self.session_factory() as session:
            await self.process_document_with_session(session, document_id)

    async def reindex_document_with_session(self, session: AsyncSession, document_id: UUID) -> None:
        doc = await session.get(Document, document_id)
        if not doc:
            return
        doc.status = DocumentStatus.UPLOADED.value
        doc.error_message = None
        await session.commit()
        await self.process_document_with_session(session, document_id)

    async def reindex_document(self, document_id: UUID) -> None:
        async with self.session_factory() as session:
            await self.reindex_document_with_session(session, document_id)


def get_default_pipeline(settings: Settings | None = None) -> DocumentPipelineService:
    cfg = settings or get_settings()
    storage = LocalStorageService(base_dir=cfg.storage_dir)
    chunker = RecursiveCharacterChunker(chunk_size=800, chunk_overlap=100)
    embedder = get_embedding_provider(cfg)
    return DocumentPipelineService(
        storage_service=storage,
        chunker=chunker,
        embedding_provider=embedder,
        vector_store=None,
        session_factory=None,
    )

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.document import Document, DocumentStatus
from backend.app.models.knowledge import KnowledgeBase
from backend.app.services.embeddings.base import EmbeddingProvider
from backend.app.services.vector_store import get_vector_store
from backend.app.services.vector_store.base import VectorStore


@dataclass
class RetrievedChunk:
    chunk_id: UUID
    document_id: UUID
    document_title: str
    knowledge_base_id: UUID
    chunk_index: int
    page_number: int | None
    similarity: float
    content: str


class SecureRAGRetriever:
    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore | None = None,
    ):
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store

    def _resolve_vector_store(self, session: AsyncSession) -> VectorStore:
        return self.vector_store or get_vector_store(session)

    async def rewrite_query(
        self,
        current_query: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> str:
        """Rewrite ambiguous or contextual query into a standalone retrieval query."""
        if not conversation_history:
            return current_query.strip()

        return current_query.strip()

    async def retrieve(
        self,
        session: AsyncSession,
        workspace_id: UUID,
        query: str,
        knowledge_base_ids: list[UUID] | None = None,
        top_k: int = 5,
        min_similarity: float = 0.3,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> list[RetrievedChunk]:
        """Secure retrieval with workspace boundary checks and threshold filtering."""
        rewritten_query = await self.rewrite_query(query, conversation_history)
        if not rewritten_query:
            return []

        # 1. Validate knowledge bases belong to this workspace
        query_kbs = select(KnowledgeBase.id).where(KnowledgeBase.workspace_id == workspace_id)
        if knowledge_base_ids:
            query_kbs = query_kbs.where(KnowledgeBase.id.in_(knowledge_base_ids))

        kb_result = await session.execute(query_kbs)
        allowed_kb_ids = [row[0] for row in kb_result.all()]

        if not allowed_kb_ids:
            return []

        # 2. Embed query
        query_vector = await self.embedding_provider.embed_query(rewritten_query)

        # 3. Search vector store
        store = self._resolve_vector_store(session)
        filters = {
            "workspace_id": str(workspace_id),
            "knowledge_base_ids": [str(kid) for kid in allowed_kb_ids],
        }
        raw_results = await store.search(query_vector=query_vector, filters=filters, top_k=top_k * 2)

        if not raw_results:
            return []

        # 4. Fetch documents to ensure status is READY and get title/filename
        doc_ids = {UUID(r.record.document_id) for r in raw_results}
        doc_query = select(Document.id, Document.filename, Document.status).where(
            Document.id.in_(doc_ids),
            Document.workspace_id == workspace_id,
            Document.status == DocumentStatus.READY.value,
        )
        doc_res = await session.execute(doc_query)
        rows = doc_res.all()
        print("RETRIEVER DEBUG doc rows:", rows, "doc_ids requested:", doc_ids)
        ready_docs = {row.id: row.filename for row in rows}

        # 5. Filter by ready docs and min_similarity
        chunks: list[RetrievedChunk] = []
        for r in raw_results:
            d_id = UUID(r.record.document_id)
            print("RETRIEVER DEBUG checking raw_result:", d_id, "score:", r.score, "min_sim:", min_similarity)
            if d_id not in ready_docs:
                print("RETRIEVER DEBUG d_id not in ready_docs")
                continue
            if r.score < min_similarity:
                print("RETRIEVER DEBUG score < min_similarity")
                continue

            metadata = r.record.metadata or {}
            chunks.append(
                RetrievedChunk(
                    chunk_id=UUID(r.record.chunk_id),
                    document_id=d_id,
                    document_title=ready_docs[d_id],
                    knowledge_base_id=UUID(r.record.knowledge_base_id),
                    chunk_index=int(metadata.get("chunk_index", 0)),
                    page_number=metadata.get("page_number"),
                    similarity=float(r.score),
                    content=r.record.content,
                )
            )

            if len(chunks) >= top_k:
                break

        return chunks

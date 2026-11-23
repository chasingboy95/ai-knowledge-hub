import logging
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.document import Document, DocumentStatus
from backend.app.models.knowledge import KnowledgeBase
from backend.app.services.embeddings.base import EmbeddingProvider
from backend.app.services.reranker.base import BaseRerankerProvider
from backend.app.services.vector_store import get_vector_store
from backend.app.services.vector_store.base import VectorStore

logger = logging.getLogger(__name__)


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
    rerank_score: float | None = None


class SecureRAGRetriever:
    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        vector_store: VectorStore | None = None,
        reranker: BaseRerankerProvider | None = None,
        candidate_top_k: int = 15,
    ):
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store
        self.reranker = reranker
        self.candidate_top_k = candidate_top_k

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
        """Secure retrieval with workspace boundary checks, threshold filtering, and optional rerank."""
        rewritten_query = await self.rewrite_query(query, conversation_history)
        if not rewritten_query:
            return []

        # 1. Validate knowledge bases belong to this workspace
        query_kbs = select(KnowledgeBase.id).where(
            KnowledgeBase.workspace_id == workspace_id
        )
        if knowledge_base_ids:
            query_kbs = query_kbs.where(KnowledgeBase.id.in_(knowledge_base_ids))

        kb_result = await session.execute(query_kbs)
        allowed_kb_ids = [row[0] for row in kb_result.all()]

        if not allowed_kb_ids:
            return []

        # 2. Embed query
        query_vector = await self.embedding_provider.embed_query(rewritten_query)

        # 3. Search vector store
        # If reranker is present, retrieve a larger candidate pool
        search_top_k = (
            max(top_k * 3, self.candidate_top_k) if self.reranker else top_k * 2
        )
        store = self._resolve_vector_store(session)
        filters = {
            "workspace_id": str(workspace_id),
            "knowledge_base_ids": [str(kid) for kid in allowed_kb_ids],
        }
        raw_results = await store.search(
            query_vector=query_vector, filters=filters, top_k=search_top_k
        )

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
        ready_docs = {row.id: row.filename for row in doc_res.all()}

        # 5. Filter by ready docs and min_similarity
        candidate_chunks: list[RetrievedChunk] = []
        for r in raw_results:
            d_id = UUID(r.record.document_id)
            if d_id not in ready_docs or r.score < min_similarity:
                continue

            metadata = r.record.metadata or {}
            candidate_chunks.append(
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

            # If no reranker, stop at top_k
            if not self.reranker and len(candidate_chunks) >= top_k:
                break

        if not candidate_chunks:
            return []

        # 6. Apply Reranking if configured
        if self.reranker is not None and len(candidate_chunks) > 0:
            return await self.reranker.rerank(
                query=rewritten_query,
                chunks=candidate_chunks,
                top_k=top_k,
            )

        return candidate_chunks[:top_k]

from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.document import DocumentChunk
from backend.app.services.vector_store.base import SearchResult, VectorRecord, VectorStore


class PGVectorStore(VectorStore):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert(self, records: list[VectorRecord]) -> None:
        for r in records:
            chunk_uuid = UUID(r.chunk_id)
            await self.session.execute(
                update(DocumentChunk)
                .where(DocumentChunk.id == chunk_uuid)
                .values(embedding=r.embedding)
            )
        await self.session.flush()

    async def delete_by_document(self, document_id: str) -> None:
        doc_uuid = UUID(document_id)
        await self.session.execute(
            update(DocumentChunk)
            .where(DocumentChunk.document_id == doc_uuid)
            .values(embedding=None)
        )
        await self.session.flush()

    async def search(
        self,
        query_vector: list[float],
        filters: dict[str, Any],
        top_k: int = 5,
    ) -> list[SearchResult]:
        distance_col = DocumentChunk.embedding.cosine_distance(query_vector).label("distance")
        query = select(DocumentChunk, distance_col).where(DocumentChunk.embedding.is_not(None))

        if "organization_id" in filters:
            query = query.where(DocumentChunk.organization_id == UUID(str(filters["organization_id"])))
        if "workspace_id" in filters:
            query = query.where(DocumentChunk.workspace_id == UUID(str(filters["workspace_id"])))
        if "knowledge_base_id" in filters:
            query = query.where(DocumentChunk.knowledge_base_id == UUID(str(filters["knowledge_base_id"])))
        if "document_id" in filters:
            query = query.where(DocumentChunk.document_id == UUID(str(filters["document_id"])))

        # Cosine distance ordering
        query = query.order_by(distance_col).limit(top_k)

        result = await self.session.execute(query)
        rows = result.all()

        results = []
        for chunk, distance in rows:
            rec = VectorRecord(
                id=str(chunk.id),
                chunk_id=str(chunk.id),
                document_id=str(chunk.document_id),
                organization_id=str(chunk.organization_id),
                workspace_id=str(chunk.workspace_id),
                knowledge_base_id=str(chunk.knowledge_base_id),
                embedding=chunk.embedding.tolist() if hasattr(chunk.embedding, "tolist") else list(chunk.embedding),
                content=chunk.content,
                metadata=chunk.metadata_json or {},
            )
            # cosine similarity = 1 - cosine_distance (clamped to [0.0, 1.0])
            similarity = max(0.0, 1.0 - float(distance)) if distance is not None else 0.0
            results.append(SearchResult(record=rec, score=similarity))

        return results

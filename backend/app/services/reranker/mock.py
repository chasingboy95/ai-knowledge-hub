from typing import TYPE_CHECKING
from backend.app.services.reranker.base import BaseRerankerProvider

if TYPE_CHECKING:
    from backend.app.services.rag.retriever import RetrievedChunk


class MockRerankerProvider(BaseRerankerProvider):
    async def rerank(
        self,
        query: str,
        chunks: list["RetrievedChunk"],
        top_k: int = 5,
    ) -> list["RetrievedChunk"]:
        if not chunks:
            return []
        # Sort by existing similarity score descending and attach rerank_score
        sorted_chunks = sorted(chunks, key=lambda c: c.similarity, reverse=True)
        results: list["RetrievedChunk"] = []
        for c in sorted_chunks[:top_k]:
            c.rerank_score = c.similarity
            results.append(c)
        return results

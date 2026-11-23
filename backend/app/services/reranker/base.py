from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.app.services.rag.retriever import RetrievedChunk


class BaseRerankerProvider(ABC):
    @abstractmethod
    async def rerank(
        self,
        query: str,
        chunks: list["RetrievedChunk"],
        top_k: int = 5,
    ) -> list["RetrievedChunk"]:
        """Rerank candidate chunks according to relevance to the query."""

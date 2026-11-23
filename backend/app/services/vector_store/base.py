from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class VectorRecord:
    id: str
    chunk_id: str
    document_id: str
    organization_id: str
    workspace_id: str
    knowledge_base_id: str
    embedding: list[float]
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchResult:
    record: VectorRecord
    score: float


class VectorStore(ABC):
    @abstractmethod
    async def upsert(self, records: list[VectorRecord]) -> None:
        """Insert or update vector records."""

    @abstractmethod
    async def delete_by_document(self, document_id: str) -> None:
        """Delete all vector records associated with a given document."""

    @abstractmethod
    async def search(
        self,
        query_vector: list[float],
        filters: dict[str, Any],
        top_k: int = 5,
    ) -> list[SearchResult]:
        """Search top_k records matching the given filters (e.g. organization_id)."""

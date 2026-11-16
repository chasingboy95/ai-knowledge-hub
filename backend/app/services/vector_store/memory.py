import numpy as np
from typing import Any
from backend.app.services.vector_store.base import SearchResult, VectorRecord, VectorStore


class InMemoryVectorStore(VectorStore):
    def __init__(self):
        # keyed by record.id
        self._records: dict[str, VectorRecord] = {}

    async def upsert(self, records: list[VectorRecord]) -> None:
        for r in records:
            self._records[r.id] = r

    async def delete_by_document(self, document_id: str) -> None:
        to_delete = [rid for rid, r in self._records.items() if r.document_id == document_id]
        for rid in to_delete:
            del self._records[rid]

    async def search(
        self,
        query_vector: list[float],
        filters: dict[str, Any],
        top_k: int = 5,
    ) -> list[SearchResult]:
        if not self._records:
            return []

        q_vec = np.array(query_vector, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 0:
            q_vec = q_vec / q_norm

        candidates: list[tuple[VectorRecord, float]] = []

        for record in self._records.values():
            # Check all filter conditions
            matches = True
            for k, v in filters.items():
                if getattr(record, k, None) != v:
                    matches = False
                    break
            if not matches:
                continue

            r_vec = np.array(record.embedding, dtype=np.float32)
            r_norm = np.linalg.norm(r_vec)
            if r_norm > 0:
                r_vec = r_vec / r_norm

            sim = float(np.dot(q_vec, r_vec))
            candidates.append((record, sim))

        # Sort by similarity descending
        candidates.sort(key=lambda x: x[1], reverse=True)
        return [SearchResult(record=rec, score=score) for rec, score in candidates[:top_k]]

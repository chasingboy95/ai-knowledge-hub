from backend.app.services.vector_store.base import SearchResult, VectorRecord, VectorStore
from backend.app.services.vector_store.memory import InMemoryVectorStore
from backend.app.services.vector_store.pgvector import PGVectorStore

# Global in-memory instance for testing / fallback
_in_memory_store_instance = InMemoryVectorStore()


def get_in_memory_vector_store() -> InMemoryVectorStore:
    return _in_memory_store_instance


__all__ = [
    "InMemoryVectorStore",
    "PGVectorStore",
    "SearchResult",
    "VectorRecord",
    "VectorStore",
    "get_in_memory_vector_store",
]

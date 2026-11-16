from backend.app.services.vector_store.base import SearchResult, VectorRecord, VectorStore
from backend.app.services.vector_store.memory import InMemoryVectorStore
from backend.app.services.vector_store.pgvector import PGVectorStore
from sqlalchemy.ext.asyncio import AsyncSession

# Global in-memory instance for testing / fallback
_in_memory_store_instance = InMemoryVectorStore()


def get_in_memory_vector_store() -> InMemoryVectorStore:
    return _in_memory_store_instance


def get_vector_store(session: AsyncSession) -> VectorStore:
    bind = session.get_bind()
    if bind and bind.dialect.name == "postgresql":
        return PGVectorStore(session)
    return get_in_memory_vector_store()


__all__ = [
    "InMemoryVectorStore",
    "PGVectorStore",
    "SearchResult",
    "VectorRecord",
    "VectorStore",
    "get_in_memory_vector_store",
    "get_vector_store",
]

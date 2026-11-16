from backend.app.core.config import Settings
from backend.app.services.embeddings.base import EmbeddingProvider
from backend.app.services.embeddings.mock import MockEmbeddingProvider
from backend.app.services.embeddings.openai import OpenAIEmbeddingProvider


def get_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.embedding_provider.lower() == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set when EMBEDDING_PROVIDER is 'openai'")
        return OpenAIEmbeddingProvider(
            api_key=settings.openai_api_key,
            model=settings.embedding_model,
            dimension=settings.embedding_dimension,
        )
    return MockEmbeddingProvider(dimension=settings.embedding_dimension)


__all__ = [
    "EmbeddingProvider",
    "MockEmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "get_embedding_provider",
]

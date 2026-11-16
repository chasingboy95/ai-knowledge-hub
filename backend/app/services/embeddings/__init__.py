from backend.app.core.config import Settings, get_settings
from backend.app.services.embeddings.base import EmbeddingProvider
from backend.app.services.embeddings.mock import MockEmbeddingProvider
from backend.app.services.embeddings.openai import OpenAIEmbeddingProvider


def get_embedding_provider(settings: Settings | None = None) -> EmbeddingProvider:
    cfg = settings or get_settings()
    if cfg.embedding_provider.lower() == "openai":
        if not cfg.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set when EMBEDDING_PROVIDER is 'openai'")
        return OpenAIEmbeddingProvider(
            api_key=cfg.openai_api_key,
            model=cfg.embedding_model,
            dimension=cfg.embedding_dimension,
        )
    return MockEmbeddingProvider(dimension=cfg.embedding_dimension)


__all__ = [
    "EmbeddingProvider",
    "MockEmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "get_embedding_provider",
]

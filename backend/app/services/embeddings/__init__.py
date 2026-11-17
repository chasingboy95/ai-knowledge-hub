from backend.app.core.config import Settings, get_settings
from backend.app.services.embeddings.base import EmbeddingProvider
from backend.app.services.embeddings.mock import MockEmbeddingProvider
from backend.app.services.embeddings.openai import OpenAIEmbeddingProvider


def get_embedding_provider(settings: Settings | None = None) -> EmbeddingProvider:
    cfg = settings or get_settings()
    if cfg.embedding_provider.lower() == "openai":
        api_key = cfg.openai_api_key
        base_url = cfg.openai_base_url
        if not api_key and ("localhost" in base_url or "127.0.0.1" in base_url):
            api_key = "ollama"
        if not api_key:
            raise ValueError("OPENAI_API_KEY must be set when EMBEDDING_PROVIDER is 'openai'")
        return OpenAIEmbeddingProvider(
            api_key=api_key,
            model=cfg.embedding_model,
            dimension=cfg.embedding_dimension,
            base_url=base_url,
        )
    return MockEmbeddingProvider(dimension=cfg.embedding_dimension)


__all__ = [
    "EmbeddingProvider",
    "MockEmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "get_embedding_provider",
]

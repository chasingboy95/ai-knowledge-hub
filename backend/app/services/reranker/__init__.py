from backend.app.core.config import Settings, get_settings
from backend.app.services.reranker.base import BaseRerankerProvider
from backend.app.services.reranker.mock import MockRerankerProvider
from backend.app.services.reranker.qwen import QwenRerankerProvider


def get_reranker_provider(settings: Settings | None = None) -> BaseRerankerProvider:
    cfg = settings or get_settings()

    if not cfg.reranker_enabled:
        return MockRerankerProvider()

    provider_name = cfg.reranker_provider.lower()
    if provider_name in ("qwen", "openai", "local"):
        base_url = cfg.reranker_base_url or cfg.openai_base_url
        api_key = cfg.reranker_api_key or cfg.openai_api_key
        return QwenRerankerProvider(
            api_key=api_key,
            model=cfg.reranker_model,
            base_url=base_url,
        )

    return MockRerankerProvider()


__all__ = [
    "BaseRerankerProvider",
    "MockRerankerProvider",
    "QwenRerankerProvider",
    "get_reranker_provider",
]

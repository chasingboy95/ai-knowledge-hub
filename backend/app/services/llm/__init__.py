from backend.app.core.config import Settings
from backend.app.services.llm.base import BaseLLMProvider, LLMResponse
from backend.app.services.llm.mock import MockLLMProvider
from backend.app.services.llm.openai import OpenAILLMProvider


def get_llm_provider(settings: Settings | None = None) -> BaseLLMProvider:
    if settings is None:
        return MockLLMProvider()

    provider_name = settings.llm_provider.lower()
    if provider_name == "openai":
        base_url = settings.llm_base_url or settings.openai_base_url
        api_key = settings.openai_api_key
        if not api_key and ("localhost" in base_url or "127.0.0.1" in base_url):
            api_key = "ollama"
        return OpenAILLMProvider(
            api_key=api_key,
            model=settings.llm_model,
            base_url=base_url,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            frequency_penalty=settings.llm_frequency_penalty,
            presence_penalty=settings.llm_presence_penalty,
        )
    return MockLLMProvider()


__all__ = ["BaseLLMProvider", "LLMResponse", "MockLLMProvider", "OpenAILLMProvider", "get_llm_provider"]

from backend.app.core.config import Settings
from backend.app.services.llm.base import BaseLLMProvider, LLMResponse
from backend.app.services.llm.mock import MockLLMProvider
from backend.app.services.llm.openai import OpenAILLMProvider


def get_llm_provider(settings: Settings | None = None) -> BaseLLMProvider:
    if settings is None:
        return MockLLMProvider()

    provider_name = settings.llm_provider.lower()
    if provider_name == "openai":
        return OpenAILLMProvider(
            api_key=settings.openai_api_key,
            model=settings.llm_model,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
        )
    return MockLLMProvider()


__all__ = ["BaseLLMProvider", "LLMResponse", "MockLLMProvider", "OpenAILLMProvider", "get_llm_provider"]

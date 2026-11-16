from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from dataclasses import dataclass


@dataclass
class LLMResponse:
    content: str
    tokens_used: int | None = None


class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate(self, messages: list[dict[str, str]], **kwargs) -> LLMResponse:
        """Generate complete LLM response non-streaming."""
        pass

    @abstractmethod
    async def stream_generate(
        self, messages: list[dict[str, str]], **kwargs
    ) -> AsyncGenerator[str, None]:
        """Stream generated response token by token."""
        pass

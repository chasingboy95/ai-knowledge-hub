import asyncio
from collections.abc import AsyncGenerator
import re

from backend.app.services.llm.base import BaseLLMProvider, LLMResponse


class MockLLMProvider(BaseLLMProvider):
    def __init__(self, token_delay: float = 0.0):
        self.token_delay = token_delay

    def _generate_text(self, messages: list[dict[str, str]]) -> str:
        last_message = messages[-1]["content"] if messages else ""
        system_prompt = next((m["content"] for m in messages if m.get("role") == "system"), "")

        # Look for references in system prompt context blocks
        context_ids = re.findall(r'<context_block id="(.*?)">', system_prompt)

        if context_ids:
            citations_str = " ".join(f"[^{i+1}]" for i in range(len(context_ids)))
            return f"基于参考资料回答：针对问题「{last_message}」，相关事实已被证实。{citations_str}"
        return f"针对问题「{last_message}」，这是由知识库助手给出的通用解答。"

    async def generate(self, messages: list[dict[str, str]], **kwargs) -> LLMResponse:
        full_text = self._generate_text(messages)
        # Approximate tokens
        tokens = len(full_text.split()) + 10
        return LLMResponse(content=full_text, tokens_used=tokens)

    async def stream_generate(
        self, messages: list[dict[str, str]], **kwargs
    ) -> AsyncGenerator[str, None]:
        full_text = self._generate_text(messages)
        # Split into small chunks to simulate streaming
        chunk_size = 4
        for i in range(0, len(full_text), chunk_size):
            chunk = full_text[i : i + chunk_size]
            if self.token_delay > 0:
                await asyncio.sleep(self.token_delay)
            yield chunk

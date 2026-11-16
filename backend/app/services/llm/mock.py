import asyncio
from collections.abc import AsyncGenerator
import json
import re
from typing import Any
from uuid import uuid4

from backend.app.services.llm.base import BaseLLMProvider, LLMResponse, ToolCallRequest


class MockLLMProvider(BaseLLMProvider):
    def __init__(self, token_delay: float = 0.0):
        self.token_delay = token_delay

    def _detect_tool_calls(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None
    ) -> list[ToolCallRequest]:
        if not tools:
            return []

        # If last message is a tool response, do not call tool again
        if messages and messages[-1].get("role") == "tool":
            return []

        last_user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")

        tool_names = {t.get("function", {}).get("name") for t in tools}
        tool_calls = []

        if "create_ticket" in tool_names and ("工单" in last_user_msg or "ticket" in last_user_msg.lower()):
            tool_calls.append(
                ToolCallRequest(
                    id=f"call_{uuid4().hex[:8]}",
                    name="create_ticket",
                    arguments={
                        "title": "用户反馈业务诉求",
                        "description": last_user_msg,
                        "priority": "normal",
                        "category": "it_support",
                    },
                )
            )
        elif "knowledge_search" in tool_names and ("查询" in last_user_msg or "什么是" in last_user_msg or "search" in last_user_msg.lower()):
            tool_calls.append(
                ToolCallRequest(
                    id=f"call_{uuid4().hex[:8]}",
                    name="knowledge_search",
                    arguments={
                        "query": last_user_msg,
                        "top_k": 3,
                    },
                )
            )

        return tool_calls

    def _generate_text(self, messages: list[dict[str, Any]]) -> str:
        # Check if last message is from tool
        tool_msg = next((m for m in reversed(messages) if m.get("role") == "tool"), None)
        if tool_msg:
            return f"根据工具执行结果反馈：{tool_msg.get('content', '')}\n问题已成功处理。"

        last_user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        system_prompt = next((m["content"] for m in messages if m.get("role") == "system"), "")

        # Look for references in system prompt context blocks
        context_ids = re.findall(r'<context_block id="(.*?)">', system_prompt)

        if context_ids:
            citations_str = " ".join(f"[^{i+1}]" for i in range(len(context_ids)))
            return f"基于参考资料回答：针对问题「{last_user_msg}」，相关事实已被证实。{citations_str}"
        return f"针对问题「{last_user_msg}」，这是由知识库助手给出的通用解答。"

    async def generate(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        tool_calls = self._detect_tool_calls(messages, tools)
        if tool_calls:
            return LLMResponse(content="", tool_calls=tool_calls, tokens_used=15)

        full_text = self._generate_text(messages)
        tokens = len(full_text.split()) + 10
        return LLMResponse(content=full_text, tokens_used=tokens)

    async def stream_generate(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        full_text = self._generate_text(messages)
        chunk_size = 4
        for i in range(0, len(full_text), chunk_size):
            chunk = full_text[i : i + chunk_size]
            if self.token_delay > 0:
                await asyncio.sleep(self.token_delay)
            yield chunk

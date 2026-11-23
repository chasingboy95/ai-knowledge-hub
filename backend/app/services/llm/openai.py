from collections.abc import AsyncGenerator
import json
from typing import Any

import httpx

from backend.app.services.llm.base import BaseLLMProvider, LLMResponse, ToolCallRequest


class OpenAILLMProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str | None,
        model: str = "qwen3.5-4b-mlx",
        base_url: str = "https://api.openai.com/v1",
        temperature: float = 0.4,
        max_tokens: int = 2048,
        frequency_penalty: float = 0.5,
        presence_penalty: float = 0.3,
    ):
        self.api_key = api_key or ""
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.frequency_penalty = frequency_penalty
        self.presence_penalty = presence_penalty

    async def generate(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": kwargs.get("model", self.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", self.temperature),
            "max_tokens": kwargs.get("max_tokens", self.max_tokens),
            "frequency_penalty": kwargs.get("frequency_penalty", self.frequency_penalty),
            "presence_penalty": kwargs.get("presence_penalty", self.presence_penalty),
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = kwargs.get("tool_choice", "auto")

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]
            msg = choice.get("message", {})
            content = msg.get("content") or ""
            # Fallback for reasoning models where content might be empty but reasoning_content is populated
            if not content and msg.get("reasoning_content"):
                content = msg["reasoning_content"]

            tokens = data.get("usage", {}).get("total_tokens")

            tool_calls = []
            if "tool_calls" in msg and msg["tool_calls"]:
                for tc in msg["tool_calls"]:
                    fn = tc.get("function", {})
                    args_str = fn.get("arguments", "{}")
                    try:
                        args = json.loads(args_str)
                    except json.JSONDecodeError:
                        args = {}
                    tool_calls.append(
                        ToolCallRequest(
                            id=tc.get("id", ""),
                            name=fn.get("name", ""),
                            arguments=args,
                        )
                    )

            return LLMResponse(content=content, tokens_used=tokens, tool_calls=tool_calls)

    async def stream_generate(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": kwargs.get("model", self.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", self.temperature),
            "max_tokens": kwargs.get("max_tokens", self.max_tokens),
            "frequency_penalty": kwargs.get("frequency_penalty", self.frequency_penalty),
            "presence_penalty": kwargs.get("presence_penalty", self.presence_penalty),
            "stream": True,
        }
        if tools:
            payload["tools"] = tools

        yielded_content_token = False
        reasoning_fallback: list[str] = []

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk_json = json.loads(data_str)
                        delta = chunk_json["choices"][0].get("delta", {})
                        delta_content = delta.get("content")
                        if delta_content:
                            yielded_content_token = True
                            yield delta_content
                        elif not yielded_content_token and delta.get("reasoning_content"):
                            reasoning_fallback.append(delta["reasoning_content"])
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

        # If model exhausted tokens within reasoning and generated no content, yield reasoning
        if not yielded_content_token and reasoning_fallback:
            for piece in reasoning_fallback:
                yield piece

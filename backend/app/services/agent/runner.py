from collections.abc import AsyncGenerator
from dataclasses import dataclass
import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.chat import ChatMessage, ChatSession, MessageRole
from backend.app.services.agent.tools.base import ToolContext
from backend.app.services.agent.tools.registry import ToolRegistry, get_default_tool_registry
from backend.app.services.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)


@dataclass
class AgentStepEvent:
    event: str  # "tool_call" | "tool_result" | "token" | "message" | "error" | "done"
    data: dict[str, Any] | str


class AgentRunner:
    def __init__(
        self,
        llm_provider: BaseLLMProvider,
        tool_registry: ToolRegistry | None = None,
        max_steps: int = 5,
    ):
        self.llm_provider = llm_provider
        self.tool_registry = tool_registry or get_default_tool_registry()
        self.max_steps = max_steps

    async def run_stream(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        user_id: UUID | None,
        session: ChatSession,
        user_prompt: str,
        history: list[dict[str, str]] | None = None,
        model: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run multi-turn agent ReAct loop with real-time SSE stream events."""
        # 1. Record user message
        user_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.USER.value,
            content=user_prompt.strip(),
        )
        db.add(user_msg)
        if session.title == "新建对话":
            session.title = user_prompt.strip()[:30]
        await db.commit()

        # 2. Build initial conversation messages
        openai_tools = self.tool_registry.to_openai_tools()
        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": (
                    "你是一个具备工具调用能力的企业智能助手 (Enterprise Agent)。\n"
                    "你可以通过调用知识检索或业务工具解决复杂问题。\n"
                    "工具调用规则：\n"
                    "1. 若用户询问企业制度、架构或具体资料，请优先调用 knowledge_search 工具。\n"
                    "2. 若用户提出提单、报障或业务流转诉求，请调用 create_ticket 工具。\n"
                    "3. 工具执行完毕后，系统会将执行结果作为工具观察 (Tool Observation) 反馈给你，请据此给出清晰完整、结构良好的回答。"
                ),
            }
        ]

        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_prompt.strip()})

        tool_context = ToolContext(
            workspace_id=workspace_id,
            user_id=user_id,
            db=db,
        )

        llm_kwargs: dict[str, Any] = {}
        if model:
            llm_kwargs["model"] = model

        step = 0
        executed_tools_summary: list[dict[str, Any]] = []

        while step < self.max_steps:
            step += 1
            # Ask LLM for next action
            resp = await self.llm_provider.generate(messages=messages, tools=openai_tools, **llm_kwargs)

            if not resp.tool_calls:
                # No more tools called, LLM generates final answer
                # If content already returned, stream it or emit directly
                final_text = resp.content
                if not final_text:
                    # Stream tokens if non-streaming generate was empty
                    async for token in self.llm_provider.stream_generate(messages, **llm_kwargs):
                        yield {"event": "token", "data": {"token": token}}
                        final_text += token
                else:
                    yield {"event": "token", "data": {"token": final_text}}

                # Persist final Assistant message
                assistant_msg = ChatMessage(
                    session_id=session.id,
                    role=MessageRole.ASSISTANT.value,
                    content=final_text,
                    context_citations=executed_tools_summary if executed_tools_summary else None,
                    tokens_used=resp.tokens_used or (len(final_text.split()) + 20),
                )
                db.add(assistant_msg)
                await db.commit()
                await db.refresh(assistant_msg)

                yield {
                    "event": "message",
                    "data": {
                        "id": str(assistant_msg.id),
                        "session_id": str(assistant_msg.session_id),
                        "role": assistant_msg.role,
                        "content": assistant_msg.content,
                        "context_citations": executed_tools_summary,
                        "tokens_used": assistant_msg.tokens_used,
                        "created_at": assistant_msg.created_at.isoformat(),
                    },
                }
                yield {"event": "done", "data": "[DONE]"}
                return

            # Execute tool calls
            for tc in resp.tool_calls:
                tool_instance = self.tool_registry.get(tc.name)
                # Emit tool_call event to client
                yield {
                    "event": "tool_call",
                    "data": {
                        "tool_call_id": tc.id,
                        "name": tc.name,
                        "arguments": tc.arguments,
                    },
                }

                if not tool_instance:
                    tool_output = f"Error: Tool '{tc.name}' not found."
                    tool_success = False
                    tool_data = {}
                else:
                    tool_res = await tool_instance.execute(tool_context, **tc.arguments)
                    tool_output = tool_res.output
                    tool_success = tool_res.success
                    tool_data = tool_res.data

                # Emit tool_result event to client
                yield {
                    "event": "tool_result",
                    "data": {
                        "tool_call_id": tc.id,
                        "name": tc.name,
                        "success": tool_success,
                        "output": tool_output,
                        "data": tool_data,
                    },
                }

                executed_tools_summary.append({
                    "tool": tc.name,
                    "arguments": tc.arguments,
                    "success": tool_success,
                    "summary": tool_output[:150],
                })

                # Append to messages for next LLM iteration
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": tc.name,
                    "content": tool_output,
                })

        # Reached max steps fallback
        fallback_msg = "Agent 达到最大执行步数限制，已停止继续调用工具。"
        yield {"event": "token", "data": {"token": fallback_msg}}
        assistant_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.ASSISTANT.value,
            content=fallback_msg,
            context_citations=executed_tools_summary,
            tokens_used=50,
        )
        db.add(assistant_msg)
        await db.commit()
        await db.refresh(assistant_msg)

        yield {
            "event": "message",
            "data": {
                "id": str(assistant_msg.id),
                "session_id": str(assistant_msg.session_id),
                "role": assistant_msg.role,
                "content": assistant_msg.content,
                "created_at": assistant_msg.created_at.isoformat(),
            },
        }
        yield {"event": "done", "data": "[DONE]"}

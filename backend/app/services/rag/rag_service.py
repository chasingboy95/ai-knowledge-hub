from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.chat import ChatMessage, ChatSession, MessageRole
from backend.app.models.workspace import Workspace
from backend.app.schemas.chat import CitationSource
from backend.app.services.llm import BaseLLMProvider
from backend.app.services.rag.prompt_builder import PromptBuilder
from backend.app.services.rag.retriever import RetrievedChunk, SecureRAGRetriever


class RAGService:
    def __init__(
        self,
        retriever: SecureRAGRetriever,
        llm_provider: BaseLLMProvider,
    ):
        self.retriever = retriever
        self.llm_provider = llm_provider

    async def get_workspace_or_404(self, db: AsyncSession, workspace_id: UUID) -> Workspace:
        ws = await db.scalar(select(Workspace).where(Workspace.id == workspace_id))
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return ws

    async def create_session(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        user_id: UUID | None,
        title: str | None = None,
    ) -> ChatSession:
        await self.get_workspace_or_404(db, workspace_id)
        session = ChatSession(
            workspace_id=workspace_id,
            user_id=user_id,
            title=title.strip() if title else "新建对话",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session

    async def list_sessions(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ChatSession]:
        await self.get_workspace_or_404(db, workspace_id)
        stmt = (
            select(ChatSession)
            .where(ChatSession.workspace_id == workspace_id)
            .order_by(desc(ChatSession.updated_at))
            .offset(offset)
            .limit(limit)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    async def get_session(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        session_id: UUID,
    ) -> ChatSession:
        stmt = select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.workspace_id == workspace_id,
        )
        session = await db.scalar(stmt)
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        return session

    async def delete_session(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        session_id: UUID,
    ) -> None:
        session = await self.get_session(db, workspace_id, session_id)
        await db.delete(session)
        await db.commit()

    async def get_messages(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        session_id: UUID,
    ) -> list[ChatMessage]:
        # Validate session belongs to workspace
        await self.get_session(db, workspace_id, session_id)
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    def _format_citations(self, chunks: list[RetrievedChunk]) -> list[dict[str, Any]]:
        citations = []
        for c in chunks:
            citations.append(
                CitationSource(
                    document_id=c.document_id,
                    document_title=c.document_title,
                    chunk_index=c.chunk_index,
                    page_number=c.page_number,
                    similarity=c.similarity,
                    text_snippet=c.content[:200],
                ).model_dump(mode="json")
            )
        return citations

    async def stream_chat(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        user_id: UUID | None,
        session_id: UUID,
        content: str,
        knowledge_base_ids: list[UUID] | None = None,
        top_k: int = 5,
        min_similarity: float = 0.3,
    ) -> AsyncGenerator[dict[str, Any], None]:
        session = await self.get_session(db, workspace_id, session_id)

        # 1. Persist user message
        user_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.USER.value,
            content=content.strip(),
        )
        db.add(user_msg)

        # Update session title if default
        if session.title == "新建对话":
            session.title = content.strip()[:30]
        await db.commit()

        # 2. Fetch history for prompt and query rewriting
        history_msgs = await self.get_messages(db, workspace_id, session.id)
        history = [{"role": m.role, "content": m.content} for m in history_msgs[:-1]]

        # 3. Secure retrieval
        chunks = await self.retriever.retrieve(
            session=db,
            workspace_id=workspace_id,
            query=content,
            knowledge_base_ids=knowledge_base_ids,
            top_k=top_k,
            min_similarity=min_similarity,
            conversation_history=history,
        )

        citations_dict = self._format_citations(chunks)

        # Yield context event
        yield {
            "event": "context",
            "data": {
                "citations": citations_dict,
                "count": len(chunks),
            },
        }

        # 4. Build prompt messages
        prompt_messages = PromptBuilder.build_messages(
            current_query=content,
            chunks=chunks,
            history=history,
        )

        # 5. Stream LLM generation
        full_assistant_content: list[str] = []
        async for token in self.llm_provider.stream_generate(prompt_messages):
            full_assistant_content.append(token)
            yield {
                "event": "token",
                "data": {"token": token},
            }

        joined_content = "".join(full_assistant_content)

        # 6. Persist assistant message
        assistant_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.ASSISTANT.value,
            content=joined_content,
            context_citations=citations_dict,
            tokens_used=len(joined_content.split()) + 15,
        )
        db.add(assistant_msg)
        await db.commit()
        await db.refresh(assistant_msg)

        # Yield message event
        yield {
            "event": "message",
            "data": {
                "id": str(assistant_msg.id),
                "session_id": str(assistant_msg.session_id),
                "role": assistant_msg.role,
                "content": assistant_msg.content,
                "context_citations": citations_dict,
                "tokens_used": assistant_msg.tokens_used,
                "created_at": assistant_msg.created_at.isoformat(),
            },
        }

        # Yield done event
        yield {
            "event": "done",
            "data": "[DONE]",
        }

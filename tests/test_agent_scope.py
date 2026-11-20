import json
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app.api.routes.chat import stream_chat_message
from backend.app.db.base import Base
from backend.app.models import Document, KnowledgeBase, Membership, Organization, User, Workspace
from backend.app.models.document import DocumentStatus
from backend.app.schemas.chat import ChatMessageCreate
from backend.app.services.agent.runner import AgentRunner
from backend.app.services.agent.tools.knowledge_search import KnowledgeSearchTool
from backend.app.services.agent.tools.registry import ToolRegistry
from backend.app.services.embeddings.mock import MockEmbeddingProvider
from backend.app.services.llm.base import LLMResponse, ToolCallRequest
from backend.app.services.llm.mock import MockLLMProvider
from backend.app.services.rag.rag_service import RAGService
from backend.app.services.rag.retriever import SecureRAGRetriever
from backend.app.services.vector_store.base import VectorRecord
from backend.app.services.vector_store.memory import InMemoryVectorStore


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("user_scope", "model_scope", "expected"),
    [
        (None, None, {"selected", "unselected"}),
        (None, ["unselected", "foreign"], {"unselected"}),
        ([], None, {"selected", "unselected"}),
        (["selected"], None, {"selected"}),
        (["selected"], [], {"selected"}),
        (["selected"], ["selected", "unselected", "foreign"], {"selected"}),
        (["selected"], ["unselected"], set()),
        (["foreign"], None, set()),
    ],
)
async def test_agent_stream_respects_round_knowledge_base_scope(user_scope, model_scope, expected):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            user = User(id=uuid4(), email="agent-scope@example.com", password_hash="test")
            org = Organization(id=uuid4(), name="Test", slug="test")
            workspace = Workspace(id=uuid4(), organization=org, name="Current", slug="current", creator=user)
            other_workspace = Workspace(id=uuid4(), organization=org, name="Other", slug="other", creator=user)
            membership = Membership(user=user, organization=org)
            db.add_all([workspace, other_workspace, membership])

            query = "agent scope test"
            embeddings = MockEmbeddingProvider(dimension=4)
            store = InMemoryVectorStore()
            vector = await embeddings.embed_query(query)
            kb_ids = {}
            for name, ws in [("selected", workspace), ("unselected", workspace), ("foreign", other_workspace)]:
                kb = KnowledgeBase(id=uuid4(), organization=org, workspace=ws, name=name, slug=name, creator=user)
                document = Document(
                    id=uuid4(), organization=org, workspace=ws, knowledge_base=kb, filename=name,
                    file_size=1, mime_type="text/plain", storage_path=name, content_hash=name,
                    status=DocumentStatus.READY.value, creator=user,
                )
                db.add(document)
                kb_ids[name] = kb.id
                chunk_id = str(uuid4())
                await store.upsert([VectorRecord(
                    id=chunk_id, chunk_id=chunk_id, document_id=str(document.id), organization_id=str(org.id),
                    workspace_id=str(ws.id), knowledge_base_id=str(kb.id), embedding=vector, content=name,
                )])

            arguments = {"query": query}
            if model_scope is not None:
                arguments["knowledge_base_ids"] = [str(kb_ids[name]) for name in model_scope]
            llm = MockLLMProvider()
            llm.generate = AsyncMock(side_effect=[
                LLMResponse(content="", tool_calls=[ToolCallRequest("search", "knowledge_search", arguments)]),
                LLMResponse(content="搜索完成。"),
            ])
            retriever = SecureRAGRetriever(embeddings, store)
            rag = RAGService(retriever, llm)
            tools = ToolRegistry()
            tools.register(KnowledgeSearchTool(retriever=retriever))
            chat = await rag.create_session(db, workspace.id, user.id)
            payload = ChatMessageCreate(content=query, enable_agent=True)
            if user_scope is not None:
                payload.knowledge_base_ids = [kb_ids[name] for name in user_scope]
            response = await stream_chat_message(
                org.id, workspace.id, chat.id, payload, membership, user, db, rag, AgentRunner(llm, tools),
            )
            events = {}
            async for event in response.body_iterator:
                name, data = event.strip().split("\n", 1)
                if name in ("event: tool_result", "event: message"):
                    events[name] = json.loads(data.removeprefix("data: "))

            result = events["event: tool_result"]
            assert result["success"]
            assert {doc["document_title"] for doc in result["data"]["results"]} == expected
            assert {doc["document_title"] for doc in events["event: message"]["context_citations"]} == expected
    finally:
        await engine.dispose()

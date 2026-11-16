from collections.abc import AsyncGenerator
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_current_user, get_db_session, require_permission
from backend.app.core.config import Settings, get_settings
from backend.app.models.organization import Membership
from backend.app.models.user import User
from backend.app.schemas.chat import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionResponse,
    ChatStreamChunk,
)
from backend.app.services.agent import AgentRunner, get_agent_runner
from backend.app.services.audit import record_audit_log
from backend.app.services.rag import RAGService, get_rag_service

router = APIRouter()


def get_rag(settings: Settings = Depends(get_settings)) -> RAGService:
    return get_rag_service(settings)


def get_agent(settings: Settings = Depends(get_settings)) -> AgentRunner:
    return get_agent_runner(settings)


@router.post(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions",
    response_model=ChatSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_chat_session(
    organization_id: UUID,
    workspace_id: UUID,
    payload: ChatSessionCreate,
    _: Membership = Depends(require_permission("knowledge:read")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    return await rag_service.create_session(
        db=db,
        workspace_id=workspace_id,
        user_id=current_user.id,
        title=payload.title,
    )


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions",
    response_model=list[ChatSessionResponse],
)
async def list_chat_sessions(
    organization_id: UUID,
    workspace_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: Membership = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    return await rag_service.list_sessions(
        db=db,
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions/{session_id}",
    response_model=ChatSessionResponse,
)
async def get_chat_session(
    organization_id: UUID,
    workspace_id: UUID,
    session_id: UUID,
    _: Membership = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    return await rag_service.get_session(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )


@router.delete(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions/{session_id}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_chat_session(
    organization_id: UUID,
    workspace_id: UUID,
    session_id: UUID,
    _: Membership = Depends(require_permission("knowledge:delete")),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    await rag_service.delete_session(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions/{session_id}/messages",
    response_model=list[ChatMessageResponse],
)
async def list_chat_messages(
    organization_id: UUID,
    workspace_id: UUID,
    session_id: UUID,
    _: Membership = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    return await rag_service.get_messages(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )


@router.post(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions/{session_id}/stream",
    response_model=ChatStreamChunk,
)
async def stream_chat_message(
    organization_id: UUID,
    workspace_id: UUID,
    session_id: UUID,
    payload: ChatMessageCreate,
    _: Membership = Depends(require_permission("knowledge:read")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
    agent_runner: AgentRunner = Depends(get_agent),
):
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=current_user.id,
        event_type="AGENT_TOOL_CALL" if payload.enable_agent else "RAG_QUERY",
        resource_type="chat_session",
        resource_id=str(session_id),
        payload={
            "enable_agent": payload.enable_agent,
            "prompt_length": len(payload.content),
            "top_k": payload.top_k,
        },
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        if payload.enable_agent:
            session = await rag_service.get_session(db, workspace_id, session_id)
            history_msgs = await rag_service.get_messages(db, workspace_id, session_id)
            history = [{"role": m.role, "content": m.content} for m in history_msgs]
            generator = agent_runner.run_stream(
                db=db,
                workspace_id=workspace_id,
                user_id=current_user.id,
                session=session,
                user_prompt=payload.content,
                history=history,
            )
        else:
            generator = rag_service.stream_chat(
                db=db,
                workspace_id=workspace_id,
                user_id=current_user.id,
                session_id=session_id,
                content=payload.content,
                knowledge_base_ids=payload.knowledge_base_ids,
                top_k=payload.top_k,
                min_similarity=payload.min_similarity,
            )

        async for chunk in generator:
            event_type = chunk["event"]
            data_val = chunk["data"]
            data_str = data_val if isinstance(data_val, str) else json.dumps(data_val, ensure_ascii=False)
            yield f"event: {event_type}\ndata: {data_str}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

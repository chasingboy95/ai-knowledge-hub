from collections.abc import AsyncGenerator
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_current_user, get_db_session, require_permission
from backend.app.api.routes.workspaces import scoped_workspace
from backend.app.core.config import Settings, get_settings
from backend.app.models.chat import ChatSession
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


async def require_chat_workspace(
    organization_id: UUID,
    workspace_id: UUID,
    membership: Membership = Depends(require_permission("knowledge:read")),
    db: AsyncSession = Depends(get_db_session),
) -> Membership:
    await scoped_workspace(db, organization_id, workspace_id)
    return membership


def can_review_sessions(membership: Membership) -> bool:
    role_code = (membership.role.code if membership.role else "").upper()
    return role_code in ("OWNER", "ADMIN")


def check_session_owner(session: ChatSession, current_user: User) -> None:
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: this chat session is private",
        )


def check_session_read_access(session: ChatSession, current_user: User, membership: Membership) -> None:
    if not can_review_sessions(membership):
        check_session_owner(session, current_user)


async def record_session_review(
    db: AsyncSession,
    organization_id: UUID,
    session: ChatSession,
    current_user: User,
    read_target: str,
) -> None:
    if session.user_id == current_user.id:
        return

    payload = {"read_target": read_target}
    if session.user_id is not None:
        payload["owner_user_id"] = str(session.user_id)
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=session.workspace_id,
        user_id=current_user.id,
        event_type="CHAT_SESSION_REVIEW",
        resource_type="chat_session",
        resource_id=str(session.id),
        payload=payload,
    )


@router.post(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions",
    response_model=ChatSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_chat_session(
    organization_id: UUID,
    workspace_id: UUID,
    payload: ChatSessionCreate | None = None,
    _: Membership = Depends(require_chat_workspace),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    session = await rag_service.create_session(
        db=db,
        workspace_id=workspace_id,
        user_id=current_user.id,
        title=payload.title if payload else None,
    )
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=current_user.id,
        event_type="CHAT_SESSION_CREATE",
        resource_type="chat_session",
        resource_id=str(session.id),
        payload={"title": session.title},
    )
    return session


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions",
    response_model=list[ChatSessionResponse],
)
async def list_chat_sessions(
    organization_id: UUID,
    workspace_id: UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    membership: Membership = Depends(require_chat_workspace),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    filter_user_id = None if can_review_sessions(membership) else current_user.id
    return await rag_service.list_sessions(
        db=db,
        workspace_id=workspace_id,
        user_id=filter_user_id,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions/{session_id}",
    response_model=ChatSessionResponse,
)
async def get_chat_session(
    organization_id: UUID,
    workspace_id: UUID,
    session_id: UUID,
    membership: Membership = Depends(require_chat_workspace),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    session = await rag_service.get_session(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )
    check_session_read_access(session, current_user, membership)
    await record_session_review(db, organization_id, session, current_user, "metadata")
    return session


@router.delete(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_chat_session(
    organization_id: UUID,
    workspace_id: UUID,
    session_id: UUID,
    _: Membership = Depends(require_chat_workspace),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    session = await rag_service.get_session(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )
    check_session_owner(session, user)
    await rag_service.delete_session(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )
    await record_audit_log(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=user.id,
        event_type="CHAT_SESSION_DELETE",
        resource_type="chat_session",
        resource_id=str(session_id),
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
    membership: Membership = Depends(require_chat_workspace),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
):
    session = await rag_service.get_session(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )
    check_session_read_access(session, current_user, membership)
    messages = await rag_service.get_messages(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )
    await record_session_review(db, organization_id, session, current_user, "messages")
    return messages


@router.post(
    "/{organization_id}/workspaces/{workspace_id}/chat/sessions/{session_id}/stream",
    response_model=ChatStreamChunk,
)
async def stream_chat_message(
    organization_id: UUID,
    workspace_id: UUID,
    session_id: UUID,
    payload: ChatMessageCreate,
    _: Membership = Depends(require_chat_workspace),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    rag_service: RAGService = Depends(get_rag),
    agent_runner: AgentRunner = Depends(get_agent),
):
    session = await rag_service.get_session(
        db=db,
        workspace_id=workspace_id,
        session_id=session_id,
    )
    check_session_owner(session, current_user)
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
            "model": payload.model,
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
                model=payload.model,
                knowledge_base_ids=payload.knowledge_base_ids,
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
                model=payload.model,
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

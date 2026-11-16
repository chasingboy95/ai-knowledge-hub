from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.chat import MessageRole


class ChatSessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class ChatSessionUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


class ChatSessionResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    user_id: UUID | None
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CitationSource(BaseModel):
    document_id: UUID
    document_title: str
    chunk_index: int
    page_number: int | None = None
    similarity: float
    text_snippet: str


class ChatMessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    knowledge_base_ids: list[UUID] | None = None
    top_k: int = Field(default=5, ge=1, le=20)
    min_similarity: float = Field(default=0.3, ge=0.0, le=1.0)
    enable_agent: bool = Field(default=False, description="是否启用 Agent 自主工具调用模式")


class ChatMessageResponse(BaseModel):
    id: UUID
    session_id: UUID
    role: str
    content: str
    context_citations: list[dict] | None = None
    tokens_used: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatStreamChunk(BaseModel):
    event: str  # "context" | "tool_call" | "tool_result" | "token" | "message" | "error" | "done"
    data: dict | str

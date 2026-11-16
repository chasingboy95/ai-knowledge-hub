from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DocumentChunkResponse(BaseModel):
    id: UUID
    chunk_index: int
    content: str
    token_count: int
    metadata_json: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentResponse(BaseModel):
    id: UUID
    organization_id: UUID
    workspace_id: UUID
    knowledge_base_id: UUID
    filename: str
    file_size: int
    mime_type: str
    status: str
    error_message: str | None
    chunk_count: int
    token_count: int
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentDetailResponse(DocumentResponse):
    chunks: list[DocumentChunkResponse] = []

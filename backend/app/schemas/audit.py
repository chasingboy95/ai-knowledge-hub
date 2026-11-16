from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    id: UUID
    organization_id: UUID
    workspace_id: UUID | None = None
    user_id: UUID | None = None
    user_email: str | None = None
    event_type: str
    resource_type: str | None = None
    resource_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    payload: dict | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

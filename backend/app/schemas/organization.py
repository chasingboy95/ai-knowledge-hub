from typing import Literal
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class OrganizationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=100)


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    created_at: datetime
    updated_at: datetime


class InvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    role: Literal["OWNER", "ADMIN", "EDITOR", "VIEWER"] = "VIEWER"


class InvitationResponse(BaseModel):
    invitation_id: UUID
    invite_token: str | None = None


class InvitationAcceptResponse(BaseModel):
    id: UUID
    organization_id: UUID
    user_id: UUID


class MemberResponse(BaseModel):
    id: UUID
    user_id: UUID
    organization_id: UUID
    email: str
    full_name: str | None = None
    role: str

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db_session, require_permission
from backend.app.models.organization import Membership
from backend.app.schemas.audit import AuditLogResponse
from backend.app.services.audit import list_audit_logs

router = APIRouter()


@router.get(
    "/{organization_id}/audit-logs",
    response_model=list[AuditLogResponse],
)
async def get_organization_audit_logs(
    organization_id: UUID,
    workspace_id: UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: Membership = Depends(require_permission("audit:read")),
    db: AsyncSession = Depends(get_db_session),
) -> list[AuditLogResponse]:
    logs = await list_audit_logs(
        db=db,
        organization_id=organization_id,
        workspace_id=workspace_id,
        event_type=event_type,
        limit=limit,
        offset=offset,
    )
    return [
        AuditLogResponse(
            id=l.id,
            organization_id=l.organization_id,
            workspace_id=l.workspace_id,
            user_id=l.user_id,
            user_email=l.user.email if l.user else None,
            event_type=l.event_type,
            resource_type=l.resource_type,
            resource_id=l.resource_id,
            ip_address=l.ip_address,
            user_agent=l.user_agent,
            payload=l.payload,
            created_at=l.created_at,
        )
        for l in logs
    ]

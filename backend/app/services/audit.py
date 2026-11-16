from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.audit import AuditLog


async def record_audit_log(
    db: AsyncSession,
    organization_id: UUID,
    event_type: str,
    user_id: UUID | None = None,
    workspace_id: UUID | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    payload: dict | None = None,
) -> AuditLog:
    log = AuditLog(
        organization_id=organization_id,
        workspace_id=workspace_id,
        user_id=user_id,
        event_type=event_type,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent,
        payload=payload,
    )
    db.add(log)
    await db.commit()
    return log


async def list_audit_logs(
    db: AsyncSession,
    organization_id: UUID,
    workspace_id: UUID | None = None,
    event_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AuditLog]:
    stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .where(AuditLog.organization_id == organization_id)
    )
    if workspace_id:
        stmt = stmt.where(AuditLog.workspace_id == workspace_id)
    if event_type:
        stmt = stmt.where(AuditLog.event_type == event_type)

    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    result = await db.scalars(stmt)
    return list(result.all())

from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.audit import AuditLog
from backend.app.models.user import User


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
    resource_type: str | None = None,
    user_id: UUID | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AuditLog]:
    stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(AuditLog.organization_id == organization_id)
    )
    if workspace_id:
        stmt = stmt.where(AuditLog.workspace_id == workspace_id)
    if event_type:
        stmt = stmt.where(AuditLog.event_type == event_type)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if start_time:
        stmt = stmt.where(AuditLog.created_at >= start_time)
    if end_time:
        stmt = stmt.where(AuditLog.created_at <= end_time)
    if query:
        pattern = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                AuditLog.event_type.ilike(pattern),
                AuditLog.resource_id.ilike(pattern),
                AuditLog.resource_type.ilike(pattern),
                User.email.ilike(pattern),
            )
        )

    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    result = await db.scalars(stmt)
    return list(result.all())

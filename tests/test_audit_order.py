from datetime import datetime, timezone
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from backend.app.db.base import Base
from backend.app.models.audit import AuditLog
from backend.app.models.organization import Organization
from backend.app.services.audit import list_audit_logs


@pytest.mark.asyncio
async def test_audit_pages_use_a_stable_order_for_matching_timestamps():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    timestamp = datetime(2026, 11, 20, tzinfo=timezone.utc)
    ids = [UUID(int=number) for number in (3, 1, 2)]

    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(engine) as db:
            org = Organization(name="Audit Pagination", slug="audit-pagination")
            db.add(org)
            await db.flush()
            db.add_all(
                AuditLog(id=log_id, organization_id=org.id, event_type="AUTH_LOGIN", created_at=timestamp)
                for log_id in ids
            )
            await db.flush()

            first_page = await list_audit_logs(db, org.id, limit=2)
            second_page = await list_audit_logs(db, org.id, limit=2, offset=2)
            assert [log.id for log in first_page + second_page] == sorted(ids, reverse=True)
    finally:
        await engine.dispose()

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app.api.deps import get_db_session
from backend.app.core.config import Settings, get_settings
from backend.app.core.security import create_access_token
from backend.app.db.base import Base
from backend.app.main import app
from backend.app.models.audit import AuditLog
from backend.app.models.chat import ChatMessage, ChatSession
from backend.app.models.organization import Membership, Organization
from backend.app.models.rbac import Role
from backend.app.models.user import User
from backend.app.models.workspace import Workspace
from backend.app.services.rbac import seed_rbac


@pytest.fixture
async def review_scenario(monkeypatch):
    settings = Settings(
        _env_file=None,
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret_key="chat-review-test-key-at-least-32-bytes",
        llm_provider="mock",
        embedding_provider="mock",
    )
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)

        async def override_db_session():
            async with session_factory() as db:
                yield db

        monkeypatch.setitem(app.dependency_overrides, get_db_session, override_db_session)
        monkeypatch.setitem(app.dependency_overrides, get_settings, lambda: settings)
        async with session_factory() as db:
            await seed_rbac(db)
            roles = {role.code: role for role in (await db.scalars(select(Role))).all()}
            org = Organization(name="Review", slug="review")
            other_org = Organization(name="Other", slug="other")
            users = {
                key: User(id=uuid4(), email=f"{key.lower()}@example.com", password_hash="test")
                for key in ("OWNER", "ADMIN", "EDITOR", "VIEWER", "OTHER_OWNER")
            }
            workspace = Workspace(name="Review", slug="review", organization=org, creator=users["OWNER"])
            owned = ChatSession(workspace=workspace, user=users["EDITOR"], title="Private title")
            legacy = ChatSession(workspace=workspace, title="Legacy title")
            db.add_all([owned, legacy])
            db.add_all(
                Membership(user=user, organization=org, role=roles[key])
                for key, user in users.items() if key != "OTHER_OWNER"
            )
            db.add(Membership(user=users["OTHER_OWNER"], organization=other_org, role=roles["OWNER"]))
            db.add_all(ChatMessage(session=session, role="user", content="Private transcript") for session in (owned, legacy))
            await db.commit()

            def auth(key):
                return {"Authorization": f"Bearer {create_access_token(users[key].id, settings=settings)}"}

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                yield client, db, auth, org, other_org, workspace, owned, legacy, users
    finally:
        await engine.dispose()


@pytest.mark.parametrize("role", ["OWNER", "ADMIN"])
async def test_review_reads_audit_actor_and_target_without_chat_content(review_scenario, role):
    client, db, auth, org, _, workspace, owned, legacy, users = review_scenario
    url = f"/api/v1/organizations/{org.id}/workspaces/{workspace.id}/chat/sessions"
    headers = auth(role)

    index = await client.get(url, headers=headers)
    assert index.status_code == 200
    assert {row["id"] for row in index.json()} == {str(owned.id), str(legacy.id)}
    assert (await db.scalars(select(AuditLog))).all() == []

    for session in (owned, legacy):
        detail = await client.get(f"{url}/{session.id}", headers=headers)
        assert detail.status_code == 200
        assert detail.json()["title"] == session.title
        messages = await client.get(f"{url}/{session.id}/messages", headers=headers)
        assert messages.status_code == 200
        assert [row["content"] for row in messages.json()] == ["Private transcript"]

    logs = (await db.scalars(select(AuditLog))).all()
    assert len(logs) == 4
    expected_targets = {
        (str(owned.id), "metadata"), (str(owned.id), "messages"),
        (str(legacy.id), "metadata"), (str(legacy.id), "messages"),
    }
    for log in logs:
        assert (log.organization_id, log.workspace_id, log.user_id) == (org.id, workspace.id, users[role].id)
        assert (log.event_type, log.resource_type) == ("CHAT_SESSION_REVIEW", "chat_session")
        expected_targets.remove((log.resource_id, log.payload["read_target"]))
        expected_payload = {"read_target": log.payload["read_target"]}
        if log.resource_id == str(owned.id):
            expected_payload["owner_user_id"] = str(users["EDITOR"].id)
        assert log.payload == expected_payload


@pytest.mark.parametrize("role", ["OWNER", "ADMIN", "VIEWER"])
async def test_only_session_user_can_stream_or_delete(review_scenario, role):
    client, db, auth, org, _, workspace, owned, legacy, _ = review_scenario
    base_url = f"/api/v1/organizations/{org.id}/workspaces/{workspace.id}/chat/sessions"
    headers = auth(role)

    for session in (owned, legacy):
        url = f"{base_url}/{session.id}"
        for enable_agent in (False, True):
            response = await client.post(f"{url}/stream", headers=headers, json={"content": "New message", "enable_agent": enable_agent})
            assert response.status_code == 403
        assert (await client.delete(url, headers=headers)).status_code == 403

    assert (await db.scalars(select(AuditLog))).all() == []
    messages = (await db.scalars(select(ChatMessage))).all()
    assert [message.content for message in messages] == ["Private transcript", "Private transcript"]


async def test_only_reviewers_can_read_other_sessions_and_own_reads_are_not_audited(review_scenario):
    client, db, auth, org, _, workspace, owned, legacy, _ = review_scenario
    base_url = f"/api/v1/organizations/{org.id}/workspaces/{workspace.id}/chat/sessions"
    viewer = auth("VIEWER")
    assert (await client.get(base_url, headers=viewer)).json() == []
    for session in (owned, legacy):
        url = f"{base_url}/{session.id}"
        assert (await client.get(url, headers=viewer)).status_code == 403
        assert (await client.get(f"{url}/messages", headers=viewer)).status_code == 403

    editor = auth("EDITOR")
    url = f"{base_url}/{owned.id}"
    assert (await client.get(url, headers=editor)).status_code == 200
    assert (await client.get(f"{url}/messages", headers=editor)).status_code == 200
    assert (await db.scalars(select(AuditLog))).all() == []

    for enable_agent in (False, True):
        response = await client.post(f"{url}/stream", headers=editor, json={"content": "New message", "enable_agent": enable_agent})
        assert response.status_code == 200
        assert "event: done" in response.text
    assert (await client.delete(url, headers=editor)).status_code == 204


async def test_review_requires_workspace_in_organization(review_scenario):
    client, db, auth, _, other_org, workspace, owned, _, _ = review_scenario
    url = f"/api/v1/organizations/{other_org.id}/workspaces/{workspace.id}/chat/sessions"
    headers = auth("OTHER_OWNER")
    for path in (url, f"{url}/{owned.id}", f"{url}/{owned.id}/messages"):
        assert (await client.get(path, headers=headers)).status_code == 404

    assert (await db.scalars(select(AuditLog))).all() == []

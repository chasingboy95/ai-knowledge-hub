# Phase 1：Python SaaS Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从空目录搭建可通过 Docker 运行的 FastAPI SaaS 后端，实现 PostgreSQL 持久化、用户认证、组织与 Workspace、JWT、Refresh Token、RBAC 和租户隔离 REST API。

**Architecture:** 采用单体 FastAPI 服务和 PostgreSQL。路由层只负责 HTTP 协议，认证依赖负责解析 JWT，服务层负责业务规则，SQLAlchemy 负责持久化；组织资源的访问范围始终由当前用户的 Membership 推导。首期不实现外部 OAuth Provider、文档/RAG、Agent、Celery 和前端。

**Tech Stack:** Python 3.12、FastAPI、Pydantic v2、SQLAlchemy 2.x Async、asyncpg、Alembic、PostgreSQL 16、PyJWT、pwdlib Argon2、pytest、pytest-asyncio、httpx、Docker Compose。

---

## 1. 范围、假设与验收标准

### 1.1 本阶段范围

必须交付：

```text
FastAPI
PostgreSQL
User
Organization
Workspace
JWT
Refresh Token
RBAC
REST API
Docker
```

本阶段同时实现前置所需的 `Membership`、`Role`、`Permission`、`RolePermission` 和 `OrganizationInvitation`。

### 1.2 明确不纳入本阶段

- 外部 OAuth 2.0 / OIDC 身份提供商接入；首期只实现邮箱密码登录和 JWT。FastAPI 的 Bearer 认证方案仍使用 OAuth2 Password Bearer 语义。
- 文档上传、对象存储、解析、Embedding、Vector Store 和 RAG。
- Celery、Worker、Kafka 和 Redis 业务集成。
- React 前端。
- 自定义角色编辑；首期使用固定的 `OWNER`、`ADMIN`、`EDITOR`、`VIEWER`。

### 1.3 设计决策

- 使用 UUID 作为业务主键，所有表包含 UTC 时间戳。
- Access Token 为短期 JWT，Refresh Token 为长期随机字符串；只保存 Refresh Token 的哈希值，支持撤销和轮换。
- JWT 的 `sub` 只表示用户身份，不把前端传入的 `organization_id` 当作可信租户上下文。
- 组织级资源使用 `/organizations/{organization_id}/...` 路径，但每次请求都必须验证当前用户的 Membership。
- 首期使用对称 `JWT_SECRET_KEY`，密钥只从环境变量读取；生产环境切换非对称签名属于后续安全加固事项。
- 组织和 Workspace 的 slug 在各自作用域内唯一。

### 1.4 完成标准

以下命令和检查全部成功：

```bash
docker compose up -d postgres
uv run alembic upgrade head
uv run pytest -q
docker compose up --build -d api
curl http://localhost:8000/health
```

预期结果：数据库迁移成功，测试全部通过，健康检查返回 `{"status":"ok"}`，OpenAPI 可在 `/docs` 访问。

功能验收：

1. 用户能够注册、登录、刷新 Token、退出登录，并读取和更新自己的 Profile。
2. 用户能够创建组织和 Workspace，并邀请组织成员。
3. `OWNER`、`ADMIN`、`EDITOR`、`VIEWER` 的访问行为符合权限矩阵。
4. 用户无法通过修改 URL、请求体或查询参数中的组织 ID 读取另一组织的数据。
5. 数据库、API 和迁移命令能够通过 Docker Compose 运行。

## 2. 文件结构与职责

本阶段从空目录创建以下文件：

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py                         # FastAPI 应用和路由注册
│   │   ├── api/deps.py                     # DB、当前用户、Membership、权限依赖
│   │   ├── api/router.py                   # /api/v1 路由汇总
│   │   ├── api/routes/auth.py              # 注册、登录、刷新、退出
│   │   ├── api/routes/users.py             # 当前用户 Profile
│   │   ├── api/routes/organizations.py     # 组织和成员邀请
│   │   ├── api/routes/workspaces.py        # Workspace CRUD
│   │   ├── core/config.py                  # 环境变量配置
│   │   ├── core/security.py                # 密码、JWT、Refresh Token 哈希
│   │   ├── db/base.py                      # SQLAlchemy Base 和模型导入
│   │   ├── db/session.py                   # AsyncEngine 和 session factory
│   │   ├── models/user.py                  # User、RefreshToken
│   │   ├── models/organization.py          # Organization、Membership、Invitation
│   │   ├── models/workspace.py             # Workspace
│   │   ├── models/rbac.py                  # Role、Permission、RolePermission
│   │   ├── schemas/auth.py                 # 认证输入输出模型
│   │   ├── schemas/user.py                 # Profile 模型
│   │   ├── schemas/organization.py         # 组织和邀请模型
│   │   ├── schemas/workspace.py            # Workspace 模型
│   │   └── services/
│   │       ├── auth.py                     # 注册、登录、Token 生命周期
│   │       ├── organizations.py            # 组织、成员、邀请规则
│   │       └── workspaces.py               # Workspace 规则
│   └── alembic/
│       ├── env.py                          # 异步 Alembic 配置
│       └── versions/0001_initial_schema.py # 首次迁移
├── tests/
│   ├── conftest.py                         # 测试数据库和客户端 fixture
│   ├── test_health.py
│   ├── test_auth.py
│   ├── test_tenant_isolation.py
│   ├── test_rbac.py
│   ├── test_organizations.py
│   └── test_workspaces.py
├── .env.example
├── .gitignore
├── alembic.ini
├── compose.yaml
├── Dockerfile
└── pyproject.toml
```

## 3. 数据模型与权限矩阵

### 3.1 表和关键约束

```text
users
  id, email(unique), password_hash, full_name, is_active, created_at, updated_at

organizations
  id, name, slug(unique), created_at, updated_at

memberships
  id, user_id, organization_id, role_id, created_at
  unique(user_id, organization_id)

workspaces
  id, organization_id, name, slug, created_by, created_at, updated_at
  unique(organization_id, slug)

roles
  id, code(unique), name

permissions
  id, code(unique), name

role_permissions
  role_id, permission_id
  primary key(role_id, permission_id)

refresh_tokens
  id, user_id, token_hash(unique), expires_at, revoked_at, replaced_by, created_at

organization_invitations
  id, organization_id, email, token_hash(unique), role_id, expires_at, accepted_at, created_by, created_at
```

密码、Refresh Token 和邀请 Token 均不得以明文保存。删除用户或组织时的级联策略必须在 SQLAlchemy relationship 和数据库外键中保持一致；首期禁止物理删除组织，组织删除 API 不纳入范围。

### 3.2 初始角色和权限

固定角色：

```text
OWNER
ADMIN
EDITOR
VIEWER
```

除需求中的权限外，组织和 Workspace API 需要以下基础权限：

```text
organization:read
organization:update
workspace:create
workspace:read
workspace:update
workspace:delete
```

权限矩阵：

| 权限 | OWNER | ADMIN | EDITOR | VIEWER |
|---|---:|---:|---:|---:|
| organization:read | ✓ | ✓ | ✓ | ✓ |
| organization:update | ✓ | ✓ | - | - |
| workspace:create/update/delete | ✓ | ✓ | - | - |
| workspace:read | ✓ | ✓ | ✓ | ✓ |
| member:invite/remove | ✓ | ✓ | - | - |
| audit:read | ✓ | ✓ | - | - |
| knowledge:create/read/update/delete | ✓ | ✓ | ✓ | read |
| document:upload/delete | ✓ | ✓ | ✓ | - |

组织创建时同时创建 OWNER Membership。创建组织的用户不得通过普通接口把自己降级或删除；转移 Owner 不属于本阶段。

## 4. 执行任务

### Task 1：初始化 Python 项目与健康检查

**Files:**

- Create: `pyproject.toml`, `.env.example`, `.gitignore`
- Create: `backend/app/main.py`, `backend/app/core/config.py`
- Create: `tests/conftest.py`, `tests/test_health.py`

- [ ] **Step 1: 写健康检查失败测试**

在 `tests/test_health.py` 固定测试：

```python
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


async def test_health_returns_ok():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: 运行测试确认失败**

运行：

```bash
uv run pytest tests/test_health.py -q
```

预期：因 `backend.app.main` 或 `/health` 尚不存在而失败。

- [ ] **Step 3: 创建最小应用和配置**

`backend/app/main.py` 至少提供：

```python
from fastapi import FastAPI

app = FastAPI(title="AI Knowledge Hub API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

`backend/app/core/config.py` 使用 Pydantic Settings 读取 `DATABASE_URL`、`JWT_SECRET_KEY`、`ACCESS_TOKEN_EXPIRE_MINUTES`、`REFRESH_TOKEN_EXPIRE_DAYS` 和 `ENVIRONMENT`，缺少 `JWT_SECRET_KEY` 时启动配置校验必须失败。

- [ ] **Step 4: 安装依赖并验证**

执行 `uv sync` 后运行：

```bash
uv run pytest tests/test_health.py -q
```

预期：`1 passed`。

- [ ] **Step 5: 保存初始化变更**

若执行阶段已初始化 Git，提交：

```bash
git add pyproject.toml .env.example .gitignore backend tests
git commit -m "chore: initialize FastAPI backend"
```

当前目录尚未是 Git 仓库，若执行阶段仍未初始化 Git，则跳过提交，不自行初始化仓库。

### Task 2：建立 PostgreSQL 连接、模型和 Alembic 初始迁移

**Files:**

- Create: `backend/app/db/session.py`, `backend/app/db/base.py`
- Create: `backend/app/models/user.py`, `backend/app/models/organization.py`, `backend/app/models/workspace.py`, `backend/app/models/rbac.py`
- Create: `alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/0001_initial_schema.py`
- Create: `tests/test_database.py`

- [ ] **Step 1: 写模型约束测试**

覆盖以下行为：邮箱唯一、同一用户不能重复加入同一组织、同一组织内 Workspace slug 唯一、Refresh Token 只保存哈希字段、角色权限关联唯一。

示例断言：

```python
async def test_workspace_slug_is_unique_per_organization(db_session):
    organization = await create_organization(db_session, slug="acme")
    await create_workspace(db_session, organization.id, slug="default")

    with pytest.raises(IntegrityError):
        await create_workspace(db_session, organization.id, slug="default")
```

- [ ] **Step 2: 运行测试确认模型尚未完成**

```bash
uv run pytest tests/test_database.py -q
```

预期：因模型、fixture 或约束尚未实现而失败。

- [ ] **Step 3: 实现异步数据库层和模型**

`backend/app/db/session.py` 创建 `AsyncEngine`、`async_sessionmaker` 和 `get_db_session()`。模型使用 `DeclarativeBase`、`Mapped`、`mapped_column` 和明确的外键约束；所有业务模型统一继承基础时间戳和 UUID 主键定义。

模型间最小关系必须能表达：

```text
User 1──N Membership N──1 Organization
Membership N──1 Role 1──N RolePermission N──1 Permission
Organization 1──N Workspace
User 1──N RefreshToken
Organization 1──N OrganizationInvitation
```

- [ ] **Step 4: 生成并执行迁移**

配置 Alembic 从 `backend.app.db.base.Base.metadata` 读取模型，执行：

```bash
uv run alembic revision --autogenerate -m "initial schema"
uv run alembic upgrade head
uv run alembic current
```

预期：`current` 输出 `0001_initial_schema`，且 PostgreSQL 中存在全部表、索引和唯一约束。

- [ ] **Step 5: 验证模型和迁移**

```bash
uv run pytest tests/test_database.py -q
uv run alembic downgrade base
uv run alembic upgrade head
```

预期：模型测试通过，迁移可回滚并重新执行。

### Task 3：实现密码认证、JWT 和 Refresh Token 生命周期

**Files:**

- Create: `backend/app/core/security.py`
- Create: `backend/app/schemas/auth.py`, `backend/app/schemas/user.py`
- Create: `backend/app/services/auth.py`
- Create: `backend/app/api/routes/auth.py`, `backend/app/api/routes/users.py`
- Modify: `backend/app/api/deps.py`, `backend/app/api/router.py`, `backend/app/main.py`
- Create: `tests/test_auth.py`

- [ ] **Step 1: 写认证失败和成功测试**

至少覆盖：注册成功、重复邮箱返回 409、密码不以明文入库、错误密码返回 401、Access Token 可访问受保护接口、过期/错误 Token 返回 401、Refresh Token 可轮换、旧 Refresh Token 轮换后不可再次使用、Logout 后 Refresh Token 失效。

关键断言：

```python
assert response.json()["access_token"]
assert response.json()["refresh_token"]
assert stored_user.password_hash != "PlainPassword123!"
assert stored_refresh_token.token_hash != response.json()["refresh_token"]
```

- [ ] **Step 2: 运行测试确认失败**

```bash
uv run pytest tests/test_auth.py -q
```

预期：认证路由和安全服务尚不存在，测试失败。

- [ ] **Step 3: 实现最小安全服务**

`backend/app/core/security.py` 提供以下稳定接口：

```python
def hash_password(password: str) -> str: ...
def verify_password(password: str, password_hash: str) -> bool: ...
def create_access_token(user_id: UUID) -> str: ...
def decode_access_token(token: str) -> UUID: ...
def create_refresh_token() -> str: ...
def hash_refresh_token(token: str) -> str: ...
```

密码使用 Argon2。Access Token 至少包含 `sub`、`type=access`、`iat`、`exp`；Refresh Token 至少包含 `sub`、`type=refresh`、`iat`、`exp`，并在数据库中记录哈希、过期时间和撤销时间。刷新时执行 rotation：撤销旧 Token，创建新 Token。

- [ ] **Step 4: 实现认证路由**

实现以下 API：

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/users/me
PATCH /api/v1/users/me
```

登录和刷新响应统一返回：

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 900
}
```

邮箱统一转换为小写并去除首尾空格；密码长度至少 8 位。错误凭证统一返回不泄露账户是否存在的消息。

- [ ] **Step 5: 运行认证测试**

```bash
uv run pytest tests/test_auth.py -q
```

预期：认证测试全部通过。

### Task 4：实现 Membership、租户上下文和 RBAC 依赖

**Files:**

- Modify: `backend/app/api/deps.py`
- Create: `backend/app/services/organizations.py`
- Create: `tests/test_tenant_isolation.py`, `tests/test_rbac.py`

- [ ] **Step 1: 写跨租户和角色测试**

至少覆盖：组织 A 用户不能读取组织 B 的组织、Workspace 或成员；Viewer 不能创建 Workspace；Editor 能读取 Workspace 但不能邀请成员；Admin 能管理成员但不能读取无 Membership 的组织；请求体中的伪造 `organization_id` 不改变服务端租户范围。

示例：

```python
response = await client.get(f"/api/v1/organizations/{organization_b.id}")
assert response.status_code == 403

response = await client.post(
    f"/api/v1/organizations/{organization_a.id}/workspaces",
    json={"name": "fake", "slug": "fake", "organization_id": str(organization_b.id)},
)
assert response.status_code == 403
```

- [ ] **Step 2: 运行测试确认授权失败**

```bash
uv run pytest tests/test_tenant_isolation.py tests/test_rbac.py -q
```

预期：因当前不存在当前用户、Membership 和权限依赖而失败。

- [ ] **Step 3: 实现认证和租户依赖**

`backend/app/api/deps.py` 提供：

```python
async def get_db_session() -> AsyncIterator[AsyncSession]: ...
async def get_current_user(...) -> User: ...
async def get_membership(organization_id: UUID, current_user: User, db: AsyncSession) -> Membership: ...
def require_permission(permission_code: str) -> Callable: ...
```

`get_membership` 必须以 `current_user.id + organization_id` 查询 Membership；找不到时返回 403。`require_permission` 必须从 Membership 关联的 Role 和 Permission 判断权限。路由服务不得从请求体读取组织 ID 来确定租户。

- [ ] **Step 4: 实现初始 RBAC 数据**

在迁移或独立 seed 函数中写入四个固定角色和初始权限。Seed 必须幂等，重复执行不会产生重复角色、权限或关联。

- [ ] **Step 5: 验证租户和 RBAC**

```bash
uv run pytest tests/test_tenant_isolation.py tests/test_rbac.py -q
```

预期：所有越权请求被拒绝，授权请求成功。

### Task 5：实现 Organization、Workspace 和成员邀请 REST API

**Files:**

- Create: `backend/app/schemas/organization.py`, `backend/app/schemas/workspace.py`
- Modify: `backend/app/services/organizations.py`
- Create: `backend/app/services/workspaces.py`
- Create: `backend/app/api/routes/organizations.py`, `backend/app/api/routes/workspaces.py`
- Create: `tests/test_organizations.py`, `tests/test_workspaces.py`

- [ ] **Step 1: 写组织、Workspace 和邀请测试**

覆盖：创建组织自动创建 OWNER Membership；组织列表只返回当前用户所属组织；组织详情需要 `organization:read`；Workspace 的 slug 在组织内唯一；成员邀请只能由 OWNER/ADMIN 发起；邀请 Token 只能使用一次且过期后拒绝；被邀请用户接受后创建 Membership；不能移除组织最后一个 OWNER。

- [ ] **Step 2: 运行测试确认失败**

```bash
uv run pytest tests/test_organizations.py tests/test_workspaces.py -q
```

预期：路由和业务服务尚未实现，测试失败。

- [ ] **Step 3: 实现组织和 Workspace API**

实现以下接口：

```text
POST /api/v1/organizations
GET  /api/v1/organizations
GET  /api/v1/organizations/{organization_id}

POST /api/v1/organizations/{organization_id}/invitations
POST /api/v1/invitations/{token}/accept
GET  /api/v1/organizations/{organization_id}/members
DELETE /api/v1/organizations/{organization_id}/members/{user_id}

POST /api/v1/organizations/{organization_id}/workspaces
GET  /api/v1/organizations/{organization_id}/workspaces
GET  /api/v1/organizations/{organization_id}/workspaces/{workspace_id}
PATCH /api/v1/organizations/{organization_id}/workspaces/{workspace_id}
DELETE /api/v1/organizations/{organization_id}/workspaces/{workspace_id}
```

服务层在每个写操作中重新校验路径中的组织 ID、Membership、权限和资源归属。Workspace 的 `organization_id` 由路径和已验证的租户上下文写入，不接受请求体中的同名字段。

- [ ] **Step 4: 实现邀请 Token 规则**

创建邀请时保存 Token 哈希，设置 7 天过期时间和目标角色。接受邀请时校验哈希、过期时间和 `accepted_at is null`，成功后写入 Membership 并设置 `accepted_at`。首期不接邮件供应商；开发环境可返回一次性邀请 URL，生产环境接口只返回邀请记录 ID，邮件发送留到后续阶段。

- [ ] **Step 5: 运行 API 测试**

```bash
uv run pytest tests/test_organizations.py tests/test_workspaces.py -q
```

预期：组织、成员、邀请和 Workspace 测试全部通过。

### Task 6：接入 Docker Compose 和运行时配置

**Files:**

- Create: `Dockerfile`, `compose.yaml`
- Modify: `.env.example`, `backend/app/main.py`
- Create: `tests/test_compose_contract.py`

- [ ] **Step 1: 写 Compose 配置测试**

检查 Compose 文件定义 `api` 和 `postgres` 服务、持久化数据库 Volume、健康检查、非硬编码数据库密码，并为 API 设置 `DATABASE_URL` 和 `JWT_SECRET_KEY` 环境变量。

- [ ] **Step 2: 运行静态契约测试确认失败**

```bash
uv run pytest tests/test_compose_contract.py -q
```

预期：Compose 文件不存在，测试失败。

- [ ] **Step 3: 创建镜像和 Compose 配置**

`compose.yaml` 至少定义：

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    env_file: .env
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
    volumes:
      - postgres_data:/var/lib/postgresql/data

  api:
    build: .
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8000:8000"

volumes:
  postgres_data:
```

Dockerfile 使用非 root 用户启动 Uvicorn；容器启动命令只负责启动 API，迁移单独执行 `docker compose run --rm api uv run alembic upgrade head`，避免多个 API 副本同时执行迁移。

- [ ] **Step 4: 验证容器启动和迁移**

```bash
cp .env.example .env
docker compose build
docker compose up -d postgres
docker compose run --rm api uv run alembic upgrade head
docker compose up -d api
curl http://localhost:8000/health
docker compose ps
```

预期：PostgreSQL 为 healthy，迁移成功，API 返回 `{"status":"ok"}`，所有服务处于运行状态。

- [ ] **Step 5: 运行容器内测试**

```bash
docker compose run --rm api uv run pytest -q
```

预期：测试全部通过。

### Task 7：API 文档、错误格式和最终安全回归

**Files:**

- Modify: `backend/app/main.py`, `backend/app/api/router.py`
- Modify: `backend/app/api/routes/*.py`
- Create: `tests/test_api_contract.py`
- Modify: `knowledge-base/README.md`

- [ ] **Step 1: 写 API 合约测试**

验证：所有 API 使用 `/api/v1` 前缀；未认证请求统一返回 401；无权限请求统一返回 403；重复资源返回 409；请求校验错误返回 422；响应不包含 `password_hash`、Refresh Token 哈希或邀请 Token 哈希。

- [ ] **Step 2: 统一异常和响应模型**

为错误响应固定格式：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource"
  }
}
```

在路由返回模型中显式列出可公开字段，不直接返回 SQLAlchemy 对象或内部安全字段。

- [ ] **Step 3: 验证 OpenAPI 和安全回归**

```bash
uv run pytest -q
curl -f http://localhost:8000/health
curl -f http://localhost:8000/openapi.json
```

预期：全部测试通过，健康检查和 OpenAPI 返回 2xx；跨租户、弱密码、错误 Token、重复 Refresh Token 和越权角色测试全部通过。

- [ ] **Step 4: 更新项目知识库**

在 `knowledge-base/README.md` 中补充 Phase 1 的实际目录、启动命令和已完成/未完成状态；只记录已经验证的行为，不把计划内容写成已实现功能。

## 5. 执行顺序与依赖

```text
Task 1 初始化
   ↓
Task 2 数据库与迁移
   ↓
Task 3 认证与 Token
   ↓
Task 4 租户上下文与 RBAC
   ↓
Task 5 组织、Workspace、邀请 API
   ↓
Task 6 Docker Compose
   ↓
Task 7 API 合约与安全回归
```

每个 Task 在对应测试通过后再进入下一项。Task 4 之前不得编写依赖 Membership 的业务路由；Task 6 之前所有测试必须能够在本地开发环境直接运行；Task 7 完成后才可将 Phase 1 标记为完成。

## 6. 风险与处理方式

| 风险 | 处理方式 |
|---|---|
| 前端传入组织 ID 导致越权 | 所有组织资源先用 `current_user.id + organization_id` 查询 Membership，再执行资源查询 |
| Refresh Token 泄露 | 只保存哈希，执行轮换和撤销；旧 Token 重用直接拒绝 |
| 密码或内部字段泄露 | 统一 Response Schema，禁止返回 ORM 内部字段 |
| 多实例同时迁移 | API 启动不自动迁移，使用显式 Alembic 命令 |
| 初始化数据重复 | 角色、权限和关联使用唯一约束及幂等 seed |
| 过早引入基础设施 | Phase 1 不接入 Redis、Celery、Kafka、独立 Vector DB 和对象存储 |

## 7. Phase 1 交付物

完成后应存在：

1. 可运行的 FastAPI REST API。
2. PostgreSQL Schema 和可重复执行的 Alembic 迁移。
3. 用户注册、登录、Refresh Token、Logout 和 Profile API。
4. Organization、Membership、Workspace、邀请和 RBAC API。
5. 跨租户隔离、角色权限和 Token 安全测试。
6. `Dockerfile`、`compose.yaml`、`.env.example` 和启动文档。
7. 更新后的项目知识库，明确真实实现状态。

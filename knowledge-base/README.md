# AI Knowledge Hub 项目知识库

> 面向企业内部团队的多租户 AI 知识库 SaaS。
>
> 当前状态：**Phase 1、Phase 2 与 Phase 3（Secure RAG 检索问答、LLM 引用与 SSE 流式对话）已完整交付并通过 100% 自动化测试验证**。Phase 4（Agent 工具调用与业务系统集成）已完整交付。Phase 5（React SaaS UI 与管理后台）即将启动。

- **工程设计全景规范**：[docs/ENGINEERING_DESIGN.md](../docs/ENGINEERING_DESIGN.md)
- **Phase 1 执行计划**：[docs/superpowers/plans/2026-08-28-phase-1-python-saas-backend.md](../docs/superpowers/plans/2026-08-28-phase-1-python-saas-backend.md)
- **Phase 2 执行计划**：[docs/superpowers/plans/2026-09-09-phase-2-document-pipeline-vector-store.md](../docs/superpowers/plans/2026-09-09-phase-2-document-pipeline-vector-store.md)
- **Phase 3 执行计划**：[docs/superpowers/plans/2026-09-10-phase-3-secure-rag-retrieval.md](../docs/superpowers/plans/2026-09-10-phase-3-secure-rag-retrieval.md)
- **Phase 4 执行计划**：[docs/superpowers/plans/2026-09-11-phase-4-agent-tools-integration.md](../docs/superpowers/plans/2026-09-11-phase-4-agent-tools-integration.md)
- **工程设计图谱**：
  - [数据库实体关系与物理模式图 (`database-er.html`)](../docs/diagrams/database-er.html)
  - [文档处理与向量化管道架构图 (`document-pipeline.html`)](../docs/diagrams/document-pipeline.html)
  - [用户认证与 Token 轮转时序图 (`auth-sequence.html`)](../docs/diagrams/auth-sequence.html)
  - [Secure RAG 与 Agent 工具执行时序图 (`rag-agent-lifecycle.html`)](../docs/diagrams/rag-agent-lifecycle.html)

## 1. 项目目标

构建一个支持企业内部团队协作的多租户 AI 知识库平台，覆盖：

- 用户、组织、Workspace 和权限管理
- 文档上传、解析、切块、向量化与检索
- 带权限控制的 RAG 问答
- Agent 工具调用与业务系统集成
- 审计日志
- 认证、授权、密钥和数据安全

核心项目特色是 **Secure RAG / Permission-aware RAG**：

> 检索结果必须同时满足租户隔离和资源权限要求，未经授权的内容不能进入 LLM Prompt。

## 2. 总体模块

### 2.1 SaaS 用户与组织体系

核心数据模型：

```text
User
Organization
Membership
Role
Permission
Workspace
KnowledgeBase
Document
DocumentChunk (Vector 1536)
```

关系层级拓扑：

```text
Organization
├── Memberships (User + Role)
└── Workspaces
    └── Knowledge Bases
        └── Documents
            └── Document Chunks (pgvector 1536)
```

#### 数据库实体关系 (ER Diagram)

```mermaid
erDiagram
    organizations ||--o{ workspaces : "has"
    organizations ||--o{ memberships : "has"
    users ||--o{ memberships : "participates"
    roles ||--o{ memberships : "assigns"
    roles ||--o{ role_permissions : "includes"
    permissions ||--o{ role_permissions : "granted_to"
    workspaces ||--o{ knowledge_bases : "contains"
    knowledge_bases ||--o{ documents : "contains"
    documents ||--o{ document_chunks : "chunks_into"
```

初始角色：

```text
OWNER
ADMIN
EDITOR
VIEWER
```

初始权限：

```yaml
knowledge:create
knowledge:read
knowledge:update
knowledge:delete

document:upload
document:delete

member:invite
member:remove

audit:read
```

### 2.2 多租户隔离

首版采用共享数据库、共享 Schema，通过 `organization_id` 与 `workspace_id` 实现双重严格租户与边界隔离：

```text
Shared Database
└── Shared Schema
    └── organization_id + workspace_id / tenant scope
```

所有 API 禁止信任前端传入的 `organization_id`。访问范围必须由后端根据以下链路推导：

```text
JWT
 ↓
User
 ↓
Membership
 ↓
Organization
 ↓
Workspace / Resource
 ↓
Permission
```

任何查询、创建、更新、删除和 AI 检索都必须经过租户上下文和权限校验。

### 2.3 知识库与文档处理

首期已支持格式：

- PDF（`pypdf`，支持保留逐页元数据）
- DOCX（`python-docx`，段落与表格标准化提取）
- Markdown
- TXT / JSON / CSV（`PlainTextParser`）

处理流程与状态机：

```mermaid
stateDiagram-v2
    [*] --> UPLOADED : 上传原始文件到对象存储并写入 DB
    UPLOADED --> PARSING : 启动后台任务解析文件
    PARSING --> CHUNKING : 文本提取与清洗完成
    PARSING --> FAILED : 格式不支持或文件损坏
    CHUNKING --> EMBEDDING : 递归分块完成 (保留页码元数据)
    CHUNKING --> FAILED : 切块异常
    EMBEDDING --> READY : 生成 1536 维向量并持久化存储
    EMBEDDING --> FAILED : Embedding 服务异常或超时
    FAILED --> UPLOADED : POST .../reindex 触发重试
    READY --> UPLOADED : POST .../reindex 触发重新索引
```

文档原文件存储于对象存储，不直接存入 PostgreSQL。解析、切块和 Embedding 属于异步任务。

### 2.4 RAG 与引用

目标流程：

```text
User Query
    ↓
Query Rewrite
    ↓
Embedding
    ↓
Vector Search
    ↓
Tenant Filter
    ↓
Document ACL / Permission Filter
    ↓
Top K
    ↓
Reranking
    ↓
Prompt Construction
    ↓
LLM
    ↓
Answer + Citation
```

安全过滤顺序的最低要求：

```text
Vector Search
        ↓
Candidate Documents
        ↓
Tenant Filter
        ↓
Document ACL
        ↓
Authorized Chunks
        ↓
LLM
```

即使某个未授权文档的相似度很高，也必须在进入 Prompt 前被丢弃。回答应尽量返回来源文件、页码或可定位的引用信息。

### 2.5 Agent 与工具调用

首期规划三个工具：

```text
search_knowledge_base()
get_user_profile()
create_support_ticket()
```

后续可增加：

```text
send_email()
```

典型流程：

```text
用户请求
  ↓
Agent 判断任务
  ↓
search_knowledge_base
  ↓
根据结果决定是否需要业务操作
  ↓
create_support_ticket
```

Agent 工具必须复用当前用户的租户上下文和权限，不能绕过 RBAC 或文档 ACL。

### 2.6 React SaaS 前端

页面规划：

- 登录、注册、邀请接受
- Dashboard：Organization 概览、Workspace 列表
- Knowledge Base：知识库列表、知识库详情
- Document：文档上传、状态查看、切块预览、重新索引、删除
- Chat / RAG：问答会话、引用预览、来源跳转
- Members：成员列表、邀请、角色修改、移除
- Settings：Organization 设置、API Key 管理
- Audit：审计日志浏览

### 2.7 审计与可观测性

审计事件设计：

```text
AUTH_LOGIN
AUTH_LOGOUT
ORGANIZATION_UPDATE
MEMBER_INVITE
MEMBER_REMOVE
WORKSPACE_CREATE
DOCUMENT_UPLOAD
DOCUMENT_DELETE
RAG_QUERY
AGENT_TOOL_CALL
```

审计记录字段：

```text
id
organization_id
user_id
event_type
resource_type
resource_id
ip_address
user_agent
payload
created_at
```

## 3. 技术栈选型

- 后端框架：Python 3.12 + FastAPI + Pydantic v2
- ORM 与数据库：SQLAlchemy 2.x (Async) + asyncpg + PostgreSQL 16 + pgvector
- 数据库迁移：Alembic
- 文档解析：`pypdf` (PDF), `python-docx` (DOCX)
- 向量计算与切块：Numpy, `RecursiveCharacterChunker`
- 认证与加密：PyJWT, `pwdlib[argon2]`
- 容器编排：Docker & Docker Compose
- 测试体系：Pytest + `pytest-asyncio` + `httpx` (支持内存 SQLite 与无依赖测试)

## 4. 安全设计基线

- 绝不信任前端传入的 `organization_id`，所有操作由 JWT -> User -> Membership 严格推导。
- 租户隔离贯穿全文：数据库字段、外键级联、API URL 路径与向量检索元数据过滤。
- 密码存储：强制 Argon2id 哈希，禁止明文或弱散列算法。
- 令牌安全：Access Token 短有效期（默认 30 分钟），Refresh Token 一次性轮转并入库哈希。
- 存储防御：`LocalStorageService` 强制路径穿越防御，原始文件隔离按租户层级存放。

## 5. 项目路线图与交付状态

- [x] **第一阶段：Python SaaS 后端基石** (用户、组织、工作区、JWT、RBAC、Compose)
- [x] **第二阶段：文档管道、向量化与向量存储** (解析、切块、OpenAI/Mock Embeddings、PGVector、BackgroundTasks)
- [x] **第三阶段：Secure RAG、检索与问答** (Query 改写、Top-K、安全过滤、防注入 Prompt 构造、引用输出、SSE 流式推送)
- [x] **第四阶段：Agent 与工具集成** (Tool Registry、Function Calling 循环驱动、知识库搜索工具、工单集成、SSE 工具流式推流)
- [ ] **第五阶段：React SaaS UI** (管理后台、聊天界面、知识库预览)
- [ ] **第六阶段：安全加固与生产上线** (审计查询、S3/OSS 生产驱动、云端部署)

## 6. 已验证实现 (Phase 1 & Phase 2 交付基线)

### 实际工程目录

- `backend/app`：FastAPI 应用、API 路由、Schema、服务、模型、存储和解析器。
- `backend/alembic`：Alembic 迁移脚本（`0001_initial_schema`, `0002_knowledge_and_documents`）。
- `tests`：租户隔离、RBAC、管道流转、分块、向量库、数据库合约等全套测试。
- `docs/diagrams`：独立可视化工程图谱（认证时序、数据库 ER、文档管道）。
- `docs/ENGINEERING_DESIGN.md`：完整工程设计全景文档。
- `compose.yaml`、`Dockerfile`、`.env.example`：本地与容器化运行配置。

### 启动与环境命令

```bash
cp .env.example .env
uv sync
docker compose up -d postgres
uv run alembic upgrade head
uv run uvicorn backend.app.main:app --reload
```

容器镜像启动模式：

```bash
docker compose up -d postgres
docker compose run --rm api uv run alembic upgrade head
docker compose up --build -d api
```

### 测试验证命令

```bash
uv run pytest
```
- 全部 135 个测试秒级 PASS，覆盖多租户安全、文档生命周期、向量存储、API 契约、多租户 RAG 隔离、SSE 流式问答与 Agent 工具编排调用。

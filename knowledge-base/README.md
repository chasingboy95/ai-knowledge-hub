# AI Knowledge Hub 项目知识库

> 面向企业内部团队的多租户 AI 知识库 SaaS。
>
> 当前状态：架构与需求设计阶段，尚未开始实现。

Phase 1 执行计划：[2026-08-28-phase-1-python-saas-backend.md](../docs/superpowers/plans/2026-08-28-phase-1-python-saas-backend.md)

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
```

关系：

```text
Organization
├── Admin
├── Member
└── Workspace
    ├── Knowledge Base
    └── Knowledge Base
```

首期必须支持：

- 注册、登录、Logout
- JWT 和 Refresh Token
- OAuth 2.0 / OIDC 登录接入
- 用户 Profile
- Organization 创建与管理
- 邀请、移除组织成员
- Workspace 创建与管理
- RBAC

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

首版采用共享数据库、共享 Schema，通过 `organization_id` 实现租户隔离：

```text
Shared Database
└── Shared Schema
    └── organization_id / tenant scope
```

示例：

```text
documents
├── id
├── organization_id
├── knowledge_base_id
├── filename
├── status
├── created_by
└── created_at
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

首期支持：

- PDF
- DOCX
- Markdown
- TXT
- Web Page

处理流程：

```text
Upload
  ↓
Object Storage
  ↓
Document Parsing
  ↓
Cleaning
  ↓
Chunking
  ↓
Embedding
  ↓
Vector Store
```

文档状态：

```text
UPLOADED
PARSING
CHUNKING
EMBEDDING
READY
FAILED
```

文档原文件应存储于对象存储，不直接存入 PostgreSQL。解析、切块和 Embedding 属于异步任务。

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

首期只实现三个工具：

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

技术栈：

```text
React
TypeScript
Vite
React Router
Axios
成熟 UI component library
```

首期页面：

```text
/login
/dashboard
/organizations
/knowledge-bases
/knowledge-bases/:id
/documents
/chat
/members
/settings
/audit
```

核心界面：

- Dashboard：知识库数量、文档数量、成员数量、AI 查询量
- Knowledge Base：文档上传、状态、更新时间和基本操作
- Chat：问答记录、答案、引用来源
- Members：邀请成员、移除成员、角色调整
- Audit：按时间、用户、资源和操作查看审计记录

### 2.7 安全

认证：

```text
OAuth 2.0 / OIDC
短期 JWT Access Token
Refresh Token
```

授权：

```text
User
 ↓
Membership
 ↓
Role
 ↓
Permission
```

密钥管理：

- 禁止在 Git 中保存生产密钥
- 本地开发使用 `.env`
- 部署使用 Docker Secret 或 Secret Manager
- README 中明确说明生产密钥管理策略

数据保护：

- 传输中加密：HTTPS / TLS
- 存储加密：数据库、对象存储及备份使用静态加密能力
- 记录认证、授权、文档和知识库操作的审计事件

审计日志字段：

```text
id
organization_id
user_id
action
resource_type
resource_id
ip
timestamp
result
```

典型事件：

```text
USER_LOGIN
DOCUMENT_UPLOAD
DOCUMENT_DELETE
MEMBER_INVITE
ROLE_CHANGE
KNOWLEDGE_QUERY
API_KEY_CREATED
```

### 2.8 基础设施与部署

首版不引入 Kubernetes，使用 Docker Compose：

```text
frontend
api
worker
postgres + pgvector
redis
minio
```

职责：

- `frontend`：React 前端
- `api`：FastAPI API 服务
- `worker`：Celery 异步任务，处理解析、切块、Embedding 等工作
- `postgres`：业务数据和首版向量数据
- `redis`：缓存、Celery Broker 和必要的任务状态
- `minio`：本地开发对象存储，生产环境可替换为 S3 兼容服务

Kafka 和 Kubernetes 延后到出现明确的跨服务事件流、规模或部署需求后再引入。

## 3. 技术栈

### Backend

```text
Python
FastAPI
SQLAlchemy
Pydantic
Alembic
PostgreSQL
Redis
Celery / Background Task
Kafka（后期）
```

FastAPI 是后端核心框架。

### AI 抽象

业务代码不得直接绑定某个 LLM 或向量数据库，统一依赖以下接口：

```python
class LLMProvider:
    async def chat(...):
        pass


class EmbeddingProvider:
    async def embed(...):
        pass


class VectorStore:
    async def search(...):
        pass
```

首期可以实现：

```text
OpenAILLMProvider
```

后续可增加：

```text
AzureOpenAIProvider
ClaudeProvider
QdrantVectorStore / 其他 VectorStore
```

如果没有规模需求，首版优先使用 PostgreSQL + pgvector；若后续选择独立向量数据库，业务层通过 `VectorStore` 接口切换。

## 4. 逻辑架构

```text
                 React
                   │
                   │ HTTPS
                   ↓
              FastAPI API
                   │
        ┌──────────┼───────────┐
        │          │           │
      Auth       SaaS         AI
        │        Core          │
        │          │           │
        ↓          ↓           ↓
   OAuth/JWT   PostgreSQL    LLM API
                   │
                  Redis
                   │
                   ↓
              Worker Service
                   │
          ┌────────┼─────────┐
          ↓        ↓         ↓
        Parser   Embedder   Agent
                   │
                   ↓
              Vector Store
```

## 5. 推荐实施阶段

### Phase 1：Python SaaS Backend

目标：

> 补齐 Python、FastAPI 和 SaaS 后端基础能力。

核心交付：

```text
FastAPI
PostgreSQL
User
Organization
Workspace
JWT
RBAC
REST API
Docker
```

完成：

- FastAPI 应用骨架和 REST API
- PostgreSQL 数据库连接与迁移
- User、Organization、Membership、Role、Permission、Workspace 模型
- 注册、登录、Logout
- JWT Access Token 和 Refresh Token
- RBAC 权限校验
- 从 JWT 推导租户上下文
- 组织成员邀请
- Docker 开发环境

验收标准：FastAPI 服务可以通过 Docker 启动并连接 PostgreSQL；用户可以注册登录、创建组织和 Workspace、邀请成员；JWT 能正确识别用户身份；不同角色访问受 RBAC 限制；任何 API 都不能通过篡改前端 `organization_id` 越权访问其他租户数据。

### 第二阶段：知识库与文档流水线

完成对象存储、文档上传、解析、清洗、切块、Embedding 和状态机。

### 第三阶段：Secure RAG

完成向量搜索、租户过滤、文档 ACL、权限感知检索、重排、Prompt 构造和引用来源。

### 第四阶段：Agent

完成工具注册、Function Calling、知识库搜索、用户信息和工单创建。

### 第五阶段：React SaaS UI

完成登录、Dashboard、知识库、文档、Chat、成员、设置和审计页面。

### 第六阶段：安全加固与交付

完成安全测试、审计查询、密钥管理说明、Docker Compose、部署文档和关键链路测试。

## 6. 待决策事项

以下内容在开始实现前需要明确具体选型，但不影响总体架构：

1. OAuth 2.0 / OIDC 的身份提供商：自建、企业 IdP，还是第三方服务。
2. 生产对象存储：S3、OSS、COS，或其他 S3 兼容服务。
3. 向量存储：首版直接使用 PostgreSQL + pgvector，还是从第一版开始使用独立 Vector DB。
4. 首期 LLM 和 Embedding 服务提供商及模型。
5. UI 组件库选型。
6. 是否需要邮箱发送服务来支持成员邀请和 Refresh Token 撤销策略。

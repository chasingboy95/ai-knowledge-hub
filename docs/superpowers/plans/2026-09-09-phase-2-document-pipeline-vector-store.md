# Phase 2：文档处理管道、向量化 Embedding 与向量存储实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1 SaaS 多租户后端基石之上，实现多租户知识库（KnowledgeBase）与文档（Document）管理、对象存储抽象、文档解析与清洗管道（TXT、Markdown、PDF、DOCX）、递归切块器、Embedding Provider 抽象（Mock 与 OpenAI）、向量存储抽象（PGVector 与内存兼容层）、基于 FastAPI BackgroundTasks 的解耦异步处理流水线与全套 REST API，并严格维护租户隔离与 RBAC 权限。

**Architecture:**
- **知识库层级**: `Organization` -> `Workspace` -> `KnowledgeBase` -> `Document` -> `DocumentChunk`，所有资源严格受 `organization_id` 与 `workspace_id` 双重约束。
- **存储抽象 (Storage)**: `StorageService` ABC，默认实现 `LocalStorageService`，按租户与知识库隔离路径存储原始文件。
- **解析与清洗 (Parsers)**: `BaseParser` ABC，支持 TXT、Markdown、PDF（纯 Python `pypdf`）与 DOCX（`python-docx`）。
- **切块策略 (Chunking)**: `RecursiveCharacterChunker`，支持自定义 `chunk_size` 与 `chunk_overlap`，记录页码与块序号元数据。
- **向量化 (Embeddings)**: `EmbeddingProvider` ABC，首期提供 `MockEmbeddingProvider`（测试与离线开发）及 `OpenAIEmbeddingProvider`（基于 HTTP 客户端）。
- **向量存储 (VectorStore)**: `VectorStore` ABC，PostgreSQL 生产环境使用 `PGVectorStore`（`pgvector` 扩展与 HNSW 索引），单元测试环境自动切换为 `InMemoryVectorStore`（内存余弦相似度计算），确保 SQLite 内存测试秒级运行。
- **异步调度 (Pipeline)**: 业务逻辑封装为 `DocumentPipelineService`，通过 FastAPI `BackgroundTasks` 触发后台协程，驱动 `UPLOADED -> PARSING -> CHUNKING -> EMBEDDING -> READY / FAILED` 状态机流转。
- **安全与鉴权**: 复用 Phase 1 的 `require_permission` 依赖，严格保护 `knowledge:create`、`knowledge:read`、`document:upload`、`document:delete` 等端点；向量检索强制附带租户过滤条件。

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x Async, asyncpg, Alembic, PostgreSQL 16 + pgvector, pypdf, python-docx, numpy, pytest, pytest-asyncio, httpx, Docker Compose.

---

## 1. 范围、假设与验收标准

### 1.1 本阶段范围

必须交付：

```text
KnowledgeBase CRUD
Document Upload & Lifecycle
DocumentChunk Model & Schema
StorageService (Local)
Document Parsers (TXT, Markdown, PDF, DOCX)
RecursiveCharacterChunker
EmbeddingProvider (Mock & OpenAI)
VectorStore (PGVector & InMemory)
DocumentPipelineService (BackgroundTasks 状态机驱动)
REST API (/api/v1/workspaces/{workspace_id}/knowledge-bases & documents)
Alembic 迁移 (0002_knowledge_and_documents)
租户与 RBAC 安全隔离测试
```

### 1.2 明确不纳入本阶段

- RAG 检索问答、Query 改写、重排（Reranker）、LLM Prompt 构造与引用输出（留待 Phase 3）。
- Redis + Celery 分布式任务队列（Phase 2 以解耦 Service + BackgroundTasks 为准，为后续引入 Celery 预留无缝适配点）。
- 外部云厂商 S3/MinIO SDK 直接集成（提供抽象接口，Phase 2 默认落地并验证 LocalStorageService）。
- 前端 Web 界面（留待 Phase 5）。

### 1.3 设计决策

- **租户隔离链条延伸**: 知识库和文档必须继承请求上下文的 `organization_id` 与 `workspace_id`，禁止通过 URL 传参伪造。
- **双重向量支持**: 生产镜像采用 `pgvector/pgvector:pg16`，数据库表结构包含 `vector(1536)`；测试环境使用基于内存的余弦相似度向量存储，保证 `pytest` 可以在 `sqlite+aiosqlite:///:memory:` 下零外部依赖运行。
- **轻量解析器选型**: 选用纯 Python 实现的 `pypdf` 与 `python-docx`，避免引入庞大的 C 扩展或外部系统二进制依赖（如 poppler）。
- **幂等与容错**: 文档重新索引（Re-index）时，必须清理旧的 Chunks 与向量并重置状态；文档处理发生异常时捕获并标记为 `FAILED`，记录截断的安全错误信息。

### 1.4 完成标准

以下检查与命令全部通过：

```bash
uv run pytest -q
docker compose run --rm api uv run alembic upgrade head
```

功能验收指标：
1. 用户拥有对应权限时，能在指定 Workspace 下创建、查询、更新和删除知识库。
2. 支持上传 TXT、MD、PDF、DOCX 文档，后台管道自动流转状态并切块向量化。
3. 向量存储能正确持久化 Chunk 向量并支持多租户元数据过滤查询。
4. 任何无权限用户或跨租户请求上传或访问文档均返回 403 / 404。
5. 现有 Phase 1 的 101 个测试和 Phase 2 的所有新测试持续全部 PASS。

---

## 2. 文件结构与职责

```text
backend/
├── alembic/
│   └── versions/
│       └── 0002_knowledge_and_documents.py   # 知识库、文档、切块与向量表迁移
└── app/
    ├── api/
    │   ├── router.py                         # 注册新路由
    │   └── routes/
    │       ├── knowledge_bases.py            # 知识库 CRUD 端点
    │       └── documents.py                  # 文档上传、状态查询、重试、删除
    ├── core/
    │   └── config.py                         # 新增存储路径、Embedding 相关配置
    ├── models/
    │   ├── __init__.py                       # 导出新增模型
    │   ├── knowledge.py                      # KnowledgeBase 模型
    │   └── document.py                       # Document, DocumentChunk, DocumentStatus 枚举
    ├── schemas/
    │   ├── knowledge.py                      # 知识库输入输出 Pydantic Schema
    │   └── document.py                       # 文档上传响应、状态、切块详情 Schema
    └── services/
        ├── storage/
        │   ├── base.py                       # StorageService 抽象基类
        │   └── local.py                      # LocalStorageService 实现
        ├── parsers/
        │   ├── base.py                       # BaseParser 抽象基类
        │   ├── txt.py                        # 纯文本与 Markdown 解析
        │   ├── pdf.py                        # PDF 解析 (pypdf)
        │   └── docx.py                       # DOCX 解析 (python-docx)
        ├── chunking/
        │   └── recursive.py                  # RecursiveCharacterChunker 文本切块器
        ├── embeddings/
        │   ├── base.py                       # EmbeddingProvider 抽象基类
        │   ├── mock.py                       # 确定性 Mock 向量生成器
        │   └── openai.py                     # OpenAI Embedding API 适配器
        ├── vector_store/
        │   ├── base.py                       # VectorStore 抽象基类
        │   ├── memory.py                     # 内存测试向量库
        │   └── pgvector.py                   # PostgreSQL + pgvector 生产向量库
        ├── pipeline/
        │   └── document_pipeline.py          # 异步文档处理管道与状态机驱动
        └── knowledge.py                      # 知识库与文档业务规则服务
tests/
├── test_storage.py                           # 对象存储单元测试
├── test_parsers.py                           # TXT/MD/PDF/DOCX 解析测试
├── test_chunking.py                          # 递归切块逻辑测试
├── test_embeddings.py                        # Embedding 抽象与 Mock 测试
├── test_vector_store.py                      # 向量存储与多租户过滤测试
├── test_document_pipeline.py                 # 异步处理管道与状态机测试
├── test_knowledge_bases.py                   # 知识库 API 与权限测试
├── test_documents.py                         # 文档 API 与上传测试
└── test_knowledge_isolation.py               # 跨租户跨工作区数据隔离安全测试
```

---

## 3. 数据模型与状态机

### 3.1 实体与约束设计

```text
knowledge_bases
  id (UUID PK)
  organization_id (UUID FK -> organizations.id, ondelete=CASCADE)
  workspace_id (UUID FK -> workspaces.id, ondelete=CASCADE)
  name (String 255)
  slug (String 100)
  description (Text nullable)
  created_by (UUID FK -> users.id)
  created_at (UTCDateTime)
  updated_at (UTCDateTime)
  unique(workspace_id, slug)

documents
  id (UUID PK)
  organization_id (UUID FK -> organizations.id, ondelete=CASCADE)
  workspace_id (UUID FK -> workspaces.id, ondelete=CASCADE)
  knowledge_base_id (UUID FK -> knowledge_bases.id, ondelete=CASCADE)
  filename (String 255)
  file_size (Integer)
  mime_type (String 100)
  storage_path (String 512)
  content_hash (String 64)
  status (Enum: UPLOADED, PARSING, CHUNKING, EMBEDDING, READY, FAILED)
  error_message (Text nullable)
  chunk_count (Integer default 0)
  token_count (Integer default 0)
  created_by (UUID FK -> users.id)
  created_at (UTCDateTime)
  updated_at (UTCDateTime)

document_chunks
  id (UUID PK)
  document_id (UUID FK -> documents.id, ondelete=CASCADE)
  organization_id (UUID FK -> organizations.id, ondelete=CASCADE)
  workspace_id (UUID FK -> workspaces.id, ondelete=CASCADE)
  knowledge_base_id (UUID FK -> knowledge_bases.id, ondelete=CASCADE)
  chunk_index (Integer)
  content (Text)
  token_count (Integer default 0)
  metadata_json (JSON)
  created_at (UTCDateTime)
  unique(document_id, chunk_index)

document_embeddings (生产 PostgreSQL pgvector 表)
  id (UUID PK)
  chunk_id (UUID FK -> document_chunks.id, ondelete=CASCADE)
  document_id (UUID FK -> documents.id, ondelete=CASCADE)
  organization_id (UUID FK -> organizations.id, ondelete=CASCADE)
  knowledge_base_id (UUID FK -> knowledge_bases.id, ondelete=CASCADE)
  embedding (Vector(1536))
  created_at (UTCDateTime)
  Index: HNSW on embedding using vector_cosine_ops
```

### 3.2 文档状态机

```text
[用户上传]
   ↓
UPLOADED ─────────(异常/格式不支持)────────┐
   ↓                                       │
PARSING  ─────────(解析失败/文件损坏)─────┤
   ↓                                       │
CHUNKING ─────────(空内容/切块失败)───────┤
   ↓                                       │
EMBEDDING ────────(模型调用异常)──────────┤
   ↓                                       │
 READY                                  FAILED (记录 error_message)
   ↑                                       │
   └──────────[触发重新索引 Reindex]───────┘
```

---

## 4. 执行任务细目

### Task 1: 基础依赖与配置扩展

**Files:**
- Modify: `pyproject.toml`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/core/deps.py` / `tests/conftest.py`

- [ ] **Step 1: 更新 `pyproject.toml` 依赖**
  增加 `pypdf>=5.1,<6.0`, `python-docx>=1.1,<2.0`, `numpy>=1.26,<3.0`, `pgvector>=0.3.6,<1.0`。
- [ ] **Step 2: 运行 `uv sync` 并验证依赖解析成功**
- [ ] **Step 3: 扩展 `Settings`**
  在 `backend/app/core/config.py` 中增加：
  - `storage_dir: str = "./data/storage"`
  - `embedding_provider: str = "mock"` (支持 `mock` 或 `openai`)
  - `openai_api_key: str | None = None`
  - `embedding_model: str = "text-embedding-3-small"`
  - `embedding_dimension: int = 1536`
- [ ] **Step 4: 测试验证配置加载正常**

---

### Task 2: 知识库与文档数据模型及数据库迁移

**Files:**
- Create: `backend/app/models/knowledge.py`
- Create: `backend/app/models/document.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/0002_knowledge_and_documents.py`
- Modify: `tests/test_database.py`

- [ ] **Step 1: 编写数据库模型测试用例**
  验证 `KnowledgeBase`、`Document`、`DocumentChunk` 外键级联删除与唯一约束。
- [ ] **Step 2: 实现模型类**
  定义 `KnowledgeBase`、`Document`（含 `DocumentStatus` 枚举）、`DocumentChunk`。
- [ ] **Step 3: 编写 Alembic 迁移脚本 `0002_knowledge_and_documents.py`**
  针对 PostgreSQL 环境条件性执行 `CREATE EXTENSION IF NOT EXISTS vector`，创建 `knowledge_bases`, `documents`, `document_chunks` 及 `document_embeddings`。
- [ ] **Step 4: 运行迁移并验证测试通过**

---

### Task 3: 对象存储抽象与本地实现

**Files:**
- Create: `backend/app/services/storage/base.py`
- Create: `backend/app/services/storage/local.py`
- Create: `tests/test_storage.py`

- [ ] **Step 1: 编写存储服务失败测试**
  测试保存文件、读取文件、计算 sha256 哈希、删除文件与隔离路径构造。
- [ ] **Step 2: 实现 `StorageService` ABC**
  定义 `save_file(content: bytes, destination_rel_path: str) -> str`、`read_file`、`delete_file`、`file_exists`。
- [ ] **Step 3: 实现 `LocalStorageService`**
  基于 `settings.storage_dir`，确保自动创建父目录并提供安全的路径遍历防护（Path traversal check）。
- [ ] **Step 4: 运行 `uv run pytest tests/test_storage.py` 确认通过**

---

### Task 4: 文档解析器与递归切块服务

**Files:**
- Create: `backend/app/services/parsers/base.py`
- Create: `backend/app/services/parsers/txt.py`
- Create: `backend/app/services/parsers/pdf.py`
- Create: `backend/app/services/parsers/docx.py`
- Create: `backend/app/services/chunking/recursive.py`
- Create: `tests/test_parsers.py`
- Create: `tests/test_chunking.py`

- [ ] **Step 1: 编写解析器与切块器单元测试**
  测试纯文本/Markdown 清洗提取；测试 PDF 多页提取与页码元数据；测试 Word 段落提取；测试超出 `chunk_size` 时的递归重叠切块。
- [ ] **Step 2: 实现 `BaseParser` 与各格式解析器**
  返回统一的 `ParsedDocument`（包含每一页或分段的原始文本及对应页码元数据）。
- [ ] **Step 3: 实现 `RecursiveCharacterChunker`**
  按 `["\n\n", "\n", "。", ". ", " ", ""]` 优先级递归分词，计算 token/字符估算值，输出带有 `chunk_index`、`page_number` 的切块列表。
- [ ] **Step 4: 运行测试确保边界情况（空文件、超长文本、跨页切块）全部通过**

---

### Task 5: Embedding 与 VectorStore 抽象及实现

**Files:**
- Create: `backend/app/services/embeddings/base.py`
- Create: `backend/app/services/embeddings/mock.py`
- Create: `backend/app/services/embeddings/openai.py`
- Create: `backend/app/services/vector_store/base.py`
- Create: `backend/app/services/vector_store/memory.py`
- Create: `backend/app/services/vector_store/pgvector.py`
- Create: `tests/test_embeddings.py`
- Create: `tests/test_vector_store.py`

- [ ] **Step 1: 编写向量生成与向量存储测试**
  测试 `MockEmbeddingProvider` 针对相同输入产生确定性 1536 维向量；测试向量相似度搜索及强制多租户过滤（`organization_id`, `knowledge_base_id`）。
- [ ] **Step 2: 实现 `EmbeddingProvider` 抽象与 Mock / OpenAI 驱动**
- [ ] **Step 3: 实现 `VectorStore` 抽象与 `InMemoryVectorStore`（供 SQLite 测试运行）**
- [ ] **Step 4: 实现 `PGVectorStore`（供 PostgreSQL 生产环境）**
- [ ] **Step 5: 运行测试确认向量检索和租户过滤功能完全符合预期**

---

### Task 6: 文档处理管道编排服务与状态机

**Files:**
- Create: `backend/app/services/pipeline/document_pipeline.py`
- Create: `tests/test_document_pipeline.py`

- [ ] **Step 1: 编写处理管道完整流程测试**
  模拟传入一个有效文档，验证其状态由 `UPLOADED -> PARSING -> CHUNKING -> EMBEDDING -> READY` 递进，并生成对应的 Chunks 和向量；模拟解析抛错时验证状态标记为 `FAILED` 并持久化 `error_message`。
- [ ] **Step 2: 实现 `DocumentPipelineService`**
  整合 `StorageService`、`BaseParser`、`RecursiveCharacterChunker`、`EmbeddingProvider` 与 `VectorStore`，以独立异步函数驱动整个处理链路。
- [ ] **Step 3: 实现重试逻辑 `reindex_document(...)`**
  清除历史 Chunks 和 Vector，重置状态重新执行管道。
- [ ] **Step 4: 运行 `uv run pytest tests/test_document_pipeline.py` 确认通过**

---

### Task 7: 知识库与文档 REST API 及 RBAC 鉴权

**Files:**
- Create: `backend/app/schemas/knowledge.py`
- Create: `backend/app/schemas/document.py`
- Create: `backend/app/services/knowledge.py`
- Create: `backend/app/api/routes/knowledge_bases.py`
- Create: `backend/app/api/routes/documents.py`
- Modify: `backend/app/api/router.py`
- Create: `tests/test_knowledge_bases.py`
- Create: `tests/test_documents.py`

- [ ] **Step 1: 编写 API 接口测试（TDD 驱动）**
  - 创建知识库 `POST /api/v1/workspaces/{ws_id}/knowledge-bases`
  - 获取/列举知识库 `GET /api/v1/workspaces/{ws_id}/knowledge-bases`
  - 更新/删除知识库
  - 文档上传 `POST /api/v1/workspaces/{ws_id}/knowledge-bases/{kb_id}/documents` (Multipart)
  - 文档列表与状态详情 `GET .../documents/{doc_id}`
  - 文档重试 `POST .../documents/{doc_id}/reindex`
  - 文档删除 `DELETE .../documents/{doc_id}`
- [ ] **Step 2: 实现 Schema 与业务 Service**
- [ ] **Step 3: 实现路由端点并挂载 `BackgroundTasks` 调用 Pipeline**
- [ ] **Step 4: 注入 RBAC 依赖**
  校验当前用户拥有 `knowledge:create/read/update/delete` 与 `document:upload/delete` 权限。
- [ ] **Step 5: 运行 API 测试确认状态码与响应体完全符合预期**

---

### Task 8: 跨租户跨工作区隔离安全测试与全量验证

**Files:**
- Create: `tests/test_knowledge_isolation.py`
- Modify: `tests/test_api_contract.py`

- [ ] **Step 1: 编写跨租户越权安全测试**
  - 验证 Tenant A 的用户无法通过修改 URL 中的 `workspace_id` 或 `kb_id` 查看或上传 Tenant B 的知识库与文档。
  - 验证 VIEWER 角色尝试上传文档返回 403 Forbidden。
  - 验证删除文档后，对象存储文件、Chunks 和向量索引被同时级联清理。
- [ ] **Step 2: 运行完整测试套件**
  ```bash
  uv run pytest -q
  ```
  预期结果：全部测试通过，包含 Phase 1 原有 101 个测试与 Phase 2 所有新测试。

---

## 5. 验收确认与后续交接

完成上述所有 Tasks 后：
1. 检查代码整洁度与类型提示（Type Annotations）。
2. 在 `knowledge-base/README.md` 中更新已实现的 Phase 2 状态与命令。
3. 为 Phase 3（Secure RAG 向量检索、租户过滤与 Prompt 生成）做好坚实准备。

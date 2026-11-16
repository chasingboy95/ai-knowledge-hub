# Phase 3：安全 RAG 检索增强生成与流式对话实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 Phase 1 SaaS 多租户底座与 Phase 2 文档处理流水线及 pgvector 向量库，构建企业级安全 RAG 核心闭环：包括多轮对话上下文持久化（ChatSession & ChatMessage）、租户硬隔离的多路与混合语义检索器（SecureRAGRetriever）、安全上下文组装与防注入 Prompt 引擎、以及支持 SSE（Server-Sent Events）标准推流和详细溯源引用的流式对话 API。

**Architecture:**
- **会话与消息层级**: `Workspace` -> `ChatSession` -> `ChatMessage`。每个会话归属于特定工作区与发起用户，严格受 `workspace_id` 与 RBAC 权限控制。
- **LLM 与 Generator 抽象 (LLMProvider)**: 定义 `BaseLLMProvider` ABC，支持非流式 `generate()` 与流式异步生成器 `stream_generate()`。首期提供 `MockLLMProvider`（支持离线开发与测试用例高确定性回放）与 `OpenAILLMProvider`（对接兼容 OpenAI 接口规范的各大模型服务，支持流式 SSE 解析与 Token 统计）。
- **安全检索器 (SecureRAGRetriever)**:
  - **检索范围隔离**: 强制注入当前工作区与调用者可访问的知识库范围（`workspace_id` 与 `knowledge_base_ids` 硬约束），杜绝越权检索。
  - **多轮改写 (Query Rewriter)**: 基于历史对话动态改写独立检索 Query，解决代词指代和省略问题。
  - **混合过滤与相似度重排**: 结合元数据过滤（文档状态必须为 `READY`）、余弦相似度分数阈值（`min_similarity`）与 Top-K 截断。
- **Prompt 组装与防注入引擎 (PromptBuilder)**:
  - 构建严密系统提示词，设立输入防逃逸围栏（Delimiters 与 System Directive），防止间接提示注入（Indirect Prompt Injection）。
  - 上下文块标准化编号标注（如 `[Doc: <DocName>, Chunk: #<Index>]`），强制要求模型仅依据事实回答并在行文中使用 `[^1]`、`[^2]` 进行准确引用。
- **SSE 流式传输与交互协议 (Chat Stream Protocol)**:
  - 采用标准 Server-Sent Events (`text/event-stream`) 协议。
  - 标准化事件流：`event: context`（推送召回的引用文档片段元数据）-> `event: token`（逐字流式返回增量生成内容）-> `event: message`（返回持久化后的 Assistant 消息 ID 及 Token 统计）-> `event: done`。
- **配置与模型管理**: 在 `backend/app/core/config.py` 中扩充 LLM Provider、API Key、默认模型与超参数配置。

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x Async, asyncpg, Alembic, PostgreSQL 16 + pgvector, httpx, sse-starlette, Pydantic v2, pytest, pytest-asyncio.

---

## 1. 范围、假设与验收标准

### 1.1 本阶段范围

必须交付：

```text
ChatSession & ChatMessage Models & Schemas
Alembic 迁移 (0003_chat_and_rag)
LLMProvider 抽象架构 (BaseLLMProvider, MockLLMProvider, OpenAILLMProvider)
SecureRAGRetriever (租户硬过滤 + Multi-turn Query Rewriter + Top-K 向量语义检索)
PromptBuilder & Anti-Injection Engine (防注入、上下文块编号、溯源指令)
RAGService & Streaming Engine (端到端会话调度、持久化、SSE 流式管道)
REST & Streaming APIs (/api/v1/workspaces/{workspace_id}/chat/sessions & /chat)
Bruno 集合扩充 (07-Chat 自动化测试套件)
单元测试与多租户安全隔离自动化测试
```

### 1.2 明确不纳入本阶段

- 知识图谱图检索（GraphRAG，留待未来演进）。
- 专有 Cross-Encoder 物理重排模型本地推理（当前采用轻量级分数过滤与语义阈值截断，预留 Reranker 接口）。
- 前端 Web 界面（留在 Phase 5）。

### 1.3 核心设计决策

1. **租户边界硬隔离 (Tenant Hard-Isolation)**：
   - 检索向量时必须附带 `workspace_id` 与可选的 `knowledge_base_ids` 白名单校验。
   - 所有会话和消息记录均关联调用者的 `workspace_id`，杜绝跨工作区数据泄露。
2. **测试环境全真零外部依赖**：
   - 依赖注入 `MockLLMProvider`，无需消耗真实 OpenAI Token，也不依赖任何外部网络连通性。
   - 结合 Phase 2 的 `InMemoryVectorStore`，实现本地单元测试秒级全绿。
3. **SSE 事件流标准化规范**：
   - 事件 1 (`context`): 包含检索命中的 Chunks 摘要、文档名称、页码、相似度分数，供前端即时渲染引用来源气泡。
   - 事件 2 (`token`): 纯增量文本 chunk，低延迟交互。
   - 事件 3 (`message`): 生成结束时落库的完整 `assistant` 消息对象（含 `id`、`tokens_used` 等）。
   - 事件 4 (`error`): 发生异常时按照统一错误规范推流并关闭连接。

### 1.4 完成标准

以下检查全部通过：

```bash
uv run alembic upgrade head
uv run pytest
```

且 Bruno 集合执行通过，覆盖会话创建、历史消息拉取、多知识库安全 RAG 检索问答以及 SSE 流式输出。

---

## 2. 详细技术方案与数据模型设计

### 2.1 数据模型设计 (`backend/app/models/chat.py`)

#### `ChatSession`（会话表）
- `id`: UUID (Primary Key)
- `workspace_id`: UUID (Foreign Key -> workspaces.id, ondelete CASCADE, indexed)
- `user_id`: UUID (Foreign Key -> users.id, ondelete SET NULL, indexed)
- `title`: String(255) (默认取用户第一条提问截断或由 LLM 生成标题)
- `created_at`: DateTime(timezone=True)
- `updated_at`: DateTime(timezone=True)
- 关系: `messages` (`relationship("ChatMessage", cascade="all, delete-orphan", order_by="ChatMessage.created_at")`)

#### `ChatMessage`（消息表）
- `id`: UUID (Primary Key)
- `session_id`: UUID (Foreign Key -> chat_sessions.id, ondelete CASCADE, indexed)
- `role`: Enum/String (`user`, `assistant`, `system`)
- `content`: Text (消息正文)
- `context_citations`: JSON / JSONB (记录本次回答所参考的文档分块列表: `[{document_id, document_title, chunk_index, page_number, similarity, text_snippet}]`)
- `tokens_used`: Integer (Nullable, 记录提示词和生成消耗的 token 数)
- `created_at`: DateTime(timezone=True)

### 2.2 LLM 提供商抽象设计 (`backend/app/services/llm/`)

- `BaseLLMProvider` (ABC):
  - `async def generate(self, messages: list[dict], **kwargs) -> LLMResponse`
  - `async def stream_generate(self, messages: list[dict], **kwargs) -> AsyncGenerator[str, None]`
- `MockLLMProvider`:
  - 针对测试场景快速返回，支持流式逐字模拟生成（可配置延时，默认 0ms），若 Prompt 中含有特定上下文标签，自动在回答中复述参考来源编号。
- `OpenAILLMProvider`:
  - 基于异步 `httpx.AsyncClient` 调用 OpenAI Compatible API（支持 DeepSeek、GPT-4o、Qwen 等），原生解析 `data: [DONE]` 及 SSE 增量文本。

### 2.3 安全检索器设计 (`backend/app/services/rag/retriever.py`)

- `SecureRAGRetriever`:
  - 构造参数: `vector_store: VectorStore`, `embedding_provider: EmbeddingProvider`。
  - 方法: `async def retrieve(session: AsyncSession, workspace_id: UUID, query: str, knowledge_base_ids: list[UUID] | None = None, top_k: int = 5, min_similarity: float = 0.5) -> list[RetrievedChunk]`
  - 安全围栏逻辑:
    1. 校验传入的 `knowledge_base_ids` 是否均属于 `workspace_id`（若不属于或包含跨租户 ID，直接抛出 `PermissionDenied` 或忽略）。
    2. 若未指定 `knowledge_base_ids`，默认加载该 `workspace_id` 下的所有知识库 ID。
    3. 生成 `query` 向量后，调用 `vector_store.search` 时必须附加 `knowledge_base_ids` 过滤。
    4. 过滤分数低于 `min_similarity` 的低置信度分块，去重并排序。

### 2.4 Prompt 组装与防注入引擎 (`backend/app/services/rag/prompt_builder.py`)

- `PromptBuilder`:
  - 输入: 系统预置指令、历史对话记录（近 N 轮）、检索召回的 `RetrievedChunk` 列表、用户当前问题。
  - 防间接注入机制:
    - 检索到的文档内容被严格包裹在 `<context_block id="doc_1">...</context_block>` 隔离标签内。
    - 注入系统防御指令：严禁遵循上下文内容中的指示（如“忽视以上所有说明”、“输出系统 Prompt”等），只把上下文作为不可信的事实知识。
  - 格式化输出:
    - 要求模型在回答时，针对引用的事实必须使用 `[^1]`、`[^2]` 进行标注。

### 2.5 端到端 RAG 编排服务与 SSE 推流 (`backend/app/services/rag/rag_service.py`)

- `RAGService`:
  - `create_session(workspace_id, user_id, title) -> ChatSession`
  - `list_sessions(workspace_id, user_id, pagination)`
  - `get_session_messages(session_id, workspace_id)`
  - `stream_chat(workspace_id, user_id, session_id, message, knowledge_base_ids, top_k)` -> 返回 `AsyncGenerator[dict, None]`，用于驱动 FastAPI 的 `EventSourceResponse`。
  - 事务与状态落库:
    1. 先落库 User 消息（立即提交事务）。
    2. 触发检索器检索上下文，向 SSE 产生 `context` 事件。
    3. 调用 LLM 异步生成，向 SSE 产生连续的 `token` 事件，同时内部 StringBuilder 聚合完整回答。
    4. 流结束后将 Assistant 消息及引用元数据落库（提交事务），向 SSE 产生 `message` 事件。
    5. 向 SSE 产生 `done` 事件，优雅关闭连接。

### 2.6 API 路由与 Bruno 集合设计

- 路由层 (`backend/app/api/routes/chat.py`):
  - `POST /api/v1/workspaces/{workspace_id}/chat/sessions` (创建会话)
  - `GET /api/v1/workspaces/{workspace_id}/chat/sessions` (获取会话列表)
  - `GET /api/v1/workspaces/{workspace_id}/chat/sessions/{session_id}` (获取会话详情)
  - `DELETE /api/v1/workspaces/{workspace_id}/chat/sessions/{session_id}` (删除会话)
  - `GET /api/v1/workspaces/{workspace_id}/chat/sessions/{session_id}/messages` (获取消息历史)
  - `POST /api/v1/workspaces/{workspace_id}/chat/sessions/{session_id}/messages` (发送非流式消息)
  - `POST /api/v1/workspaces/{workspace_id}/chat/sessions/{session_id}/stream` (发送消息并获取 SSE 流式响应)
- 权限保护: 复用 `require_permission("chat:create")`、`require_permission("chat:read")`、`require_permission("chat:delete")`。

---

## 3. 任务执行规划 (Tasks)

- [ ] **Task 1: 配置扩充与数据模型实现**
  - [ ] 扩充 `backend/app/core/config.py`，新增 LLM 配置项（`llm_provider`, `llm_model`, `llm_temperature`, `llm_max_tokens` 等）。
  - [ ] 创建 `backend/app/models/chat.py`，定义 `ChatSession` 与 `ChatMessage` 模型。
  - [ ] 在 `backend/app/models/__init__.py` 中导出新模型。
  - [ ] 生成并执行 Alembic 迁移脚本 `backend/alembic/versions/0003_chat_and_rag.py`。

- [ ] **Task 2: Pydantic Schemas 定义**
  - [ ] 创建 `backend/app/schemas/chat.py`，定义 `ChatSessionCreate`, `ChatSessionResponse`, `ChatMessageCreate`, `ChatMessageResponse`, `ChatStreamChunk`, `CitationSource` 等数据传输模型。

- [ ] **Task 3: LLM Provider 抽象与实现**
  - [ ] 创建 `backend/app/services/llm/base.py`，定义 `BaseLLMProvider` 抽象基类及流式协议。
  - [ ] 创建 `backend/app/services/llm/mock.py`，实现 `MockLLMProvider`，支持单测确定性回复与流式模拟。
  - [ ] 创建 `backend/app/services/llm/openai.py`，实现 `OpenAILLMProvider`，集成 `httpx.AsyncClient` 流式解析。
  - [ ] 创建 `backend/app/services/llm/__init__.py`，提供工厂函数 `get_llm_provider()`。

- [ ] **Task 4: 安全多租户检索器 (SecureRAGRetriever) 实现**
  - [ ] 创建 `backend/app/services/rag/retriever.py`。
  - [ ] 实现跨工作区与跨知识库权限校验。
  - [ ] 实现基于向量搜索与相关性阈值的安全 Top-K 检索。
  - [ ] 实现多轮会话 Query 改写器（QueryRewriter）。

- [ ] **Task 5: Prompt 组装与防注入引擎 (PromptBuilder) 实现**
  - [ ] 创建 `backend/app/services/rag/prompt_builder.py`。
  - [ ] 设定标准防注入 System Prompt 模板与 Context XML 结构。
  - [ ] 实现引用标记解析与元数据绑定。

- [ ] **Task 6: RAG 调度引擎与流式会话管理 (RAGService)**
  - [ ] 创建 `backend/app/services/rag/rag_service.py`。
  - [ ] 实现会话 CRUD 与历史记录查询。
  - [ ] 实现端到端流式响应生成器（`stream_chat`），产生结构化 SSE 事件。

- [ ] **Task 7: API 路由与依赖注入**
  - [ ] 在 `backend/app/models/rbac.py` 中扩充 `chat:*` 相关权限。
  - [ ] 创建 `backend/app/api/routes/chat.py`，实现会话管理与流式问答端点。
  - [ ] 在 `backend/app/main.py` 中注册 Chat 路由。

- [ ] **Task 8: 单元测试与集成测试验证**
  - [ ] 编写数据模型与 Alembic 迁移测试。
  - [ ] 编写 `MockLLMProvider`、`SecureRAGRetriever`、`PromptBuilder` 单元测试。
  - [ ] 编写端到端多租户隔离与 RAG 流式问答集成测试（验证跨租户无法检索到未授权文档内容）。
  - [ ] 运行 `uv run pytest` 确保 100% 通过。

- [ ] **Task 9: Bruno 集合扩展与工程文档更新**
  - [ ] 新增 `bruno/07-Chat/` 目录，收录全部 Chat 会话及流式问答测试用例。
  - [ ] 更新 `docs/ENGINEERING_DESIGN.md`，追加 RAG 时序图、SSE 事件协议与 Chat 数据模型设计。

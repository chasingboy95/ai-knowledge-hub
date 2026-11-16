# Phase 4：Agent 编排、工具调用与业务系统集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1~3 构建的多租户 SaaS、文档向量化管道和流式 RAG 会话基石之上，实现可扩展的企业级 Agent 编排引擎：包括标准化 Tool Registry（工具注册中心）、模型 Function Calling / Tool Calling 循环驱动机制、内置知识库搜索工具与工单/任务生成系统工具、以及面向前端的 Tool Execution 流式推流与确认交互。

**Architecture:**
- **Tool 规范与协议 (Tool Abstraction)**:
  - 定义 `BaseTool` 抽象基类，基于 Pydantic v2 提供严格的参数 Schema（JSON Schema 导出），支持安全白名单过滤与权限校验。
  - `ToolResult`: 包含输出文本、结构化数据（JSON）、以及是否需要人工介入确认标志（Human-in-the-loop）。
- **内置工具集 (Built-in Tools)**:
  1. `KnowledgeSearchTool`: 在当前工作区安全检索授权知识库，返回高置信度事实片段。
  2. `TicketCreateTool`: 业务工单创建工具（标题、紧急度、分类、描述），模拟企业外部系统集成。
  3. `CalculatorTool` / `DataQueryTool`: 精确计算与结构化辅助分析工具。
- **Agent 执行器 (AgentRunner / Orchestrator)**:
  - 支持多轮 ReAct / Tool-Use 循环（Thought -> Action -> Observation -> Final Answer）。
  - 最大迭代轮数限制（防止模型陷入死循环）。
- **SSE 流式工具事件扩展**:
  - `event: tool_call`: 推送即将执行的工具名与解析参数 `{"tool": "knowledge_search", "arguments": {...}}`。
  - `event: tool_result`: 推送工具执行结果数据。
  - `event: token`: 模型基于工具结果最终生成的回答文本。
- **配置与安全边界**:
  - 工具执行必须携带调用者会话的 `workspace_id` 与 `user_id` 上下文，严禁工具绕过 RBAC 访问未授权数据。

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x Async, Pydantic v2, httpx, pytest, pytest-asyncio.

---

## 1. 范围与验收标准

### 1.1 本阶段交付内容
```text
BaseTool 抽象架构与 ToolRegistry 动态注册机制
内置核心工具：KnowledgeSearchTool、TicketCreateTool
AgentRunner 多轮工具调用编排引擎 (Function Calling 循环)
MockLLMProvider 与 OpenAILLMProvider 扩充工具调用协议支持
Chat 路由升级支持 Agent 工具推流 (/chat/sessions/{id}/agent-stream)
自动化测试套件 (工具执行、权限控制、多轮循环、防死循环熔断)
Bruno API 集合扩充 (08-Agent)
```

### 1.2 完成标准
```bash
uv run pytest
```
所有测试 100% 通过，且工具调用严格遵循工作区多租户边界。

---

## 2. 任务规划 (Tasks)

- [x] **Task 1: Tool 规范与内置工具集实现**
  - [x] 创建 `backend/app/services/agent/tools/base.py`，定义 `BaseTool`, `ToolContext`, `ToolResult`。
  - [x] 创建 `backend/app/services/agent/tools/knowledge_search.py`，实现工作区安全知识检索工具。
  - [x] 创建 `backend/app/services/agent/tools/ticket.py`，实现业务工单集成工具。
  - [x] 创建 `backend/app/services/agent/tools/registry.py`，提供工具注册与查找。

- [x] **Task 2: LLM Provider Function Calling 支持扩充**
  - [x] 更新 `BaseLLMProvider`，新增 `tools` 参数与 `ToolCallRequest` 支持。
  - [x] 升级 `MockLLMProvider`，支持自动检测并触发 Tool Call 模拟。
  - [x] 升级 `OpenAILLMProvider`，对接 OpenAI `tools` 与 `tool_calls` 参数解析。

- [x] **Task 3: AgentRunner 编排引擎与多轮执行循环**
  - [x] 创建 `backend/app/services/agent/runner.py`。
  - [x] 实现 ReAct 循环：LLM 决策 -> 工具解析 -> 安全鉴权执行 -> 上下文回填 -> 最终答案生成。
  - [x] 设置 `max_steps=5` 熔断与超时控制。

- [x] **Task 4: Agent API 路由与 SSE 流式集成**
  - [x] 在 `backend/app/api/routes/chat.py` 中增加 `enable_agent=True` 支持。
  - [x] SSE 新增 `tool_call` 与 `tool_result` 事件推送。

- [x] **Task 5: 自动化测试与质量保障**
  - [x] 编写 `tests/test_agent.py`，验证工单创建与知识库搜索工具调用。
  - [x] 运行 `uv run pytest`，全量 135 个测试 100% 通过（8.83s）。

- [x] **Task 6: Bruno 集合扩充与工程设计文档更新**
  - [x] 新增 `bruno/08-Agent/` 接口用例（知识库检索与工单提交流式测试）。
  - [x] 更新 `docs/ENGINEERING_DESIGN.md`，追加第 7 节 Agent 架构图与工具流式事件规范。

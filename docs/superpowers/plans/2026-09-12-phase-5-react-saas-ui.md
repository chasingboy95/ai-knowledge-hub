# Phase 5：React SaaS 前端交互控制台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建现代化企业级 React SaaS 前端工作台（基于 Vite + React 19 + TypeScript + Tailwind CSS / Lucide Icons），提供完整的用户认证、组织/工作区切换、知识库与文档上传/切块预览、以及支持 Server-Sent Events (SSE) 流式打字机交互、动态引用溯源气泡与 Agent 工具调用徽章的实时对话控制台。

**Architecture:**
- **构建与基础库**: Vite + React + TypeScript + React Router DOM + Axios / Fetch SSE + Tailwind CSS。
- **状态管理与认证流**:
  - `AuthContext`: 统一管理 JWT Access Token、当前登录用户信息、组织选择与工作区上下文。
  - 请求拦截器: 自动挂载 `Authorization: Bearer <token>`，响应拦截 `401` 自动触发 Refresh Token 轮转重试。
- **核心功能页面**:
  1. **Auth 页面**: 登录（Login）、注册（Register）、接受邀请（Accept Invitation）。
  2. **工作区控制台 (Dashboard / Workspaces)**: 组织工作区切换器、多租户统计概览。
  3. **知识库管理 (Knowledge Bases & Documents)**:
     - 知识库 CRUD 与卡片展示；
     - 拖拽文档上传（PDF/DOCX/MD/TXT）、切块状态指示条（`PARSING -> CHUNKING -> EMBEDDING -> READY / FAILED`）；
     - 文档分块预览弹窗（Chunk Content、页码与向量统计）。
  4. **AI 智能对话与 Agent 控制台 (Chat & Agent Console)**:
     - 多会话抽屉（Session List & New Session）；
     - 知识库选择与 Agent 模式开关（`enable_agent=true`）；
     - SSE 流式响应渲染器（实时打字效果、引用溯源卡片跳转 `[^1]`、Agent 工具调用卡片 `tool_call` / `tool_result` 实时状态展示）。
  5. **组织与成员管理 (Members & RBAC)**: 组织成员列表、发送邀请（Invite Member）、角色管理。
- **代理与环境配置**:
  - `vite.config.ts` 配置开发服务器代理（`/api/v1` -> `http://localhost:8000`）。

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Lucide React, React Router v6, Vitest (测试).

---

## 1. 范围与验收标准

### 1.1 必须交付
```text
Vite + React 19 + TypeScript + Tailwind 前端工程脚手架 (frontend/)
API 客户端封装 (Axios 拦截器 + SSE EventSource 流式解析器)
Auth 模块 (登录、注册、Token 自动刷新与上下文保存)
工作台框架 (TopNav / Sidebar / Workspace Switcher)
知识库与文档管理界面 (创建 KB、拖拽上传、切块详情预览)
Secure RAG & Agent 实时流式对话工作台 (SSE 消息气泡、引用来源卡片、工具调用徽章)
组织与成员权限管理界面
```

### 1.2 完成标准
```bash
npm run build
```
编译通过无类型错误，开发服务正常代理后端 API，UI 风格符合现代化企业 SaaS 视觉规范。

---

## 2. 任务规划 (Tasks)

- [x] **Task 1: 前端工程脚手架初始化与基础配置**
  - [x] 在 `frontend/` 下初始化 Vite + React + TypeScript 项目。
  - [x] 配置 Tailwind CSS 与 Lucide 图标库。
  - [x] 配置 Vite 开发代理（Proxy `/api/v1` -> `http://localhost:8000`）。

- [x] **Task 2: API 客户端与认证上下文 (AuthContext)**
  - [x] 实现 `src/api/client.ts`，配置 Axios 实例与 Token 自动注入/401 拦截。
  - [x] 实现 `src/api/sse.ts`，封装支持 Bearer Header 的原生 `fetch` SSE 流式读取器。
  - [x] 实现 `src/context/AuthContext.tsx`，管理用户会话、当前选中的 Organization 与 Workspace。

- [x] **Task 3: 认证与工作区基础页面**
  - [x] 编写登录页 (`Login.tsx`) 与注册页 (`Register.tsx`)。
  - [x] 编写全局布局组件 (`Layout.tsx`)：顶部导航、工作区切换下拉、侧边栏导航。
  - [x] 编写仪表盘首页 (`Dashboard.tsx`)。

- [x] **Task 4: 知识库与文档管理模块**
  - [x] 编写知识库列表与创建弹窗 (`KnowledgeBases.tsx`)。
  - [x] 编写知识库详情页 (`KnowledgeBaseDetail.tsx`)，实现拖拽上传与文档列表。
  - [x] 编写文档分块预览抽屉 (`DocumentChunksModal.tsx`)。

- [x] **Task 5: Secure RAG & Agent 流式对话工作台**
  - [x] 编写会话侧边栏与新建对话功能。
  - [x] 实现流式消息气泡渲染器（支持 Markdown、代码高亮、引用标记 `[^1]` 悬停卡片）。
  - [x] 实现 Agent 工具调用实时卡片（展示 `create_ticket` 或 `knowledge_search` 展开参数与观察结果）。
  - [x] 提供知识库范围多选过滤器与 Agent 模式切换开关。

- [x] **Task 6: 组织成员与权限管理模块**
  - [x] 编写组织成员列表与邀请成员模态框 (`Members.tsx`)。

- [x] **Task 7: 构建校验与文档更新**
  - [x] 执行 `npm run build` 确保 TypeScript 类型与生产打包通过。
  - [x] 更新 `knowledge-base/README.md` 与 `docs/ENGINEERING_DESIGN.md`。

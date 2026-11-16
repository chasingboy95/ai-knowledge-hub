# Phase 6：企业安全审计加固与生产上线实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建企业级多租户安全审计系统（Audit Trail Logging）、可拔插对象存储服务（Local / S3 / MinIO）与前端审计轨迹控制台，并交付生产环境容器编排与全链路自动化验证。

**Architecture:**
- **审计数据模型 (`audit_logs`)**:
  - `id`, `organization_id`, `workspace_id`, `user_id`, `event_type`, `resource_type`, `resource_id`, `ip_address`, `user_agent`, `payload` (JSON), `created_at`。
  - 核心事件定义：`AUTH_LOGIN`, `AUTH_LOGOUT`, `MEMBER_INVITE`, `MEMBER_REMOVE`, `WORKSPACE_CREATE`, `DOCUMENT_UPLOAD`, `DOCUMENT_DELETE`, `RAG_QUERY`, `AGENT_TOOL_CALL`。
- **存储驱动分层 (`StorageService`)**:
  - `LocalStorageService`: 本地安全沙箱与路径穿越防护。
  - `S3StorageService`: 支持 AWS S3 / MinIO / 阿里云 OSS 兼容接口。
- **后端审计接口 (`/api/v1/organizations/{organization_id}/audit-logs`)**:
  - 严格通过 `require_permission("audit:read")` 鉴权（仅 OWNER 与 ADMIN 具备查看权限）。
  - 支持分页、按事件类型过滤与时间范围筛选。
- **前端安全审计控制台 (`AuditLogs.tsx`)**:
  - 接入顶部/侧边导航 `/audit`。
  - 事件类型过滤下拉框、用户操作者筛选、Payload JSON 明细抽屉预览。

---

## 1. 任务规划 (Tasks)

- [x] **Task 1: 审计日志数据模型与数据库迁移**
  - [x] 编写 `backend/app/models/audit.py`，定义 `AuditLog` 模型及外键级联。
  - [x] 更新 `backend/app/models/__init__.py` 导出。
  - [x] 生成并执行 Alembic 迁移脚本 `0004_audit_logs.py`。

- [x] **Task 2: 审计服务与 API 路由**
  - [x] 编写 `backend/app/schemas/audit.py`，定义请求与响应 Schema。
  - [x] 编写 `backend/app/services/audit.py`，实现 `record_audit_log` 与 `list_audit_logs`。
  - [x] 编写 `backend/app/api/routes/audit.py`，声明受 `audit:read` 保护的审计查询端点。
  - [x] 在 `backend/app/api/router.py` 中注册审计路由。

- [x] **Task 3: 业务关键事件审计拦截与埋点**
  - [x] 用户登录埋点 (`AUTH_LOGIN`)。
  - [x] 成员邀请与移除埋点 (`MEMBER_INVITE`, `MEMBER_REMOVE`)。
  - [x] 文档上传与删除埋点 (`DOCUMENT_UPLOAD`, `DOCUMENT_DELETE`)。
  - [x] RAG 检索问答与 Agent 工具调用埋点 (`RAG_QUERY`, `AGENT_TOOL_CALL`)。

- [x] **Task 4: 对象存储驱动增强 (S3 / MinIO 兼容接口)**
  - [x] 在 `backend/app/core/config.py` 增加 S3 相关配置项（`s3_bucket`, `s3_endpoint_url`, `s3_access_key`, `s3_secret_key` 等）。
  - [x] 在 `backend/app/services/storage.py` 实现 `S3StorageService` 与工厂函数。

- [x] **Task 5: 前端安全审计控制台与页面集成**
  - [x] 编写 `frontend/src/pages/AuditLogs.tsx`，支持事件徽章、时间过滤与 Payload JSON 预览。
  - [x] 在 `frontend/src/components/Layout.tsx` 侧边栏增加“安全审计日志”导航项。
  - [x] 在 `frontend/src/App.tsx` 注册 `/audit` 受保护路由。

- [x] **Task 6: 自动化测试与工程验证**
  - [x] 编写 `tests/test_audit.py`，覆盖 RBAC 拦截、事件写入与分页过滤。
  - [x] 运行 `uv run pytest` 确保 100% 测试通过（138 项全部 PASS）。
  - [x] 运行 `cd frontend && npm run build` 确保前端构建 0 错误。
  - [x] 更新设计文档与知识库。

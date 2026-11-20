# AI Knowledge Hub (企业级 AI 知识库与 RAG 问答系统)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20with%20pgvector-336791.svg)](https://github.com/pgvector/pgvector)

[English](#english) | [中文](#中文)

---

<a name="中文"></a>
## 📖 项目简介

**AI Knowledge Hub** 是一套现代化、支持多租户隔离的企业级 AI 知识库与检索增强生成 (RAG) 问答系统。

系统支持多种格式文档上传切片、向量化嵌入、高维相似度混合检索，并能灵活接入本地开源模型（如 Ollama `qwen3-embedding:0.6b` / `qwen2.5:7b`）与主流云端大模型，为企业与个人提供高效、私有、可控的知识管理与智能交互体验。

### 🌟 核心特性

- 🏢 **多租户与组织隔离**: 采用 `Organization` -> `Workspace` 两级架构，确保数据在租户间完全物理隔离。
- 📑 **多格式文档解析与切片**: 支持 PDF、Markdown、TXT、DOCX 等多种格式，自动分块、提取元数据并生成向量。
- 🔍 **高性能向量检索**: 基于 PostgreSQL `pgvector` 扩展存储与检索高维嵌入向量（默认 1024 维），支持余弦相似度极速匹配。
- 🤖 **本地与云端模型无缝适配**:
  - **Embedding 向量化**: 原生支持 Ollama 本地 `qwen3-embedding:0.6b` 及 OpenAI 兼容接口。
  - **LLM 生成**: 适配 Ollama 本地推理服务与云端商业大模型（OpenAI、Claude、DeepSeek 等）。
- 💬 **会话与智能问答 (RAG)**: 上下文感知多轮对话，检索关联知识分块并附带来源引用溯源。
- 🎨 **现代化全栈体验**:
  - **后端**: Python 3.11 + FastAPI + SQLAlchemy 2.0 (Async) + Pydantic v2
  - **前端**: React 18 + Vite + TypeScript + Tailwind CSS + Lucide Icons

---

## 🏗️ 架构概览

```text
[用户界面 / React 18 + Vite + Tailwind]
                  │
                  ▼ HTTP / RESTful API
[API 网关 / FastAPI 异步服务]
      ├── 身份认证与多租户权限校验
      ├── 文档管理与解析引擎 (Chunking & Parsing)
      ├── RAG 检索管线 (Hybrid Search & Context Assembly)
      └── 对话会话管理器 (Chat Session Service)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
[PostgreSQL + pgvector]   [LLM & Embedding 模型服务]
 (文档元数据 / 向量分块)   (Ollama: qwen3-embedding / 云端 API)
```

---

## 🚀 快速启动

### 1. 启动基础设施与向量数据库

```bash
# 启动 PostgreSQL 16 (内置 pgvector 扩展)
docker-compose up -d
```

### 2. 准备本地 Embedding 模型（以 Ollama 为例）

```bash
# 拉取并运行 Qwen3 嵌入模型 (1024 维)
ollama pull qwen3-embedding:0.6b
```

### 3. 后端服务启动

```bash
cd backend

# 创建并激活虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 执行数据库迁移
alembic upgrade head

# 启动 FastAPI 服务
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

后端 API 文档将在 `http://localhost:8000/docs` 提供。

### 4. 前端应用启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端界面将在 `http://localhost:5173` 运行。

---

<a name="english"></a>
## 📖 English Overview

**AI Knowledge Hub** is a modern, production-grade AI Knowledge Base and Retrieval-Augmented Generation (RAG) platform with multi-tenant architecture.

### ✨ Key Features

- 🏢 **Multi-Tenancy**: Organization and Workspace two-level data isolation.
- 📑 **Document Ingestion & Chunking**: Automatic parsing and chunking for PDF, Markdown, TXT, and DOCX.
- 🔍 **Vector Search via pgvector**: High-dimensional vector storage and cosine similarity retrieval on PostgreSQL.
- 🤖 **Local & Cloud Model Interoperability**: Seamless integration with local Ollama embeddings (`qwen3-embedding:0.6b`) and any OpenAI-compatible LLMs.
- 💬 **Context-Aware RAG Chat**: Interactive conversations with source-grounded references.
- ⚡ **Modern Stack**: FastAPI (Python 3.11), SQLAlchemy Async, React 18, TypeScript, Vite, Tailwind CSS.

---

## 📄 开源许可 / License

本项目采用 [MIT License](LICENSE) 许可协议。

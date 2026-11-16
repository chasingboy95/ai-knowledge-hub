import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { BookOpen, ShieldCheck, Database, ArrowRight, Bot, Cpu } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { currentOrg, currentWorkspace, workspaces } = useAuth();

  return (
    <div className="p-8 max-w-6xl w-full mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-8 text-white shadow-lg border border-slate-700/50 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-mono mb-4 border border-orange-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>三层租户架构 · 硬边界向量隔离</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            欢迎回到 {currentOrg?.name || '企业知识库'}
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            当前处于工作区：<span className="text-white font-semibold">{currentWorkspace?.name || '默认工作区'}</span>。
            系统已就绪，支持非受限大语言模型在严密权限隔离下进行 RAG 语义检索与多步 Agent 协同。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/chat"
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 font-medium text-xs rounded-lg transition flex items-center gap-2 shadow-sm"
            >
              <Bot className="w-4 h-4" />
              <span>开启智能问答 / Agent</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/knowledge-bases"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-lg transition border border-slate-600"
            >
              管理知识库文档
            </Link>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-mono uppercase text-slate-500 tracking-wider">隔离工作区</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{workspaces.length}</h3>
            <p className="text-xs text-slate-400 mt-1">独立数据空间与文档库</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-mono uppercase text-slate-500 tracking-wider">向量存储引擎</p>
            <h3 className="text-xl font-bold text-slate-900 mt-1">pgvector 1536</h3>
            <p className="text-xs text-slate-400 mt-1">HNSW 余弦距离高阶索引</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-mono uppercase text-slate-500 tracking-wider">Agent 运行时</p>
            <h3 className="text-xl font-bold text-slate-900 mt-1">ReAct Engine</h3>
            <p className="text-xs text-slate-400 mt-1">支持 Function Calling 闭环</p>
          </div>
        </div>
      </div>

      {/* Quick Launch Guide */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900">快速上手</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/knowledge-bases"
            className="p-4 rounded-lg border border-slate-100 hover:border-orange-200 hover:bg-orange-50/30 transition group block"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-900 group-hover:text-orange-600">
                1. 上传企业知识库文档
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-orange-600" />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              支持 PDF、Word (.docx)、Markdown 及纯文本，全自动异步解析与语义向量切块。
            </p>
          </Link>

          <Link
            to="/chat"
            className="p-4 rounded-lg border border-slate-100 hover:border-orange-200 hover:bg-orange-50/30 transition group block"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-900 group-hover:text-orange-600">
                2. 体验流式 RAG 与工具调用
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-orange-600" />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              基于 Server-Sent Events 流式推流，内置精准片段溯源与工单自动化生成。
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
};

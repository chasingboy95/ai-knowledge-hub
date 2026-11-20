import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { getAuditTimeWindow } from '../utils/auditTimeWindow';
import {
  ShieldAlert,
  Shield,
  Filter,
  RefreshCw,
  Clock,
  User as UserIcon,
  FileCode,
  Layers,
  Sparkles,
  Bot,
  FileText,
  UserCheck,
  UserX,
  Building2,
  FolderPlus,
  FolderMinus,
  MessageSquare,
  Search,
  RotateCcw,
  Calendar,
} from 'lucide-react';

interface AuditLog {
  id: string;
  organization_id: string;
  workspace_id?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  event_type: string;
  resource_type?: string | null;
  resource_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 50;
const initialFilters = {
  eventType: '', resourceType: '', workspaceId: '', dateRange: 'all', query: '',
};
type AuditFilters = typeof initialFilters;
type AuditRequest = AuditFilters & { offset: number; startTime: string; endTime: string };
type AuditResult = { logs: AuditLog[] } | { error: string };

export const AuditLogs: React.FC = () => {
  const { currentOrg, currentRole, membershipError, hasPermission } = useAuth();
  if (currentOrg && hasPermission('audit:read')) {
    return <OrganizationAuditLogs key={currentOrg.id} organizationId={currentOrg.id} />;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">安全与操作审计日志</h1>
      {!currentOrg ? (
        <p className="text-sm text-slate-600">请选择要查看的组织。</p>
      ) : membershipError ? (
        <p className="text-sm text-slate-600">请重试加载组织权限。</p>
      ) : currentRole ? (
        <p role="alert" className="text-sm text-slate-600">查看审计日志需要 audit:read 权限，请联系组织管理员。</p>
      ) : (
        <p role="status" className="text-sm text-slate-600">正在加载组织权限…</p>
      )}
    </div>
  );
};

function OrganizationAuditLogs({ organizationId }: { organizationId: string }) {
  const { workspaces } = useAuth();
  const [request, setRequest] = useState<AuditRequest>(() => ({
    ...initialFilters, ...getAuditTimeWindow(initialFilters.dateRange), offset: 0,
  }));
  const [response, setResponse] = useState<{ request: AuditRequest; result: AuditResult } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayload, setSelectedPayload] = useState<AuditLog['payload']>(null);
  const { eventType, resourceType, workspaceId, dateRange, offset } = request;
  const result = response?.request === request ? response.result : null;
  const records = result && 'logs' in result ? result.logs : [];
  const logs = records.slice(0, PAGE_SIZE);
  const error = result && 'error' in result ? result.error : null;
  const isLoading = result === null;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    apiClient.get<AuditLog[]>(`/organizations/${organizationId}/audit-logs`, {
      signal,
      params: {
        limit: PAGE_SIZE + 1,
        offset: request.offset,
        event_type: request.eventType || undefined,
        resource_type: request.resourceType || undefined,
        workspace_id: request.workspaceId || undefined,
        start_time: request.startTime || undefined,
        end_time: request.endTime,
        query: request.query || undefined,
      },
    })
      .then(({ data }) => {
        if (!signal.aborted) setResponse({ request, result: { logs: data } });
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        const error = isAxiosError(err) && err.response?.status === 403
          ? '查看审计日志需要 audit:read 权限，请联系组织管理员。'
          : '无法加载审计日志。请检查网络连接后重试。';
        setResponse({ request, result: { error } });
      });
    return () => controller.abort();
  }, [organizationId, request]);

  const updateFilters = (filters: Partial<AuditFilters>) => {
    setSelectedPayload(null);
    const now = new Date();
    setRequest((previous) => ({
      ...previous,
      ...filters,
      ...getAuditTimeWindow(filters.dateRange ?? previous.dateRange, now),
      offset: 0,
    }));
  };
  const loadPage = (pageOffset: number) => {
    setSelectedPayload(null);
    setRequest((previous) => ({ ...previous, offset: pageOffset }));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ query: searchQuery.trim() });
  };

  const resetFilters = () => {
    setSearchQuery('');
    updateFilters(initialFilters);
  };

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case 'AUTH_LOGIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <UserCheck className="w-3 h-3" /> 用户登录
          </span>
        );
      case 'ORGANIZATION_CREATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Building2 className="w-3 h-3" /> 创建组织
          </span>
        );
      case 'WORKSPACE_CREATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            <Layers className="w-3 h-3" /> 创建工作区
          </span>
        );
      case 'WORKSPACE_UPDATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 border border-cyan-200">
            <Layers className="w-3 h-3" /> 更新工作区
          </span>
        );
      case 'WORKSPACE_DELETE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <Layers className="w-3 h-3" /> 删除工作区
          </span>
        );
      case 'KNOWLEDGE_BASE_CREATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <FolderPlus className="w-3 h-3" /> 创建知识库
          </span>
        );
      case 'KNOWLEDGE_BASE_UPDATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <FolderPlus className="w-3 h-3" /> 更新知识库
          </span>
        );
      case 'KNOWLEDGE_BASE_DELETE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <FolderMinus className="w-3 h-3" /> 删除知识库
          </span>
        );
      case 'DOCUMENT_UPLOAD':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <FileText className="w-3 h-3" /> 上传文档
          </span>
        );
      case 'DOCUMENT_DELETE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <FileText className="w-3 h-3" /> 删除文档
          </span>
        );
      case 'CHAT_SESSION_CREATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 border border-teal-200">
            <MessageSquare className="w-3 h-3" /> 创建问答会话
          </span>
        );
      case 'CHAT_SESSION_DELETE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-800 border border-slate-300">
            <MessageSquare className="w-3 h-3" /> 删除问答会话
          </span>
        );
      case 'RAG_QUERY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
            <Bot className="w-3 h-3" /> RAG 语义问答
          </span>
        );
      case 'AGENT_TOOL_CALL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            <Sparkles className="w-3 h-3" /> Agent 工具调用
          </span>
        );
      case 'MEMBER_INVITE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800 border border-violet-200">
            <UserCheck className="w-3 h-3" /> 邀请新成员
          </span>
        );
      case 'MEMBER_ACCEPT_INVITE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <UserCheck className="w-3 h-3" /> 接受成员邀请
          </span>
        );
      case 'MEMBER_ROLE_UPDATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Shield className="w-3 h-3" /> 成员权限变更
          </span>
        );
      case 'MEMBER_REMOVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <UserX className="w-3 h-3" /> 移除成员
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {eventType}
          </span>
        );
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">安全与操作审计日志</h1>
            <span className="bg-slate-900 text-white text-[11px] px-2.5 py-0.5 rounded-full font-mono">
              Audit Trail
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            追踪当前租户内的一切敏感业务与 AI 操作轨迹，提供多维度精确筛选与合规追溯。
          </p>
        </div>

        <button
          type="button"
          onClick={() => updateFilters({})}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          刷新日志
        </button>
      </div>

      {/* Common Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter: Event Type */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="事件类型"
              value={eventType}
              onChange={(e) => updateFilters({ eventType: e.target.value })}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="">全部事件类型</option>
              <optgroup label="🔐 认证与账号">
                <option value="AUTH_LOGIN">AUTH_LOGIN (用户登录)</option>
              </optgroup>
              <optgroup label="🏢 组织与工作区">
                <option value="ORGANIZATION_CREATE">ORGANIZATION_CREATE (创建组织)</option>
                <option value="WORKSPACE_CREATE">WORKSPACE_CREATE (创建工作区)</option>
                <option value="WORKSPACE_UPDATE">WORKSPACE_UPDATE (更新工作区)</option>
                <option value="WORKSPACE_DELETE">WORKSPACE_DELETE (删除工作区)</option>
              </optgroup>
              <optgroup label="📚 知识库与文档">
                <option value="KNOWLEDGE_BASE_CREATE">KNOWLEDGE_BASE_CREATE (创建知识库)</option>
                <option value="KNOWLEDGE_BASE_UPDATE">KNOWLEDGE_BASE_UPDATE (更新知识库)</option>
                <option value="KNOWLEDGE_BASE_DELETE">KNOWLEDGE_BASE_DELETE (删除知识库)</option>
                <option value="DOCUMENT_UPLOAD">DOCUMENT_UPLOAD (文档上传)</option>
                <option value="DOCUMENT_DELETE">DOCUMENT_DELETE (文档删除)</option>
              </optgroup>
              <optgroup label="💬 对话与智能体">
                <option value="CHAT_SESSION_CREATE">CHAT_SESSION_CREATE (创建会话)</option>
                <option value="CHAT_SESSION_DELETE">CHAT_SESSION_DELETE (删除会话)</option>
                <option value="RAG_QUERY">RAG_QUERY (RAG 语义问答)</option>
                <option value="AGENT_TOOL_CALL">AGENT_TOOL_CALL (Agent 工具调用)</option>
              </optgroup>
              <optgroup label="👥 成员与权限">
                <option value="MEMBER_INVITE">MEMBER_INVITE (邀请成员)</option>
                <option value="MEMBER_ACCEPT_INVITE">MEMBER_ACCEPT_INVITE (接受邀请)</option>
                <option value="MEMBER_ROLE_UPDATE">MEMBER_ROLE_UPDATE (权限角色变更)</option>
                <option value="MEMBER_REMOVE">MEMBER_REMOVE (移除成员)</option>
              </optgroup>
            </select>
          </div>

          {/* Filter: Resource Type */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="资源类型"
              value={resourceType}
              onChange={(e) => updateFilters({ resourceType: e.target.value })}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="">全部资源类型</option>
              <option value="user">user (用户)</option>
              <option value="organization">organization (组织)</option>
              <option value="workspace">workspace (工作区)</option>
              <option value="knowledge_base">knowledge_base (知识库)</option>
              <option value="document">document (文档)</option>
              <option value="chat_session">chat_session (问答会话)</option>
              <option value="invitation">invitation (邀请)</option>
              <option value="membership">membership (成员关系)</option>
            </select>
          </div>

          {/* Filter: Workspace */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="工作区"
              value={workspaceId}
              onChange={(e) => updateFilters({ workspaceId: e.target.value })}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="">全部工作区</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter: Date Range */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="时间范围"
              value={dateRange}
              onChange={(e) => updateFilters({ dateRange: e.target.value })}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="all">全部时间</option>
              <option value="today">今天</option>
              <option value="3days">近 3 天</option>
              <option value="7days">近 7 天</option>
              <option value="30days">近 30 天</option>
            </select>
          </div>

          {/* Filter: Keyword Search */}
          <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px] flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                aria-label="搜索关键词"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索操作人邮箱、资源ID或事件..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
            </div>
            <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-xs font-medium text-slate-700 hover:bg-slate-200 cursor-pointer">
              搜索
            </button>
          </form>

          {/* Reset Filters */}
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            title="重置全部筛选条件"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p role="alert">{error}</p>
            <button type="button" onClick={() => loadPage(offset)} className="mt-2 text-xs font-semibold text-amber-900 hover:underline cursor-pointer">
              重试
            </button>
          </div>
        </div>
      ) : (
        /* Logs Table */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Layers className="w-4 h-4 text-slate-500" />
              <span>审计事件记录</span>
            </div>
            <nav aria-label="审计日志分页" className="flex items-center gap-3 text-xs text-slate-600">
              <button
                type="button"
                onClick={() => loadPage(offset - PAGE_SIZE)}
                disabled={isLoading || offset === 0}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium hover:bg-slate-100 enabled:cursor-pointer disabled:opacity-50"
              >
                上一页
              </button>
              <span aria-live="polite">第 {offset / PAGE_SIZE + 1} 页{!isLoading && ` · ${logs.length} 条`}</span>
              <button
                type="button"
                onClick={() => loadPage(offset + PAGE_SIZE)}
                disabled={records.length <= PAGE_SIZE}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium hover:bg-slate-100 enabled:cursor-pointer disabled:opacity-50"
              >
                下一页
              </button>
            </nav>
          </div>

          {isLoading ? (
            <div role="status" className="p-12 text-center text-slate-400">正在检索安全审计记录...</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-400">{offset ? '本页暂无审计事件' : '当前筛选条件下暂无审计事件'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3 text-left">时间戳</th>
                    <th className="px-6 py-3 text-left">事件类型</th>
                    <th className="px-6 py-3 text-left">操作主体 (User)</th>
                    <th className="px-6 py-3 text-left">关联资源 (Resource)</th>
                    <th className="px-6 py-3 text-right">参数载荷 (Payload)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-3.5 whitespace-nowrap text-slate-400 font-mono flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">{getEventBadge(log.event_type)}</td>
                      <td className="px-6 py-3.5 whitespace-nowrap font-medium text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span>{log.user_email || log.user_id || 'System'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        {log.resource_type ? (
                          <div className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            <span className="font-semibold text-slate-700">{log.resource_type}:</span>
                            <span className="truncate max-w-[120px]">{log.resource_id}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right">
                        {log.payload ? (
                          <button
                            onClick={() => setSelectedPayload(log.payload)}
                            className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:text-orange-700 font-medium px-2 py-0.5 rounded hover:bg-orange-50 transition cursor-pointer"
                          >
                            <FileCode className="w-3.5 h-3.5" />
                            <span>查看 JSON</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* JSON Payload Modal */}
      {selectedPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileCode className="w-4 h-4 text-orange-600" />
                审计事件载荷 (Audit Payload)
              </h3>
              <button
                onClick={() => setSelectedPayload(null)}
                className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded cursor-pointer"
              >
                关闭
              </button>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-orange-400 overflow-x-auto max-h-96">
              <pre>{JSON.stringify(selectedPayload, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

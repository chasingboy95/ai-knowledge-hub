import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import {
  ShieldAlert,
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
  payload?: any;
  created_at: string;
}

export const AuditLogs: React.FC = () => {
  const { currentOrg } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedEventType, setSelectedEventType] = useState<string>('');
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null);

  const fetchLogs = async () => {
    if (!currentOrg) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (selectedEventType) params.event_type = selectedEventType;

      const res = await apiClient.get<AuditLog[]>(`/organizations/${currentOrg.id}/audit-logs`, {
        params,
      });
      setLogs(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || '获取审计日志失败，请确认您是否拥有 audit:read 管理员权限');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [currentOrg, selectedEventType]);

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
            追踪当前租户内的一切敏感业务与 AI 操作轨迹，提供严格不可篡改的事后追溯与合规分析。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="text-xs bg-transparent text-slate-700 focus:outline-none"
            >
              <option value="">全部事件类型</option>
              <option value="AUTH_LOGIN">AUTH_LOGIN (用户登录)</option>
              <option value="ORGANIZATION_CREATE">ORGANIZATION_CREATE (创建组织)</option>
              <option value="WORKSPACE_CREATE">WORKSPACE_CREATE (创建工作区)</option>
              <option value="WORKSPACE_UPDATE">WORKSPACE_UPDATE (更新工作区)</option>
              <option value="WORKSPACE_DELETE">WORKSPACE_DELETE (删除工作区)</option>
              <option value="KNOWLEDGE_BASE_CREATE">KNOWLEDGE_BASE_CREATE (创建知识库)</option>
              <option value="KNOWLEDGE_BASE_UPDATE">KNOWLEDGE_BASE_UPDATE (更新知识库)</option>
              <option value="KNOWLEDGE_BASE_DELETE">KNOWLEDGE_BASE_DELETE (删除知识库)</option>
              <option value="DOCUMENT_UPLOAD">DOCUMENT_UPLOAD (文档上传)</option>
              <option value="DOCUMENT_DELETE">DOCUMENT_DELETE (文档删除)</option>
              <option value="CHAT_SESSION_CREATE">CHAT_SESSION_CREATE (创建问答会话)</option>
              <option value="CHAT_SESSION_DELETE">CHAT_SESSION_DELETE (删除问答会话)</option>
              <option value="RAG_QUERY">RAG_QUERY (RAG 检索提问)</option>
              <option value="AGENT_TOOL_CALL">AGENT_TOOL_CALL (智能体工具调用)</option>
              <option value="MEMBER_INVITE">MEMBER_INVITE (邀请成员)</option>
              <option value="MEMBER_ACCEPT_INVITE">MEMBER_ACCEPT_INVITE (接受邀请)</option>
              <option value="MEMBER_REMOVE">MEMBER_REMOVE (移除成员)</option>
            </select>
          </div>

          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">权限受限或获取异常</h4>
            <p className="mt-1 text-xs text-amber-800 leading-relaxed">{error}</p>
          </div>
        </div>
      ) : (
        /* Logs Table */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Layers className="w-4 h-4 text-slate-500" />
              <span>审计事件记录 ({logs.length})</span>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-400">正在检索安全审计记录...</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-400">当前筛选条件下暂无审计事件</div>
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
                            className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:text-orange-700 font-medium px-2 py-0.5 rounded hover:bg-orange-50 transition"
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
                className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded"
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
};

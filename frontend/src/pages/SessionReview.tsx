import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { MarkdownView } from '../components/MarkdownView';
import { getChatSources } from '../utils/chatSources';
import {
  ShieldAlert,
  Search,
  RefreshCw,
  MessageSquare,
  Bot,
  User as UserIcon,
  Clock,
  BookOpen,
  Download,
  AlertCircle,
  Hash,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface ChatSession {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  user_email?: string | null;
  user_full_name?: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  context_citations?: unknown[] | null;
  tokens_used?: number | null;
  created_at: string;
}

interface Member {
  id: string;
  user_id: string;
  organization_id: string;
  email: string;
  full_name?: string | null;
  role: string;
}

export const SessionReview: React.FC = () => {
  const { currentOrg, currentWorkspace, hasPermission } = useAuth();

  // Permission gate
  if (!hasPermission('audit:read')) {
    return (
      <div className="content-page p-8 max-w-4xl mx-auto w-full">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4">
          <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-amber-900">访问受限</h2>
            <p className="text-sm text-amber-800">
              会话审计属于敏感安全与合规模块，仅组织拥有者（Owner）或管理员（Admin）有权查阅成员问答记录。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentOrg || !currentWorkspace) {
    return (
      <div className="p-8 max-w-4xl mx-auto w-full text-center text-sm text-neutral-500">
        请先选择组织与工作空间以查阅会话审计。
      </div>
    );
  }

  return <SessionReviewContent key={`${currentOrg.id}/${currentWorkspace.id}`} />;
};

function SessionReviewContent() {
  const { user: currentUser, currentOrg, currentWorkspace } = useAuth();
  const workspacePath = `/organizations/${currentOrg!.id}/workspaces/${currentWorkspace!.id}`;

  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Selected session & messages
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');

  // Load members for mapping user_id to user_email / name
  useEffect(() => {
    apiClient
      .get<Member[]>(`/organizations/${currentOrg!.id}/members`)
      .then(({ data }) => setMembers(data))
      .catch((err) => console.error('Failed to load organization members', err));
  }, [currentOrg]);

  // Load sessions
  const loadSessions = async () => {
    setLoadingSessions(true);
    setSessionError(null);
    try {
      const { data } = await apiClient.get<ChatSession[]>(`${workspacePath}/chat/sessions`, {
        params: { limit: 100 },
      });
      setSessions(data);
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].id);
      }
    } catch (err: any) {
      setSessionError(err.response?.data?.detail || '加载会话列表失败，请重试');
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [workspacePath]);

  // Load messages for selected session
  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    setMessageError(null);
    apiClient
      .get<ChatMessage[]>(`${workspacePath}/chat/sessions/${selectedSessionId}/messages`)
      .then(({ data }) => {
        setMessages(data);
      })
      .catch((err: any) => {
        setMessageError(err.response?.data?.detail || '获取此会话问答内容失败');
      })
      .finally(() => {
        setLoadingMessages(false);
      });
  }, [workspacePath, selectedSessionId]);

  // Member map for quick lookup
  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of members) {
      if (m.user_id) {
        map.set(m.user_id, m);
      }
    }
    return map;
  }, [members]);

  // Helper to extract clean member details for any session
  const getSessionUser = (session?: ChatSession | null) => {
    if (!session) {
      return { displayName: '未知成员', email: '', roleName: '' };
    }

    // 1. Check member map from organization memberships
    if (session.user_id && memberMap.has(session.user_id)) {
      const m = memberMap.get(session.user_id)!;
      return {
        displayName: m.full_name || m.email.split('@')[0],
        email: m.email,
        roleName: m.role || '',
      };
    }

    // 2. Check session's own direct attributes
    if (session.user_email) {
      return {
        displayName: session.user_full_name || session.user_email.split('@')[0],
        email: session.user_email,
        roleName: '',
      };
    }

    // 3. Check current user
    if (currentUser && session.user_id === currentUser.id) {
      return {
        displayName: currentUser.full_name || currentUser.email.split('@')[0],
        email: currentUser.email,
        roleName: '',
      };
    }

    return {
      displayName: session.user_id ? `成员 (${session.user_id.slice(0, 8)})` : '外部/匿名',
      email: session.user_id ? `ID: ${session.user_id}` : '',
      roleName: '',
    };
  };

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // User filter
      if (selectedUserId !== 'ALL') {
        if (s.user_id !== selectedUserId) return false;
      }
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const userMeta = getSessionUser(s);
        const titleMatch = s.title.toLowerCase().includes(q);
        const userMatch =
          userMeta.displayName.toLowerCase().includes(q) ||
          userMeta.email.toLowerCase().includes(q);
        if (!titleMatch && !userMatch) return false;
      }
      return true;
    });
  }, [sessions, selectedUserId, searchQuery, memberMap, currentUser]);

  const selectedSession = useMemo(() => {
    return sessions.find((s) => s.id === selectedSessionId);
  }, [sessions, selectedSessionId]);

  const currentSelectedUser = useMemo(() => {
    return getSessionUser(selectedSession);
  }, [selectedSession, memberMap, currentUser]);

  // Export current session as Markdown
  const handleExportMarkdown = () => {
    if (!selectedSession || messages.length === 0) return;
    let md = `# 会话合规审计报告: ${selectedSession.title}\n\n`;
    md += `- **会话 ID**: \`${selectedSession.id}\`\n`;
    md += `- **提问人**: ${currentSelectedUser.displayName} (${currentSelectedUser.email || '无邮箱'})\n`;
    md += `- **创建时间**: ${new Date(selectedSession.created_at).toLocaleString()}\n`;
    md += `- **消息总轮数**: ${messages.length}\n\n`;
    md += `---\n\n## 对话记录\n\n`;

    messages.forEach((msg, idx) => {
      const isUser = msg.role === 'user';
      md += `### [${idx + 1}] ${isUser ? '👤 用户提问' : '🤖 AI 助手回答'} (${new Date(msg.created_at).toLocaleTimeString()})\n\n`;
      md += `${msg.content}\n\n`;
      if (!isUser && msg.tokens_used) {
        md += `*Token 消耗*: ${msg.tokens_used}\n\n`;
      }
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `session_audit_${selectedSession.id.slice(0, 8)}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col min-w-0 bg-neutral-50">
      {/* Top Header */}
      <header className="border-b border-neutral-200 bg-white px-6 py-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-neutral-900">会话合规审计</h1>
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                <ShieldAlert className="size-3" /> 只读审查模式
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-600">
              集中审计工作空间「{currentWorkspace?.name}」内所有成员的 AI 问答交互、检索引用来源与历史回溯。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSessions}
              disabled={loadingSessions}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
              刷新会话
            </button>
            {selectedSession && messages.length > 0 && (
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <Download className="size-3.5" />
                导出报告
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="按标题、成员名或邮箱搜索…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-8 pr-3 py-1.5 text-xs text-neutral-800 placeholder-neutral-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-neutral-500" />
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 focus:border-indigo-400 focus:bg-white focus:outline-none"
            >
              <option value="ALL">全部成员 ({sessions.length})</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name ? `${m.full_name} (${m.email})` : m.email} [{m.role}]
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-neutral-500 ml-auto">
            共找到 <span className="font-semibold text-neutral-900">{filteredSessions.length}</span> 条审计会话
          </div>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Sessions Master List */}
        <aside className="w-80 shrink-0 border-r border-neutral-200 bg-white flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {loadingSessions ? (
              <div className="p-4 text-center text-xs text-neutral-500 space-y-2">
                <RefreshCw className="size-4 animate-spin mx-auto text-indigo-600" />
                <p>正在拉取成员会话列表…</p>
              </div>
            ) : sessionError ? (
              <div className="p-4 text-xs text-red-600">
                <AlertCircle className="size-4 mb-1 text-red-500" />
                <p>{sessionError}</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                暂无符合筛选条件的会话。
              </div>
            ) : (
              filteredSessions.map((session) => {
                const isSelected = session.id === selectedSessionId;
                const userMeta = getSessionUser(session);
                const userInitial = (userMeta.displayName || 'U')[0].toUpperCase();

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full text-left p-3.5 transition flex items-start gap-3 ${
                      isSelected
                        ? 'bg-indigo-50/70 text-indigo-900 border-l-4 border-indigo-600'
                        : 'hover:bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <div className="size-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {userInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="truncate text-xs font-semibold text-neutral-900">
                          {session.title || '无标题会话'}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-neutral-500">
                        {userMeta.displayName}
                        {userMeta.email && userMeta.email !== userMeta.displayName && (
                          <span className="opacity-75"> ({userMeta.email})</span>
                        )}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-400">
                        <span className="flex items-center gap-0.5">
                          <Clock className="size-3" />
                          {new Date(session.created_at).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span>{new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <ChevronRight className={`size-4 shrink-0 text-neutral-300 self-center ${isSelected ? 'text-indigo-600' : ''}`} />
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: Session Detail Transcript */}
        <main className="flex-1 flex flex-col min-w-0 bg-neutral-50 overflow-hidden">
          {selectedSession ? (
            <>
              {/* Transcript Header Info Bar */}
              <div className="border-b border-neutral-200 bg-white px-6 py-3 shrink-0 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-neutral-900 truncate">
                      {selectedSession.title}
                    </h2>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      ID: {selectedSession.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
                    <span>
                      提问者：<strong className="text-neutral-700">{currentSelectedUser.displayName}</strong>
                      {currentSelectedUser.email && (
                        <span className="ml-1 text-neutral-500 font-normal">({currentSelectedUser.email})</span>
                      )}
                    </span>
                    {currentSelectedUser.roleName && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                        {currentSelectedUser.roleName}
                      </span>
                    )}
                    <span>
                      创建于：{new Date(selectedSession.created_at).toLocaleString()}
                    </span>
                    <span>
                      消息轮次：<strong>{messages.length}</strong> 条
                    </span>
                  </div>
                </div>
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {loadingMessages ? (
                  <div className="py-16 text-center text-xs text-neutral-500 space-y-2">
                    <RefreshCw className="size-5 animate-spin mx-auto text-indigo-600" />
                    <p>正在加载会话详情与引用证据…</p>
                  </div>
                ) : messageError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
                    <p className="font-semibold">加载会话消息失败</p>
                    <p className="mt-1">{messageError}</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center text-xs text-neutral-500">
                    该会话目前暂无问答交互消息记录。
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const citations = !isUser ? getChatSources(msg.content, msg.context_citations) : [];

                    return (
                      <div
                        key={msg.id || idx}
                        className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
                      >
                        {/* Avatar */}
                        <div
                          className={`size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                            isUser
                              ? 'bg-indigo-600 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {isUser ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
                        </div>

                        {/* Bubble */}
                        <div
                          className={`rounded-2xl p-4 text-sm leading-relaxed max-w-[85%] ${
                            isUser
                              ? 'bg-indigo-600 text-white rounded-tr-xs shadow-xs'
                              : 'bg-white text-neutral-900 border border-neutral-200 rounded-tl-xs shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[11px] mb-2 opacity-75">
                            <span className="font-semibold">{isUser ? currentSelectedUser.displayName : 'AI 助手'}</span>
                            <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>

                          {/* Content */}
                          {isUser ? (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          ) : (
                            <div className="space-y-3">
                              <MarkdownView content={msg.content} />

                              {/* Assistant Extra Meta (Tokens & Sources) */}
                              <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
                                {msg.tokens_used ? (
                                  <span className="flex items-center gap-1 font-mono">
                                    <Hash className="size-3" /> {msg.tokens_used} tokens
                                  </span>
                                ) : <span />}

                                {citations.length > 0 && (
                                  <span className="flex items-center gap-1 text-emerald-700 font-medium">
                                    <BookOpen className="size-3" /> 检索到 {citations.length} 处知识库引用
                                  </span>
                                )}
                              </div>

                              {/* Expandable Citation Cards */}
                              {citations.length > 0 && (
                                <details className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50/70 p-2 text-xs">
                                  <summary className="cursor-pointer font-medium text-neutral-700 hover:text-indigo-600 flex items-center justify-between">
                                    <span>查阅召回文档片段证据 ({citations.length})</span>
                                    <span className="text-[10px] text-neutral-500">点击展开</span>
                                  </summary>
                                  <div className="mt-2 space-y-2 pt-2 border-t border-neutral-200">
                                    {citations.map((c) => (
                                      <div
                                        key={c.number}
                                        className="rounded-md border border-neutral-200 bg-white p-2.5 text-xs space-y-1"
                                      >
                                        <div className="flex items-center justify-between font-semibold text-neutral-800">
                                          <span className="truncate">
                                            [{c.number}] {c.source.document_title}
                                          </span>
                                          {c.source.similarity !== undefined && (
                                            <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-mono">
                                              相似度: {(c.source.similarity * 100).toFixed(1)}%
                                            </span>
                                          )}
                                        </div>
                                        {c.source.text_snippet && (
                                          <p className="text-neutral-600 text-[11px] line-clamp-3 bg-neutral-50 p-1.5 rounded">
                                            {c.source.text_snippet}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-400">
              <div className="size-12 rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-400 mb-3">
                <MessageSquare className="size-6" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-800">未选择会话</h3>
              <p className="mt-1 text-xs text-neutral-500 max-w-xs">
                请在左侧列表中点击选择任意成员的历史会话，以调阅完整的问答流程、语义召回证据与 Token 统计。
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default SessionReview;

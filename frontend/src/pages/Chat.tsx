import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { fetchSSE } from '../api/sse';
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Square,
  Bot,
  User as UserIcon,
  Sparkles,
  Wrench,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface ChatSession {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface CitationSource {
  document_id: string;
  document_title: string;
  chunk_index: number;
  page_number?: number | null;
  similarity: number;
  text_snippet: string;
}

interface ToolCallState {
  tool: string;
  args: any;
  result?: any;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  context_citations?: CitationSource[] | null;
  toolCalls?: ToolCallState[];
  created_at?: string;
  isStreaming?: boolean;
}

interface KnowledgeBase {
  id: string;
  name: string;
}

export const Chat: React.FC = () => {
  const { currentOrg, currentWorkspace } = useAuth();

  // Sessions
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Config & Knowledge bases
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [enableAgent, setEnableAgent] = useState(false);
  const [topK, setTopK] = useState(5);
  const [minSimilarity, setMinSimilarity] = useState(0.3);
  const [showConfig, setShowConfig] = useState(false);

  // Expanded Citation Snippet index map: `${msgIndex}-${citeIndex}` -> boolean
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load Sessions & Knowledge Bases when workspace changes
  useEffect(() => {
    if (currentOrg && currentWorkspace) {
      loadSessions();
      loadKnowledgeBases();
    }
  }, [currentOrg, currentWorkspace]);

  // Load Messages when session changes
  useEffect(() => {
    if (currentOrg && currentWorkspace && currentSessionId) {
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId]);

  const loadSessions = async () => {
    if (!currentOrg || !currentWorkspace) return;
    setLoadingSessions(true);
    try {
      const res = await apiClient.get<ChatSession[]>(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/chat/sessions`
      );
      setSessions(res.data);
      if (res.data.length > 0 && !currentSessionId) {
        setCurrentSessionId(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to load chat sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadKnowledgeBases = async () => {
    if (!currentOrg || !currentWorkspace) return;
    try {
      const res = await apiClient.get<KnowledgeBase[]>(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases`
      );
      setKnowledgeBases(res.data);
    } catch (err) {
      console.error('Failed to load knowledge bases', err);
    }
  };

  const loadMessages = async (sessionId: string) => {
    if (!currentOrg || !currentWorkspace) return;
    try {
      const res = await apiClient.get<Message[]>(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/chat/sessions/${sessionId}/messages`
      );
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  };

  const handleCreateSession = async () => {
    if (!currentOrg || !currentWorkspace) return;
    try {
      const res = await apiClient.post<ChatSession>(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/chat/sessions`,
        { title: `新会话 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }
      );
      setSessions([res.data, ...sessions]);
      setCurrentSessionId(res.data.id);
    } catch (err) {
      console.error('Failed to create session', err);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!currentOrg || !currentWorkspace) return;
    if (!window.confirm('确定要删除该对话会话及所有历史记录吗？')) return;

    try {
      await apiClient.delete(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/chat/sessions/${sessionId}`
      );
      const updated = sessions.filter((s) => s.id !== sessionId);
      setSessions(updated);
      if (currentSessionId === sessionId) {
        setCurrentSessionId(updated.length > 0 ? updated[0].id : null);
      }
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputContent.trim() || isStreaming || !currentOrg || !currentWorkspace) return;

    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      // Create session automatically if none exists
      try {
        const newSessionRes = await apiClient.post<ChatSession>(
          `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/chat/sessions`,
          { title: inputContent.slice(0, 30) }
        );
        targetSessionId = newSessionRes.data.id;
        setSessions([newSessionRes.data, ...sessions]);
        setCurrentSessionId(targetSessionId);
      } catch {
        alert('无法创建对话会话');
        return;
      }
    }

    const userText = inputContent.trim();
    setInputContent('');

    // Add user message to UI
    const userMsg: Message = { role: 'user', content: userText };
    // Prepare initial assistant message placeholder
    const assistantMsgPlaceholder: Message = {
      role: 'assistant',
      content: '',
      isStreaming: true,
      context_citations: [],
      toolCalls: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsgPlaceholder]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const streamUrl = `/api/v1/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/chat/sessions/${targetSessionId}/stream`;

    const payload = {
      content: userText,
      knowledge_base_ids: selectedKbIds.length > 0 ? selectedKbIds : undefined,
      top_k: topK,
      min_similarity: minSimilarity,
      enable_agent: enableAgent,
    };

    let accumulatedTokens = '';
    let citations: CitationSource[] = [];
    const activeToolCalls: ToolCallState[] = [];

    await fetchSSE(streamUrl, {
      body: payload,
      signal: controller.signal,
      onEvent: (event) => {
        if (event.event === 'context') {
          if (Array.isArray(event.data)) {
            citations = event.data;
          }
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              last.context_citations = citations;
            }
            return next;
          });
        } else if (event.event === 'token') {
          accumulatedTokens += typeof event.data === 'string' ? event.data : '';
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              last.content = accumulatedTokens;
            }
            return next;
          });
        } else if (event.event === 'tool_call') {
          activeToolCalls.push({
            tool: event.data.tool,
            args: event.data.args,
          });
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              last.toolCalls = [...activeToolCalls];
            }
            return next;
          });
        } else if (event.event === 'tool_result') {
          const match = activeToolCalls.find((t) => t.tool === event.data.tool && !t.result);
          if (match) {
            match.result = event.data.result;
          } else {
            activeToolCalls.push({
              tool: event.data.tool,
              args: {},
              result: event.data.result,
            });
          }
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              last.toolCalls = [...activeToolCalls];
            }
            return next;
          });
        } else if (event.event === 'message') {
          // Final assistant message persisted from backend
          if (event.data?.content) {
            accumulatedTokens = event.data.content;
          }
        }
      },
      onError: (err) => {
        console.error('SSE Stream Error', err);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            last.content = last.content
              ? `${last.content}\n\n[回答异常中断: ${err.message || '网络连接错误'}]`
              : `[回答异常: ${err.message || '请求失败'}]`;
            last.isStreaming = false;
          }
          return next;
        });
        setIsStreaming(false);
      },
      onDone: () => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            last.isStreaming = false;
          }
          return next;
        });
        setIsStreaming(false);
      },
    });
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          last.isStreaming = false;
        }
        return next;
      });
    }
  };

  const toggleCitationExpand = (key: string) => {
    setExpandedCitations((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Session Drawer / Sidebar */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <MessageSquare className="w-4 h-4 text-orange-600" />
            <span>历史会话</span>
          </div>
          <button
            onClick={handleCreateSession}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            新会话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingSessions ? (
            <div className="p-4 text-center text-xs text-slate-400">加载会话中...</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">暂无会话，点击右上角新建</div>
          ) : (
            sessions.map((s) => {
              const isSelected = s.id === currentSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => setCurrentSessionId(s.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-orange-500/10 text-orange-950 font-medium border border-orange-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="truncate flex-1 pr-2">
                    <p className="truncate font-medium">{s.title}</p>
                    <span className="text-[10px] text-slate-400">
                      {new Date(s.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition p-1"
                    title="删除会话"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Top Control Bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-800 text-sm">
              {sessions.find((s) => s.id === currentSessionId)?.title || '智能问答助手'}
            </span>
            {enableAgent ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-600" />
                Agent 增强模式已开启
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                标准精准 RAG 模式
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                showConfig
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              检索与智能体参数
            </button>
          </div>
        </div>

        {/* Config Dropdown Drawer */}
        {showConfig && (
          <div className="bg-slate-900 text-slate-200 border-b border-slate-800 px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs animate-in slide-in-from-top-2">
            <div>
              <label className="font-semibold block mb-1.5 text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                自主 Agent 工具调用 (Multi-turn ReAct)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enable-agent-check"
                  checked={enableAgent}
                  onChange={(e) => setEnableAgent(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="enable-agent-check" className="text-slate-300 cursor-pointer">
                  允许模型自主调度多步检索与工单提交工具
                </label>
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1.5 text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-orange-400" />
                指定关联知识库
              </label>
              <select
                multiple
                value={selectedKbIds}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions, (option) => option.value);
                  setSelectedKbIds(opts);
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-slate-200 text-xs focus:outline-none focus:border-orange-500"
              >
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">按住 Ctrl/Cmd 可多选，默认检索当前工作区全部库</span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span>Top-K 召回块数量: {topK}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span>最小余弦相似度: {minSimilarity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.9"
                  step="0.05"
                  value={minSimilarity}
                  onChange={(e) => setMinSimilarity(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Message Stream Display Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 shadow-sm">
                <Bot className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">开始企业知识库安全交互</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                输入您的业务问题。底层已具备跨租户绝对安全隔离、上下文注入防范、严苛余弦向量相似度召回以及多步 Agent 工具调用能力。
              </p>
            </div>
          ) : (
            messages.map((msg, msgIdx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msgIdx}
                  className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                      <Bot className="w-5 h-5" />
                    </div>
                  )}

                  <div className={`max-w-2xl space-y-3 ${isUser ? 'items-end' : 'items-start'}`}>
                    {/* Tool Calls Bubble (Agent events) */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-2 mb-2">
                        {msg.toolCalls.map((t, tidx) => (
                          <div
                            key={tidx}
                            className="bg-purple-50/80 border border-purple-200 rounded-lg p-3 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-purple-900 font-semibold">
                              <span className="flex items-center gap-1.5">
                                <Wrench className="w-3.5 h-3.5 text-purple-600" />
                                正在执行工具: <code className="bg-purple-100 px-1 py-0.5 rounded">{t.tool}</code>
                              </span>
                              {t.result ? (
                                <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> 已完成
                                </span>
                              ) : (
                                <span className="text-[11px] text-purple-500 animate-pulse">执行中...</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 bg-white/70 p-2 rounded font-mono break-all border border-purple-100">
                              参数: {JSON.stringify(t.args)}
                            </div>
                            {t.result && (
                              <div className="text-[11px] text-slate-700 bg-purple-100/50 p-2 rounded font-mono break-all">
                                结果: {JSON.stringify(t.result).slice(0, 200)}
                                {JSON.stringify(t.result).length > 200 ? '...' : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Main Message Bubble */}
                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? 'bg-orange-600 text-white rounded-tr-none shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-xs'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      {msg.isStreaming && (
                        <span className="inline-block w-2 h-4 ml-1 bg-orange-500 animate-pulse align-middle" />
                      )}
                    </div>

                    {/* Citations Badges & Drawer */}
                    {!isUser && msg.context_citations && msg.context_citations.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                          <BookOpen className="w-3 h-3 text-orange-500" />
                          <span>精准引用证据源 ({msg.context_citations.length} 处):</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.context_citations.map((cite, cIdx) => {
                            const expandKey = `${msgIdx}-${cIdx}`;
                            const isExpanded = !!expandedCitations[expandKey];

                            return (
                              <div
                                key={cIdx}
                                className="border border-slate-200 bg-white rounded-lg p-2 text-xs shadow-2xs max-w-sm space-y-1"
                              >
                                <div
                                  onClick={() => toggleCitationExpand(expandKey)}
                                  className="flex items-center justify-between gap-3 cursor-pointer hover:text-orange-600"
                                >
                                  <span className="font-semibold text-slate-800 truncate flex-1">
                                    [{cIdx + 1}] {cite.document_title}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-700 font-mono font-bold flex-shrink-0">
                                    {(cite.similarity * 100).toFixed(0)}% 相似度
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </div>

                                {isExpanded && (
                                  <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 bg-slate-50 p-2 rounded">
                                    <p className="line-clamp-6 leading-relaxed italic font-serif">
                                      &ldquo;{cite.text_snippet}&rdquo;
                                    </p>
                                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                                      <span>Chunk #{cite.chunk_index}</span>
                                      {cite.page_number && <span>页码: {cite.page_number}</span>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                      <UserIcon className="w-5 h-5" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Box */}
        <div className="bg-white border-t border-slate-200 p-4">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-3">
            <textarea
              rows={2}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="向知识库提问，或指示自主 Agent 完成多步检索（Enter 发送，Shift+Enter 换行）..."
              className="flex-1 p-3 text-sm border border-slate-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />

            <div className="flex flex-col justify-end">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopStream}
                  className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm transition"
                >
                  <Square className="w-4 h-4 fill-current" />
                  停止
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputContent.trim()}
                  className="px-5 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  发送
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

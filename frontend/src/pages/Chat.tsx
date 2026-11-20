import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { ChatResources, type ChatKnowledgeBase } from '../components/ChatResources';
import { getChatSources } from '../utils/chatSources';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { fetchSSE } from '../api/sse';
import { MarkdownView } from '../components/MarkdownView';
import {
  MessageSquare,
  Plus,
  Trash2,
  Square,
  Bot,
  Sparkles,
  Wrench,
  BookOpen,
  ChevronDown,
  Sliders,
  CheckCircle2,
  Cpu,
  PanelRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface ChatSession {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

const SESSION_PAGE_SIZE = 20;

interface ToolCallState {
  id?: string;
  tool: string;
  args: any;
  result?: any;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  context_citations?: unknown[] | null;
  toolCalls?: ToolCallState[];
  created_at?: string;
  isStreaming?: boolean;
  interruption?: { message: string; retryable?: boolean };
}

export const Chat: React.FC = () => {
  const { currentOrg, currentWorkspace } = useAuth();
  return <ChatWorkspace key={`${currentOrg?.id}/${currentWorkspace?.id}`} />;
};

function ChatWorkspace() {
  const { user, currentOrg, currentWorkspace, isOwnerOrAdmin } = useAuth();
  const { chatNavigation, closeNavigation } = useOutletContext<{
    chatNavigation: HTMLDivElement | null;
    closeNavigation: () => void;
  }>();
  const workspacePath = currentOrg && currentWorkspace?.organization_id === currentOrg.id
    ? `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}`
    : null;

  // Sessions
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'more' | 'complete' | 'error'>(
    workspacePath ? 'loading' : 'complete',
  );
  const [historyRevision, setHistoryRevision] = useState(0);
  const historyRequestRef = useRef<AbortController | null>(null);
  const historyMutationRef = useRef<AbortController | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionError, setSessionError] = useState<'forbidden' | 'unavailable' | null>(null);
  const [messageRequestVersion, setMessageRequestVersion] = useState(0);
  const [sendError, setSendError] = useState('');

  // Config & Knowledge bases
  const [knowledgeBases, setKnowledgeBases] = useState<ChatKnowledgeBase[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [enableAgent, setEnableAgent] = useState(false);
  const [modelOption, setModelOption] = useState('');
  const [customModel, setCustomModel] = useState('');
  const model = modelOption === 'custom' ? customModel.trim() : modelOption;
  const customModelMissing = modelOption === 'custom' && !model;
  const [topK, setTopK] = useState(5);
  const [minSimilarity, setMinSimilarity] = useState(0.3);
  const [showConfig, setShowConfig] = useState(false);

  const [answerIndex, setAnswerIndex] = useState<number | null>(null);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const answer = answerIndex === null ? undefined : messages[answerIndex];
  const sources = answer ? getChatSources(answer.content, answer.context_citations) : [];

  const transcriptRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const jumpToLatest = () => {
    followLatest.current = true;
    setShowJumpToLatest(false);
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  };

  const trackReadingPosition = (transcript: HTMLDivElement) => {
    const atBottom = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 64;
    followLatest.current = atBottom;
    setShowJumpToLatest(!atBottom);
  };

  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (followLatest.current && transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!showSources || activeCitation === null) return;
    const card = document.getElementById(`chat-source-${activeCitation}`);
    card?.scrollIntoView({ block: 'nearest' });
    card?.focus({ preventScroll: true });
  }, [showSources, resourcesOpen, answerIndex, activeCitation]);

  useEffect(() => {
    if (!workspacePath || historyStatus !== 'loading' || historyMutationRef.current) return;
    const controller = new AbortController();
    historyRequestRef.current = controller;
    apiClient.get<ChatSession[]>(`${workspacePath}/chat/sessions`, {
      params: { offset: sessions.length, limit: SESSION_PAGE_SIZE + 1 },
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const page = data.slice(0, SESSION_PAGE_SIZE);
        setSessions((prev) => {
          const loadedIds = new Set(prev.map((session) => session.id));
          return [...prev, ...page.filter((session) => !loadedIds.has(session.id))];
        });
        setHistoryStatus(data.length > SESSION_PAGE_SIZE ? 'more' : 'complete');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load chat sessions', err);
        setHistoryStatus('error');
      });

    return () => {
      controller.abort();
      historyRequestRef.current = null;
    };
  }, [workspacePath, historyStatus, sessions.length, historyRevision]);

  useEffect(() => {
    if (!workspacePath) return;
    const controller = new AbortController();
    apiClient.get<ChatKnowledgeBase[]>(`${workspacePath}/knowledge-bases`, { signal: controller.signal })
      .then(({ data }) => setKnowledgeBases(data))
      .catch((err) => {
        if (!controller.signal.aborted) console.error('Failed to load knowledge bases', err);
      });

    return () => {
      controller.abort();
      historyMutationRef.current?.abort();
      requestRef.current?.abort();
    };
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath || !currentSessionId || requestRef.current) return;
    const controller = new AbortController();

    apiClient.get<Message[]>(`${workspacePath}/chat/sessions/${currentSessionId}/messages`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setMessages(data);
        const lastAnswer = data.findLastIndex((message) => message.role === 'assistant');
        if (lastAnswer >= 0) {
          setAnswerIndex(lastAnswer);
          setShowSources(true);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSessionError(err.response?.status === 403 ? 'forbidden' : 'unavailable');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMessages(false);
      });

    return () => controller.abort();
  }, [workspacePath, currentSessionId, messageRequestVersion]);

  const retryMessages = () => {
    if (sessionError !== 'unavailable') return;
    setSessionError(null);
    setLoadingMessages(true);
    setMessageRequestVersion((version) => version + 1);
  };

  const selectSession = (sessionId: string | null) => {
    if (requestRef.current) return;
    if (sessionId === currentSessionId) {
      retryMessages();
      return;
    }
    jumpToLatest();
    setCurrentSessionId(sessionId);
    setLoadingMessages(sessionId !== null);
    setSessionError(null);
    setSendError('');
    setMessages([]);
    setAnswerIndex(null);
    setActiveCitation(null);
    setShowSources(false);
    setResourcesOpen(false);
  };

  const showCitation = (messageIndex: number, citationNumber: number) => {
    setAnswerIndex(messageIndex);
    setActiveCitation(citationNumber);
    setShowSources(true);
    setResourcesOpen(true);
    const card = document.getElementById(`chat-source-${citationNumber}`);
    if (showSources && answerIndex === messageIndex) {
      card?.scrollIntoView({ block: 'nearest' });
      card?.focus({ preventScroll: true });
    }
  };

  const startHistoryMutation = (controller: AbortController) => {
    historyMutationRef.current = controller;
    // A create or delete shifts the server offsets. Resume the page after the change settles.
    historyRequestRef.current?.abort();
  };

  const finishHistoryMutation = () => {
    historyMutationRef.current = null;
    setHistoryRevision((revision) => revision + 1);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!workspacePath || requestRef.current || historyMutationRef.current) return;
    if (!window.confirm('确定要删除该对话会话及所有历史记录吗？')) return;

    const controller = new AbortController();
    startHistoryMutation(controller);
    setDeletingSession(true);
    try {
      await apiClient.delete(
        `${workspacePath}/chat/sessions/${sessionId}`, { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        selectSession(null);
      }
    } catch (err) {
      if (!controller.signal.aborted) console.error('Failed to delete session', err);
    } finally {
      setDeletingSession(false);
      finishHistoryMutation();
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const userText = inputContent.trim();
    if (!userText || customModelMissing || requestRef.current || historyMutationRef.current || loadingMessages || sessionError || !workspacePath) return;

    setSendError('');
    const controller = new AbortController();
    requestRef.current = controller;
    setIsStreaming(true);
    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      startHistoryMutation(controller);
      try {
        const { data } = await apiClient.post<ChatSession>(
          `${workspacePath}/chat/sessions`,
          { title: userText.slice(0, 30) },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        targetSessionId = data.id;
        setSessions((prev) => [data, ...prev]);
        setCurrentSessionId(targetSessionId);
      } catch {
        if (controller.signal.aborted) return;
        requestRef.current = null;
        setIsStreaming(false);
        setSendError('无法创建对话，问题已保留。请重新发送。');
        return;
      } finally {
        finishHistoryMutation();
      }
    }

    const responseIndex = messages.length + 1;
    jumpToLatest();
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
    const streamUrl = `/api/v1${workspacePath}/chat/sessions/${targetSessionId}/stream`;

    const payload = {
      content: userText,
      knowledge_base_ids: selectedKbIds.length > 0 ? selectedKbIds : undefined,
      top_k: topK,
      min_similarity: minSimilarity,
      enable_agent: enableAgent,
      model: model || undefined,
    };

    let accumulatedTokens = '';
    let citations: unknown[] = [];
    const activeToolCalls: ToolCallState[] = [];
    const interruptAnswer = (message: string) => {
      if (controller.signal.aborted) return;
      setMessages((prev) => prev.map((item, index) =>
        index === responseIndex && item.isStreaming
          ? { ...item, isStreaming: false, interruption: { message, retryable: true } }
          : item,
      ));
    };

    await fetchSSE(streamUrl, {
      body: payload,
      signal: controller.signal,
      onEvent: (event) => {
        if (controller.signal.aborted) return;
        if (event.event === 'context') {
          const incoming = Array.isArray(event.data) ? event.data : event.data?.citations;
          if (Array.isArray(incoming)) citations = incoming;
        } else if (event.event === 'token') {
          const tokenStr =
            typeof event.data === 'string'
              ? event.data
              : typeof event.data?.token === 'string'
              ? event.data.token
              : '';
          if (tokenStr) {
            accumulatedTokens += tokenStr;
            const content = accumulatedTokens;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = { ...last, content };
              }
              return next;
            });
          }
        } else if (event.event === 'tool_call') {
          const callId = event.data?.tool_call_id || event.data?.id || '';
          const toolName = event.data?.name || event.data?.tool || '';
          const toolArgs = event.data?.arguments ?? event.data?.args ?? {};
          activeToolCalls.push({
            id: callId,
            tool: toolName,
            args: toolArgs,
          });
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, toolCalls: [...activeToolCalls] };
            }
            return next;
          });
        } else if (event.event === 'tool_result') {
          const callId = event.data?.tool_call_id || event.data?.id;
          const toolName = event.data?.name || event.data?.tool;
          const toolOutput = event.data?.output ?? event.data?.result;
          const match = activeToolCalls.find(
            (t) => (callId && t.id === callId) || (t.tool === toolName && !t.result)
          );
          if (match) {
            activeToolCalls[activeToolCalls.indexOf(match)] = { ...match, result: toolOutput };
          } else {
            activeToolCalls.push({
              id: callId,
              tool: toolName,
              args: {},
              result: toolOutput,
            });
          }
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, toolCalls: [...activeToolCalls] };
            }
            return next;
          });
        } else if (event.event === 'message') {
          // Final assistant message persisted from backend
          if (event.data?.role && event.data.role !== 'assistant') return;
          if (typeof event.data?.content !== 'string' && !event.data?.id) return;
          if (typeof event.data?.content === 'string') {
            accumulatedTokens = event.data.content;
          }
          if (event.data?.context_citations && Array.isArray(event.data.context_citations)) {
            citations = event.data.context_citations;
          }
          const finalContent = accumulatedTokens;
          const finalCitations = citations;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                id: event.data?.id || last.id,
                content: finalContent,
                context_citations: finalCitations,
                isStreaming: false,
              };
            }
            return next;
          });
          setAnswerIndex(responseIndex);
          setActiveCitation(null);
          setShowSources(true);
          setSessions((prev) => prev.map((session) =>
            session.id === targetSessionId && session.title === '新建对话'
              ? { ...session, title: userText.slice(0, 30) }
              : session,
          ));
        }
      },
      onError: (err) => interruptAnswer(err.message),
      onDone: () => interruptAnswer('回答结束，但服务未返回完整内容。'),
    });
    if (requestRef.current === controller) {
      requestRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleStopStream = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setIsStreaming(false);
    setMessages((prev) => prev.map((message, index) =>
      index === prev.length - 1 && message.isStreaming
        ? { ...message, isStreaming: false, interruption: { message: '已停止回答。' } }
        : message,
    ));
  };

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-white">
      {chatNavigation && createPortal(
        <section className="space-y-2 border-t border-neutral-200 p-3">
          <button type="button" disabled={isStreaming || deletingSession || !workspacePath} onClick={() => {
            selectSession(null);
            closeNavigation();
            inputRef.current?.focus();
          }} className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50">
            <Plus className="size-4" /> 新建对话
          </button>
          <button type="button" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
            <MessageSquare className="size-4" />
            <span className="flex-1 text-left">会话历史</span>
            <ChevronDown className={`size-4 ${showHistory ? 'rotate-180' : ''}`} />
          </button>
          {showHistory && (
            <div className="space-y-1">
              {isOwnerOrAdmin && <p className="px-3 text-xs text-neutral-600">包含成员会话</p>}
              {historyStatus === 'complete' && sessions.length === 0 &&
                <p className="px-3 py-2 text-xs text-neutral-600">暂无会话</p>}
              {sessions.map((session) => (
                <div key={session.id} className={`flex items-center rounded-lg ${session.id === currentSessionId ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-neutral-100'}`}>
                  <button type="button" aria-current={session.id === currentSessionId} disabled={isStreaming || deletingSession} onClick={() => {
                    selectSession(session.id);
                    closeNavigation();
                  }} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm disabled:opacity-60">
                    {session.title}
                    {isOwnerOrAdmin && session.user_id && session.user_id !== user?.id && <span className="ml-1.5 text-xs text-neutral-600">成员</span>}
                  </button>
                  <button type="button" disabled={isStreaming || deletingSession} onClick={(e) => handleDeleteSession(e, session.id)} title="删除会话"
                    className="mr-1 rounded p-2 text-neutral-500 hover:text-red-700 disabled:opacity-50">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {historyStatus === 'loading' && (
                <p role="status" className="px-3 py-2 text-xs text-neutral-600">
                  {sessions.length ? '正在加载更多会话…' : '正在加载会话…'}
                </p>
              )}
              {historyStatus === 'error' && (
                <p role="status" className="px-3 py-2 text-xs text-neutral-600">无法加载会话历史。</p>
              )}
              {(historyStatus === 'more' || historyStatus === 'error') && (
                <button type="button" disabled={deletingSession} onClick={() => setHistoryStatus('loading')}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                  {historyStatus === 'error' ? '重试加载会话' : '加载更多会话'}
                </button>
              )}
            </div>
          )}
        </section>,
        chatNavigation,
      )}

      <section aria-label="AI 问答" className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-15 shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{sessions.find((session) => session.id === currentSessionId)?.title || '新建对话'}</h1>
            {currentWorkspace && <p className="truncate text-xs text-neutral-600">{currentWorkspace.name}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {enableAgent && <span className="hidden text-xs font-medium text-indigo-700 sm:inline">Agent</span>}
            <button type="button" aria-expanded={showConfig} aria-label="检索与模型参数"
              onClick={() => setShowConfig(!showConfig)} className="rounded-lg border border-neutral-200 p-2 text-neutral-700 hover:bg-neutral-100">
              <Sliders className="size-4" />
            </button>
            <button type="button" aria-expanded={resourcesOpen} aria-controls="chat-resources"
              onClick={() => setResourcesOpen(!resourcesOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-2 text-xs font-medium hover:bg-neutral-100 lg:hidden">
              <PanelRight className="size-4" /> {showSources ? `来源 (${sources.length})` : '资料'}
            </button>
          </div>
        </header>
        <span className="sr-only" role="status">
          {answer && `回答来源 ${sources.length} 条`}
        </span>

        {/* Config Dropdown Drawer */}
        {showConfig && (
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-neutral-200 bg-neutral-50 px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            <div className="space-y-3">
              <div>
                <label className="font-semibold block mb-1.5 text-neutral-700 flex items-center gap-1.5">
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
                  <label htmlFor="enable-agent-check" className="text-neutral-700 cursor-pointer">
                    允许模型自主调度多步检索与工单提交工具
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="chat-model" className="font-semibold block mb-1 text-neutral-700 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-700" />
                  运行模型
                </label>
                <div className="flex flex-wrap gap-2">
                  <select
                    id="chat-model"
                    value={modelOption}
                    onChange={(e) => setModelOption(e.target.value)}
                    className="bg-white border border-neutral-300 rounded px-2.5 py-1.5 text-neutral-800 text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">默认 (环境变量配置)</option>
                    <option value="qwen2.5:1.5b">qwen2.5:1.5b (本地极速测试)</option>
                    <option value="qwen2.5:3b">qwen2.5:3b (本地均衡推荐)</option>
                    <option value="qwen2.5:7b">qwen2.5:7b (本地强力通用)</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="deepseek-chat">deepseek-chat</option>
                    <option value="custom">自定义输入名称...</option>
                  </select>
                  {modelOption === 'custom' && (
                    <input
                      type="text"
                      aria-label="自定义模型名称"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="请输入模型名称"
                      className="min-w-36 flex-1 bg-white border border-neutral-300 rounded px-2 py-1 text-neutral-800 text-xs focus:outline-none focus:border-blue-500"
                    />
                  )}
                </div>
              </div>
            </div>

            <fieldset disabled={enableAgent} className="space-y-3 disabled:opacity-60">
              {enableAgent && <legend className="mb-2 text-neutral-600">以下参数仅用于普通问答</legend>}
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
                  className="w-full accent-indigo-600"
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
                  className="w-full accent-indigo-600"
                />
              </div>
            </fieldset>
          </div>
        )}

        <div
          id="chat-transcript"
          ref={transcriptRef}
          onScroll={(event) => trackReadingPosition(event.currentTarget)}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"
        >
          <div className="mx-auto max-w-3xl space-y-6">
          {loadingMessages ? (
            <p role="status" className="text-sm text-neutral-600">正在加载对话…</p>
          ) : sessionError ? (
            <div className="space-y-2 text-sm">
              <p role="status" className="text-neutral-600">
                {sessionError === 'forbidden' ? '您无权查阅此对话。' : '无法加载对话，请重试。'}
              </p>
              {sessionError === 'unavailable' && (
                <button type="button" onClick={retryMessages} className="font-medium text-indigo-700 hover:underline">
                  重试加载对话
                </button>
              )}
            </div>
          ) : messages.length === 0 ? (
            <div className="pt-8 sm:pt-16">
              <span className="mb-5 inline-flex rounded-2xl bg-indigo-50 p-3 text-indigo-700"><Sparkles className="size-6" /></span>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">今天想了解什么？</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-600">
                {workspacePath ? '向工作区的知识库提问，查看相关文档和引用片段。' : '选择一个工作区后，即可开始提问。'}
              </p>
            </div>
          ) : (
            messages.map((msg, msgIdx) => {
              const isUser = msg.role === 'user';
              const messageSources = isUser ? [] : getChatSources(msg.content, msg.context_citations);
              return (
                <div
                  key={msg.id || msgIdx}
                  className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-700 shrink-0">
                      <Bot className="w-5 h-5" />
                    </div>
                  )}

                  <div
                    className={`min-w-0 max-w-full space-y-3 wrap-break-word ${
                      isUser
                        ? 'bg-neutral-100 text-neutral-900 rounded-2xl px-4 py-3'
                        : 'flex-1 py-1 text-neutral-800'
                    }`}
                  >
                    {/* Tool Calls Accordion in Agent mode */}
                    {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-2 mb-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded w-fit">
                          <Wrench className="w-3.5 h-3.5" />
                          <span>Agent 调度工具执行轨迹:</span>
                        </div>
                        {msg.toolCalls.map((tc, idx) => (
                          <div
                            key={idx}
                            className="text-xs border border-purple-100 bg-purple-50/50 rounded-lg p-2.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between font-mono font-bold text-purple-900">
                              <span>🛠️ 工具: {tc.tool}</span>
                              {tc.result ? (
                                <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-sans">
                                  <CheckCircle2 className="w-3 h-3" />
                                  执行完成
                                </span>
                              ) : (
                                <span className="text-[10px] text-purple-600 animate-pulse font-sans">
                                  调用执行中...
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] bg-white/80 p-1.5 rounded border border-purple-100/60 font-mono text-slate-600 truncate">
                              入参: {JSON.stringify(tc.args)}
                            </div>
                            {tc.result && (
                              <div className="text-[11px] bg-white/90 p-1.5 rounded border border-slate-200 text-slate-700">
                                <span className="font-semibold text-slate-500 block mb-0.5">观察反馈 (Observation):</span>
                                <p className="line-clamp-3 italic">
                                  {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result)}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Message Body with Markdown formatting */}
                    {msg.content ? (
                      <MarkdownView
                        content={msg.content}
                        citationNumbers={new Set(messageSources.map(({ number }) => number))}
                        onCitationClick={isUser ? undefined : (number) => showCitation(msgIdx, number)}
                      />
                    ) : (
                      <div className="text-sm text-slate-400 italic">
                        {msg.isStreaming ? '正在思考中...' : ''}
                      </div>
                    )}
                    {msg.interruption && (
                      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        <p role="status">{msg.interruption.message}</p>
                        {msg.interruption.retryable && messages[msgIdx - 1]?.role === 'user' && (
                          <button
                            type="button"
                            disabled={!!inputContent || isStreaming}
                            onClick={() => {
                              setInputContent(messages[msgIdx - 1].content);
                              inputRef.current?.focus();
                            }}
                            className="mt-1 text-xs font-medium text-indigo-700 hover:underline disabled:text-neutral-500"
                          >
                            将问题放回输入框
                          </button>
                        )}
                      </div>
                    )}

                    {messageSources.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1.5">
                        {messageSources.map(({ number, source }) => (
                          <button type="button" key={number} onClick={() => showCitation(msgIdx, number)}
                            className="max-w-full truncate rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700 hover:border-indigo-300 hover:text-indigo-700">
                            [{number}] {source.document_title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>

        <div className="relative shrink-0 px-4 pb-5 pt-2 sm:px-8">
          {showJumpToLatest && (
            <button type="button" onClick={jumpToLatest}
              className="absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-sm hover:bg-neutral-100">
              <ArrowDown className="size-3.5" aria-hidden="true" /> 跳到最新消息
            </button>
          )}
          {customModelMissing && !showConfig && (
            <p role="status" className="mx-auto mb-2 max-w-3xl text-sm text-neutral-600">请在检索与模型参数中填写模型名称。</p>
          )}
          {sendError && <p role="alert" className="mx-auto mb-2 max-w-3xl text-sm text-red-700">{sendError}</p>}
          <form onSubmit={handleSendMessage} className="mx-auto max-w-3xl rounded-2xl border border-neutral-300 bg-white p-3 shadow-xs focus-within:border-indigo-400">
            <textarea
              aria-label="输入问题"
              ref={inputRef}
              rows={2}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="向知识库提问…"
              className="block w-full resize-none px-1 py-1.5 text-sm leading-relaxed outline-none"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <details className="relative min-w-0">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
                  <BookOpen className="size-4 shrink-0" />
                  <span className="truncate">
                    {selectedKbIds.length === 0 ? '全部知识库'
                      : selectedKbIds.length === 1 ? knowledgeBases.find((kb) => kb.id === selectedKbIds[0])?.name
                      : `已选 ${selectedKbIds.length} 个知识库`}
                  </span>
                  <ChevronDown className="size-3 shrink-0" />
                </summary>
                <div className="absolute bottom-full left-0 z-10 mb-2 max-h-52 w-60 max-w-[75vw] space-y-2 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-3 text-xs shadow-lg">
                  {enableAgent && <p className="text-neutral-600">Agent 在此范围内自主检索。</p>}
                  <button type="button" onClick={() => setSelectedKbIds([])}
                    className="text-left font-medium text-indigo-700 hover:underline">检索全部知识库</button>
                  {knowledgeBases.map((kb) => (
                    <label key={kb.id} className="flex items-start gap-2">
                      <input type="checkbox" checked={selectedKbIds.includes(kb.id)}
                        onChange={(e) => setSelectedKbIds((ids) => e.target.checked ? [...ids, kb.id] : ids.filter((id) => id !== kb.id))}
                        className="accent-indigo-600" />
                      <span className="min-w-0 wrap-break-word">{kb.name}</span>
                    </label>
                  ))}
                </div>
              </details>
              {isStreaming ? (
                <button type="button" aria-label="停止回答" onClick={handleStopStream}
                  className="rounded-xl bg-neutral-900 p-2.5 text-white hover:bg-neutral-700">
                  <Square className="size-4 fill-current" />
                </button>
              ) : (
                <button type="submit" aria-label="发送问题" disabled={!inputContent.trim() || customModelMissing || !workspacePath || deletingSession || loadingMessages || !!sessionError}
                  className="rounded-xl bg-indigo-700 p-2.5 text-white hover:bg-indigo-800 disabled:bg-neutral-200 disabled:text-neutral-600">
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
      <ChatResources
        open={resourcesOpen}
        showSources={showSources}
        hasAnswer={!!answer}
        sources={sources}
        activeCitation={activeCitation}
        knowledgeBases={knowledgeBases}
        onClose={() => setResourcesOpen(false)}
        onTabChange={setShowSources}
        onExample={(question) => {
          setInputContent(question);
          setResourcesOpen(false);
          inputRef.current?.focus();
        }}
      />
    </div>
  );
}

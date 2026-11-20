import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import {
  FileText,
  Upload,
  UploadCloud,
  RefreshCw,
  Trash2,
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
  Layers,
  X,
  Files,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

export interface DocumentItem {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  status: string;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  page_number?: number;
}

interface UploadProgress {
  total: number;
  completed: number;
  currentName: string;
}

const statusFilters = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'failed', label: '处理失败' },
  { value: 'ready', label: '就绪' },
] as const;

type StatusFilter = (typeof statusFilters)[number]['value'];

const getStatusGroup = (status: string): Exclude<StatusFilter, 'all'> => {
  switch (status) {
    case 'UPLOADED': return 'pending';
    case 'FAILED': return 'failed';
    case 'READY': return 'ready';
    default: return 'processing';
  }
};

const processingLabels: Record<string, string> = {
  PARSING: '解析中',
  CHUNKING: '切块中',
  EMBEDDING: '生成向量中',
};

interface ReindexRequest {
  previousUpdatedAt: string;
  queuedAt?: number;
}

interface DocumentLoadScope {
  signal: AbortSignal;
  running: boolean;
  reloadAfterCurrent: boolean;
}

export const KnowledgeBaseDetail: React.FC = () => {
  const { id: kbId } = useParams<{ id: string }>();
  const { currentOrg, currentWorkspace, hasPermission } = useAuth();
  if (!currentOrg || !currentWorkspace || !kbId) return null;

  const documentsPath = `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases/${kbId}/documents`;
  return (
    <KnowledgeBaseDocuments
      key={documentsPath}
      kbId={kbId}
      documentsPath={documentsPath}
      canUpload={hasPermission('document:upload')}
      canDelete={hasPermission('document:delete')}
    />
  );
};

const KnowledgeBaseDocuments: React.FC<{
  kbId: string;
  documentsPath: string;
  canUpload: boolean;
  canDelete: boolean;
}> = ({ kbId, documentsPath, canUpload, canDelete }) => {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [reindexRequests, setReindexRequests] = useState(new Map<string, ReindexRequest>());
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadScope = useRef<DocumentLoadScope | null>(null);

  const fetchDocs = useCallback(async (afterMutation = false) => {
    const scope = loadScope.current;
    if (!scope || scope.signal.aborted) return;
    if (scope.running) {
      if (afterMutation) scope.reloadAfterCurrent = true;
      return;
    }

    scope.running = true;
    setIsRefreshing(true);
    try {
      do {
        scope.reloadAfterCurrent = false;
        try {
          const { data } = await apiClient.get<DocumentItem[]>(documentsPath, { signal: scope.signal });
          // A mutation completed during this request. Read a fresh snapshot before updating the list.
          if (scope.signal.aborted || scope.reloadAfterCurrent) continue;
          setDocuments(data);
          setLoadError(false);
          setReindexRequests((requests) => {
            if (!requests.size) return requests;
            const now = Date.now();
            const current = new Map(requests);
            for (const doc of data) {
              const request = current.get(doc.id);
              if (request?.queuedAt && (doc.updated_at !== request.previousUpdatedAt || now - request.queuedAt >= 10_000)) {
                current.delete(doc.id);
              }
            }
            return current.size === requests.size ? requests : current;
          });
        } catch (err) {
          if (scope.signal.aborted || scope.reloadAfterCurrent) continue;
          console.error('Failed to load documents', err);
          setLoadError(true);
        }
      } while (scope.reloadAfterCurrent && !scope.signal.aborted);
    } finally {
      scope.running = false;
      if (!scope.signal.aborted) setIsRefreshing(false);
    }
  }, [documentsPath]);

  useEffect(() => {
    const controller = new AbortController();
    loadScope.current = { signal: controller.signal, running: false, reloadAfterCurrent: false };
    void fetchDocs();
    return () => controller.abort();
  }, [fetchDocs]);

  const documentRows = documents?.map((doc) => {
    const status = reindexRequests.get(doc.id)?.queuedAt ? 'UPLOADED' : doc.status;
    return { doc, status, group: getStatusGroup(status) };
  }) ?? [];
  const statusCounts = { all: documentRows.length, pending: 0, processing: 0, failed: 0, ready: 0 };
  for (const { group } of documentRows) statusCounts[group]++;
  const visibleRows = statusFilter === 'all' ? documentRows : documentRows.filter(({ group }) => group === statusFilter);
  const hasProcessingDocs = statusCounts.pending > 0 || statusCounts.processing > 0;

  useEffect(() => {
    if (!hasProcessingDocs && !uploading) return;
    const timer = setInterval(() => fetchDocs(), 2500);
    return () => clearInterval(timer);
  }, [fetchDocs, hasProcessingDocs, uploading]);

  const uploadFiles = async (fileList: File[] | FileList) => {
    if (!canUpload) {
      alert('您当前的角色权限不支持上传文档');
      return;
    }
    const rawFiles = Array.from(fileList);
    // Filter out 0 byte files
    const validFiles = rawFiles.filter((f) => f.size > 0);

    if (validFiles.length === 0) {
      alert('请选择有效的非空文件上传');
      return;
    }
    const signal = loadScope.current?.signal;
    if (!signal || signal.aborted) return;

    setUploading(true);
    setUploadProgress({
      total: validFiles.length,
      completed: 0,
      currentName: validFiles[0].name,
    });

    let successCount = 0;
    const failedFiles: { name: string; reason: string }[] = [];

    // Concurrently upload up to 3 files at a time
    const CONCURRENCY = 3;
    let index = 0;

    const worker = async () => {
      while (index < validFiles.length) {
        const currentIndex = index++;
        const file = validFiles[currentIndex];

        if (!signal.aborted) {
          setUploadProgress((prev) => (prev ? { ...prev, currentName: file.name } : null));
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
          await apiClient.post(
            documentsPath,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
            }
          );
          successCount++;
          // Fetch immediately after each upload completes to show latest status in table
          if (!signal.aborted) void fetchDocs(true);
        } catch (err: any) {
          failedFiles.push({
            name: file.name,
            reason: err.response?.data?.detail || err.message || '上传处理失败',
          });
        } finally {
          if (!signal.aborted) {
            setUploadProgress((prev) =>
              prev ? { ...prev, completed: Math.min(prev.completed + 1, prev.total) } : null
            );
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, validFiles.length) }, () => worker());
    await Promise.all(workers);

    if (signal.aborted) return;
    setUploading(false);
    setUploadProgress(null);
    if (successCount === 0) void fetchDocs(true);

    if (failedFiles.length > 0) {
      alert(
        `批量上传完成：${successCount} 个文件成功，${failedFiles.length} 个文件失败。\n失败清单：\n` +
          failedFiles.map((f) => `- ${f.name}: ${f.reason}`).join('\n')
      );
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canUpload) return;
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canUpload) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!canUpload || uploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleReindex = async ({ id: docId, updated_at }: DocumentItem) => {
    if (!canUpload || reindexRequests.has(docId)) return;
    const signal = loadScope.current?.signal;
    if (!signal || signal.aborted) return;
    const request: ReindexRequest = { previousUpdatedAt: updated_at };
    setReindexRequests((requests) => new Map(requests).set(docId, request));
    try {
      await apiClient.post(`${documentsPath}/${docId}/reindex`);
      if (signal.aborted) return;
      // The endpoint returns before the background job updates the document status.
      setReindexRequests((requests) => requests.get(docId) === request
        ? new Map(requests).set(docId, { ...request, queuedAt: Date.now() })
        : requests);
      void fetchDocs(true);
    } catch (err: any) {
      if (signal.aborted) return;
      setReindexRequests((requests) => {
        const current = new Map(requests);
        current.delete(docId);
        return current;
      });
      alert(err.response?.data?.detail || '无法提交重处理请求，请稍后重试');
    }
  };

  const handleDelete = async (docId: string) => {
    if (!canDelete) return;
    if (!window.confirm('确认删除此文档并物理清理切块与向量？')) return;
    const signal = loadScope.current?.signal;
    if (!signal || signal.aborted) return;

    try {
      await apiClient.delete(`${documentsPath}/${docId}`);
      if (!signal.aborted) void fetchDocs(true);
    } catch (err: any) {
      if (!signal.aborted) alert(err.response?.data?.detail || '删除文档失败');
    }
  };

  const viewChunks = async (docId: string) => {
    const signal = loadScope.current?.signal;
    if (!signal || signal.aborted) return;
    setSelectedDocId(docId);
    setChunksLoading(true);
    try {
      const res = await apiClient.get(`${documentsPath}/${docId}`, { signal });
      if (!signal.aborted) setChunks(res.data.chunks || []);
    } catch (err) {
      if (!signal.aborted) console.error('Failed to load chunks', err);
    } finally {
      if (!signal.aborted) setChunksLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
            <CheckCircle className="w-3 h-3" /> 就绪
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200">
            <AlertTriangle className="w-3 h-3" /> 处理失败
          </span>
        );
      case 'UPLOADED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <Clock className="w-3 h-3" /> 待处理
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Loader2 className="w-3 h-3 motion-safe:animate-spin" /> {processingLabels[status] ?? `处理中 (${status})`}
          </span>
        );
    }
  };

  return (
    <div className="p-8 max-w-6xl w-full mx-auto space-y-6">
      {/* Hidden Multi-file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.md,.txt,.json,.csv"
        disabled={uploading || !canUpload}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            uploadFiles(e.target.files);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/knowledge-bases"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">知识库文档管理</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">KB ID: {kbId}</p>
          </div>
        </div>

        {/* Upload Button */}
        {canUpload ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium text-xs rounded-lg transition inline-flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{uploading ? '上传解析中...' : '上传文档 (可多选)'}</span>
          </button>
        ) : (
          <span className="text-xs text-slate-500 flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            只读访问（无文档上传权限）
          </span>
        )}
      </div>

      {/* Drag & Drop Zone */}
      {canUpload ? (
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center ${
            isDragging
              ? 'border-orange-500 bg-orange-50/80 ring-4 ring-orange-500/10 scale-[1.01]'
              : 'border-slate-300 hover:border-orange-400 bg-slate-50/60 hover:bg-orange-50/30'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition ${
              isDragging ? 'bg-orange-500 text-white scale-110' : 'bg-white text-orange-600 shadow-sm'
            }`}
          >
            {isDragging ? <Files className="w-6 h-6 animate-pulse" /> : <UploadCloud className="w-6 h-6" />}
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-sm font-semibold text-slate-800">
              {isDragging ? (
                <span className="text-orange-600 font-bold">释放鼠标立即开始批量上传</span>
              ) : (
                <>
                  <span className="text-orange-600 hover:underline">点击选择文件</span> 或将文档拖拽至此处
                </>
              )}
            </p>
            <p className="text-xs text-slate-500">
              支持同时拖拽/选择多个文件，格式支持 PDF、DOCX、Markdown、TXT、JSON、CSV，上传后系统将自动解析切块并轮询刷新就绪状态
            </p>
          </div>

          {/* Uploading progress bar */}
          {uploading && uploadProgress && (
            <div className="mt-4 w-full max-w-md bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2 text-left">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="truncate pr-2">
                  正在上传并解析: <span className="font-mono text-orange-600">{uploadProgress.currentName}</span>
                </span>
                <span className="font-mono text-slate-500 flex-shrink-0">
                  {uploadProgress.completed} / {uploadProgress.total} (
                  {Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Document Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header Controls */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
            <FileText className="w-4 h-4 text-slate-400" />
            <span>文档列表</span>
            {hasProcessingDocs && (
              <span className="text-xs font-medium text-amber-700 flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" />
                状态自动刷新中
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void fetchDocs()}
            disabled={isRefreshing}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs transition cursor-pointer disabled:cursor-wait"
            title={loadError ? '重试加载文档列表' : '手动刷新文档状态'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-orange-600' : ''}`} />
            <span>{loadError ? '重试加载' : '刷新状态'}</span>
          </button>
        </div>

        {loadError && (
          <div role="alert" className="flex items-center gap-2 bg-amber-50 px-4 sm:px-6 py-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>无法加载文档列表。{documents !== null && '当前显示上次加载结果。'}</span>
          </div>
        )}

        {documents !== null && (
          <div role="group" aria-label="文档状态筛选" className="px-4 sm:px-6 py-3 flex flex-wrap gap-2 border-b border-slate-100">
            {statusFilters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  statusFilter === value
                    ? 'border-orange-200 bg-orange-50 text-orange-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
                <span className={`rounded-md px-1.5 py-0.5 tabular-nums ${
                  statusFilter === value ? 'bg-orange-100' : 'bg-slate-100'
                }`}>{statusCounts[value]}</span>
              </button>
            ))}
          </div>
        )}

        {documents === null ? (
          !loadError && <div role="status" className="p-8 text-center text-slate-400 text-sm">加载文档列表中...</div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold">该知识库尚无文档</p>
            <p className="text-xs text-slate-400">
              {canUpload ? '可拖拽上方区域或点击按钮上传首个文档' : '当前暂无文档'}
            </p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <p>当前没有{statusFilters.find(({ value }) => value === statusFilter)?.label}的文档</p>
            <button type="button" onClick={() => setStatusFilter('all')} className="mt-2 text-xs font-medium text-orange-700 hover:underline cursor-pointer">
              查看全部文档
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-2xl text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-6">文件名称</th>
                  <th className="py-3 px-4">状态</th>
                  <th className="py-3 px-4">切块数量</th>
                  <th className="py-3 px-4">大小</th>
                  <th className="py-3 px-4">上传时间</th>
                  <th className="py-3 px-6 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleRows.map(({ doc, status, group }) => (
                  <tr key={doc.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3.5 px-6 font-medium text-slate-900 flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="truncate max-w-xs">{doc.filename}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(status)}
                      {group === 'failed' && (
                        <details className="mt-1.5 max-w-64 text-xs">
                          <summary className="cursor-pointer text-slate-600 hover:text-slate-900">查看失败原因</summary>
                          <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-rose-700">
                            {doc.error_message?.trim() || '服务端未返回失败原因。'}
                          </p>
                        </details>
                      )}
                      {group === 'ready' && doc.error_message === 'No extractable text found in document' && (
                        <p className="mt-1.5 text-xs text-amber-700">未提取到文字，请检查源文件</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                      {doc.chunk_count} 块
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      {(doc.file_size / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap space-x-2">
                      <button
                        onClick={() => viewChunks(doc.id)}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                        title="预览切块"
                      >
                        <Layers className="w-4 h-4 inline" />
                      </button>
                      {canUpload && (group === 'ready' || group === 'failed') && (
                        <button
                          type="button"
                          onClick={() => handleReindex(doc)}
                          disabled={reindexRequests.has(doc.id)}
                          className={group === 'failed'
                            ? 'inline-flex items-center gap-1 rounded-md border border-orange-200 px-2 py-1 align-middle text-xs font-medium text-orange-700 hover:bg-orange-50 transition cursor-pointer disabled:opacity-50'
                            : 'p-1 text-slate-400 hover:text-orange-600 rounded transition cursor-pointer disabled:opacity-50'}
                          title={group === 'failed' ? '重试处理' : '重新索引'}
                        >
                          {group === 'failed' ? '重试处理' : <RefreshCw className="w-4 h-4 inline" />}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                          title="删除文档"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chunks Preview Modal */}
      {selectedDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">文档语义切块预览</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Doc ID: {selectedDocId}</p>
              </div>
              <button
                onClick={() => setSelectedDocId(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {chunksLoading ? (
                <div className="text-center py-8 text-slate-400 text-sm">加载切块明细中...</div>
              ) : chunks.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">暂无切块数据</div>
              ) : (
                chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-slate-500 font-mono text-[11px]">
                      <span className="font-bold text-orange-600">块序号 #{chunk.chunk_index}</span>
                      <span>Token 数: {chunk.token_count}</span>
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap leading-relaxed font-mono">
                      {chunk.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';

export interface DocumentItem {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  status: string;
  chunk_count: number;
  created_at: string;
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

export const KnowledgeBaseDetail: React.FC = () => {
  const { id: kbId } = useParams<{ id: string }>();
  const { currentOrg, currentWorkspace } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    if (!currentOrg || !currentWorkspace || !kbId) return;
    setLoading(true);
    try {
      const res = await apiClient.get<DocumentItem[]>(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases/${kbId}/documents`
      );
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to load documents', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [currentOrg, currentWorkspace, kbId]);

  const uploadFiles = async (fileList: File[] | FileList) => {
    const rawFiles = Array.from(fileList);
    // Filter out 0 byte files
    const validFiles = rawFiles.filter((f) => f.size > 0);

    if (validFiles.length === 0) {
      alert('请选择有效的非空文件上传');
      return;
    }
    if (!currentOrg || !currentWorkspace || !kbId) return;

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

        setUploadProgress((prev) => (prev ? { ...prev, currentName: file.name } : null));

        const formData = new FormData();
        formData.append('file', file);

        try {
          await apiClient.post(
            `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases/${kbId}/documents`,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
            }
          );
          successCount++;
        } catch (err: any) {
          failedFiles.push({
            name: file.name,
            reason: err.response?.data?.detail || err.message || '上传处理失败',
          });
        } finally {
          setUploadProgress((prev) =>
            prev ? { ...prev, completed: Math.min(prev.completed + 1, prev.total) } : null
          );
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, validFiles.length) }, () => worker());
    await Promise.all(workers);

    setUploading(false);
    setUploadProgress(null);
    fetchDocs();

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
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only turn off if leaving the current target
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleReindex = async (docId: string) => {
    if (!currentOrg || !currentWorkspace || !kbId) return;
    try {
      await apiClient.post(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases/${kbId}/documents/${docId}/reindex`
      );
      fetchDocs();
    } catch (err: any) {
      alert(err.response?.data?.detail || '重新索引触发失败');
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('确认删除此文档并物理清理切块与向量？')) return;
    if (!currentOrg || !currentWorkspace || !kbId) return;

    try {
      await apiClient.delete(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases/${kbId}/documents/${docId}`
      );
      fetchDocs();
    } catch (err: any) {
      alert(err.response?.data?.detail || '删除文档失败');
    }
  };

  const viewChunks = async (docId: string) => {
    if (!currentOrg || !currentWorkspace || !kbId) return;
    setSelectedDocId(docId);
    setChunksLoading(true);
    try {
      const res = await apiClient.get(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases/${kbId}/documents/${docId}`
      );
      setChunks(res.data.chunks || []);
    } catch (err) {
      console.error('Failed to load chunks', err);
    } finally {
      setChunksLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
            <CheckCircle className="w-3 h-3" /> 就绪 (Ready)
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200">
            <AlertTriangle className="w-3 h-3" /> 失败 (Failed)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200">
            <Clock className="w-3 h-3" /> 处理中 ({status})
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
        disabled={uploading}
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
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium text-xs rounded-lg transition inline-flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>{uploading ? '上传解析中...' : '上传文档 (可多选)'}</span>
        </button>
      </div>

      {/* Drag & Drop Zone */}
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
            支持同时拖拽/选择多个文件，格式支持 PDF、DOCX、Markdown、TXT、JSON、CSV
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

      {/* Document Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">加载文档列表中...</div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold">该知识库尚无文档</p>
            <p className="text-xs text-slate-400">可拖拽上方区域或点击按钮上传首个文档</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
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
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-3.5 px-6 font-medium text-slate-900 flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate max-w-xs">{doc.filename}</span>
                  </td>
                  <td className="py-3.5 px-4">{getStatusBadge(doc.status)}</td>
                  <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                    {doc.chunk_count} 块
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                    {(doc.file_size / 1024).toFixed(1)} KB
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-6 text-right space-x-2">
                    <button
                      onClick={() => viewChunks(doc.id)}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded transition"
                      title="预览切块"
                    >
                      <Layers className="w-4 h-4 inline" />
                    </button>
                    <button
                      onClick={() => handleReindex(doc.id)}
                      className="p-1 text-slate-400 hover:text-orange-600 rounded transition"
                      title="重新索引"
                    >
                      <RefreshCw className="w-4 h-4 inline" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                      title="删除文档"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                className="text-slate-400 hover:text-slate-600"
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

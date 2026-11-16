import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { generateSlug } from '../utils/slug';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Folder, Calendar, ArrowRight, X, AlertCircle, Layers } from 'lucide-react';

export interface KnowledgeBase {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export const KnowledgeBases: React.FC = () => {
  const { currentOrg, currentWorkspace } = useAuth();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugTouched, setIsSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchKBs = async () => {
    if (!currentOrg || !currentWorkspace) {
      setKbs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get<KnowledgeBase[]>(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases`
      );
      setKbs(res.data);
    } catch (err) {
      console.error('Failed to fetch knowledge bases', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKBs();
  }, [currentOrg, currentWorkspace]);

  const handleOpenModal = () => {
    setName('');
    setSlug('');
    setIsSlugTouched(false);
    setDescription('');
    setError(null);
    setShowModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !currentWorkspace) {
      setError('请先在左侧选择或创建工作区');
      return;
    }
    if (!name.trim()) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await apiClient.post<KnowledgeBase>(
        `/organizations/${currentOrg.id}/workspaces/${currentWorkspace.id}/knowledge-bases`,
        {
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
        }
      );
      // Immediately display newly created knowledge base in list
      const newKb = res.data;
      setKbs((prev) => [newKb, ...prev.filter((k) => k.id !== newKb.id)]);
      setShowModal(false);
      setName('');
      setSlug('');
      setIsSlugTouched(false);
      setDescription('');
      // Background sync from server
      fetchKBs();
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        '创建知识库失败，请检查名称或标识是否冲突';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">知识库列表</h2>
          <p className="text-sm text-slate-500 mt-1">
            {currentWorkspace
              ? `管理工作区【${currentWorkspace.name}】内的结构化文档集与索引空间`
              : '管理工作区内的结构化文档集与索引空间'}
          </p>
        </div>
        <button
          onClick={handleOpenModal}
          disabled={!currentWorkspace}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium text-xs rounded-lg transition flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:pointer-events-none"
        >
          <Plus className="w-4 h-4" />
          <span>新建知识库</span>
        </button>
      </div>

      {!currentWorkspace ? (
        <div className="bg-white rounded-xl border border-dashed border-amber-300 p-12 text-center bg-amber-50/30">
          <Layers className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">尚未选择工作区</h3>
          <p className="text-xs text-slate-500 mt-1">
            知识库基于工作区强隔离存储。请先在左侧侧边栏中切换或新建一个工作区。
          </p>
        </div>
      ) : loading && kbs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">加载中...</div>
      ) : kbs.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">暂无知识库</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            为工作区【{currentWorkspace.name}】创建第一个知识库以开始上传文档与建立向量索引
          </p>
          <button
            onClick={handleOpenModal}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium text-xs rounded-lg transition inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>新建知识库</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {kbs.map((kb) => (
            <Link
              key={kb.id}
              to={`/knowledge-bases/${kb.id}`}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-orange-200 transition group flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                  <Folder className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-orange-600 transition truncate">
                  {kb.name}
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{kb.slug}</p>
                <p className="text-xs text-slate-600 mt-3 line-clamp-2 leading-relaxed">
                  {kb.description || '暂无详细描述'}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1 font-mono text-[10px]">
                  <Calendar className="w-3 h-3" />
                  {new Date(kb.created_at).toLocaleDateString()}
                </span>
                <span className="text-orange-600 group-hover:translate-x-1 transition flex items-center gap-1 font-semibold">
                  查看文档 <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                新建知识库 - {currentWorkspace?.name}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  知识库名称
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setName(val);
                    if (!isSlugTouched) {
                      setSlug(generateSlug(val));
                    }
                  }}
                  placeholder="例如：技术白皮书、产品文档"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  唯一别名 Slug (用于路径与标识)
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSlug(val);
                    setIsSlugTouched(val.length > 0);
                  }}
                  placeholder="如：tech-docs 或 产品文档"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  描述 (可选)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="说明此知识库所收录文档的范围与应用场景..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? '创建中...' : '确认创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

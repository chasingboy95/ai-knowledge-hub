import React, { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { getVisibleKnowledgeBases, type KnowledgeBase, type KnowledgeBaseSort } from '../utils/knowledgeBases';
import { generateSlug } from '../utils/slug';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Folder, Calendar, ArrowRight, X, AlertCircle, Layers, Search, Pencil } from 'lucide-react';

export const KnowledgeBases: React.FC = () => {
  const { currentOrg, currentWorkspace, hasPermission } = useAuth();
  const [list, setList] = useState<{ endpoint: string; version: number; data: KnowledgeBase[] | null } | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<KnowledgeBaseSort>('created');
  const [formTarget, setFormTarget] = useState<'new' | KnowledgeBase | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugTouched, setIsSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const canCreateKB = hasPermission('knowledge:create');
  const canEditKB = hasPermission('knowledge:update');
  const editing = formTarget === 'new' ? null : formTarget;
  const nameChanged = editing !== null && name.trim() !== editing.name.trim();
  const descriptionChanged = editing !== null && description.trim() !== (editing.description ?? '').trim();
  const canSubmit = !!name.trim() && (editing
    ? canEditKB && (nameChanged || descriptionChanged)
    : canCreateKB && !!slug.trim());
  const workspace = currentOrg?.id === currentWorkspace?.organization_id ? currentWorkspace : null;
  const endpoint = currentOrg && workspace
    ? `/organizations/${currentOrg.id}/workspaces/${workspace.id}/knowledge-bases`
    : null;
  const result = list && list.endpoint === endpoint && list.version === requestVersion ? list : null;
  const visibleKbs = result?.data ? getVisibleKnowledgeBases(result.data, query, sort) : [];

  const reloadKBs = () => setRequestVersion((version) => version + 1);

  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();

    apiClient.get<KnowledgeBase[]>(endpoint, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setList({ endpoint, version: requestVersion, data });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to fetch knowledge bases', err);
        setList({ endpoint, version: requestVersion, data: null });
      });

    return () => controller.abort();
  }, [endpoint, requestVersion]);

  useEffect(() => {
    if (formTarget && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
      nameInputRef.current?.focus();
    }
  }, [formTarget]);

  const handleOpenModal = (kb?: KnowledgeBase) => {
    setName(kb?.name ?? '');
    setSlug('');
    setIsSlugTouched(false);
    setDescription(kb?.description ?? '');
    setError(null);
    setFeedback('');
    setFormTarget(kb ?? 'new');
  };

  const closeForm = () => {
    dialogRef.current?.close();
    setFormTarget(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTarget || isSubmitting || !canSubmit) return;
    if (!endpoint) {
      setError('请先在左侧选择或创建工作区');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (editing) {
        const { data: updated } = await apiClient.patch<KnowledgeBase>(`${endpoint}/${editing.id}`, {
          ...(nameChanged ? { name: name.trim() } : {}),
          ...(descriptionChanged ? { description: description.trim() } : {}),
        });
        setList((previous) => previous?.endpoint === endpoint && previous.data
          ? { ...previous, data: previous.data.map((kb) => kb.id === updated.id ? updated : kb) }
          : previous);
        setFeedback('知识库信息已更新。');
      } else {
        await apiClient.post(endpoint, {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
        });
        setQuery('');
        reloadKBs();
      }
      closeForm();
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (editing) {
        setError(status === 403 ? '您没有修改此知识库的权限。'
          : status === 404 ? '找不到此知识库，请关闭窗口后查看列表。'
          : '无法保存知识库信息，请重试。');
        if (status === 404) reloadKBs();
      } else {
        setError(status === 409 ? '知识库标识已被使用。' : '无法创建知识库，请重试。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="content-page knowledge-page p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">知识库列表</h2>
          <p className="text-sm text-slate-500 mt-1">
            {workspace
              ? `管理工作区【${workspace.name}】内的结构化文档集与索引空间`
              : '管理工作区内的结构化文档集与索引空间'}
          </p>
        </div>
        {canCreateKB && (
          <button
            onClick={() => handleOpenModal()}
            disabled={!workspace}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium text-xs rounded-lg transition flex shrink-0 items-center gap-2 whitespace-nowrap shadow-sm disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新建知识库</span>
          </button>
        )}
      </div>

      {feedback && <div role="status" className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
        {feedback}
      </div>}

      {!!result?.data?.length && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="relative w-full sm:max-w-sm">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="搜索知识库"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称或描述"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </label>
          <select
            aria-label="知识库排序"
            value={sort}
            onChange={(e) => setSort(e.target.value as KnowledgeBaseSort)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          >
            <option value="created">最近创建</option>
            <option value="updated">最近更新</option>
            <option value="name">按名称</option>
          </select>
        </div>
      )}

      {!workspace ? (
        <div className="bg-white rounded-xl border border-dashed border-amber-300 p-12 text-center bg-amber-50/30">
          <Layers className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">尚未选择工作区</h3>
          <p className="text-xs text-slate-500 mt-1">
            知识库基于工作区强隔离存储。请先在左侧侧边栏中切换或新建一个工作区。
          </p>
        </div>
      ) : !result ? (
        <div role="status" className="text-center py-12 text-slate-400 text-sm">加载中...</div>
      ) : !result.data ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <AlertCircle aria-hidden="true" className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 role="alert" className="text-base font-semibold text-slate-800">知识库加载失败</h3>
          <button type="button" onClick={reloadKBs} className="mt-4 text-sm font-medium text-orange-700 hover:underline cursor-pointer">
            重试
          </button>
        </div>
      ) : result.data.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">暂无知识库</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            为工作区【{workspace.name}】创建第一个知识库以开始上传文档与建立向量索引
          </p>
          {canCreateKB && (
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium text-xs rounded-lg transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新建知识库</span>
            </button>
          )}
        </div>
      ) : visibleKbs.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Search aria-hidden="true" className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 role="status" className="text-base font-semibold text-slate-800">未找到匹配的知识库</h3>
          <button type="button" onClick={() => setQuery('')} className="mt-4 text-sm font-medium text-orange-700 hover:underline cursor-pointer">
            清除搜索
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {visibleKbs.map((kb) => (
            <article key={kb.id} className="relative">
              <Link
                to={`/knowledge-bases/${kb.id}`}
                className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-orange-200 transition group flex h-full flex-col justify-between"
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
              {canEditKB && (
                <button type="button" onClick={() => handleOpenModal(kb)} aria-label={`编辑知识库 ${kb.name}`}
                  className="absolute right-4 top-4 rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {formTarget && (
        <dialog
          ref={dialogRef}
          aria-labelledby="knowledge-base-form-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!isSubmitting) closeForm();
          }}
          className="fixed inset-0 m-auto max-h-[90dvh] w-11/12 max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-black/40"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 id="knowledge-base-form-title" className="text-lg font-bold text-slate-900">
              {editing ? '编辑知识库' : `新建知识库 - ${workspace?.name}`}
            </h3>
            <button
              type="button"
              aria-label="关闭窗口"
              onClick={closeForm}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="space-y-4">
            <div>
              <label htmlFor="knowledge-base-name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                知识库名称
              </label>
              <input
                id="knowledge-base-name"
                ref={nameInputRef}
                type="text"
                required
                maxLength={255}
                readOnly={isSubmitting}
                value={name}
                onChange={(e) => {
                  const val = e.target.value;
                  setName(val);
                  if (!editing && !isSlugTouched) {
                    setSlug(generateSlug(val).slice(0, 100));
                  }
                }}
                placeholder="如：技术规范与产品文档"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            {!editing && (
              <div>
                <label htmlFor="knowledge-base-slug" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  知识库标识 (Slug)
                </label>
                <input
                  id="knowledge-base-slug"
                  type="text"
                  required
                  maxLength={100}
                  readOnly={isSubmitting}
                  value={slug}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSlug(val);
                    setIsSlugTouched(val.length > 0);
                  }}
                  placeholder="如：tech-specs 或 技术文档"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-xs"
                />
              </div>
            )}

            <div>
              <label htmlFor="knowledge-base-description" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                描述 (选填)
              </label>
              <textarea
                id="knowledge-base-description"
                readOnly={isSubmitting}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简述该知识库存储的文档类型及用途"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !canSubmit}
                className="px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition disabled:opacity-50 cursor-pointer"
              >
                {editing ? (isSubmitting ? '保存中…' : '保存修改') : (isSubmitting ? '创建中…' : '确认创建')}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { KnowledgeBase } from '../utils/knowledgeBases';

type OverviewState =
  | { status: 'loading' }
  | { status: 'ready'; knowledgeBases: KnowledgeBase[] }
  | { status: 'error' };

export const Dashboard: React.FC = () => {
  const { currentOrg, currentWorkspace, hasPermission } = useAuth();
  const workspace = currentWorkspace?.organization_id === currentOrg?.id ? currentWorkspace : null;
  const canRead = hasPermission('knowledge:read');

  return (
    <div className="content-page overview-page mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">工作台概览</h1>
          {currentOrg && (
            <p className="mt-2 flex flex-wrap gap-x-2 text-sm text-neutral-600 wrap-anywhere">
              <span>{currentOrg.name}</span>
              {workspace && <><span aria-hidden="true">/</span><span>{workspace.name}</span></>}
            </p>
          )}
        </div>
        {workspace && canRead && (
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            开始 AI 问答
          </Link>
        )}
      </header>

      {!currentOrg || !workspace ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="font-semibold text-neutral-950">尚未选择工作区</h2>
          <p className="mt-2 text-sm text-neutral-600">请通过导航选择组织和工作区。</p>
        </section>
      ) : !canRead ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          知识库概览需要查看权限。
        </p>
      ) : (
        <WorkspaceOverview
          key={`${currentOrg.id}/${workspace.id}`}
          workspacePath={`/organizations/${currentOrg.id}/workspaces/${workspace.id}`}
          canCreate={hasPermission('knowledge:create')}
        />
      )}
    </div>
  );
};

function WorkspaceOverview({ workspacePath, canCreate }: { workspacePath: string; canCreate: boolean }) {
  const [overview, setOverview] = useState<OverviewState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<KnowledgeBase[]>(`${workspacePath}/knowledge-bases`, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setOverview({ status: 'ready', knowledgeBases: data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setOverview({ status: 'error' });
      });

    return () => controller.abort();
  }, [workspacePath, attempt]);

  return (
    <section aria-labelledby="overview-knowledge" className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-5 sm:p-6">
        <h2 id="overview-knowledge" className="flex items-center gap-2 font-semibold text-neutral-950">
          <BookOpen className="size-5 text-indigo-600" aria-hidden="true" />
          知识库与文档
        </h2>
        <Link to="/knowledge-bases" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline">
          全部知识库 <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="p-5 sm:p-6">
        {overview.status === 'loading' && (
          <div role="status">
            <p className="text-sm text-neutral-600">正在加载知识库…</p>
          </div>
        )}

        {overview.status === 'error' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="alert">
              <p className="text-sm text-neutral-700">加载知识库失败，请重试。</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOverview({ status: 'loading' });
                setAttempt((previous) => previous + 1);
              }}
              className="cursor-pointer rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              重试
            </button>
          </div>
        )}

        {overview.status === 'ready' && (
          <div className="grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <dl>
              <dt className="text-sm text-neutral-600">知识库数量</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums text-neutral-950">{overview.knowledgeBases.length}</dd>
            </dl>
            {overview.knowledgeBases.length === 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-neutral-950">暂无知识库</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  {canCreate ? '前往知识库页面创建第一个知识库，再添加文档。' : '请联系管理员添加知识库。'}
                </p>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-neutral-950">最近创建</h3>
                <ul className="mt-2 divide-y divide-neutral-100">
                  {overview.knowledgeBases.slice(0, 3).map((kb) => (
                    <li key={kb.id}>
                      <Link
                        to={`/knowledge-bases/${kb.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm text-neutral-800 transition hover:bg-indigo-50 hover:text-indigo-800"
                      >
                        <span className="truncate">{kb.name}</span>
                        <ArrowRight className="size-4 shrink-0 text-neutral-500" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

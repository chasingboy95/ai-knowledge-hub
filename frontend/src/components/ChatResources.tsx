import { ArrowDownLeft, ArrowUpRight, BookOpen, FileText, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { getChatSources } from '../utils/chatSources';

export interface ChatKnowledgeBase {
  id: string;
  name: string;
  description?: string | null;
}

interface ChatResourcesProps {
  open: boolean;
  showSources: boolean;
  hasAnswer: boolean;
  sources: ReturnType<typeof getChatSources>;
  activeCitation: number | null;
  knowledgeBases: ChatKnowledgeBase[];
  onClose: () => void;
  onTabChange: (showSources: boolean) => void;
  onExample?: (question: string) => void;
}

const examples = [
  '这套知识库涵盖哪些主题？',
  '请梳理相关流程和注意事项。',
  '哪些资料适合新成员先阅读？',
];

export function ChatResources({
  open, showSources, hasAnswer, sources, activeCitation, knowledgeBases, onClose, onTabChange, onExample,
}: ChatResourcesProps) {
  return (
    <aside
      id="chat-resources"
      aria-label="问答资料"
      className={`absolute inset-y-0 right-0 z-20 w-full max-w-sm flex-col border-l border-neutral-200 bg-neutral-50 lg:static lg:z-auto lg:flex lg:w-[35%] lg:min-w-70 lg:max-w-100 ${open ? 'flex shadow-xl lg:shadow-none' : 'hidden'}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
        <div className="flex gap-1 rounded-xl bg-neutral-200/60 p-1">
          <button type="button" aria-pressed={!showSources} onClick={() => onTabChange(false)}
            className={`rounded-lg px-3 py-1.5 text-sm ${!showSources ? 'bg-white font-semibold shadow-xs' : 'text-neutral-600 hover:text-neutral-900'}`}>
            资料
          </button>
          <button type="button" aria-pressed={showSources} onClick={() => onTabChange(true)}
            className={`rounded-lg px-3 py-1.5 text-sm ${showSources ? 'bg-white font-semibold shadow-xs' : 'text-neutral-600 hover:text-neutral-900'}`}>
            来源{hasAnswer && ` (${sources.length})`}
          </button>
        </div>
        <button type="button" aria-label="关闭资料栏" onClick={onClose} className="rounded-lg p-2 hover:bg-neutral-200 lg:hidden">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {showSources ? (
          <section aria-labelledby="chat-sources-heading">
            <h2 id="chat-sources-heading" className="mb-4 text-base font-semibold">回答来源</h2>
            {sources.length === 0 && (
              <p className="text-sm leading-relaxed text-neutral-600">
                {hasAnswer ? '这条回答没有引用来源。' : '回答完成后，来源会显示在这里。'}
              </p>
            )}
            <div className="space-y-3">
              {sources.map(({ number, source }) => (
                <article
                  id={`chat-source-${number}`}
                  key={number}
                  tabIndex={-1}
                  className={`scroll-m-4 rounded-xl border bg-white p-4 ${activeCitation === number ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-neutral-200'}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{number}</span>
                    <h3 className="min-w-0 text-sm font-semibold wrap-break-word">{source.document_title}</h3>
                  </div>
                  <p className="mt-2 text-xs text-neutral-600">
                    {source.page_number != null && `第 ${source.page_number} 页 · `}
                    片段 {source.chunk_index} · 相似度 {(source.similarity * 100).toFixed(0)}%
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed wrap-break-word text-neutral-700">{source.text_snippet}</p>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <div className="space-y-8">
            <section aria-labelledby="chat-kb-heading">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="chat-kb-heading" className="text-base font-semibold">工作区知识库</h2>
                <Link to="/knowledge-bases" className="whitespace-nowrap text-xs font-medium text-indigo-700 hover:underline">查看全部</Link>
              </div>
              {knowledgeBases.length === 0 && <p className="text-sm text-neutral-600">暂无可用知识库。</p>}
              <div className="space-y-2.5">
                {knowledgeBases.slice(0, 4).map((kb) => (
                  <Link key={kb.id} to={`/knowledge-bases/${kb.id}`}
                    className="group flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3.5 hover:border-indigo-300">
                    <span className="rounded-lg bg-indigo-50 p-2 text-indigo-700"><BookOpen className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{kb.name}</span>
                      {kb.description && <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-neutral-600">{kb.description}</span>}
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-neutral-500 group-hover:text-indigo-700" />
                  </Link>
                ))}
              </div>
            </section>
            {onExample && (
              <section aria-labelledby="chat-example-heading">
                <h2 id="chat-example-heading" className="mb-3 text-base font-semibold">试着问</h2>
                <div className="space-y-2">
                  {examples.map((question) => (
                    <button key={question} type="button" onClick={() => onExample(question)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-left text-sm hover:border-indigo-300">
                      <FileText className="size-4 shrink-0 text-neutral-500" />
                      <span className="flex-1">{question}</span>
                      <ArrowDownLeft className="size-4 shrink-0 text-neutral-500" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

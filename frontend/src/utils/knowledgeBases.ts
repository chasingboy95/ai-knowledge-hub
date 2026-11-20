export interface KnowledgeBase {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type KnowledgeBaseSort = 'created' | 'updated' | 'name';

export function getVisibleKnowledgeBases(kbs: KnowledgeBase[], query: string, sort: KnowledgeBaseSort) {
  const keyword = query.trim().toLowerCase();
  const matches = kbs.filter((kb) =>
    kb.name.toLowerCase().includes(keyword) || kb.description?.toLowerCase().includes(keyword)
  );

  if (sort === 'name') return matches.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const dateField = sort === 'updated' ? 'updated_at' : 'created_at';
  return matches.sort((a, b) => Date.parse(b[dateField]) - Date.parse(a[dateField]));
}

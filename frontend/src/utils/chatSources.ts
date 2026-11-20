import { marked } from 'marked';

export interface CitationSource {
  document_id: string;
  document_title: string;
  chunk_index: number;
  page_number?: number | null;
  similarity: number;
  text_snippet: string;
}

const citationPattern = /\[\^(\d+)\]/g;

export function splitCitationText(text: string) {
  return text.split(citationPattern);
}

function isCitationSource(value: unknown): value is CitationSource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Partial<CitationSource>;
  return typeof source.document_id === 'string'
    && typeof source.document_title === 'string'
    && typeof source.chunk_index === 'number'
    && typeof source.similarity === 'number'
    && typeof source.text_snippet === 'string';
}

export function getChatSources(content: string, citations?: unknown[] | null) {
  const sources = new Map(
    (citations ?? []).flatMap((source, index) =>
      isCitationSource(source) ? [[index + 1, { number: index + 1, source }] as const] : [],
    ),
  );
  if (!sources.size) return [];

  const ordered = new Set<number>();
  marked.walkTokens(marked.lexer(content), (token) => {
    if (token.type === 'text' && !token.tokens && !token.escaped) {
      for (const match of token.text.matchAll(citationPattern)) ordered.add(Number(match[1]));
    }
  });
  return [...new Set([...ordered, ...sources.keys()])].flatMap((number) => sources.get(number) ?? []);
}

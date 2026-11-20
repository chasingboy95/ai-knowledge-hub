import React, { useState } from 'react';
import { marked, type Tokens, type Token } from 'marked';
import { Check, Copy } from 'lucide-react';
import { splitCitationText } from '../utils/chatSources';

interface CodeBlockProps {
  code: string;
  lang?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, lang }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900/90 border-b border-slate-800/80 text-[11px] font-mono text-slate-400">
        <span className="uppercase tracking-wider font-semibold text-orange-400">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
          title="复制代码"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-sans text-xs">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="font-sans text-xs">复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs leading-relaxed font-mono whitespace-pre text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
};

interface MarkdownViewProps {
  content: string;
  isUser?: boolean;
  citationNumbers?: ReadonlySet<number>;
  onCitationClick?: (number: number) => void;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, isUser = false, citationNumbers, onCitationClick }) => {
  if (!content) return null;

  // Use marked lexer to convert markdown text into structured tokens
  let tokens: Token[] = [];
  try {
    tokens = marked.lexer(content, { breaks: true, gfm: true });
  } catch (err) {
    console.error('Failed to parse markdown', err);
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  const renderInlineTokens = (inlineTokens?: Token[]): React.ReactNode => {
    if (!inlineTokens) return null;
    return inlineTokens.map((token, i) => {
      switch (token.type) {
        case 'text':
          if (token.tokens) return renderInlineTokens(token.tokens);
          if (!onCitationClick || token.escaped) return (token as Tokens.Text).text;
          return splitCitationText(token.text).map((part, index) => {
            if (index % 2 === 0) return part;
            const number = Number(part);
            return citationNumbers?.has(number) ? (
              <button
                key={index}
                type="button"
                aria-label={`查看引用 ${number}`}
                onClick={() => onCitationClick(number)}
                className="mx-0.5 inline-flex rounded-md bg-indigo-50 px-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                {number}
              </button>
            ) : `[^${part}]`;
          });
        case 'strong':
          return (
            <strong key={i} className={`font-bold ${isUser ? 'text-white' : 'text-slate-900'}`}>
              {renderInlineTokens((token as Tokens.Strong).tokens)}
            </strong>
          );
        case 'em':
          return (
            <em key={i} className="italic">
              {renderInlineTokens((token as Tokens.Em).tokens)}
            </em>
          );
        case 'codespan':
          return (
            <code
              key={i}
              className={`px-1.5 py-0.5 mx-0.5 rounded text-xs font-mono ${
                isUser
                  ? 'bg-slate-800 text-orange-300 border border-slate-700'
                  : 'bg-slate-100 text-orange-600 border border-slate-200'
              }`}
            >
              {(token as Tokens.Codespan).text}
            </code>
          );
        case 'link':
          return (
            <a
              key={i}
              href={(token as Tokens.Link).href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-500 hover:text-orange-400 underline font-medium"
            >
              {renderInlineTokens((token as Tokens.Link).tokens)}
            </a>
          );
        case 'del':
          return (
            <del key={i} className="line-through opacity-70">
              {renderInlineTokens((token as Tokens.Del).tokens)}
            </del>
          );
        default:
          return (token as any).text || '';
      }
    });
  };

  const renderBlockToken = (token: Token, index: number): React.ReactNode => {
    switch (token.type) {
      case 'code':
        return <CodeBlock key={index} code={(token as Tokens.Code).text} lang={(token as Tokens.Code).lang} />;
      case 'paragraph':
        return (
          <p key={index} className="my-1.5 leading-relaxed">
            {renderInlineTokens((token as Tokens.Paragraph).tokens)}
          </p>
        );
      case 'text':
        return <React.Fragment key={index}>{renderInlineTokens([token])}</React.Fragment>;
      case 'heading': {
        const headingToken = token as Tokens.Heading;
        const depth = headingToken.depth;
        const headingContent = renderInlineTokens(headingToken.tokens);
        if (depth === 1) {
          return (
            <h1 key={index} className={`text-base font-bold mt-4 mb-2 ${isUser ? 'text-white' : 'text-slate-900'}`}>
              {headingContent}
            </h1>
          );
        }
        if (depth === 2) {
          return (
            <h2 key={index} className={`text-sm font-bold mt-3 mb-1.5 ${isUser ? 'text-white' : 'text-slate-900'}`}>
              {headingContent}
            </h2>
          );
        }
        return (
          <h3 key={index} className={`text-xs font-bold mt-2.5 mb-1 ${isUser ? 'text-white' : 'text-slate-900'}`}>
            {headingContent}
          </h3>
        );
      }
      case 'list': {
        const listToken = token as Tokens.List;
        const ListTag = listToken.ordered ? 'ol' : 'ul';
        const listClass = listToken.ordered
          ? 'list-decimal pl-5 space-y-1 my-2 text-xs leading-relaxed'
          : 'list-disc pl-5 space-y-1 my-2 text-xs leading-relaxed';
        return (
          <ListTag key={index} className={listClass}>
            {listToken.items.map((item, itemIdx) => (
              <li key={itemIdx}>
                {item.tokens && item.tokens.length > 0 ? (
                  item.tokens.map((t, ti) => renderBlockToken(t, ti))
                ) : (
                  item.text
                )}
              </li>
            ))}
          </ListTag>
        );
      }
      case 'blockquote': {
        const bqToken = token as Tokens.Blockquote;
        return (
          <blockquote
            key={index}
            className={`border-l-3 border-orange-500 pl-3 py-1 my-2 text-xs italic ${
              isUser ? 'bg-slate-800/60 text-slate-300' : 'bg-orange-50/50 text-slate-600'
            }`}
          >
            {bqToken.tokens ? bqToken.tokens.map((t, ti) => renderBlockToken(t, ti)) : bqToken.text}
          </blockquote>
        );
      }
      case 'table': {
        const tableToken = token as Tokens.Table;
        return (
          <div key={index} className="my-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  {tableToken.header.map((cell, cIdx) => (
                    <th key={cIdx} className="py-2 px-3">
                      {renderInlineTokens(cell.tokens)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableToken.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/50">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2 px-3 text-slate-700">
                        {renderInlineTokens(cell.tokens)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'hr':
        return <hr key={index} className="my-3 border-slate-200" />;
      case 'space':
        return null;
      default:
        return (
          <div key={index} className="my-1">
            {(token as any).text || ''}
          </div>
        );
    }
  };

  return <div className="text-sm leading-relaxed">{tokens.map((t, idx) => renderBlockToken(t, idx))}</div>;
};

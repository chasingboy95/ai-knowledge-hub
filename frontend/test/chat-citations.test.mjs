import assert from 'node:assert/strict';
import test from 'node:test';
import { getChatSources } from '../src/utils/chatSources.ts';

const first = { document_id: 'a', document_title: '手册', chunk_index: 0, similarity: 0.9, text_snippet: '片段 A' };
const second = { ...first, document_id: 'b', document_title: '流程', text_snippet: '片段 B' };

test('按正文的引用顺序排列，并保留原始编号', () => {
  assert.deepEqual(
    getChatSources('先看流程[^2]，再核对手册[^1]，重读流程[^2]。', [first, second]),
    [{ number: 2, source: second }, { number: 1, source: first }],
  );
});

test('忽略工具记录和无效引用，仍显示历史回答返回的来源', () => {
  assert.deepEqual(
    getChatSources('参见[^9]。', [{ tool: 'knowledge_search' }, first]),
    [{ number: 2, source: first }],
  );
  assert.deepEqual(getChatSources('没有来源', null), []);
});

test('代码内的引用写法不会改变来源顺序', () => {
  assert.deepEqual(
    getChatSources('示例 `[^2]`，正文[^1]。', [first, second]),
    [{ number: 1, source: first }, { number: 2, source: second }],
  );
});

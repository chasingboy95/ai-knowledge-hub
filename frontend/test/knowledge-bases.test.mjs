import assert from 'node:assert/strict';
import test from 'node:test';
import { getVisibleKnowledgeBases } from '../src/utils/knowledgeBases.ts';

const handbook = {
  id: 'handbook', name: 'Handbook', slug: 'handbook', description: '入职流程和常见问题',
  created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-04T09:00:00Z',
};
const architecture = {
  id: 'architecture', name: 'Architecture', slug: 'architecture', description: null,
  created_at: '2026-11-03T09:00:00Z', updated_at: '2026-11-03T09:00:00Z',
};
const policies = {
  id: 'policies', name: 'Policies', slug: 'policies', description: '公司制度',
  created_at: '2026-11-02T09:00:00Z', updated_at: '2026-11-05T09:00:00Z',
};
const libraries = [handbook, architecture, policies];

test('知识库搜索匹配名称和描述，忽略前后空格与大小写', () => {
  assert.deepEqual(getVisibleKnowledgeBases(libraries, '  HAND ', 'created'), [handbook]);
  assert.deepEqual(getVisibleKnowledgeBases(libraries, '入职', 'created'), [handbook]);
  assert.deepEqual(getVisibleKnowledgeBases(libraries, '财务', 'created'), []);
});

test('知识库分别按创建时间、更新时间和名称排序', () => {
  assert.deepEqual(getVisibleKnowledgeBases(libraries, ' ', 'created'), [architecture, policies, handbook]);
  assert.deepEqual(getVisibleKnowledgeBases(libraries, '', 'updated'), [policies, handbook, architecture]);
  assert.deepEqual(getVisibleKnowledgeBases(libraries, '', 'name'), [architecture, handbook, policies]);
  assert.deepEqual(libraries, [handbook, architecture, policies]);
});

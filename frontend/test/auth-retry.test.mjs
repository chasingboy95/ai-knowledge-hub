import assert from 'node:assert/strict';
import test from 'node:test';
import { apiClient } from '../src/api/client.ts';
import { fetchSSE } from '../src/api/sse.ts';

const storage = new Map();
const location = { pathname: '/chat', href: '/chat' };
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} });
Object.defineProperty(globalThis, 'window', { value: { location } });

function setTokens(access, refresh) {
  storage.set('access_token', access);
  storage.set('refresh_token', refresh);
  location.href = '/chat';
}

function unauthorized(config) {
  return Promise.reject({ config, response: { status: 401 } });
}

test('concurrent REST and chat requests share one rotation and each retries once', async (t) => {
  setTokens('expired', 'rotatable');
  const restTokens = [];
  const streamTokens = [];
  let refreshCalls = 0;
  const originalAdapter = apiClient.defaults.adapter;  t.after(() => { apiClient.defaults.adapter = originalAdapter; });  apiClient.defaults.adapter = async (config) => {
    restTokens.push(config.headers.Authorization);
    if (config.headers.Authorization !== 'Bearer renewed') return unauthorized(config);
    return { config, status: 200, statusText: 'OK', headers: {}, data: true };
  };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/v1/auth/refresh') {
      refreshCalls++;
      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'rotatable' });
      return Response.json({ access_token: 'renewed', refresh_token: 'replacement' });
    }
    streamTokens.push(options.headers.Authorization);
    return options.headers.Authorization === 'Bearer renewed'
      ? new Response('event: done\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
      : new Response(null, { status: 401 });
  });
  let done = false;
  const errors = [];
  const result = await Promise.allSettled([
    apiClient.get('/organizations'),
    apiClient.get('/users/me'),
    fetchSSE('/stream', {
      onEvent() {}, onDone() { done = true; }, onError(err) { errors.push(err.message); },
    }),
  ]);
  assert.deepEqual(result.map((item) => item.status), ['fulfilled', 'fulfilled', 'fulfilled']);
  assert.equal(refreshCalls, 1);
  assert.deepEqual(restTokens, ['Bearer expired', 'Bearer expired', 'Bearer renewed', 'Bearer renewed']);
  assert.deepEqual(streamTokens, ['Bearer expired', 'Bearer renewed']);
  assert.equal(storage.get('refresh_token'), 'replacement');
  assert.equal(location.href, '/chat');
  assert.equal(done, true);
  assert.deepEqual(errors, []);
});

test('a rotation finishing after account change neither overwrites credentials nor replays the stream', async (t) => {
  setTokens('old-access', 'old-refresh');
  let finishRotation;
  let startRotation;
  const started = new Promise((resolve) => { startRotation = resolve; });
  let streamCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === '/api/v1/auth/refresh') {
      startRotation(true);
      return new Promise((resolve) => { finishRotation = resolve; });
    }
    streamCalls++;
    return new Response(null, { status: 401 });
  });

  const pending = fetchSSE('/stream', { onEvent() {} });
  assert.equal(await Promise.race([started, pending.then(() => false)]), true);
  setTokens('other-account', 'other-refresh');
  finishRotation(Response.json({ access_token: 'wrong-account', refresh_token: 'wrong-refresh' }));
  await pending;
  assert.equal(streamCalls, 1);
  assert.equal(storage.get('access_token'), 'other-account');
  assert.equal(storage.get('refresh_token'), 'other-refresh');
  assert.equal(location.href, '/chat');
});

test('a temporary refresh failure keeps the session available for the next attempt', async (t) => {
  setTokens('temp-access', 'temp-refresh');
  t.mock.method(globalThis, 'fetch', async (url) => new Response(null, {
    status: url === '/api/v1/auth/refresh' ? 503 : 401,
  }));
  const errors = [];
  await fetchSSE('/stream', { onEvent() {}, onError(error) { errors.push(error.message); } });
  assert.deepEqual(errors, ['暂时无法续期，请稍后重试。']);
  assert.equal(storage.get('refresh_token'), 'temp-refresh');
  assert.equal(location.href, '/chat');
});

test('only definitive renewal rejection clears credentials and redirects to login', async (t) => {
  setTokens('rejected-access', 'rejected-refresh');
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(null, { status: 401 });
  });
  await fetchSSE('/stream', { onEvent() {} });
  assert.equal(requests, 2);
  assert.equal(storage.has('access_token'), false);
  assert.equal(storage.has('refresh_token'), false);
  assert.equal(location.href, '/login');
});

test('stopping a stream while renewing does not replay the question', async (t) => {
  setTokens('old-stream-access', 'old-stream-refresh');
  let finishRotation;
  let startRotation;
  const started = new Promise((resolve) => { startRotation = resolve; });
  let streamCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === '/api/v1/auth/refresh') {
      startRotation();
      return new Promise((resolve) => { finishRotation = resolve; });
    }
    streamCalls++;
    return new Response(null, { status: 401 });
  });

  const controller = new AbortController();
  const events = [];
  const pending = fetchSSE('/stream', {
    signal: controller.signal,
    onEvent(event) { events.push(event); },
    onError(error) { events.push(error); },
  });
  await started;
  controller.abort();
  finishRotation(Response.json({ access_token: 'fresh-stream-access', refresh_token: 'fresh-stream-refresh' }));
  await pending;
  assert.equal(streamCalls, 1);
  assert.equal(storage.get('access_token'), 'fresh-stream-access');
  assert.deepEqual(events, []);
});

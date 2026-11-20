import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchSSE } from '../src/api/sse.ts';

async function runStream(t, chunks, { signal, status = 200 } = {}) {
  const events = [];
  const errors = [];
  let done = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(
    new ReadableStream({
      start(controller) {
        for (const bytes of chunks) controller.enqueue(bytes);
        controller.close();
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } },
  ));
  await fetchSSE('/stream', {
    signal,
    onEvent: (event) => events.push(event),
    onError: (error) => errors.push(error.message),
    onDone: () => { done = true; },
  });
  return { events, errors, done };
}

const encode = (text) => new TextEncoder().encode(text);
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null } });

test('handles an SSE stream split across UTF-8 bytes and CRLF boundaries', async (t) => {
  const text = ': keepalive\r\n\r\nevent:token\r\ndata: {"token":\r\ndata: "中文"}\r\n\r\nevent: done\r\ndata: [DONE]\r\n\r\n';
  const result = await runStream(t, Array.from(encode(text), (byte) => Uint8Array.of(byte)));
  assert.deepEqual(result.events, [{ event: 'token', data: { token: '中文' } }]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.done, true);
});

test('reports EOF before completion and preserves partial tokens', async (t) => {
  const result = await runStream(t, [encode('event: token\ndata: "部分答案"\n\n')]);
  assert.deepEqual(result.events, [{ event: 'token', data: '部分答案' }]);
  assert.deepEqual(result.errors, ['回答连接提前关闭。']);
  assert.equal(result.done, false);
});

test('turns an explicit server error into a failure even if done follows', async (t) => {
  const result = await runStream(t, [encode('event: error\ndata: {"message":"模型暂不可用"}\n\nevent: done\ndata: [DONE]\n\n')]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, ['模型暂不可用']);
  assert.equal(result.done, false);
});

test('distinguishes an expired session from a network failure', async (t) => {
  const result = await runStream(t, [], { status: 401 });
  assert.deepEqual(result.errors, ['登录已过期，请重新登录后再试。']);
  assert.equal(result.done, false);
});

test('suppresses failure and completion callbacks on user cancellation', async (t) => {
  const controller = new AbortController();
  controller.abort();
  const result = await runStream(t, [encode('data: [DONE]\n\n')], { signal: controller.signal });
  assert.deepEqual(result, { events: [], errors: [], done: false });
});

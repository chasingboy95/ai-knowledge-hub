export interface SSEEvent {
  event: string;
  data: any;
}

function parseEvent(block: string): SSEEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value || 'message';
    if (field === 'data') dataLines.push(value);
  }

  if (!dataLines.length && event !== 'done') return null;
  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

export async function fetchSSE(
  url: string,
  options: {
    body?: any;
    onEvent: (event: SSEEvent) => void;
    onError?: (err: Error) => void;
    onDone?: () => void;
    signal?: AbortSignal;
  }
) {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    options.signal?.throwIfAborted();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.body || {}),
      signal: options.signal,
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('登录已过期，请重新登录后再试。');
      if (response.status === 403) throw new Error('当前账号无权向此会话发送消息。');
      if (response.status === 429) throw new Error('请求过于频繁，请稍后重试。');
      throw new Error(`回答服务暂不可用（HTTP ${response.status}）。`);
    }
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      throw new Error('回答服务返回了无法识别的数据。');
    }

    reader = response.body?.getReader();
    if (!reader) throw new Error('回答服务没有返回数据。');

    const decoder = new TextDecoder();
    let buffer = '';
    let trailingCR = '';
    while (true) {
      const { done, value } = await reader.read();
      options.signal?.throwIfAborted();
      let text = trailingCR + decoder.decode(value, { stream: !done });
      trailingCR = !done && text.endsWith('\r') ? '\r' : '';
      if (trailingCR) text = text.slice(0, -1);
      buffer += text.replace(/\r\n?/g, '\n');

      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const event = parseEvent(block);
        if (!event) continue;
        if (event.event === 'error') {
          const message = typeof event.data === 'string' ? event.data : event.data?.message ?? event.data?.detail;
          throw new Error(typeof message === 'string' && message.trim() ? message : '回答服务发生错误。');
        }
        if (event.event === 'done' || event.data === '[DONE]') {
          options.onDone?.();
          return;
        }
        options.onEvent(event);
        options.signal?.throwIfAborted();
      }
      if (done) throw new Error('回答连接提前关闭。');
    }
  } catch (err) {
    if (!options.signal?.aborted && !(err instanceof Error && err.name === 'AbortError')) {
      options.onError?.(err instanceof TypeError ? new Error('网络连接中断，请检查连接后再试。')
        : err instanceof Error ? err : new Error('回答请求失败。'));
    }
  } finally {
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

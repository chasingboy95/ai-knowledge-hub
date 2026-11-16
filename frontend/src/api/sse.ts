export interface SSEEvent {
  event: string;
  data: any;
}

export async function fetchSSE(
  url: string,
  options: {
    body?: any;
    onEvent: (event: SSEEvent) => void;
    onError?: (err: any) => void;
    onDone?: () => void;
    signal?: AbortSignal;
  }
) {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.body || {}),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const block of lines) {
        if (!block.trim()) continue;

        let eventType = 'message';
        let dataStr = '';

        const blockLines = block.split('\n');
        for (const line of blockLines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice(6).trim();
          }
        }

        let parsedData: any = dataStr;
        try {
          parsedData = JSON.parse(dataStr);
        } catch {
          // Keep as string
        }

        options.onEvent({ event: eventType, data: parsedData });

        if (eventType === 'done' || dataStr === '[DONE]') {
          options.onDone?.();
          return;
        }
      }
    }
    options.onDone?.();
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      options.onError?.(err);
    }
  }
}

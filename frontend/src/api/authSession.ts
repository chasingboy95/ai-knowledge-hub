export interface AuthSession {
  generation: number;
  accessToken: string | null;
  refreshToken: string | null;
}

let observed: AuthSession | undefined;
let pending: { generation: number; request: Promise<AuthSession | null> } | undefined;

export function readAuthSession(): AuthSession {
  const accessToken = localStorage.getItem('access_token');
  const refreshToken = localStorage.getItem('refresh_token');
  if (observed && accessToken === observed.accessToken && refreshToken === observed.refreshToken) return observed;
  // Only a locally completed rotation preserves the generation. Other storage changes can mean an account switch.
  observed = { accessToken, refreshToken, generation: (observed?.generation ?? 0) + 1 };
  return observed;
}

function expireSession(session: AuthSession) {
  if (readAuthSession().generation !== session.generation) return;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  readAuthSession();
  if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
    window.location.href = '/login';
  }
}

async function rotate(session: AuthSession): Promise<AuthSession | null> {
  let response: Response;
  try {
    response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
  } catch {
    if (readAuthSession().generation !== session.generation) return null;
    throw new Error('暂时无法续期，请稍后重试。');
  }

  if (readAuthSession().generation !== session.generation) return null;
  if (response.status === 401 || response.status === 403) {
    expireSession(session);
    return null;
  }
  if (!response.ok) throw new Error('暂时无法续期，请稍后重试。');

  const data = await response.json().catch(() => null);
  if (readAuthSession().generation !== session.generation) return null;
  if (typeof data?.access_token !== 'string' || !data.access_token ||
      typeof data?.refresh_token !== 'string' || !data.refresh_token) {
    throw new Error('续期服务返回了无法识别的数据。');
  }

  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  observed = { generation: session.generation, accessToken: data.access_token, refreshToken: data.refresh_token };
  return observed;
}

export async function renewAuthSession(requestSession: AuthSession): Promise<AuthSession | null> {
  const current = readAuthSession();
  if (!requestSession.accessToken || current.generation !== requestSession.generation) return null;
  if (current !== requestSession) return current;
  if (!current.refreshToken) {
    expireSession(current);
    return null;
  }

  if (pending?.generation === current.generation) return pending.request;
  const request = rotate(current);
  pending = { generation: current.generation, request };
  try {
    return await request;
  } finally {
    if (pending?.request === request) pending = undefined;
  }
}

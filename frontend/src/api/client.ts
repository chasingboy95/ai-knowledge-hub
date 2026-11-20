import axios, { type InternalAxiosRequestConfig } from 'axios';
import { readAuthSession, renewAuthSession, type AuthSession } from './authSession.ts';

type AuthRequest = InternalAxiosRequestConfig & {
  authRetryGeneration?: number;
};

const requestSessions = new WeakMap<InternalAxiosRequestConfig, AuthSession>();

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config: AuthRequest) => {
  const session = readAuthSession();
  if (config.authRetryGeneration !== undefined && config.authRetryGeneration !== session.generation) {
    throw new axios.CanceledError('账号已切换');
  }
  requestSessions.set(config, session);
  if (session.accessToken) config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request: AuthRequest | undefined = error.config;
    if (error.response?.status !== 401 || !request || request.authRetryGeneration !== undefined ||
        request.signal?.aborted || request.url?.startsWith('/auth/')) {
      throw error;
    }

    const requestedSession = requestSessions.get(request);
    if (!requestedSession) throw error;
    const session = await renewAuthSession(requestedSession);
    if (!session?.accessToken || request.signal?.aborted) throw error;
    request.authRetryGeneration = session.generation;
    return apiClient(request);
  },
);

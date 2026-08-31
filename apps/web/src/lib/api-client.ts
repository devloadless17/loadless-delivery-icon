import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@loadless/shared';

/**
 * The single HTTP doorway for the whole app. Same-origin (dev rewrite / prod
 * Caddy), cookies ride automatically. On 401 it attempts ONE silent refresh
 * (shared across concurrent callers) and retries; if that fails the caller
 * gets the 401 and the auth boundary redirects to /login.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Array<{ field: string; message: string }>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** skip the silent-refresh retry (used by auth endpoints themselves) */
  skipRefresh?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/v1/auth/refresh', { method: 'POST' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, skipRefresh } = options;

  const doFetch = () =>
    fetch(`/api/v1${path}`, {
      method,
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response = await doFetch();

  if (response.status === 401 && !skipRefresh) {
    const refreshed = await tryRefresh();
    if (refreshed) response = await doFetch();
  }

  if (response.status === 204) return undefined as T;

  const json = (await response.json().catch(() => null)) as
    | { data: T }
    | ApiErrorBody
    | null;

  if (!response.ok) {
    const err = json && 'error' in json ? json.error : undefined;
    throw new ApiError(
      response.status,
      err?.code ?? ERROR_CODES.INTERNAL,
      err?.message ?? 'Something went wrong',
      err?.details,
      err?.requestId,
    );
  }

  if (!json || !('data' in json)) {
    throw new ApiError(response.status, ERROR_CODES.INTERNAL, 'Malformed response');
  }
  return json.data;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, 'skipRefresh'>) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

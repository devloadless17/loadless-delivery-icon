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

/** A list response exactly as it comes off the wire — `meta` is what pages it. */
export interface Envelope<T, M> {
  data: T;
  meta: M;
}

let refreshInFlight: Promise<boolean> | null = null;
let endingSession = false;

/**
 * Ending a session — the ONE way to do it.
 *
 * Exported because the socket does it too. Two paths that both meant "you are
 * signed out" but only one of which cleared the cookies is what made this racy:
 * a bare assign('/login') leaves the cookie live, the middleware reads a role
 * out of it and bounces you onto the console you were just thrown out of.
 *
 * A 401 that survives the silent refresh means the session is over — the
 * password was reset by another admin, the account was suspended, a refresh
 * token was reused. Until now nothing acted on that: the caller got an
 * ApiError and the page sat there, chrome intact, every list empty, looking
 * like the app was broken rather than like you had been signed out.
 *
 * The socket does push SESSION_REVOKED for this, but that is a best-effort
 * notification over a channel that may be disconnected, degraded, or racing a
 * force-close. Correctness cannot depend on it, so the HTTP path decides too —
 * and this one runs wherever the app makes a request.
 */
export function endSession(): void {
  if (typeof window === 'undefined' || endingSession) return;
  if (window.location.pathname.startsWith('/login')) return;
  endingSession = true;
  // Clearing the cookies is not tidiness, it is the whole fix. They are
  // HttpOnly, so only the server can remove them, and while they are still
  // there the middleware decodes a role out of them and bounces /login back to
  // a console whose every request 401s — a loop whose only exit is clearing
  // site data by hand. POST /auth/logout is @Public exactly so a session the
  // API has already refused can still end itself.
  void fetch('/api/v1/auth/logout', { method: 'POST' })
    .catch(() => {})
    // ?signedout=1 so the middleware shows the form even if that call failed.
    .finally(() => window.location.assign('/login?signedout=1'));
}

async function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/v1/auth/refresh', { method: 'POST' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function isErrorBody(json: unknown): json is ApiErrorBody {
  return typeof json === 'object' && json !== null && 'error' in json;
}

function hasData(json: unknown): json is { data: unknown } {
  return typeof json === 'object' && json !== null && 'data' in json;
}

/**
 * The one transport: the silent refresh, the retry, and the ApiError mapping
 * all live here so no caller can accidentally opt out of them. It hands back
 * the whole envelope — `request` unwraps it, `requestPage` keeps `meta`.
 */
async function send(
  path: string,
  options: RequestOptions,
): Promise<{ status: number; json: unknown }> {
  const { method = 'GET', body, signal, skipRefresh } = options;
  // FormData sets its own multipart boundary — never stringify or label it.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const doFetch = () =>
    fetch(`/api/v1${path}`, {
      method,
      signal,
      headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });

  let response = await doFetch();

  if (response.status === 401 && !skipRefresh) {
    const refreshed = await tryRefresh();
    if (refreshed) response = await doFetch();
    // The refresh itself was refused: there is no session left to save. The
    // caller still gets its ApiError — the redirect is what happens to the
    // page, not a substitute for handling the failure.
    else endSession();
  }

  if (response.status === 204) return { status: 204, json: null };

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const err = isErrorBody(json) ? json.error : undefined;
    throw new ApiError(
      response.status,
      err?.code ?? ERROR_CODES.INTERNAL,
      err?.message ?? 'Something went wrong',
      err?.details,
      err?.requestId,
    );
  }

  return { status: response.status, json };
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { status, json } = await send(path, options);
  if (status === 204) return undefined as T;
  if (!hasData(json)) throw new ApiError(status, ERROR_CODES.INTERNAL, 'Malformed response');
  return json.data as T;
}

async function requestPage<T, M>(path: string, signal?: AbortSignal): Promise<Envelope<T, M>> {
  const { status, json } = await send(path, { signal });
  if (!hasData(json) || !('meta' in json)) {
    throw new ApiError(status, ERROR_CODES.INTERNAL, 'Malformed response');
  }
  return json as Envelope<T, M>;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  /**
   * A paginated list with its envelope intact — `get` unwraps to `data` alone
   * and would drop the `meta` a table pages off. Reach for this instead of a
   * raw fetch: a raw fetch skips the silent refresh above, so an expired
   * access token turns the list into a permanently empty table.
   */
  page: <T, M>(path: string, signal?: AbortSignal) => requestPage<T, M>(path, signal),
  post: <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, 'skipRefresh'>) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  postForm: <T>(path: string, body: FormData) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

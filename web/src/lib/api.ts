import { API_PREFIX, config } from './config';

/** A failed API call, with the server's error code when there is one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { field: string; issue: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const DEFAULT_TIMEOUT_MS = 20_000;

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
  auth?: boolean; // default true
  signal?: AbortSignal;
};

export type ApiClient = <T>(path: string, options?: Options) => Promise<T>;

export function createApiClient(deps: {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}): ApiClient {
  const doFetch = deps.fetchImpl ?? fetch;

  return async function request<T>(path: string, options: Options = {}): Promise<T> {
    const { method = 'GET', body, query, timeoutMs = DEFAULT_TIMEOUT_MS, auth = true } = options;
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const url = `${deps.baseUrl}${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = await deps.getToken();
      if (!token) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    options.signal?.addEventListener('abort', () => controller.abort());
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      if (options.signal?.aborted) throw new ApiError(0, 'cancelled', 'Cancelled.');
      if (controller.signal.aborted) {
        throw new ApiError(0, 'timeout', 'The server took too long to respond. Try again.');
      }
      throw new ApiError(0, 'network', "Can't reach the server. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string; details?: [] } } | null)?.error;
      throw new ApiError(
        res.status,
        err?.code ?? 'error',
        err?.message ?? 'Something went wrong. Try again.',
        err?.details,
      );
    }
    return data as T;
  };
}

let tokenGetter: () => Promise<string | null> = async () => null;

/** Called by the auth provider so API calls carry the current ID token. */
export function setTokenGetter(getter: () => Promise<string | null>): void {
  tokenGetter = getter;
}

export const api: ApiClient = createApiClient({
  baseUrl: config.apiUrl,
  getToken: () => tokenGetter(),
});

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Try again.';
}

/** Download a file from the API (with the auth header) and save it. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = await tokenGetter();
  if (!token) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${API_PREFIX}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new ApiError(0, 'network', "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new ApiError(res.status, 'error', 'The export didn’t work. Try again.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

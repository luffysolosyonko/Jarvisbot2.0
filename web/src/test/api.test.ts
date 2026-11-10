import { describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient } from '@/lib/api';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('api client', () => {
  it('sends the bearer token and returns JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: 1 }));
    const api = createApiClient({ baseUrl: 'http://x', getToken: async () => 'tok', fetchImpl });
    await expect(api('/me')).resolves.toEqual({ id: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/api/v1/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('encodes query params and JSON bodies', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const api = createApiClient({ baseUrl: 'http://x', getToken: async () => 't', fetchImpl });
    await api('/exercises/bench press/forecast', { query: { target: 225, days: undefined } });
    await api('/logs', { method: 'POST', body: { text: '8x 135lb bench' } });
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe('http://x/api/v1/exercises/bench press/forecast?target=225');
    expect(calls[1][1].body).toBe('{"text":"8x 135lb bench"}');
  });

  it('maps the server error shape to ApiError', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(504, { error: { code: 'ai_timeout', message: 'Jarvis took too long to answer.' } }),
    );
    const api = createApiClient({ baseUrl: 'http://x', getToken: async () => 't', fetchImpl });
    await expect(api('/ask')).rejects.toMatchObject({ status: 504, code: 'ai_timeout', message: 'Jarvis took too long to answer.' });
  });

  it('refuses to call authenticated routes without a token', async () => {
    const fetchImpl = vi.fn();
    const api = createApiClient({ baseUrl: 'http://x', getToken: async () => null, fetchImpl });
    await expect(api('/me')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows unauthenticated calls when asked', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const api = createApiClient({ baseUrl: 'http://x', getToken: async () => null, fetchImpl });
    await expect(api('/health', { auth: false })).resolves.toEqual({ ok: true });
  });

  it('turns network failures into a clear error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const api = createApiClient({ baseUrl: 'http://x', getToken: async () => 't', fetchImpl });
    const err = (await api('/me').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('network');
  });

  it('times out instead of hanging', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const api = createApiClient({ baseUrl: 'http://x', getToken: async () => 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    const pending = api<unknown>('/ask', { timeoutMs: 25_000 }).catch((e: unknown) => e) as Promise<ApiError>;
    await Promise.resolve();
    vi.advanceTimersByTime(25_000);
    const err = await pending;
    expect(err.code).toBe('timeout');
    vi.useRealTimers();
  });
});

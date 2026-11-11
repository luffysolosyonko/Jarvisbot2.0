import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/Toast';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { askStream, parseSse } from '@/lib/askStream';
import { clearCache, persistCache, restoreCache, setSessionHint } from '@/lib/cache';
import type { Log } from '@/lib/types';
import { Entry } from '@/notebook/Entry';

vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api')>();
  return { ...real, authToken: async () => 'tok', api: vi.fn(async () => ({})) };
});

describe('useDelayedFlag', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows nothing for quick waits', () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on), { initialProps: { on: true } });
    act(() => vi.advanceTimersByTime(250));
    rerender({ on: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('shows after 300 ms, then stays at least 400 ms', () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on), { initialProps: { on: true } });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(50));
    rerender({ on: false }); // done 50 ms after showing
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(349));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });
});

function sseBody(chunks: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('askStream', () => {
  it('splits Server-Sent Events, keeping a partial one for later', () => {
    const { events, rest } = parseSse('event: delta\ndata: "Up"\n\nevent: delta\ndata: " 6"\n\nevent: do');
    expect(events).toEqual([
      { event: 'delta', data: '"Up"' },
      { event: 'delta', data: '" 6"' },
    ]);
    expect(rest).toBe('event: do');
  });

  it('passes each piece on as it arrives, then resolves with the saved answer', async () => {
    const fetchImpl = vi.fn(async () =>
      sseBody(['event: delta\ndata: "Bench "\n\nevent: del', 'ta\ndata: "is up."\n\n', 'event: done\ndata: {"id": 4, "answer": "Bench is up."}\n\n']),
    );
    const pieces: string[] = [];
    const done = await askStream('Is my bench up?', (p) => pieces.push(p), { fetchImpl });
    expect(pieces).toEqual(['Bench ', 'is up.']);
    expect(done).toMatchObject({ id: 4, answer: 'Bench is up.' });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('turns an error event, or a refusal before streaming, into a clear error', async () => {
    const failing = vi.fn(async () => sseBody(['event: delta\ndata: "Up"\n\n', 'event: error\ndata: {"code": "ai_timeout", "message": "Jarvis took too long."}\n\n']));
    await expect(askStream('q', () => {}, { fetchImpl: failing })).rejects.toMatchObject({ code: 'ai_timeout' });
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'daily_cap_reached', message: 'Used up.' } }), { status: 429 }));
    await expect(askStream('q', () => {}, { fetchImpl: refused })).rejects.toMatchObject({ status: 429, code: 'daily_cap_reached' });
  });
});

const LOG: Log = {
  id: -5,
  kind: 'workout',
  raw_text: '5x 155lb bench',
  logged_at: '2026-11-10T17:00:00Z',
  local_date: '2026-11-10',
  sets: [
    {
      idx: 0,
      line: 1,
      exercise: 'bench',
      matched_exercise: 'bench',
      reps: 5,
      good_reps: 5,
      failed_reps: 0,
      weight_lb: 155,
      weight_text: '155lb',
      estimated: false,
      bodyweight: false,
      per_hand: false,
      inferred: false,
    },
  ],
  weigh_in: null,
  warnings: [],
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('optimistic entries', () => {
  it('a saving entry shows its note faded, with nothing to edit or delete yet', () => {
    wrap(<Entry log={{ ...LOG, pending: true }} unit="lb" />);
    const note = screen.getByRole('status', { name: 'Saving' });
    expect(note).toHaveClass('is-pending');
    expect(note).toHaveTextContent('↳ Bench · 5 reps · 155 lbs');
    expect(screen.queryByRole('button', { name: 'Delete entry' })).not.toBeInTheDocument();
  });

  it('a failed save keeps the text and offers retry', async () => {
    const onRetry = vi.fn();
    wrap(<Entry log={{ ...LOG, sets: [], failed: 'Can’t reach the server.' }} unit="lb" onRetry={onRetry} onDiscard={vi.fn()} />);
    expect(screen.getByText('5x 155lb bench')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('✗ not saved: Can’t reach the server · retry · discard');
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('session cache', () => {
  afterEach(() => clearCache());

  it('restores the last session’s data for the same user only', async () => {
    setSessionHint('u1');
    const a = new QueryClient();
    const stop = persistCache(a);
    vi.useFakeTimers();
    a.setQueryData(['me'], { id: 1 });
    await a.fetchQuery({ queryKey: ['logs', 'x', 'y'], queryFn: async () => [{ id: 9 }] });
    await a.fetchQuery({ queryKey: ['parse', 'secret'], queryFn: async () => ({ not: 'saved' }) });
    act(() => vi.advanceTimersByTime(1100));
    vi.useRealTimers();
    stop();

    const b = new QueryClient();
    restoreCache(b);
    expect(b.getQueryData(['logs', 'x', 'y'])).toEqual([{ id: 9 }]);
    expect(b.getQueryData(['parse', 'secret'])).toBeUndefined(); // only the listed queries

    setSessionHint('someone-else');
    const c = new QueryClient();
    restoreCache(c);
    expect(c.getQueryData(['logs', 'x', 'y'])).toBeUndefined();
  });

  it('signing out drops entries that failed to save, so the next account never sees them', () => {
    setSessionHint('u1');
    localStorage.setItem('jarvis.unsaved', JSON.stringify([{ key: 'k', text: '8x 135lb bench' }]));
    setSessionHint(null); // what the auth provider does on sign-out
    expect(localStorage.getItem('jarvis.unsaved')).toBeNull();
  });
});

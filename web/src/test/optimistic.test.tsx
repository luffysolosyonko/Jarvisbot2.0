import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSaveLog } from '@/hooks/queries';
import type { Log } from '@/lib/types';

const apiMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api')>();
  return { ...real, api: (path: string, opts?: unknown) => apiMock(path, opts) };
});

const OLD: Log = {
  id: 1,
  kind: 'weight',
  raw_text: '182.4',
  logged_at: '2026-11-09T13:00:00Z',
  local_date: '2026-11-09',
  sets: [],
  weigh_in: { weight_lb: 182.4, note: null, typed: 182.4, typed_unit: 'lb', unit_assumed: true },
  warnings: [],
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  qc.setQueryData(['logs', '2026-10-27', '2026-11-10'], [OLD]); // includes today
  qc.setQueryData(['logs', '2026-11-01', '2026-11-01'], []); // History, another day
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useSaveLog('2026-11-09'), { wrapper });
  return { qc, result };
}

describe('logging is optimistic', () => {
  it('shows the entry as pending at once, only in ranges that include today', async () => {
    let resolve: (v: unknown) => void = () => {};
    apiMock.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { qc, result } = setup();
    act(() => result.current.mutate({ text: '5x 155lb bench', mode: 'workout' }));
    await waitFor(() => expect(qc.getQueryData<Log[]>(['logs', '2026-10-27', '2026-11-10'])).toHaveLength(2));
    const [temp] = qc.getQueryData<Log[]>(['logs', '2026-10-27', '2026-11-10'])!;
    expect(temp).toMatchObject({ raw_text: '5x 155lb bench', pending: true, local_date: '2026-11-09' });
    expect(qc.getQueryData<Log[]>(['logs', '2026-11-01', '2026-11-01'])).toEqual([]);
    resolve({ ...temp, id: 2, pending: undefined });
  });

  it('rolls the feed back if the save fails', async () => {
    apiMock.mockRejectedValue(new Error('offline'));
    const { qc, result } = setup();
    act(() => result.current.mutate({ text: '5x 155lb bench', mode: 'workout' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Log[]>(['logs', '2026-10-27', '2026-11-10'])).toEqual([OLD]);
  });
});

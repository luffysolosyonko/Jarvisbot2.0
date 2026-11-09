import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AskAnswer,
  Dashboard,
  ExerciseDetail,
  ExerciseSummary,
  Forecast,
  Log,
  Me,
  ParseResult,
  Unit,
} from '@/lib/types';

export const keys = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  exercises: ['exercises'] as const,
  exercise: (name: string) => ['exercise', name] as const,
  forecast: (name: string, target: number | null) => ['forecast', name, target] as const,
  logs: (from?: string, to?: string) => ['logs', from ?? '', to ?? ''] as const,
  parse: (text: string) => ['parse', text] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/me') });
}

/** The user's display unit; lb until /me has loaded. */
export function useUnit(): Unit {
  return useMe().data?.settings.set_unit ?? 'lb';
}

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => api<Dashboard>('/dashboard') });
}

export function useExercises() {
  return useQuery({
    queryKey: keys.exercises,
    queryFn: () => api<{ exercises: ExerciseSummary[] }>('/exercises').then((r) => r.exercises),
  });
}

export function useExercise(name: string) {
  return useQuery({
    queryKey: keys.exercise(name),
    queryFn: () => api<ExerciseDetail>(`/exercises/${encodeURIComponent(name)}`),
  });
}

export function useForecast(name: string, targetLb: number | null) {
  return useQuery({
    queryKey: keys.forecast(name, targetLb),
    queryFn: () =>
      api<Forecast>(`/exercises/${encodeURIComponent(name)}/forecast`, {
        query: { target: targetLb ?? undefined, days: 28 },
      }),
    enabled: targetLb !== null,
    retry: false,
  });
}

export function useLogs(from?: string, to?: string) {
  return useQuery({
    queryKey: keys.logs(from, to),
    queryFn: () => api<{ logs: Log[] }>('/logs', { query: { from, to } }).then((r) => r.logs),
  });
}

/** Live preview: parse without saving. `text` should already be debounced. */
export function useParsePreview(text: string) {
  const trimmed = text.trim();
  return useQuery({
    queryKey: keys.parse(trimmed),
    queryFn: ({ signal }) =>
      api<ParseResult>('/parse', { method: 'POST', body: { text: trimmed }, signal }),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
}

export function invalidateTrainingData(qc: QueryClient) {
  return Promise.all(
    ['dashboard', 'exercises', 'exercise', 'forecast', 'logs', 'parse'].map((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    ),
  );
}

export function useSaveLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api<Log>('/logs', { method: 'POST', body: { text } }),
    onSuccess: () => invalidateTrainingData(qc),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Me['settings']>) =>
      api<Me>('/me/settings', { method: 'PATCH', body: patch }),
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me);
      return invalidateTrainingData(qc);
    },
  });
}

/** Server timeout is 15s; allow a little longer for the round trip. */
export const ASK_TIMEOUT_MS = 25_000;

export function useAsk() {
  return useMutation({
    mutationFn: (question: string) =>
      api<AskAnswer>('/ask', { method: 'POST', body: { question }, timeoutMs: ASK_TIMEOUT_MS }),
  });
}

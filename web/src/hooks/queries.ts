import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  Alias,
  AliasMatch,
  AskAnswer,
  CalendarMonth,
  Dashboard,
  ExerciseDetail,
  ExerciseSummary,
  Forecast,
  Log,
  LogMode,
  Me,
  ParseResult,
  SearchResult,
  Stats,
  TodayLogs,
  Unit,
  Usage,
  Volume,
  WeightForecast,
} from '@/lib/types';

export const keys = {
  me: ['me'] as const,
  logs: (from: string, to: string) => ['logs', from, to] as const,
  allLogs: ['logs'] as const,
  dashboard: ['dashboard'] as const,
  exercises: ['exercises'] as const,
  exercise: (name: string) => ['exercise', name] as const,
  calendar: (month: string) => ['calendar', month] as const,
};

/** Anything derived from logs: refresh it all after a log changes. */
function invalidateLogData(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [['logs'], ['dashboard'], ['exercises'], ['exercise'], ['calendar'], ['today'], ['stats'], ['volume'], ['search'], ['forecast'], ['weight-forecast']]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/me') });
}

/** The display unit (and the parser's default for bare set weights). */
export function useUnit(): Unit {
  return useMe().data?.settings?.set_unit ?? 'lb';
}

/** The account's time zone: days start at midnight here (the API agrees). */
export function useTz(): string | undefined {
  return useMe().data?.settings?.tz_name;
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Me['settings']>) => api<Me>('/me/settings', { method: 'PATCH', body: patch }),
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me);
      invalidateLogData(qc);
    },
  });
}

export function useLogs(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: keys.logs(from, to),
    queryFn: () => api<{ logs: Log[] }>('/logs', { query: { from, to } }).then((r) => r.logs),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useParse(text: string, mode: LogMode) {
  const trimmed = text.trim();
  return useQuery({
    queryKey: ['parse', mode, trimmed],
    queryFn: ({ signal }) => api<ParseResult>('/parse', { method: 'POST', body: { text: trimmed, mode }, signal }),
    enabled: trimmed.length > 0,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useSaveLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; mode: LogMode }) => api<Log>('/logs', { method: 'POST', body }),
    onSuccess: () => invalidateLogData(qc),
  });
}

export function useEditLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text, mode }: { id: number; text: string; mode?: LogMode }) =>
      api<Log>(`/logs/${id}`, { method: 'PATCH', body: mode ? { text, mode } : { text } }),
    onSuccess: () => invalidateLogData(qc),
  });
}

export function useDeleteLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/logs/${id}`, { method: 'DELETE' }),
    onSettled: () => invalidateLogData(qc),
  });
}

export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string) =>
      api<AskAnswer>('/ask', { method: 'POST', body: { question }, timeoutMs: 30_000 }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['usage'] }),
  });
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

/** Exercise names, most recently trained first. */
export function useRecentExercises(): string[] {
  const { data } = useExercises();
  return [...(data ?? [])].sort((a, b) => b.last_date.localeCompare(a.last_date)).map((e) => e.exercise);
}

export function useExercise(name: string | null) {
  return useQuery({
    queryKey: keys.exercise(name ?? ''),
    queryFn: () => api<ExerciseDetail>(`/exercises/${encodeURIComponent(name ?? '')}`),
    enabled: !!name,
  });
}

export function useLiftForecast(name: string | null, target: number | null) {
  return useQuery({
    queryKey: ['forecast', name, target],
    queryFn: () =>
      api<Forecast>(`/exercises/${encodeURIComponent(name ?? '')}/forecast`, {
        query: { target: target ?? undefined },
      }),
    enabled: !!name && target !== null && target > 0,
    retry: false,
  });
}

export function useWeightForecast(days = 28) {
  return useQuery({
    queryKey: ['weight-forecast', days],
    queryFn: () => api<WeightForecast>('/weight/forecast', { query: { days } }),
  });
}

export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: () => api<TodayLogs>('/today') });
}

export function useStats(days: number) {
  return useQuery({
    queryKey: ['stats', days],
    queryFn: () => api<Stats>('/stats', { query: { days } }),
    placeholderData: keepPreviousData,
  });
}

export function useVolume(days: number) {
  return useQuery({
    queryKey: ['volume', days],
    queryFn: () => api<Volume>('/volume', { query: { days } }),
    placeholderData: keepPreviousData,
  });
}

export function useCalendar(month: string) {
  return useQuery({
    queryKey: keys.calendar(month),
    queryFn: () => api<CalendarMonth>('/calendar', { query: { month } }),
    placeholderData: keepPreviousData,
  });
}

export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['search', term],
    queryFn: () => api<SearchResult>('/search', { query: { q: term } }),
    enabled: term.length > 0,
  });
}

export function useUsage() {
  return useQuery({ queryKey: ['usage'], queryFn: () => api<Usage>('/usage') });
}

export function useAliases() {
  return useQuery({
    queryKey: ['aliases'],
    queryFn: () => api<{ aliases: Alias[] }>('/aliases').then((r) => r.aliases),
  });
}

export function useAliasMatches() {
  return useQuery({
    queryKey: ['alias-matches'],
    queryFn: () => api<{ matches: AliasMatch[] }>('/aliases/matches').then((r) => r.matches),
  });
}

export function useAddAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { short: string; full: string }) => api<Alias>('/aliases', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['aliases'] });
      void qc.invalidateQueries({ queryKey: ['alias-matches'] });
      invalidateLogData(qc);
    },
  });
}

export function useRemoveAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/aliases/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['aliases'] });
      void qc.invalidateQueries({ queryKey: ['alias-matches'] });
      invalidateLogData(qc);
    },
  });
}

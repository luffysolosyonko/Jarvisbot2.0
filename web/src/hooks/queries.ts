import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  Alias,
  AliasMatch,
  AskAnswer,
  AskMessage,
  CalendarMonth,
  Dashboard,
  DataSummary,
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
  for (const key of [['logs'], ['data-summary'], ['dashboard'], ['exercises'], ['exercise'], ['calendar'], ['today'], ['stats'], ['volume'], ['search'], ['forecast'], ['weight-forecast']]) {
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
    mutationFn: (patch: Partial<Me['settings']> & { display_name?: string }) =>
      api<Me>('/me/settings', { method: 'PATCH', body: patch }),
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

/**
 * Save a log, showing it in the feed right away. If the save fails, the feed is
 * rolled back (the caller puts the text back in the input).
 */
export function useSaveLog(today: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; mode: LogMode }) => api<Log>('/logs', { method: 'POST', body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: keys.allLogs });
      const snapshot = qc.getQueriesData<Log[]>({ queryKey: keys.allLogs });
      const preview = qc.getQueryData<ParseResult>(['parse', body.mode, body.text.trim()]);
      const temp: Log = {
        id: -Date.now(),
        kind: body.mode,
        raw_text: body.text,
        logged_at: new Date().toISOString(),
        local_date: today,
        sets: preview?.sets ?? [],
        weigh_in: preview?.weigh_in ?? null,
        warnings: [],
        pending: true,
      };
      for (const [key, logs] of snapshot) {
        const [, from, to] = key as [string, string, string];
        if (logs && from <= today && today <= to) qc.setQueryData<Log[]>(key, [temp, ...logs]);
      }
      return { snapshot };
    },
    onError: (_e, _body, ctx) => {
      for (const [key, logs] of ctx?.snapshot ?? []) qc.setQueryData(key, logs);
    },
    onSettled: () => invalidateLogData(qc),
  });
}

export function useEditLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text, mode, confirmWeight }: { id: number; text: string; mode?: LogMode; confirmWeight?: boolean }) =>
      api<Log>(`/logs/${id}`, {
        method: 'PATCH',
        body: { text, ...(mode ? { mode } : {}), ...(confirmWeight ? { confirm_weight: true } : {}) },
      }),
    onSuccess: () => invalidateLogData(qc),
  });
}

/** "Keep 176.4": the outlying weigh-in is right, so it counts in the stats again. */
export function useConfirmWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<Log>(`/logs/${id}/confirm`, { method: 'POST' }),
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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ask-history'] });
    },
  });
}

/** Saved questions and answers still in view, oldest first. */
export function useAskHistory() {
  return useQuery({
    queryKey: ['ask-history'],
    queryFn: () => api<{ messages: AskMessage[] }>('/ask/history').then((r) => r.messages),
  });
}

/** Hide every saved question from view (they stay in the database). */
export function useClearAskHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ cleared: number }>('/ask/history/clear', { method: 'POST' }),
    onSuccess: () => qc.setQueryData(['ask-history'], []),
  });
}

/** How much is stored: "N sets · M weigh-ins". */
export function useDataSummary() {
  return useQuery({ queryKey: ['data-summary'], queryFn: () => api<DataSummary>('/me/data') });
}

/** Delete the account and all its data (the server checks the typed DELETE too). */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api<void>('/me', { method: 'DELETE', body: { confirm: 'DELETE' } }),
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

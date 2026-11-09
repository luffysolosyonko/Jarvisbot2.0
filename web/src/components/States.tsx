import type { ReactNode } from 'react';

import { errorMessage } from '@/lib/api';

import { Button } from './Button';

/** Generic text lines, for small panels. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton sk-line" style={{ width: `${100 - i * 15}%` }} />
      ))}
    </div>
  );
}

/** Feed entries: a time, the typed text and a few table rows. */
export function SkeletonEntries({ count = 3 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading entries">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-entry">
          <div className="skeleton sk-caption" />
          <div className="skeleton sk-mono" />
          <div className="skeleton sk-row" />
          <div className="skeleton sk-row" />
        </div>
      ))}
    </div>
  );
}

/** A row of stats above a chart, as on Progress and the lift page. */
export function SkeletonChart() {
  return (
    <div className="stack-4" aria-busy="true" aria-label="Loading chart">
      <div className="stats">
        <div className="skeleton sk-stat" />
        <div className="skeleton sk-stat" />
      </div>
      <div className="skeleton sk-chart" />
    </div>
  );
}

/** A month grid. */
export function SkeletonCalendar() {
  return (
    <div className="stack-3" aria-busy="true" aria-label="Loading calendar">
      <div className="skeleton sk-line" style={{ width: '40%' }} />
      <div className="calendar">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="skeleton sk-cal" />
        ))}
      </div>
    </div>
  );
}

/** One sentence and one action. */
export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="state">
      <p>{message}</p>
      {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <p className="danger">{errorMessage(error)}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

/** Loading (a skeleton shaped like the result), error with retry, or the content. */
export function QueryView<T>({
  query,
  children,
  skeleton,
}: {
  query: { data: T | undefined; isPending: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
}) {
  if (query.error && query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return query.isPending ? <>{skeleton ?? <Skeleton />}</> : null;
  return <>{children(query.data)}</>;
}

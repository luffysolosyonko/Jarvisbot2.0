import { errorMessage } from '@/lib/api';

import { Button } from './Button';

/** Grey placeholder blocks while data loads. */
export function Skeleton({ lines = 3, height = 20 }: { lines?: number; height?: number }) {
  return (
    <div className="stack-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, width: `${100 - i * 15}%` }} />
      ))}
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

/** Loading, error (with retry) or the content. */
export function QueryView<T>({
  query,
  children,
  lines,
}: {
  query: { data: T | undefined; isPending: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => React.ReactNode;
  lines?: number;
}) {
  if (query.error && query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return query.isPending ? <Skeleton lines={lines} /> : null;
  return <>{children(query.data)}</>;
}

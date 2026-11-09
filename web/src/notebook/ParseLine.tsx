import { useParse } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { summarize } from '@/lib/describe';
import type { LogMode, Unit } from '@/lib/types';

import { FixList } from './FixList';

/** A live, one-line read of the input; lines that won't log get their reason and fixes. */
export function ParseLine({
  text,
  mode,
  unit,
  onTextChange,
  onModeChange,
}: {
  text: string;
  mode: LogMode;
  unit: Unit;
  onTextChange: (text: string) => void;
  onModeChange: (mode: LogMode) => void;
}) {
  const debounced = useDebounced(text, 300);
  const parse = useParse(debounced, mode);
  if (!text.trim()) return null;
  if (parse.error) return <span className="danger">{errorMessage(parse.error)}</span>;
  const r = parse.data;
  if (!r) return null;
  const summary = summarize(r, unit);
  return (
    <>
      {summary ? (
        <span className="mono" aria-live="polite">
          {summary}
        </span>
      ) : null}
      {r.warnings.length ? (
        <div className="composer-fixes">
          <FixList
            warnings={r.warnings}
            text={text}
            onApply={(next, m) => {
              onTextChange(next);
              if (m) onModeChange(m);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

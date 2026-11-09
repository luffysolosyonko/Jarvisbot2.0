import { useId } from 'react';

import { SetRows } from '@/components/SetRows';
import { useParse, useRecentExercises } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { exerciseName, weight } from '@/lib/format';
import { replaceName } from '@/lib/text';
import type { ExerciseMatch, LogMode, Unit } from '@/lib/types';

import { FixList } from './FixList';

function NewExercise({ match, onPick }: { match: ExerciseMatch; onPick: (name: string) => void }) {
  const names = useRecentExercises();
  const id = useId();
  return (
    <div className="row t-label">
      <span>
        New exercise: <span className="semibold">{exerciseName(match.matched)}</span>
      </span>
      {names.length ? (
        <>
          <label htmlFor={id} className="visually-hidden">
            Use an existing exercise instead of {match.written}
          </label>
          <select id={id} className="select" style={{ width: 'auto', minHeight: 44 }} value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
            <option value="">Keep as new</option>
            {names.map((n) => (
              <option key={n} value={n}>
                Use {exerciseName(n)}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}

/** Live preview of what the text will log, with reasons and fixes for lines that won't. */
export function Preview({
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
  if (parse.error) return <p className="error-text preview">{errorMessage(parse.error)}</p>;
  const r = parse.data;
  if (!r) return <p className="hint preview" aria-live="polite">Reading…</p>;
  const stale = debounced.trim() !== text.trim() || parse.isFetching;
  const renamed = r.exercises.filter((e) => !e.is_new && e.written !== e.matched);
  return (
    <section className="preview stack-2" aria-label="Preview" aria-busy={stale} style={{ opacity: stale ? 0.7 : 1 }}>
      <div className="t-caption secondary semibold">Preview</div>
      {r.sets.length ? <SetRows sets={r.sets} unit={unit} caption="Preview of parsed sets" /> : null}
      {r.weigh_in ? (
        <p className="t-label mono">
          → {weight(r.weigh_in.weight_lb, unit)}
          {r.weigh_in.note ? <span className="secondary"> · {r.weigh_in.note}</span> : null}
        </p>
      ) : null}
      {renamed.length ? (
        <p className="t-caption secondary">
          {renamed.map((e) => `${e.written} → ${exerciseName(e.matched)}`).join(' · ')}
        </p>
      ) : null}
      {r.exercises
        .filter((e) => e.is_new)
        .map((e) => (
          <NewExercise key={e.written} match={e} onPick={(name) => onTextChange(replaceName(text, e.written, name))} />
        ))}
      {r.warnings.length ? (
        <FixList
          warnings={r.warnings}
          text={text}
          onApply={(next, m) => {
            onTextChange(next);
            if (m) onModeChange(m);
          }}
        />
      ) : null}
    </section>
  );
}

import { useParse } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { outlierReason, outlierTitle, setNotes, weighInNote } from '@/lib/notes';
import type { LogMode, Unit } from '@/lib/types';

import { Notes } from './Entry';
import { FixList } from './FixList';

/**
 * Under the box: an example while it's empty, then the live "↳" read of the input,
 * as the note it will get once saved. A weigh-in that will be flagged says so now;
 * lines that won't log get their reason and fixes.
 */
export function ParseLine({
  text,
  mode,
  unit,
  example,
  onTextChange,
  onModeChange,
}: {
  text: string;
  mode: LogMode;
  unit: Unit;
  example: string; // shown while the box is empty
  onTextChange: (text: string) => void;
  onModeChange: (mode: LogMode) => void;
}) {
  const debounced = useDebounced(text, 300);
  const parse = useParse(debounced, mode);
  if (!text.trim())
    return (
      <p className="preview">
        <span className="note pending">{example}</span>
      </p>
    );
  if (parse.error) return <p className="preview danger">{errorMessage(parse.error)}</p>;
  const r = parse.data;
  if (!r) return null;
  const w = r.weigh_in;
  const notes = w ? [weighInNote(w, unit)] : setNotes(r.sets, unit);
  return (
    <div className="preview" aria-live="polite">
      {w?.flagged ? (
        <p className="note warn-text">
          ↳ {outlierTitle(w)} {outlierReason(w)}
        </p>
      ) : notes.length ? (
        <p className="note" key={notes.map((n) => n.text).join('|')}>
          <Notes lines={notes} />
        </p>
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
    </div>
  );
}

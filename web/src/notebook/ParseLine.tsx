import { useParse } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { setNotes, weighInNote } from '@/lib/notes';
import type { LogMode, Unit } from '@/lib/types';

import { Notes } from './Entry';

/**
 * Under the box: the live "↳" read of the input, as the note it will get once saved.
 * Quiet while you type: half-typed lines ("12x") get no warnings here, just the
 * example until something reads as a set. (Lines that still don't log once saved get
 * their fixes on the entry.)
 */
export function ParseLine({
  text,
  mode,
  unit,
  example,
}: {
  text: string;
  mode: LogMode;
  unit: Unit;
  example: string; // shown until the text reads as something
}) {
  const debounced = useDebounced(text, 300);
  const parse = useParse(debounced, mode);
  const exampleLine = (
    <p className="preview">
      <span className="note pending">{example}</span>
    </p>
  );
  if (!text.trim()) return exampleLine;
  if (parse.error) return <p className="preview danger">{errorMessage(parse.error)}</p>;
  const r = parse.data;
  if (!r) return exampleLine;
  const w = r.weigh_in;
  // Only sets that are complete so far: a name, and a weight (or uw / an estimate).
  const ready = r.sets.filter((x) => (x.matched_exercise ?? x.exercise) && (x.weight_lb !== null || x.bodyweight || x.estimated));
  const notes = w ? [weighInNote(w, unit)] : setNotes(ready, unit);
  if (!w && !notes.length) return exampleLine;
  return (
    <div className="preview" aria-live="polite">
      {notes.length ? (
        <p className="note" key={notes.map((n) => n.text).join('|')}>
          <Notes lines={notes} />
        </p>
      ) : null}
    </div>
  );
}

import { CircleAlert } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/Button';
import { ICON } from '@/components/icons';
import { applyFix } from '@/lib/text';
import type { Fix, LogMode, ParseWarning } from '@/lib/types';

/** A fix that needs a value (a weight, a name): a small input and Apply. */
function TemplateFix({ fix, onApply }: { fix: Fix; onApply: (value: string) => void }) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!open) {
    return (
      <Button size="small" onClick={() => setOpen(true)}>
        {fix.label}…
      </Button>
    );
  }
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onApply(value);
      }}>
      <label htmlFor={id} className="visually-hidden">
        {fix.label}
      </label>
      <input
        id={id}
        className="input mono input-short"
        autoFocus
        placeholder={fix.placeholder ?? ''}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button size="small" type="submit" variant="primary" disabled={!value.trim()}>
        Apply
      </Button>
      <Button size="small" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

/** Each warning with its reason and the parser's suggested fixes as buttons. */
export function FixList({
  warnings,
  text,
  onApply,
  showLine = true,
}: {
  warnings: ParseWarning[];
  text: string;
  onApply: (newText: string, mode: LogMode | null) => void;
  showLine?: boolean;
}) {
  const lines = text.split('\n');
  return (
    <ul className="stack-3">
      {warnings.map((w, i) => (
        <li key={`${w.line}-${i}`}>
          <div className="warn-line">
            <CircleAlert {...ICON} className="danger" aria-hidden="true" />
            <div>
              {showLine && lines[w.line - 1] !== undefined ? (
                <div className="raw">
                  <span className="secondary">Line {w.line}: </span>
                  {lines[w.line - 1]}
                </div>
              ) : null}
              <div className="danger">{w.message}</div>
            </div>
          </div>
          {w.fixes.length ? (
            <div className="fixes" role="group" aria-label={`Fixes for line ${w.line}`}>
              {w.fixes.map((f) =>
                f.template !== null ? (
                  <TemplateFix
                    key={f.label}
                    fix={f}
                    onApply={(v) => {
                      const next = applyFix(text, f, v);
                      if (next !== null) onApply(next, f.mode);
                    }}
                  />
                ) : (
                  <Button
                    key={f.label}
                    size="small"
                    onClick={() => {
                      const next = applyFix(text, f);
                      if (next !== null) onApply(next, f.mode);
                    }}>
                    {f.label}
                  </Button>
                ),
              )}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

import { Check, Pencil, Trash2, Wrench } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';

import { Button, IconButton } from '@/components/Button';
import { ICON } from '@/components/icons';
import { SetRows } from '@/components/SetRows';
import { useToast } from '@/components/Toast';
import { useEditLog, useTz } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { clockTime, weight } from '@/lib/format';
import type { Log, LogMode, Unit } from '@/lib/types';

import { FixList } from './FixList';

/**
 * One saved log: my text on top (unparsed lines marked "Not logged"), the parsed rows
 * underneath, and Edit / Fix / Delete (shown on hover, always on touch).
 */
export function Entry({ log, unit, highlight = false }: { log: Log; unit: Unit; highlight?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [draft, setDraft] = useState(log.raw_text);
  const edit = useEditLog();
  const { deleteWithUndo } = useToast();
  const editId = useId();
  const tz = useTz();
  const time = (iso: string) => clockTime(iso, tz);

  const badLines = new Set(log.warnings.map((w) => w.line));
  const lines = log.raw_text.split('\n');

  function save(text: string, mode?: LogMode | null) {
    edit.mutate(
      { id: log.id, text, mode: mode ?? undefined },
      {
        onSuccess: (saved) => {
          setEditing(false);
          setDraft(saved.raw_text);
          if (!saved.warnings.length) setFixing(false);
        },
      },
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) save(draft);
    } else if (e.key === 'Escape') {
      setEditing(false);
      setDraft(log.raw_text);
    }
  }

  return (
    <article id={`log-${log.id}`} className={`entry${highlight ? ' highlight' : ''}`} aria-label={`${log.kind === 'weight' ? 'Weigh-in' : 'Workout'} at ${time(log.logged_at)}`}>
      <div className="entry-head">
        <span className="t-caption secondary">{time(log.logged_at)}</span>
        <span className="t-caption secondary">· {log.kind === 'weight' ? 'Weight' : 'Workout'}</span>
        <span className="status success">
          <Check size={16} strokeWidth={1.75} aria-hidden="true" />
          Logged
        </span>
        <div className="entry-actions">
          <IconButton label="Edit entry" onClick={() => { setEditing(true); setFixing(false); }}>
            <Pencil {...ICON} />
          </IconButton>
          {log.warnings.length ? (
            <IconButton label="Fix unlogged lines" onClick={() => { setFixing((f) => !f); setEditing(false); }} aria-expanded={fixing}>
              <Wrench {...ICON} />
            </IconButton>
          ) : null}
          <IconButton label="Delete entry" onClick={() => deleteWithUndo(log.id)}>
            <Trash2 {...ICON} />
          </IconButton>
        </div>
      </div>

      {editing ? (
        <div className="stack-2" style={{ marginTop: 8 }}>
          <label htmlFor={editId} className="visually-hidden">
            Edit entry text
          </label>
          <textarea
            id={editId}
            className="textarea mono"
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {edit.error ? <p className="error-text" role="alert">{errorMessage(edit.error)}</p> : null}
          <div className="row">
            <Button size="small" variant="primary" loading={edit.isPending} disabled={!draft.trim()} onClick={() => save(draft)}>
              Save
            </Button>
            <Button size="small" variant="ghost" onClick={() => { setEditing(false); setDraft(log.raw_text); }}>
              Cancel
            </Button>
            <span className="hint">Saving re-parses it.</span>
          </div>
        </div>
      ) : (
        <div className="stack-2" style={{ marginTop: 4 }}>
          <div className="raw">
            {lines.map((line, i) => (
              <div key={i} className="row-between" style={{ gap: 8 }}>
                <span>{line || ' '}</span>
                {badLines.has(i + 1) ? (
                  <span className="status danger" style={{ flex: 'none' }}>
                    Not logged
                    {!fixing ? (
                      <button type="button" className="link-btn t-caption" onClick={() => setFixing(true)}>
                        Fix
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          {log.weigh_in ? (
            <p className="t-label mono">
              → {weight(log.weigh_in.weight_lb, unit)}
              {log.weigh_in.note ? <span className="secondary"> · {log.weigh_in.note}</span> : null}
            </p>
          ) : (
            <SetRows sets={log.sets} unit={unit} caption="Parsed sets" />
          )}
        </div>
      )}

      {fixing && !editing && log.warnings.length ? (
        <div style={{ marginTop: 16 }}>
          <FixList warnings={log.warnings} text={log.raw_text} onApply={(text, mode) => save(text, mode)} />
          {edit.error ? <p className="error-text" role="alert" style={{ marginTop: 8 }}>{errorMessage(edit.error)}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

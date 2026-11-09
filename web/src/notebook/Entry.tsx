import { Check, Pencil, Trash2, Wrench } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';

import { Button, IconButton } from '@/components/Button';
import { ICON } from '@/components/icons';
import { SetRows } from '@/components/SetRows';
import { useToast } from '@/components/Toast';
import { useEditLog, useTz } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { logSummary } from '@/lib/describe';
import { messageTime, todayIn, weight } from '@/lib/format';
import type { Log, LogMode, Unit } from '@/lib/types';

import { FixList } from './FixList';

/**
 * One saved log: what you typed, and a green check chip once it's logged (click it
 * for the parsed sets). Edit, Fix and Delete show on hover, always on touch. The
 * feed shows the time once per group of entries.
 */
export function Entry({ log, unit, highlight = false }: { log: Log; unit: Unit; highlight?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [details, setDetails] = useState(false);
  const [draft, setDraft] = useState(log.raw_text);
  const edit = useEditLog();
  const { deleteWithUndo } = useToast();
  const tz = useTz();
  const editId = useId();
  const detailsId = useId();

  const badLines = new Set(log.warnings.map((w) => w.line));
  const lines = log.raw_text.split('\n');
  const when = messageTime(log.logged_at, tz, todayIn(tz));

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
    <article id={`log-${log.id}`} className={`msg${highlight ? ' highlight' : ''}`} aria-label={`${log.kind === 'weight' ? 'Weigh-in' : 'Workout'}, ${when}`}>
      {log.pending ? null : (
          <div className="entry-actions">
            <IconButton
              label="Edit entry"
              onClick={() => {
                setEditing(true);
                setFixing(false);
              }}>
              <Pencil {...ICON} />
            </IconButton>
            {log.warnings.length ? (
              <IconButton
                label="Fix unlogged lines"
                onClick={() => {
                  setFixing((f) => !f);
                  setEditing(false);
                }}
                aria-expanded={fixing}>
                <Wrench {...ICON} />
              </IconButton>
            ) : null}
            <IconButton label="Delete entry" onClick={() => deleteWithUndo(log.id)}>
              <Trash2 {...ICON} />
            </IconButton>
          </div>
      )}

      {editing ? (
        <div className="stack-2 entry-edit">
          <label htmlFor={editId} className="visually-hidden">
            Edit entry text
          </label>
          <textarea
            id={editId}
            className="textarea"
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {edit.error ? (
            <p className="error-text" role="alert">
              {errorMessage(edit.error)}
            </p>
          ) : null}
          <div className="row">
            <Button size="small" variant="primary" loading={edit.isPending} disabled={!draft.trim()} onClick={() => save(draft)}>
              Save
            </Button>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(log.raw_text);
              }}>
              Cancel
            </Button>
            <span className="hint">Escape to cancel · Enter to save</span>
          </div>
        </div>
      ) : (
        <div className="msg-body">
          {lines.map((line, i) => (
            <div key={i} className="raw-line">
              <span>{line || ' '}</span>
              {badLines.has(i + 1) ? (
                <span className="status danger no-shrink">
                  Not logged
                  {!fixing ? (
                    <button type="button" className="link-btn" onClick={() => setFixing(true)}>
                      Fix
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {!editing ? (
        <div className="msg-reactions">
          {log.pending ? (
            <span className="hint" role="status">
              Saving…
            </span>
          ) : (
            <button
              type="button"
              className="reaction"
              aria-expanded={details}
              aria-controls={detailsId}
              aria-label={`Logged: ${logSummary(log, unit)}. ${details ? 'Hide' : 'Show'} details`}
              onClick={() => setDetails((d) => !d)}>
              <Check {...ICON} className="success" aria-hidden="true" />
              <span>{logSummary(log, unit)}</span>
            </button>
          )}
        </div>
      ) : null}

      {details && !editing ? (
        <div id={detailsId} className="msg-details">
          {log.weigh_in ? (
            <p className="t-label tnum">
              → {weight(log.weigh_in.weight_lb, unit)}
              {log.weigh_in.note ? <span className="secondary"> · {log.weigh_in.note}</span> : null}
            </p>
          ) : (
            <SetRows sets={log.sets} unit={unit} caption="Parsed sets" />
          )}
        </div>
      ) : null}

      {fixing && !editing && log.warnings.length ? (
        <div className="stack-2 entry-fix">
          <FixList warnings={log.warnings} text={log.raw_text} onApply={(text, mode) => save(text, mode)} />
          {edit.error ? (
            <p className="error-text" role="alert">
              {errorMessage(edit.error)}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

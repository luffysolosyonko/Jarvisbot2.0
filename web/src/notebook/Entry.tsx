import { Pencil, Trash2, Wrench } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';

import { Button, IconButton } from '@/components/Button';
import { ICON } from '@/components/icons';
import { SetRows } from '@/components/SetRows';
import { useToast } from '@/components/Toast';
import { useConfirmWeight, useEditLog, useTz } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { logSummary } from '@/lib/describe';
import { clockTime, fromLb, messageTime, num, todayIn } from '@/lib/format';
import { otherUnit, outlierReason, outlierTitle, setNotes, weighInNote, withExplicitUnit, type NoteLine } from '@/lib/notes';
import type { Log, LogMode, Unit } from '@/lib/types';

import { FixList } from './FixList';

/** "↳ Bench · 3 reps · 155 lb · ✗ last rep": the fail part in bold rust. */
export function Notes({ lines }: { lines: NoteLine[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} className="note-line block">
          ↳ {l.text}
          {l.fail ? (
            <>
              {' · '}
              <span className="fail">{l.fail}</span>
            </>
          ) : null}
        </span>
      ))}
    </>
  );
}

/**
 * A weigh-in far from the 7-day average (or typed without a unit): ask before it
 * counts. "It was 80 lb" rewrites the entry with that unit; "Keep" confirms it.
 */
function OutlierBox({ log, unit, onEdit }: { log: Log; unit: Unit; onEdit: () => void }) {
  const w = log.weigh_in!;
  const edit = useEditLog();
  const confirm = useConfirmWeight();
  const error = edit.error ?? confirm.error;
  const busy = edit.isPending || confirm.isPending;
  const alt = otherUnit(w);
  return (
    <div className="warn" role="group" aria-label="Check this weigh-in">
      <p className="warn-title tnum">↳ {outlierTitle(w)}</p>
      <p className="warn-body">{outlierReason(w)}</p>
      <div className="warn-actions">
        {w.unit_assumed && w.typed !== null ? (
          <Button
            variant="ink"
            disabled={busy}
            onClick={() => edit.mutate({ id: log.id, text: withExplicitUnit(log.raw_text, w.typed!, alt), confirmWeight: true })}>
            It was {num(w.typed)} {alt}
          </Button>
        ) : null}
        <Button disabled={busy} onClick={() => confirm.mutate(log.id)}>
          Keep {fromLb(w.weight_lb, unit).toFixed(1)}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onEdit}>
          Edit
        </Button>
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {errorMessage(error)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One saved log on the ruled page: the time in the margin, what you typed in mono,
 * and the "↳" note of what it logged (click it for the parsed sets). Edit, Fix and
 * Delete show on hover, always on touch.
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
  const flagged = !!log.weigh_in?.flagged;
  const notes = log.weigh_in ? [weighInNote(log.weigh_in, unit)] : setNotes(log.sets, unit);

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

  function startEdit() {
    setDraft(log.raw_text);
    setEditing(true);
    setFixing(false);
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
    <article
      id={`log-${log.id}`}
      className={`entry${highlight ? ' highlight' : ''}`}
      aria-label={`${log.kind === 'weight' ? 'Weigh-in' : 'Workout'}, ${when}`}>
      <time className="entry-time" dateTime={log.logged_at}>
        {clockTime(log.logged_at, tz)}
      </time>
      <div className="entry-main">
        {log.pending ? null : (
          <div className="entry-actions">
            <IconButton label="Edit entry" onClick={startEdit}>
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
              className="textarea mono"
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
            </div>
          </div>
        ) : (
          <div className="entry-text">
            {lines.map((line, i) => (
              <div key={i} className="raw-line">
                <span>{line || ' '}</span>
                {badLines.has(i + 1) ? (
                  <span className="status danger no-shrink">
                    ✗ Not logged
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

        {editing ? null : log.pending ? (
          <span className="note pending" role="status">
            ↳ saving…
          </span>
        ) : flagged ? (
          <OutlierBox log={log} unit={unit} onEdit={startEdit} />
        ) : notes.length ? (
          <button
            type="button"
            className="note"
            aria-expanded={details}
            aria-controls={detailsId}
            aria-label={`Logged: ${logSummary(log, unit)}. ${details ? 'Hide' : 'Show'} details`}
            onClick={() => setDetails((d) => !d)}>
            <Notes lines={notes} />
          </button>
        ) : null}

        {details && !editing && !log.weigh_in ? (
          <div id={detailsId} className="entry-details">
            <SetRows sets={log.sets} unit={unit} caption="Parsed sets" />
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
      </div>
    </article>
  );
}

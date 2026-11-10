import { ChevronRight, Minus, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { useAuth } from '@/auth/AuthProvider';
import { Dots } from '@/components/Loading';
import { Segmented } from '@/components/Segmented';
import { QueryView } from '@/components/States';
import {
  useAliases,
  useDataSummary,
  useDeleteAccount,
  useImportJarvis1,
  useMe,
  useUpdateSettings,
} from '@/hooks/queries';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { useTitle } from '@/hooks/useTitle';
import { downloadFile, errorMessage } from '@/lib/api';
import { exerciseName, fromLb, num, toLb } from '@/lib/format';
import type { Me, Unit } from '@/lib/types';

import { ChangePassword } from './ChangePassword';

const PROVIDERS: Record<string, string> = { password: 'email', 'google.com': 'Google', custom: 'demo' };

/** A labelled row: name and caption on the left, the control on the right. */
function Row({ label, caption, children, id }: { label: ReactNode; caption?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-label" id={id}>
          {label}
        </div>
        {caption ? <div className="set-caption">{caption}</div> : null}
      </div>
      {children ? <div className="set-control">{children}</div> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="set-section" aria-labelledby={id}>
      <h2 className="set-heading" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The name, edited in place: click it, type, Enter (or click away) saves. */
function DisplayName({ me }: { me: Me }) {
  const update = useUpdateSettings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(me.display_name ?? '');
  const id = useId();
  function commit() {
    setEditing(false);
    if (draft.trim() !== (me.display_name ?? '')) update.mutate({ display_name: draft.trim() });
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') {
      setDraft(me.display_name ?? '');
      setEditing(false);
    }
  }
  if (editing)
    return (
      <>
        <label htmlFor={id} className="visually-hidden">
          Your name
        </label>
        <input
          id={id}
          className="set-name-input"
          value={draft}
          maxLength={60}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
        />
      </>
    );
  return (
    <button type="button" className="set-name" onClick={() => setEditing(true)} title="Edit your name">
      {me.display_name || <span className="set-placeholder">Add your name</span>}
    </button>
  );
}

/** −/+ for "Double-check weigh-ins": 1–15%, saved as you press. */
function Stepper({ value, onChange, labelledBy }: { value: number; onChange: (v: number) => void; labelledBy: string }) {
  return (
    <div className="stepper" role="group" aria-labelledby={labelledBy}>
      <button type="button" className="step-btn" aria-label="Less" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <Minus size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      <output className="step-value" aria-live="polite">
        {value}%
      </output>
      <button type="button" className="step-btn" aria-label="More" disabled={value >= 15} onClick={() => onChange(value + 1)}>
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

function BarWeight({ me }: { me: Me }) {
  const unit = me.settings.set_unit;
  const [value, setValue] = useState(num(fromLb(me.settings.bar_lb, unit)));
  const update = useUpdateSettings();
  const id = useId();
  function save(e?: FormEvent) {
    e?.preventDefault();
    const v = Number(value);
    const lb = Math.round(toLb(v, unit) * 10) / 10;
    if (Number.isFinite(v) && v >= 0 && lb !== me.settings.bar_lb) update.mutate({ bar_lb: lb });
  }
  return (
    <form className="set-inline" onSubmit={save}>
      <label htmlFor={id} className="visually-hidden">
        Bar weight in {unit}
      </label>
      <input id={id} className="set-number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => save()} />
      <span className="set-unit">{unit}</span>
    </form>
  );
}

/** "bench → Bench press · 3 more" */
function AliasCaption() {
  const aliases = useAliases();
  const list = aliases.data ?? [];
  if (!list.length) return <>Shortcuts like sldl → Stiff leg deadlift</>;
  const [first] = list;
  return (
    <>
      {first.short} → {exerciseName(first.full)}
      {list.length > 1 ? ` · ${list.length - 1} more` : ''}
    </>
  );
}

const SHORTHAND: [string, string][] = [
  ['8x 160lb bench', 'reps, weight, exercise'],
  ['5x 70kg squat', 'kg becomes lb'],
  ['10x uw dips', 'bodyweight'],
  ['3x 70/80kg row', 'estimated weight'],
  ['5x2f 135lb', '2 reps failed'],
  ['3xf 155lb', 'last rep failed'],
];

function ImportRow() {
  const run = useImportJarvis1();
  const input = useRef<HTMLInputElement>(null);
  const busy = useDelayedFlag(run.isPending);
  const r = run.data;
  return (
    <Row
      label="Import from Jarvis 1.0"
      caption={
        run.isPending ? (
          busy ? (
            <span role="status">
              Importing
              <Dots />
            </span>
          ) : (
            'The Discord bot’s jarvis.db file'
          )
        ) : run.error ? (
          <span className="set-error" role="alert">
            {errorMessage(run.error)}
          </span>
        ) : r ? (
          <span role="status">
            Imported {r.imported} {r.imported === 1 ? 'entry' : 'entries'}
            {r.duplicates ? ` · ${r.duplicates} already here` : ''}
            {r.unreadable ? ` · ${r.unreadable} unreadable` : ''}
            {r.aliases_added ? ` · ${r.aliases_added} names` : ''}
          </span>
        ) : (
          'The Discord bot’s jarvis.db file; duplicates are skipped'
        )
      }>
      <input
        ref={input}
        type="file"
        accept=".db,.sqlite,.sqlite3,application/x-sqlite3,application/vnd.sqlite3"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run.mutate(f);
          e.target.value = '';
        }}
      />
      <button type="button" className="set-action" disabled={run.isPending} onClick={() => input.current?.click()}>
        Choose file
      </button>
    </Row>
  );
}

function ExportRow() {
  const summary = useDataSummary();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = summary.data;
  return (
    <Row
      label="Export as CSV"
      caption={
        error ? (
          <span className="set-error" role="alert">
            {error}
          </span>
        ) : d ? (
          `${d.sets.toLocaleString()} sets · ${d.weigh_ins.toLocaleString()} weigh-ins`
        ) : (
          'Every entry, one file'
        )
      }>
      <button
        type="button"
        className="set-action"
        disabled={busy}
        onClick={() => {
          setError(null);
          setBusy(true);
          downloadFile('/export/all.csv', 'jarvis-entries.csv')
            .catch((e: unknown) => setError(errorMessage(e)))
            .finally(() => setBusy(false));
        }}>
        Download
      </button>
    </Row>
  );
}

/** Type DELETE to delete the account and everything in it. */
function DeleteDialog({ onClose }: { onClose: () => void }) {
  const del = useDeleteAccount();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('input')?.focus();
  }, []);
  const ready = typed === 'DELETE';
  return (
    <div className="popup-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="panel-header">
          <h2 className="t-heading" id={`${id}-t`}>
            Delete account
          </h2>
        </div>
        <form
          className="panel-body stack-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            del.mutate(undefined, {
              onSuccess: async () => {
                await signOut();
                navigate('/sign-in', { replace: true });
              },
            });
          }}>
          <p id={`${id}-d`}>
            This deletes your account and every entry, weigh-in, exercise name and question in it. It can’t be undone.
            Export a CSV first if you want a copy.
          </p>
          <div className="field">
            <label htmlFor={`${id}-i`}>Type DELETE to confirm</label>
            <input
              id={`${id}-i`}
              className="input mono"
              value={typed}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          {del.error ? (
            <p className="error-text" role="alert">
              {errorMessage(del.error)}
            </p>
          ) : null}
          <div className="row">
            <button type="submit" className="btn btn-danger" disabled={!ready || del.isPending} aria-busy={del.isPending || undefined}>
              {del.isPending ? 'Deleting…' : 'Delete everything'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SettingsPage() {
  useTitle('Settings');
  const me = useMe();
  const update = useUpdateSettings();
  const { signOut, hasPassword } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const checkId = useId();

  return (
    <main className="main settings" id="main">
      <div className="page-header">
        <h1 className="t-title">Settings</h1>
      </div>
      <QueryView query={me}>
        {(m) => (
          <>
            <Section title="Account">
              <div className="set-row set-account">
                <div className="set-text">
                  <DisplayName key={m.display_name ?? ''} me={m} />
                  <div className="set-meta">
                    {m.email ?? 'no email'} · {PROVIDERS[m.auth_provider] ?? m.auth_provider}
                  </div>
                </div>
              </div>
              {hasPassword ? (
                <>
                  <Row label="Password">
                    <button
                      type="button"
                      className="set-action"
                      aria-expanded={showPassword}
                      onClick={() => setShowPassword((s) => !s)}>
                      {showPassword ? 'Close' : 'Change'}
                    </button>
                  </Row>
                  {showPassword ? (
                    <div className="set-expand">
                      <ChangePassword />
                    </div>
                  ) : null}
                </>
              ) : null}
            </Section>

            <Section title="Logging">
              <Row label="Show weights in" caption="Always stored in lb">
                <Segmented<Unit>
                  label="Show weights in"
                  value={m.settings.set_unit}
                  onChange={(u) => update.mutate({ set_unit: u })}
                  options={[
                    { value: 'lb', label: 'lb' },
                    { value: 'kg', label: 'kg' },
                  ]}
                />
              </Row>
              <Row label="Double-check weigh-ins" caption="When off your 7-day average by" id={checkId}>
                <Stepper value={m.settings.outlier_pct ?? 5} labelledBy={checkId} onChange={(v) => update.mutate({ outlier_pct: v })} />
              </Row>
              <Link to="/settings/names" className="set-row set-link">
                <div className="set-text">
                  <div className="set-label">Exercise names</div>
                  <div className="set-caption">
                    <AliasCaption />
                  </div>
                </div>
                <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" className="set-chevron" />
              </Link>
              <Row label="Bar weight" caption="What “bar” means, like 8x bar bench">
                <BarWeight key={`${m.settings.set_unit}-${m.settings.bar_lb}`} me={m} />
              </Row>
              {update.error ? (
                <p className="error-text" role="alert">
                  {errorMessage(update.error)}
                </p>
              ) : null}
            </Section>

            <Section title="Shorthand">
              <dl className="shorthand">
                {SHORTHAND.map(([ex, what]) => (
                  <div key={ex} className="shorthand-row">
                    <dt>{ex}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section title="Your data">
              <ImportRow />
              <ExportRow />
            </Section>

            <section className="set-section set-end" aria-label="Sign out or delete">
              <button type="button" className="btn btn-block set-signout" onClick={() => void signOut()}>
                Sign out
              </button>
              {m.is_demo ? (
                <p className="set-caption set-center">The shared demo account can’t be deleted.</p>
              ) : (
                <button type="button" className="set-delete" onClick={() => setDeleting(true)}>
                  Delete account and data
                </button>
              )}
            </section>

            <footer className="set-footer">Jarvis 2.0 · built by Tom</footer>
            {deleting ? <DeleteDialog onClose={() => setDeleting(false)} /> : null}
          </>
        )}
      </QueryView>
    </main>
  );
}

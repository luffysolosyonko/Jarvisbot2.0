import { ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { useAuth } from '@/auth/AuthProvider';
import { Segmented } from '@/components/Segmented';
import { QueryView } from '@/components/States';
import {
  useAliases,
  useDataSummary,
  useDeleteAccount,
  useMe,
  useUpdateSettings,
} from '@/hooks/queries';
import { useTitle } from '@/hooks/useTitle';
import { downloadFile, errorMessage } from '@/lib/api';
import { exerciseName } from '@/lib/format';
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

/** Your name: shown with an Edit button; Enter or Save keeps it, Escape cancels. */
function DisplayName({ me }: { me: Me }) {
  const update = useUpdateSettings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(me.display_name ?? '');
  const id = useId();
  function save(e?: FormEvent) {
    e?.preventDefault();
    setEditing(false);
    if (draft.trim() !== (me.display_name ?? '')) update.mutate({ display_name: draft.trim() });
  }
  function cancel() {
    setDraft(me.display_name ?? '');
    setEditing(false);
  }
  if (editing)
    return (
      <form className="set-row set-name-form" onSubmit={save}>
        <label htmlFor={id} className="visually-hidden">
          Your name
        </label>
        <input
          id={id}
          className="set-name-input"
          value={draft}
          maxLength={60}
          autoFocus
          autoComplete="name"
          placeholder="Your name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Escape' && cancel()}
        />
        <button type="submit" className="set-action">
          Save
        </button>
      </form>
    );
  return (
    <Row label="Name" caption={me.display_name || 'Not set'}>
      <button type="button" className="set-action" onClick={() => setEditing(true)}>
        Edit
      </button>
    </Row>
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
                  <div className="set-label">{m.email ?? 'No email'}</div>
                  <div className="set-meta">signed in with {PROVIDERS[m.auth_provider] ?? m.auth_provider}</div>
                </div>
              </div>
              <DisplayName key={m.display_name ?? ''} me={m} />
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
              <Link to="/settings/names" className="set-row set-link">
                <div className="set-text">
                  <div className="set-label">Exercise names</div>
                  <div className="set-caption">
                    <AliasCaption />
                  </div>
                </div>
                <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" className="set-chevron" />
              </Link>
              {update.error ? (
                <p className="error-text" role="alert">
                  {errorMessage(update.error)}
                </p>
              ) : null}
            </Section>

            <Section title="Your data">
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

            <footer className="set-footer">Jarvis 2.0</footer>
            {deleting ? <DeleteDialog onClose={() => setDeleting(false)} /> : null}
          </>
        )}
      </QueryView>
    </main>
  );
}

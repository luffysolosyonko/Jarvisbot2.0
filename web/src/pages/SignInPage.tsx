import { Eye, EyeOff } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useTitle } from '@/hooks/useTitle';
import { errorMessage } from '@/lib/api';
import { Dots } from '@/components/Loading';
import { PasswordRules } from '@/components/PasswordRules';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { passwordOk } from '@/lib/password';

type View = 'sign-in' | 'sign-up' | 'reset';
type Busy = 'email' | 'google' | null;

/** Google's standard "G" mark, unaltered (per Google's sign-in branding guidelines). */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** A button label that turns into "Signing in" + filling dots while busy (after
 * 300 ms). The button is full width, so its size never changes. */
function BusyLabel({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  const show = useDelayedFlag(busy);
  if (!show) return <>{label}</>;
  return (
    <span className="busy-label">
      {busyLabel}
      <Dots />
      <span className="visually-hidden">…</span>
    </span>
  );
}

/**
 * A minimal sign-in page in the logbook style: the wordmark, two underlined fields,
 * Sign in and Google, and Create account pinned to the bottom. The demo is an
 * ordinary email/password account (see docs/DEMO.md).
 * The same page handles creating an account and resetting a password.
 */
export function SignInPage() {
  const { signIn, signUp, resetPassword, signInWithGoogle } = useAuth();
  const [view, setView] = useState<View>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [flagRules, setFlagRules] = useState(false); // after a refused submit
  const passwordRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(kind: Busy, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function go(next: View) {
    setView(next);
    setFlagRules(false);
    setError(null);
    setNotice(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (view === 'reset') {
      void run('email', async () => {
        await resetPassword(email);
        setNotice('If that address has an account, a reset link is on its way.');
      });
    } else if (view === 'sign-up' && !passwordOk(password)) {
      // The button stays enabled: point at what's missing instead.
      setError(null);
      setNotice(null);
      setFlagRules(true);
      passwordRef.current?.focus();
    } else {
      void run('email', () => (view === 'sign-in' ? signIn(email, password) : signUp(email, password)));
    }
  }

  useTitle(view === 'sign-in' ? 'Sign in' : view === 'sign-up' ? 'Create account' : 'Reset password');
  const submitLabel = view === 'sign-in' ? 'Sign in' : view === 'sign-up' ? 'Create account' : 'Send reset link';

  return (
    <main className="auth" id="main">
      <div className="auth-body">
        <header className="auth-head">
          <h1 className="auth-wordmark">
            Jarvis
            <img className="auth-logo" src="/logo.png" alt="" width={56} height={56} />
          </h1>
          <p className="auth-tagline">
            <span>Workout</span> <span className="accent">↳ logged.</span>
          </p>
        </header>

        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="email">Email</label>
            </div>
            <input
              id="email"
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {view !== 'reset' ? (
            <div className="auth-field">
              <div className="auth-label-row">
                <label htmlFor="password">Password</label>
                {view === 'sign-in' ? (
                  <button type="button" className="auth-link" onClick={() => go('reset')}>
                    Forgot?
                  </button>
                ) : null}
              </div>
              <div className="auth-password">
                <input
                  id="password"
                  ref={passwordRef}
                  className="auth-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={view === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={view === 'sign-up' ? 'password-rules' : undefined}
                  aria-invalid={view === 'sign-up' && flagRules && !passwordOk(password) ? true : undefined}
                  spellCheck={false}
                  required
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((s) => !s)}>
                  {showPassword ? <EyeOff size={20} strokeWidth={1.8} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.8} aria-hidden="true" />}
                </button>
              </div>
              {view === 'sign-up' ? (
                <PasswordRules id="password-rules" password={password} flag={flagRules} />
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="t-label" role="status">
              {notice}
            </p>
          ) : null}

          <div className="auth-buttons">
            <button
              type="submit"
              className="auth-btn auth-btn-ink"
              disabled={!!busy}
              aria-busy={busy === 'email' || undefined}>
              <BusyLabel
                busy={busy === 'email'}
                label={submitLabel}
                busyLabel={view === 'sign-in' ? 'Signing in' : view === 'sign-up' ? 'Creating account' : 'Sending'}
              />
            </button>
            {view !== 'reset' ? (
              <button
                type="button"
                className="auth-btn auth-btn-google"
                disabled={!!busy}
                aria-busy={busy === 'google' || undefined}
                onClick={() => void run('google', signInWithGoogle)}>
                <GoogleG />
                <BusyLabel busy={busy === 'google'} label="Continue with Google" busyLabel="Signing in" />
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <footer className="auth-foot">
        {view === 'sign-in' ? (
          <button type="button" className="auth-link auth-foot-link accent" onClick={() => go('sign-up')}>
            Create account
          </button>
        ) : (
          <button type="button" className="auth-link auth-foot-link accent" onClick={() => go('sign-in')}>
            Back to sign in
          </button>
        )}
      </footer>
    </main>
  );
}

import { useState, type FormEvent } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { errorMessage } from '@/lib/api';

type View = 'sign-in' | 'sign-up' | 'reset';
type Busy = 'email' | 'google' | 'demo' | null;

export function SignInPage() {
  const { signIn, signUp, resetPassword, signInWithGoogle, signInDemo } = useAuth();
  const [view, setView] = useState<View>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  function submit(e: FormEvent) {
    e.preventDefault();
    if (view === 'reset') {
      void run('email', async () => {
        await resetPassword(email);
        setNotice('If that address has an account, a reset link is on its way.');
      });
    } else {
      void run('email', () => (view === 'sign-in' ? signIn(email, password) : signUp(email, password)));
    }
  }

  const title = view === 'sign-in' ? 'Sign in to Jarvis' : view === 'sign-up' ? 'Create your account' : 'Reset your password';

  return (
    <main className="auth" id="main">
      <div className="stack-1" style={{ marginBottom: 32 }}>
        <h1 className="t-title">{title}</h1>
        <p className="t-label secondary">Type your workout like a note. Jarvis does the rest.</p>
      </div>

      <form className="stack-4" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {view !== 'reset' ? (
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={view === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
        <Button type="submit" variant="primary" block loading={busy === 'email'} disabled={!!busy && busy !== 'email'}>
          {view === 'sign-in' ? 'Sign in' : view === 'sign-up' ? 'Create account' : 'Send reset link'}
        </Button>
      </form>

      <div className="row" style={{ marginTop: 16 }}>
        {view === 'sign-in' ? (
          <>
            <button type="button" className="link-btn" onClick={() => setView('reset')}>
              Forgot password?
            </button>
            <span className="secondary" aria-hidden="true">
              ·
            </span>
            <button type="button" className="link-btn" onClick={() => setView('sign-up')}>
              Create an account
            </button>
          </>
        ) : (
          <button type="button" className="link-btn" onClick={() => setView('sign-in')}>
            Back to sign in
          </button>
        )}
      </div>

      <hr className="divider" />

      <div className="stack-2">
        <Button block loading={busy === 'google'} disabled={!!busy && busy !== 'google'} onClick={() => void run('google', signInWithGoogle)}>
          Continue with Google
        </Button>
        <Button block loading={busy === 'demo'} disabled={!!busy && busy !== 'demo'} onClick={() => void run('demo', signInDemo)}>
          Try the demo
        </Button>
        <p className="hint">The demo account has 12 weeks of made-up training data.</p>
      </div>
    </main>
  );
}

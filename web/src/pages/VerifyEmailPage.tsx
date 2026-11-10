import { useEffect, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useTitle } from '@/hooks/useTitle';
import { errorMessage } from '@/lib/api';

const RESEND_WAIT_S = 60;

/**
 * The second step of creating an account: confirm the email address. Until the link
 * in that email is opened, the account can't use the app (the API refuses it too),
 * so scripts can't create accounts in bulk and start using them.
 */
export function VerifyEmailPage() {
  useTitle('Verify your email');
  const { user, refreshUser, resendVerification, signOut } = useAuth();
  const [busy, setBusy] = useState<'check' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_WAIT_S); // the first email was just sent

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function check() {
    setBusy('check');
    setError(null);
    setNotice(null);
    try {
      const verified = await refreshUser();
      if (!verified) setError('Not verified yet. Open the link in the email first, then try again.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    setBusy('resend');
    setError(null);
    setNotice(null);
    try {
      await resendVerification();
      setNotice('Sent again. Check your spam folder too.');
      setWait(RESEND_WAIT_S);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="auth" id="main">
      <div className="auth-body">
        <header className="auth-head">
          <h1 className="auth-wordmark">
            Jarvis
            <img className="auth-logo" src="/logo.png" alt="" width={56} height={56} />
          </h1>
          <p className="auth-tagline">
            <span>Step 2 of 2</span> <span className="accent">↳ verify your email.</span>
          </p>
        </header>

        <div className="auth-form">
          <p>
            We sent a link to <span className="semibold">{user?.email}</span>. Open it to finish creating your account,
            then come back here.
          </p>
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
            <button type="button" className="auth-btn auth-btn-ink" disabled={!!busy} onClick={() => void check()}>
              {busy === 'check' ? 'Checking…' : 'I’ve verified it'}
            </button>
            <button
              type="button"
              className="auth-btn auth-btn-google"
              disabled={!!busy || wait > 0}
              onClick={() => void resend()}>
              {busy === 'resend' ? 'Sending…' : wait > 0 ? `Resend email (${wait}s)` : 'Resend email'}
            </button>
          </div>
        </div>
      </div>

      <footer className="auth-foot">
        <button type="button" className="auth-link auth-foot-link accent" onClick={() => void signOut()}>
          Use a different account
        </button>
      </footer>
    </main>
  );
}

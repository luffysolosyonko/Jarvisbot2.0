import { useId, useState, type FormEvent } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { PasswordRules } from '@/components/PasswordRules';
import { errorMessage } from '@/lib/api';
import { passwordOk, useCommonPasswords } from '@/lib/password';

/**
 * Change the password: the current one (Firebase asks for it again before a
 * password change), then the new one twice, with the same rules as sign-up.
 * The demo account can change its password too; `python -m jarvis_api.demo_login`
 * resets it.
 */
export function ChangePassword() {
  const { hasPassword, changePassword } = useAuth();
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [flagRules, setFlagRules] = useState(false);
  const common = useCommonPasswords(hasPassword);

  if (!hasPassword) return <p className="help">You sign in with Google, so there’s no password to change here.</p>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (!current) return setError('Enter your current password.');
    if (!passwordOk(next, common)) {
      setFlagRules(true);
      return setError('Choose a stronger password: see the list under New password.');
    }
    if (next !== confirm) return setError('The new passwords don’t match.');
    if (next === current) return setError('The new password is the same as the current one.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-3" onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label htmlFor={`${id}-current`}>Current password</label>
        <input
          id={`${id}-current`}
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-next`}>New password</label>
        <input
          id={`${id}-next`}
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          aria-describedby={`${id}-rules`}
          onChange={(e) => setNext(e.target.value)}
        />
        <PasswordRules id={`${id}-rules`} password={next} common={common} flag={flagRules} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-confirm`}>Confirm new password</label>
        <input
          id={`${id}-confirm`}
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="t-label success" role="status">
          Password changed.
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" loading={busy}>
          Change password
        </Button>
      </div>
    </form>
  );
}

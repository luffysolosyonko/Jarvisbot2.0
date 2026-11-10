import { passwordRules } from '@/lib/password';

/** The password checklist: each rule turns green with a tick once it's met. */
export function PasswordRules({ id, password }: { id: string; password: string }) {
  return (
    <ul id={id} className="password-rules" aria-label="Password needs">
      {passwordRules(password).map((r) => (
        <li key={r.id} className={r.ok ? 'ok' : undefined}>
          <span aria-hidden="true">{r.ok ? '✓' : '·'}</span> {r.label}
          <span className="visually-hidden">{r.ok ? ' (done)' : ' (needed)'}</span>
        </li>
      ))}
    </ul>
  );
}

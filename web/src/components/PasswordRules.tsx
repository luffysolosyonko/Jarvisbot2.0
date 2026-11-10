import { passwordRules } from '@/lib/password';

/**
 * The password checklist. Each rule is "○ rule" until met, then "✓ rule" (the glyph
 * carries the state, not just the color). Once every rule passes, the list collapses
 * to one "✓ strong password" line, announced politely; editing back to an invalid
 * password brings the list back. `flag` (after a refused submit) marks unmet rules.
 */
export function PasswordRules({
  id,
  password,
  common,
  flag = false,
}: {
  id: string;
  password: string;
  common: Set<string> | null;
  flag?: boolean;
}) {
  const rules = passwordRules(password, common);
  const strong = rules.every((r) => r.ok);
  return (
    <div id={id} className="pw-rules">
      <p className="pw-strong" aria-live="polite">
        {strong ? (
          <span className="pw-rule ok pw-collapse">
            <span aria-hidden="true">✓</span> strong password
          </span>
        ) : null}
      </p>
      {strong ? null : (
        <ul aria-label="Password needs">
          {rules.map((r) => (
            <li key={r.id} className={`pw-rule${r.ok ? ' ok' : flag ? ' flagged' : ''}`}>
              <span aria-hidden="true">{r.ok ? '✓' : '○'}</span> {r.label}
              <span className="visually-hidden">{r.ok ? ', done' : ', needed'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

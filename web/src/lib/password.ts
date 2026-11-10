/**
 * Rules for new passwords: 12+ characters with an uppercase letter, a lowercase
 * letter, a number and a symbol.
 *
 * Firebase's password policy enforces the same rules on its side
 * (python -m jarvis_api.password_policy), so they hold even when someone calls
 * Firebase directly instead of using the app.
 */
export const MIN_LENGTH = 12;

/** The symbols Firebase's policy counts as non-alphanumeric. */
const SYMBOL = /[\^$*.[\]{}()?"!@#%&/\\,><':;|_~`]/;

export type PasswordRule = {
  id: 'length' | 'upper' | 'lower' | 'number' | 'symbol';
  label: string;
  ok: boolean;
};

/** Every rule starts unmet (nothing typed yet). */
export function passwordRules(pw: string): PasswordRule[] {
  return [
    { id: 'length', label: `${MIN_LENGTH}+ characters`, ok: pw.length >= MIN_LENGTH },
    { id: 'upper', label: 'an uppercase letter', ok: /[A-Z]/.test(pw) },
    { id: 'lower', label: 'a lowercase letter', ok: /[a-z]/.test(pw) },
    { id: 'number', label: 'a number', ok: /[0-9]/.test(pw) },
    { id: 'symbol', label: 'a symbol, like ! ? # @', ok: SYMBOL.test(pw) },
  ];
}

export function passwordOk(pw: string): boolean {
  return passwordRules(pw).every((r) => r.ok);
}

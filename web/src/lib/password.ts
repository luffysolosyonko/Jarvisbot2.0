/**
 * The password rules for a new account, the usual standard: at least 8 characters,
 * with an uppercase letter, a lowercase letter, a number and a symbol.
 */
export type PasswordRule = { id: string; label: string; ok: boolean };

export function passwordRules(pw: string): PasswordRule[] {
  return [
    { id: 'length', label: '8+ characters', ok: pw.length >= 8 },
    { id: 'upper', label: 'an uppercase letter', ok: /[A-Z]/.test(pw) },
    { id: 'lower', label: 'a lowercase letter', ok: /[a-z]/.test(pw) },
    { id: 'number', label: 'a number', ok: /\d/.test(pw) },
    { id: 'symbol', label: 'a symbol, like ! ? # @', ok: /[^A-Za-z0-9\s]/.test(pw) },
  ];
}

export function passwordOk(pw: string): boolean {
  return passwordRules(pw).every((r) => r.ok);
}

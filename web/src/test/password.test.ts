import { describe, expect, it } from 'vitest';

import { passwordOk, passwordRules } from '@/lib/password';

describe('password rules', () => {
  it('needs 8+ characters, upper and lower case, a number and a symbol', () => {
    expect(passwordOk('Lift-heavy9')).toBe(true);
    expect(passwordOk('12345678')).toBe(false);
    expect(passwordOk('Lift-hv9')).toBe(true); // exactly 8
    expect(passwordOk('Lift-h9')).toBe(false); // 7
    expect(passwordOk('lift-heavy9')).toBe(false); // no uppercase
    expect(passwordOk('LIFT-HEAVY9')).toBe(false); // no lowercase
    expect(passwordOk('Lift-heavy')).toBe(false); // no number
    expect(passwordOk('Liftheavy9')).toBe(false); // no symbol
  });

  it('says which rules are still missing', () => {
    const missing = passwordRules('abc').filter((r) => !r.ok).map((r) => r.id);
    expect(missing).toEqual(['length', 'upper', 'number', 'symbol']);
  });
});

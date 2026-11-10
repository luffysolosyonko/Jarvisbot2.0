import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordRules } from '@/components/PasswordRules';
import { loadCommonPasswords, passwordOk, passwordRules } from '@/lib/password';

describe('password rules', () => {
  it('bundles the ~10k common passwords, lowercased', async () => {
    const list = await loadCommonPasswords();
    expect(list.size).toBeGreaterThan(9000);
    for (const pw of ['password', '123456', 'qwerty', 'iloveyou']) expect(list.has(pw)).toBe(true);
  });

  it('needs 12+ characters and not a common password', async () => {
    const list = await loadCommonPasswords();
    const common12 = [...list].find((p) => p.length >= 12)!; // a long one that's still on the list
    expect(passwordOk('quiet barbell morning', list)).toBe(true);
    expect(passwordOk('short-Pass1!', list)).toBe(true); // exactly 12
    expect(passwordOk('short-Pass1', list)).toBe(false); // 11
    expect(passwordOk(common12, list)).toBe(false);
    expect(passwordOk(common12.toUpperCase(), list)).toBe(false); // case doesn't help
    expect(passwordOk('quiet barbell morning', null)).toBe(false); // list not loaded yet
  });

  it('starts with every rule unmet', () => {
    expect(passwordRules('', new Set()).map((r) => r.ok)).toEqual([false, false]);
  });
});

describe('PasswordRules', () => {
  const list = new Set(['password', 'passwordpassword']);

  it('shows ○ for unmet and ✓ for met, then collapses to one line', () => {
    const { rerender } = render(<PasswordRules id="r" password="password" common={list} />);
    expect(screen.getByText(/12\+ characters/)).toHaveTextContent('○');
    expect(screen.getByText(/not a common password/)).toHaveTextContent('○');
    rerender(<PasswordRules id="r" password="passwordpassword" common={list} />);
    expect(screen.getByText(/12\+ characters/)).toHaveTextContent('✓');
    expect(screen.getByText(/not a common password/)).toHaveTextContent('○');
    rerender(<PasswordRules id="r" password="quiet barbell morning" common={list} />);
    expect(screen.queryByText(/12\+ characters/)).not.toBeInTheDocument();
    expect(screen.getByText(/strong password/).closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    rerender(<PasswordRules id="r" password="quiet" common={list} />); // back to invalid: list again
    expect(screen.getByText(/12\+ characters/)).toBeInTheDocument();
  });

  it('marks unmet rules after a refused submit', () => {
    render(<PasswordRules id="r" password="abc" common={list} flag />);
    expect(screen.getByText(/12\+ characters/)).toHaveClass('flagged');
  });
});

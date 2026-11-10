import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordRules } from '@/components/PasswordRules';
import { passwordOk, passwordRules } from '@/lib/password';

describe('password rules', () => {
  it('needs 12+ characters with upper, lower, a number and a symbol', () => {
    expect(passwordOk('Quiet?Barbell7!')).toBe(true);
    expect(passwordOk('short_Pass1!')).toBe(true); // exactly 12
    expect(passwordOk('short_Pas1!')).toBe(false); // 11
    expect(passwordOk('quiet?barbell7!')).toBe(false); // no uppercase
    expect(passwordOk('QUIET?BARBELL7!')).toBe(false); // no lowercase
    expect(passwordOk('Quiet?Barbell!!')).toBe(false); // no number
    expect(passwordOk('QuietBarbell77')).toBe(false); // no symbol
  });

  it('names each unmet rule', () => {
    const unmet = (pw: string) =>
      passwordRules(pw)
        .filter((r) => !r.ok)
        .map((r) => r.id);
    expect(unmet('')).toEqual(['length', 'upper', 'lower', 'number', 'symbol']);
    expect(unmet('abc')).toEqual(['length', 'upper', 'number', 'symbol']);
    expect(unmet('Abcdefghijk1')).toEqual(['symbol']);
  });
});

describe('PasswordRules', () => {
  it('shows ○ for unmet and ✓ for met, then collapses to one line', () => {
    const { rerender } = render(<PasswordRules id="r" password="password" />);
    expect(screen.getByText(/12\+ characters/)).toHaveTextContent('○');
    expect(screen.getByText(/a lowercase letter/)).toHaveTextContent('✓');
    expect(screen.getByText(/an uppercase letter/)).toHaveTextContent('○');
    expect(screen.getByText(/a number/)).toHaveTextContent('○');
    expect(screen.getByText(/a symbol/)).toHaveTextContent('○');
    expect(screen.queryByText(/common password/)).not.toBeInTheDocument();
    rerender(<PasswordRules id="r" password="Passwordpassword" />);
    expect(screen.getByText(/12\+ characters/)).toHaveTextContent('✓');
    expect(screen.getByText(/a number/)).toHaveTextContent('○');
    rerender(<PasswordRules id="r" password="Quiet?Barbell7!" />);
    expect(screen.queryByText(/12\+ characters/)).not.toBeInTheDocument();
    expect(screen.getByText(/strong password/).closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    rerender(<PasswordRules id="r" password="quiet" />); // back to invalid: list again
    expect(screen.getByText(/12\+ characters/)).toBeInTheDocument();
  });

  it('marks unmet rules after a refused submit', () => {
    render(<PasswordRules id="r" password="abc" flag />);
    expect(screen.getByText(/12\+ characters/)).toHaveClass('flagged');
    expect(screen.getByText(/a lowercase letter/)).not.toHaveClass('flagged');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChangePassword } from '@/pages/ChangePassword';
import { SignInPage } from '@/pages/SignInPage';
import { VerifyEmailPage } from '@/pages/VerifyEmailPage';

const auth = {
  user: { email: 'new@example.com' },
  hasPassword: true,
  changePassword: vi.fn(async () => {}),
  refreshUser: vi.fn(async () => false),
  resendVerification: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  signIn: vi.fn(async () => {}),
  signUp: vi.fn(async () => {}),
  resetPassword: vi.fn(async () => {}),
  signInWithGoogle: vi.fn(async () => {}),
};
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth.hasPassword = true;
  auth.changePassword.mockClear();
  auth.refreshUser.mockReset().mockResolvedValue(false);
});

async function fill(current: string, next: string, confirm: string) {
  if (current) await userEvent.type(screen.getByLabelText('Current password'), current);
  if (next) await userEvent.type(screen.getByLabelText('New password'), next);
  if (confirm) await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePassword', () => {
  it('needs a strong new password, typed twice, before changing it', async () => {
    render(<ChangePassword />);
    await fill('old-Pass1!', '12345678', '12345678');
    expect(screen.getByRole('alert')).toHaveTextContent(/stronger password/);
    expect(auth.changePassword).not.toHaveBeenCalled();
  });

  it('refuses mismatched passwords, then changes it', async () => {
    render(<ChangePassword />);
    await fill('old-Pass1!', 'quiet barbell morning', 'quiet barbell mornin');
    expect(screen.getByRole('alert')).toHaveTextContent(/don’t match/);
    await userEvent.clear(screen.getByLabelText('Confirm new password'));
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'quiet barbell morning');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(auth.changePassword).toHaveBeenCalledWith('old-Pass1!', 'quiet barbell morning'));
    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
  });

  it('is not offered to Google sign-ins (they have no password here)', () => {
    auth.hasPassword = false;
    render(<ChangePassword />);
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(screen.getByText(/sign in with Google/)).toBeInTheDocument();
  });
});

describe('VerifyEmailPage', () => {
  it('says where the link went and checks again on request', async () => {
    render(<VerifyEmailPage />);
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend email \(\d+s\)/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'I’ve verified it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Not verified yet/);
    expect(auth.refreshUser).toHaveBeenCalled();
  });
});

describe('Sign-up password field', () => {
  it('has a show/hide eye, no confirm box, and points at unmet rules instead of submitting', async () => {
    render(<SignInPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.queryByLabelText(/Confirm/)).not.toBeInTheDocument();
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('aria-describedby', 'password-rules');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(pw, 'password');
    const submit = screen.getAllByRole('button', { name: 'Create account' }).find((b) => b.getAttribute('type') === 'submit')!;
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(pw).toHaveFocus();
    expect(screen.getByText(/12\+ characters/)).toHaveClass('flagged');

    await userEvent.clear(pw);
    await userEvent.type(pw, 'quiet barbell morning');
    expect(await screen.findByText(/strong password/)).toBeInTheDocument();
    await userEvent.click(submit);
    expect(auth.signUp).toHaveBeenCalledWith('new@example.com', 'quiet barbell morning');
  });
});

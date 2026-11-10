/** Firebase Auth error codes -> one plain sentence. */
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-credential': 'Wrong email or password, or there’s no account with this email yet. New here? Create an account.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with this email yet. Create an account first.',
  'auth/email-already-in-use': 'An account with that email already exists. Sign in instead.',
  'auth/weak-password': 'Use a password with at least 12 characters.',
  'auth/password-does-not-meet-requirements': 'Use a password with at least 12 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/requires-recent-login': 'For your security, sign out and back in, then change your password.',
  'auth/network-request-failed': 'Can’t reach the sign-in service. Check your connection.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/operation-not-allowed': 'That sign-in method isn’t turned on for this Firebase project. See docs/SETUP.md.',
  'auth/unauthorized-domain':
    'This web address can’t sign in yet. Add it under Firebase > Authentication > Settings > Authorized domains.',
};

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code];
  return 'Sign-in didn’t work. Try again.';
}

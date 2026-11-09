/** Firebase Auth error codes -> one plain sentence. */
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/email-already-in-use': 'An account with that email already exists. Sign in instead.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
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

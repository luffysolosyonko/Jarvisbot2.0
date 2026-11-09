import { GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';

/** Closing the popup isn't an error; the user just changed their mind. */
const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

/** Google sign-in for the web build: Firebase's popup, no native SDK or client ID needed. */
export async function googleSignIn(auth: Auth): Promise<void> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && CANCELLED.has(code)) return;
    throw e;
  }
}

export async function googleSignOut(): Promise<void> {
  // Firebase's signOut covers the popup session.
}

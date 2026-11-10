import { useQueryClient } from '@tanstack/react-query';
import {
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, setTokenGetter } from '@/lib/api';
import { clearCache, sessionHint, setSessionHint } from '@/lib/cache';
import { firebaseConfigured } from '@/lib/config';
import { getFirebaseAuth } from '@/lib/firebase';

import { authErrorMessage } from './errors';

type AuthState = {
  user: User | null;
  initializing: boolean;
  /** Firebase is still restoring the sign-in, but this browser was signed in last time. */
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** A new email/password account that hasn't opened its verification link yet. */
  needsVerification: boolean;
  /** Email/password accounts can change their password; Google accounts can't here. */
  hasPassword: boolean;
  resendVerification: () => Promise<void>;
  /** Re-read the user from Firebase; true once the email is verified. */
  refreshUser: () => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<void>;
};

const isPasswordUser = (u: User | null) => !!u && u.providerData.some((p) => p.providerId === 'password');

const AuthContext = createContext<AuthState | null>(null);

/** Closing the Google popup isn't an error; the user changed their mind. */
const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

function requireAuth() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new ApiError(0, 'firebase_not_configured', 'Sign-in isn’t set up in this build. See docs/SETUP.md.');
  }
  return auth;
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'auth', authErrorMessage(e));
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(firebaseConfigured);
  const [hint] = useState(sessionHint);
  // Firebase updates the same User object in place (reload): bump this to re-render.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    // Requests made while Firebase restores the sign-in wait for it, then carry the token.
    setTokenGetter(async () => {
      await auth.authStateReady();
      return auth.currentUser ? auth.currentUser.getIdToken() : null;
    });
    return onAuthStateChanged(auth, (u) => {
      // Someone else (or nobody) than last time: drop the cached data.
      if (u?.uid !== sessionHint()) {
        clearCache();
        queryClient.clear();
      }
      setSessionHint(u?.uid ?? null);
      setUser(u);
      setInitializing(false);
    });
  }, [queryClient]);

  const signIn = useCallback(
    (email: string, password: string) =>
      wrap(async () => {
        await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
      }),
    [],
  );

  const signUp = useCallback(
    (email: string, password: string) =>
      wrap(async () => {
        const cred = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
        // Step 2: confirm the address before the account can be used.
        await sendEmailVerification(cred.user);
      }),
    [],
  );

  const resetPassword = useCallback(
    (email: string) => wrap(() => sendPasswordResetEmail(requireAuth(), email.trim())),
    [],
  );

  const signInWithGoogle = useCallback(
    () =>
      wrap(async () => {
        try {
          await signInWithPopup(requireAuth(), new GoogleAuthProvider(), browserPopupRedirectResolver);
        } catch (e) {
          const code = (e as { code?: unknown } | null)?.code;
          if (typeof code === 'string' && CANCELLED.has(code)) return;
          throw e;
        }
      }),
    [],
  );

  const resendVerification = useCallback(
    () =>
      wrap(async () => {
        const current = requireAuth().currentUser;
        if (current) await sendEmailVerification(current);
      }),
    [],
  );

  const refreshUser = useCallback(
    () =>
      wrap(async () => {
        const current = requireAuth().currentUser;
        if (!current) return false;
        await current.reload();
        if (current.emailVerified) await current.getIdToken(true); // a token that says so
        setVersion((v) => v + 1);
        return current.emailVerified;
      }),
    [],
  );

  const changePassword = useCallback(
    (currentPassword: string, next: string) =>
      wrap(async () => {
        const current = requireAuth().currentUser;
        if (!current?.email) throw new ApiError(0, 'auth', 'Sign in again to change your password.');
        try {
          await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, currentPassword));
        } catch (e) {
          const code = (e as { code?: unknown } | null)?.code;
          if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
            throw new ApiError(0, 'auth', 'That current password isn’t right.');
          }
          throw e;
        }
        await updatePassword(current, next);
      }),
    [],
  );

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) await fbSignOut(auth);
    clearCache();
    queryClient.clear();
  }, [queryClient]);

  const needsVerification = isPasswordUser(user) && !user?.emailVerified;
  const restoring = initializing && !!hint;
  const hasPassword = isPasswordUser(user);
  const value = useMemo(
    () => ({
      user,
      initializing,
      restoring,
      signIn,
      signUp,
      resetPassword,
      signInWithGoogle,
      signOut,
      needsVerification,
      hasPassword,
      resendVerification,
      refreshUser,
      changePassword,
    }),
    // `version` re-creates the value after a reload changes the user in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, version, initializing, restoring, signIn, signUp, resetPassword, signInWithGoogle, signOut, needsVerification, hasPassword, resendVerification, refreshUser, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

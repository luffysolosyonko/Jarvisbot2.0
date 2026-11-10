import { useQueryClient } from '@tanstack/react-query';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, setTokenGetter } from '@/lib/api';
import { firebaseConfigured } from '@/lib/config';
import { getFirebaseAuth } from '@/lib/firebase';

import { authErrorMessage } from './errors';

type AuthState = {
  user: User | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

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

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    setTokenGetter(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

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
        await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
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
          await signInWithPopup(requireAuth(), new GoogleAuthProvider());
        } catch (e) {
          const code = (e as { code?: unknown } | null)?.code;
          if (typeof code === 'string' && CANCELLED.has(code)) return;
          throw e;
        }
      }),
    [],
  );

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) await fbSignOut(auth);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, initializing, signIn, signUp, resetPassword, signInWithGoogle, signOut }),
    [user, initializing, signIn, signUp, resetPassword, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

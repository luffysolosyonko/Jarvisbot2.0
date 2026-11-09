import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

import { config, firebaseConfigured } from './config';

let auth: Auth | null = null;

/** Firebase Auth, persisted in the browser so a reload keeps you signed in. */
export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;
  if (auth) return auth;
  if (getApps().length) {
    auth = getAuth(getApp());
    return auth;
  }
  auth = initializeAuth(initializeApp(config.firebase), {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver, // for signInWithPopup
  });
  return auth;
}

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

import { config, firebaseConfigured } from './config';

let auth: Auth | null = null;

/**
 * Firebase Auth, persisted in the browser so a reload keeps you signed in.
 *
 * Firebase re-checks the saved user over the network (accounts:lookup, ~1 s) on
 * every load before saying who's signed in, so the app shows cached data meanwhile
 * (lib/cache.ts). The Google popup's resolver is passed only when it's used.
 */
export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;
  if (auth) return auth;
  if (getApps().length) {
    auth = getAuth(getApp());
    return auth;
  }
  auth = initializeAuth(initializeApp(config.firebase), {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
  return auth;
}

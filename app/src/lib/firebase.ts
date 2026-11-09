import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
// The React Native build of firebase/auth exports this; the web typings don't.
// @ts-expect-error -- resolved through the "react-native" export condition at runtime
import { getReactNativePersistence } from 'firebase/auth';

import { config, firebaseConfigured } from './config';

let auth: Auth | null = null;

/** Firebase Auth, persisted in AsyncStorage so users stay signed in. */
export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;
  if (auth) return auth;
  if (getApps().length) {
    auth = getAuth(getApp());
    return auth;
  }
  const app = initializeApp(config.firebase);
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  return auth;
}

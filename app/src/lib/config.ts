import { Platform } from 'react-native';

// Without EXPO_PUBLIC_API_URL: the browser (and iOS simulator) reach the host as
// localhost; the Android emulator reaches it as 10.0.2.2.
const defaultApiUrl = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

/**
 * Public client config from EXPO_PUBLIC_* env vars (app/.env.local). These are
 * inlined into the bundle at build time, so they must be read with literal
 * `process.env.EXPO_PUBLIC_…` expressions and must never hold secrets.
 */
export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL || defaultApiUrl).replace(/\/+$/, ''),
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  },
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
} as const;

export const API_PREFIX = '/api/v1';

export const firebaseConfigured =
  Boolean(config.firebase.apiKey) && !config.firebase.apiKey.startsWith('replace');
export const googleConfigured =
  Boolean(config.googleWebClientId) && !config.googleWebClientId.startsWith('replace');

/**
 * Public client config from VITE_* env vars (web/.env.local). These are inlined
 * into the bundle at build time and must never hold secrets.
 */
const env = import.meta.env;

export const config = {
  apiUrl: (env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
    appId: env.VITE_FIREBASE_APP_ID ?? '',
  },
} as const;

export const API_PREFIX = '/api/v1';

export const firebaseConfigured =
  Boolean(config.firebase.apiKey) && !config.firebase.apiKey.startsWith('replace');

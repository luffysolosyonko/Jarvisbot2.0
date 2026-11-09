import { GoogleAuthProvider, signInWithCredential, type Auth } from 'firebase/auth';

import { ApiError } from '@/lib/api';
import { config, googleConfigured } from '@/lib/config';

/**
 * Google sign-in for Android/iOS, through the native Google Sign-In SDK.
 * The web build uses google.web.ts (a Firebase popup) instead.
 */
export async function googleSignIn(auth: Auth): Promise<void> {
  if (!googleConfigured) {
    throw new ApiError(
      0,
      'google_not_configured',
      'Google sign-in isn’t set up in this build. Use email or try the demo.',
    );
  }
  const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: config.googleWebClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return; // cancelled
  const idToken = response.data.idToken;
  if (!idToken) throw new ApiError(0, 'google', 'Google didn’t return a sign-in token. Try again.');
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

export async function googleSignOut(): Promise<void> {
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google on this device; nothing to do.
  }
}

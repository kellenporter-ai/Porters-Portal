
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
];

/**
 * Get a Google OAuth access token with Classroom scopes.
 * Uses incremental authorization — prompts only for Classroom scopes
 * if not already granted.
 *
 * @param forceConsent - If true, forces the consent screen to ensure a
 *   fresh token (useful when the previous token was rejected as expired).
 */
export async function getClassroomAccessToken(forceConsent = false): Promise<string> {
  const provider = new GoogleAuthProvider();
  CLASSROOM_SCOPES.forEach(scope => provider.addScope(scope));

  const customParams: Record<string, string> = {};
  if (auth.currentUser?.email) {
    customParams.login_hint = auth.currentUser.email;
  }
  if (forceConsent) {
    customParams.prompt = 'consent';
  }
  if (Object.keys(customParams).length > 0) {
    provider.setCustomParameters(customParams);
  }

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Classroom access token');
    }
    return credential.accessToken;
  } catch (err: any) {
    if (err.code === 'auth/popup-closed-by-user') {
      throw new Error('Authorization popup closed before completing. Please try again.');
    }
    if (err.code === 'auth/popup-blocked') {
      throw new Error('Popup was blocked by the browser. Please allow popups for this site and try again.');
    }
    if (err.code === 'auth/cancelled-popup-request') {
      throw new Error('Another authorization popup is already open. Please complete or close it first.');
    }
    if (err.code === 'auth/network-request-failed') {
      throw new Error('Network error during Google authorization. Please check your connection and try again.');
    }
    throw new Error(err.message || 'Failed to authorize with Google Classroom');
  }
}

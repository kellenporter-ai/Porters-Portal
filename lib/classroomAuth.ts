
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
 */
export async function getClassroomAccessToken(): Promise<string> {
  const provider = new GoogleAuthProvider();
  CLASSROOM_SCOPES.forEach(scope => provider.addScope(scope));
  // Hint the current user's email to avoid the account chooser
  if (auth.currentUser?.email) {
    provider.setCustomParameters({ login_hint: auth.currentUser.email });
  }
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Failed to obtain Classroom access token');
  }
  return credential.accessToken;
}

/**
 * Centralized error reporting utility.
 *
 * In development, errors are logged to the console.
 * This module provides a single integration point for future external
 * error-tracking services (e.g. Sentry).
 */

const IS_DEV = import.meta.env.DEV;

/** Report an error with optional context metadata. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);

  if (IS_DEV) {
    console.error('[PorterPortal]', message, context ?? '', error);
  } else {
    // Production: log condensed message. Replace with Sentry.captureException() when ready.
    console.error('[PorterPortal]', message, context ?? '');
  }
}

/**
 * Extract the Firebase HttpsError code from a caught error.
 * Firebase callable errors have a `code` property like "functions/not-found".
 * Returns the short code (e.g. "not-found") or "unknown".
 */
export function extractFirebaseErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown';
  const err = error as Record<string, unknown>;
  // Firebase SDK sets error.code as "functions/<code>"
  if (typeof err.code === 'string') {
    const code = err.code;
    return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
  }
  return 'unknown';
}

/** Map common Firebase error codes to user-friendly messages. */
const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'unauthenticated': 'You need to sign in to do that.',
  'permission-denied': 'You don\'t have permission to do that.',
  'not-found': 'The requested item was not found.',
  'already-exists': 'This has already been done.',
  'failed-precondition': 'This action can\'t be completed right now.',
  'invalid-argument': 'Something was wrong with the request. Please try again.',
  'unavailable': 'The server is temporarily unavailable. Please try again in a moment.',
  'resource-exhausted': 'Too many requests. Please wait a moment and try again.',
  'internal': 'Something went wrong on our end. Please try again.',
  'deadline-exceeded': 'The request took too long. Please try again.',
  'cancelled': 'The request was cancelled. Please try again.',
};

/**
 * Get a user-friendly message for a Firebase error, with optional override map.
 * Falls back to the provided defaultMessage if no mapping exists.
 */
export function getFirebaseErrorMessage(
  error: unknown,
  defaultMessage: string,
  overrides?: Record<string, string>,
): string {
  const code = extractFirebaseErrorCode(error);
  if (overrides?.[code]) return overrides[code];
  return FIREBASE_ERROR_MESSAGES[code] || defaultMessage;
}

/**
 * Wrap an async operation so failures are reported and surfaced via a toast callback.
 * Automatically extracts Firebase error codes for better user-facing messages.
 *
 * Usage:
 *   await withErrorToast(toast, () => dataService.doSomething(), 'Failed to save');
 *   await withErrorToast(toast, () => fn(), 'Failed', { 'permission-denied': 'Only teachers can do this.' });
 */
export async function withErrorToast<T>(
  toast: { error: (msg: string) => void },
  fn: () => Promise<T>,
  userMessage: string,
  errorOverrides?: Record<string, string>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    const code = extractFirebaseErrorCode(error);
    const message = getFirebaseErrorMessage(error, userMessage, errorOverrides);
    reportError(error, { userMessage, firebaseCode: code });
    toast.error(message);
    return undefined;
  }
}

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
 * Wrap an async operation so failures are reported and surfaced via a toast callback.
 *
 * Usage:
 *   await withErrorToast(toast, () => dataService.doSomething(), 'Failed to save');
 */
export async function withErrorToast<T>(
  toast: { error: (msg: string) => void },
  fn: () => Promise<T>,
  userMessage: string,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    reportError(error, { userMessage });
    toast.error(userMessage);
    return undefined;
  }
}

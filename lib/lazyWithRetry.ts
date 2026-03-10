import { lazy, ComponentType } from 'react';

/**
 * Wraps React.lazy to handle stale chunk errors after deploys.
 * On dynamic import failure, reloads the page once to fetch fresh chunks.
 * If we've already retried, throws normally so the error boundary can catch it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy<T>(() =>
    factory().catch((error: Error) => {
      const key = 'chunk-retry-' + window.location.pathname;
      const hasRetried = sessionStorage.getItem(key);

      if (!hasRetried) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Return a never-resolving promise so React doesn't render stale state
        return new Promise<{ default: T }>(() => {});
      }

      // Already retried — clear flag and let error boundary handle it
      sessionStorage.removeItem(key);
      throw error;
    }),
  );
}

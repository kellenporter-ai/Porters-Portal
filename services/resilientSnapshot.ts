import { onSnapshot, Query, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { reportError } from '../lib/errorReporting';

// Track collections that have failed with permission errors to prevent
// re-subscribing after ErrorBoundary remounts. Uses a Map<name, deniedAtMs>
// with a 30-second TTL so transient errors recover quickly.
const DENIED_TTL_MS = 30 * 1000;
const _deniedCollections = new Map<string, number>();

/** Clear all denial caches — call when auth state changes. */
export function clearDeniedCollections() {
  _deniedCollections.clear();
}

interface ResilientSnapshotOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Wraps onSnapshot with:
 * 1. Error reporting via reportError
 * 2. Permission-denied tracking with TTL (prevents crash loops after ErrorBoundary remount)
 * 3. Exponential backoff retry on transient errors
 * 4. Clean teardown via returned unsubscribe function
 */
export function resilientSnapshot(
  name: string,
  q: Query<DocumentData>,
  callback: (snapshot: QuerySnapshot<DocumentData>) => void,
  options?: ResilientSnapshotOptions
): () => void {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 2000;
  let retryCount = 0;
  let cancelled = false;
  let currentUnsub: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  // Check denial cache
  const deniedAt = _deniedCollections.get(name);
  if (deniedAt !== undefined && Date.now() - deniedAt < DENIED_TTL_MS) {
    return () => {};
  }
  // Clear expired denial entry
  if (deniedAt !== undefined) _deniedCollections.delete(name);

  const subscribe = () => {
    if (cancelled) return;

    currentUnsub = onSnapshot(q,
      (snapshot) => {
        retryCount = 0; // Reset on success
        callback(snapshot);
      },
      (error: any) => {
        reportError(error, { subscription: name, retryCount });

        // Permission-denied / failed-precondition — cache and don't retry
        if (error?.code === 'permission-denied' || error?.code === 'failed-precondition') {
          _deniedCollections.set(name, Date.now());
          // Prevent unbounded growth of denial cache
          if (_deniedCollections.size > 100) {
            const now = Date.now();
            for (const [key, ts] of _deniedCollections) {
              if (now - ts >= DENIED_TTL_MS) _deniedCollections.delete(key);
            }
            if (_deniedCollections.size > 100) _deniedCollections.clear();
          }
          return;
        }

        // Transient error — retry with exponential backoff
        if (!cancelled && retryCount < maxRetries) {
          retryCount++;
          const delay = baseDelay * Math.pow(2, retryCount - 1);
          retryTimer = setTimeout(subscribe, delay);
        }
      }
    );
  };

  subscribe();

  // Return unsubscribe function
  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (currentUnsub) currentUnsub();
  };
}

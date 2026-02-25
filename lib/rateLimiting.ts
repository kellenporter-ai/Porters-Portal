import { useCallback, useRef } from 'react';

/**
 * Returns a throttled version of `callback` that fires at most once per `delayMs`.
 * Subsequent calls within the window are silently dropped.
 *
 * The returned function is stable across renders (identity doesn't change).
 */
export function useThrottle<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const lastCallRef = useRef(0);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args: Args) => {
    const now = Date.now();
    if (now - lastCallRef.current >= delayMs) {
      lastCallRef.current = now;
      callbackRef.current(...args);
    }
  }, [delayMs]);
}

/**
 * Returns a debounced version of `callback` that waits `delayMs` after the
 * last invocation before firing.
 *
 * The returned function is stable across renders (identity doesn't change).
 */
export function useDebounce<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args: Args) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      callbackRef.current(...args);
    }, delayMs);
  }, [delayMs]);
}

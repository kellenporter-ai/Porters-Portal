/**
 * Encapsulates module-level session state that must survive ErrorBoundary remounts.
 * Replaces bare module-level `let` variables (#19) with a typed, per-user store.
 *
 * State is stored in a Map keyed by userId so each user has isolated session data.
 * When a new userId is encountered, a fresh state is created automatically.
 */

interface SessionState {
  acknowledgedLevel: number;
  dailyLoginAttempted: boolean;
  streakAttempted: boolean;
}

const sessionStore = new Map<string, SessionState>();

/**
 * Returns the session state for the given user, creating it if needed.
 * The returned object is mutable — callers update fields directly.
 * This mirrors the original module-level `let` semantics while scoping state per user.
 */
export function getSessionState(userId: string, initialLevel: number): SessionState {
  let state = sessionStore.get(userId);
  if (!state) {
    state = {
      acknowledgedLevel: initialLevel || 1,
      dailyLoginAttempted: false,
      streakAttempted: false,
    };
    sessionStore.set(userId, state);
  }
  return state;
}

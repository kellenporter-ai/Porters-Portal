/**
 * Pure helper for the assessment session token cache key computation.
 * Extracted verbatim from components/Proctor.tsx (~line 268) so the key
 * format is unit-testable.
 *
 * PHASE 0 — behavior-preserving extraction. The key is NOT user-scoped;
 * that is bug R6 and Phase 1 fixes it.
 */

/** R6 BUG: key is scoped by assignmentId only — NOT by userId. */
export function assessmentSessionKey(assignmentId: string): string {
  return `assessment_session_${assignmentId}`;
}

export function assessmentSessionSigKey(assignmentId: string): string {
  return `${assessmentSessionKey(assignmentId)}_sig`;
}

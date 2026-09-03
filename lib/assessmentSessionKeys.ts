/**
 * Pure helper for the assessment session token cache key computation.
 * Extracted verbatim from components/Proctor.tsx (~line 268) so the key
 * format is unit-testable.
 *
 * PHASE 1 — key is user-scoped (fixes R6: shared-device token bleed).
 * The legacy unscoped format `assessment_session_{assignmentId}` must NOT be
 * reused — consumers delete it on mount rather than migrating it.
 */

/** PHASE 1 (R6 FIX): key is scoped by userId + assignmentId. */
export function assessmentSessionKey(userId: string, assignmentId: string): string {
  return `assessment_session_${userId}_${assignmentId}`;
}

export function assessmentSessionSigKey(userId: string, assignmentId: string): string {
  return `${assessmentSessionKey(userId, assignmentId)}_sig`;
}

/** Legacy (pre-Phase-1) unscoped key format — only used to delete it on mount. */
export function legacyAssessmentSessionKey(assignmentId: string): string {
  return `assessment_session_${assignmentId}`;
}

export function legacyAssessmentSessionSigKey(assignmentId: string): string {
  return `${legacyAssessmentSessionKey(assignmentId)}_sig`;
}

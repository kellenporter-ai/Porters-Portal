/**
 * Phase 1f — Grading-integrity helpers (pure, no Firestore imports).
 *
 * CANONICAL COPY: this module is the testable source of truth for the
 * server-side invariants applied when a teacher saves a rubric grade:
 *  - feedback history prepended from the previous grade and capped at 20,
 *  - AI-flag auto-clear on teacher grade (score/status/percentage restored),
 *  - onGradePosted false-positive suppression for AI-flag restores.
 *
 * `functions/src/grading.ts` inlines the same logic because functions/
 * tsconfig rootDir excludes ../../lib imports (same precedent as
 * lib/gradingKeys.ts). The drift guard in
 * lib/__tests__/grading-integrity.test.ts greps functions/src to keep the
 * two copies in sync.
 */

export interface FeedbackHistoryEntryInput {
  feedback: string;
  timestamp: string;
  gradedBy: string;
}

export interface RubricGradeInput {
  grades: Record<string, Record<string, unknown>>;
  overallPercentage: number;
  gradedAt: string;
  gradedBy: string;
  teacherFeedback?: string;
  feedbackHistory?: FeedbackHistoryEntryInput[];
}

/** Server-enforced cap on rubric feedback history entries. */
export const FEEDBACK_HISTORY_CAP = 20;

/**
 * Build the feedbackHistory array for a new grade: the previous grade's
 * teacherFeedback is prepended (timestamped at its gradedAt) ahead of the
 * caller-supplied history, then capped at FEEDBACK_HISTORY_CAP (newest first).
 * No entry is created when the previous grade has no teacherFeedback.
 */
export function buildFeedbackHistory(
  previousGrade: RubricGradeInput | undefined,
  existingHistory: FeedbackHistoryEntryInput[] | undefined,
): FeedbackHistoryEntryInput[] {
  const history = existingHistory || [];
  const prevFeedback = previousGrade?.teacherFeedback;
  if (!prevFeedback) return history.slice(0, FEEDBACK_HISTORY_CAP);
  const oldEntry: FeedbackHistoryEntryInput = {
    feedback: prevFeedback,
    timestamp: previousGrade.gradedAt || new Date().toISOString(),
    gradedBy: previousGrade.gradedBy || '',
  };
  return [oldEntry, ...history].slice(0, FEEDBACK_HISTORY_CAP);
}

/**
 * Decide whether the onGradePosted "Grade Posted" email should be skipped.
 *
 * Two suppression paths, checked against the before/after submission docs:
 *  1. Explicit marker: after.gradeRestoredFromFlag === true (written by the
 *     unflag flow). The trigger is responsible for unsetting it.
 *  2. Heuristic: the before-doc is currently AI-flagged with score 0 and the
 *     after-score restores the pre-flag score (0 -> preFlagScore). This is
 *     the unflag/score-restore transition, not a genuine first grade.
 *
 * Genuine first grades (0/unset -> positive with no AI-flag context) and
 * re-grades (positive -> positive, already filtered by the 0->positive gate)
 * are NOT suppressed.
 */
export function shouldSuppressGradePostedEmail(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  if (after.gradeRestoredFromFlag === true) return true;
  if (before.flaggedAsAI === true && typeof before.preFlagScore === 'number') {
    const newScore = typeof after.score === 'number' ? after.score : 0;
    if (before.preFlagScore > 0 && newScore === before.preFlagScore) return true;
  }
  return false;
}

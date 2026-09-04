import type { Submission, User, Assignment, ClassType } from '../types';
import { classifyParticipantsRaw } from './assessmentClassifierShared';

/**
 * Inputs to the assessment participant classifier. The classifier is pure —
 * the caller fetches from Firestore (or passes in already-filtered data) and
 * the classifier owns the rules for what counts as a draft vs submitted.
 */
export interface DraftSourceData {
  /** Submissions fetched for this assignmentId. */
  submissions: Submission[];
  /** UserIds with an unused assessment_session for this assignmentId. */
  sessionDraftUserIds: Set<string>;
  /** UserIds with a lesson_block_responses doc that has saved responses for this assignmentId. */
  responseDraftUserIds: Set<string>;
}

export interface ClassifiedUserIds {
  /** Unique users with at least one non-STARTED submission. */
  submittedUserIds: Set<string>;
  /** Unique users who have draft activity (STARTED submission OR session OR response) AND have not submitted. */
  draftUserIds: Set<string>;
}

/**
 * Classify users into submitted vs draft sets based on the three draft sources.
 * Delegates to the canonical shared module — lib/assessmentClassifierShared.ts —
 * which functions/src/assessment-stats.ts inlines (functions rootDir excludes
 * ../../lib). Drift guard: lib/__tests__/assessment-classifier.test.ts.
 */
export function classifyAssessmentParticipants(data: DraftSourceData): ClassifiedUserIds {
  const raw = classifyParticipantsRaw({
    submissions: data.submissions,
    sessionDraftUserIds: data.sessionDraftUserIds,
    responseDraftUserIds: data.responseDraftUserIds,
  });
  return { submittedUserIds: raw.submittedUserIds, draftUserIds: raw.draftUserIds };
}

/**
 * Filter `users` to the set enrolled in the assignment's classType.
 * Falls back to including users with active drafts so enrollment-data drift
 * doesn't hide students who clearly belong to this assessment.
 */
export function filterEnrolledInClass(
  users: User[],
  assignment: Pick<Assignment, 'classType'> | null,
  draftUserIds: Set<string>,
): User[] {
  const ct = assignment?.classType;
  if (!ct) return [];
  return users.filter(u => {
    if (u.classType === ct || u.enrolledClasses?.includes(ct as ClassType)) return true;
    if (draftUserIds.has(u.id)) return true;
    return false;
  });
}

/**
 * Compute the count of enrolled students who have neither submitted nor started.
 * Returns 0 if assignment.classType is missing (signals "cannot compute").
 *
 * Canonical rule lives in lib/assessmentClassifierShared.ts
 * (computeNotStartedCountRaw) — inlined in functions/src/assessment-stats.ts.
 */
export function computeNotStartedCount(
  enrolledInClass: User[],
  classified: ClassifiedUserIds,
): number {
  return enrolledInClass.filter(
    u => !classified.submittedUserIds.has(u.id) && !classified.draftUserIds.has(u.id)
  ).length;
}

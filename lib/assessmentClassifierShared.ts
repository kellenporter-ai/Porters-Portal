/**
 * Phase 1f — Assessment participant classifier (canonical copy).
 *
 * Classifies participants into submitted vs draft buckets from three draft
 * sources: STARTED submissions, unused assessment_sessions, and
 * lesson_block_responses with saved work. Same rules, two homes:
 *
 *  - lib/assessmentClassifier.ts wraps these helpers with typed
 *    Submission/User inputs for the client (buildStudentGroups).
 *  - functions/src/assessment-stats.ts inlines this module because
 *    functions/ tsconfig rootDir excludes ../../lib imports.
 *
 * Drift guard: lib/__tests__/assessment-classifier.test.ts greps the
 * functions/src copy for the canonical lines. Keep them verbatim.
 */

export interface RawSubmissionLike {
  userId?: unknown;
  status?: unknown;
  rubricGrade?: unknown;
  flaggedAsAI?: unknown;
}

export interface RawDraftSourceData {
  /** Submissions fetched for this assignmentId (raw Firestore data). */
  submissions: RawSubmissionLike[];
  /** UserIds with an unused assessment_session for this assignmentId. */
  sessionDraftUserIds: Set<string>;
  /** UserIds with a lesson_block_responses doc that has saved responses for this assignmentId. */
  responseDraftUserIds: Set<string>;
}

export interface RawClassifiedUserIds {
  /** Unique users with at least one non-STARTED submission. */
  submittedUserIds: Set<string>;
  /** Users with draft activity (STARTED submission OR session OR response) AND no submitted submission. */
  draftUserIds: Set<string>;
}

/**
 * CANONICAL classifier. A user is "submitted" if any of their submissions is
 * non-STARTED; "draft" if they have draft activity but no submitted submission.
 */
export function classifyParticipantsRaw(data: RawDraftSourceData): RawClassifiedUserIds {
  // CANONICAL-BEGIN
  const nonStarted = data.submissions.filter(s => s.status !== 'STARTED');
  const submittedUserIds = new Set(nonStarted.map(s => s.userId as string).filter(Boolean));
  const startedSubmissionUserIds = new Set(
    data.submissions.filter(s => s.status === 'STARTED').map(s => s.userId as string).filter(Boolean)
  );
  const draftUserIds = new Set(
    [...startedSubmissionUserIds, ...data.sessionDraftUserIds, ...data.responseDraftUserIds]
      .filter(id => !submittedUserIds.has(id))
  );
  return { submittedUserIds, draftUserIds };
  // CANONICAL-END
}

/** Graded/flagged counters over the non-STARTED submissions. */
export interface RawAssessmentCounts {
  submitted: number;
  graded: number;
  flagged: number;
  aiFlagged: number;
}

export function countAssessmentBuckets(nonStarted: RawSubmissionLike[]): RawAssessmentCounts {
  return {
    submitted: new Set(nonStarted.map(s => s.userId as string).filter(Boolean)).size,
    graded: new Set(nonStarted.filter(s => s.rubricGrade).map(s => s.userId as string).filter(Boolean)).size,
    flagged: nonStarted.filter(s => s.status === 'FLAGGED' && !s.flaggedAsAI).length,
    aiFlagged: nonStarted.filter(s => s.flaggedAsAI).length,
  };
}

/**
 * Not-started count: enrolled students minus submitted minus draft. Draft
 * users are treated as enrolled so enrollment-data drift doesn't hide
 * active students. Returns 0 when no enrollment list is available.
 */
export function computeNotStartedCountRaw(
  enrolledStudentIds: string[],
  submittedUserIds: Set<string>,
  draftUserIds: Set<string>,
): number {
  if (!Array.isArray(enrolledStudentIds) || enrolledStudentIds.length === 0) return 0;
  const enrolledSet = new Set(enrolledStudentIds);
  draftUserIds.forEach(id => enrolledSet.add(id));
  return [...enrolledSet].filter(id => !submittedUserIds.has(id) && !draftUserIds.has(id)).length;
}

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { verifyAdmin, generateCorrelationId, logWithCorrelation } from "./core";

/**
 * Phase 1f — Grading integrity.
 *
 * saveRubricGrade previously wrote grades via direct client updateDoc with all
 * invariants (feedback-history cap, AI-flag auto-clear, score sync) living only
 * in client code permitted by the teacher's admin claim. This Cloud Function is
 * the server-side backstop: it performs the write with validation and owns the
 * notification side-effect so it is atomic with the grade write.
 *
 * The pure invariant helpers below are INLINED from lib/gradingIntegrity.ts
 * (functions rootDir excludes ../../lib). Keep in sync — drift guard:
 * lib/__tests__/grading-integrity.test.ts.
 */

/** Server-enforced cap on rubric feedback history entries. */
const FEEDBACK_HISTORY_CAP = 20;

interface FeedbackHistoryEntry {
  feedback: string;
  timestamp: string;
  gradedBy: string;
}

interface RubricGradeInput {
  grades: Record<string, Record<string, unknown>>;
  overallPercentage: number;
  gradedAt: string;
  gradedBy: string;
  teacherFeedback?: string;
  feedbackHistory?: FeedbackHistoryEntry[];
}

/**
 * INLINED from lib/gradingIntegrity.ts (functions rootDir excludes ../../lib).
 * Keep in sync — drift guard: lib/__tests__/grading-integrity.test.ts.
 */
function buildFeedbackHistory(
  previousGrade: RubricGradeInput | undefined,
  existingHistory: FeedbackHistoryEntry[] | undefined,
): FeedbackHistoryEntry[] {
  const history = existingHistory || [];
  const prevFeedback = previousGrade?.teacherFeedback;
  if (!prevFeedback) return history.slice(0, FEEDBACK_HISTORY_CAP);
  const oldEntry: FeedbackHistoryEntry = {
    feedback: prevFeedback,
    timestamp: previousGrade.gradedAt || new Date().toISOString(),
    gradedBy: previousGrade.gradedBy || "",
  };
  return [oldEntry, ...history].slice(0, FEEDBACK_HISTORY_CAP);
}

/**
 * Save a teacher rubric grade for a submission. Server-side backstop for the
 * invariants that previously lived only in client code:
 *  - score clamped to [0, 100] (rubric overallPercentage bounds),
 *  - feedback history prepended from the previous grade and capped at 20,
 *  - AI-flag auto-clear (grading implies the teacher cleared the flag):
 *    restores pre-flag status and syncs assessmentScore.percentage,
 *  - notification to the student written atomically with the grade.
 */
export const saveRubricGrade = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  await verifyAdmin(request.auth);
  const uid = request.auth!.uid;
  const correlationId = generateCorrelationId();

  const { submissionId, rubricGrade } = request.data as { submissionId?: string; rubricGrade?: RubricGradeInput };
  if (!submissionId || typeof submissionId !== "string") {
    throw new HttpsError("invalid-argument", "submissionId required");
  }
  if (!rubricGrade || typeof rubricGrade !== "object") {
    throw new HttpsError("invalid-argument", "rubricGrade required");
  }
  if (typeof rubricGrade.overallPercentage !== "number" || !isFinite(rubricGrade.overallPercentage)) {
    throw new HttpsError("invalid-argument", "rubricGrade.overallPercentage must be a finite number");
  }
  // Clamp to rubric bounds [0, 100] — mirror the clamp the client applies.
  rubricGrade.overallPercentage = Math.min(100, Math.max(0, Math.round(rubricGrade.overallPercentage)));

  const db = admin.firestore();
  const subRef = db.doc(`submissions/${submissionId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) throw new HttpsError("not-found", "Submission not found");
  const prev = subSnap.data()!;

  // Server-enforced feedback history: prepend previous teacherFeedback, cap at 20.
  const previousGrade = prev.rubricGrade as RubricGradeInput | undefined;
  rubricGrade.feedbackHistory = buildFeedbackHistory(previousGrade, rubricGrade.feedbackHistory);

  const updatePayload: Record<string, unknown> = {
    rubricGrade,
    score: rubricGrade.overallPercentage,
  };
  let clearedAIFlag = false;
  if (prev.flaggedAsAI === true) {
    // Auto-clear AI flag: teacher grading is an implicit decision the work is legitimate.
    // Restore the pre-flag status and sync the assessment percentage.
    updatePayload.flaggedAsAI = false;
    updatePayload.flaggedAsAIBy = "";
    updatePayload.flaggedAsAIAt = "";
    updatePayload.status = prev.preFlagStatus ?? "NORMAL";
    updatePayload["assessmentScore.percentage"] = rubricGrade.overallPercentage;
    clearedAIFlag = true;
  }
  await subRef.update(updatePayload);

  // Notification — atomic with the grade write (same invocation, not client fire-and-forget).
  const studentUserId = prev.userId as string | undefined;
  const assessmentTitle = (prev.assignmentTitle as string | undefined) || "Assessment";
  if (studentUserId) {
    const suffix = assessmentTitle ? ` for "${assessmentTitle}"` : "";
    await db.collection("notifications").add({
      userId: studentUserId,
      type: clearedAIFlag ? "AI_FLAGGED" : "ASSESSMENT_GRADED",
      title: clearedAIFlag ? "AI Flag Cleared & Assessment Graded" : "Assessment Graded",
      message: clearedAIFlag
        ? `Your submission${suffix} has been reviewed. The AI flag has been removed and you received ${rubricGrade.overallPercentage}%.`
        : `Your submission${suffix} has been graded. You received ${rubricGrade.overallPercentage}%.`,
      timestamp: new Date().toISOString(),
      isRead: false,
      meta: { submissionId, assessmentTitle, percentage: rubricGrade.overallPercentage },
    });
  }

  logWithCorrelation("info", "saveRubricGrade: grade saved", correlationId, {
    submissionId, gradedBy: uid, percentage: rubricGrade.overallPercentage, clearedAIFlag,
  });
  return { clearedAIFlag };
});

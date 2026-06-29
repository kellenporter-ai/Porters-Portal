import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { verifyAdmin } from "./core";

/**
 * Server-side per-assessment stats for the grading index page.
 *
 * Replaces the client-side getAssessmentStats derivation to eliminate
 * drift risk and reduce Chromebook compute. The function reads submissions,
 * open assessment sessions, and saved lesson block responses, then classifies
 * participants into submitted / draft / not-started buckets.
 */
export const getAssessmentStats = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  await verifyAdmin(request.auth);

  const { assignmentId, enrolledStudentIds = [] } = request.data;
  if (!assignmentId || typeof assignmentId !== "string") {
    throw new HttpsError("invalid-argument", "Missing or invalid assignmentId");
  }

  const db = admin.firestore();

  const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnap.exists) {
    throw new HttpsError("not-found", "Assignment not found");
  }
  const assignment = assignmentSnap.data()!;
  if (!assignment.isAssessment) {
    throw new HttpsError("invalid-argument", "Not an assessment");
  }

  const [submissionsSnap, sessionsSnap, responsesSnap] = await Promise.all([
    db.collection("submissions").where("assignmentId", "==", assignmentId).limit(500).get(),
    db.collection("assessment_sessions").where("assignmentId", "==", assignmentId).where("used", "==", false).limit(500).get(),
    db.collection("lesson_block_responses").where("assignmentId", "==", assignmentId).limit(500).get(),
  ]);

  const submissions = submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));

  const sessionDraftUserIds = new Set<string>(
    sessionsSnap.docs.map(d => d.data().userId as string).filter(Boolean)
  );

  const responseDraftUserIds = new Set<string>(
    responsesSnap.docs
      .filter(d => {
        const responses = d.data().responses as Record<string, unknown> | undefined;
        return responses && Object.keys(responses).length > 0;
      })
      .map(d => d.data().userId as string)
      .filter(Boolean)
  );

  const nonStarted = submissions.filter(s => s.status !== "STARTED");
  const submittedUserIds = new Set(nonStarted.map(s => s.userId as string));
  const startedSubmissionUserIds = new Set(
    submissions.filter(s => s.status === "STARTED").map(s => s.userId as string)
  );

  const draftUserIds = new Set(
    [...startedSubmissionUserIds, ...sessionDraftUserIds, ...responseDraftUserIds]
      .filter(id => !submittedUserIds.has(id))
  );

  const submitted = submittedUserIds.size;
  const graded = new Set(nonStarted.filter(s => s.rubricGrade).map(s => s.userId as string)).size;
  const flagged = nonStarted.filter(s => s.status === "FLAGGED" && !s.flaggedAsAI).length;
  const aiFlagged = nonStarted.filter(s => s.flaggedAsAI).length;
  const draft = draftUserIds.size;

  let notStarted = 0;
  if (Array.isArray(enrolledStudentIds) && enrolledStudentIds.length > 0) {
    // Treat any draft user as enrolled so enrollment-data drift doesn't hide active students.
    const enrolledSet = new Set(enrolledStudentIds);
    draftUserIds.forEach(id => enrolledSet.add(id));
    notStarted = [...enrolledSet].filter(id => !submittedUserIds.has(id) && !draftUserIds.has(id)).length;
  }

  return { submitted, graded, flagged, aiFlagged, draft, notStarted };
});

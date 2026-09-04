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
 *
 * The classification rules are INLINED from lib/assessmentClassifierShared.ts
 * (functions rootDir excludes ../../lib imports). Keep in sync — drift guard:
 * lib/__tests__/assessment-classifier.test.ts.
 */

interface RawSubmissionLike {
  userId?: unknown;
  status?: unknown;
  rubricGrade?: unknown;
  flaggedAsAI?: unknown;
}

/**
 * INLINED from lib/assessmentClassifierShared.ts (classifyParticipantsRaw).
 * Keep in sync — drift guard: lib/__tests__/assessment-classifier.test.ts.
 */
function classifyParticipants(
  submissions: RawSubmissionLike[],
  sessionDraftUserIds: Set<string>,
  responseDraftUserIds: Set<string>,
): { submittedUserIds: Set<string>; draftUserIds: Set<string> } {
  // CANONICAL-BEGIN
  const nonStarted = submissions.filter(s => s.status !== 'STARTED');
  const submittedUserIds = new Set(nonStarted.map(s => s.userId as string).filter(Boolean));
  const startedSubmissionUserIds = new Set(
    submissions.filter(s => s.status === 'STARTED').map(s => s.userId as string).filter(Boolean)
  );
  const draftUserIds = new Set(
    [...startedSubmissionUserIds, ...sessionDraftUserIds, ...responseDraftUserIds]
      .filter(id => !submittedUserIds.has(id))
  );
  return { submittedUserIds, draftUserIds };
  // CANONICAL-END
}

export const getAssessmentStatsBatch = onCall({ memory: "256MiB", timeoutSeconds: 120 }, async (request) => {
  await verifyAdmin(request.auth);

  const { assignmentIds, enrolledStudentIdsByAssignment = {} } = request.data;
  if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
    throw new HttpsError("invalid-argument", "Missing or invalid assignmentIds");
  }
  if (assignmentIds.length > 100) {
    throw new HttpsError("invalid-argument", "Too many assignmentIds (max 100)");
  }

  const db = admin.firestore();

  // Fetch all assignments in one batch, then run the per-assessment stats
  // queries in parallel server-side. Each assessment still respects the
  // 500-doc cap on submissions / sessions / lesson_block_responses.
  const assignmentRefs = assignmentIds.map((id: string) => db.doc(`assignments/${id}`));
  const assignmentSnaps = await db.getAll(...assignmentRefs);

  const results: Record<string, unknown> = {};
  await Promise.all(assignmentSnaps.map(async (snap, i) => {
    const assignmentId = assignmentIds[i] as string;
    if (!snap.exists) {
      results[assignmentId] = { error: "not-found" };
      return;
    }
    const assignment = snap.data()!;
    if (!assignment.isAssessment) {
      results[assignmentId] = { error: "not-assessment" };
      return;
    }

    const [submissionsSnap, sessionsSnap, responsesSnap] = await Promise.all([
      db.collection("submissions").where("assignmentId", "==", assignmentId).limit(500).get(),
      db.collection("assessment_sessions").where("assignmentId", "==", assignmentId).where("used", "==", false).limit(500).get(),
      db.collection("lesson_block_responses").where("assignmentId", "==", assignmentId).limit(500).get(),
    ]);

    const submissions = submissionsSnap.docs.map(d => d.data() as RawSubmissionLike);
    const nonStarted = submissions.filter(s => s.status !== "STARTED");

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

    const { submittedUserIds, draftUserIds } = classifyParticipants(submissions, sessionDraftUserIds, responseDraftUserIds);

    const submitted = new Set(nonStarted.map(s => s.userId as string).filter(Boolean)).size;
    const graded = new Set(nonStarted.filter(s => s.rubricGrade).map(s => s.userId as string).filter(Boolean)).size;
    const flagged = nonStarted.filter(s => s.status === "FLAGGED" && !s.flaggedAsAI).length;
    const aiFlagged = nonStarted.filter(s => s.flaggedAsAI).length;
    const draft = draftUserIds.size;

    let notStarted = 0;
    const enrolled = enrolledStudentIdsByAssignment[assignmentId];
    if (Array.isArray(enrolled) && enrolled.length > 0) {
      const enrolledSet = new Set<string>(enrolled);
      draftUserIds.forEach(id => enrolledSet.add(id));
      notStarted = [...enrolledSet].filter(id => !submittedUserIds.has(id) && !draftUserIds.has(id)).length;
    }

    results[assignmentId] = { submitted, graded, flagged, aiFlagged, draft, notStarted };
  }));

  return { stats: results };
});

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

  const submissions = submissionsSnap.docs.map(d => d.data() as RawSubmissionLike);
  const nonStarted = submissions.filter(s => s.status !== "STARTED");

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

  const { submittedUserIds, draftUserIds } = classifyParticipants(submissions, sessionDraftUserIds, responseDraftUserIds);

  // INLINED from lib/assessmentClassifierShared.ts (countAssessmentBuckets).
  const submitted = new Set(nonStarted.map(s => s.userId as string).filter(Boolean)).size;
  const graded = new Set(nonStarted.filter(s => s.rubricGrade).map(s => s.userId as string).filter(Boolean)).size;
  const flagged = nonStarted.filter(s => s.status === "FLAGGED" && !s.flaggedAsAI).length;
  const aiFlagged = nonStarted.filter(s => s.flaggedAsAI).length;
  const draft = draftUserIds.size;

  // INLINED from lib/assessmentClassifierShared.ts (computeNotStartedCountRaw):
  // treat any draft user as enrolled so enrollment-data drift doesn't hide active students.
  let notStarted = 0;
  if (Array.isArray(enrolledStudentIds) && enrolledStudentIds.length > 0) {
    const enrolledSet = new Set<string>(enrolledStudentIds);
    draftUserIds.forEach(id => enrolledSet.add(id));
    notStarted = [...enrolledSet].filter(id => !submittedUserIds.has(id) && !draftUserIds.has(id)).length;
  }

  return { submitted, graded, flagged, aiFlagged, draft, notStarted };
});

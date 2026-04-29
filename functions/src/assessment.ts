import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  verifyAuth,
  verifyAdmin,
  calculateFeedbackServerSide,
  TelemetryThresholds,
  getActiveXPMultiplier,
} from "./core";

// ==========================================
// ASSESSMENT GRADING HELPER — Reusable block grading logic
// ==========================================
function gradeAssessmentBlocks(
  blocks: Array<Record<string, unknown>>,
  responses: Record<string, unknown>
): { correct: number; total: number; percentage: number; perBlock: Record<string, { correct: boolean; answer: unknown; needsReview?: boolean }> } {
  let correct = 0;
  let total = 0;
  const perBlock: Record<string, { correct: boolean; answer: unknown; needsReview?: boolean }> = {};

  for (const block of blocks) {
    if (["MC", "SHORT_ANSWER", "SORTING", "RANKING", "LINKED"].includes(block.type as string)) {
      const resp = (responses as Record<string, Record<string, unknown>>)[block.id as string];
      let isCorrect = false;
      let needsReview = false;

      if (block.type === "MC" && String(resp?.selected ?? "").trim() === String(block.correctAnswer ?? "").trim()) {
        isCorrect = true;
      }
      if (block.type === "SHORT_ANSWER" || block.type === "LINKED") {
        const accepted = ((block.acceptedAnswers || []) as string[]).map((a: string) => a.toLowerCase().trim()).filter(Boolean);
        if (accepted.length === 0) {
          needsReview = true;
        } else {
          isCorrect = accepted.includes(((resp?.answer || "") as string).toLowerCase().trim());
        }
      }
      if (block.type === "SORTING") {
        const sortItems = (block.sortItems || []) as Array<{ correct: string }>;
        const placements = (resp?.placements || {}) as Record<string, string>;
        isCorrect = sortItems.length > 0 && sortItems.every((item: { correct: string }, idx: number) =>
          placements[String(idx)] === item.correct
        );
      }
      if (block.type === "RANKING") {
        const items = (block.items || []) as string[];
        const order = (resp?.order || []) as Array<{ item: string }>;
        isCorrect = items.length > 0 && order.length === items.length &&
          order.every((o: { item: string }, idx: number) => o.item === items[idx]);
      }

      if (needsReview) {
        perBlock[block.id as string] = { correct: false, answer: resp ?? null, needsReview: true };
      } else {
        total++;
        if (isCorrect) correct++;
        perBlock[block.id as string] = { correct: isCorrect, answer: resp ?? null };
      }
    }

    // Non-auto-gradable interactive blocks — always require manual/rubric review
    if (["DRAWING", "MATH_RESPONSE", "BAR_CHART", "DATA_TABLE", "CHECKLIST"].includes(block.type as string)) {
      const resp = (responses as Record<string, unknown>)[block.id as string] ?? null;
      perBlock[block.id as string] = { correct: false, answer: resp, needsReview: true };
    }
  }

  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, percentage, perBlock };
}
// ==========================================
// START ASSESSMENT SESSION — Issue cryptographic session token
// ==========================================
export const startAssessmentSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
  const uid = request.auth.uid;
  const { assignmentId } = request.data;
  if (!assignmentId) throw new HttpsError("invalid-argument", "Missing assignmentId");

  const db = admin.firestore();

  // Validate assignment exists and is an assessment
  const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnap.exists) throw new HttpsError("not-found", "Assignment not found");
  const assignment = assignmentSnap.data()!;
  if (!assignment.isAssessment) throw new HttpsError("invalid-argument", "Not an assessment");

  // Check for existing unused session token (crash recovery — reuse instead of creating new)
  const existingTokens = await db.collection("assessment_sessions")
    .where("userId", "==", uid)
    .where("assignmentId", "==", assignmentId)
    .where("used", "==", false)
    .limit(1)
    .get();
  if (!existingTokens.empty) {
    const existingToken = existingTokens.docs[0];
    logger.info(`startAssessmentSession: reusing existing token for uid=${uid}, assignment=${assignmentId}`);
    return { sessionToken: existingToken.id, startedAt: Date.now() };
  }

  // Check max attempts
  const cfg = assignment.assessmentConfig || {};
  if (cfg.maxAttempts && cfg.maxAttempts > 0) {
    const existingSubs = await db.collection("submissions")
      .where("userId", "==", uid)
      .where("assignmentId", "==", assignmentId)
      .where("isAssessment", "==", true)
      .get();
    const activeSubmissions = existingSubs.docs.filter(d => d.data().status !== "RETURNED");
    if (activeSubmissions.length >= cfg.maxAttempts) {
      throw new HttpsError("resource-exhausted", "You have used all available attempts for this assessment.");
    }
  }

  // Generate cryptographic session token
  const crypto = await import("crypto");
  const token = crypto.randomUUID();

  await db.collection("assessment_sessions").doc(token).set({
    userId: uid,
    assignmentId,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    used: false,
  });

  logger.info(`startAssessmentSession: token issued for uid=${uid}, assignment=${assignmentId}`);
  return { sessionToken: token, startedAt: Date.now() };
});
// ==========================================
// SUBMIT ASSESSMENT — Server-side grading + telemetry
// ==========================================
export const submitAssessment = onCall({ minInstances: 1 }, async (request) => {
  // 1. Verify auth
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
  const uid = request.auth.uid;

  const { assignmentId, userName, responses, metrics, classType, sessionToken } = request.data;
  if (!assignmentId || !responses || !metrics) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }

  // 2. Validate session token (or enforce grace period)
  const db = admin.firestore();
  let sessionStartedAt: number | null = null;
  // Hoist tokenRef so it's accessible for the atomic commit transaction later
  const tokenRef = sessionToken ? db.collection("assessment_sessions").doc(sessionToken) : null;

  if (sessionToken && tokenRef) {
    // Phase 1: Validate token AND claim it atomically (prevents double-submit race)
    const tokenData = await db.runTransaction(async (transaction) => {
      const tokenSnap = await transaction.get(tokenRef);
      if (!tokenSnap.exists) {
        throw new HttpsError("not-found", "Invalid session token. Please refresh the page and try again.");
      }
      const data = tokenSnap.data()!;
      if (data.userId !== uid) {
        throw new HttpsError("permission-denied", "Session token does not match your account.");
      }
      if (data.assignmentId !== assignmentId) {
        throw new HttpsError("invalid-argument", "Session token does not match this assessment.");
      }
      if (data.used) {
        throw new HttpsError("already-exists", "This assessment session has already been submitted. Please start a new attempt.");
      }
      // Claim token immediately — second request will see used:true and fail fast
      transaction.update(tokenRef, { used: true, usedAt: admin.firestore.FieldValue.serverTimestamp() });
      return data;
    });
    // Extract startedAt from the session doc (Firestore Timestamp -> millis)
    if (tokenData.startedAt && typeof tokenData.startedAt.toMillis === "function") {
      sessionStartedAt = tokenData.startedAt.toMillis();
    } else if (tokenData.startedAt) {
      sessionStartedAt = Number(tokenData.startedAt);
    }
  } else {
    // No session token — check if student has unsaved draft responses for a helpful error
    const draftRef = db.doc(`lesson_block_responses/${uid}_${assignmentId}_blocks`);
    const draftSnap = await draftRef.get();
    const hasUnsavedWork = draftSnap.exists && Object.keys(draftSnap.data()?.responses || {}).length > 0;
    throw new HttpsError("failed-precondition",
      JSON.stringify({
        message: "Your session has expired. Please start a new assessment attempt.",
        hasUnsavedWork,
        hint: hasUnsavedWork ? "Your draft responses are saved. Starting a new attempt will preserve them for recovery." : undefined,
      }));
  }

  // Hoist variables needed after the try/catch (XP award + return value)
  let correct = 0, total = 0, percentage = 0;
  let perBlock: Record<string, { correct: boolean; answer: unknown; needsReview?: boolean }> = {};
  let attemptNumber = 1;
  let status: string = "CLEAN";
  let xpEarned = 0;

  // Pre-read telemetry thresholds
  let assessmentThresholds: Partial<TelemetryThresholds> = {};
  if (classType) {
    const configSnap = await db.collection("class_configs")
      .where("className", "==", classType).limit(1).get();
    if (!configSnap.empty) {
      assessmentThresholds = configSnap.docs[0].data().telemetryThresholds || {};
    }
  }

  // Everything after token claim is wrapped in try/catch for compensating rollback
  try {

  // Wrap grading + write in a transaction for atomicity
  const txResult = await db.runTransaction(async (transaction) => {
    // 3. Read assignment to get answer keys
    const assignmentSnap = await transaction.get(db.doc(`assignments/${assignmentId}`));
    if (!assignmentSnap.exists) throw new HttpsError("not-found", "Assignment not found");
    const assignment = assignmentSnap.data()!;

    if (!assignment.isAssessment) throw new HttpsError("invalid-argument", "Not an assessment");

    // Validate student is enrolled in the class offering this assessment
    let userSection: string | undefined;
    if (assignment.classType) {
      const studentSnap = await transaction.get(db.doc(`users/${uid}`));
      const studentData = studentSnap.data();
      const enrolledClasses: string[] = studentData?.enrolledClasses || [];
      const studentClassType = studentData?.classType;
      if (!enrolledClasses.includes(assignment.classType) && studentClassType !== assignment.classType) {
        throw new HttpsError("permission-denied", "Not enrolled in the class for this assessment.");
      }
      userSection = studentData?.classSections?.[classType]
        ?? ((studentData?.classType === classType || (studentData?.enrolledClasses || []).includes(classType)) ? studentData?.section : undefined);
    }

    // 3. Grade auto-gradable blocks
    const blocks = assignment.lessonBlocks || [];
    const gradeResult = gradeAssessmentBlocks(blocks, responses);

    // 5a. Server-side elapsed time validation
    const serverNow = Date.now();
    const effectiveStartTime = sessionStartedAt || metrics.startTime || serverNow;
    const serverElapsedSec = Math.max(0, (serverNow - effectiveStartTime) / 1000);
    // Use the lesser of client-reported engagement and server-computed elapsed time.
    const validatedEngagement = metrics.engagementTime > 0
      ? Math.min(metrics.engagementTime, serverElapsedSec + 5)
      : 0;

    // Count non-empty responses to assess plausibility
    const responseKeys = Object.keys(responses || {});
    const nonEmptyResponses = responseKeys.filter(key => {
      const r = responses[key];
      if (!r) return false;
      if (typeof r === 'string') return r.trim().length > 0;
      if (typeof r === 'object') {
        const obj = r as Record<string, unknown>;
        return obj.selected != null || (typeof obj.answer === 'string' && obj.answer.trim().length > 0) ||
          (obj.placements && Object.keys(obj.placements as Record<string, unknown>).length > 0) ||
          (Array.isArray(obj.order) && obj.order.length > 0) ||
          (Array.isArray(obj.elements) && obj.elements.length > 0) ||
          (Array.isArray(obj.steps) && obj.steps.length > 0) ||
          (Array.isArray(obj.initial));
      }
      return true;
    });

    // 5b. Calculate word count from short-answer responses
    let totalWordCount = 0;
    for (const block of blocks) {
      if (block.type === "SHORT_ANSWER" || block.type === "LINKED") {
        const resp = responses[block.id];
        const answerText = typeof resp?.answer === "string" ? resp.answer.trim() : "";
        if (answerText.length > 0) {
          totalWordCount += answerText.split(/\s+/).length;
        }
      }
    }
    const wordsPerSecond = validatedEngagement > 0 ? Math.round((totalWordCount / validatedEngagement) * 100) / 100 : 0;

    // 5c. Calculate telemetry status
    let feedback = "Assignment submitted successfully.";
    let txStatus = "CLEAN";
    ({ status: txStatus, feedback } = calculateFeedbackServerSide({
      pasteCount: metrics.pasteCount || 0,
      engagementTime: validatedEngagement,
      keystrokes: metrics.keystrokes || 0,
      tabSwitchCount: metrics.tabSwitchCount || 0,
      wordCount: totalWordCount,
      wordsPerSecond,
    }, assessmentThresholds, {
      responseCount: nonEmptyResponses.length,
      hasWrittenResponses: nonEmptyResponses.length > 0,
    }));

    if (txStatus === "FLAGGED") {
      logger.warn(`submitAssessment FLAGGED: uid=${uid}, assignment=${assignmentId}, ` +
        `clientEngagement=${metrics.engagementTime}s, serverElapsed=${Math.round(serverElapsedSec)}s, ` +
        `validatedEngagement=${Math.round(validatedEngagement)}s, keystrokes=${metrics.keystrokes}, ` +
        `pastes=${metrics.pasteCount}, responses=${nonEmptyResponses.length}, feedback="${feedback}"`);
    }

    // Atomic attempt counter to prevent race conditions
    const counterRef = db.doc(`assessment_attempt_counters/${uid}_${assignmentId}`);
    const counterSnap = await transaction.get(counterRef);
    const currentCount = counterSnap.exists ? (counterSnap.data()!.count || 0) : 0;
    const txAttemptNumber = currentCount + 1;
    transaction.set(counterRef, { count: txAttemptNumber }, { merge: true });

    // 6. Create submission doc
    const assessmentSubmission = {
      userId: uid,
      userName: userName || "Student",
      assignmentId,
      assignmentTitle: assignment.title || "",
      metrics: {
        engagementTime: validatedEngagement,
        clientReportedEngagement: metrics.engagementTime || 0,
        keystrokes: metrics.keystrokes || 0,
        pasteCount: metrics.pasteCount || 0,
        clickCount: metrics.clickCount || 0,
        startTime: metrics.startTime || 0,
        lastActive: metrics.lastActive || 0,
        tabSwitchCount: metrics.tabSwitchCount || 0,
        perBlockTiming: metrics.perBlockTiming || {},
        typingCadence: metrics.typingCadence || {},
        serverElapsedSec: Math.round(serverElapsedSec),
        wordCount: totalWordCount,
        wordsPerSecond,
      },
      submittedAt: new Date().toISOString(),
      status: txStatus,
      feedback,
      score: gradeResult.percentage,
      isAssessment: true,
      attemptNumber: txAttemptNumber,
      assessmentScore: gradeResult,
      blockResponses: responses,
      privateComments: [],
      hasUnreadAdmin: true,
      hasUnreadStudent: false,
      classType: classType || "",
      ...(userSection ? { userSection } : {}),
      ...(sessionToken ? { sessionToken } : {}),
    };

    // Atomic write: submission create + draft delete
    const submissionRef = db.collection("submissions").doc();
    transaction.set(submissionRef, assessmentSubmission);
    const draftRef = db.doc(`lesson_block_responses/${uid}_${assignmentId}_blocks`);
    transaction.delete(draftRef);

    return { gradeResult, status: txStatus, feedback, attemptNumber: txAttemptNumber };
  });

  correct = txResult.gradeResult.correct;
  total = txResult.gradeResult.total;
  percentage = txResult.gradeResult.percentage;
  perBlock = txResult.gradeResult.perBlock;
  status = txResult.status;
  attemptNumber = txResult.attemptNumber;

  } catch (err) {
    // Compensating action: un-claim token so student can retry
    if (tokenRef) {
      try {
        await tokenRef.update({ used: false, usedAt: admin.firestore.FieldValue.delete() });
        logger.warn(`submitAssessment: token unclaimed after error for uid=${uid}`);
      } catch (rollbackErr) {
        logger.error(`submitAssessment: failed to unclaim token for uid=${uid}`, rollbackErr);
      }
    }
    throw err;
  }

  // 7. Award XP scaled by percentage (outside try/catch — XP failure must NOT
  // rollback a successful submission. Missing 0-50 XP is non-critical.)
  const baseXP = Math.round(percentage * 0.5); // 0-50 XP
  try {
    if (baseXP > 0) {
      // Get active multiplier
      const effectiveClass = classType || "Uncategorized";
      const now = new Date().toISOString();
      const xpEventsSnap = await db.collection("xp_events")
        .where("isActive", "==", true)
        .get();
      let multiplier = 1;
      xpEventsSnap.docs.forEach((d) => {
        const ev = d.data();
        if (ev.expiresAt && ev.expiresAt < now) return;
        if (ev.scheduledAt && ev.scheduledAt > now) return;
        if (ev.type === "GLOBAL" || ev.targetClass === effectiveClass) {
          multiplier = Math.max(multiplier, ev.multiplier || 1);
        }
      });
      xpEarned = Math.round(baseXP * multiplier);

      const userRef = db.doc(`users/${uid}`);
      await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) return;
        const data = userSnap.data()!;
        const gam = data.gamification || {};
        const classXp = gam.classXp || {};
        transaction.update(userRef, {
          "gamification.xp": (gam.xp || 0) + xpEarned,
          [`gamification.classXp.${effectiveClass}`]: (classXp[effectiveClass] || 0) + xpEarned,
        });
      });
    }
  } catch (xpErr) {
    // Non-critical: log but don't fail the submission
    logger.error(`submitAssessment: XP award failed for uid=${uid}, assignment=${assignmentId}`, xpErr);
  }

  logger.info(`submitAssessment: ${uid} scored ${percentage}% (${correct}/${total}) on ${assignmentId}, attempt #${attemptNumber}`);
  return {
    assessmentScore: { correct, total, percentage, perBlock },
    attemptNumber,
    status,
    xpEarned,
  };
});
// ==========================================
// RETURN ASSESSMENT — Allow student to revise and resubmit
// ==========================================
export const returnAssessment = onCall(async (request) => {
  // 1. Verify admin
  await verifyAdmin(request.auth);

  // 2. Validate input
  const { submissionId } = request.data;
  if (!submissionId) throw new HttpsError("invalid-argument", "submissionId required");

  // 3. Read submission
  const db = admin.firestore();
  const subRef = db.doc(`submissions/${submissionId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) throw new HttpsError("not-found", "Submission not found");
  const sub = subSnap.data()!;

  // 4. Validate it's an assessment and not already returned
  if (!sub.isAssessment) throw new HttpsError("invalid-argument", "Not an assessment submission");
  if (sub.status === "RETURNED") throw new HttpsError("already-exists", "This submission has already been returned");

  // 5. Check no active session (student mid-attempt)
  const activeSessions = await db.collection("assessment_sessions")
    .where("userId", "==", sub.userId)
    .where("assignmentId", "==", sub.assignmentId)
    .where("used", "==", false)
    .limit(1)
    .get();
  if (!activeSessions.empty) {
    throw new HttpsError("failed-precondition", "Student has an active assessment session. Wait for them to submit or use Submit on Behalf.");
  }

  // 6. Copy blockResponses to lesson_block_responses for pre-fill
  if (sub.blockResponses && Object.keys(sub.blockResponses).length > 0) {
    const draftRef = db.doc(`lesson_block_responses/${sub.userId}_${sub.assignmentId}_blocks`);
    await draftRef.set({
      userId: sub.userId,
      assignmentId: sub.assignmentId,
      responses: sub.blockResponses,
      lastUpdated: new Date().toISOString(),
      retakePreFilled: true,
    });
  }

  // 7. Update submission — mark as RETURNED, preserve grades for comparison
  await subRef.update({
    status: "RETURNED",
    returnedAt: new Date().toISOString(),
    returnedBy: request.auth!.uid,
  });

  // 8. Notify student
  const assignmentSnap = await db.doc(`assignments/${sub.assignmentId}`).get();
  const classType = assignmentSnap.exists ? assignmentSnap.data()!.classType : "";
  const title = sub.assignmentTitle || "Assessment";

  await db.collection("announcements").add({
    title: "Assessment Returned",
    content: `Your assessment "${title}" has been returned for revision. Please review and resubmit.`,
    classType: classType || "GLOBAL",
    priority: "INFO",
    createdAt: new Date().toISOString(),
    createdBy: "Admin",
    targetStudentIds: [sub.userId],
  });

  logger.info(`returnAssessment: submission ${submissionId} returned by ${request.auth!.uid}`);
  return { success: true };
});
// ==========================================
// SUBMIT ON BEHALF — Admin submits student's draft work
// ==========================================
export const submitOnBehalf = onCall({ timeoutSeconds: 120 }, async (request) => {
  // 1. Verify auth and admin status
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Must be logged in.");

  const callerUser = await admin.auth().getUser(callerUid);
  const isAdmin = !!callerUser.customClaims?.admin;

  // 2. Validate input
  const { userId, assignmentId } = request.data;
  if (!userId || !assignmentId) {
    logger.error("submitOnBehalf: missing userId or assignmentId", { data: request.data });
    throw new HttpsError("invalid-argument", "userId and assignmentId required");
  }

  const db = admin.firestore();

  try {

  // 3. Read draft responses
  const draftRef = db.doc(`lesson_block_responses/${userId}_${assignmentId}_blocks`);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) {
    logger.error("submitOnBehalf: No draft found", { userId, assignmentId });
    throw new HttpsError("not-found", "No draft responses found for this student");
  }
  const draftData = draftSnap.data()!;
  const responses = draftData.responses || {};
  if (Object.keys(responses).length === 0) {
    logger.error("submitOnBehalf: Draft has no responses", { userId, assignmentId });
    throw new HttpsError("not-found", "Draft has no responses");
  }

  // 4. Read assignment
  const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnap.exists) {
    logger.error("submitOnBehalf: Assignment not found", { userId, assignmentId });
    throw new HttpsError("not-found", "Assignment not found");
  }
  const assignment = assignmentSnap.data()!;
  if (!assignment.isAssessment) {
    logger.error("submitOnBehalf: Not an assessment", { userId, assignmentId });
    throw new HttpsError("invalid-argument", "Not an assessment");
  }

  // Verify caller is admin or teacher of this class
  if (!isAdmin) {
    const callerSnap = await db.doc(`users/${callerUid}`).get();
    const callerData = callerSnap.exists ? callerSnap.data()! : {};
    const teacherClasses = callerData.teacherClasses || [];
    if (!assignment.classType || !teacherClasses.includes(assignment.classType)) {
      throw new HttpsError("permission-denied", "Admin or teacher of this class required.");
    }
  }

  // 5. Grade using shared helper
  const blocks = assignment.lessonBlocks || [];
  const { correct, total, percentage, perBlock } = gradeAssessmentBlocks(blocks, responses);

  // 6. Find session token (query outside transaction — inequality filters not allowed in transactions)
  const sessionQuery = await db.collection("assessment_sessions")
    .where("userId", "==", userId)
    .where("assignmentId", "==", assignmentId)
    .where("used", "==", false)
    .limit(1)
    .get();
  const sessionDoc = sessionQuery.empty ? null : sessionQuery.docs[0];
  let sessionStartedAt: number | null = null;
  if (sessionDoc) {
    const startedAt = sessionDoc.data().startedAt;
    sessionStartedAt = startedAt?.toMillis?.() || Number(startedAt) || null;
  }

  // 8. Look up student info
  const studentSnap = await db.doc(`users/${userId}`).get();
  const studentData = studentSnap.exists ? studentSnap.data()! : {};
  const userName = studentData.name || studentData.displayName || "Student";
  const classType = assignment.classType || "";

  // Look up section
  let userSection: string | undefined;
  if (classType) {
    userSection = studentData.classSections?.[classType]
      ?? ((studentData.classType === classType || (studentData.enrolledClasses || []).includes(classType)) ? studentData.section : undefined);
  }

  // 9. Build metrics from Proctor snapshot (falls back to session-based estimate)
  const serverNow = Date.now();
  const elapsed = sessionStartedAt ? Math.max(0, (serverNow - sessionStartedAt) / 1000) : 0;
  const snap = draftData.metricsSnapshot as Record<string, unknown> | undefined;

  // 9b. Calculate word count from short-answer responses
  let totalWordCount = 0;
  for (const block of blocks) {
    if (block.type === "SHORT_ANSWER" || block.type === "LINKED") {
      const resp = responses[block.id] as Record<string, unknown> | undefined;
      const answerText = typeof resp?.answer === "string" ? (resp.answer as string).trim() : "";
      if (answerText.length > 0) {
        totalWordCount += answerText.split(/\s+/).length;
      }
    }
  }
  const metricsEngagement = snap ? (Number(snap.engagementTime) || 0) : elapsed;
  const wordsPerSecond = metricsEngagement > 0 ? Math.round((totalWordCount / metricsEngagement) * 100) / 100 : 0;

  // 9c. Run telemetry validation (same as submitAssessment)
  const responseCount = Object.keys(responses).filter(k => {
    const r = responses[k];
    if (!r) return false;
    if (typeof r === 'object') {
      const obj = r as Record<string, unknown>;
      return obj.selected != null || (typeof obj.answer === 'string' && obj.answer.trim().length > 0);
    }
    return typeof r === 'string' ? r.trim().length > 0 : true;
  }).length;
  const { status: behalfStatus, feedback: behalfFeedback } = calculateFeedbackServerSide({
    pasteCount: Number(snap?.pasteCount) || 0,
    engagementTime: metricsEngagement,
    keystrokes: Number(snap?.keystrokes) || 0,
    tabSwitchCount: Number(snap?.tabSwitchCount) || 0,
    wordCount: totalWordCount,
    wordsPerSecond,
  }, {}, { responseCount, hasWrittenResponses: responseCount > 0 });

  // 10. Build submission doc + atomic write (session mark + submission in one transaction)
  const submissionDoc = {
    userId,
    userName,
    assignmentId,
    assignmentTitle: assignment.title || "",
    metrics: snap ? {
      engagementTime: snap.engagementTime || 0,
      clientReportedEngagement: snap.engagementTime || 0,
      keystrokes: snap.keystrokes || 0,
      pasteCount: snap.pasteCount || 0,
      clickCount: snap.clickCount || 0,
      startTime: snap.startTime || sessionStartedAt || serverNow,
      lastActive: snap.lastActive || serverNow,
      tabSwitchCount: snap.tabSwitchCount || 0,
      perBlockTiming: snap.perBlockTiming || {},
      typingCadence: snap.typingCadence || {},
      serverElapsedSec: Math.round(elapsed),
      wordCount: totalWordCount,
      wordsPerSecond,
    } : {
      engagementTime: elapsed,
      clientReportedEngagement: 0,
      keystrokes: 0,
      pasteCount: 0,
      clickCount: 0,
      startTime: sessionStartedAt || serverNow,
      lastActive: serverNow,
      tabSwitchCount: 0,
      perBlockTiming: {},
      typingCadence: {},
      serverElapsedSec: Math.round(elapsed),
      wordCount: totalWordCount,
      wordsPerSecond,
    },
    submittedAt: new Date().toISOString(),
    status: behalfStatus,
    feedback: behalfFeedback,
    score: percentage,
    isAssessment: true,
    assessmentScore: { correct, total, percentage, perBlock },
    blockResponses: responses,
    privateComments: [],
    hasUnreadAdmin: true,
    hasUnreadStudent: false,
    classType: classType || "",
    submittedOnBehalfBy: request.auth!.uid,
    ...(userSection ? { userSection } : {}),
  };

  const txResult = await db.runTransaction(async (t) => {
    // Re-read session inside transaction to prevent double-submit race
    if (sessionDoc) {
      const freshSession = await t.get(sessionDoc.ref);
      if (freshSession.exists && !freshSession.data()?.used) {
        t.update(sessionDoc.ref, { used: true, usedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    // Atomic attempt counter to prevent race conditions
    const counterRef = db.doc(`assessment_attempt_counters/${userId}_${assignmentId}`);
    const counterSnap = await t.get(counterRef);
    const currentCount = counterSnap.exists ? (counterSnap.data()!.count || 0) : 0;
    const txAttemptNumber = currentCount + 1;
    t.set(counterRef, { count: txAttemptNumber }, { merge: true });

    const subRef = db.collection("submissions").doc();
    t.set(subRef, { ...submissionDoc, attemptNumber: txAttemptNumber });

    return { attemptNumber: txAttemptNumber };
  });

  // 11. Award XP (same as submitAssessment)
  const baseXP = Math.round(percentage * 0.5);
  let xpEarned = 0;
  if (baseXP > 0) {
    const effectiveClass = classType || "Uncategorized";
    const multiplier = await getActiveXPMultiplier(effectiveClass);
    xpEarned = Math.round(baseXP * multiplier);

    const userRef = db.doc(`users/${userId}`);
    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) return;
      const data = userSnap.data()!;
      const gam = data.gamification || {};
      const classXp = gam.classXp || {};
      transaction.update(userRef, {
        "gamification.xp": (gam.xp || 0) + xpEarned,
        [`gamification.classXp.${effectiveClass}`]: (classXp[effectiveClass] || 0) + xpEarned,
      });
    });
  }

  // 12. Notify student
  await db.collection("announcements").add({
    title: "Assessment Submitted",
    content: `Your teacher has submitted your draft work for "${assignment.title || "Assessment"}". You can view your results in the portal.`,
    classType: classType || "GLOBAL",
    priority: "INFO",
    createdAt: new Date().toISOString(),
    createdBy: "Admin",
    targetStudentIds: [userId],
  });

  logger.info(`submitOnBehalf: admin ${request.auth!.uid} submitted for ${userId} on ${assignmentId}, scored ${percentage}%`);
  return { success: true, assessmentScore: { correct, total, percentage, perBlock }, attemptNumber: txResult.attemptNumber, xpEarned };

  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("submitOnBehalf: unexpected error", { userId, assignmentId, error: String(err) });
    throw new HttpsError("internal", "Unexpected error during submit on behalf");
  }
});
/**
 * uploadQuestionBank — Admin uploads a pre-generated question bank JSON.
 * Validates structure, stores in Firestore.
 * @param {object} request - The callable request.
 * @return {object} Result with question count.
 */
export const uploadQuestionBank = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const {
    assignmentId, questions, title, classType,
  } = request.data;
  if (!assignmentId || !questions) {
    throw new HttpsError("invalid-argument", "Assignment ID and questions required.");
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new HttpsError("invalid-argument", "Questions must be a non-empty array.");
  }

  // Validate question structure
  const VALID_QUESTION_TYPES = ["MC", "SHORT_ANSWER", "SORTING", "RANKING", "LINKED", "DRAWING", "MATH_RESPONSE", "BAR_CHART", "DATA_TABLE", "CHECKLIST"];
  const valid = questions.every((q: Record<string, unknown>) =>
    typeof q.id === "string" && (q.id as string).length > 0 &&
    typeof q.tier === "string" &&
    typeof q.type === "string" && VALID_QUESTION_TYPES.includes(q.type as string) &&
    typeof q.stem === "string" && (q.stem as string).length > 0 &&
    Array.isArray(q.options) && (q.options as unknown[]).length >= 2 &&
    q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== "" &&
    (typeof q.xp === "undefined" || (typeof q.xp === "number" && q.xp >= 0 && q.xp <= 50)));
  if (!valid) {
    throw new HttpsError(
      "invalid-argument",
      "Some questions have invalid structure. Required: id (non-empty string), tier (string), type (valid block type), stem (non-empty string), options (array, 2+), correctAnswer (non-empty), xp (0-50 if provided).",
    );
  }

  const db = admin.firestore();
  await db.doc(`question_banks/${assignmentId}`).set({
    assignmentId,
    title: title || "",
    classType: classType || "",
    questions,
    questionCount: questions.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy: verifyAuth(request.auth),
  });

  logger.info(
    `Question bank uploaded: ${questions.length} questions for ${assignmentId}`,
  );
  return { questionCount: questions.length };
});

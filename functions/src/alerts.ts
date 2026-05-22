import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { generateCorrelationId, logWithCorrelation } from "./core";

/**
 * Firestore trigger: when an assessment submission is created with status 'FLAGGED',
 * create a notification for all teachers (ADMIN users) of the relevant class.
 */
export const onFlaggedAssessment = onDocumentCreated(
  { document: "submissions/{submissionId}", memory: "128MiB" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    if (!data.isAssessment || data.status !== "FLAGGED") return;

    const correlationId = generateCorrelationId();
    const db = admin.firestore();

    const studentName = data.userName || "A student";
    const assignmentTitle = data.assignmentTitle || "Untitled assessment";
    const classType = data.classType || "";
    const userId = data.userId as string;

    // Find teachers for this class
    // Teachers may have classType directly or in enrolledClasses
    const teacherQuery = classType
      ? db.collection("users")
          .where("role", "==", "ADMIN")
          .where("enrolledClasses", "array-contains", classType)
      : db.collection("users").where("role", "==", "ADMIN");

    let teacherSnap = await teacherQuery.get();
    if (teacherSnap.empty && classType) {
      // Fallback: notify all admins if no teacher matches this class
      teacherSnap = await db.collection("users").where("role", "==", "ADMIN").get();
    }
    if (teacherSnap.empty) {
      logWithCorrelation("info", "No teachers found for flagged assessment", correlationId, { classType, submissionId: snap.id });
      return;
    }

    const timestamp = new Date().toISOString();
    const writes = teacherSnap.docs.map((teacherDoc) => {
      const teacherId = teacherDoc.id;
      return db.collection("notifications").add({
        type: "AI_FLAGGED",
        userId: teacherId,
        title: "Assessment Integrity Alert",
        message: `${studentName}'s submission for "${assignmentTitle}" was flagged for potential integrity issues.`,
        timestamp,
        isRead: false,
        meta: {
          submissionId: snap.id,
          studentId: userId,
          studentName,
          assignmentId: data.assignmentId,
          assignmentTitle,
          classType,
          status: data.status,
          plausibilityScore: data.metrics?.plausibilityScore ?? null,
          flagReason: data.feedback || "Automated integrity flag",
        },
      });
    });

    await Promise.allSettled(writes);
    logWithCorrelation("info", "Flagged assessment notifications sent", correlationId, {
      submissionId: snap.id,
      teacherCount: writes.length,
      studentName,
      assignmentTitle,
    });
  }
);

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { verifyAdmin, generateCorrelationId, logWithCorrelation } from "./core";

/**
 * Helper: queue an email by writing to the "mail" collection.
 * The Firebase Trigger Email extension picks these up automatically.
 */
export async function queueEmail(to: string, subject: string, html: string): Promise<void> {
  const db = admin.firestore();
  await db.collection("mail").add({
    to,
    message: { subject, html },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Notification: New Assignment Published
 * Triggers when a new assignment document is created in the "assignments" collection.
 * Emails all enrolled students in the matching class.
 */
export const onNewAssignment = onDocumentCreated(
  { document: "assignments/{assignmentId}", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    // Only notify for ACTIVE assignments (not DRAFTs or ARCHIVED)
    if (data.status !== "ACTIVE") return;

    // If scheduled for the future, skip — the scheduler will handle it
    if (data.scheduledAt && new Date(data.scheduledAt) > new Date()) return;

    const classType = data.classType as string;
    const title = data.title as string;
    const dueDate = data.dueDate ? new Date(data.dueDate as string).toLocaleDateString() : null;

    const correlationId = generateCorrelationId();
    logWithCorrelation('info', 'New assignment published', correlationId, { title, classType });

    // Find all students enrolled in this class (paginated)
    const db = admin.firestore();
    let emailsSent = 0;
    let lastDoc: any = null;

    while (true) {
      let query = db.collection("users")
        .where("role", "==", "STUDENT")
        .where("isWhitelisted", "==", true)
        .orderBy("__name__")
        .limit(499);
      if (lastDoc) query = query.startAfter(lastDoc);
      const studentsSnap = await query.get();
      if (studentsSnap.empty) break;
      lastDoc = studentsSnap.docs[studentsSnap.docs.length - 1];

      const emailPromises: Promise<void>[] = [];

      studentsSnap.docs.forEach((doc) => {
        const student = doc.data();
        const enrolled: string[] = student.enrolledClasses || [];
        if (!enrolled.includes(classType)) return;

        // Section filtering
        if (data.targetSections?.length) {
          const studentSection = student.classSections?.[classType] || student.section || "";
          if (!data.targetSections.includes(studentSection)) return;
        }

        const email = student.email as string;
        if (!email) return;

        emailsSent++;
        emailPromises.push(
          queueEmail(
            email,
            `New Assignment: ${title}`,
            `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1a0a2e; padding: 24px; border-radius: 12px;">
                <h2 style="color: #a78bfa; margin: 0 0 8px;">📋 New Assignment Posted</h2>
                <h3 style="color: #ffffff; margin: 0 0 16px;">${title}</h3>
                <p style="color: #9ca3af; margin: 0 0 8px;">Class: <strong style="color: #e5e7eb;">${classType}</strong></p>
                ${dueDate ? `<p style="color: #9ca3af; margin: 0 0 8px;">Due: <strong style="color: #fbbf24;">${dueDate}</strong></p>` : ""}
                ${data.description ? `<p style="color: #9ca3af; margin: 16px 0 0;">${data.description}</p>` : ""}
                <hr style="border: 1px solid #374151; margin: 16px 0;" />
                <p style="color: #6b7280; font-size: 12px;">Porter's Portal — ${classType}</p>
              </div>
            </div>
            `,
          ),
        );

        // Batch emails in groups of 100
        if (emailPromises.length >= 100) {
          // Intentionally not awaited inside forEach — handled below
        }
      });

      // Send emails in batches of 100
      for (let i = 0; i < emailPromises.length; i += 100) {
        await Promise.all(emailPromises.slice(i, i + 100));
      }

      if (studentsSnap.size < 499) break;
    }

    logWithCorrelation('info', 'Queued emails for new assignment', correlationId, { emailsSent, title, classType });
  },
);
/**
 * Notification: Grade Posted
 * Triggers when a submission document is updated and the score changes.
 * Emails the student that their work has been graded.
 */
export const onGradePosted = onDocumentUpdated(
  { document: "submissions/{submissionId}", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Fast-path guard: if score didn't change, this update can't be a grading event.
    // Protects against invocation cascades from bulk updates (e.g. field backfills).
    if (before.score === after.score) return;

    // Only fire when score changes from 0 to a positive value (initial grading)
    const oldScore = before.score as number || 0;
    const newScore = after.score as number || 0;
    if (oldScore > 0 || newScore <= 0) return;

    const userId = after.userId as string;
    const assignmentTitle = after.assignmentTitle as string;

    const correlationId = generateCorrelationId();
    logWithCorrelation('info', 'Grade posted', correlationId, { userId, assignmentTitle, newScore });

    // Look up student email
    const db = admin.firestore();
    const userDoc = await db.doc(`users/${userId}`).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data()!;
    const email = userData.email as string;
    if (!email) return;

    const studentName = userData.name as string || "Student";

    await queueEmail(
      email,
      `Grade Posted: ${assignmentTitle}`,
      `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a0a2e; padding: 24px; border-radius: 12px;">
          <h2 style="color: #a78bfa; margin: 0 0 8px;">📊 Grade Posted</h2>
          <p style="color: #e5e7eb; margin: 0 0 16px;">Hi ${studentName},</p>
          <h3 style="color: #ffffff; margin: 0 0 8px;">${assignmentTitle}</h3>
          <div style="background: #0f0720; border: 1px solid #374151; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
            <span style="font-size: 36px; font-weight: bold; color: ${newScore >= 80 ? "#22c55e" : newScore >= 60 ? "#eab308" : "#ef4444"};">${newScore}%</span>
          </div>
          <p style="color: #9ca3af; margin: 0;">Log in to Porter's Portal to view detailed feedback.</p>
          <hr style="border: 1px solid #374151; margin: 16px 0;" />
          <p style="color: #6b7280; font-size: 12px;">Porter's Portal</p>
        </div>
      </div>
      `,
    );

    logWithCorrelation('info', 'Queued grade notification email', correlationId, { email, userId, assignmentTitle, newScore });
  },
);
/**
 * Helper: detect Google API auth errors (expired or revoked token).
 */
function isGoogleAuthError(err: unknown): boolean {
  const code = (err as { code?: number }).code;
  const status = (err as { response?: { status?: number } }).response?.status;
  return code === 401 || code === 403 || status === 401 || status === 403;
}

/** Server-side item catalog — must mirror client FLUX_SHOP_ITEMS */
async function createClassroomClient(accessToken: string, correlationId?: string) {
  try {
    const { google } = await import("googleapis");
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.classroom({ version: "v1", auth: oauth2Client });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'Failed to load googleapis module', correlationId || generateCorrelationId(), { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Google Classroom client initialization failed: ${msg}`);
  }
}
/**
 * Helper: sleep for exponential backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * classroomListCourses — List active courses for the authenticated teacher.
 */
export const classroomListCourses = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  await verifyAdmin(request.auth);
  const correlationId = generateCorrelationId();
  const { accessToken } = request.data;
  if (!accessToken || typeof accessToken !== "string") {
    throw new HttpsError("invalid-argument", "Missing accessToken.");
  }

  let classroom;
  try {
    classroom = await createClassroomClient(accessToken, correlationId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'classroomListCourses client error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }
  try {
    const courses: { id: string | null | undefined; name: string | null | undefined; section: string | null | undefined; descriptionHeading: string | null | undefined; ownerId: string | null | undefined; courseState: string | null | undefined }[] = [];
    let pageToken: string | undefined;
    do {
      const res = await classroom.courses.list({
        courseStates: ["ACTIVE"],
        pageToken,
      });
      for (const c of res.data.courses || []) {
        courses.push({ id: c.id, name: c.name, section: c.section, descriptionHeading: c.descriptionHeading, ownerId: c.ownerId, courseState: c.courseState });
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    return { courses };
  } catch (err: unknown) {
    if (isGoogleAuthError(err)) {
      const msg = err instanceof Error ? err.message : "Google authentication failed.";
      logWithCorrelation('error', 'classroomListCourses auth error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
      throw new HttpsError("unauthenticated", `Google Classroom token expired or invalid. Please re-authenticate. (${msg})`);
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'classroomListCourses error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }
});
/**
 * classroomListCourseWork — List course work for a given course.
 */
export const classroomListCourseWork = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  await verifyAdmin(request.auth);
  const correlationId = generateCorrelationId();
  const { accessToken, courseId } = request.data;
  if (!accessToken || typeof accessToken !== "string") {
    throw new HttpsError("invalid-argument", "Missing accessToken.");
  }
  if (!courseId || typeof courseId !== "string") {
    throw new HttpsError("invalid-argument", "Missing courseId.");
  }

  let classroom;
  try {
    classroom = await createClassroomClient(accessToken, correlationId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'classroomListCourseWork client error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }
  try {
    const courseWork: { id: string | null | undefined; title: string | null | undefined; maxPoints: number | null | undefined; state: string | null | undefined }[] = [];
    let pageToken: string | undefined;
    do {
      const res = await classroom.courses.courseWork.list({
        courseId,
        orderBy: "updateTime desc",
        pageToken,
      });
      for (const cw of res.data.courseWork || []) {
        courseWork.push({ id: cw.id, title: cw.title, maxPoints: cw.maxPoints, state: cw.state });
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    return { courseWork };
  } catch (err: unknown) {
    if (isGoogleAuthError(err)) {
      const msg = err instanceof Error ? err.message : "Google authentication failed.";
      logWithCorrelation('error', 'classroomListCourseWork auth error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
      throw new HttpsError("unauthenticated", `Google Classroom token expired or invalid. Please re-authenticate. (${msg})`);
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'classroomListCourseWork error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }
});
/**
 * classroomCreateCourseWork — Create a new assignment in Google Classroom.
 */
export const classroomCreateCourseWork = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  await verifyAdmin(request.auth);
  const correlationId = generateCorrelationId();
  const { accessToken, courseId, title, maxPoints } = request.data;
  if (!accessToken || typeof accessToken !== "string") {
    throw new HttpsError("invalid-argument", "Missing accessToken.");
  }
  if (!courseId || typeof courseId !== "string") {
    throw new HttpsError("invalid-argument", "Missing courseId.");
  }
  if (!title || typeof title !== "string") {
    throw new HttpsError("invalid-argument", "Missing title.");
  }
  if (maxPoints == null || typeof maxPoints !== "number" || maxPoints < 0) {
    throw new HttpsError("invalid-argument", "Invalid maxPoints.");
  }

  let classroom;
  try {
    classroom = await createClassroomClient(accessToken, correlationId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'classroomCreateCourseWork client error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }
  try {
    const res = await classroom.courses.courseWork.create({
      courseId,
      requestBody: {
        title,
        maxPoints,
        workType: "ASSIGNMENT",
        state: "PUBLISHED",
      },
    });
    return {
      courseWork: {
        id: res.data.id,
        title: res.data.title,
        maxPoints: res.data.maxPoints,
      },
    };
  } catch (err: unknown) {
    if (isGoogleAuthError(err)) {
      const msg = err instanceof Error ? err.message : "Google authentication failed.";
      logWithCorrelation('error', 'classroomCreateCourseWork auth error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
      throw new HttpsError("unauthenticated", `Google Classroom token expired or invalid. Please re-authenticate. (${msg})`);
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'classroomCreateCourseWork error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }
});
/**
 * classroomPushGrades — Push Portal grades to Google Classroom for a linked assignment.
 *
 * Reads submissions from Firestore, resolves best scores per student,
 * matches students by email to Classroom roster, and patches grades.
 * Includes exponential backoff for rate limiting (429 errors).
 */
export const classroomPushGrades = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  await verifyAdmin(request.auth);
  const correlationId = generateCorrelationId();
  const { accessToken, assignmentId } = request.data;
  if (!accessToken || typeof accessToken !== "string") {
    throw new HttpsError("invalid-argument", "Missing accessToken.");
  }
  if (!assignmentId || typeof assignmentId !== "string") {
    throw new HttpsError("invalid-argument", "Missing assignmentId.");
  }

  let classroom;
  try {
    classroom = await createClassroomClient(accessToken, correlationId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'classroomPushGrades client error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }

  try {
  const db = admin.firestore();

  // 1. Read the assignment doc and resolve link entries (new array or legacy single)
  const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnap.exists) {
    throw new HttpsError("not-found", "Assignment not found.");
  }
  const assignment = assignmentSnap.data()!;

  // Support both classroomLinks (array) and legacy classroomLink (single)
  interface LinkEntry {
    courseId: string;
    courseWorkId: string;
    maxPoints: number;
    portalSection?: string;
  }
  let linkEntries: LinkEntry[];
  if (assignment.classroomLinks && Array.isArray(assignment.classroomLinks) && assignment.classroomLinks.length > 0) {
    linkEntries = assignment.classroomLinks as LinkEntry[];
  } else if (Array.isArray(assignment.classroomLinks) && assignment.classroomLinks.length === 0) {
    // Empty array — links were cleared; nothing to push
    return { pushed: 0, skipped: 0, errors: [] };
  } else if (assignment.classroomLink?.courseId && assignment.classroomLink?.courseWorkId) {
    linkEntries = [{ ...assignment.classroomLink, portalSection: undefined }] as LinkEntry[];
  } else {
    throw new HttpsError("failed-precondition", "Assignment is not linked to Google Classroom.");
  }

  // Validate course ownership
  const teacherId = request.auth?.uid;
  if (!teacherId) {
    throw new HttpsError("unauthenticated", "Teacher authentication required.");
  }
  const teacherDoc = await db.doc(`users/${teacherId}`).get();
  if (!teacherDoc.exists) {
    throw new HttpsError("permission-denied", "Teacher record not found.");
  }
  const teacherData = teacherDoc.data()!;
  const ownedCourses: string[] = teacherData.ownedCourses || [];
  const teacherClasses: string[] = teacherData.teacherClasses || [];
  for (const entry of linkEntries) {
    const isOwner = ownedCourses.includes(entry.courseId) || teacherClasses.includes(entry.courseId);
    if (!isOwner) {
      throw new HttpsError("permission-denied", `You do not own course ${entry.courseId}.`);
    }
  }

  // 2. Read all submissions for this assignment (once, shared across all link entries)
  const subsSnap = await db.collection("submissions")
    .where("assignmentId", "==", assignmentId)
    .get();

  if (subsSnap.empty) {
    return { pushed: 0, skipped: 0, errors: [] };
  }

  // 3. For each student, find the best effective score (handles retakes)
  //    Also track which section was on the best-scoring submission.
  const bestScores: Record<string, number> = {}; // userId -> best percentage
  const bestSubmissionSection: Record<string, string | undefined> = {}; // userId -> userSection from best submission
  for (const doc of subsSnap.docs) {
    const sub = doc.data();
    const userId = sub.userId as string | undefined;
    if (!userId) continue;

    // Effective score: rubricGrade > assessmentScore > score > 0
    const effectivePercentage: number =
      sub.rubricGrade?.overallPercentage ??
      sub.assessmentScore?.percentage ??
      sub.score ??
      0;

    if (bestScores[userId] === undefined || effectivePercentage > bestScores[userId]) {
      bestScores[userId] = effectivePercentage;
      bestSubmissionSection[userId] = sub.userSection as string | undefined;
    }
  }

  // 4. Get emails and section info for all Portal students with submissions (single batch)
  const userIds = Object.keys(bestScores);
  if (userIds.length === 0) {
    return { pushed: 0, skipped: 0, errors: [] };
  }

  const assignmentClassType = (assignment.classType as string) || "";
  const emailMap: Record<string, string> = {}; // email -> userId
  const userProfileSectionMap: Record<string, string | undefined> = {}; // userId -> resolved section for this classType

  // Firestore 'in' queries support max 30 items; batch if needed
  for (let i = 0; i < userIds.length; i += 30) {
    const batchIds = userIds.slice(i, i + 30);
    const usersSnap = await db.collection("users")
      .where(admin.firestore.FieldPath.documentId(), "in", batchIds)
      .get();
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const email = userData.email as string | undefined;
      if (email) emailMap[email.toLowerCase()] = userDoc.id;

      // Resolve section for this classType (mirrors getUserSectionForClass from types.ts)
      const classSections = userData.classSections as Record<string, string> | undefined;
      const legacySection = userData.section as string | undefined;
      const userClassType = userData.classType as string | undefined;
      const enrolledClasses = userData.enrolledClasses as string[] | undefined;
      userProfileSectionMap[userDoc.id] =
        classSections?.[assignmentClassType] ??
        ((userClassType === assignmentClassType || enrolledClasses?.includes(assignmentClassType))
          ? legacySection
          : undefined);
    }
  }

  // 5. Push grades per link entry in parallel
  const linkResults = await Promise.allSettled(
    linkEntries.map(async (entry) => {
      const { courseId, courseWorkId } = entry;

      // Fetch live maxPoints for this entry
      let maxPoints: number;
      try {
        const cwRes = await classroom.courses.courseWork.get({ courseId, id: courseWorkId });
        maxPoints = cwRes.data.maxPoints ?? entry.maxPoints ?? 100;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        logWithCorrelation('error', 'Failed to fetch CourseWork from Classroom', correlationId, { courseId, courseWorkId, error: msg, stack: err instanceof Error ? err.stack : undefined });
        throw new Error(`Cannot read Classroom assignment (${courseId}/${courseWorkId}): ${msg}`);
      }

      // Filter bestScores to only students in this section (if portalSection is set)
      const filteredScores: Record<string, number> = {};
      if (entry.portalSection) {
        for (const [userId, score] of Object.entries(bestScores)) {
          // Check section from best submission first (captured at submit time), then user profile
          const section = bestSubmissionSection[userId] ?? userProfileSectionMap[userId];
          if (section === entry.portalSection) {
            filteredScores[userId] = score;
          }
        }
      } else {
        // Legacy (no section filter): push all students
        Object.assign(filteredScores, bestScores);
      }

      // Match Portal students to Classroom submissions and patch grades.
      // Uses per-student submission lookup by email (Classroom API accepts
      // email as userId). This bypasses roster/profile endpoints which may
      // return empty results due to Workspace admin directory restrictions.
      let entryPushed = 0;
      let entrySkipped = 0;
      const entryErrors: string[] = [];

      const allPortalEmails = Object.entries(emailMap).filter(([, uid]) => uid in filteredScores);
      logWithCorrelation('info', 'classroomPushGrades matching', correlationId, {
        portalSection: entry.portalSection ?? "all",
        portalEmailCount: allPortalEmails.length,
      });

      // Process in chunks of 100 to respect Google API limits
      const chunkSize = 100;
      for (let chunkIdx = 0; chunkIdx < allPortalEmails.length; chunkIdx += chunkSize) {
        const portalEmails = allPortalEmails.slice(chunkIdx, chunkIdx + chunkSize);

      for (const [email, userId] of portalEmails) {
        // Look up this student's submission directly by email
        let submissionId: string | undefined;
        try {
          const res = await classroom.courses.courseWork.studentSubmissions.list({
            courseId,
            courseWorkId,
            userId: email,
            pageSize: 1,
          });
          submissionId = res.data.studentSubmissions?.[0]?.id ?? undefined;
        } catch (err) {
          logWithCorrelation('warn', 'Exception swallowed', correlationId, { error: err instanceof Error ? err.message : String(err) });
        }

        if (!submissionId) {
          entrySkipped++;
          continue;
        }

        const percentage = filteredScores[userId];
        const assignedGrade = (percentage / 100) * maxPoints;

        // Retry with exponential backoff for rate limiting
        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await classroom.courses.courseWork.studentSubmissions.patch({
              courseId,
              courseWorkId,
              id: submissionId,
              updateMask: "assignedGrade,draftGrade",
              requestBody: { assignedGrade, draftGrade: assignedGrade },
            });
            // Return the submission so the grade is visible to the student
            await classroom.courses.courseWork.studentSubmissions.return({
              courseId,
              courseWorkId,
              id: submissionId,
            });
            entryPushed++;
            success = true;
            break;
          } catch (err: unknown) {
            const status = (err as { code?: number }).code;
            if (status === 429 && attempt < 2) {
              const delay = Math.pow(2, attempt) * 1000;
              logWithCorrelation('warn', 'Rate limited on grade push, retrying', correlationId, { email, attempt, courseId, delayMs: delay });
              await sleep(delay);
            } else {
              const msg = err instanceof Error ? err.message : "Unknown error";
              entryErrors.push(`${email}: ${msg}`);
              break;
            }
          }
        }
        if (!success && entryErrors[entryErrors.length - 1]?.startsWith(email) === false) {
          entryErrors.push(`${email}: Max retries exceeded`);
        }
      }

      // Small delay between chunks to avoid rate limits
      if (chunkIdx + chunkSize < allPortalEmails.length) {
        await sleep(1000);
      }
      }

      logWithCorrelation('info', 'classroomPushGrades entry complete', correlationId, {
        courseId,
        courseWorkId,
        portalSection: entry.portalSection ?? "all",
        pushed: entryPushed,
        skipped: entrySkipped,
        errorCount: entryErrors.length,
      });
      return { pushed: entryPushed, skipped: entrySkipped, errors: entryErrors };
    })
  );

  // Aggregate results across all link entries
  let pushed = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const result of linkResults) {
    if (result.status === "fulfilled") {
      pushed += result.value.pushed;
      skipped += result.value.skipped;
      errors.push(...result.value.errors);
    } else {
      errors.push((result.reason as Error)?.message ?? "Unknown error");
    }
  }

  // Write audit trail to Firestore
  const auditPromises: Promise<admin.firestore.DocumentReference>[] = [];
  for (let i = 0; i < linkResults.length; i++) {
    const entry = linkEntries[i];
    const result = linkResults[i];
    const pushedCount = result.status === "fulfilled" ? result.value.pushed : 0;
    const failedCount = result.status === "fulfilled" ? result.value.errors.length : 1;
    const entryErrors = result.status === "fulfilled"
      ? result.value.errors
      : [(result.reason as Error)?.message ?? "Unknown error"];

    auditPromises.push(
      db.collection("grade_push_logs").add({
        teacherId,
        courseId: entry.courseId,
        assignmentId,
        pushedCount,
        failedCount,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        errors: entryErrors,
      })
    );
  }
  await Promise.all(auditPromises);

  logWithCorrelation('info', 'classroomPushGrades complete', correlationId, { pushed, skipped, errorCount: errors.length });
  return { pushed, skipped, errors };
  } catch (err: unknown) {
    if (err instanceof HttpsError) throw err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    logWithCorrelation('error', 'classroomPushGrades unhandled error', correlationId, { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Grade push failed: ${msg}`);
  }
});

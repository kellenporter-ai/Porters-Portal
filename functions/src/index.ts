import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  getActiveXPMultiplier,
  verifyAdmin,
  verifyAuth,
  buildXPUpdates,
  calculateFeedbackServerSide,
  TelemetryThresholds,
  calculateServerStats,
  deriveCombatStats,
  calculateBossDamage,
  calculateServerGearScore,
} from "./core";
import { checkAndUnlockAchievements, writeAchievementNotifications } from "./achievements";
import { generateLoot } from "./gamification-items";
export * from "./gamification-items";
export * from "./engagement";

// ==========================================
// ==========================================
// ADMIN SETUP — Set Custom Claims
// ==========================================

// Call this ONCE via browser URL after deploy to bootstrap your admin account.
// Requires the X-Admin-Secret header to match the ADMIN_BOOTSTRAP_SECRET env var.
export const setAdminClaim = onRequest(async (req, res) => {
  try {
    // Authenticate the request with a secret token
    const secret = req.headers["x-admin-secret"];
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      res.status(500).send("FAILED: ADMIN_BOOTSTRAP_SECRET environment variable not set.");
      return;
    }
    if (secret !== expectedSecret) {
      res.status(403).send("FORBIDDEN: Invalid or missing X-Admin-Secret header.");
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      res.status(500).send("FAILED: ADMIN_EMAIL environment variable not set.");
      return;
    }
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    logger.info(`Admin claim set for ${adminEmail}`);
    res.status(200).send(`SUCCESS: Admin claim set for ${adminEmail}. Sign out and back in for it to take effect.`);
  } catch (error) {
    logger.error("Failed to set admin claim", error);
    res.status(500).send("FAILED: An internal error occurred.");
  }
});

// ==========================================
// SCHEDULED FUNCTIONS
// ==========================================

// Weekly reset — Cleans up evidence locker uploads (images in Storage + Firestore docs)
// to keep storage costs down. NO other data is touched — submissions, assignments, etc.
// all persist indefinitely.
export const sundayReset = onSchedule(
  { schedule: "59 23 * * 0", timeZone: "America/New_York" },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    logger.info("Starting weekly evidence cleanup...");

    // 1. Delete uploaded images from Storage + Firestore docs in paginated batches
    let storageDeleted = 0;
    let count = 0;
    let lastDoc: any = null;

    while (true) {
      let query = db.collection("evidence").limit(499);
      if (lastDoc) query = query.startAfter(lastDoc);
      const evidenceSnap = await query.get();
      if (evidenceSnap.empty) break;
      lastDoc = evidenceSnap.docs[evidenceSnap.docs.length - 1];

      // Delete images from Storage
      for (const docSnap of evidenceSnap.docs) {
        const data = docSnap.data();
        if (data.imageUrl) {
          try {
            const urlPath = decodeURIComponent(new URL(data.imageUrl).pathname);
            const match = urlPath.match(/\/o\/(.+)/);
            if (match) {
              await bucket.file(match[1]).delete().catch(() => {});
              storageDeleted++;
            }
          } catch {
            // File may already be deleted — not critical
          }
        }
      }

      // Batch delete Firestore docs
      const chunk = db.batch();
      evidenceSnap.docs.forEach((d) => chunk.delete(d.ref));
      await chunk.commit();
      count += evidenceSnap.size;
      if (evidenceSnap.size < 499) break;
    }

    logger.info(`Deleted ${storageDeleted} evidence images from Storage.`);
    logger.info(`Deleted ${count} evidence documents from Firestore.`);
  }
);

// ==========================================
// EARLY WARNING SYSTEM — Predictive Analytics
// ==========================================

/**
 * dailyAnalysis — Runs every day at 6 AM EST.
 * Computes an Engagement Score (ES) per student, compares against class
 * mean/std-dev, and writes alerts for at-risk students.
 *
 * ES = (timeOnTask weight 0.4) + (submissionCount weight 0.3) + (resourceClicks weight 0.3)
 * All components are normalized to 0-100 before weighting.
 */
export const dailyAnalysis = onSchedule(
  { schedule: "0 6 * * *", timeZone: "America/New_York" },
  async () => {
    const db = admin.firestore();
    const now = new Date();

    // Analysis window: last 7 days of submissions
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 7);
    const windowStartISO = windowStart.toISOString();

    logger.info(`dailyAnalysis: Analyzing submissions since ${windowStartISO}`);

    // 1. Fetch all students (paginated)
    const allUserDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let lastUserDoc: any = null;
    while (true) {
      let uQuery = db.collection("users")
        .where("role", "==", "STUDENT").limit(499);
      if (lastUserDoc) uQuery = uQuery.startAfter(lastUserDoc);
      const uSnap = await uQuery.get();
      if (uSnap.empty) break;
      lastUserDoc = uSnap.docs[uSnap.docs.length - 1];
      allUserDocs.push(...uSnap.docs);
      if (uSnap.size < 499) break;
    }
    if (allUserDocs.length === 0) {
      logger.info("dailyAnalysis: No students found. Skipping.");
      return;
    }
    const usersSnap = { docs: allUserDocs, empty: false };

    // 2. Fetch recent submissions (paginated)
    const allSubDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let lastSubDoc: any = null;
    while (true) {
      let sQuery = db.collection("submissions")
        .where("submittedAt", ">=", windowStartISO).limit(499);
      if (lastSubDoc) sQuery = sQuery.startAfter(lastSubDoc);
      const sSnap = await sQuery.get();
      if (sSnap.empty) break;
      lastSubDoc = sSnap.docs[sSnap.docs.length - 1];
      allSubDocs.push(...sSnap.docs);
      if (sSnap.size < 499) break;
    }
    const submissionsSnap = { docs: allSubDocs };

    // Build per-student metrics
    const studentMetrics: Map<string, {
      totalTime: number;       // seconds of engagement
      submissionCount: number; // number of submissions
      totalClicks: number;     // total click count
      totalPastes: number;     // total paste count
      totalKeystrokes: number; // total keystroke count
      totalXP: number;         // XP earned in window
      activityDays: Set<string>; // distinct YYYY-MM-DD dates with submissions
      classTypes: Set<string>;
    }> = new Map();

    // Initialize all students with zero metrics
    usersSnap.docs.forEach((doc) => {
      const data = doc.data();
      const classes = data.enrolledClasses || (data.classType ? [data.classType] : []);
      studentMetrics.set(doc.id, {
        totalTime: 0,
        submissionCount: 0,
        totalClicks: 0,
        totalPastes: 0,
        totalKeystrokes: 0,
        totalXP: 0,
        activityDays: new Set(),
        classTypes: new Set(classes),
      });
    });

    // Aggregate submission data
    submissionsSnap.docs.forEach((doc) => {
      const sub = doc.data();
      const existing = studentMetrics.get(sub.userId);
      if (!existing) return; // Not a current student
      existing.totalTime += Number(sub.metrics?.engagementTime || 0);
      existing.submissionCount += 1;
      existing.totalClicks += Number(sub.metrics?.clickCount || 0);
      existing.totalPastes += Number(sub.metrics?.pasteCount || 0);
      existing.totalKeystrokes += Number(sub.metrics?.keystrokes || 0);
      existing.totalXP += Number(sub.score || 0);
      // Track distinct activity days
      if (sub.submittedAt) {
        existing.activityDays.add(String(sub.submittedAt).split("T")[0]);
      }
    });

    // 3. Compute Engagement Scores per class
    // Group students by class for relative comparison
    const classBuckets: Map<string, { studentId: string; name: string; es: number; metrics: typeof studentMetrics extends Map<string, infer V> ? V : never }[]> = new Map();

    usersSnap.docs.forEach((doc) => {
      const data = doc.data();
      const m = studentMetrics.get(doc.id);
      if (!m) return;

      // Normalize each component to 0-100 range
      // Time: 0 = 0, 3600s (1hr) = 100 (capped)
      const timeNorm = Math.min(100, (m.totalTime / 3600) * 100);
      // Submissions: 0 = 0, 10 submissions = 100 (capped)
      const subNorm = Math.min(100, (m.submissionCount / 10) * 100);
      // Clicks: 0 = 0, 200 clicks = 100 (capped)
      const clickNorm = Math.min(100, (m.totalClicks / 200) * 100);

      const es = (timeNorm * 0.4) + (subNorm * 0.3) + (clickNorm * 0.3);

      const classes = data.enrolledClasses || (data.classType ? [data.classType] : ["Uncategorized"]);
      for (const cls of classes) {
        if (!classBuckets.has(cls)) classBuckets.set(cls, []);
        classBuckets.get(cls)!.push({
          studentId: doc.id,
          name: data.name || "Unknown",
          es,
          metrics: m,
        });
      }
    });

    // 4. For each class, compute mean/stddev and flag outliers
    const alerts: {
      studentId: string;
      studentName: string;
      classType: string;
      riskLevel: string;
      reason: string;
      message: string;
      engagementScore: number;
      classMean: number;
      classStdDev: number;
      bucket?: string;
    }[] = [];

    // Bucket profiles for ALL students (not just at-risk)
    const bucketProfiles: {
      studentId: string;
      studentName: string;
      classType: string;
      bucket: string;
      engagementScore: number;
      metrics: {
        totalTime: number;
        submissionCount: number;
        totalClicks: number;
        totalPastes: number;
        totalKeystrokes: number;
        avgPasteRatio: number;
        activityDays: number;
      };
      recommendation: {
        categories: string[];
        action: string;
        studentTip: string;
      };
    }[] = [];

    classBuckets.forEach((students, classType) => {
      if (students.length < 3) return; // Need enough students for meaningful stats

      const scores = students.map((s) => s.es);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      // Skip if everyone is at zero (e.g. summer break)
      if (mean < 1) return;

      for (const student of students) {
        const zScore = stdDev > 0 ? (student.es - mean) / stdDev : 0;

        // CRITICAL: ES is more than 2 std devs below mean AND below 10 absolute
        if (zScore < -2 && student.es < 10) {
          alerts.push({
            studentId: student.studentId,
            studentName: student.name,
            classType,
            riskLevel: "CRITICAL",
            reason: "LOW_ENGAGEMENT",
            message: `Engagement score (${student.es.toFixed(1)}) is critically below class average (${mean.toFixed(1)}). No meaningful activity detected this week.`,
            engagementScore: Math.round(student.es * 10) / 10,
            classMean: Math.round(mean * 10) / 10,
            classStdDev: Math.round(stdDev * 10) / 10,
          });
        // HIGH: ES is 1.5+ std devs below mean
        } else if (zScore < -1.5) {
          alerts.push({
            studentId: student.studentId,
            studentName: student.name,
            classType,
            riskLevel: "HIGH",
            reason: "LOW_ENGAGEMENT",
            message: `Engagement score (${student.es.toFixed(1)}) is significantly below class average (${mean.toFixed(1)}). Student may need intervention.`,
            engagementScore: Math.round(student.es * 10) / 10,
            classMean: Math.round(mean * 10) / 10,
            classStdDev: Math.round(stdDev * 10) / 10,
          });
        // MODERATE: ES is 1+ std devs below mean
        } else if (zScore < -1) {
          alerts.push({
            studentId: student.studentId,
            studentName: student.name,
            classType,
            riskLevel: "MODERATE",
            reason: "LOW_ENGAGEMENT",
            message: `Engagement score (${student.es.toFixed(1)}) is below class average (${mean.toFixed(1)}). Monitor for declining trend.`,
            engagementScore: Math.round(student.es * 10) / 10,
            classMean: Math.round(mean * 10) / 10,
            classStdDev: Math.round(stdDev * 10) / 10,
          });
        }

        // STRUGGLING: High effort (lots of time/keystrokes) but low XP yield
        if (student.metrics.totalTime > 1800 && student.metrics.totalXP < 50 && student.metrics.submissionCount >= 2) {
          alerts.push({
            studentId: student.studentId,
            studentName: student.name,
            classType,
            riskLevel: "MODERATE",
            reason: "STRUGGLING",
            message: `High engagement time (${Math.round(student.metrics.totalTime / 60)}m) but low XP earned (${student.metrics.totalXP}). Student may be struggling with material.`,
            engagementScore: Math.round(student.es * 10) / 10,
            classMean: Math.round(mean * 10) / 10,
            classStdDev: Math.round(stdDev * 10) / 10,
          });
        }

        // NO ACTIVITY: Zero submissions in the analysis window
        if (student.metrics.submissionCount === 0) {
          alerts.push({
            studentId: student.studentId,
            studentName: student.name,
            classType,
            riskLevel: "HIGH",
            reason: "NO_ACTIVITY",
            message: "No submissions recorded in the past 7 days. Student may be disengaged.",
            engagementScore: 0,
            classMean: Math.round(mean * 10) / 10,
            classStdDev: Math.round(stdDev * 10) / 10,
          });
        }

        // HIGH PASTE RATE: Consistently high paste counts
        if (student.metrics.totalPastes > 15 && student.metrics.submissionCount >= 3) {
          alerts.push({
            studentId: student.studentId,
            studentName: student.name,
            classType,
            riskLevel: "MODERATE",
            reason: "HIGH_PASTE_RATE",
            message: `High paste frequency (${student.metrics.totalPastes} pastes across ${student.metrics.submissionCount} submissions). May indicate copy-paste behavior.`,
            engagementScore: Math.round(student.es * 10) / 10,
            classMean: Math.round(mean * 10) / 10,
            classStdDev: Math.round(stdDev * 10) / 10,
          });
        }

        // ── TELEMETRY BUCKET CLASSIFICATION ──
        const m = student.metrics;
        const pasteRatio = (m.totalKeystrokes + m.totalPastes) > 0
          ? m.totalPastes / (m.totalKeystrokes + m.totalPastes) : 0;
        const days = m.activityDays.size;

        let bucket = "ON_TRACK";
        if (m.submissionCount === 0 && m.totalTime < 60) {
          bucket = "INACTIVE";
        } else if (pasteRatio > 0.4 && m.submissionCount >= 2 && m.totalPastes > 8) {
          bucket = "COPYING";
        } else if (m.totalTime > 1800 && m.submissionCount >= 2 && m.totalXP < 50) {
          bucket = "STRUGGLING";
        } else if (zScore < -0.5 && days <= 2 && m.submissionCount >= 1 && m.submissionCount <= 3) {
          bucket = "DISENGAGING";
        } else if (m.totalTime > 1800 && days <= 2 && m.submissionCount >= 3) {
          bucket = "SPRINTING";
        } else if (zScore < -0.5 && zScore >= -1.5) {
          bucket = "COASTING";
        } else if (zScore > 0.75 && m.submissionCount >= 4 && pasteRatio < 0.15 && days >= 3) {
          bucket = "THRIVING";
        }

        // Recommendation engine (server-side mirror of client getBucketRecommendation)
        const recMap: Record<string, { categories: string[]; action: string; studentTip: string }> = {
          THRIVING: { categories: ["Simulation", "Supplemental", "Article"], action: "Challenge with advanced or supplemental material. Consider peer-tutoring role.", studentTip: "You're crushing it! Try the simulations and supplemental resources to push further." },
          ON_TRACK: { categories: ["Practice Set", "Textbook", "Video Lesson"], action: "Continue current approach. Provide enrichment if interest is shown.", studentTip: "Solid work — keep the momentum going with practice sets and readings." },
          COASTING: { categories: ["Practice Set", "Simulation", "Video Lesson"], action: "Increase engagement with interactive resources. Check in on motivation.", studentTip: "Try a simulation or practice set to boost your skills — small steps add up!" },
          SPRINTING: { categories: ["Textbook", "Video Lesson", "Practice Set"], action: "Encourage consistent daily engagement instead of cramming. Set micro-goals.", studentTip: "Spreading your study across the week helps retention — try a bit each day." },
          STRUGGLING: { categories: ["Video Lesson", "Lab Guide", "Practice Set"], action: "Offer direct support. Recommend foundational resources and check understanding.", studentTip: "Your effort shows! Try video lessons for a fresh perspective on tricky topics." },
          DISENGAGING: { categories: ["Video Lesson", "Simulation", "Article"], action: "Reach out personally. Low-friction resources to re-establish habit.", studentTip: "We miss seeing you active — a quick video or sim is a great way to jump back in." },
          INACTIVE: { categories: ["Video Lesson", "Article"], action: "Immediate outreach required. Check for external factors. Lowest-barrier resources.", studentTip: "Start small — even watching one video lesson counts. We're here to help!" },
          COPYING: { categories: ["Practice Set", "Textbook", "Lab Guide"], action: "Discuss academic integrity. Redirect to original-work resources.", studentTip: "Working through problems yourself builds the strongest understanding — give it a try!" },
        };

        bucketProfiles.push({
          studentId: student.studentId,
          studentName: student.name,
          classType,
          bucket,
          engagementScore: Math.round(student.es * 10) / 10,
          metrics: {
            totalTime: m.totalTime,
            submissionCount: m.submissionCount,
            totalClicks: m.totalClicks,
            totalPastes: m.totalPastes,
            totalKeystrokes: m.totalKeystrokes,
            avgPasteRatio: Math.round(pasteRatio * 100) / 100,
            activityDays: days,
          },
          recommendation: recMap[bucket] || recMap.ON_TRACK,
        });
      }
    });

    // 5. Deduplicate alerts: keep highest severity per student+class
    //    Also enrich each alert with the student's bucket
    const bucketLookup = new Map<string, string>();
    for (const bp of bucketProfiles) {
      bucketLookup.set(`${bp.studentId}_${bp.classType}`, bp.bucket);
    }

    const deduped = new Map<string, typeof alerts[0]>();
    const severityOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
    for (const alert of alerts) {
      const key = `${alert.studentId}_${alert.classType}`;
      alert.bucket = bucketLookup.get(key) || "ON_TRACK";
      const existing = deduped.get(key);
      if (!existing || (severityOrder[alert.riskLevel] || 0) > (severityOrder[existing.riskLevel] || 0)) {
        deduped.set(key, alert);
      }
    }

    // 6. Write bucket profiles to Firestore (for ALL students, not just at-risk)
    const timestamp = new Date().toISOString();

    // Clear old bucket profiles and write fresh ones
    const oldBuckets = await db.collection("student_buckets").get();
    let batch = db.batch();
    let count = 0;
    for (const d of oldBuckets.docs) {
      batch.delete(d.ref);
      count++;
      if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (count % 499 !== 0) await batch.commit();

    batch = db.batch();
    count = 0;
    for (const profile of bucketProfiles) {
      const ref = db.collection("student_buckets").doc();
      batch.set(ref, { ...profile, createdAt: timestamp });
      count++;
      if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (count % 499 !== 0) await batch.commit();

    logger.info(`dailyAnalysis: Wrote ${bucketProfiles.length} bucket profiles.`);

    // 7. Write alerts to Firestore (batch for efficiency)
    const finalAlerts = Array.from(deduped.values());
    if (finalAlerts.length === 0) {
      logger.info("dailyAnalysis: No at-risk students detected. Bucket profiles written.");
      return;
    }

    // Clear old undismissed alerts before writing new ones
    const oldAlerts = await db.collection("student_alerts")
      .where("isDismissed", "==", false).get();
    batch = db.batch();
    count = 0;
    for (const d of oldAlerts.docs) {
      batch.delete(d.ref);
      count++;
      if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (count % 499 !== 0) await batch.commit();

    // Write new alerts (now enriched with bucket field)
    batch = db.batch();
    count = 0;
    for (const alert of finalAlerts) {
      const ref = db.collection("student_alerts").doc();
      batch.set(ref, {
        ...alert,
        createdAt: timestamp,
        isDismissed: false,
      });
      count++;
      if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (count % 499 !== 0) await batch.commit();

    logger.info(`dailyAnalysis: Generated ${finalAlerts.length} alerts (${Array.from(deduped.values()).filter((a) => a.riskLevel === "CRITICAL").length} critical, ${Array.from(deduped.values()).filter((a) => a.riskLevel === "HIGH").length} high). ${bucketProfiles.length} bucket profiles stored.`);
  }
);

/**
 * dismissAlert — Teacher dismisses an EWS alert.
 */
export const dismissAlert = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { alertId } = request.data;
  if (!alertId) throw new HttpsError("invalid-argument", "Alert ID required.");

  const db = admin.firestore();
  const alertRef = db.doc(`student_alerts/${alertId}`);
  const snap = await alertRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Alert not found.");

  await alertRef.update({
    isDismissed: true,
    dismissedBy: request.auth?.uid || "unknown",
    dismissedAt: new Date().toISOString(),
  });

  return { success: true };
});

/**
 * dismissAlertsBatch — Teacher dismisses multiple EWS alerts in one call.
 */
export const dismissAlertsBatch = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { alertIds } = request.data;

  if (!Array.isArray(alertIds) || alertIds.length === 0) {
    throw new HttpsError("invalid-argument", "alertIds must be a non-empty array.");
  }
  if (alertIds.length > 100) {
    throw new HttpsError("invalid-argument", "alertIds may not exceed 100 items per call.");
  }

  const db = admin.firestore();
  const batch = db.batch();
  for (const alertId of alertIds) {
    const alertRef = db.doc(`student_alerts/${alertId}`);
    batch.set(alertRef, { isDismissed: true }, { merge: true });
  }
  await batch.commit();

  return { dismissed: alertIds.length };
});


// ==========================================
// UTILITY FUNCTIONS
// ==========================================

export const fixCors = onRequest(async (req, res) => {
  try {
    // Authenticate the request with a secret token
    const secret = req.headers["x-admin-secret"];
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      res.status(500).send("FAILED: ADMIN_BOOTSTRAP_SECRET environment variable not set.");
      return;
    }
    if (secret !== expectedSecret) {
      res.status(403).send("FORBIDDEN: Invalid or missing X-Admin-Secret header.");
      return;
    }

    const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://porters-portal.web.app";
    const bucket = admin.storage().bucket();
    await bucket.setCorsConfiguration([{
      origin: [allowedOrigin],
      method: ["GET", "HEAD", "OPTIONS"],
      maxAgeSeconds: 3600,
    }]);
    logger.info("CORS configuration updated for bucket");
    res.status(200).send("SUCCESS: Storage permissions fixed.");
  } catch (error) {
    logger.error("Failed to set CORS", error);
    res.status(500).send("FAILED: An internal error occurred.");
  }
});

// ==========================================
// SUBMIT ENGAGEMENT — Server-side XP calculation
// ==========================================
// Replaces client-side `minutes * 10` calculation.
// Validates metrics, caps XP, prevents rapid re-submissions.

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

      if (block.type === "MC" && resp?.selected === block.correctAnswer) {
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

  // Everything after token claim is wrapped in try/catch for compensating rollback
  try {

  // 3. Read assignment to get answer keys
  const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnap.exists) throw new HttpsError("not-found", "Assignment not found");
  const assignment = assignmentSnap.data()!;

  if (!assignment.isAssessment) throw new HttpsError("invalid-argument", "Not an assessment");

  // Validate student is enrolled in the class offering this assessment
  if (assignment.classType) {
    const studentSnap = await db.doc(`users/${uid}`).get();
    const studentData = studentSnap.data();
    const enrolledClasses: string[] = studentData?.enrolledClasses || [];
    const studentClassType = studentData?.classType;
    if (!enrolledClasses.includes(assignment.classType) && studentClassType !== assignment.classType) {
      throw new HttpsError("permission-denied", "Not enrolled in the class for this assessment.");
    }
  }

  // 3. Grade auto-gradable blocks
  const blocks = assignment.lessonBlocks || [];
  ({ correct, total, percentage, perBlock } = gradeAssessmentBlocks(blocks, responses));

  // 4. Determine attempt number
  const existingSubs = await db.collection("submissions")
    .where("userId", "==", uid)
    .where("assignmentId", "==", assignmentId)
    .where("isAssessment", "==", true)
    .get();
  const activeSubmissions = existingSubs.docs.filter(d => d.data().status !== "RETURNED");
  attemptNumber = activeSubmissions.length + 1;

  // 5. Calculate telemetry status
  let assessmentThresholds: Partial<TelemetryThresholds> = {};
  if (classType) {
    const configSnap = await db.collection("class_configs")
      .where("className", "==", classType).limit(1).get();
    if (!configSnap.empty) {
      assessmentThresholds = configSnap.docs[0].data().telemetryThresholds || {};
    }
  }
  // 5a. Server-side elapsed time validation
  // If we have a session token, use its server-recorded startedAt for elapsed time
  // (much more trustworthy than client-reported startTime).
  // Otherwise fall back to client-reported startTime.
  const serverNow = Date.now();
  const effectiveStartTime = sessionStartedAt || metrics.startTime || serverNow;
  const serverElapsedSec = Math.max(0, (serverNow - effectiveStartTime) / 1000);
  // Use the lesser of client-reported engagement and server-computed elapsed time.
  // This prevents students from fabricating high engagement times via direct API calls.
  const validatedEngagement = metrics.engagementTime > 0
    ? Math.min(metrics.engagementTime, serverElapsedSec + 5) // +5s grace for network latency
    : 0;

  // Count non-empty responses to assess plausibility
  const responseKeys = Object.keys(responses || {});
  const nonEmptyResponses = responseKeys.filter(key => {
    const r = responses[key];
    if (!r) return false;
    if (typeof r === 'string') return r.trim().length > 0;
    if (typeof r === 'object') {
      // Check for common response shapes: { selected, answer, placements, order, elements, steps, initial }
      const obj = r as Record<string, unknown>;
      return obj.selected != null || (typeof obj.answer === 'string' && obj.answer.trim().length > 0) ||
        (obj.placements && Object.keys(obj.placements as Record<string, unknown>).length > 0) ||
        (Array.isArray(obj.order) && obj.order.length > 0) ||
        (Array.isArray(obj.elements) && obj.elements.length > 0) || // DRAWING
        (Array.isArray(obj.steps) && obj.steps.length > 0) || // MATH_RESPONSE
        (Array.isArray(obj.initial)); // BAR_CHART
    }
    return true;
  });

  // 5b. Calculate word count from short-answer responses (moved BEFORE feedback calculation)
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

  // 5c. Calculate telemetry status (now with word metrics for cross-validation)
  let feedback = "Assignment submitted successfully.";
  ({ status, feedback } = calculateFeedbackServerSide({
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

  if (status === "FLAGGED") {
    logger.warn(`submitAssessment FLAGGED: uid=${uid}, assignment=${assignmentId}, ` +
      `clientEngagement=${metrics.engagementTime}s, serverElapsed=${Math.round(serverElapsedSec)}s, ` +
      `validatedEngagement=${Math.round(validatedEngagement)}s, keystrokes=${metrics.keystrokes}, ` +
      `pastes=${metrics.pasteCount}, responses=${nonEmptyResponses.length}, feedback="${feedback}"`);
  }

  // 5d. Look up student's section for this class
  let userSection: string | undefined;
  if (classType) {
    const userSnap = await db.doc(`users/${uid}`).get();
    if (userSnap.exists) {
      const userData = userSnap.data()!;
      userSection = userData.classSections?.[classType]
        ?? ((userData.classType === classType || (userData.enrolledClasses || []).includes(classType)) ? userData.section : undefined);
    }
  }

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
    status,
    feedback,
    score: percentage,
    isAssessment: true,
    attemptNumber,
    assessmentScore: { correct, total, percentage, perBlock },
    blockResponses: responses,
    privateComments: [],
    hasUnreadAdmin: true,
    hasUnreadStudent: false,
    classType: classType || "",
    ...(userSection ? { userSection } : {}),
    ...(sessionToken ? { sessionToken } : {}),
  };

  // Phase 2: Batch write — submission create + draft delete
  // Token already claimed in Phase 1, so no transaction needed here
  if (tokenRef) {
    const batch = db.batch();
    // Create submission
    const submissionRef = db.collection("submissions").doc();
    batch.set(submissionRef, assessmentSubmission);
    // Delete draft — prevents stale data on retakes
    const draftRef = db.doc(`lesson_block_responses/${uid}_${assignmentId}_blocks`);
    batch.delete(draftRef);
    await batch.commit();
  } else {
    // No session token path — should not reach here (thrown above), but safety fallback
    await db.collection("submissions").add(assessmentSubmission);
  }

  } catch (err) {
    // Compensating action: un-claim token so student can retry
    // Only runs if submission batch was NOT yet committed
    if (tokenRef) {
      try {
        await tokenRef.update({ used: false, usedAt: admin.firestore.FieldValue.delete() });
        logger.warn(`submitAssessment: token unclaimed after error for uid=${uid}`);
      } catch (rollbackErr) {
        logger.error(`submitAssessment: failed to unclaim token for uid=${uid}`, rollbackErr);
      }
    }
    throw err; // Re-throw the original error
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
  // 1. Verify admin
  await verifyAdmin(request.auth);

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

  // 7. Calculate attempt number (exclude RETURNED)
  const existingSubs = await db.collection("submissions")
    .where("userId", "==", userId)
    .where("assignmentId", "==", assignmentId)
    .where("isAssessment", "==", true)
    .get();
  const activeCount = existingSubs.docs.filter(d => d.data().status !== "RETURNED").length;
  const attemptNumber = activeCount + 1;

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
    attemptNumber,
    assessmentScore: { correct, total, percentage, perBlock },
    blockResponses: responses,
    privateComments: [],
    hasUnreadAdmin: true,
    hasUnreadStudent: false,
    classType: classType || "",
    submittedOnBehalfBy: request.auth!.uid,
    ...(userSection ? { userSection } : {}),
  };

  await db.runTransaction(async (t) => {
    // Re-read session inside transaction to prevent double-submit race
    if (sessionDoc) {
      const freshSession = await t.get(sessionDoc.ref);
      if (freshSession.exists && !freshSession.data()?.used) {
        t.update(sessionDoc.ref, { used: true, usedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    // NOTE: Can't do where() queries inside transactions — attemptNumber uses pre-queried count
    const subRef = db.collection("submissions").doc();
    t.set(subRef, submissionDoc);
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
  return { success: true, assessmentScore: { correct, total, percentage, perBlock }, attemptNumber, xpEarned };

  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("submitOnBehalf: unexpected error", { userId, assignmentId, error: String(err) });
    throw new HttpsError("internal", "Unexpected error during submit on behalf");
  }
});

// ==========================================
// AI REVIEW QUESTIONS (Gemini)
// ==========================================

// ==========================================
// QUESTION BANK (Admin Upload)
// ==========================================

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
  const valid = questions.every((q: Record<string, unknown>) =>
    typeof q.id === "string" && (q.id as string).length > 0 &&
    typeof q.tier === "string" &&
    typeof q.type === "string" &&
    typeof q.stem === "string" && (q.stem as string).length > 0 &&
    Array.isArray(q.options) && (q.options as unknown[]).length >= 2 &&
    q.correctAnswer !== undefined &&
    (typeof q.xp === "undefined" || (typeof q.xp === "number" && q.xp >= 0 && q.xp <= 50)));
  if (!valid) {
    throw new HttpsError(
      "invalid-argument",
      "Some questions have invalid structure. Required: id (string), tier (string), type (string), stem (string), options (array, 2+), correctAnswer, xp (0-50 if provided).",
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

/**
 * awardQuestionXP — Awards XP for correct review question answers.
 * Tracks answered questions to prevent double-claiming.
 * @param {object} request - The callable request.
 * @return {object} Result with XP awarded.
 */

/**
 * penalizeWrongAnswer — Deducts XP when a student submits a wrong answer.
 * Penalty = ceil(question.xp / 2). Applied every wrong attempt to discourage
 * random clicking. XP floor is 0 (buildXPUpdates handles this).
 */

// ==========================================
// ENGAGEMENT STREAK LOGIC
// ==========================================

/**
 * updateStreak — Called after engagement submission to update weekly streak.
 */

// ==========================================
// DAILY LOGIN REWARD
// ==========================================

const BOSS_SHARD_COUNT = 10; // Supports ~10 concurrent writes/sec
export const dealBossDamage = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { bossId, userName, classType } = request.data;
  if (!bossId) throw new HttpsError("invalid-argument", "Boss ID required.");

  const db = admin.firestore();
  const bossRef = db.doc(`boss_encounters/${bossId}`);
  const userRef = db.doc(`users/${uid}`);

  // Step 1: Validate boss state + read user gear
  const [bossSnap, userSnap] = await Promise.all([bossRef.get(), userRef.get()]);

  if (!bossSnap.exists) throw new HttpsError("not-found", "Boss not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const boss = bossSnap.data()!;
  if (!boss.isActive) throw new HttpsError("failed-precondition", "Boss is not active.");
  if (new Date(boss.deadline) < new Date()) throw new HttpsError("failed-precondition", "Boss encounter has expired.");

  // Step 2: Calculate damage from player's equipped gear stats (server-authoritative)
  const userData = userSnap.data()!;
  const gam = userData.gamification || {};
  const activeClass = classType || userData.classType || '';
  const profile = gam.classProfiles?.[activeClass];
  const equipped = profile?.equipped || gam.equipped || {};
  const stats = calculateServerStats(equipped);
  const gearScore = calculateServerGearScore(equipped);
  const { damage: calculatedDamage, isCrit } = calculateBossDamage(stats, gearScore);

  // Step 3: Write damage to a random shard (distributed counter)
  const shardId = Math.floor(Math.random() * BOSS_SHARD_COUNT).toString();
  const shardRef = db.doc(`boss_encounters/${bossId}/shards/${shardId}`);

  // Step 4: Update shard + user in a batch (not transaction — avoids contention)
  const batch = db.batch();

  batch.set(shardRef, {
    damageDealt: admin.firestore.FieldValue.increment(calculatedDamage),
  }, { merge: true });

  // Damage log: stored in subcollection to avoid document size limits
  const logRef = db.collection(`boss_encounters/${bossId}/damage_log`).doc();
  batch.set(logRef, {
    userId: uid,
    userName: userName || "Student",
    damage: calculatedDamage,
    isCrit,
    timestamp: new Date().toISOString(),
  });

  // User: award XP + track total boss damage
  const xpReward = boss.xpRewardPerHit || 10;
  const xpResult = buildXPUpdates(userData, xpReward, activeClass);

  const bossDamageDealt = gam.bossDamageDealt || {};
  bossDamageDealt[bossId] = (bossDamageDealt[bossId] || 0) + calculatedDamage;

  batch.update(userRef, {
    ...xpResult.updates,
    "gamification.bossDamageDealt": bossDamageDealt,
  });

  await batch.commit();

  // Step 5: Read all shards to calculate current HP + sync boss document
  const shardsSnap = await db.collection(`boss_encounters/${bossId}/shards`).limit(BOSS_SHARD_COUNT).get();
  let totalDamage = 0;
  shardsSnap.forEach(doc => { totalDamage += doc.data().damageDealt || 0; });
  const newHp = Math.max(0, boss.maxHp - totalDamage);

  let bossDefeated = false;
  if (newHp <= 0 && boss.isActive) {
    await bossRef.update({ isActive: false, currentHp: 0 });
    bossDefeated = true;

    // Distribute completion rewards ONLY to contributors who dealt damage
    const rewards = boss.completionRewards || {};
    const rewardXp = rewards.xp || 0;
    const rewardFlux = rewards.flux || 0;
    const rewardItemRarity = rewards.itemRarity || null;

    if (rewardXp > 0 || rewardFlux > 0 || rewardItemRarity) {
      // Read damage_log subcollection to find all unique contributors (paginated)
      const contributorIds = new Set<string>();
      let lastLogDoc: any = null;
      while (true) {
        let logQuery = db.collection(`boss_encounters/${bossId}/damage_log`).limit(499);
        if (lastLogDoc) logQuery = logQuery.startAfter(lastLogDoc);
        const logSnap = await logQuery.get();
        if (logSnap.empty) break;
        lastLogDoc = logSnap.docs[logSnap.docs.length - 1];
        logSnap.forEach(doc => {
          const entry = doc.data();
          if (entry.userId) contributorIds.add(entry.userId);
        });
        if (logSnap.size < 499) break;
      }

      // Award each contributor
      for (const contributorId of contributorIds) {
        try {
          const contribRef = db.doc(`users/${contributorId}`);
          const contribSnap = await contribRef.get();
          if (!contribSnap.exists) continue;
          const contribData = contribSnap.data()!;
          const contribGam = contribData.gamification || {};
          const contribUpdates: Record<string, any> = {};

          if (rewardXp > 0) {
            const xpRes = buildXPUpdates(contribData, rewardXp, boss.classType);
            Object.assign(contribUpdates, xpRes.updates);
          }

          if (rewardFlux > 0) {
            const baseCurrency = contribUpdates["gamification.currency"] ?? (contribGam.currency || 0);
            contribUpdates["gamification.currency"] = baseCurrency + rewardFlux;
          }

          if (rewardItemRarity) {
            const loot = generateLoot(contribGam.level || 1, rewardItemRarity);
            const contribClass = boss.classType && boss.classType !== 'GLOBAL' ? boss.classType : contribData.classType;
            if (contribClass && contribClass !== "Uncategorized" && contribGam.classProfiles?.[contribClass]) {
              const inv = contribGam.classProfiles[contribClass].inventory || [];
              contribUpdates[`gamification.classProfiles.${contribClass}.inventory`] = [...inv, loot];
            } else {
              const inv = contribGam.inventory || [];
              contribUpdates["gamification.inventory"] = [...inv, loot];
            }
          }

          // Increment bossesDefeated and check achievements
          contribUpdates["gamification.bossesDefeated"] = (contribGam.bossesDefeated || 0) + 1;
          const { rewardUpdates: bossAchievementUpdates, newUnlocks: bossNewUnlocks } =
            checkAndUnlockAchievements(contribData, contribUpdates);
          Object.assign(contribUpdates, bossAchievementUpdates);

          if (Object.keys(contribUpdates).length > 0) {
            await contribRef.update(contribUpdates);
          }
          if (bossNewUnlocks.length > 0) {
            await writeAchievementNotifications(db, contributorId, bossNewUnlocks);
          }
        } catch (err) {
          logger.error(`Failed to reward boss contributor ${contributorId}:`, err);
        }
      }
    }
  } else {
    // Always sync currentHp on the boss document for admin panel visibility
    await bossRef.update({ currentHp: newHp });
  }

  return {
    newHp,
    damageDealt: calculatedDamage,
    isCrit,
    xpEarned: xpReward,
    bossDefeated,
    leveledUp: xpResult.leveledUp,
    stats: { tech: stats.tech, focus: stats.focus, analysis: stats.analysis, charisma: stats.charisma },
    gearScore,
  };
});

// ==========================================
// BOSS QUIZ
// ==========================================

// Helper: check if a boss has a modifier of a given type
function hasMod(mods: { type: string; value?: number }[] | undefined, type: string): boolean {
  return !!mods?.some((m) => m.type === type);
}
function modVal(mods: { type: string; value?: number }[] | undefined, type: string, fallback = 0): number {
  const m = mods?.find((m) => m.type === type);
  return m?.value ?? fallback;
}
function derivePlayerRole(stats: { tech: number; focus: number; analysis: number; charisma: number }): string {
  const statMap = [
    { stat: stats.tech, role: 'VANGUARD' },
    { stat: stats.focus, role: 'STRIKER' },
    { stat: stats.analysis, role: 'SENTINEL' },
    { stat: stats.charisma, role: 'COMMANDER' },
  ];
  statMap.sort((a, b) => b.stat - a.stat);
  return statMap[0].role;
}

// ==========================================
// UNIFIED BOSS EVENT v2 (attempt-based, topic mastery, new damage formula)
// ==========================================

const BOSS_EVENT_SHARD_COUNT = 10;
const BOSS_EVENT_MAX_ATTEMPTS = 3;

/**
 * Unified boss event answer handler.
 * Supports attempt-based progress, topic mastery tracking, and the new Pokemon-style damage formula.
 */
export const answerBossEvent = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { eventId, questionId, answer, timeTakenMs = 30000 } = request.data;
  if (!eventId || !questionId || answer === undefined) {
    throw new HttpsError("invalid-argument", "Event ID, question ID, and answer required.");
  }

  const db = admin.firestore();
  const eventRef = db.doc(`boss_events/${eventId}`);
  const userRef = db.doc(`users/${uid}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);

  const [eventSnap, userSnap, progressSnap] = await Promise.all([
    eventRef.get(), userRef.get(), progressRef.get(),
  ]);

  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const event = eventSnap.data()!;
  if (!event.isActive) throw new HttpsError("failed-precondition", "Event is not active.");

  const questions = event.questions || [];
  const question = questions.find((q: { id: string }) => q.id === questionId);
  if (!question) throw new HttpsError("not-found", "Question not found.");

  // --- Attempt system ---
  let progress = progressSnap.exists
    ? progressSnap.data()!
    : { attempts: [], totalDamageDealt: 0, participationMet: false, rewardClaimed: false };

  // Ensure attempts array exists
  if (!progress.attempts) progress.attempts = [];

  // Get or create current attempt
  let currentAttempt = progress.attempts.find((a: { status: string }) => a.status === 'active');
  if (!currentAttempt) {
    // Trials allow unlimited attempts
    if (!event.isTrial && progress.attempts.length >= BOSS_EVENT_MAX_ATTEMPTS) {
      return {
        error: 'MAX_ATTEMPTS_REACHED',
        message: `You have used all ${BOSS_EVENT_MAX_ATTEMPTS} attempts for this boss.`,
      };
    }
    currentAttempt = {
      attemptNumber: progress.attempts.length + 1,
      answeredQuestions: [],
      currentHp: -1,
      maxHp: 100,
      combatStats: {
        totalDamageDealt: 0, criticalHits: 0, damageReduced: 0, bossDamageTaken: 0,
        correctByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
        incorrectByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
        longestStreak: 0, currentStreak: 0, shieldBlocksUsed: 0,
        healingReceived: 0, questionsAttempted: 0, questionsCorrect: 0,
      },
      status: 'active',
      startedAt: new Date().toISOString(),
      checkpointPhase: event.currentPhase || 0,
    };
    progress.attempts.push(currentAttempt);
  }

  // Check if already answered in this attempt
  if (currentAttempt.answeredQuestions.includes(questionId)) {
    return { alreadyAnswered: true, correct: false, damage: 0, newHp: event.currentHp };
  }

  // --- Player combat stats ---
  const userData = userSnap.data()!;
  const gam = userData.gamification || {};
  const activeClass = event.classType || userData.classType || "";
  const profile = gam.classProfiles?.[activeClass];
  const equipped = profile?.equipped || gam.equipped || {};
  const playerAttrStats = calculateServerStats(equipped);
  const playerGearScore = calculateServerGearScore(equipped);
  const baseCombat = deriveCombatStats(playerAttrStats);
  let { maxHp } = baseCombat;
  let armorPercent = baseCombat.armorPercent;
  let critChance = baseCombat.critChance;
  let adjustedCritMultiplier = baseCombat.critMultiplier;

  // Apply modifiers
  const mods: { type: string; value?: number }[] = event.modifiers || [];
  if (hasMod(mods, "ARMOR_BREAK") || hasMod(mods, "GLASS_CANNON")) armorPercent = 0;
  if (hasMod(mods, "CRIT_SURGE")) critChance = Math.min(1, critChance + modVal(mods, "CRIT_SURGE", 20) / 100);

  // Derive role
  const playerRole = derivePlayerRole(playerAttrStats);
  if (playerRole === 'STRIKER') {
    critChance = Math.min(1, critChance + 0.10);
    adjustedCritMultiplier += 0.5;
  }

  // Check active abilities
  const activeAbilities: { abilityId: string; effect: string; value: number; remainingQuestions: number }[] = event.activeAbilities || [];
  let silenced = false;
  let enrageMultiplier = 1;
  for (const ability of activeAbilities) {
    if (ability.effect === 'SILENCE' && ability.remainingQuestions > 0) silenced = true;
    if (ability.effect === 'ENRAGE' && ability.remainingQuestions > 0) enrageMultiplier = 1 + (ability.value / 100);
  }

  // Initialize player HP
  let playerHp = currentAttempt.currentHp >= 0 ? currentAttempt.currentHp : maxHp;
  if (playerHp <= 0) {
    return { knockedOut: true, message: "You have been knocked out! Start a new attempt or visit Study Hall." };
  }

  // Combat stats
  const cs = currentAttempt.combatStats || {
    totalDamageDealt: 0, criticalHits: 0, damageReduced: 0, bossDamageTaken: 0,
    correctByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
    incorrectByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
    longestStreak: 0, currentStreak: 0, shieldBlocksUsed: 0,
    healingReceived: 0, questionsAttempted: 0, questionsCorrect: 0,
  };
  const isFirstAnswerForPlayer = currentAttempt.answeredQuestions.length === 0;
  cs.questionsAttempted++;

  const isCorrect = Number(answer) === question.correctAnswer;
  let damage = 0;
  let playerDamage = 0;
  let isCrit = false;
  let healAmount = 0;
  let shieldBlocked = false;

  const batch = db.batch();

  // --- Topic mastery lookup ---
  const topicMasteryMap = gam.topicMastery || {};
  const topicMastery = topicMasteryMap[question.topicId]?.level || 0;

  if (isCorrect) {
    cs.questionsCorrect++;
    cs.currentStreak++;
    if (cs.currentStreak > cs.longestStreak) cs.longestStreak = cs.currentStreak;
    cs.correctByDifficulty[question.difficulty as "EASY" | "MEDIUM" | "HARD"]++;

    // NEW DAMAGE FORMULA (v2)
    const levelComponent = (2 * (gam.level || 1) / 5 + 2);
    const power = 10 + (question.difficulty === 'HARD' ? 3 : question.difficulty === 'MEDIUM' ? 2 : 1) * 5;
    const attack = 50 + topicMastery * 100;
    const defense = 50 + (question.difficulty === 'HARD' ? 3 : question.difficulty === 'MEDIUM' ? 2 : 1) * 10;
    let rawDamage = ((levelComponent * power * attack / defense) / 50 + 2);

    let modifier = 1.0;
    if (topicMastery > 0) modifier *= (1 + 0.1 * topicMastery);
    if (timeTakenMs < 30000 * 0.5) modifier *= 1.2; // Speed bonus
    if (cs.currentStreak >= 3) modifier *= (1 + 0.1 * Math.min(cs.currentStreak, 10));
    if (playerRole === 'VANGUARD') modifier *= 1.15;
    if (playerRole === 'STRIKER') modifier *= 1.05;

    // --- Specialization bonuses (all 8 specs) ---
    const specId = gam.specialization;
    const hpPct = (playerHp / maxHp) * 100;
    if (specId === 'JUGGERNAUT') {
      if (hpPct > 75) modifier *= 1.08;
      if (hpPct < 30) modifier *= 1.15;
    }
    if (specId === 'BERSERKER') {
      if (hpPct < 50) modifier *= 1.12;
      if (hpPct < 40) modifier *= 1.20;
      if (hpPct < 25) modifier *= 1.35;
    }
    if (specId === 'SNIPER') {
      if (cs.currentStreak >= 3) modifier *= 1.15;
      if (cs.currentStreak >= 5) modifier *= 1.25;
      if (cs.currentStreak >= 7) modifier *= 1.30;
      if (question.difficulty === 'HARD') modifier *= 1.15;
    }
    if (specId === 'SPEEDSTER') {
      if (timeTakenMs < 30000 * 0.5) modifier *= 1.15;
    }
    if (specId === 'GUARDIAN') modifier *= 1.05;
    if (specId === 'CLERIC') modifier *= 1.03;
    if (specId === 'TACTICIAN') modifier *= 1.05;
    if (specId === 'SCHOLAR') {
      if (topicMastery >= 6) modifier *= 1.15;
      if (topicMastery >= 8) modifier *= 1.25;
    }

    if (hasMod(mods, 'PLAYER_DAMAGE_BOOST')) rawDamage += modVal(mods, 'PLAYER_DAMAGE_BOOST', 25);
    if (hasMod(mods, 'DOUBLE_OR_NOTHING') || hasMod(mods, 'GLASS_CANNON')) rawDamage *= 2;
    if (hasMod(mods, 'LAST_STAND') && playerHp < maxHp * 0.25) rawDamage *= 1.5;
    if (hasMod(mods, 'STREAK_BONUS') && cs.currentStreak > 1) {
      rawDamage += modVal(mods, 'STREAK_BONUS', 10) * (cs.currentStreak - 1);
    }

    // Gear bonus with diminishing returns
    const gearBonus = 1 + (playerGearScore / 1000) / (1 + playerGearScore / 2000);
    modifier *= gearBonus;
    modifier *= (0.9 + Math.random() * 0.2);

    rawDamage = Math.round(rawDamage * modifier);

    // Crit roll
    if (!silenced && Math.random() < critChance) {
      isCrit = true;
      rawDamage = Math.round(rawDamage * adjustedCritMultiplier);
      cs.criticalHits++;
    }

    // Per-hit cap: 5% of boss max HP
    const effectiveMaxHp = event.scaledMaxHp || event.maxHp;
    const perHitCap = Math.floor(effectiveMaxHp * 0.05);
    damage = Math.min(rawDamage, perHitCap);
    damage = Math.max(1, damage);

    // Participant diminishing returns
    const participantCount = event.participantCount || 0;
    const drMultiplier = Math.min(1.0, Math.sqrt(10 / Math.max(10, participantCount + 1)));
    damage = Math.max(1, Math.round(damage * drMultiplier));

    // Boss armor
    const bossArmor = Math.min(50, Math.max(0, (participantCount - 10) * 2));
    damage = Math.max(1, Math.round(damage * (1 - bossArmor / 100)));

    cs.totalDamageDealt += damage;

    // Write to shard
    const shardId = Math.floor(Math.random() * BOSS_EVENT_SHARD_COUNT).toString();
    batch.set(db.doc(`boss_events/${eventId}/shards/${shardId}`), {
      damageDealt: admin.firestore.FieldValue.increment(damage),
    }, { merge: true });

    if (isFirstAnswerForPlayer) {
      batch.update(eventRef, { participantCount: admin.firestore.FieldValue.increment(1) });
    }

    // Damage log
    const logRef = db.collection(`boss_events/${eventId}/damage_log`).doc();
    batch.set(logRef, {
      userId: uid, userName: userData.name || "Student", damage, isCrit,
      timestamp: new Date().toISOString(), attemptNumber: currentAttempt.attemptNumber,
    });

    // Award XP
    const xpResult = buildXPUpdates(userData, damage, activeClass);
    batch.update(userRef, xpResult.updates);

    // Healing wave
    if (hasMod(mods, "HEALING_WAVE")) {
      healAmount = modVal(mods, "HEALING_WAVE", 10);
      playerHp = Math.min(maxHp, playerHp + healAmount);
      cs.healingReceived += healAmount;
    }
  } else {
    cs.currentStreak = 0;
    cs.incorrectByDifficulty[question.difficulty as "EASY" | "MEDIUM" | "HARD"]++;

    const shieldMax = hasMod(mods, "SHIELD_WALL") ? modVal(mods, "SHIELD_WALL", 2) : 0;
    if (shieldMax > 0 && cs.shieldBlocksUsed < shieldMax) {
      shieldBlocked = true;
      cs.shieldBlocksUsed++;
    } else {
      let baseBossDamage = question.difficulty === "HARD" ? 30 : question.difficulty === "MEDIUM" ? 20 : 15;
      if (hasMod(mods, "BOSS_DAMAGE_BOOST")) baseBossDamage += modVal(mods, "BOSS_DAMAGE_BOOST", 15);
      if (hasMod(mods, "DOUBLE_OR_NOTHING")) baseBossDamage *= 2;
      baseBossDamage = Math.round(baseBossDamage * enrageMultiplier);

      const rawDamage = baseBossDamage;
      playerDamage = Math.max(1, Math.round(rawDamage * (1 - armorPercent / 100)));
      const damageBlocked = rawDamage - playerDamage;
      cs.damageReduced += Math.max(0, damageBlocked);
      cs.bossDamageTaken += playerDamage;
      playerHp = Math.max(0, playerHp - playerDamage);
    }
  }

  // Time pressure
  if (hasMod(mods, "TIME_PRESSURE")) {
    const tickDmg = modVal(mods, "TIME_PRESSURE", 5);
    playerHp = Math.max(0, playerHp - tickDmg);
    cs.bossDamageTaken += tickDmg;
  }

  // Commander healing (atomic — inside batch)
  if (playerRole === 'COMMANDER' && isCorrect) {
    try {
      const allProgressSnap = await db.collection("boss_event_progress")
        .where("eventId", "==", eventId)
        .where("currentHp", ">", 0)
        .limit(10)
        .get();
      const allies = allProgressSnap.docs
        .map(d => d.id)
        .filter(id => id !== `${uid}_${eventId}`)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);
      for (const allyProgressId of allies) {
        const allyRef = db.doc(`boss_event_progress/${allyProgressId}`);
        batch.update(allyRef, { currentHp: admin.firestore.FieldValue.increment(5) });
      }
      cs.roleHealingGiven = (cs.roleHealingGiven || 0) + (allies.length * 5);
    } catch { /* ignore */ }
  }

  // Update attempt
  currentAttempt.answeredQuestions = [...currentAttempt.answeredQuestions, questionId];
  currentAttempt.currentHp = playerHp;
  currentAttempt.maxHp = maxHp;
  currentAttempt.combatStats = { ...cs, role: playerRole };

  if (playerHp <= 0) {
    currentAttempt.status = 'abandoned';
    currentAttempt.endedAt = new Date().toISOString();
  }

  batch.set(progressRef, {
    userId: uid, eventId,
    attempts: progress.attempts,
    totalDamageDealt: (progress.totalDamageDealt || 0) + damage,
    participationMet: progress.attempts.some((a: { answeredQuestions: string[]; combatStats: { questionsCorrect: number } }) =>
      a.answeredQuestions.length >= 5 && (a.combatStats?.questionsCorrect || 0) >= 1
    ),
  }, { merge: true });

  await batch.commit();

  // --- Topic mastery tracking ---
  if (question.topicId) {
    try {
      const masteryRef = db.doc(`users/${uid}`);
      const masterySnap = await masteryRef.get();
      const masteryData = masterySnap.data()?.gamification?.topicMastery || {};
      const currentMastery = masteryData[question.topicId] || {
        topicId: question.topicId, topicName: question.topicId,
        level: 0, accuracyHistory: [], currentAccuracy: 0,
        questionsAnswered: 0, questionsCorrect: 0, lastUpdated: new Date().toISOString(),
      };
      currentMastery.accuracyHistory = [...(currentMastery.accuracyHistory || []), isCorrect ? 1 : 0].slice(-20);
      currentMastery.questionsAnswered = (currentMastery.questionsAnswered || 0) + 1;
      if (isCorrect) currentMastery.questionsCorrect = (currentMastery.questionsCorrect || 0) + 1;
      const recent = currentMastery.accuracyHistory;
      currentMastery.currentAccuracy = recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
      currentMastery.level = Math.min(10, Math.floor(currentMastery.currentAccuracy * 10));
      currentMastery.lastUpdated = new Date().toISOString();

      await masteryRef.update({
        [`gamification.topicMastery.${question.topicId}`]: currentMastery,
      });
    } catch (err) {
      logger.error("Failed to update topic mastery:", err);
    }
  }

  // --- Phase transition (transaction) ---
  let phaseTransition: { phase: number; name: string; dialogue?: string; newAppearance?: unknown } | null = null;
  const phases = event.phases || [];

  if (phases.length > 0) {
    await db.runTransaction(async (t) => {
      const eventDoc = await t.get(eventRef);
      const eventData = eventDoc.data()!;
      const eventCurrentPhase = eventData.currentPhase || 0;
      const effectiveMaxHp = eventData.scaledMaxHp || eventData.maxHp;
      const shardsSnap = await t.get(db.collection(`boss_events/${eventId}/shards`));
      let totalDamage = 0;
      shardsSnap.forEach(d => { totalDamage += d.data().damageDealt || 0; });
      const newHpTx = Math.max(0, effectiveMaxHp - totalDamage);
      const hpPercent = (newHpTx / effectiveMaxHp) * 100;

      for (let i = phases.length - 1; i > eventCurrentPhase; i--) {
        if (hpPercent <= phases[i].hpThreshold) {
          phaseTransition = {
            phase: i, name: phases[i].name, dialogue: phases[i].dialogue,
            newAppearance: phases[i].bossAppearance,
          };
          t.update(eventRef, {
            currentPhase: i,
            ...(phases[i].damagePerCorrect ? { damagePerCorrect: phases[i].damagePerCorrect } : {}),
            lastPhaseTransitionAt: new Date().toISOString(),
          });
          break;
        }
      }
    });
  }

  // Aggregate HP for response
  const shardsSnap = await db.collection(`boss_events/${eventId}/shards`).get();
  let totalDamage = 0;
  shardsSnap.forEach((d) => { totalDamage += d.data().damageDealt || 0; });
  const effectiveMaxHp = event.scaledMaxHp || event.maxHp;
  const newHp = Math.max(0, effectiveMaxHp - totalDamage);

  // Boss defeated check
  let bossDefeated = false;
  if (newHp <= 0 && event.isActive) {
    await eventRef.update({ isActive: false, currentHp: 0 });
    bossDefeated = true;
    // Rewards distribution would go here (similar to answerBossQuiz)
  } else {
    await eventRef.update({ currentHp: newHp });
  }

  // --- Adaptive difficulty: select next question difficulty ---
  const attemptAccuracy = cs.questionsAttempted > 0 ? cs.questionsCorrect / cs.questionsAttempted : 0;
  let nextDifficulty: 'EASY' | 'MEDIUM' | 'HARD' = question.difficulty;
  if (attemptAccuracy > 0.85) nextDifficulty = 'HARD';
  else if (attemptAccuracy < 0.55) nextDifficulty = 'EASY';
  else nextDifficulty = 'MEDIUM';

  // --- Boss intent for next question ---
  let nextBossIntent: { type: string; warningText: string; icon: string; targetSubject?: string } | null = null;
  if (!bossDefeated && playerHp > 0) {
    const remainingQuestions = questions.filter((q: { id: string }) => !currentAttempt.answeredQuestions.includes(q.id));
    if (remainingQuestions.length > 0) {
      const nextQ = remainingQuestions[0];
      nextBossIntent = {
        type: 'channel',
        warningText: 'Channeling...',
        icon: '⚡',
        targetSubject: nextQ.topicId,
      };
    }
  }

  return {
    correct: isCorrect, damage, newHp, bossDefeated,
    playerDamage, playerHp, playerMaxHp: maxHp,
    knockedOut: playerHp <= 0,
    isCrit, healAmount, shieldBlocked,
    playerRole,
    attemptNumber: currentAttempt.attemptNumber,
    attemptsRemaining: BOSS_EVENT_MAX_ATTEMPTS - progress.attempts.filter((a: { status: string }) => a.status !== 'active').length,
    phaseTransition,
    activeAbilities: activeAbilities.filter((a) => a.remainingQuestions > 0),
    nextDifficulty,
    nextBossIntent,
  };
});

// ==========================================
// ADAPTIVE QUESTION SELECTION
// ==========================================

export const getNextBossQuestion = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { eventId } = request.data;
  if (!eventId) {
    throw new HttpsError("invalid-argument", "Event ID required.");
  }

  const db = admin.firestore();
  const eventRef = db.doc(`boss_events/${eventId}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);

  const [eventSnap, progressSnap] = await Promise.all([
    eventRef.get(), progressRef.get(),
  ]);

  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  const event = eventSnap.data()!;
  if (!event.isActive) throw new HttpsError("failed-precondition", "Event is not active.");

  const questions: Array<{ id: string; stem: string; options: string[]; correctAnswer: number; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; topicId?: string; bankId?: string; damageBonus?: number; distractorTypes?: string[]; explanation?: string }> = event.questions || [];

  // Get current attempt
  let progress = progressSnap.exists ? progressSnap.data()! : { attempts: [] };
  if (!progress.attempts) progress.attempts = [];
  const currentAttempt = progress.attempts.find((a: { status: string }) => a.status === 'active');

  const answeredIds = new Set<string>(currentAttempt?.answeredQuestions || []);
  const remaining = questions.filter(q => !answeredIds.has(q.id));

  if (remaining.length === 0) {
    return { complete: true, message: 'All questions answered!' };
  }

  // --- Adaptive selection ---
  const cs = currentAttempt?.combatStats || { questionsCorrect: 0, questionsAttempted: 0 };
  const accuracy = cs.questionsAttempted > 0 ? cs.questionsCorrect / cs.questionsAttempted : 0.5;

  // Difficulty bias based on accuracy
  let targetDifficulties: ('EASY' | 'MEDIUM' | 'HARD')[];
  if (accuracy > 0.85) targetDifficulties = ['HARD', 'MEDIUM'];
  else if (accuracy < 0.55) targetDifficulties = ['EASY', 'MEDIUM'];
  else targetDifficulties = ['MEDIUM', 'EASY', 'HARD'];

  // Topic balance: count recent topics
  const recentTopics: Record<string, number> = {};
  for (const qid of currentAttempt?.answeredQuestions?.slice(-5) || []) {
    const q = questions.find((x: { id: string }) => x.id === qid);
    if (q?.topicId) recentTopics[q.topicId] = (recentTopics[q.topicId] || 0) + 1;
  }

  // Score each remaining question
  const scored = remaining.map(q => {
    let score = Math.random(); // Base randomness

    // Difficulty match bonus
    const diffIdx = targetDifficulties.indexOf(q.difficulty);
    if (diffIdx === 0) score += 2.0;
    else if (diffIdx === 1) score += 1.0;

    // Topic diversity bonus (penalize recently seen topics)
    if (q.topicId && recentTopics[q.topicId]) {
      score -= recentTopics[q.topicId] * 0.5;
    }

    return { q, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored[0].q;

  // Boss intent for next-next question
  const nextRemaining = remaining.filter(q => q.id !== selected.id);
  let bossIntent = null;
  if (nextRemaining.length > 0) {
    const nextQ = nextRemaining[0];
    bossIntent = {
      type: 'channel',
      warningText: 'Channeling...',
      icon: '⚡',
      targetSubject: nextQ.topicId,
    };
  }

  return {
    question: selected,
    bossIntent,
    remainingCount: remaining.length - 1,
    attemptStats: {
      accuracy: Math.round(accuracy * 100),
      correct: cs.questionsCorrect || 0,
      attempted: cs.questionsAttempted || 0,
    },
  };
});

// ==========================================
// SPECIALIZATION TRIALS
// ==========================================

export const startSpecializationTrial = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { specializationId } = request.data;
  if (!specializationId) {
    throw new HttpsError("invalid-argument", "Specialization ID required.");
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const userData = userSnap.data()!;
  const gam = userData.gamification || {};

  // Check if already has a specialization
  if (gam.specialization) {
    throw new HttpsError("failed-precondition", "You already have a specialization.");
  }

  // Check level requirement
  const level = gam.level || 1;
  if (level < 10) {
    throw new HttpsError("failed-precondition", `Reach level 10 to unlock specializations. You are level ${level}.`);
  }

  const { force } = request.data;

  // Check if trial already in progress
  const trialEventId = `trial_${uid}_${specializationId}`;
  const trialRef = db.doc(`boss_events/${trialEventId}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${trialEventId}`);
  const trialSnap = await trialRef.get();
  if (trialSnap.exists && trialSnap.data()?.isActive && !force) {
    return { trialEventId, message: "Continuing your trial..." };
  }

  // If forcing a restart, clean up old progress
  if (force) {
    await progressRef.delete().catch(() => {});
  }

  const classType = userData.classType || 'GLOBAL';

  // Tutorial questions — teach the class mechanics
  const TRIAL_QUESTIONS: Record<string, Array<{ id: string; stem: string; options: string[]; correctAnswer: number; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; topicId: string }>> = {
    JUGGERNAUT: [
      { id: 'trial_q_0', stem: 'What is the Juggernaut\'s primary combat role?', options: ['Healer', 'Tank / Vanguard', 'Speedster', 'Sniper'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'When does Juggernaut deal bonus damage?', options: ['When HP is below 25%', 'When HP is above 75%', 'On fast answers', 'On streaks'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does the "Iron Skin" skill provide?', options: ['+15% damage', '+15% armor', '+15% speed', '+15% crit chance'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What happens when Juggernaut\'s HP drops below 30% with "Unstoppable"?', options: ['Deal more damage', '+25% armor and +15% damage', 'Heal allies', 'Dodge attacks'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What is Juggernaut\'s ultimate "Colossus" best known for?', options: ['Dealing massive crit damage', 'Immunity to stun + heavy armor', 'Healing the party', 'Speed boosts'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    BERSERKER: [
      { id: 'trial_q_0', stem: 'What describes the Berserker\'s playstyle?', options: ['Safe and steady', 'High risk, high reward', 'Support and healing', 'Precision strikes'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'When does Berserker deal maximum damage?', options: ['At full HP', 'When HP is below 40%', 'On streaks', 'With fast answers'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Reckless Assault" trade for more damage?', options: ['Speed', 'Armor', 'HP', 'Crit chance'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What does "Execute" do?', options: ['Heals you', 'Bosses below 15% HP take +25% damage from you', 'Blocks boss attacks', 'Speeds up answers'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What is unique about "Rampage"?', options: ['It heals allies', '+35% damage and lifesteal when HP < 25%', 'It dodges attacks', 'It stuns the boss'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    SNIPER: [
      { id: 'trial_q_0', stem: 'What is the Sniper\'s specialty?', options: ['Healing', 'Streak mastery and precision', 'Raw endurance', 'Speed'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'When does Sniper deal bonus damage?', options: ['When HP is low', 'On streaks of 3+ correct answers', 'On wrong answers', 'At random'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Quick Draw" reward?', options: ['Slow, careful answers', 'Fast answers under 50% time', 'Wrong answers', 'Skipping questions'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What happens at a 5-answer streak with "Focus Fire"?', options: ['+25% crit chance', '+25% armor', 'Healing', 'Speed boost'], correctAnswer: 0, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What makes "One Shot" powerful?', options: ['First correct answer each attempt deals +50% damage', 'It heals you', 'It blocks damage', 'It speeds up time'], correctAnswer: 0, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    SPEEDSTER: [
      { id: 'trial_q_0', stem: 'What is the Speedster\'s specialty?', options: ['Heavy armor', 'Dodging and fast answers', 'Healing', 'Raw damage'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "Nimble" provide?', options: ['+20% dodge chance', '+20% damage', '+20% armor', '+20% healing'], correctAnswer: 0, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What bonus does "Haste" give on fast answers?', options: ['Only damage', '+15% damage AND +5 HP heal', 'Armor', 'Crit chance'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What happens after dodging with "Phase Shift"?', options: ['Nothing', 'Next answer gets +25% damage', 'You heal', 'Boss gets stunned'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What is "Time Warp" known for?', options: ['+50% dodge, fast answer damage, and speed', 'Healing', 'Armor', 'Stunning bosses'], correctAnswer: 0, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    GUARDIAN: [
      { id: 'trial_q_0', stem: 'What is the Guardian\'s primary role?', options: ['Solo damage dealer', 'Protecting allies', 'Healer', 'Speedster'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "Aegis" do for nearby allies?', options: ['Nothing', '+5% armor', '+20% damage', 'Healing'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Bulwark" reflect back to the boss?', options: ['10% damage', '10% healing', 'Nothing', 'Speed'], correctAnswer: 0, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'When does "Rescue" activate?', options: ['When you answer correctly', 'When an ally drops below 25% HP', 'At random', 'Never'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What makes "Immortal" unique?', options: ['It deals massive damage', 'Survive a lethal hit once per attempt at 1 HP', 'It heals allies', 'It speeds up answers'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    CLERIC: [
      { id: 'trial_q_0', stem: 'What is the Cleric\'s primary role?', options: ['Damage dealer', 'Healer and support', 'Tank', 'Speedster'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "First Aid" do?', options: ['Deals damage', 'Heals +5 HP on correct answers', 'Armor boost', 'Speed boost'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Inspiration" do for allies?', options: ['Nothing', 'Gives nearest ally +3% damage on correct answers', 'Heals them directly', 'Speeds them up'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What does "Sanctuary" do?', options: ['Heals only you', 'All party members heal +8 HP per correct answer', 'Damages the boss', 'Speed boost'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What triggers "Divine Intervention"?', options: ['Any correct answer', 'Once per attempt, fully heals all allies when any hits 0 HP', 'Randomly', 'Never'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    TACTICIAN: [
      { id: 'trial_q_0', stem: 'What is the Tactician\'s specialty?', options: ['Raw damage', 'Strategic debuffs and boss vulnerabilities', 'Healing', 'Speed'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "Scan Weakness" do?', options: ['Heals you', '+10% damage after boss phase transition', 'Armor boost', 'Speed boost'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Prepared Mind" improve?', options: ['Damage', 'Hint effectiveness by 15%', 'Armor', 'Speed'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What does "Vulnerability Scan" do for the party?', options: ['Nothing', 'All party +15% damage for 15s after you answer correctly', 'Heals party', 'Speeds up party'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What does "Checkmate" do when the boss is below 20% HP?', options: ['Nothing', 'All party +30% damage', 'Heals party', 'Stuns boss'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    SCHOLAR: [
      { id: 'trial_q_0', stem: 'What is the Scholar\'s specialty?', options: ['Raw damage', 'Topic mastery and knowledge power', 'Healing', 'Speed'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "Deep Study" do?', options: ['+20% faster topic mastery advancement', '+20% damage', '+20% armor', '+20% speed'], correctAnswer: 0, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'When does "Applied Knowledge" deal bonus damage?', options: ['Always', 'When topic mastery >= 0.6', 'On streaks', 'On fast answers'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What does "Cross-Domain" reward?', options: ['Nothing', 'Skills from 2+ trees unlocked: +10% all damage', 'Armor', 'Healing'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What does "Omniscient" raise?', options: ['All topic mastery caps', 'Only damage', 'Only armor', 'Only speed'], correctAnswer: 0, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
  };

  const questions = TRIAL_QUESTIONS[specializationId] || TRIAL_QUESTIONS['JUGGERNAUT'];

  // Create trial boss event
  const trialBoss = {
    id: trialEventId,
    mode: 'QUIZ',
    bossName: `${specializationId} Tutorial`,
    description: `Learn how to play the ${specializationId} specialization. Answer the tutorial questions to unlock this class.`,
    maxHp: 50,
    currentHp: 50,
    scaledMaxHp: 50,
    classType,
    isActive: true,
    deadline: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    questions,
    damagePerCorrect: 10,
    rewards: { xp: 25, flux: 5 },
    modifiers: [],
    phases: [{ name: 'Tutorial', hpThreshold: 100, modifiers: [], dialogue: 'Learn your class.' }],
    currentPhase: 0,
    participantCount: 0,
    createdAt: new Date().toISOString(),
    isTrial: true,
    trialSpecializationId: specializationId,
  };

  await trialRef.set(trialBoss);

  // Initialize progress
  await progressRef.set({
    userId: uid,
    eventId: trialEventId,
    attempts: [],
    totalDamageDealt: 0,
    participationMet: false,
    rewardClaimed: false,
  });

  return { trialEventId, message: `Tutorial started! Answer the questions to learn the ${specializationId} specialization and unlock it.` };
});

export const completeSpecializationTrial = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { trialEventId } = request.data;
  if (!trialEventId) {
    throw new HttpsError("invalid-argument", "Trial event ID required.");
  }

  const db = admin.firestore();
  const trialRef = db.doc(`boss_events/${trialEventId}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${trialEventId}`);
  const userRef = db.doc(`users/${uid}`);

  const [trialSnap, progressSnap, userSnap] = await Promise.all([
    trialRef.get(), progressRef.get(), userRef.get(),
  ]);

  if (!trialSnap.exists) throw new HttpsError("not-found", "Trial not found.");
  if (!progressSnap.exists) throw new HttpsError("not-found", "Progress not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const trial = trialSnap.data()!;
  const progress = progressSnap.data()!;
  const userData = userSnap.data()!;

  // Verify this is a trial
  if (!trial.isTrial || !trial.trialSpecializationId) {
    throw new HttpsError("failed-precondition", "Not a valid trial.");
  }

  const specId = trial.trialSpecializationId;

  // Evaluate trial results
  const attempts = progress.attempts || [];
  const bestAttempt = attempts.reduce((best: Record<string, unknown> | null, a: Record<string, unknown>) => {
    if (!best) return a;
    const bestCorrect = (best.combatStats as Record<string, unknown>)?.questionsCorrect as number || 0;
    const aCorrect = (a.combatStats as Record<string, unknown>)?.questionsCorrect as number || 0;
    return aCorrect > bestCorrect ? a : best;
  }, null);

  const stats = bestAttempt?.combatStats as Record<string, unknown> | undefined;
  const correct = stats?.questionsCorrect as number || 0;
  const attempted = stats?.questionsAttempted as number || 0;
  const accuracy = attempted > 0 ? correct / attempted : 0;
  const survived = (bestAttempt?.currentHp as number || 0) > 0;

  // Pass criteria: at least 3 correct out of 5, and survived
  const passed = correct >= 3 && survived;

  // Mark trial as evaluated but keep it active so the user can see the result
  // and choose whether to commit or decline.
  await trialRef.update({
    trialPassed: passed,
    trialCompletedAt: new Date().toISOString(),
  });

  // If user already has a specialization, deactivate this trial immediately
  // since they cannot commit to another one.
  if (userData.gamification?.specialization) {
    await trialRef.update({ isActive: false });
    return {
      success: false,
      passed: false,
      message: "You already have a specialization.",
      stats: { correct, attempted, accuracy: Math.round(accuracy * 100) },
    };
  }

  if (passed) {
    return {
      success: true,
      passed: true,
      specializationId: specId,
      message: `You passed the ${specId} tutorial! Confirm below to commit to this specialization.`,
      stats: { correct, attempted, accuracy: Math.round(accuracy * 100) },
    };
  }

  return {
    success: false,
    passed: false,
    message: "Tutorial complete — you didn't pass this time. Review the class skills and try again!",
    stats: { correct, attempted, accuracy: Math.round(accuracy * 100) },
  };
});



// ==========================================
// BATTLE CONSUMABLES
// ==========================================


export const scaleBossHp = onCall(async (request) => {
  verifyAuth(request.auth);
  await verifyAdmin(request.auth);

  const { quizId } = request.data;
  if (!quizId) throw new HttpsError("invalid-argument", "Quiz ID required.");

  const db = admin.firestore();
  const quizRef = db.doc(`boss_quizzes/${quizId}`);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) throw new HttpsError("not-found", "Quiz not found.");

  const quiz = quizSnap.data()!;
  const autoScale = quiz.autoScale;
  const difficultyTier = quiz.difficultyTier || 'NORMAL';

  // Difficulty tier HP multiplier
  const tierMultipliers: Record<string, number> = { NORMAL: 1, HARD: 1.5, NIGHTMARE: 2.5, APOCALYPSE: 4 };
  let scaledHp = quiz.maxHp * (tierMultipliers[difficultyTier] || 1);

  if (autoScale?.enabled && autoScale.factors?.length > 0) {
    // Scope query to class-specific students when possible to avoid loading all users
    let usersQuery: FirebaseFirestore.Query = db.collection('users').where('role', '==', 'STUDENT');
    if (quiz.classType && quiz.classType !== 'GLOBAL') {
      usersQuery = usersQuery.where('classType', '==', quiz.classType);
    }
    const usersSnap = await usersQuery.get();
    const targetStudents: FirebaseFirestore.DocumentData[] = [];

    usersSnap.forEach(d => {
      const data = d.data();
      if (quiz.targetSections?.length > 0) {
        if (!quiz.targetSections.includes(data.section)) return;
      }
      targetStudents.push(data);
    });

    const classSize = targetStudents.length;

    for (const factor of autoScale.factors) {
      if (factor === 'CLASS_SIZE' && classSize > 10) {
        scaledHp *= 1 + ((classSize - 10) * 0.10);
      }
      if (factor === 'AVG_GEAR_SCORE') {
        let totalGearScore = 0;
        for (const student of targetStudents) {
          const gam = student.gamification || {};
          const studentProfile = gam.classProfiles?.[quiz.classType];
          const equipped = studentProfile?.equipped || gam.equipped || {};
          totalGearScore += calculateServerGearScore(equipped);
        }
        const avgGearScore = classSize > 0 ? totalGearScore / classSize : 0;
        if (avgGearScore > 50) {
          scaledHp *= 1 + ((avgGearScore - 50) * 0.01);
        }
      }
      if (factor === 'AVG_LEVEL') {
        let totalLevel = 0;
        for (const student of targetStudents) {
          totalLevel += student.gamification?.level || 1;
        }
        const avgLevel = classSize > 0 ? totalLevel / classSize : 1;
        if (avgLevel > 10) {
          scaledHp *= 1 + ((avgLevel - 10) * 0.02);
        }
      }
    }
  }

  const finalHp = Math.round(scaledHp);
  await quizRef.update({ scaledMaxHp: finalHp, currentHp: finalHp });

  return { scaledMaxHp: finalHp, originalMaxHp: quiz.maxHp };
});

// ==========================================
// KNOWLEDGE-GATED LOOT
// ==========================================


// ==========================================
// SEASONAL COSMETICS
// ==========================================


// ==========================================
// DAILY CHALLENGES
// ==========================================


// ==========================================
// ONE-TIME MIGRATION — sync classXp for single-class students
// REMOVE THIS FUNCTION AFTER RUNNING
// ==========================================
export const migrateClassXp = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const dryRun = request.data?.dryRun !== false; // default true for safety

  const db = admin.firestore();

  const BATCH_SIZE = 400;
  const toUpdate: { id: string; name: string; classType: string; currentClassXp: number; totalXp: number }[] = [];

  let skippedMultiClass = 0;
  let skippedAlreadyCorrect = 0;
  let skippedNoClass = 0;
  let skippedNoXp = 0;
  let totalScanned = 0;

  let lastDoc: any = null;
  while (true) {
    let query = db.collection("users").where("role", "==", "STUDENT").limit(499);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalScanned += snapshot.size;

    snapshot.forEach(doc => {
      const data = doc.data();
      const gam = data.gamification || {};
      const totalXp: number = gam.xp || 0;
      const classXpMap: Record<string, number> = gam.classXp || {};

      const classes: string[] = data.enrolledClasses?.length
        ? data.enrolledClasses
        : data.classType ? [data.classType] : [];

      if (classes.length === 0) { skippedNoClass++; return; }
      if (classes.length > 1)   { skippedMultiClass++; return; }
      if (totalXp === 0)        { skippedNoXp++; return; }

      const singleClass = classes[0];
      const currentClassXp = classXpMap[singleClass] || 0;

      if (currentClassXp >= totalXp) { skippedAlreadyCorrect++; return; }

      toUpdate.push({
        id: doc.id,
        name: data.name || doc.id,
        classType: singleClass,
        currentClassXp,
        totalXp,
      });
    });
    if (snapshot.size < 499) break;
  }

  if (!dryRun && toUpdate.length > 0) {
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const chunk = toUpdate.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(({ id, classType, totalXp }) => {
        batch.update(db.doc(`users/${id}`), {
          [`gamification.classXp.${classType}`]: totalXp,
        });
      });
      await batch.commit();
    }
  }

  return {
    dryRun,
    totalScanned,
    updated: toUpdate.length,
    skippedMultiClass,
    skippedAlreadyCorrect,
    skippedNoClass,
    skippedNoXp,
    preview: toUpdate.slice(0, 20).map(u => ({
      name: u.name,
      classType: u.classType,
      from: u.currentClassXp,
      to: u.totalXp,
      gain: u.totalXp - u.currentClassXp,
    })),
  };
});

// ==========================================
// EMAIL NOTIFICATIONS
// ==========================================
// Uses the Firestore "mail" collection pattern, compatible with the
// Firebase Trigger Email extension (firebase/extensions-email).
// Each document in the "mail" collection is picked up by the extension
// and sent via the configured SMTP transport.
// If the extension is not installed, the documents simply sit in Firestore
// and can be processed by any external mail service.

/**
 * Helper: queue an email by writing to the "mail" collection.
 * The Firebase Trigger Email extension picks these up automatically.
 */
async function queueEmail(to: string, subject: string, html: string): Promise<void> {
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
  "assignments/{assignmentId}",
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

    logger.info(`New assignment published: "${title}" for ${classType}`);

    // Find all students enrolled in this class (paginated)
    const db = admin.firestore();
    let emailsSent = 0;
    let lastDoc: any = null;

    while (true) {
      let query = db.collection("users")
        .where("role", "==", "STUDENT")
        .where("isWhitelisted", "==", true)
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

    logger.info(`Queued ${emailsSent} emails for new assignment "${title}"`);
  },
);

/**
 * Notification: Grade Posted
 * Triggers when a submission document is updated and the score changes.
 * Emails the student that their work has been graded.
 */
export const onGradePosted = onDocumentUpdated(
  "submissions/{submissionId}",
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

    logger.info(`Grade posted for ${userId}: ${assignmentTitle} = ${newScore}`);

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

    logger.info(`Queued grade notification email for ${email}`);
  },
);

/**
 * Notification: Streak at Risk
 * Runs daily at 6 PM ET. Emails students whose engagement streak
 * hasn't been updated this week and is at risk of breaking.
 */
export const checkStreaksAtRisk = onSchedule(
  {
    schedule: "0 18 * * 5", // Every Friday at 6 PM UTC (roughly end of school week)
    timeZone: "America/New_York",
  },
  async () => {
    const db = admin.firestore();
    logger.info("Running streak-at-risk check...");

    // Get current ISO week ID
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
    const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
    const currentWeekId = `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;

    // Get all students with active streaks (paginated)
    let emailsSent = 0;
    let lastDoc: any = null;

    while (true) {
      let query = db.collection("users")
        .where("role", "==", "STUDENT")
        .where("isWhitelisted", "==", true)
        .limit(499);
      if (lastDoc) query = query.startAfter(lastDoc);
      const studentsSnap = await query.get();
      if (studentsSnap.empty) break;
      lastDoc = studentsSnap.docs[studentsSnap.docs.length - 1];

      const emailPromises: Promise<void>[] = [];

      studentsSnap.docs.forEach((doc) => {
        const data = doc.data();
        const gam = data.gamification || {};
        const streak = gam.engagementStreak as number || 0;
        const lastWeek = gam.lastStreakWeek as string || "";

        // Only warn if they have a streak >= 2 weeks and haven't engaged this week
        if (streak < 2 || lastWeek === currentWeekId) return;

        const email = data.email as string;
        if (!email) return;

        const studentName = data.name as string || "Agent";

        emailsSent++;
        emailPromises.push(
          queueEmail(
            email,
            `⚠️ Your ${streak}-week streak is at risk!`,
            `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1a0a2e; padding: 24px; border-radius: 12px;">
                <h2 style="color: #f97316; margin: 0 0 8px;">🔥 Streak Alert</h2>
                <p style="color: #e5e7eb; margin: 0 0 16px;">Hi ${studentName},</p>
                <div style="background: #0f0720; border: 1px solid #f97316; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
                  <span style="font-size: 48px; font-weight: bold; color: #f97316;">${streak}</span>
                  <p style="color: #9ca3af; margin: 4px 0 0;">week streak at risk</p>
                </div>
                <p style="color: #9ca3af; margin: 0 0 8px;">You haven't logged any engagement this week. Complete an assignment before the week ends to keep your streak alive!</p>
                <p style="color: #fbbf24; font-weight: bold; margin: 16px 0 0;">Don't lose your XP bonus — log in now!</p>
                <hr style="border: 1px solid #374151; margin: 16px 0;" />
                <p style="color: #6b7280; font-size: 12px;">Porter's Portal</p>
              </div>
            </div>
            `,
          ),
        );
      });

      // Send emails in batches of 100
      for (let i = 0; i < emailPromises.length; i += 100) {
        await Promise.all(emailPromises.slice(i, i + 100));
      }

      if (studentsSnap.size < 499) break;
    }

    logger.info(`Streak-at-risk: queued ${emailsSent} warning emails (week: ${currentWeekId})`);
  },
);

// ==========================================
// ONE-TIME BACKFILL: createdAt for assignments
// ==========================================

/**
 * Backfills `createdAt` for all assignments that are missing it,
 * using each Firestore document's native `createTime` metadata.
 * Admin-only. Safe to call multiple times (skips docs that already have createdAt).
 */
export const backfillAssignmentDates = onCall(async (request) => {
  await verifyAdmin(request.auth);

  const db = admin.firestore();

  let updated = 0;
  let skipped = 0;
  let lastDoc: any = null;

  while (true) {
    let query = db.collection("assignments").limit(499);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    lastDoc = snap.docs[snap.docs.length - 1];

    const batch = db.batch();
    let batchCount = 0;
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.createdAt) {
        skipped++;
        return;
      }
      const createTime = doc.createTime?.toDate().toISOString() ||
        new Date().toISOString();
      batch.update(doc.ref, {
        createdAt: createTime,
        updatedAt: data.updatedAt || createTime,
      });
      updated++;
      batchCount++;
    });

    if (batchCount > 0) {
      await batch.commit();
    }
    if (snap.size < 499) break;
  }

  logger.info(`backfillAssignmentDates: updated ${updated}, skipped ${skipped}`);
  return { updated, skipped };
});

/**
 * Backfills wordCount and wordsPerSecond for existing assessment submissions.
 * Counts words from blockResponses string answers and computes WPS from engagementTime.
 * Admin-only. Safe to call multiple times (skips docs that already have wordCount).
 */
export const backfillWordCount = onCall(async (request) => {
  await verifyAdmin(request.auth);

  const db = admin.firestore();

  let updated = 0;
  let skipped = 0;
  let lastDoc: any = null;

  while (true) {
    let query = db.collection("submissions")
      .where("isAssessment", "==", true)
      .limit(499);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    lastDoc = snap.docs[snap.docs.length - 1];

    // Firestore batches max 500 writes
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.metrics?.wordCount != null) {
        skipped++;
        continue;
      }

      const responses = data.blockResponses || {};
      let totalWordCount = 0;
      for (const blockId of Object.keys(responses)) {
        const answer = responses[blockId]?.answer;
        if (typeof answer === "string") {
          const trimmed = answer.trim();
          if (trimmed.length > 0) {
            totalWordCount += trimmed.split(/\s+/).length;
          }
        }
      }

      const engagementTime = data.metrics?.engagementTime || 0;
      const wordsPerSecond = engagementTime > 0 ? Math.round((totalWordCount / engagementTime) * 100) / 100 : 0;

      batch.update(doc.ref, {
        "metrics.wordCount": totalWordCount,
        "metrics.wordsPerSecond": wordsPerSecond,
      });
      updated++;
      batchCount++;

      if (batchCount >= 490) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
    if (snap.size < 499) break;
  }

  logger.info(`backfillWordCount: updated ${updated}, skipped ${skipped}`);
  return { updated, skipped };
});

// ==========================================
// FLUX SHOP — Consumable Purchases
// ==========================================

/** Server-side item catalog — must mirror client FLUX_SHOP_ITEMS */
async function createClassroomClient(accessToken: string) {
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.classroom({ version: "v1", auth: oauth2Client });
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
export const classroomListCourses = onCall({ memory: "512MiB" }, async (request) => {
  await verifyAdmin(request.auth);
  const { accessToken } = request.data;
  if (!accessToken || typeof accessToken !== "string") {
    throw new HttpsError("invalid-argument", "Missing accessToken.");
  }

  const classroom = await createClassroomClient(accessToken);
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
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("classroomListCourses error", { error: msg });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }
});

/**
 * classroomListCourseWork — List course work for a given course.
 */
export const classroomListCourseWork = onCall({ memory: "512MiB" }, async (request) => {
  await verifyAdmin(request.auth);
  const { accessToken, courseId } = request.data;
  if (!accessToken || typeof accessToken !== "string") {
    throw new HttpsError("invalid-argument", "Missing accessToken.");
  }
  if (!courseId || typeof courseId !== "string") {
    throw new HttpsError("invalid-argument", "Missing courseId.");
  }

  const classroom = await createClassroomClient(accessToken);
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
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("classroomListCourseWork error", { error: msg });
    throw new HttpsError("internal", `Classroom API error: ${msg}`);
  }
});

/**
 * classroomCreateCourseWork — Create a new assignment in Google Classroom.
 */
export const classroomCreateCourseWork = onCall({ memory: "512MiB" }, async (request) => {
  await verifyAdmin(request.auth);
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

  const classroom = await createClassroomClient(accessToken);
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
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("classroomCreateCourseWork error", { error: msg });
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
export const classroomPushGrades = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  await verifyAdmin(request.auth);
  const { accessToken, assignmentId } = request.data;
  if (!accessToken || typeof accessToken !== "string") {
    throw new HttpsError("invalid-argument", "Missing accessToken.");
  }
  if (!assignmentId || typeof assignmentId !== "string") {
    throw new HttpsError("invalid-argument", "Missing assignmentId.");
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
      const classroom = await createClassroomClient(accessToken);

      // Fetch live maxPoints for this entry
      let maxPoints: number;
      try {
        const cwRes = await classroom.courses.courseWork.get({ courseId, id: courseWorkId });
        maxPoints = cwRes.data.maxPoints ?? entry.maxPoints ?? 100;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        logger.error("Failed to fetch CourseWork from Classroom", { courseId, courseWorkId, error: msg });
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

      const portalEmails = Object.entries(emailMap).filter(([, uid]) => uid in filteredScores);
      logger.info("classroomPushGrades matching", {
        portalSection: entry.portalSection ?? "all",
        portalEmailCount: portalEmails.length,
      });

      for (const [email, userId] of portalEmails) {
        // Look up this student's submission directly by email
        let submissionId: string | undefined;
        try {
          const res = await classroom.courses.courseWork.studentSubmissions.list({
            courseId,
            courseWorkId,
            userId: email,
          });
          submissionId = res.data.studentSubmissions?.[0]?.id ?? undefined;
        } catch {
          // Student not enrolled in this Classroom course
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
              logger.warn(`Rate limited on grade push, retrying in ${delay}ms`, { email, attempt, courseId });
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

      logger.info("classroomPushGrades entry complete", {
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

  logger.info("classroomPushGrades complete", { pushed, skipped, errorCount: errors.length });
  return { pushed, skipped, errors };
  } catch (err: unknown) {
    if (err instanceof HttpsError) throw err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("classroomPushGrades unhandled error", { error: msg, stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError("internal", `Grade push failed: ${msg}`);
  }
});

// ==========================================
// ONE-TIME MIGRATION FUNCTIONS
// ==========================================

/**
 * Migrate legacy boss_encounters and boss_quizzes collections into unified boss_events.
 * Admin-only. Idempotent — safe to run multiple times (overwrites existing boss_events docs).
 */
export const migrateBossesToEvents = onCall(async (request) => {
  const uid = verifyAuth(request.auth);

  // Verify admin
  const db = admin.firestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
  const userData = userSnap.data()!;
  if (userData.role !== 'admin' && userData.role !== 'teacher') {
    throw new HttpsError("permission-denied", "Admin or teacher required.");
  }

  let migratedEncounters = 0;
  let migratedQuizzes = 0;
  let errors: string[] = [];

  // Migrate boss_encounters → BossEvent (mode: AUTO_ATTACK)
  const encounters = await db.collection('boss_encounters').get();
  for (const doc of encounters.docs) {
    const data = doc.data();
    try {
      await db.doc(`boss_events/${doc.id}`).set({
        ...data,
        mode: 'AUTO_ATTACK',
        bossName: data.name || data.bossName || 'Unknown Boss',
        rewards: data.completionRewards || data.rewards || { xp: 0, flux: 0 },
        bossAppearance: data.bossAppearance || { bossType: 'GOLEM', hue: 0 },
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      migratedEncounters++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`encounter ${doc.id}: ${msg}`);
    }
  }

  // Migrate boss_quizzes → BossEvent (mode: QUIZ)
  const quizzes = await db.collection('boss_quizzes').get();
  for (const doc of quizzes.docs) {
    const data = doc.data();
    try {
      await db.doc(`boss_events/${doc.id}`).set({
        ...data,
        mode: 'QUIZ',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      migratedQuizzes++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`quiz ${doc.id}: ${msg}`);
    }
  }

  logger.info("migrateBossesToEvents complete", {
    migratedEncounters,
    migratedQuizzes,
    errorCount: errors.length,
  });

  return { migratedEncounters, migratedQuizzes, errors: errors.slice(0, 20) };
});

/**
 * Migrate legacy boss_quiz_progress documents into unified boss_event_progress.
 * Wraps flat progress into a single attempt (attemptNumber: 1).
 * Admin-only. Idempotent.
 */
export const migrateBossQuizProgress = onCall(async (request) => {
  const uid = verifyAuth(request.auth);

  const db = admin.firestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
  const userData = userSnap.data()!;
  if (userData.role !== 'admin' && userData.role !== 'teacher') {
    throw new HttpsError("permission-denied", "Admin or teacher required.");
  }

  let migrated = 0;
  let errors: string[] = [];

  const progressDocs = await db.collection('boss_quiz_progress').get();
  for (const doc of progressDocs.docs) {
    const data = doc.data();
    try {
      const now = new Date().toISOString();
      const attempt = {
        attemptNumber: 1,
        answeredQuestions: data.answeredQuestions || [],
        currentHp: data.currentHp ?? 100,
        maxHp: data.maxHp ?? 100,
        combatStats: data.combatStats || {
          totalDamageDealt: 0,
          criticalHits: 0,
          damageReduced: 0,
          bossDamageTaken: 0,
          correctByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
          incorrectByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
          longestStreak: 0,
          currentStreak: 0,
          shieldBlocksUsed: 0,
          healingReceived: 0,
          questionsAttempted: 0,
          questionsCorrect: 0,
        },
        status: (data.currentHp ?? 100) <= 0 ? 'completed' : 'active',
        startedAt: data.lastUpdated || now,
        endedAt: (data.currentHp ?? 100) <= 0 ? data.lastUpdated || now : undefined,
      };

      await db.doc(`boss_event_progress/${doc.id}`).set({
        userId: data.userId,
        eventId: data.quizId,
        attempts: [attempt],
        totalDamageDealt: attempt.combatStats.totalDamageDealt,
        participationMet: (attempt.combatStats.questionsAttempted || 0) >= 5 && (attempt.combatStats.questionsCorrect || 0) >= 1,
        rewardClaimed: false,
        // Legacy fields preserved for safety
        answeredQuestions: data.answeredQuestions,
        currentHp: data.currentHp,
        maxHp: data.maxHp,
        combatStats: data.combatStats,
      });
      migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.id}: ${msg}`);
    }
  }

  logger.info("migrateBossQuizProgress complete", { migrated, errorCount: errors.length });
  return { migrated, errors: errors.slice(0, 20) };
});


// ==========================================
// SPECIALIZATION V1 → V2 MIGRATION
// ==========================================

const V1_SPECIALIZATIONS = ['THEORIST', 'EXPERIMENTALIST', 'ANALYST', 'DIPLOMAT'] as const;

const V1_SKILL_COSTS: Record<string, number> = {
  th_1: 1, th_2: 1, th_3: 2, th_4: 2, th_5: 3, th_6: 5,
  ex_1: 1, ex_2: 1, ex_3: 2, ex_4: 2, ex_5: 3, ex_6: 5,
  an_1: 1, an_2: 1, an_3: 2, an_4: 2, an_5: 3, an_6: 5,
  di_1: 1, di_2: 1, di_3: 2, di_4: 2, di_5: 3, di_6: 5,
};

/**
 * Migrate users from the old V1 academic specializations (THEORIST, EXPERIMENTALIST,
 * ANALYST, DIPLOMAT) to the new V2 combat system.  Refunds all spent skill points,
 * clears the old specialization and unlockedSkills, and resets the student so they
 * can pick a new combat spec and complete a trial boss like any new player.
 *
 * Admin-only. Idempotent — safe to run multiple times (already-migrated users are skipped).
 */
export const migrateSpecializationsV1ToV2 = onCall(async (request) => {
  const uid = verifyAuth(request.auth);

  const db = admin.firestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
  const userData = userSnap.data()!;
  if (userData.role !== 'admin' && userData.role !== 'teacher') {
    throw new HttpsError("permission-denied", "Admin or teacher required.");
  }

  let migrated = 0;
  let skipped = 0;
  let errors: string[] = [];

  // Firestore 'in' queries are limited to 10 values — we have 4, so we're safe.
  const usersQuery = await db
    .collection('users')
    .where('gamification.specialization', 'in', V1_SPECIALIZATIONS)
    .get();

  for (const doc of usersQuery.docs) {
    const data = doc.data();
    const gam = data.gamification || {};
    const spec = gam.specialization as string;
    const unlockedSkills: string[] = gam.unlockedSkills || [];

    try {
      // Calculate total points spent in the old system
      const spent = unlockedSkills.reduce((sum: number, skillId: string) => {
        return sum + (V1_SKILL_COSTS[skillId] || 0);
      }, 0);

      const currentSkillPoints = gam.skillPoints || 0;
      const refund = spent;

      const updates: Record<string, unknown> = {
        'gamification.specialization': admin.firestore.FieldValue.delete(),
        'gamification.unlockedSkills': admin.firestore.FieldValue.delete(),
        'gamification.skillPoints': currentSkillPoints + refund,
        'gamification.specializationMigratedAt': new Date().toISOString(),
        'gamification.specializationMigratedFrom': spec,
        'gamification.specializationMigratedRefund': refund,
      };

      // If they had no skill points field before, make sure it exists
      if (typeof gam.skillPoints === 'undefined') {
        updates['gamification.skillPoints'] = refund;
      }

      await doc.ref.update(updates);
      migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.id}: ${msg}`);
    }
  }

  // Also catch users who have V1 skills in unlockedSkills but no specialization set
  // (edge case — handle by scanning all users with unlockedSkills and checking for V1 IDs)
  const allUsersWithSkills = await db
    .collection('users')
    .where('gamification.unlockedSkills', '!=', null)
    .get();

  for (const doc of allUsersWithSkills.docs) {
    const data = doc.data();
    const gam = data.gamification || {};
    const spec = gam.specialization;
    const unlockedSkills: string[] = gam.unlockedSkills || [];

    // Skip if already handled above (has V1 specialization)
    if (V1_SPECIALIZATIONS.includes(spec)) continue;

    // Check if any skill is a V1 skill
    const hasV1Skills = unlockedSkills.some((id: string) => V1_SKILL_COSTS[id] !== undefined);
    if (!hasV1Skills) continue;

    try {
      const spent = unlockedSkills.reduce((sum: number, skillId: string) => {
        return sum + (V1_SKILL_COSTS[skillId] || 0);
      }, 0);

      const currentSkillPoints = gam.skillPoints || 0;

      const updates: Record<string, unknown> = {
        'gamification.unlockedSkills': admin.firestore.FieldValue.delete(),
        'gamification.skillPoints': currentSkillPoints + spent,
        'gamification.specializationMigratedAt': new Date().toISOString(),
        'gamification.specializationMigratedRefund': spent,
      };

      if (spec) {
        updates['gamification.specializationMigratedFrom'] = spec;
      }

      await doc.ref.update(updates);
      migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.id} (orphan): ${msg}`);
    }
  }

  logger.info("migrateSpecializationsV1ToV2 complete", {
    migrated,
    skipped,
    errorCount: errors.length,
  });

  return { migrated, skipped, errors: errors.slice(0, 20) };
});

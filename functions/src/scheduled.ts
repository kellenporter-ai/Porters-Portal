import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { verifyAdmin, generateCorrelationId, logWithCorrelation } from "./core";
import { queueEmail } from "./classroom";
import { isSchoolDay, schoolDaysInWindow } from "./schoolCalendar";

// ==========================================
// SCHEDULED FUNCTIONS
// ==========================================

// Weekly reset — Cleans up evidence locker uploads (images in Storage + Firestore docs)
// to keep storage costs down. NO other data is touched — submissions, assignments, etc.
// all persist indefinitely.
export const sundayReset = onSchedule(
  { schedule: "59 23 * * 0", timeZone: "America/New_York", memory: "1GiB", timeoutSeconds: 300 },
  async () => {
    const correlationId = generateCorrelationId();
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    logWithCorrelation('info', 'Starting weekly evidence cleanup...', correlationId);

    // 1. Delete uploaded images from Storage + Firestore docs in paginated batches
    let storageDeleted = 0;
    let count = 0;
    let lastDoc: any = null;

    while (true) {
      let evidenceSnap: FirebaseFirestore.QuerySnapshot;
      try {
        let query = db.collection("evidence").orderBy("__name__").limit(499);
        if (lastDoc) query = query.startAfter(lastDoc);
        evidenceSnap = await query.get();
      } catch (err) {
        logWithCorrelation('error', 'sundayReset: Evidence query failed, aborting.', correlationId, { error: err instanceof Error ? err.message : String(err) });
        break;
      }
      if (evidenceSnap.empty) break;

      // Delete images from Storage
      for (const docSnap of evidenceSnap.docs) {
        const data = docSnap.data();
        if (data.imageUrl) {
          try {
            const urlPath = decodeURIComponent(new URL(data.imageUrl).pathname);
            const match = urlPath.match(/\/o\/(.+)/);
            if (match) {
              try {
                await bucket.file(match[1]).delete();
                storageDeleted++;
              } catch (err) {
                logger.error("Exception swallowed", { error: err instanceof Error ? err.message : String(err), correlationId });
              }
            }
          } catch (err) {
            logger.warn("Exception swallowed", { error: err instanceof Error ? err.message : String(err), correlationId });
          }
        }
      }

      // Batch delete Firestore docs
      const chunk = db.batch();
      evidenceSnap.docs.forEach((d) => chunk.delete(d.ref));
      try {
        await chunk.commit();
        count += evidenceSnap.size;
      } catch (err) {
        logWithCorrelation('error', 'sundayReset: Batch delete failed, skipping to next batch.', correlationId, { error: err instanceof Error ? err.message : String(err) });
      }

      lastDoc = evidenceSnap.docs[evidenceSnap.docs.length - 1];
      if (evidenceSnap.size < 499) break;
    }

    logWithCorrelation('info', 'Deleted evidence images from Storage', correlationId, { storageDeleted });
    logWithCorrelation('info', 'Deleted evidence documents from Firestore', correlationId, { count });
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
  { schedule: "0 6 * * *", timeZone: "America/New_York", memory: "1GiB", timeoutSeconds: 300 },
  async () => {
    const correlationId = generateCorrelationId();
    const db = admin.firestore();
    const now = new Date();

    // Analysis window: last 7 days of submissions
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 7);
    const windowStartISO = windowStart.toISOString();

    // School-calendar awareness: count school days in the 7-day window
    const schoolDaysInWindow7 = schoolDaysInWindow(windowStartISO, now.toISOString());

    // Skip-on-vacation guard: if no school days in window, nothing meaningful to analyze
    if (schoolDaysInWindow7 === 0) {
      logWithCorrelation('info', 'dailyAnalysis: No school days in analysis window (vacation week). Skipping.', correlationId, { windowStart: windowStartISO });
      return;
    }

    logWithCorrelation('info', 'dailyAnalysis: Analyzing submissions', correlationId, { windowStart: windowStartISO, schoolDaysInWindow7 });

    // 1. Fetch all students (paginated)
    const allUserDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let lastUserDoc: any = null;
    while (true) {
      let uQuery = db.collection("users")
        .where("role", "==", "STUDENT").orderBy("__name__").limit(1000);
      if (lastUserDoc) uQuery = uQuery.startAfter(lastUserDoc);
      const uSnap = await uQuery.get();
      if (uSnap.empty) break;
      lastUserDoc = uSnap.docs[uSnap.docs.length - 1];
      allUserDocs.push(...uSnap.docs);
      if (uSnap.size < 1000) break;
    }
    if (allUserDocs.length === 0) {
      logWithCorrelation('info', 'dailyAnalysis: No students found. Skipping.', correlationId);
      return;
    }
    const usersSnap = { docs: allUserDocs, empty: false };

    // 2. Fetch recent submissions (paginated)
    const allSubDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let lastSubDoc: any = null;
    while (true) {
      let sQuery = db.collection("submissions")
        .where("submittedAt", ">=", windowStartISO).orderBy("submittedAt").limit(1000);
      if (lastSubDoc) sQuery = sQuery.startAfter(lastSubDoc);
      const sSnap = await sQuery.get();
      if (sSnap.empty) break;
      lastSubDoc = sSnap.docs[sSnap.docs.length - 1];
      allSubDocs.push(...sSnap.docs);
      if (sSnap.size < 1000) break;
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
      schoolActivityDays: Set<string>; // distinct school-day dates with submissions
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
        schoolActivityDays: new Set(),
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
      // Track distinct activity days (all days + school days only)
      if (sub.submittedAt) {
        const dateStr = String(sub.submittedAt).split("T")[0];
        existing.activityDays.add(dateStr);
        if (isSchoolDay(dateStr)) {
          existing.schoolActivityDays.add(dateStr);
        }
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
        schoolActivityDays?: number;
        minutesPerSchoolDay?: number;
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
        const schoolDays = m.schoolActivityDays.size;
        const minutesPerSchoolDay = m.totalTime / 60 / Math.max(1, schoolDaysInWindow7);

        let bucket = "ON_TRACK";
        if (m.submissionCount === 0 && m.totalTime < 60 && schoolDaysInWindow7 >= 3) {
          bucket = "INACTIVE";
        } else if (pasteRatio > 0.4 && m.submissionCount >= 2 && m.totalPastes > 8) {
          bucket = "COPYING";
        } else if (m.totalTime > 1800 && m.submissionCount >= 2 && m.totalXP < 50) {
          bucket = "STRUGGLING";
        } else if (zScore < -0.5 && schoolDays <= 1 && m.submissionCount >= 1 && m.submissionCount <= 3) {
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
            schoolActivityDays: schoolDays,
            minutesPerSchoolDay: Math.round(minutesPerSchoolDay * 10) / 10,
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

    // 6. Write bucket profiles to Firestore using deterministic IDs (overwrite-in-place)
    const timestamp = new Date().toISOString();
    const activeBucketIds = new Set<string>();

    let batch = db.batch();
    let count = 0;
    for (const profile of bucketProfiles) {
      const docId = `${profile.studentId}_${profile.classType}`;
      activeBucketIds.add(docId);
      const ref = db.collection("student_buckets").doc(docId);
      batch.set(ref, { ...profile, createdAt: timestamp });
      count++;
      if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (count % 499 !== 0) await batch.commit();

    // Cleanup: delete orphaned bucket docs for students/classes no longer present
    count = 0;
    batch = db.batch();
    let lastBucketDoc: any = null;
    while (true) {
      let bQuery = db.collection("student_buckets").orderBy("__name__").limit(1000);
      if (lastBucketDoc) bQuery = bQuery.startAfter(lastBucketDoc);
      const oldBuckets = await bQuery.get();
      if (oldBuckets.empty) break;
      lastBucketDoc = oldBuckets.docs[oldBuckets.docs.length - 1];

      for (const d of oldBuckets.docs) {
        if (!activeBucketIds.has(d.id)) {
          batch.delete(d.ref);
          count++;
          if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
        }
      }
      if (oldBuckets.size < 1000) break;
    }
    if (count % 499 !== 0) await batch.commit();

    logWithCorrelation('info', 'dailyAnalysis: Wrote bucket profiles', correlationId, { bucketProfileCount: bucketProfiles.length });

    // 7. Write alerts to Firestore (batch for efficiency)
    const finalAlerts = Array.from(deduped.values());
    if (finalAlerts.length === 0) {
      logWithCorrelation('info', 'dailyAnalysis: No at-risk students detected. Bucket profiles written.', correlationId);
      return;
    }

    // 7. Write alerts to Firestore using deterministic IDs (overwrite-in-place)
    const activeAlertIds = new Set<string>();

    batch = db.batch();
    count = 0;
    for (const alert of finalAlerts) {
      const docId = `${alert.studentId}_${alert.classType}`;
      activeAlertIds.add(docId);
      const ref = db.collection("student_alerts").doc(docId);
      batch.set(ref, {
        ...alert,
        createdAt: timestamp,
        isDismissed: false,
      });
      count++;
      if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (count % 499 !== 0) await batch.commit();

    // Cleanup: delete alert docs for students/classes no longer at-risk
    count = 0;
    batch = db.batch();
    let lastAlertDoc: any = null;
    while (true) {
      let aQuery = db.collection("student_alerts").orderBy("__name__").limit(1000);
      if (lastAlertDoc) aQuery = aQuery.startAfter(lastAlertDoc);
      const oldAlerts = await aQuery.get();
      if (oldAlerts.empty) break;
      lastAlertDoc = oldAlerts.docs[oldAlerts.docs.length - 1];

      for (const d of oldAlerts.docs) {
        if (!activeAlertIds.has(d.id)) {
          batch.delete(d.ref);
          count++;
          if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
        }
      }
      if (oldAlerts.size < 1000) break;
    }
    if (count % 499 !== 0) await batch.commit();

    logWithCorrelation('info', 'dailyAnalysis: Generated alerts', correlationId, {
      alertCount: finalAlerts.length,
      criticalCount: finalAlerts.filter((a) => a.riskLevel === "CRITICAL").length,
      highCount: finalAlerts.filter((a) => a.riskLevel === "HIGH").length,
      bucketProfileCount: bucketProfiles.length,
    });

    // ── v2: Weekly engagement snapshots (Sunday only) ──
    // Write a per-student snapshot and check for trend deterioration.
    if (now.getDay() === 0) {
      await writeWeeklySnapshots(db, correlationId, bucketProfiles, windowStartISO, now.toISOString(), schoolDaysInWindow7);
    }
  }
);

/**
 * Compute the ISO week string (YYYY-WNN) for a given Date.
 */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((d.getTime() - startOfYear.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Write weekly engagement snapshots and apply v2 trend-delta classification.
 * Called from dailyAnalysis on Sundays only.
 */
async function writeWeeklySnapshots(
  db: FirebaseFirestore.Firestore,
  correlationId: string,
  bucketProfiles: Array<{
    studentId: string;
    studentName: string;
    classType: string;
    bucket: string;
    engagementScore: number;
    metrics: {
      totalTime: number;
      submissionCount: number;
      schoolActivityDays?: number;
      minutesPerSchoolDay?: number;
      [key: string]: unknown;
    };
  }>,
  weekStartISO: string,
  weekEndISO: string,
  schoolDaysInWindow7: number,
): Promise<void> {
  const week = isoWeek(new Date(weekEndISO));
  const weekStart = weekStartISO.split("T")[0];
  const weekEnd = weekEndISO.split("T")[0];

  // Deduplicate: one snapshot per student (take the first classType profile encountered)
  const seen = new Set<string>();
  const snapshots: Array<{
    studentId: string;
    minutesPerSchoolDay: number;
    submissionCount: number;
    schoolActivityDays: number;
    weekStart: string;
    weekEnd: string;
  }> = [];

  for (const profile of bucketProfiles) {
    if (seen.has(profile.studentId)) continue;
    seen.add(profile.studentId);
    snapshots.push({
      studentId: profile.studentId,
      minutesPerSchoolDay: profile.metrics.minutesPerSchoolDay ?? 0,
      submissionCount: profile.metrics.submissionCount,
      schoolActivityDays: profile.metrics.schoolActivityDays ?? 0,
      weekStart,
      weekEnd,
    });
  }

  // Write snapshots in batch
  let batch = db.batch();
  let count = 0;
  for (const snap of snapshots) {
    const ref = db
      .collection("weeklyEngagementSnapshots")
      .doc(snap.studentId)
      .collection("snapshots")
      .doc(week);
    batch.set(ref, snap);
    count++;
    if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (count % 499 !== 0) await batch.commit();

  logWithCorrelation('info', 'weeklySnapshots: Wrote snapshots', correlationId, { count, week });

  // v2 trend-delta: for each student, read prior 4 snapshots and check for deterioration
  // Only run if there were school days this week (already guaranteed by caller, but be safe)
  if (schoolDaysInWindow7 === 0) return;

  // Collect students whose bucket should be overridden to DISENGAGING
  const overrides: Array<{ studentId: string; thisWeekMpsd: number; trailing4wAvg: number }> = [];

  await Promise.all(
    snapshots.map(async (snap) => {
      const priorSnaps = await db
        .collection("weeklyEngagementSnapshots")
        .doc(snap.studentId)
        .collection("snapshots")
        .orderBy("weekStart", "desc")
        .limit(5) // current week + 4 prior
        .get();

      // Filter out the current week to get only prior snapshots
      const priorDocs = priorSnaps.docs.filter((d) => d.id !== week);
      if (priorDocs.length < 4) return; // Not enough history yet

      const trailing4 = priorDocs.slice(0, 4);
      const trailing4wAvg =
        trailing4.reduce((sum, d) => sum + (d.data().minutesPerSchoolDay ?? 0), 0) / 4;

      if (trailing4wAvg > 5 && snap.minutesPerSchoolDay < trailing4wAvg * 0.5) {
        overrides.push({
          studentId: snap.studentId,
          thisWeekMpsd: snap.minutesPerSchoolDay,
          trailing4wAvg,
        });
      }
    })
  );

  if (overrides.length === 0) {
    logWithCorrelation('info', 'weeklySnapshots: No trend-delta overrides', correlationId);
    return;
  }

  // Apply DISENGAGING override to student_buckets documents
  batch = db.batch();
  count = 0;
  for (const override of overrides) {
    // Find all bucket docs for this student
    const bucketQuery = await db
      .collection("student_buckets")
      .where("studentId", "==", override.studentId)
      .get();

    for (const doc of bucketQuery.docs) {
      // Only override if current bucket is not already more severe
      const currentBucket = doc.data().bucket;
      const moreSevere = ["INACTIVE", "DISENGAGING"];
      if (!moreSevere.includes(currentBucket)) {
        batch.update(doc.ref, {
          bucket: "DISENGAGING",
          trendDeltaOverride: true,
          trendDeltaThisWeekMpsd: override.thisWeekMpsd,
          trendDeltaTrailing4wAvg: override.trailing4wAvg,
        });
        count++;
        if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
      }
    }
  }
  if (count % 499 !== 0) await batch.commit();

  logWithCorrelation('info', 'weeklySnapshots: Applied trend-delta overrides', correlationId, {
    overrideCount: overrides.length,
    bucketUpdates: count,
  });
}
/**
 * dismissAlert — Teacher dismisses an EWS alert.
 */
export const dismissAlert = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const correlationId = generateCorrelationId();
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

  logWithCorrelation('info', 'dismissAlert complete', correlationId, { alertId });
  return { success: true };
});
/**
 * dismissAlertsBatch — Teacher dismisses multiple EWS alerts in one call.
 */
export const dismissAlertsBatch = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const correlationId = generateCorrelationId();
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

  logWithCorrelation('info', 'dismissAlertsBatch complete', correlationId, { dismissed: alertIds.length });
  return { dismissed: alertIds.length };
});
/**
 * Notification: Streak at Risk
 * Runs daily at 6 PM ET. Emails students whose engagement streak
 * hasn't been updated this week and is at risk of breaking.
 */
export const checkStreaksAtRisk = onSchedule(
  {
    schedule: "0 18 * * 5", // Every Friday at 6 PM UTC (roughly end of school week)
    timeZone: "America/New_York",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async () => {
    const correlationId = generateCorrelationId();
    const db = admin.firestore();
    logWithCorrelation('info', 'Running streak-at-risk check...', correlationId);

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
        .orderBy("__name__")
        .limit(500);
      if (lastDoc) query = query.startAfter(lastDoc);
      const studentsSnap = await query.get();
      if (studentsSnap.empty) break;
      lastDoc = studentsSnap.docs[studentsSnap.docs.length - 1];

      const emailPromises: Promise<void>[] = [];
      const sentLogs: { ref: FirebaseFirestore.DocumentReference; userId: string }[] = [];

      // Batch-check email_log for idempotency (chunked to stay within getAll limits)
      const logRefs = studentsSnap.docs.map((d) =>
        db.collection("email_log").doc(`${d.id}_${currentWeekId}_streak_at_risk`)
      );
      const alreadySent = new Set<string>();
      for (let i = 0; i < logRefs.length; i += 10) {
        const chunk = logRefs.slice(i, i + 10);
        const chunkSnaps = await db.getAll(...chunk);
        for (let j = 0; j < chunkSnaps.length; j++) {
          if (chunkSnaps[j].exists) {
            alreadySent.add(studentsSnap.docs[i + j].id);
          }
        }
      }

      studentsSnap.docs.forEach((doc) => {
        const data = doc.data();
        const gam = data.gamification || {};
        const streak = gam.engagementStreak as number || 0;
        const lastWeek = gam.lastStreakWeek as string || "";

        // Only warn if they have a streak >= 2 weeks and haven't engaged this week
        if (streak < 2 || lastWeek === currentWeekId) return;

        const email = data.email as string;
        if (!email) return;

        // Idempotency: skip if already sent this week
        if (alreadySent.has(doc.id)) return;

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
        sentLogs.push({
          ref: db.collection("email_log").doc(`${doc.id}_${currentWeekId}_streak_at_risk`),
          userId: doc.id,
        });
      });

      // Send emails in batches of 100
      for (let i = 0; i < emailPromises.length; i += 100) {
        await Promise.all(emailPromises.slice(i, i + 100));
      }

      // Record sent emails in email_log for idempotency
      if (sentLogs.length > 0) {
        let logBatch = db.batch();
        let logCount = 0;
        for (const { ref, userId } of sentLogs) {
          logBatch.set(ref, {
            userId,
            weekId: currentWeekId,
            type: "streak_at_risk",
            sentAt: new Date().toISOString(),
          });
          logCount++;
          if (logCount % 499 === 0) { await logBatch.commit(); logBatch = db.batch(); }
        }
        if (logCount % 499 !== 0) await logBatch.commit();
      }

      if (studentsSnap.size < 500) break;
    }

    logWithCorrelation('info', 'Streak-at-risk: queued warning emails', correlationId, { emailsSent, weekId: currentWeekId });
  },
);

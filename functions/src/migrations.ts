import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { verifyAdmin } from "./core";

// ==========================================
// ONE-TIME MIGRATION — sync classXp for single-class students
// REMOVE THIS FUNCTION AFTER RUNNING
// ==========================================
export const migrateClassXp = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  await verifyAdmin(request.auth);

  // Input validation
  const { dryRun: dryRunRaw = true, ...rest } = request.data || {};
  if (Object.keys(rest).length > 0) {
    throw new HttpsError("invalid-argument", `Unexpected parameters: ${Object.keys(rest).join(", ")}`);
  }
  if (typeof dryRunRaw !== "boolean") {
    throw new HttpsError("invalid-argument", "dryRun must be a boolean.");
  }
  const dryRun = dryRunRaw !== false; // default true for safety

  const db = admin.firestore();
  const BATCH_SIZE = 400;

  let skippedMultiClass = 0;
  let skippedAlreadyCorrect = 0;
  let skippedNoClass = 0;
  let skippedNoXp = 0;
  let totalScanned = 0;
  let updated = 0;

  const preview: { name: string; classType: string; from: number; to: number; gain: number }[] = [];

  let lastDoc: any = null;
  while (true) {
    let query = db.collection("users").where("role", "==", "STUDENT").orderBy("__name__").limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalScanned += snapshot.size;

    const toUpdate: { id: string; classType: string; totalXp: number }[] = [];

    snapshot.forEach(doc => {
      if (!doc.exists) return;
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

      if (preview.length < 20) {
        preview.push({
          name: data.name || doc.id,
          classType: singleClass,
          from: currentClassXp,
          to: totalXp,
          gain: totalXp - currentClassXp,
        });
      }

      toUpdate.push({ id: doc.id, classType: singleClass, totalXp });
    });

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
        updated += chunk.length;
      }
    } else {
      updated += toUpdate.length;
    }

    if (snapshot.size < 500) break;
  }

  return {
    dryRun,
    totalScanned,
    updated,
    skippedMultiClass,
    skippedAlreadyCorrect,
    skippedNoClass,
    skippedNoXp,
    preview,
  };
});
// ==========================================
// ONE-TIME BACKFILL: createdAt for assignments
// ==========================================

/**
 * Backfills `createdAt` for all assignments that are missing it,
 * using each Firestore document's native `createTime` metadata.
 * Admin-only. Safe to call multiple times (skips docs that already have createdAt).
 */
export const backfillAssignmentDates = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  await verifyAdmin(request.auth);

  // Input validation
  const { dryRun = false, ...rest } = request.data || {};
  if (Object.keys(rest).length > 0) {
    throw new HttpsError("invalid-argument", `Unexpected parameters: ${Object.keys(rest).join(", ")}`);
  }
  if (typeof dryRun !== "boolean") {
    throw new HttpsError("invalid-argument", "dryRun must be a boolean.");
  }

  const db = admin.firestore();

  let updated = 0;
  let skipped = 0;
  let totalScanned = 0;
  let lastDoc: any = null;

  while (true) {
    let query = db.collection("assignments").orderBy("__name__").limit(499);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    lastDoc = snap.docs[snap.docs.length - 1];
    totalScanned += snap.size;

    const batch = db.batch();
    let batchCount = 0;
    snap.docs.forEach((doc) => {
      if (!doc.exists) return;
      const data = doc.data();
      if (data.createdAt) {
        skipped++;
        return;
      }
      const createTime = doc.createTime?.toDate().toISOString() ||
        new Date().toISOString();
      if (!dryRun) {
        batch.update(doc.ref, {
          createdAt: createTime,
          updatedAt: data.updatedAt || createTime,
        });
      }
      updated++;
      batchCount++;
    });

    if (!dryRun && batchCount > 0) {
      await batch.commit();
    }
    if (snap.size < 499) break;
  }

  logger.info(`backfillAssignmentDates: updated ${updated}, skipped ${skipped}, scanned ${totalScanned}, dryRun ${dryRun}`);
  return { dryRun, updated, skipped, totalScanned };
});
/**
 * Backfills wordCount and wordsPerSecond for existing assessment submissions.
 * Counts words from blockResponses string answers and computes WPS from engagementTime.
 * Admin-only. Safe to call multiple times (skips docs that already have wordCount).
 */
export const backfillWordCount = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  await verifyAdmin(request.auth);

  // Input validation
  const { dryRun = false, ...rest } = request.data || {};
  if (Object.keys(rest).length > 0) {
    throw new HttpsError("invalid-argument", `Unexpected parameters: ${Object.keys(rest).join(", ")}`);
  }
  if (typeof dryRun !== "boolean") {
    throw new HttpsError("invalid-argument", "dryRun must be a boolean.");
  }

  const db = admin.firestore();

  let updated = 0;
  let skipped = 0;
  let totalScanned = 0;
  let lastDoc: any = null;

  while (true) {
    let query = db.collection("submissions")
      .where("isAssessment", "==", true)
      .orderBy("__name__")
      .limit(499);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    lastDoc = snap.docs[snap.docs.length - 1];
    totalScanned += snap.size;

    // Firestore batches max 500 writes
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      if (!doc.exists) continue;
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

      if (!dryRun) {
        batch.update(doc.ref, {
          "metrics.wordCount": totalWordCount,
          "metrics.wordsPerSecond": wordsPerSecond,
        });
      }
      updated++;
      batchCount++;

      if (!dryRun && batchCount >= 490) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (!dryRun && batchCount > 0) {
      await batch.commit();
    }
    if (snap.size < 499) break;
  }

  logger.info(`backfillWordCount: updated ${updated}, skipped ${skipped}, scanned ${totalScanned}, dryRun ${dryRun}`);
  return { dryRun, updated, skipped, totalScanned };
});
// ==========================================
// ONE-TIME MIGRATION FUNCTIONS
// ==========================================

/**
 * Migrate legacy boss_encounters and boss_quizzes collections into unified boss_events.
 * Admin-only. Idempotent — safe to run multiple times (overwrites existing boss_events docs).
 */
export const migrateBossesToEvents = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  await verifyAdmin(request.auth);

  // Input validation
  const { dryRun = false, ...rest } = request.data || {};
  if (Object.keys(rest).length > 0) {
    throw new HttpsError("invalid-argument", `Unexpected parameters: ${Object.keys(rest).join(", ")}`);
  }
  if (typeof dryRun !== "boolean") {
    throw new HttpsError("invalid-argument", "dryRun must be a boolean.");
  }

  const db = admin.firestore();
  let migratedEncounters = 0;
  let migratedQuizzes = 0;
  let skippedExisting = 0;
  let errors: string[] = [];

  // Migrate boss_encounters → BossEvent (mode: AUTO_ATTACK)
  const encounters = await db.collection('boss_encounters').get();
  for (const doc of encounters.docs) {
    const data = doc.data();
    const targetRef = db.doc(`boss_events/${doc.id}`);
    const targetSnap = await targetRef.get();
    if (targetSnap.exists) {
      skippedExisting++;
      continue;
    }
    try {
      if (!dryRun) {
        await targetRef.set({
          ...data,
          mode: 'AUTO_ATTACK',
          bossName: data.name || data.bossName || 'Unknown Boss',
          rewards: data.completionRewards || data.rewards || { xp: 0, flux: 0 },
          bossAppearance: data.bossAppearance || { bossType: 'GOLEM', hue: 0 },
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
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
    const targetRef = db.doc(`boss_events/${doc.id}`);
    const targetSnap = await targetRef.get();
    if (targetSnap.exists) {
      skippedExisting++;
      continue;
    }
    try {
      if (!dryRun) {
        await targetRef.set({
          ...data,
          mode: 'QUIZ',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      migratedQuizzes++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`quiz ${doc.id}: ${msg}`);
    }
  }

  logger.info("migrateBossesToEvents complete", {
    dryRun,
    migratedEncounters,
    migratedQuizzes,
    skippedExisting,
    errorCount: errors.length,
  });

  return { dryRun, migratedEncounters, migratedQuizzes, skippedExisting, errors: errors.slice(0, 20) };
});
/**
 * Migrate legacy boss_quiz_progress documents into unified boss_event_progress.
 * Wraps flat progress into a single attempt (attemptNumber: 1).
 * Admin-only. Idempotent.
 */
export const migrateBossQuizProgress = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  await verifyAdmin(request.auth);

  // Input validation
  const { dryRun = false, ...rest } = request.data || {};
  if (Object.keys(rest).length > 0) {
    throw new HttpsError("invalid-argument", `Unexpected parameters: ${Object.keys(rest).join(", ")}`);
  }
  if (typeof dryRun !== "boolean") {
    throw new HttpsError("invalid-argument", "dryRun must be a boolean.");
  }

  const db = admin.firestore();
  let migrated = 0;
  let skipped = 0;
  let errors: string[] = [];

  const progressDocs = await db.collection('boss_quiz_progress').get();
  for (const doc of progressDocs.docs) {
    const data = doc.data();
    const targetRef = db.doc(`boss_event_progress/${doc.id}`);
    const targetSnap = await targetRef.get();
    if (targetSnap.exists) {
      skipped++;
      continue;
    }
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

      if (!dryRun) {
        await targetRef.set({
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
      }
      migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.id}: ${msg}`);
    }
  }

  logger.info("migrateBossQuizProgress complete", { dryRun, migrated, skipped, errorCount: errors.length });
  return { dryRun, migrated, skipped, errors: errors.slice(0, 20) };
});
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
export const migrateSpecializationsV1ToV2 = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  await verifyAdmin(request.auth);

  // Input validation
  const { dryRun = false, ...rest } = request.data || {};
  if (Object.keys(rest).length > 0) {
    throw new HttpsError("invalid-argument", `Unexpected parameters: ${Object.keys(rest).join(", ")}`);
  }
  if (typeof dryRun !== "boolean") {
    throw new HttpsError("invalid-argument", "dryRun must be a boolean.");
  }

  const db = admin.firestore();
  let migrated = 0;
  let skipped = 0;
  let errors: string[] = [];

  // Firestore 'in' queries are limited to 10 values — we have 4, so we're safe.
  const usersQuery = await db
    .collection('users')
    .where('gamification.specialization', 'in', V1_SPECIALIZATIONS)
    .get();

  for (const doc of usersQuery.docs) {
    if (!doc.exists) continue;
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

      if (!dryRun) {
        await doc.ref.update(updates);
      }
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
    .orderBy('gamification.unlockedSkills')
    .get();

  for (const doc of allUsersWithSkills.docs) {
    if (!doc.exists) continue;
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

      if (!dryRun) {
        await doc.ref.update(updates);
      }
      migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.id} (orphan): ${msg}`);
    }
  }

  logger.info("migrateSpecializationsV1ToV2 complete", {
    dryRun,
    migrated,
    skipped,
    errorCount: errors.length,
  });

  return { dryRun, migrated, skipped, errors: errors.slice(0, 20) };
});

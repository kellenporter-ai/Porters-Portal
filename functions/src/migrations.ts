import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { verifyAdmin, generateCorrelationId, logWithCorrelation } from "./core";

// ==========================================
// ONE-TIME MIGRATION — remove gamification.classXp (unified to gamification.xp)
// ==========================================
export const migrateRemoveClassXp = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  const correlationId = generateCorrelationId();
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

  let totalScanned = 0;
  let wouldRemove = 0;
  let removed = 0;
  const discrepancies: { uid: string; totalXp: number; classXpSum: number }[] = [];
  const preview: string[] = [];

  let lastDoc: any = null;
  while (true) {
    let query = db.collection("users").orderBy("__name__").limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalScanned += snapshot.size;

    const toRemove: string[] = [];

    snapshot.forEach(doc => {
      if (!doc.exists) return;
      const data = doc.data();
      const gam = data.gamification || {};
      const classXpMap: Record<string, number> = gam.classXp;
      if (!classXpMap || typeof classXpMap !== "object" || Array.isArray(classXpMap)) return;

      const totalXp: number = typeof gam.xp === "number" ? gam.xp : 0;
      const classXpSum = Object.values(classXpMap).reduce(
        (sum: number, v) => sum + (typeof v === "number" ? v : 0), 0);

      if (classXpSum > totalXp) {
        discrepancies.push({ uid: doc.id, totalXp, classXpSum });
      }

      if (preview.length < 20) preview.push(doc.id);
      toRemove.push(doc.id);
    });

    wouldRemove += toRemove.length;

    if (!dryRun && toRemove.length > 0) {
      for (let i = 0; i < toRemove.length; i += BATCH_SIZE) {
        const chunk = toRemove.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        chunk.forEach((id) => {
          batch.update(db.doc(`users/${id}`), {
            "gamification.classXp": admin.firestore.FieldValue.delete(),
          });
        });
        await batch.commit();
        removed += chunk.length;
      }
    }

    if (snapshot.size < 500) break;
  }

  logWithCorrelation('info', 'migrateRemoveClassXp complete', correlationId, {
    dryRun,
    totalScanned,
    wouldRemove,
    removed,
    discrepancyCount: discrepancies.length,
    previewCount: preview.length,
  });
  return {
    dryRun,
    totalScanned,
    wouldRemove,
    removed,
    discrepancyCount: discrepancies.length,
    discrepancies: discrepancies.slice(0, 50),
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
  const correlationId = generateCorrelationId();
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

  logWithCorrelation('info', 'backfill complete', correlationId, { updated, skipped, totalScanned, dryRun });
  return { dryRun, updated, skipped, totalScanned };
});
/**
 * Backfills wordCount and wordsPerSecond for existing assessment submissions.
 * Counts words from blockResponses string answers and computes WPS from engagementTime.
 * Admin-only. Safe to call multiple times (skips docs that already have wordCount).
 */
export const backfillWordCount = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  const correlationId = generateCorrelationId();
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

  logWithCorrelation('info', 'backfill complete', correlationId, { updated, skipped, totalScanned, dryRun });
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
  const correlationId = generateCorrelationId();
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

  logWithCorrelation('info', 'migrateBossesToEvents complete', correlationId, {
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
  const correlationId = generateCorrelationId();
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

  logWithCorrelation('info', 'migrateBossQuizProgress complete', correlationId, { dryRun, migrated, skipped, errorCount: errors.length });
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
  const correlationId = generateCorrelationId();
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

  logWithCorrelation('info', 'migrateSpecializationsV1ToV2 complete', correlationId, {
    dryRun,
    migrated,
    skipped,
    errorCount: errors.length,
  });

  return { dryRun, migrated, skipped, errors: errors.slice(0, 20) };
});

// ==========================================
// PHASE 1e — assignment answer keys → assignment_keys
// ==========================================

const ASSIGNMENT_KEY_FIELDS = ["correctAnswer", "acceptedAnswers", "sortItems", "items"] as const;

interface AssignmentKeyBlock { id?: string; type?: string; [key: string]: unknown }

function extractAssignmentKeyBlock(block: AssignmentKeyBlock): AssignmentKeyBlock {
  const key: AssignmentKeyBlock = { id: block.id, type: block.type };
  for (const field of ASSIGNMENT_KEY_FIELDS) {
    if (block[field] !== undefined) key[field] = block[field];
  }
  return key;
}

/**
 * Moves answer keys out of `assignments/{id}.lessonBlocks` into the
 * admin-only `assignment_keys/{id}` collection (Phase 1e).
 *
 * For each assignment doc:
 *  1. Builds a key-only lessonBlocks array (correctAnswer / acceptedAnswers /
 *     sortItems / RANKING items[]) and writes it to assignment_keys/{id}.
 *  2. Rewrites assignments/{id}.lessonBlocks with key fields stripped
 *     (sortItems[].correct blanked; RANKING items[] removed).
 *
 * Idempotent: assignments with no key fields in any block are skipped, and
 * re-running after a successful pass finds nothing to strip. Safe to call
 * multiple times. dryRun defaults to true. Admin-only.
 *
 * NOTE: grading stays correct before, during, and after this migration —
 * resolveGradingBlocks in assessment.ts prefers assignment_keys and falls
 * back to inline keys (lib/gradingKeys.ts merge logic).
 */
export const migrateAssignmentKeys = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);

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

  let totalScanned = 0;
  let migrated = 0;
  let skippedNoKeys = 0;
  let skippedMissingBlocks = 0;
  const errors: string[] = [];
  const preview: Array<{ id: string; blocks: number; keyFields: string[] }> = [];

  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query: admin.firestore.Query = db.collection("assignments").orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalScanned += snapshot.size;

    interface PendingDoc {
      ref: admin.firestore.DocumentReference;
      keysRef: admin.firestore.DocumentReference;
      keyBlocks: AssignmentKeyBlock[];
      safeBlocks: AssignmentKeyBlock[];
      keyFields: string[];
      blockCount: number;
    }
    const pending: PendingDoc[] = [];

    for (const docSnap of snapshot.docs) {
      try {
        const data = docSnap.data();
        const blocks = data.lessonBlocks;
        if (!Array.isArray(blocks) || blocks.length === 0) {
          skippedMissingBlocks++;
          continue;
        }

        let hasKeys = false;
        const keyFields = new Set<string>();
        const keyBlocks: AssignmentKeyBlock[] = [];
        const safeBlocks: AssignmentKeyBlock[] = [];

        for (const rawBlock of blocks as AssignmentKeyBlock[]) {
          const block = rawBlock || {};
          const key = extractAssignmentKeyBlock(block);
          for (const field of ASSIGNMENT_KEY_FIELDS) {
            if (key[field] !== undefined) { hasKeys = true; keyFields.add(field); }
          }
          keyBlocks.push(key);

          const restBlock = { ...block };
          delete restBlock.correctAnswer;
          delete restBlock.acceptedAnswers;
          if (Array.isArray(restBlock.sortItems)) {
            restBlock.sortItems = (restBlock.sortItems as Array<{ text: string; correct: string }>).map((si) => ({
              text: si.text,
              correct: "",
            }));
          }
          if (restBlock.type === "RANKING") {
            // The ordered items[] array IS the ranking answer key.
            delete restBlock.items;
          }
          safeBlocks.push(restBlock);
        }

        if (!hasKeys) { skippedNoKeys++; continue; }

        if (preview.length < 20) {
          preview.push({ id: docSnap.id, blocks: blocks.length, keyFields: Array.from(keyFields) });
        }
        pending.push({
          ref: docSnap.ref,
          keysRef: db.doc(`assignment_keys/${docSnap.id}`),
          keyBlocks,
          safeBlocks,
          keyFields: Array.from(keyFields),
          blockCount: blocks.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${docSnap.id}: ${msg}`);
      }
    }

    if (!dryRun && pending.length > 0) {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const chunk = pending.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const p of chunk) {
          batch.set(p.keysRef, {
            lessonBlocks: p.keyBlocks,
            updatedAt: new Date().toISOString(),
          });
          batch.update(p.ref, { lessonBlocks: p.safeBlocks });
        }
        await batch.commit();
        migrated += chunk.length;
      }
    } else {
      migrated += pending.length;
    }

    if (snapshot.size < 500) break;
  }

  logWithCorrelation('info', 'migrateAssignmentKeys complete', correlationId, {
    dryRun,
    totalScanned,
    migrated,
    skippedNoKeys,
    skippedMissingBlocks,
    errorCount: errors.length,
  });

  return { dryRun, totalScanned, migrated, skippedNoKeys, skippedMissingBlocks, errors: errors.slice(0, 20), preview };
});

/**
 * Phase 2a — moves heavy payload fields (htmlContent, lessonBlocks) out of
 * `assignments/{id}` into `assignment_content/{id}` so the assignments list
 * listener stays metadata-only. Content written verbatim (Phase 1e already
 * stripped answer keys from lessonBlocks). Idempotent; dryRun default true.
 * Readers stay correct before/during/after via dataService.getAssignmentContent
 * (prefers assignment_content, falls back to inline).
 */
export const migrateAssignmentContent = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);

  const { dryRun: dryRunRaw = true, ...rest } = request.data || {};
  if (Object.keys(rest).length > 0) {
    throw new HttpsError("invalid-argument", `Unexpected parameters: ${Object.keys(rest).join(", ")}`);
  }
  if (typeof dryRunRaw !== "boolean") {
    throw new HttpsError("invalid-argument", "dryRun must be a boolean.");
  }
  const dryRun = dryRunRaw !== false;

  const db = admin.firestore();
  const BATCH_SIZE = 400;

  let totalScanned = 0;
  let migrated = 0;
  let skippedAlreadyMigrated = 0;
  const errors: string[] = [];
  const preview: Array<{ id: string; htmlBytes: number; blockCount: number }> = [];

  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query: admin.firestore.Query = db.collection("assignments").orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalScanned += snapshot.size;

    const pending: Array<{
      ref: admin.firestore.DocumentReference;
      contentRef: admin.firestore.DocumentReference;
      content: Record<string, unknown>;
      blockCount: number;
    }> = [];

    for (const docSnap of snapshot.docs) {
      try {
        const data = docSnap.data();
        const hasHtml = typeof data.htmlContent === "string" && data.htmlContent.length > 0;
        const hasBlocks = Array.isArray(data.lessonBlocks) && data.lessonBlocks.length > 0;
        if (!hasHtml && !hasBlocks) { skippedAlreadyMigrated++; continue; }

        const htmlContent = typeof data.htmlContent === "string" ? data.htmlContent : "";
        const lessonBlocks = Array.isArray(data.lessonBlocks) ? data.lessonBlocks : [];
        if (preview.length < 20) {
          preview.push({ id: docSnap.id, htmlBytes: htmlContent.length, blockCount: lessonBlocks.length });
        }
        pending.push({
          ref: docSnap.ref,
          contentRef: db.doc(`assignment_content/${docSnap.id}`),
          content: { htmlContent, lessonBlocks, updatedAt: new Date().toISOString() },
          blockCount: lessonBlocks.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${docSnap.id}: ${msg}`);
      }
    }

    if (!dryRun && pending.length > 0) {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const chunk = pending.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const p of chunk) {
          batch.set(p.contentRef, p.content);
          batch.update(p.ref, {
            htmlContent: admin.firestore.FieldValue.delete(),
            lessonBlocks: admin.firestore.FieldValue.delete(),
            // Preserve the count on the metadata doc so list UIs (badges,
            // lesson-only categorization, up-next progress) work post-split.
            blockCount: p.blockCount,
          });
        }
        await batch.commit();
        migrated += chunk.length;
      }
    } else {
      migrated += pending.length;
    }

    if (snapshot.size < 500) break;
  }

  logWithCorrelation('info', 'migrateAssignmentContent complete', correlationId, {
    dryRun,
    totalScanned,
    migrated,
    skippedAlreadyMigrated,
    errorCount: errors.length,
  });

  return { dryRun, totalScanned, migrated, skippedAlreadyMigrated, errors: errors.slice(0, 20), preview };
});

// ==========================================
// ONE-TIME MIGRATION — normalize equipment slot vocab to uppercase
// ==========================================

const SLOT_VOCAB_MAP: Record<string, string> = {
  helmet: "HEAD",
  head: "HEAD",
  chest: "CHEST",
  gloves: "HANDS",
  hands: "HANDS",
  boots: "FEET",
  feet: "FEET",
  belt: "BELT",
  weapon: "WEAPON",
  accessory1: "RING",
  accessory2: "AMULET",
  mount: "MOUNT",
};

function normalizeSlotVocab(slot: string): string {
  if (!slot) return slot;
  if (SLOT_VOCAB_MAP[slot]) return SLOT_VOCAB_MAP[slot];
  const upper = slot.toUpperCase();
  if (SLOT_VOCAB_MAP[upper.toLowerCase()]) return SLOT_VOCAB_MAP[upper.toLowerCase()];
  if (upper === "RING1" || upper === "RING2") return "RING";
  if (upper === "WEAPON1" || upper === "WEAPON2") return "WEAPON";
  return upper;
}

interface SlotItem { slot?: string; [key: string]: unknown }

/**
 * Rewrites legacy lowercase equipment slot keys to canonical uppercase
 * EquipmentSlot/ItemSlot vocab in:
 *   - gamification.classProfiles.*.equipped  (map keys + item.slot)
 *   - gamification.classProfiles.*.inventory (item.slot)
 *   - gamification.equipped / gamification.inventory (legacy top-level)
 *
 * Mount items are normalized to slot "MOUNT" and kept in data (loadout UI
 * hides them). Admin-only. Idempotent — already-canonical docs are skipped.
 * dryRun defaults to true. Uses pagination + 400-write batches.
 */
export const migrateSlotVocabulary = onCall({ memory: "1GiB", timeoutSeconds: 300 }, async (request) => {
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);

  const { dryRun: dryRunRaw = true, ...rest } = request.data || {};
  if (Object.keys(rest).length > 0) {
    throw new HttpsError("invalid-argument", `Unexpected parameters: ${Object.keys(rest).join(", ")}`);
  }
  if (typeof dryRunRaw !== "boolean") {
    throw new HttpsError("invalid-argument", "dryRun must be a boolean.");
  }
  const dryRun = dryRunRaw !== false;

  const db = admin.firestore();
  const BATCH_SIZE = 400;

  let totalScanned = 0;
  let docsUpdated = 0;
  let itemsRewritten = 0;
  let keysRewritten = 0;
  const errors: string[] = [];
  const preview: string[] = [];

  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query: admin.firestore.Query = db.collection("users").orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    totalScanned += snapshot.size;

    const pending: Array<{ ref: admin.firestore.DocumentReference; updates: Record<string, unknown> }> = [];

    for (const docSnap of snapshot.docs) {
      try {
        const data = docSnap.data();
        const gam = data.gamification;
        if (!gam || typeof gam !== "object") continue;

        const updates: Record<string, unknown> = {};
        let docChanged = false;

        // Helper: normalize an items array; returns new array if any slot changed.
        const normalizeItems = (items: SlotItem[]): { arr: SlotItem[]; changed: number } | null => {
          if (!Array.isArray(items)) return null;
          let changed = 0;
          const arr = items.map((it) => {
            if (!it || typeof it.slot !== "string" || !it.slot) return it;
            const norm = normalizeSlotVocab(it.slot);
            if (norm !== it.slot) { changed++; return { ...it, slot: norm }; }
            return it;
          });
          return { arr, changed };
        };

        // Helper: normalize an equipped map; returns new map if any key/slot changed.
        const normalizeEquippedMap = (equipped: Record<string, SlotItem>): { map: Record<string, SlotItem>; keysChanged: number; slotsChanged: number } | null => {
          if (!equipped || typeof equipped !== "object" || Array.isArray(equipped)) return null;
          let keysChanged = 0;
          let slotsChanged = 0;
          const map: Record<string, SlotItem> = {};
          for (const [key, item] of Object.entries(equipped)) {
            if (!item) continue;
            const normKey = normalizeSlotVocab(key);
            if (normKey !== key) keysChanged++;
            let newItem = item;
            if (typeof item.slot === "string" && item.slot) {
              const normSlot = normalizeSlotVocab(item.slot);
              if (normSlot !== item.slot) { slotsChanged++; newItem = { ...item, slot: normSlot }; }
            }
            map[normKey] = newItem;
          }
          return { map, keysChanged, slotsChanged };
        };

        // 1) Per-class profiles
        const classProfiles: Record<string, { equipped?: Record<string, SlotItem>; inventory?: SlotItem[] }> = gam.classProfiles;
        if (classProfiles && typeof classProfiles === "object" && !Array.isArray(classProfiles)) {
          for (const [classType, profile] of Object.entries(classProfiles)) {
            if (!profile || typeof profile !== "object") continue;
            const base = `gamification.classProfiles.${classType}`;

            const eqNorm = normalizeEquippedMap(profile.equipped || {});
            if (eqNorm && (eqNorm.keysChanged > 0 || eqNorm.slotsChanged > 0)) {
              updates[`${base}.equipped`] = eqNorm.map;
              keysRewritten += eqNorm.keysChanged;
              itemsRewritten += eqNorm.slotsChanged;
              docChanged = true;
            }

            const invNorm = normalizeItems(profile.inventory || []);
            if (invNorm && invNorm.changed > 0) {
              updates[`${base}.inventory`] = invNorm.arr;
              itemsRewritten += invNorm.changed;
              docChanged = true;
            }
          }
        }

        // 2) Legacy top-level fields
        const legacyEq = normalizeEquippedMap(gam.equipped || {});
        if (legacyEq && (legacyEq.keysChanged > 0 || legacyEq.slotsChanged > 0)) {
          updates["gamification.equipped"] = legacyEq.map;
          keysRewritten += legacyEq.keysChanged;
          itemsRewritten += legacyEq.slotsChanged;
          docChanged = true;
        }
        const legacyInv = normalizeItems(gam.inventory || []);
        if (legacyInv && legacyInv.changed > 0) {
          updates["gamification.inventory"] = legacyInv.arr;
          itemsRewritten += legacyInv.changed;
          docChanged = true;
        }

        if (docChanged) {
          if (preview.length < 20) preview.push(docSnap.id);
          pending.push({ ref: docSnap.ref, updates });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${docSnap.id}: ${msg}`);
      }
    }

    if (!dryRun && pending.length > 0) {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const chunk = pending.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const p of chunk) {
          batch.update(p.ref, p.updates);
        }
        await batch.commit();
        docsUpdated += chunk.length;
      }
    } else {
      docsUpdated += pending.length;
    }

    if (snapshot.size < 500) break;
  }

  logWithCorrelation('info', 'migrateSlotVocabulary complete', correlationId, {
    dryRun,
    totalScanned,
    docsUpdated,
    itemsRewritten,
    keysRewritten,
    errorCount: errors.length,
  });

  return { dryRun, totalScanned, docsUpdated, itemsRewritten, keysRewritten, errors: errors.slice(0, 20), preview };
});

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  verifyAuth,
  verifyAdmin,
  calculateServerStats,
  deriveCombatStats,
  calculateBossDamage,
  calculateServerGearScore,
  buildXPUpdates,
  generateCorrelationId,
  logWithCorrelation,
} from "./core";
import { checkAndUnlockAchievements, writeAchievementNotifications } from "./achievements";
import { generateLoot } from "./gamification-items";

// ==========================================
// DAILY LOGIN REWARD
// ==========================================

const BOSS_SHARD_COUNT = 10; // Supports ~10 concurrent writes/sec
export const dealBossDamage = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
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
  let { damage: calculatedDamage, isCrit } = calculateBossDamage(stats, gearScore);
  // Server-side damage cap based on player level
  const maxDamageCap = Math.max(10, (gam.level || 1) * 100);
  calculatedDamage = Math.min(calculatedDamage, maxDamageCap);

  // Step 3: Write damage to a random shard (distributed counter)
  const shardId = Math.floor(Math.random() * BOSS_SHARD_COUNT).toString();
  const shardRef = db.doc(`boss_encounters/${bossId}/shards/${shardId}`);
  const logRef = db.collection(`boss_encounters/${bossId}/damage_log`).doc();
  const xpReward = boss.xpRewardPerHit || 10;

  // Step 4: Atomic transaction for shard + user updates
  const txResult = await db.runTransaction(async (t) => {
    const latestUserDoc = await t.get(userRef);
    if (!latestUserDoc.exists) throw new HttpsError("not-found", "User not found.");
    const latestUserData = latestUserDoc.data()!;
    const latestActiveClass = classType || latestUserData.classType || '';
    const latestXpResult = buildXPUpdates(latestUserData, xpReward, latestActiveClass);

    t.set(shardRef, {
      damageDealt: admin.firestore.FieldValue.increment(calculatedDamage),
    }, { merge: true });

    t.set(logRef, {
      userId: uid,
      userName: userName || "Student",
      damage: calculatedDamage,
      isCrit,
      timestamp: new Date().toISOString(),
    });

    t.update(userRef, {
      ...latestXpResult.updates,
      [`gamification.bossDamageDealt.${bossId}`]: admin.firestore.FieldValue.increment(calculatedDamage),
    });

    return { leveledUp: latestXpResult.leveledUp };
  });

  // Step 5: Read all shards to calculate current HP + sync boss document
  const shardsSnap = await db.collection(`boss_encounters/${bossId}/shards`).orderBy("__name__").limit(BOSS_SHARD_COUNT).get();
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
        let logQuery = db.collection(`boss_encounters/${bossId}/damage_log`).orderBy("__name__").limit(499);
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

      // Batch-read contributor docs in chunks of 30
      const contributorIdArray = Array.from(contributorIds);
      const contributorDataMap = new Map<string, any>();
      for (const chunk of chunkArray(contributorIdArray, 30)) {
        const chunkSnap = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
        chunkSnap.forEach(doc => {
          contributorDataMap.set(doc.id, doc.data());
        });
      }

      // Batch-write rewards in chunks of 500
      const defaultBossClass = boss.classType && boss.classType !== 'GLOBAL' ? boss.classType : null;
      for (const chunk of chunkArray(contributorIdArray, 500)) {
        const batch = db.batch();
        const notificationPromises: Promise<void>[] = [];
        for (const contributorId of chunk) {
          const contribData = contributorDataMap.get(contributorId);
          if (!contribData) continue;
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
            const contribClass = defaultBossClass || contribData.classType;
            if (contribClass && contribClass !== "Uncategorized" && contribGam.classProfiles?.[contribClass]) {
              const inv = contribGam.classProfiles[contribClass].inventory || [];
              contribUpdates[`gamification.classProfiles.${contribClass}.inventory`] = [...inv, loot];
            } else {
              const inv = contribGam.inventory || [];
              contribUpdates["gamification.inventory"] = [...inv, loot];
            }
          }

          contribUpdates["gamification.bossesDefeated"] = (contribGam.bossesDefeated || 0) + 1;
          const { rewardUpdates: bossAchievementUpdates, newUnlocks: bossNewUnlocks } =
            checkAndUnlockAchievements(contribData, contribUpdates);
          Object.assign(contribUpdates, bossAchievementUpdates);

          if (Object.keys(contribUpdates).length > 0) {
            batch.update(db.doc(`users/${contributorId}`), contribUpdates);
          }
          if (bossNewUnlocks.length > 0) {
            notificationPromises.push(writeAchievementNotifications(db, contributorId, bossNewUnlocks));
          }
        }
        try {
          await batch.commit();
        } catch (err) {
          logWithCorrelation('error', 'Failed to commit contributor reward batch', correlationId, { bossId, error: err instanceof Error ? err.message : String(err) });
        }
        if (notificationPromises.length > 0) {
          try {
            await Promise.all(notificationPromises);
          } catch (err) {
            logWithCorrelation('error', 'Failed to write achievement notifications', correlationId, { bossId, error: err instanceof Error ? err.message : String(err) });
          }
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
    leveledUp: txResult.leveledUp,
    stats: { tech: stats.tech, focus: stats.focus, analysis: stats.analysis, charisma: stats.charisma },
    gearScore,
  };
});

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
// ==========================================
// UNIFIED BOSS EVENT v2 (attempt-based, topic mastery, new damage formula)
// ==========================================

// ==========================================
// ASYNC BOSS MODEL (Increment 1, Piece 2)
// Per-student boss HP on boss_event_progress/{uid}_{eventId}.
// Combat math imported from ./boss-combat.js — do not reimplement.
// ==========================================

import {
  computeBossMaxHp,
  computeCorrectHit,
  computeBossAttack,
  computePlayerEhp,
} from "./boss-combat.js";

const KOOLDOWN_MS = 6 * 60 * 60 * 1000; // knockout cooldown: 6 hours
const MEDEVAC_WINDOW_MS = 24 * 60 * 60 * 1000; // global medevac escalator window

export const MEDEVAC_COSTS = [50, 100, 150, 250, 400];

/** Pure: cost of the NEXT medevac given how many have been purchased (global counter). */
export function getMedevacCost(medevacCount: number): number {
  const idx = Math.min(Math.max(0, Math.floor(medevacCount)), MEDEVAC_COSTS.length - 1);
  return MEDEVAC_COSTS[idx];
}

export interface MedevacStateInput {
  now: number;
  medevacCount?: number;
  medevacResetAt?: number | string | null;
}

export interface MedevacState {
  nextCount: number;
  cost: number;
  /** Epoch ms when the global escalator window resets (undefined = no anchor needed). */
  resetAt?: number;
}

/**
 * Pure: medevac escalator state for a purchase.
 * - Fresh user (no count, or window expired/missing): anchor purchase → count 1, cost 50, new 24h window.
 * - Mid-window: increment count, cost = ladder[count], window NOT extended.
 */
export function computeMedevacState(input: MedevacStateInput): MedevacState {
  const count = typeof input.medevacCount === "number" && input.medevacCount > 0 ? input.medevacCount : 0;
  const resetAtRaw = typeof input.medevacResetAt === "string" ? Date.parse(input.medevacResetAt) : input.medevacResetAt;
  const windowActive = typeof resetAtRaw === "number" && !Number.isNaN(resetAtRaw) && input.now < resetAtRaw;

  if (!windowActive) {
    return { nextCount: 1, cost: getMedevacCost(0), resetAt: input.now + MEDEVAC_WINDOW_MS };
  }
  return { nextCount: count + 1, cost: getMedevacCost(count), resetAt: resetAtRaw };
}

export interface StudentQuestion {
  id: string;
  stem: string;
  options: string[];
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topicId?: string;
  damageBonus?: number;
  [key: string]: unknown;
}

/** Strip answer keys before a question reaches the client. */
export function toStudentQuestion(q: Record<string, unknown> | undefined): StudentQuestion | null {
  if (!q || typeof q !== "object") return null;
  const { correctAnswer: _ca, explanation: _ex, ...rest } = q as Record<string, unknown>;
  return {
    id: String(rest.id ?? ""),
    stem: String(rest.stem ?? ""),
    options: Array.isArray(rest.options) ? (rest.options as string[]) : [],
    difficulty: (rest.difficulty as "EASY" | "MEDIUM" | "HARD") ?? "MEDIUM",
    ...(rest.topicId !== undefined ? { topicId: rest.topicId as string } : {}),
    ...(rest.damageBonus !== undefined ? { damageBonus: rest.damageBonus as number } : {}),
  };
}

/** Defense in depth for Piece 5: event doc minus questions[].correctAnswer/explanation. */
export function stripBossEventForClient(event: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!event || typeof event !== "object") return null;
  const out: Record<string, unknown> = { ...event };
  if (Array.isArray(out.questions)) {
    out.questions = (out.questions as Record<string, unknown>[]).map((q) => {
      if (!q || typeof q !== "object") return q;
      const { correctAnswer: _ca, explanation: _ex, ...rest } = q;
      return rest;
    });
  }
  return out;
}

interface BossEventQuestion {
  id: string;
  stem: string;
  options: string[];
  correctAnswer: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topicId?: string;
  damageBonus?: number;
}

interface BossProgress {
  userId?: string;
  eventId?: string;
  bossMaxHp?: number;
  bossHp?: number;
  cooldownUntil?: string | null;
  session?: { id: string; playerHp: number; playerMaxHp: number; streak: number; startedAt: string } | null;
  victoryClaimed?: boolean;
  knockoutCount?: number;
  answeredQuestionIds?: string[];
  answeredCount?: number;
  correctCount?: number;
  // legacy fields (read-only): attempts, totalDamageDealt, participationMet, rewardClaimed
  attempts?: unknown[];
  [key: string]: unknown;
}

function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Shared equipment/stat derivation for the async boss model. */
function derivePlayerLoadout(userData: FirebaseFirestore.DocumentData, eventClassType: unknown) {
  const gam = (userData.gamification || {}) as Record<string, any>;
  const activeClass = (eventClassType as string) || userData.classType || "";
  const profile = gam.classProfiles?.[activeClass];
  const equipped = profile?.equipped || gam.equipped || {};
  const stats = calculateServerStats(equipped);
  const gearScore = calculateServerGearScore(equipped);
  const combat = deriveCombatStats(stats);
  return { gam, activeClass, equipped, stats, gearScore, combat };
}

function isWindowOpen(event: { scheduledAt?: string; deadline?: string }, now: number): boolean {
  const start = event.scheduledAt ? Date.parse(event.scheduledAt) : 0;
  const end = event.deadline ? Date.parse(event.deadline) : Number.POSITIVE_INFINITY;
  if (!Number.isNaN(start) && now < start) return false;
  if (!Number.isNaN(end) && now > end) return false;
  return true;
}

/**
 * Async boss answer handler. Per-student boss HP, knockout cooldown, flat victory payout.
 * Replaces the shared-pool shard model. `timeTakenMs` is accepted for API compatibility
 * but no longer affects damage (speed bonus deleted).
 */
export const answerBossEvent = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
  const { eventId, questionId, answer, timeTakenMs: _timeTakenMs } = request.data;
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

  const event = eventSnap.data() as Record<string, any>;
  if (!event.isActive) throw new HttpsError("failed-precondition", "Event is not active.");

  const now = Date.now();
  if (!isWindowOpen(event, now)) {
    return { error: "EVENT_CLOSED", message: "This boss event is not currently open." };
  }

  const questions: BossEventQuestion[] = event.questions || [];
  const question = questions.find((q) => q.id === questionId);
  if (!question) throw new HttpsError("not-found", "Question not found.");

  const userData = userSnap.data()!;
  const loadout = derivePlayerLoadout(userData, event.classType);
  const { gam } = loadout;

  // Pre-transaction structured rejections (client-renderable)
  const progress = (progressSnap.exists ? progressSnap.data() : {}) as BossProgress;
  if (progress.victoryClaimed) {
    return { error: "ALREADY_VICTORIOUS", message: "You have already defeated this boss." };
  }
  const cooldownUntil = progress.cooldownUntil ? Date.parse(progress.cooldownUntil) : 0;
  if (!Number.isNaN(cooldownUntil) && cooldownUntil > now) {
    return {
      error: "COOLDOWN_ACTIVE",
      cooldownUntil: progress.cooldownUntil,
      medevacCost: getMedevacCost(gam.medevacCount || 0),
    };
  }
  if ((progress.answeredQuestionIds || []).includes(questionId)) {
    return { alreadyAnswered: true, correct: false, damage: 0, bossHp: progress.bossHp ?? 0 };
  }

  const isCorrect = Number(answer) === question.correctAnswer;
  const rand = Math.random();
  const critRoll = Math.random();

  const txResult = await db.runTransaction(async (t) => {
    // All reads first
    const [latestEventDoc, latestUserDoc, latestProgressDoc] = await Promise.all([
      t.get(eventRef), t.get(userRef), t.get(progressRef),
    ]);
    if (!latestEventDoc.exists) throw new HttpsError("not-found", "Event not found.");
    if (!latestUserDoc.exists) throw new HttpsError("not-found", "User not found.");

    const latestEvent = latestEventDoc.data() as Record<string, any>;
    if (!latestEvent.isActive) throw new HttpsError("failed-precondition", "Event is not active.");
    const txNow = Date.now();
    if (!isWindowOpen(latestEvent, txNow)) {
      return { error: "EVENT_CLOSED" as const };
    }

    const latestUserData = latestUserDoc.data()!;
    const latestLoadout = derivePlayerLoadout(latestUserData, latestEvent.classType);
    const latestGam = latestLoadout.gam;

    const latestProgress = (latestProgressDoc.exists ? latestProgressDoc.data() : {}) as BossProgress;

    // Re-check guards inside the transaction (concurrency-safe)
    if (latestProgress.victoryClaimed) {
      return { error: "ALREADY_VICTORIOUS" as const };
    }
    const cdUntil = latestProgress.cooldownUntil ? Date.parse(latestProgress.cooldownUntil) : 0;
    if (!Number.isNaN(cdUntil) && cdUntil > txNow) {
      return {
        error: "COOLDOWN_ACTIVE" as const,
        cooldownUntil: latestProgress.cooldownUntil,
        medevacCost: getMedevacCost(latestGam.medevacCount || 0),
      };
    }
    if ((latestProgress.answeredQuestionIds || []).includes(questionId)) {
      return { alreadyAnswered: true as const, correct: false, damage: 0, bossHp: latestProgress.bossHp ?? 0 };
    }

    // Initialize / migrate progress. Legacy docs (shared-pool era) start the student
    // at full personal HP — prior shared damage is treated as irrelevant.
    const isNewProgress = !latestProgressDoc.exists || typeof latestProgress.bossMaxHp !== "number";
    const bossMaxHp = isNewProgress
      ? computeBossMaxHp(latestLoadout.gearScore, latestLoadout.stats)
      : (latestProgress.bossMaxHp as number);
    const bossHp = isNewProgress ? bossMaxHp : Math.max(0, latestProgress.bossHp as number);

    // Session: reuse the active one, or open a fresh one
    let session = latestProgress.session || null;
    if (session && (!session.playerMaxHp || session.playerHp === undefined)) session = null;
    if (!session) {
      session = {
        id: newSessionId(),
        playerHp: latestLoadout.combat.maxHp,
        playerMaxHp: latestLoadout.combat.maxHp,
        streak: 0,
        startedAt: new Date(txNow).toISOString(),
      };
    }

    let newBossHp = bossHp;
    let newStreak = session.streak || 0;
    let playerHp = session.playerHp;
    let damage = 0;
    let isCrit = false;

    if (isCorrect) {
      const hit = computeCorrectHit({
        gearScore: latestLoadout.gearScore,
        stats: latestLoadout.stats,
        difficulty: question.difficulty,
        streak: session.streak || 0,
        rand,
        critRoll,
        bossMaxHp,
      });
      damage = hit.damage;
      isCrit = hit.isCrit;
      newBossHp = Math.max(0, bossHp - damage);
      newStreak = (session.streak || 0) + 1;
    } else {
      const ehp = computePlayerEhp({
        maxHp: session.playerMaxHp || latestLoadout.combat.maxHp,
        armorPercent: latestLoadout.combat.armorPercent,
      });
      const attack = computeBossAttack({ stats: latestLoadout.stats, playerEhp: ehp });
      damage = attack.damage;
      playerHp = Math.max(0, (session.playerHp || 0) - attack.damage);
      newStreak = 0;
    }

    // Knockout
    let knockedOut = false;
    let newCooldownUntil: string | null = latestProgress.cooldownUntil || null;
    let knockoutCount = latestProgress.knockoutCount || 0;
    let newSession: BossProgress["session"] = session;
    if (!isCorrect && playerHp <= 0) {
      knockedOut = true;
      newSession = null;
      newCooldownUntil = new Date(txNow + KOOLDOWN_MS).toISOString();
      knockoutCount += 1;
    } else {
      newSession = { ...session, playerHp: playerHp as number, playerMaxHp: session.playerMaxHp || latestLoadout.combat.maxHp, streak: newStreak };
    }

    // Victory payout (ported from v1 dealBossDamage, per-student, same transaction)
    let victory = false;
    let pendingAchievementUnlocks: string[] = [];
    const userUpdates: Record<string, any> = {};
    if (newBossHp <= 0 && !latestProgress.victoryClaimed) {
      victory = true;
      const rewards = (latestEvent.completionRewards || {}) as Record<string, any>;
      const rewardXp = rewards.xp || 0;
      const rewardFlux = rewards.flux || 0;
      const rewardItemRarity = rewards.itemRarity || null;

      if (rewardXp > 0) {
        const xpRes = buildXPUpdates(latestUserData, rewardXp, latestLoadout.activeClass);
        Object.assign(userUpdates, xpRes.updates);
      }
      if (rewardFlux > 0) {
        const baseCurrency = userUpdates["gamification.currency"] ?? (latestGam.currency || 0);
        userUpdates["gamification.currency"] = baseCurrency + rewardFlux;
      }
      if (rewardItemRarity) {
        const loot = generateLoot(latestGam.level || 1, rewardItemRarity);
        const bossClass = latestEvent.classType && latestEvent.classType !== "GLOBAL" ? latestEvent.classType : null;
        const lootClass = bossClass || latestUserData.classType;
        if (lootClass && lootClass !== "Uncategorized" && latestGam.classProfiles?.[lootClass]) {
          const inv = latestGam.classProfiles[lootClass].inventory || [];
          userUpdates[`gamification.classProfiles.${lootClass}.inventory`] = [...inv, loot];
        } else {
          const inv = latestGam.inventory || [];
          userUpdates["gamification.inventory"] = [...inv, loot];
        }
      }
      userUpdates["gamification.bossesDefeated"] = (latestGam.bossesDefeated || 0) + 1;
      const { rewardUpdates: achievementUpdates, newUnlocks } = checkAndUnlockAchievements(latestUserData, userUpdates);
      Object.assign(userUpdates, achievementUpdates);
      userUpdates["gamification.bossesDefeated"] = (latestGam.bossesDefeated || 0) + 1; // guard against achievement-rewrite
      pendingAchievementUnlocks = newUnlocks;
    }

    // Plain display counter: increment once per student per event
    const isFirstAnswer = (latestProgress.answeredQuestionIds || []).length === 0;
    if (isFirstAnswer) {
      t.update(eventRef, { participantCount: admin.firestore.FieldValue.increment(1) });
    }

    if (Object.keys(userUpdates).length > 0) {
      t.update(userRef, userUpdates);
    }

    // Progress write (legacy `attempts` field is no longer written)
    const answeredQuestionIds = [...(latestProgress.answeredQuestionIds || []), questionId];
    t.set(progressRef, {
      userId: uid,
      eventId,
      bossMaxHp,
      bossHp: newBossHp,
      cooldownUntil: newCooldownUntil,
      session: newSession,
      victoryClaimed: latestProgress.victoryClaimed || victory,
      knockoutCount,
      answeredQuestionIds,
      answeredCount: (latestProgress.answeredCount || 0) + 1,
      correctCount: (latestProgress.correctCount || 0) + (isCorrect ? 1 : 0),
    }, { merge: true });

    return {
      correct: isCorrect,
      damage,
      isCrit,
      bossHp: newBossHp,
      bossMaxHp,
      playerHp: newSession ? newSession.playerHp : 0,
      playerMaxHp: (newSession ? newSession.playerMaxHp : session.playerMaxHp) || latestLoadout.combat.maxHp,
      knockedOut,
      cooldownUntil: newCooldownUntil,
      victory,
      streak: newStreak,
      newUnlocks: pendingAchievementUnlocks,
    };
  });

  if ("error" in txResult && txResult.error) {
    if (txResult.error === "ALREADY_VICTORIOUS") {
      return { error: "ALREADY_VICTORIOUS", message: "You have already defeated this boss." };
    }
    if (txResult.error === "COOLDOWN_ACTIVE") {
      return txResult;
    }
    return { error: "EVENT_CLOSED", message: "This boss event is not currently open." };
  }
  if ("alreadyAnswered" in txResult && txResult.alreadyAnswered) {
    return txResult;
  }

  // Achievement notifications AFTER the transaction resolves (no side effects in tx callback)
  if (txResult.newUnlocks && txResult.newUnlocks.length > 0) {
    try {
      await writeAchievementNotifications(db, uid, txResult.newUnlocks);
    } catch (err) {
      logWithCorrelation("error", "Failed to write achievement notifications", correlationId, {
        uid, eventId, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Topic mastery tracking (outside transaction, best-effort)
  if (question.topicId) {
    try {
      const masteryData = gam.topicMastery || {};
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
      await userRef.update({ [`gamification.topicMastery.${question.topicId}`]: currentMastery });
    } catch (err) {
      logWithCorrelation("error", "Failed to update topic mastery", correlationId, {
        uid, eventId, topicId: question.topicId, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return txResult;
});

// ==========================================
// ADAPTIVE QUESTION SELECTION
// ==========================================

export const getNextBossQuestion = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  generateCorrelationId();
  const { eventId } = request.data;
  if (!eventId) {
    throw new HttpsError("invalid-argument", "Event ID required.");
  }

  const db = admin.firestore();
  const eventRef = db.doc(`boss_events/${eventId}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);
  const userRef = db.doc(`users/${uid}`);

  const [eventSnap, progressSnap, userSnap] = await Promise.all([
    eventRef.get(), progressRef.get(), userRef.get(),
  ]);

  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
  const event = eventSnap.data() as Record<string, any>;
  if (!event.isActive) throw new HttpsError("failed-precondition", "Event is not active.");

  const now = Date.now();
  if (!isWindowOpen(event, now)) {
    return { error: "EVENT_CLOSED", message: "This boss event is not currently open." };
  }

  const userData = userSnap.data()!;
  const loadout = derivePlayerLoadout(userData, event.classType);
  const gam = loadout.gam;

  // Bootstrap the progress doc if missing (cold start) or legacy (no bossMaxHp snapshot).
  const existing = progressSnap.exists ? (progressSnap.data() as BossProgress) : null;
  if (!existing || typeof existing.bossMaxHp !== "number") {
    const bossMaxHp = computeBossMaxHp(loadout.gearScore, loadout.stats);
    const bootstrap: BossProgress = {
      userId: uid,
      eventId,
      bossMaxHp,
      bossHp: bossMaxHp,
      cooldownUntil: null,
      session: null,
      victoryClaimed: false,
      knockoutCount: 0,
      answeredQuestionIds: [],
      answeredCount: 0,
      correctCount: 0,
    };
    await progressRef.set(bootstrap, { merge: true });
    return {
      question: null,
      bossHp: bossMaxHp,
      bossMaxHp,
      playerHp: loadout.combat.maxHp,
      playerMaxHp: loadout.combat.maxHp,
      knockoutCount: 0,
      victoryClaimed: false,
      cooldownUntil: null,
      medevacCost: getMedevacCost(gam.medevacCount || 0),
      remainingCount: (event.questions || []).length,
      attemptStats: { accuracy: null, correct: 0, attempted: 0 },
      message: "Boss encounter initialized.",
    };
  }

  const progress = existing;

  // Cooldown state so the client can render the knockout screen without a second call
  const cooldownUntil = progress.cooldownUntil ? Date.parse(progress.cooldownUntil) : 0;
  if (!Number.isNaN(cooldownUntil) && cooldownUntil > now) {
    return {
      question: null,
      cooldownActive: true,
      cooldownUntil: progress.cooldownUntil,
      medevacCost: getMedevacCost(gam.medevacCount || 0),
      bossHp: progress.bossHp ?? 0,
      bossMaxHp: progress.bossMaxHp,
      knockoutCount: progress.knockoutCount || 0,
      victoryClaimed: !!progress.victoryClaimed,
    };
  }

  if (progress.victoryClaimed) {
    return {
      question: null,
      complete: true,
      victoryClaimed: true,
      message: "You have already defeated this boss!",
      bossHp: 0,
      bossMaxHp: progress.bossMaxHp,
    };
  }

  const questions: BossEventQuestion[] = event.questions || [];
  const answeredIds = new Set<string>(progress.answeredQuestionIds || []);
  const remaining = questions.filter((q) => !answeredIds.has(q.id));

  if (remaining.length === 0) {
    return {
      question: null,
      complete: true,
      message: "All questions answered!",
      bossHp: progress.bossHp ?? 0,
      bossMaxHp: progress.bossMaxHp,
      victoryClaimed: !!progress.victoryClaimed,
    };
  }

  // --- Adaptive selection (accuracy band + topic diversity penalty) ---
  const answeredCount = progress.answeredCount || 0;
  const correctCount = progress.correctCount || 0;
  const accuracy = answeredCount > 0 ? correctCount / answeredCount : 0.5;

  let targetDifficulties: ("EASY" | "MEDIUM" | "HARD")[];
  if (accuracy > 0.85) targetDifficulties = ["HARD", "MEDIUM"];
  else if (accuracy < 0.55) targetDifficulties = ["EASY", "MEDIUM"];
  else targetDifficulties = ["MEDIUM", "EASY", "HARD"];

  const recentTopics: Record<string, number> = {};
  for (const qid of (progress.answeredQuestionIds || []).slice(-5)) {
    const q = questions.find((x) => x.id === qid);
    if (q?.topicId) recentTopics[q.topicId] = (recentTopics[q.topicId] || 0) + 1;
  }

  const scored = remaining.map((q) => {
    let score = Math.random();
    const diffIdx = targetDifficulties.indexOf(q.difficulty);
    if (diffIdx === 0) score += 2.0;
    else if (diffIdx === 1) score += 1.0;
    if (q.topicId && recentTopics[q.topicId]) {
      score -= recentTopics[q.topicId] * 0.5;
    }
    return { q, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored[0].q;

  const nextRemaining = remaining.filter((q) => q.id !== selected.id);
  let bossIntent = null;
  if (nextRemaining.length > 0) {
    const nextQ = nextRemaining[0];
    bossIntent = {
      type: "channel",
      warningText: "Channeling...",
      icon: "⚡",
      targetSubject: nextQ.topicId,
    };
  }

  const session = progress.session || null;

  return {
    question: toStudentQuestion(selected as unknown as Record<string, unknown>),
    bossIntent,
    remainingCount: remaining.length - 1,
    bossHp: progress.bossHp ?? 0,
    bossMaxHp: progress.bossMaxHp,
    playerHp: session ? session.playerHp : loadout.combat.maxHp,
    playerMaxHp: session ? session.playerMaxHp : loadout.combat.maxHp,
    streak: session ? session.streak || 0 : 0,
    cooldownUntil: progress.cooldownUntil || null,
    medevacCost: getMedevacCost(gam.medevacCount || 0),
    attemptStats: {
      accuracy: Math.round(accuracy * 100),
      correct: correctCount,
      attempted: answeredCount,
    },
  };
});

// ==========================================
// MEDEVAC
// ==========================================

export const medevacBoss = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
  const { eventId } = request.data;
  if (!eventId) throw new HttpsError("invalid-argument", "Event ID required.");

  const db = admin.firestore();
  const eventRef = db.doc(`boss_events/${eventId}`);
  const userRef = db.doc(`users/${uid}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);

  const [eventSnap, userSnap, progressSnap] = await Promise.all([
    eventRef.get(), userRef.get(), progressRef.get(),
  ]);

  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
  if (!progressSnap.exists) throw new HttpsError("not-found", "No boss progress found for this event.");

  const progress = progressSnap.data() as BossProgress;
  const now = Date.now();
  const cooldownUntil = progress.cooldownUntil ? Date.parse(progress.cooldownUntil) : 0;
  if (Number.isNaN(cooldownUntil) || cooldownUntil <= now) {
    return { error: "NO_ACTIVE_COOLDOWN", message: "You are not on a knockout cooldown." };
  }

  const txResult = await db.runTransaction(async (t) => {
    // All reads first
    const [latestUserDoc, latestProgressDoc] = await Promise.all([t.get(userRef), t.get(progressRef)]);
    if (!latestUserDoc.exists) throw new HttpsError("not-found", "User not found.");
    if (!latestProgressDoc.exists) throw new HttpsError("not-found", "No boss progress found for this event.");

    const latestUserData = latestUserDoc.data()!;
    const latestGam = (latestUserData.gamification || {}) as Record<string, any>;
    const latestProgress = latestProgressDoc.data() as BossProgress;

    const txNow = Date.now();
    const cd = latestProgress.cooldownUntil ? Date.parse(latestProgress.cooldownUntil) : 0;
    if (Number.isNaN(cd) || cd <= txNow) {
      return { error: "NO_ACTIVE_COOLDOWN" as const };
    }

    const state = computeMedevacState({
      now: txNow,
      medevacCount: latestGam.medevacCount,
      medevacResetAt: latestGam.medevacResetAt,
    });

    const balance = latestGam.currency || 0;
    if (balance < state.cost) {
      return { error: "INSUFFICIENT_FLUX" as const, cost: state.cost, balance };
    }

    // All writes after all reads
    const userUpdates: Record<string, any> = {
      "gamification.currency": balance - state.cost,
      "gamification.medevacCount": state.nextCount,
    };
    if (state.resetAt !== undefined) {
      userUpdates["gamification.medevacResetAt"] = state.resetAt;
    }
    t.update(userRef, userUpdates);
    t.update(progressRef, { cooldownUntil: null });

    return {
      success: true as const,
      cost: state.cost,
      remainingFlux: balance - state.cost,
      nextCost: getMedevacCost(state.nextCount),
      resetsAt: state.resetAt !== undefined ? state.resetAt : (latestGam.medevacResetAt ?? null),
    };
  });

  if ("error" in txResult && txResult.error) {
    return txResult;
  }
  logWithCorrelation("info", "medevacBoss: success", correlationId, { uid, eventId, cost: txResult.cost });
  return txResult;
});

// ==========================================
// SPECIALIZATION TRIALS
// ==========================================

export const startSpecializationTrial = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
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
    try {
      await progressRef.delete();
    } catch (err) {
      logWithCorrelation('warn', 'Exception swallowed', correlationId, { error: err instanceof Error ? err.message : String(err) });
    }
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

export const completeSpecializationTrial = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  generateCorrelationId();
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


export const scaleBossHp = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);

  const { quizId } = request.data;
  if (!quizId) throw new HttpsError("invalid-argument", "Quiz ID required.");

  const db = admin.firestore();
  const quizRef = db.doc(`boss_quizzes/${quizId}`);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) throw new HttpsError("not-found", "Quiz not found.");

  const quiz = quizSnap.data()!;
  if (!quiz.maxHp || quiz.maxHp <= 0) {
    logWithCorrelation('warn', 'scaleBossHp: quiz has invalid maxHp', correlationId, { quizId, maxHp: quiz.maxHp });
    throw new HttpsError("invalid-argument", `Quiz has invalid maxHp: ${quiz.maxHp}`);
  }
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
  await db.runTransaction(async (t) => {
    const latestSnap = await t.get(quizRef);
    if (!latestSnap.exists) throw new HttpsError("not-found", "Quiz not found.");
    t.update(quizRef, { scaledMaxHp: finalHp, currentHp: finalHp });
  });

  return { scaledMaxHp: finalHp, originalMaxHp: quiz.maxHp };
});

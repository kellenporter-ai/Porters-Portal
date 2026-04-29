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
export const dealBossDamage = onCall(async (request) => {
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
    leveledUp: xpResult.leveledUp,
    stats: { tech: stats.tech, focus: stats.focus, analysis: stats.analysis, charisma: stats.charisma },
    gearScore,
  };
});

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

const BOSS_EVENT_SHARD_COUNT = 10;
const BOSS_EVENT_MAX_ATTEMPTS = 3;

/**
 * Unified boss event answer handler.
 * Supports attempt-based progress, topic mastery tracking, and the new Pokemon-style damage formula.
 */
export const answerBossEvent = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
  const { eventId, questionId, answer, timeTakenMs = 30000 } = request.data;
  if (!eventId || !questionId || answer === undefined) {
    throw new HttpsError("invalid-argument", "Event ID, question ID, and answer required.");
  }

  const db = admin.firestore();
  const eventRef = db.doc(`boss_events/${eventId}`);
  const userRef = db.doc(`users/${uid}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);

  // Initial reads for calculation
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

  if (!progress.attempts) progress.attempts = [];

  let currentAttempt = progress.attempts.find((a: { status: string }) => a.status === 'active');
  if (!currentAttempt) {
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

  const mods: { type: string; value?: number }[] = event.modifiers || [];
  if (hasMod(mods, "ARMOR_BREAK") || hasMod(mods, "GLASS_CANNON")) armorPercent = 0;
  if (hasMod(mods, "CRIT_SURGE")) critChance = Math.min(1, critChance + modVal(mods, "CRIT_SURGE", 20) / 100);

  const playerRole = derivePlayerRole(playerAttrStats);
  if (playerRole === 'STRIKER') {
    critChance = Math.min(1, critChance + 0.10);
    adjustedCritMultiplier += 0.5;
  }

  const activeAbilities: { abilityId: string; effect: string; value: number; remainingQuestions: number }[] = event.activeAbilities || [];
  let silenced = false;
  let enrageMultiplier = 1;
  for (const ability of activeAbilities) {
    if (ability.effect === 'SILENCE' && ability.remainingQuestions > 0) silenced = true;
    if (ability.effect === 'ENRAGE' && ability.remainingQuestions > 0) enrageMultiplier = 1 + (ability.value / 100);
  }

  let playerHp = currentAttempt.currentHp >= 0 ? currentAttempt.currentHp : maxHp;
  if (playerHp <= 0) {
    return { knockedOut: true, message: "You have been knocked out! Start a new attempt or visit Study Hall." };
  }

  const cs = currentAttempt.combatStats || {
    totalDamageDealt: 0, criticalHits: 0, damageReduced: 0, bossDamageTaken: 0,
    correctByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
    incorrectByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
    longestStreak: 0, currentStreak: 0, shieldBlocksUsed: 0,
    healingReceived: 0, questionsAttempted: 0, questionsCorrect: 0,
  };
  cs.questionsAttempted++;

  const isCorrect = Number(answer) === question.correctAnswer;
  let damage = 0;
  let playerDamage = 0;
  let isCrit = false;
  let healAmount = 0;
  let shieldBlocked = false;

  // Pre-compute random values outside transaction
  const shardId = Math.floor(Math.random() * BOSS_EVENT_SHARD_COUNT).toString();
  const critRoll = Math.random();

  const topicMasteryMap = gam.topicMastery || {};
  const topicMastery = topicMasteryMap[question.topicId]?.level || 0;

  if (isCorrect) {
    cs.questionsCorrect++;
    cs.currentStreak++;
    if (cs.currentStreak > cs.longestStreak) cs.longestStreak = cs.currentStreak;
    cs.correctByDifficulty[question.difficulty as "EASY" | "MEDIUM" | "HARD"]++;

    const levelComponent = (2 * (gam.level || 1) / 5 + 2);
    const power = 10 + (question.difficulty === 'HARD' ? 3 : question.difficulty === 'MEDIUM' ? 2 : 1) * 5;
    const attack = 50 + topicMastery * 100;
    const defense = 50 + (question.difficulty === 'HARD' ? 3 : question.difficulty === 'MEDIUM' ? 2 : 1) * 10;
    let rawDamage = ((levelComponent * power * attack / defense) / 50 + 2);

    let modifier = 1.0;
    if (topicMastery > 0) modifier *= (1 + 0.1 * topicMastery);
    if (timeTakenMs < 30000 * 0.5) modifier *= 1.2;
    if (cs.currentStreak >= 3) modifier *= (1 + 0.1 * Math.min(cs.currentStreak, 10));
    if (playerRole === 'VANGUARD') modifier *= 1.15;
    if (playerRole === 'STRIKER') modifier *= 1.05;

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

    const gearBonus = 1 + (playerGearScore / 1000) / (1 + playerGearScore / 2000);
    modifier *= gearBonus;
    modifier *= (0.9 + Math.random() * 0.2);

    rawDamage = Math.round(rawDamage * modifier);

    if (!silenced && critRoll < critChance) {
      isCrit = true;
      rawDamage = Math.round(rawDamage * adjustedCritMultiplier);
      cs.criticalHits++;
    }

    const effectiveMaxHp = event.scaledMaxHp || event.maxHp;
    const perHitCap = Math.floor(effectiveMaxHp * 0.05);
    damage = Math.min(rawDamage, perHitCap);
    damage = Math.max(1, damage);

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

  if (hasMod(mods, "TIME_PRESSURE")) {
    const tickDmg = modVal(mods, "TIME_PRESSURE", 5);
    playerHp = Math.max(0, playerHp - tickDmg);
    cs.bossDamageTaken += tickDmg;
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

  // === ATOMIC TRANSACTION ===
  const txResult = await db.runTransaction(async (t) => {
    const [latestEventDoc, latestProgressDoc, latestUserDoc] = await Promise.all([
      t.get(eventRef), t.get(progressRef), t.get(userRef),
    ]);

    if (!latestEventDoc.exists) throw new HttpsError("not-found", "Event not found.");
    if (!latestUserDoc.exists) throw new HttpsError("not-found", "User not found.");

    const latestEvent = latestEventDoc.data()!;
    if (!latestEvent.isActive) throw new HttpsError("failed-precondition", "Event is not active.");

    // Apply participantCount scaling with latest event data
    const participantCount = latestEvent.participantCount || 0;
    const drMultiplier = Math.min(1.0, Math.sqrt(10 / Math.max(10, participantCount + 1)));
    const bossArmor = Math.min(50, Math.max(0, (participantCount - 10) * 2));
    damage = Math.max(1, Math.round(damage * drMultiplier));
    damage = Math.max(1, Math.round(damage * (1 - bossArmor / 100)));

    cs.totalDamageDealt += damage;
    currentAttempt.combatStats = { ...cs, role: playerRole };

    const latestProgress = latestProgressDoc.exists ? latestProgressDoc.data()! : { attempts: [] };
    if (!latestProgress.attempts) latestProgress.attempts = [];
    const latestAttempt = latestProgress.attempts.find((a: { status: string }) => a.status === 'active');
    if (latestAttempt?.answeredQuestions?.includes(questionId)) {
      return { alreadyAnswered: true, correct: false, damage: 0, newHp: latestEvent.currentHp || latestEvent.scaledMaxHp || latestEvent.maxHp };
    }

    const shardsSnap = await t.get(db.collection(`boss_events/${eventId}/shards`));
    let totalDamage = 0;
    shardsSnap.forEach(d => { totalDamage += d.data().damageDealt || 0; });

    const shardRef = db.doc(`boss_events/${eventId}/shards/${shardId}`);
    t.set(shardRef, { damageDealt: admin.firestore.FieldValue.increment(damage) }, { merge: true });

    const logRef = db.collection(`boss_events/${eventId}/damage_log`).doc();
    t.set(logRef, {
      userId: uid, userName: userData.name || "Student", damage, isCrit,
      timestamp: new Date().toISOString(), attemptNumber: currentAttempt.attemptNumber,
    });

    const xpResult = buildXPUpdates(latestUserDoc.data()!, damage, activeClass);
    t.update(userRef, xpResult.updates);

    const isFirstAnswerInTx = !latestAttempt || latestAttempt.answeredQuestions.length === 0;
    if (isFirstAnswerInTx) {
      t.update(eventRef, { participantCount: admin.firestore.FieldValue.increment(1) });
    }

    if (playerRole === 'COMMANDER' && isCorrect) {
      const allProgressSnap = await t.get(
        db.collection("boss_event_progress")
          .where("eventId", "==", eventId)
          .where("currentHp", ">", 0)
          .limit(10)
      );
      const allies = allProgressSnap.docs
        .map(d => d.id)
        .filter(id => id !== `${uid}_${eventId}`)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);
      for (const allyProgressId of allies) {
        const allyRef = db.doc(`boss_event_progress/${allyProgressId}`);
        t.update(allyRef, { currentHp: admin.firestore.FieldValue.increment(5) });
      }
      cs.roleHealingGiven = (cs.roleHealingGiven || 0) + (allies.length * 5);
    }

    const updatedAttempts = [...latestProgress.attempts];
    const attemptIdx = updatedAttempts.findIndex((a: { status: string }) => a.status === 'active');
    if (attemptIdx >= 0) {
      updatedAttempts[attemptIdx] = currentAttempt;
    } else {
      updatedAttempts.push(currentAttempt);
    }

    t.set(progressRef, {
      userId: uid, eventId,
      attempts: updatedAttempts,
      totalDamageDealt: (latestProgress.totalDamageDealt || 0) + damage,
      participationMet: updatedAttempts.some((a: { answeredQuestions: string[]; combatStats: { questionsCorrect: number } }) =>
        a.answeredQuestions.length >= 5 && (a.combatStats?.questionsCorrect || 0) >= 1
      ),
    }, { merge: true });

    const effectiveMaxHp = latestEvent.scaledMaxHp || latestEvent.maxHp;
    const newTotalDamage = totalDamage + damage;
    const newHp = Math.max(0, effectiveMaxHp - newTotalDamage);

    let phaseTransition: { phase: number; name: string; dialogue?: string; newAppearance?: unknown } | null = null;
    const phases = latestEvent.phases || [];
    const currentPhase = latestEvent.currentPhase || 0;

    if (phases.length > 0) {
      const hpPercent = (newHp / effectiveMaxHp) * 100;
      for (let i = phases.length - 1; i > currentPhase; i--) {
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
    }

    let bossDefeated = false;
    if (newHp <= 0 && latestEvent.isActive) {
      t.update(eventRef, { isActive: false, currentHp: 0 });
      bossDefeated = true;
    } else {
      t.update(eventRef, { currentHp: newHp });
    }

    return { newHp, bossDefeated, phaseTransition, isFirstAnswerForPlayer: isFirstAnswerInTx };
  });

  if (txResult.alreadyAnswered) {
    return txResult;
  }

  // --- Topic mastery tracking (outside transaction) ---
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
      logWithCorrelation('error', 'Failed to update topic mastery', correlationId, { uid, eventId, topicId: question.topicId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- Adaptive difficulty ---
  const attemptAccuracy = cs.questionsAttempted > 0 ? cs.questionsCorrect / cs.questionsAttempted : 0;
  let nextDifficulty: 'EASY' | 'MEDIUM' | 'HARD' = question.difficulty;
  if (attemptAccuracy > 0.85) nextDifficulty = 'HARD';
  else if (attemptAccuracy < 0.55) nextDifficulty = 'EASY';
  else nextDifficulty = 'MEDIUM';

  // --- Boss intent for next question ---
  let nextBossIntent: { type: string; warningText: string; icon: string; targetSubject?: string } | null = null;
  if (!txResult.bossDefeated && playerHp > 0) {
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
    correct: isCorrect, damage, newHp: txResult.newHp, bossDefeated: txResult.bossDefeated,
    playerDamage, playerHp, playerMaxHp: maxHp,
    knockedOut: playerHp <= 0,
    isCrit, healAmount, shieldBlocked,
    playerRole,
    attemptNumber: currentAttempt.attemptNumber,
    attemptsRemaining: BOSS_EVENT_MAX_ATTEMPTS - progress.attempts.filter((a: { status: string }) => a.status !== 'active').length,
    phaseTransition: txResult.phaseTransition,
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
  const event = eventSnap.data()!;
  if (!event.isActive) throw new HttpsError("failed-precondition", "Event is not active.");

  // Verify user is participating in this event
  if (!progressSnap.exists) {
    throw new HttpsError("permission-denied", "You are not participating in this event.");
  }

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

export const completeSpecializationTrial = onCall(async (request) => {
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


export const scaleBossHp = onCall(async (request) => {
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

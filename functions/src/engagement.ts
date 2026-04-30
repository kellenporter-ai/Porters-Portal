import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  verifyAuth,
  buildXPUpdates,
  getProfilePaths,
  getProfileData,
  getActiveXPMultiplier,
  DEFAULT_XP_PER_MINUTE,
  MAX_XP_PER_SUBMISSION,
  ENGAGEMENT_COOLDOWN_MS,
  TelemetryThresholds,
  calculateFeedbackServerSide,
  generateCorrelationId,
  logWithCorrelation,
} from "./core";
import {
  generateLoot,
  FLUX_COSTS,
  pick,
} from "./gamification-items";
import { LootItem } from "./core";
import { checkAndUnlockAchievements } from "./achievements";

function assertEnrolled(userData: Record<string, unknown>, classType: string): void {
  const enrolledClasses: string[] = (userData.enrolledClasses as string[]) || [];
  if (!enrolledClasses.includes(classType) && userData.classType !== classType) {
    throw new HttpsError("permission-denied", "Not enrolled in this class.");
  }
}

// ==========================================
// START RESOURCE SESSION — Server-observed open timestamp
// ==========================================
// Lightweight session tracking for non-assessment resources.
// Provides a server-observed startedAt for elapsed-time validation
// and gates lesson_block_responses writes at the Firestore rules layer.
export const startResourceSession = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { assignmentId } = request.data;
  if (!assignmentId) {
    throw new HttpsError("invalid-argument", "Missing assignmentId");
  }

  const db = admin.firestore();
  const sessionId = `${uid}_${assignmentId}`;
  const sessionRef = db.collection("resource_sessions").doc(sessionId);
  const correlationId = generateCorrelationId();

  // Reuse existing session (crash recovery / page refresh)
  const existing = await sessionRef.get();
  if (existing.exists) {
    const data = existing.data()!;
    const startedAt = data.startedAt?.toMillis?.() || Number(data.startedAt) || Date.now();
    logWithCorrelation("info", "startResourceSession: reused existing", correlationId, { uid, assignmentId });
    return { sessionToken: sessionId, startedAt };
  }

  await sessionRef.set({
    userId: uid,
    assignmentId,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logWithCorrelation("info", "startResourceSession: created", correlationId, { uid, assignmentId });
  return { sessionToken: sessionId, startedAt: Date.now() };
});

// ==========================================
// SUBMIT ENGAGEMENT — Server-side XP calculation
// ==========================================
// Replaces client-side `minutes * 10` calculation.
// Validates metrics, caps XP, prevents rapid re-submissions.
// v2: adds server-elapsed clamping and assistiveTech context.
export const submitEngagement = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { assignmentId, assignmentTitle, metrics, classType, sessionToken } = request.data;

  if (!assignmentId || !metrics) {
    throw new HttpsError("invalid-argument", "Missing assignmentId or metrics.");
  }

  const correlationId = generateCorrelationId();
  const db = admin.firestore();

  // Validate metrics are reasonable
  const engagementTime = Number(metrics.engagementTime) || 0;
  const keystrokes = Number(metrics.keystrokes) || 0;
  const pasteCount = Number(metrics.pasteCount) || 0;
  const clickCount = Number(metrics.clickCount) || 0;
  const tabSwitchCount = Number(metrics.tabSwitchCount) || 0;

  // Server-side elapsed validation (v2)
  let serverElapsedSec = 0;
  if (sessionToken) {
    const sessionSnap = await db.collection("resource_sessions").doc(sessionToken).get();
    if (sessionSnap.exists) {
      const startedAt = sessionSnap.data()!.startedAt;
      const startedMs = startedAt?.toMillis?.() || Number(startedAt) || Date.now();
      serverElapsedSec = Math.max(0, (Date.now() - startedMs) / 1000);
    }
  }

  // Clamp engagementTime to server-elapsed + 5s when session available;
  // fallback to hard bounds when client hasn't adopted session tokens yet.
  const validatedEngagement = serverElapsedSec > 0
    ? Math.min(engagementTime, serverElapsedSec + 5)
    : Math.min(engagementTime, 14400);

  // Reject impossible values
  if (validatedEngagement < 10) {
    throw new HttpsError("invalid-argument", "Engagement too short.");
  }
  if (validatedEngagement > 14400) {
    throw new HttpsError("invalid-argument", "Engagement time exceeds maximum.");
  }

  // Calculate XP server-side — read per-class rate from config if available
  let xpPerMinute = DEFAULT_XP_PER_MINUTE;
  let thresholds: Partial<TelemetryThresholds> = {};
  if (classType) {
    const configSnap = await db.collection("class_configs")
      .where("className", "==", classType).orderBy("__name__").limit(1).get();
    if (!configSnap.empty) {
      const configData = configSnap.docs[0].data();
      if (configData.xpPerMinute && configData.xpPerMinute > 0) {
        xpPerMinute = Math.min(configData.xpPerMinute, 100); // Cap at 100/min safety
      }
      thresholds = configData.telemetryThresholds || {};
    }
  }

  const minutes = validatedEngagement / 60;
  const baseXP = Math.min(
    Math.round(minutes * xpPerMinute),
    MAX_XP_PER_SUBMISSION,
  );

  // Apply active XP event multiplier
  const multiplier = await getActiveXPMultiplier(classType);
  const xpEarned = Math.round(baseXP * multiplier);

  if (xpEarned <= 0) {
    return { xpEarned: 0, status: "NO_XP" };
  }

  // Rate limiting: use a transaction to prevent concurrent bypass
  const rateLimitRef = db.doc(`engagement_cooldowns/${uid}_${assignmentId}`);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const rateLimitSnap = await transaction.get(rateLimitRef);
    if (rateLimitSnap.exists) {
      const lastTime = rateLimitSnap.data()!.lastSubmitted || 0;
      if (now - lastTime < ENGAGEMENT_COOLDOWN_MS) {
        throw new HttpsError("resource-exhausted",
          "Please wait before resubmitting this resource.");
      }
    }
    transaction.set(rateLimitRef, { lastSubmitted: now }, { merge: true });
  });

  // Look up student's section for this class and validate enrollment
  let userSection: string | undefined;
  if (classType) {
    const userSnap = await db.doc(`users/${uid}`).get();
    if (userSnap.exists) {
      const userData = userSnap.data()!;
      assertEnrolled(userData, classType);
      userSection = userData.classSections?.[classType]
        ?? ((userData.classType === classType || (userData.enrolledClasses || []).includes(classType)) ? userData.section : undefined);
    }
  }

  // Create submission
  const validatedMetrics = { engagementTime: validatedEngagement, keystrokes, pasteCount, tabSwitchCount };
  const { status: engagementStatus, feedback: engagementFeedback } = calculateFeedbackServerSide(
    validatedMetrics,
    thresholds,
    { assistiveTech: !!metrics.assistiveTech }
  );
  const submission = {
    userId: uid,
    userName: request.data.userName || "Student",
    assignmentId,
    assignmentTitle: assignmentTitle || "",
    metrics: { engagementTime: validatedEngagement, clientReportedEngagement: metrics.engagementTime || 0, keystrokes, pasteCount, clickCount, tabSwitchCount, startTime: metrics.startTime || 0, lastActive: metrics.lastActive || 0 },
    submittedAt: new Date().toISOString(),
    status: engagementStatus,
    feedback: engagementFeedback,
    score: xpEarned,
    privateComments: [],
    hasUnreadAdmin: false,
    hasUnreadStudent: false,
    classType: classType || "",
    ...(userSection ? { userSection } : {}),
  };

  await db.collection("submissions").add(submission);

  // Award XP via transaction (same logic as awardXP)
  const effectiveClass = classType || "Uncategorized";
  const userRef = db.doc(`users/${uid}`);

  let leveledUp = false;
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const result = buildXPUpdates(data, xpEarned, effectiveClass);
    leveledUp = result.leveledUp;

    transaction.update(userRef, result.updates);
  });

  logWithCorrelation("info", "submitEngagement: XP awarded", correlationId, {
    uid, assignmentId, classType, xpEarned, baseXP, multiplier, status: submission.status,
  });
  return { xpEarned, baseXP, multiplier, leveledUp, status: submission.status };
});
/**
 * awardQuestionXP — Awards XP for correct review question answers.
 * Tracks answered questions to prevent double-claiming.
 * @param {object} request - The callable request.
 * @return {object} Result with XP awarded.
 */
export const awardQuestionXP = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const {
    assignmentId, questionId, xpAmount, classType,
  } = request.data;
  if (!assignmentId || !questionId || !xpAmount) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }
  if (xpAmount > 50 || xpAmount < 0) {
    throw new HttpsError("invalid-argument", "Invalid XP amount.");
  }

  const correlationId = generateCorrelationId();
  const db = admin.firestore();

  // Sec 4: Server-validate XP against the actual question bank
  const bankSnap = await db.doc(`question_banks/${assignmentId}`).get();
  let serverXP = xpAmount; // fallback to client value if bank not found
  if (bankSnap.exists) {
    const questions = bankSnap.data()!.questions || [];
    const question = questions.find((q: { id: string; xp?: number }) => q.id === questionId);
    if (question) {
      serverXP = question.xp || 0;
      if (serverXP <= 0 || serverXP > 50) {
        throw new HttpsError("invalid-argument",
          "Question has invalid XP value.");
      }
    } else {
      throw new HttpsError("not-found",
        "Question not found in bank.");
    }
  }

  // Apply active XP event multiplier
  const multiplier = await getActiveXPMultiplier(classType);
  serverXP = Math.round(serverXP * multiplier);

  const progressRef =
    db.doc(`review_progress/${uid}_${assignmentId}`);

  return db.runTransaction(async (transaction) => {
    // ALL READS FIRST (Firestore requirement)
    const progressSnap = await transaction.get(progressRef);
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await transaction.get(userRef);

    // Enrollment validation
    if (classType && userSnap.exists) {
      const userData = userSnap.data()!;
      const enrolledClasses: string[] = userData.enrolledClasses || [];
      const studentClassType = userData.classType;
      if (!enrolledClasses.includes(classType) && studentClassType !== classType) {
        throw new HttpsError("permission-denied", "Not enrolled in the class for this question.");
      }
    }

    // Process reads
    const answeredQuestions: string[] = progressSnap.exists ?
      progressSnap.data()!.answeredQuestions || [] :
      [];

    // Rec 5: Rate limit — minimum 3 seconds between claims
    if (progressSnap.exists) {
      const lastUpdated = progressSnap.data()!.lastUpdated;
      if (lastUpdated) {
        const elapsed = Date.now() - new Date(lastUpdated).getTime();
        if (elapsed < 3000) {
          return { awarded: false, reason: "Please wait a few seconds before claiming another question." };
        }
      }
    }

    if (answeredQuestions.includes(questionId)) {
      return { awarded: false, reason: "Already answered" };
    }

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }

    const data = userSnap.data()!;
    if (classType) assertEnrolled(data, classType);
    const { updates, newXP, leveledUp } = buildXPUpdates(data, serverXP, classType);

    // ALL WRITES AFTER READS
    const newAnswered = [...answeredQuestions, questionId];
    transaction.set(progressRef, {
      userId: uid,
      assignmentId,
      answeredQuestions: newAnswered,
      lastUpdated: new Date().toISOString(),
    }, { merge: true });

    transaction.update(userRef, updates);
    return {
      awarded: true,
      xpAmount: serverXP,
      newXP,
      leveledUp,
    };
  }).catch((err) => {
    // Rec 2: Log unexpected errors for debugging
    if (err instanceof HttpsError) throw err;
    logWithCorrelation("error", "awardQuestionXP failed", correlationId, {
      uid, assignmentId, questionId, classType, serverXP, error: err.message,
    });
    throw new HttpsError("internal", "Failed to award XP.");
  });
});
/**
 * penalizeWrongAnswer — Deducts XP when a student submits a wrong answer.
 * Penalty = ceil(question.xp / 2). Applied every wrong attempt to discourage
 * random clicking. XP floor is 0 (buildXPUpdates handles this).
 */
export const penalizeWrongAnswer = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { assignmentId, questionId, classType } = request.data;
  if (!assignmentId || !questionId) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const correlationId = generateCorrelationId();
  const db = admin.firestore();

  // Look up the question to get its XP value
  const bankSnap = await db.doc(`question_banks/${assignmentId}`).get();
  if (!bankSnap.exists) {
    throw new HttpsError("not-found", "Question bank not found.");
  }
  const questions = bankSnap.data()!.questions || [];
  const question = questions.find(
    (q: { id: string; xp?: number }) => q.id === questionId
  );
  if (!question) {
    throw new HttpsError("not-found", "Question not found in bank.");
  }

  const questionXP = question.xp || 0;
  if (questionXP <= 0) {
    return { penalized: false, penalty: 0 };
  }
  const penalty = Math.ceil(questionXP / 2);

  const userRef = db.doc(`users/${uid}`);
  const progressRef = db.doc(`review_progress/${uid}_${assignmentId}`);

  return db.runTransaction(async (transaction) => {
    const [userSnap, progressSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(progressRef),
    ]);

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }

    // Deduplication: only penalize once per question
    const penalizedQuestions: string[] = progressSnap.exists
      ? (progressSnap.data()!.penalizedQuestions || [])
      : [];
    if (penalizedQuestions.includes(questionId)) {
      return { penalized: false, penalty: 0, reason: "Already penalized for this question." };
    }

    const data = userSnap.data()!;
    const { updates, newXP } = buildXPUpdates(data, -penalty, classType);

    transaction.update(userRef, updates);
    transaction.set(progressRef, {
      penalizedQuestions: [...penalizedQuestions, questionId],
    }, { merge: true });

    return { penalized: true, penalty, newXP };
  }).catch((err) => {
    if (err instanceof HttpsError) throw err;
    logWithCorrelation("error", "penalizeWrongAnswer failed", correlationId, {
      uid, assignmentId, questionId, classType, penalty, error: err.message,
    });
    throw new HttpsError("internal", "Failed to apply penalty.");
  });
});
// ==========================================
// ENGAGEMENT STREAK LOGIC
// ==========================================

/**
 * updateStreak — Called after engagement submission to update weekly streak.
 */
export const updateStreak = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "updateStreak: invoked", correlationId, { uid });

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return { streak: 0 };

    const data = userSnap.data()!;
    const gam = data.gamification || {};
    const currentStreak = gam.engagementStreak || 0;
    const lastWeek = gam.lastStreakWeek || "";

    // Calculate current ISO week
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    const currentWeekId = `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, "0")}`;

    if (lastWeek === currentWeekId) {
      return { streak: currentStreak, alreadyUpdated: true };
    }

    // Check if last week was the previous week (consecutive)
    const lastWeekNum = lastWeek ? parseInt(lastWeek.split("-W")[1]) : 0;
    const lastYear = lastWeek ? parseInt(lastWeek.split("-W")[0]) : 0;
    const isConsecutive =
      (lastYear === d.getUTCFullYear() && lastWeekNum === weekNum - 1) ||
      (lastYear === d.getUTCFullYear() - 1 && weekNum === 1 && lastWeekNum >= 52);

    const newStreak = Math.min(isConsecutive ? currentStreak + 1 : 1, 999);

    transaction.update(userRef, {
      "gamification.engagementStreak": newStreak,
      "gamification.lastStreakWeek": currentWeekId,
    });

    return { streak: newStreak, weekId: currentWeekId };
  });
});
const DAILY_LOGIN_REWARDS = [
  { day: 1, xp: 25, flux: 5 },
  { day: 2, xp: 30, flux: 5 },
  { day: 3, xp: 40, flux: 10 },
  { day: 4, xp: 50, flux: 10 },
  { day: 5, xp: 75, flux: 15 },
  { day: 6, xp: 100, flux: 20 },
  { day: 7, xp: 150, flux: 50 },
];
export const claimDailyLogin = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "claimDailyLogin: invoked", correlationId, { uid });

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const gam = data.gamification || {};
    const today = new Date().toISOString().split("T")[0];
    const lastClaim = gam.lastLoginRewardDate || "";

    if (lastClaim === today) {
      return { alreadyClaimed: true, streak: gam.loginStreak || 0 };
    }

    // Check if yesterday was claimed (consecutive)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const isConsecutive = lastClaim === yesterdayStr;
    const newStreak = isConsecutive ? (gam.loginStreak || 0) + 1 : 1;

    const dayIndex = (newStreak - 1) % 7;
    const reward = DAILY_LOGIN_REWARDS[dayIndex];

    // Award XP via shared helper (must come first so we can layer currency on top)
    const xpResult = buildXPUpdates(data, reward.xp, data.classType);
    const updates: Record<string, unknown> = {
      ...xpResult.updates,
      "gamification.lastLoginRewardDate": today,
      "gamification.loginStreak": newStreak,
    };

    // Add daily login flux ON TOP of any level-up currency bonus
    const baseCurrency = xpResult.updates["gamification.currency"] ?? (gam.currency || 0);
    updates["gamification.currency"] = baseCurrency + reward.flux;

    transaction.update(userRef, updates);

    return {
      alreadyClaimed: false,
      streak: newStreak,
      xpReward: reward.xp,
      fluxReward: reward.flux,
      leveledUp: xpResult.leveledUp,
    };
  });
});
const WHEEL_PRIZES = [
  { id: "w_xp_50", type: "XP", value: 50, weight: 25 },
  { id: "w_xp_100", type: "XP", value: 100, weight: 18 },
  { id: "w_xp_250", type: "XP", value: 250, weight: 8 },
  { id: "w_flux_10", type: "FLUX", value: 10, weight: 20 },
  { id: "w_flux_25", type: "FLUX", value: 25, weight: 12 },
  { id: "w_flux_100", type: "FLUX", value: 100, weight: 3 },
  { id: "w_item_common", type: "ITEM", value: 1, weight: 15, rarity: "COMMON" },
  { id: "w_item_uncommon", type: "ITEM", value: 1, weight: 8, rarity: "UNCOMMON" },
  { id: "w_item_rare", type: "ITEM", value: 1, weight: 3, rarity: "RARE" },
  { id: "w_gem", type: "GEM", value: 1, weight: 10 },
  { id: "w_skillpt", type: "SKILL_POINT", value: 1, weight: 5 },
  { id: "w_nothing", type: "NOTHING", value: 0, weight: 15 },
];
const GEM_TYPES = [
  { name: "Ruby", stat: "tech", color: "#ef4444" },
  { name: "Emerald", stat: "focus", color: "#22c55e" },
  { name: "Sapphire", stat: "analysis", color: "#3b82f6" },
  { name: "Amethyst", stat: "charisma", color: "#a855f7" },
];
function generateGem(level: number) {
  const gemType = pick(GEM_TYPES);
  if (!gemType) {
    throw new HttpsError("internal", "Failed to generate gem: empty GEM_TYPES pool");
  }
  // Scale gem tiers across 500 levels: tier 1 at level 1, tier 5 at level ~400+
  const tier = Math.min(5, Math.max(1, Math.floor(level / 100) + 1));
  return {
    id: Math.random().toString(36).substring(2, 9),
    name: `${gemType.name} (T${tier})`,
    stat: gemType.stat,
    value: tier * 3 + Math.floor(Math.random() * 3),
    tier,
    color: gemType.color,
  };
}
export const spinFortuneWheel = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { classType } = request.data;
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const WHEEL_COST = 25; // Flux cost to spin
  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "spinFortuneWheel: invoked", correlationId, { uid });

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    if (classType) assertEnrolled(data, classType);
    const gam = data.gamification || {};
    const now = Date.now();
    const oneHourAgo = now - 3600000; // 1 hour in ms
    const lastSpinAt = gam.lastWheelSpinAt;
    const lastSpinDate = gam.lastWheelSpin;

    if (lastSpinAt) {
      const lastSpinTime = new Date(lastSpinAt).getTime();
      if (lastSpinTime > oneHourAgo) {
        const minutesLeft = Math.ceil((lastSpinTime - oneHourAgo) / 60000);
        throw new HttpsError("failed-precondition", `Wheel on cooldown. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`);
      }
    } else if (lastSpinDate === new Date().toISOString().split("T")[0]) {
      throw new HttpsError("failed-precondition", "Already spun today. Come back tomorrow!");
    }

    if ((gam.currency || 0) < WHEEL_COST) {
      throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");
    }

    // Spin the wheel
    const totalWeight = WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * totalWeight;
    let prize = WHEEL_PRIZES[WHEEL_PRIZES.length - 1];
    for (const p of WHEEL_PRIZES) {
      roll -= p.weight;
      if (roll <= 0) { prize = p; break; }
    }

    const updates: Record<string, unknown> = {
      "gamification.lastWheelSpinAt": new Date().toISOString(),
      "gamification.lastWheelSpin": new Date().toISOString().split("T")[0],
    };
    // Start from current currency minus wheel cost
    let currencyAfter = (gam.currency || 0) - WHEEL_COST;

    let rewardDescription = "";

    if (prize.type === "XP") {
      const xpResult = buildXPUpdates(data, prize.value, classType || data.classType);
      Object.assign(updates, xpResult.updates);
      // If level-up occurred, buildXPUpdates already set currency to (old + 100).
      // We need to layer the wheel cost deduction on top of that.
      if (xpResult.leveledUp) {
        currencyAfter = (xpResult.updates["gamification.currency"] as number) - WHEEL_COST;
      }
      rewardDescription = `${prize.value} XP`;
    } else if (prize.type === "FLUX") {
      currencyAfter += prize.value;
      rewardDescription = `${prize.value} Cyber-Flux`;
    } else if (prize.type === "ITEM") {
      const item = generateLoot(gam.level || 1, prize.rarity);
      const paths = getProfilePaths(classType);
      const { inventory } = getProfileData(data, classType);
      updates[paths.inventory] = [...inventory, item];
      rewardDescription = item.name;
    } else if (prize.type === "GEM") {
      const gem = generateGem(gam.level || 1);
      // Store gems in a global gems collection on user
      const currentGems = gam.gemsInventory || [];
      updates["gamification.gemsInventory"] = [...currentGems, gem];
      rewardDescription = gem.name;
    } else if (prize.type === "SKILL_POINT") {
      updates["gamification.skillPoints"] = (gam.skillPoints || 0) + 1;
      rewardDescription = "1 Skill Point";
    } else {
      rewardDescription = "Better luck next time!";
    }

    // Always set final currency (accounts for wheel cost + any prize/level-up bonuses)
    updates["gamification.currency"] = currencyAfter;

    // Increment wheelSpins counter and check achievements
    updates["gamification.wheelSpins"] = (gam.wheelSpins || 0) + 1;
    const { rewardUpdates: wheelAchievementUpdates, newUnlocks: wheelNewUnlocks } =
      checkAndUnlockAchievements(data, updates);
    // Merge achievement rewards — re-apply final currency on top to preserve wheel cost deduction
    Object.assign(updates, wheelAchievementUpdates);
    if (wheelAchievementUpdates["gamification.currency"] !== undefined) {
      // Achievement awarded flux — add on top of the wheel-cost-adjusted currency
      updates["gamification.currency"] = (wheelAchievementUpdates["gamification.currency"] as number);
    }

    transaction.update(userRef, updates);

    return { prizeId: prize.id, prizeType: prize.type, rewardDescription, newUnlocks: wheelNewUnlocks };
  });
});
const VALID_SPECIALIZATIONS: string[] = [
  "JUGGERNAUT", "BERSERKER", "SNIPER", "SPEEDSTER",
  "GUARDIAN", "CLERIC", "TACTICIAN", "SCHOLAR",
];

const SKILL_COSTS: Record<string, number> = {
  // ═══ V1 (legacy — kept for migration reference) ═══
  // THEORIST
  th_1: 1, th_2: 1, th_3: 2, th_4: 2, th_5: 3, th_6: 5,
  // EXPERIMENTALIST
  ex_1: 1, ex_2: 1, ex_3: 2, ex_4: 2, ex_5: 3, ex_6: 5,
  // ANALYST
  an_1: 1, an_2: 1, an_3: 2, an_4: 2, an_5: 3, an_6: 5,
  // DIPLOMAT
  di_1: 1, di_2: 1, di_3: 2, di_4: 2, di_5: 3, di_6: 5,

  // ═══ V2 (combat specializations) ═══
  // JUGGERNAUT
  jug_1: 1, jug_2: 1, jug_3: 2, jug_4: 2, jug_5: 3, jug_6: 5,
  // BERSERKER
  ber_1: 1, ber_2: 1, ber_3: 2, ber_4: 2, ber_5: 3, ber_6: 5,
  // SNIPER
  sni_1: 1, sni_2: 1, sni_3: 2, sni_4: 2, sni_5: 3, sni_6: 5,
  // SPEEDSTER
  spd_1: 1, spd_2: 1, spd_3: 2, spd_4: 2, spd_5: 3, spd_6: 5,
  // GUARDIAN
  grd_1: 1, grd_2: 1, grd_3: 2, grd_4: 2, grd_5: 3, grd_6: 5,
  // CLERIC
  clr_1: 1, clr_2: 1, clr_3: 2, clr_4: 2, clr_5: 3, clr_6: 5,
  // TACTICIAN
  tac_1: 1, tac_2: 1, tac_3: 2, tac_4: 2, tac_5: 3, tac_6: 5,
  // SCHOLAR
  sch_1: 1, sch_2: 1, sch_3: 2, sch_4: 2, sch_5: 3, sch_6: 5,
};
export const unlockSkill = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { skillId, specialization } = request.data;
  if (!skillId) throw new HttpsError("invalid-argument", "Skill ID required.");

  // Look up cost server-side — never trust client-sent cost
  const cost = SKILL_COSTS[skillId];
  if (cost === undefined) {
    throw new HttpsError("invalid-argument", `Unknown skill: ${skillId}`);
  }

  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "unlockSkill: invoked", correlationId, { uid });
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const gam = data.gamification || {};
    const currentSpec = gam.specialization;
    const skillPoints = gam.skillPoints || 0;
    const unlockedSkills = gam.unlockedSkills || [];

    if (unlockedSkills.includes(skillId)) {
      throw new HttpsError("already-exists", "Skill already unlocked.");
    }

    // If first skill, set specialization
    const updates: Record<string, unknown> = {};
    if (!currentSpec) {
      if (specialization && !VALID_SPECIALIZATIONS.includes(specialization)) {
        throw new HttpsError("invalid-argument", `Unknown specialization: ${specialization}`);
      }
      updates["gamification.specialization"] = specialization;
    } else if (currentSpec !== specialization) {
      throw new HttpsError("failed-precondition",
        "Cannot unlock skills from a different specialization.");
    }

    if (skillPoints < cost) {
      throw new HttpsError("failed-precondition", "Insufficient skill points.");
    }

    updates["gamification.skillPoints"] = skillPoints - cost;
    updates["gamification.unlockedSkills"] = [...unlockedSkills, skillId];

    transaction.update(userRef, updates);

    return { success: true, remainingPoints: skillPoints - cost };
  });
});
export const addSocket = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, classType } = request.data;
  if (!itemId) throw new HttpsError("invalid-argument", "Item ID required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);
  const SOCKET_ADD_COST = FLUX_COSTS.SOCKET;
  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "addSocket: invoked", correlationId, { uid });

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    if (classType) assertEnrolled(data, classType);
    const { inventory } = getProfileData(data, classType);
    const currency = data.gamification?.currency || 0;

    if (currency < SOCKET_ADD_COST) throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");

    const itemIdx = inventory.findIndex((i: LootItem) => i.id === itemId);
    if (itemIdx === -1) throw new HttpsError("not-found", "Item not in inventory.");

    const item = JSON.parse(JSON.stringify(inventory[itemIdx]));
    const currentSockets = item.sockets || 0;
    if (currentSockets >= 3) throw new HttpsError("failed-precondition", "Maximum sockets reached.");

    item.sockets = currentSockets + 1;
    inventory[itemIdx] = item;

    transaction.update(userRef, {
      [paths.inventory]: inventory,
      "gamification.currency": currency - SOCKET_ADD_COST,
    });

    return { item, newCurrency: currency - SOCKET_ADD_COST };
  });
});
// --- Runeword definitions (server-side copy for pattern matching) ---
interface RunewordDef {
  id: string;
  name: string;
  pattern: string[]; // Ordered gem names
  requiredSockets: number;
  bonusStats: Record<string, number>;
}

const RUNEWORD_DEFS: RunewordDef[] = [
  // 2-socket
  { id: "rw_binary", name: "Binary", pattern: ["Ruby", "Ruby"], requiredSockets: 2, bonusStats: { tech: 15 } },
  { id: "rw_harmony", name: "Harmony", pattern: ["Emerald", "Sapphire"], requiredSockets: 2, bonusStats: { focus: 8, analysis: 8 } },
  { id: "rw_catalyst", name: "Catalyst", pattern: ["Ruby", "Emerald"], requiredSockets: 2, bonusStats: { tech: 8, focus: 8 } },
  { id: "rw_resonance", name: "Resonance", pattern: ["Amethyst", "Amethyst"], requiredSockets: 2, bonusStats: { charisma: 15 } },
  { id: "rw_enigma", name: "Enigma", pattern: ["Sapphire", "Amethyst"], requiredSockets: 2, bonusStats: { analysis: 10, charisma: 6 } },
  // 3-socket
  { id: "rw_quantum", name: "Quantum Entanglement", pattern: ["Sapphire", "Ruby", "Sapphire"], requiredSockets: 3, bonusStats: { analysis: 18, tech: 10 } },
  { id: "rw_fusion", name: "Nuclear Fusion", pattern: ["Ruby", "Emerald", "Ruby"], requiredSockets: 3, bonusStats: { tech: 20, focus: 10 } },
  { id: "rw_photosynthesis", name: "Photosynthesis", pattern: ["Emerald", "Emerald", "Ruby"], requiredSockets: 3, bonusStats: { focus: 20, tech: 8 } },
  { id: "rw_supernova", name: "Supernova", pattern: ["Ruby", "Sapphire", "Amethyst"], requiredSockets: 3, bonusStats: { tech: 12, analysis: 12, charisma: 12 } },
  { id: "rw_helix", name: "Double Helix", pattern: ["Emerald", "Amethyst", "Emerald"], requiredSockets: 3, bonusStats: { focus: 15, charisma: 15 } },
  { id: "rw_singularity", name: "Singularity", pattern: ["Amethyst", "Sapphire", "Ruby"], requiredSockets: 3, bonusStats: { tech: 10, focus: 10, analysis: 10, charisma: 10 } },
];

function checkRunewordMatch(gemNames: string[]): RunewordDef | null {
  for (const rw of RUNEWORD_DEFS) {
    if (rw.pattern.length !== gemNames.length) continue;
    if (rw.pattern.every((gem, idx) => gem === gemNames[idx])) return rw;
  }
  return null;
}
export const socketGem = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, gemId, classType } = request.data;
  if (!itemId || !gemId) throw new HttpsError("invalid-argument", "Item ID and Gem ID required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);
  const ENCHANT_COST_VAL = FLUX_COSTS.ENCHANT;
  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "socketGem: invoked", correlationId, { uid });

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    if (classType) assertEnrolled(data, classType);
    const { inventory } = getProfileData(data, classType);
    const gam = data.gamification || {};
    const currency = gam.currency || 0;
    const gemsInventory = gam.gemsInventory || [];

    if (currency < ENCHANT_COST_VAL) throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");

    const itemIdx = inventory.findIndex((i: LootItem) => i.id === itemId);
    if (itemIdx === -1) throw new HttpsError("not-found", "Item not in inventory.");

    const gemIdx = gemsInventory.findIndex((g: { id: string }) => g.id === gemId);
    if (gemIdx === -1) throw new HttpsError("not-found", "Gem not found.");

    const item = JSON.parse(JSON.stringify(inventory[itemIdx]));
    const gem = gemsInventory[gemIdx];
    const sockets = item.sockets || 0;
    const currentGems = item.gems || [];

    if (currentGems.length >= sockets) throw new HttpsError("failed-precondition", "No empty sockets.");

    item.gems = [...currentGems, gem];
    // Update item stats with gem bonus
    item.stats[gem.stat] = (item.stats[gem.stat] || 0) + gem.value;

    // --- Runeword detection: check if all sockets are filled and pattern matches ---
    let runewordActivated: RunewordDef | null = null;
    if (item.gems.length === sockets) {
      const gemNames = item.gems.map((g: { name: string }) => g.name);
      runewordActivated = checkRunewordMatch(gemNames);
      if (runewordActivated) {
        item.runewordActive = runewordActivated.id;
        // Apply runeword bonus stats on top of existing stats
        for (const [stat, val] of Object.entries(runewordActivated.bonusStats)) {
          item.stats[stat] = (item.stats[stat] || 0) + val;
        }
      }
    }

    inventory[itemIdx] = item;
    const newGemsInv = gemsInventory.filter((_: unknown, i: number) => i !== gemIdx);

    transaction.update(userRef, {
      [paths.inventory]: inventory,
      "gamification.currency": currency - ENCHANT_COST_VAL,
      "gamification.gemsInventory": newGemsInv,
    });

    return {
      item,
      newCurrency: currency - ENCHANT_COST_VAL,
      runewordActivated: runewordActivated ? { id: runewordActivated.id, name: runewordActivated.name } : null,
    };
  });
});
const UNSOCKET_RARITY_MULT: Record<string, number> = {
  COMMON: 1, UNCOMMON: 2, RARE: 4, UNIQUE: 8,
};
export const unsocketGem = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, gemIndex, classType } = request.data;
  if (!itemId || gemIndex === undefined || gemIndex === null) {
    throw new HttpsError("invalid-argument", "Item ID and gem index required.");
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);
  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "unsocketGem: invoked", correlationId, { uid });

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    if (classType) assertEnrolled(data, classType);
    const { inventory } = getProfileData(data, classType);
    const gam = data.gamification || {};
    const currency = gam.currency || 0;
    const gemsInventory = gam.gemsInventory || [];

    const itemIdx = inventory.findIndex((i: LootItem) => i.id === itemId);
    if (itemIdx === -1) throw new HttpsError("not-found", "Item not in inventory.");

    const item = JSON.parse(JSON.stringify(inventory[itemIdx]));
    const gems: { id: string; name: string; stat: string; value: number; tier: number; color: string }[] = item.gems || [];
    if (gemIndex < 0 || gemIndex >= gems.length) {
      throw new HttpsError("invalid-argument", "Invalid gem index.");
    }

    const gem = gems[gemIndex];
    const unsocketCount = item.unsocketCount || 0;
    const rarityMult = UNSOCKET_RARITY_MULT[item.rarity] || 1;
    const cost = Math.ceil(10 * rarityMult * Math.max(1, gem.tier) * (1 + unsocketCount));

    if (currency < cost) {
      throw new HttpsError("failed-precondition", `Insufficient Cyber-Flux. Need ${cost}.`);
    }

    // Remove gem stat bonus from item
    item.stats[gem.stat] = Math.max(0, (item.stats[gem.stat] || 0) - gem.value);

    // If runeword was active, remove its bonus stats
    if (item.runewordActive) {
      const rw = RUNEWORD_DEFS.find((r: RunewordDef) => r.id === item.runewordActive);
      if (rw) {
        for (const [stat, val] of Object.entries(rw.bonusStats)) {
          item.stats[stat] = Math.max(0, (item.stats[stat] || 0) - val);
        }
      }
      item.runewordActive = null;
    }

    // Remove gem from item, return to inventory
    gems.splice(gemIndex, 1);
    item.gems = gems;
    item.unsocketCount = unsocketCount + 1;
    inventory[itemIdx] = item;

    const newGemsInv = [...gemsInventory, gem];

    transaction.update(userRef, {
      [paths.inventory]: inventory,
      "gamification.currency": currency - cost,
      "gamification.gemsInventory": newGemsInv,
    });

    return { item, newCurrency: currency - cost, cost, gem };
  });
});
export const commitSpecialization = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { specializationId } = request.data;
  if (!specializationId) {
    throw new HttpsError("invalid-argument", "Specialization ID required.");
  }
  if (!VALID_SPECIALIZATIONS.includes(specializationId)) {
    throw new HttpsError("invalid-argument", `Unknown specialization: ${specializationId}`);
  }

  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "commitSpecialization: invoked", correlationId, { uid });
  const db = admin.firestore();
  const trialEventId = `trial_${uid}_${specializationId}`;
  const trialRef = db.doc(`boss_events/${trialEventId}`);
  const userRef = db.doc(`users/${uid}`);

  // Atomic commit: read user + trial, verify, write specialization
  await db.runTransaction(async (transaction) => {
    const [trialSnap, userSnap] = await Promise.all([
      transaction.get(trialRef), transaction.get(userRef),
    ]);

    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
    const userData = userSnap.data()!;

    // Check if already has specialization
    if (userData.gamification?.specialization) {
      throw new HttpsError("failed-precondition", "You already have a specialization.");
    }

    // Verify the trial exists and was passed
    if (!trialSnap.exists) {
      throw new HttpsError("not-found", "Trial not found. Complete the tutorial first.");
    }

    const trial = trialSnap.data()!;
    if (!trial.isTrial || trial.trialSpecializationId !== specializationId) {
      throw new HttpsError("failed-precondition", "Invalid trial for this specialization.");
    }
    if (trial.trialPassed !== true) {
      throw new HttpsError("failed-precondition", "You must pass the tutorial before committing to this specialization.");
    }

    // Commit specialization atomically
    transaction.update(userRef, {
      'gamification.specialization': specializationId,
      'gamification.skillPoints': admin.firestore.FieldValue.increment(1),
    });
    transaction.update(trialRef, { isActive: false });
  });

  // Deactivate any other active trials for this user (non-atomic cleanup)
  const allTrialsQuery = await db.collection('boss_events')
    .where('isTrial', '==', true)
    .where('isActive', '==', true)
    .get();

  const otherTrials = allTrialsQuery.docs.filter((docSnap) => {
    const data = docSnap.data();
    return data.id && typeof data.id === 'string' && data.id.startsWith(`trial_${uid}_`) && docSnap.id !== trialEventId;
  });

  if (otherTrials.length > 0) {
    const batch = db.batch();
    for (const docSnap of otherTrials) {
      batch.update(docSnap.ref, { isActive: false });
    }
    await batch.commit();
  }

  return {
    success: true,
    message: `Congratulations! You have committed to the ${specializationId} specialization.`,
  };
});
export const declineSpecialization = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { specializationId } = request.data;
  if (!specializationId) {
    throw new HttpsError("invalid-argument", "Specialization ID required.");
  }
  if (!VALID_SPECIALIZATIONS.includes(specializationId)) {
    throw new HttpsError("invalid-argument", `Unknown specialization: ${specializationId}`);
  }

  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "declineSpecialization: invoked", correlationId, { uid });
  const db = admin.firestore();
  const trialEventId = `trial_${uid}_${specializationId}`;
  const trialRef = db.doc(`boss_events/${trialEventId}`);

  const trialSnap = await trialRef.get();
  if (!trialSnap.exists) {
    throw new HttpsError("not-found", "Trial not found.");
  }

  const trial = trialSnap.data()!;
  if (!trial.isTrial || trial.trialSpecializationId !== specializationId) {
    throw new HttpsError("failed-precondition", "Invalid trial for this specialization.");
  }

  await trialRef.update({ isActive: false });

  return { success: true, message: `You declined the ${specializationId} specialization. You can retake the tutorial later.` };
});
export const claimKnowledgeLoot = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { gateId, classType } = request.data;
  if (!gateId) throw new HttpsError("invalid-argument", "Gate ID required.");

  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "claimKnowledgeLoot: invoked", correlationId, { uid });
  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const gateRef = db.doc(`knowledge_gates/${gateId}`);
    const userRef = db.doc(`users/${uid}`);
    const claimRef = db.doc(`knowledge_claims/${uid}_${gateId}`);

    const [gateSnap, userSnap, claimSnap] = await Promise.all([
      transaction.get(gateRef), transaction.get(userRef), transaction.get(claimRef),
    ]);

    if (!gateSnap.exists) throw new HttpsError("not-found", "Knowledge gate not found.");
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
    if (claimSnap.exists) throw new HttpsError("already-exists", "Already claimed this reward.");

    const userData = userSnap.data()!;
    if (classType) assertEnrolled(userData, classType);

    const gate = gateSnap.data()!;
    if (!gate.isActive) throw new HttpsError("failed-precondition", "Gate is not active.");

    // Check if student meets the score requirement
    const progressRef = db.doc(`review_progress/${uid}_${gate.assignmentId}`);
    const progressSnap = await transaction.get(progressRef);
    if (!progressSnap.exists) {
      throw new HttpsError("failed-precondition", "No quiz progress found. Complete the review questions first.");
    }

    const progress = progressSnap.data()!;
    const answeredCount = (progress.answeredQuestions || []).length;
    if (answeredCount < gate.requiredQuestions) {
      throw new HttpsError("failed-precondition",
        `Need ${gate.requiredQuestions} correct answers, have ${answeredCount}.`);
    }

    // Award rewards
    const gam = userData.gamification || {};
    const level = gam.level || 1;

    const item = generateLoot(level, gate.rewards.itemRarity);
    const paths = getProfilePaths(classType);
    const { inventory } = getProfileData(userData, classType);

    const xpResult = buildXPUpdates(userData, gate.rewards.xpBonus, classType || userData.classType);
    // Use level-up inventory if buildXPUpdates already appended loot to the same path
    const existingInv = xpResult.updates[paths.inventory] || inventory;
    const updates: Record<string, unknown> = {
      ...xpResult.updates,
      [paths.inventory]: [...existingInv, item],
    };

    if (gate.rewards.fluxBonus) {
      // Add flux ON TOP of any level-up currency bonus
      const baseCurrency = xpResult.updates["gamification.currency"] ?? (gam.currency || 0);
      updates["gamification.currency"] = baseCurrency + gate.rewards.fluxBonus;
    }

    transaction.set(claimRef, { userId: uid, gateId, claimedAt: new Date().toISOString() });
    transaction.update(userRef, updates);

    return { item, xpBonus: gate.rewards.xpBonus, fluxBonus: gate.rewards.fluxBonus || 0 };
  });
});
export const purchaseCosmetic = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { cosmeticId } = request.data;
  if (!cosmeticId) throw new HttpsError("invalid-argument", "Cosmetic ID required.");

  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "purchaseCosmetic: invoked", correlationId, { uid });
  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const cosmeticRef = db.doc(`seasonal_cosmetics/${cosmeticId}`);
    const userRef = db.doc(`users/${uid}`);
    const [cosmeticSnap, userSnap] = await Promise.all([
      transaction.get(cosmeticRef), transaction.get(userRef),
    ]);

    if (!cosmeticSnap.exists) throw new HttpsError("not-found", "Cosmetic not found.");
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const cosmetic = cosmeticSnap.data()!;
    if (!cosmetic.isAvailable) throw new HttpsError("failed-precondition", "Cosmetic not currently available.");

    const userData = userSnap.data()!;
    const gam = userData.gamification || {};
    const owned = gam.ownedCosmetics || [];

    if (owned.includes(cosmeticId)) throw new HttpsError("already-exists", "Already owned.");
    if ((gam.currency || 0) < cosmetic.cost) throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");

    transaction.update(userRef, {
      "gamification.ownedCosmetics": [...owned, cosmeticId],
      "gamification.currency": (gam.currency || 0) - cosmetic.cost,
    });

    return { success: true };
  });
});
export const claimDailyChallenge = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { challengeId, classType } = request.data;
  if (!challengeId) throw new HttpsError("invalid-argument", "Challenge ID required.");

  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "claimDailyChallenge: invoked", correlationId, { uid });
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    if (classType) assertEnrolled(data, classType);
    const gam = data.gamification || {};
    const challenges = gam.activeDailyChallenges || [];

    const challenge = challenges.find((c: { challengeId: string }) => c.challengeId === challengeId);
    if (!challenge) throw new HttpsError("not-found", "Challenge not found in active list.");
    if (!challenge.completed) throw new HttpsError("failed-precondition", "Challenge not completed yet.");
    if (challenge.claimedAt) throw new HttpsError("already-exists", "Already claimed.");

    // Look up challenge rewards from the challenges collection
    const challengeRef = db.doc(`daily_challenges/${challengeId}`);
    const challengeSnap = await transaction.get(challengeRef);
    const xpReward = challengeSnap.exists ? challengeSnap.data()!.xpReward || 50 : 50;
    const fluxReward = challengeSnap.exists ? challengeSnap.data()!.fluxReward || 0 : 0;

    // Mark as claimed
    const updatedChallenges = challenges.map((c: { challengeId: string; claimedAt?: string }) =>
      c.challengeId === challengeId ? { ...c, claimedAt: new Date().toISOString() } : c
    );

    const xpResult = buildXPUpdates(data, xpReward, classType);
    const updates: Record<string, unknown> = {
      ...xpResult.updates,
      "gamification.activeDailyChallenges": updatedChallenges,
    };
    if (fluxReward > 0) {
      // Add flux ON TOP of any level-up currency bonus
      const baseCurrency = xpResult.updates["gamification.currency"] ?? (gam.currency || 0);
      updates["gamification.currency"] = baseCurrency + fluxReward;
    }

    transaction.update(userRef, updates);
    return { xpReward, fluxReward, leveledUp: xpResult.leveledUp };
  });
});
const FLUX_SHOP_CATALOG: Record<string, {
  type: 'XP_BOOST' | 'REROLL_TOKEN' | 'NAME_COLOR' | 'AGENT_COSMETIC' | 'CHARACTER_MODEL';
  cost: number;
  value?: number;
  duration?: number; // hours
  dailyLimit: number;
}> = {
  xp_boost_1h: { type: 'XP_BOOST', cost: 75, value: 1.5, duration: 1, dailyLimit: 2 },
  xp_boost_3h: { type: 'XP_BOOST', cost: 150, value: 1.5, duration: 3, dailyLimit: 1 },
  reroll_token: { type: 'REROLL_TOKEN', cost: 50, dailyLimit: 3 },
  name_color_cyan: { type: 'NAME_COLOR', cost: 0, value: 0x00e5ff, dailyLimit: 0 },
  name_color_gold: { type: 'NAME_COLOR', cost: 0, value: 0xffd700, dailyLimit: 0 },
  name_color_magenta: { type: 'NAME_COLOR', cost: 0, value: 0xff00ff, dailyLimit: 0 },
  name_color_lime: { type: 'NAME_COLOR', cost: 0, value: 0x76ff03, dailyLimit: 0 },
  // Auras - 150 Flux each
  aura_ember: { type: 'AGENT_COSMETIC', cost: 150, dailyLimit: 0 },
  aura_frost: { type: 'AGENT_COSMETIC', cost: 150, dailyLimit: 0 },
  aura_void: { type: 'AGENT_COSMETIC', cost: 150, dailyLimit: 0 },
  aura_radiant: { type: 'AGENT_COSMETIC', cost: 150, dailyLimit: 0 },
  aura_toxic: { type: 'AGENT_COSMETIC', cost: 150, dailyLimit: 0 },
  aura_bloodmoon: { type: 'AGENT_COSMETIC', cost: 150, dailyLimit: 0 },
  aura_aurora: { type: 'AGENT_COSMETIC', cost: 150, dailyLimit: 0 },
  aura_solar: { type: 'AGENT_COSMETIC', cost: 150, dailyLimit: 0 },
  // Particles - 200 Flux each
  particle_fireflies: { type: 'AGENT_COSMETIC', cost: 200, dailyLimit: 0 },
  particle_stardust: { type: 'AGENT_COSMETIC', cost: 200, dailyLimit: 0 },
  particle_embers: { type: 'AGENT_COSMETIC', cost: 200, dailyLimit: 0 },
  particle_snow: { type: 'AGENT_COSMETIC', cost: 200, dailyLimit: 0 },
  particle_sakura: { type: 'AGENT_COSMETIC', cost: 200, dailyLimit: 0 },
  particle_binary: { type: 'AGENT_COSMETIC', cost: 200, dailyLimit: 0 },
  particle_ashes: { type: 'AGENT_COSMETIC', cost: 200, dailyLimit: 0 },
  particle_crystals: { type: 'AGENT_COSMETIC', cost: 200, dailyLimit: 0 },
  // Frames - 250 Flux each
  frame_circuit: { type: 'AGENT_COSMETIC', cost: 250, dailyLimit: 0 },
  frame_thorns: { type: 'AGENT_COSMETIC', cost: 250, dailyLimit: 0 },
  frame_diamond: { type: 'AGENT_COSMETIC', cost: 250, dailyLimit: 0 },
  frame_hex: { type: 'AGENT_COSMETIC', cost: 250, dailyLimit: 0 },
  frame_glitch: { type: 'AGENT_COSMETIC', cost: 250, dailyLimit: 0 },
  frame_rune: { type: 'AGENT_COSMETIC', cost: 250, dailyLimit: 0 },
  frame_neon: { type: 'AGENT_COSMETIC', cost: 250, dailyLimit: 0 },
  // Trails - 300 Flux each
  trail_lightning: { type: 'AGENT_COSMETIC', cost: 300, dailyLimit: 0 },
  trail_shadow: { type: 'AGENT_COSMETIC', cost: 300, dailyLimit: 0 },
  trail_plasma: { type: 'AGENT_COSMETIC', cost: 300, dailyLimit: 0 },
  trail_venom: { type: 'AGENT_COSMETIC', cost: 300, dailyLimit: 0 },
  trail_inferno: { type: 'AGENT_COSMETIC', cost: 300, dailyLimit: 0 },
  trail_ice: { type: 'AGENT_COSMETIC', cost: 300, dailyLimit: 0 },
  trail_spectral: { type: 'AGENT_COSMETIC', cost: 300, dailyLimit: 0 },
  // Character Models — Standard (200 Flux) — KayKit Adventurers
  char_mage: { type: 'CHARACTER_MODEL', cost: 200, dailyLimit: 0 },
  char_ranger: { type: 'CHARACTER_MODEL', cost: 200, dailyLimit: 0 },
  char_rogue: { type: 'CHARACTER_MODEL', cost: 200, dailyLimit: 0 },
  // Character Models — Premium (400 Flux)
  char_rogue_hooded: { type: 'CHARACTER_MODEL', cost: 400, dailyLimit: 0 },
};
export const purchaseFluxItem = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId } = request.data;
  if (!itemId || typeof itemId !== 'string') throw new HttpsError("invalid-argument", "Item ID required.");

  const item = FLUX_SHOP_CATALOG[itemId];
  if (!item) throw new HttpsError("not-found", "Item not found in shop catalog.");

  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "purchaseFluxItem: invoked", correlationId, { uid });
  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const userData = userSnap.data()!;
    const gam = userData.gamification || {};
    const currency = gam.currency || 0;

    if (currency < item.cost) throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");

    // Check daily purchase limit
    const today = new Date().toISOString().split('T')[0];
    const purchases: Record<string, number> = gam.consumablePurchases || {};
    const dailyKey = `${today}_${itemId}`;
    const todayCount = purchases[dailyKey] || 0;

    if (item.dailyLimit > 0 && todayCount >= item.dailyLimit) {
      throw new HttpsError("resource-exhausted", "Daily purchase limit reached for this item.");
    }

    // Build updates
    const updates: Record<string, unknown> = {
      "gamification.currency": currency - item.cost,
    };

    // Only track daily purchase counts for items with daily limits
    if (item.dailyLimit > 0) {
      updates[`gamification.consumablePurchases.${dailyKey}`] = todayCount + 1;
    }

    const result: Record<string, unknown> = { success: true };

    if (item.type === 'XP_BOOST') {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (item.duration || 1) * 60 * 60 * 1000);
      const boost = {
        itemId,
        type: 'XP_BOOST',
        value: item.value || 1.5,
        activatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      // Filter out expired boosts, then add the new one
      const activeBoosts = (gam.activeBoosts || []).filter(
        (b: { expiresAt: string }) => new Date(b.expiresAt) > now
      );
      activeBoosts.push(boost);
      updates["gamification.activeBoosts"] = activeBoosts;
      result.boost = boost;
    } else if (item.type === 'REROLL_TOKEN') {
      // Increment reroll token count
      const currentTokens = gam.rerollTokens || 0;
      updates["gamification.rerollTokens"] = currentTokens + 1;
    } else if (item.type === 'NAME_COLOR') {
      const hexColor = '#' + (item.value || 0).toString(16).padStart(6, '0');
      const ownedNameColors: string[] = gam.ownedNameColors || [];
      if (ownedNameColors.includes(itemId)) {
        // Already owned — free swap, cancel the currency deduction
        updates["gamification.currency"] = currency;
      } else {
        // First purchase — add to owned list
        ownedNameColors.push(itemId);
        updates["gamification.ownedNameColors"] = ownedNameColors;
      }
      updates["gamification.nameColor"] = hexColor;
      result.nameColor = hexColor;
    } else if (item.type === 'AGENT_COSMETIC') {
      const ownedCosmetics: string[] = gam.ownedCosmetics || [];
      if (ownedCosmetics.includes(itemId)) {
        throw new HttpsError("already-exists", "You already own this cosmetic.");
      }
      ownedCosmetics.push(itemId);
      updates["gamification.ownedCosmetics"] = ownedCosmetics;
      // Auto-equip to the correct slot based on cosmetic ID prefix
      const slot = itemId.startsWith('aura_') ? 'aura'
        : itemId.startsWith('particle_') ? 'particle'
        : itemId.startsWith('frame_') ? 'frame'
        : itemId.startsWith('trail_') ? 'trail' : null;
      if (slot) {
        updates[`gamification.activeCosmetics.${slot}`] = itemId;
      }
      result.cosmeticId = itemId;
    } else if (item.type === 'CHARACTER_MODEL') {
      const ownedModels: string[] = gam.ownedCharacterModels || [];
      if (ownedModels.includes(itemId)) {
        throw new HttpsError("already-exists", "You already own this character model.");
      }
      ownedModels.push(itemId);
      updates["gamification.ownedCharacterModels"] = ownedModels;
      // Auto-select the purchased model
      updates["gamification.selectedCharacterModel"] = itemId;
      result.characterModelId = itemId;
    }

    transaction.update(userRef, updates);
    return result;
  });
});
export const equipFluxCosmetic = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const { cosmeticId, slot } = request.data;

  // cosmeticId can be null (unequip) or a string (equip)
  if (cosmeticId !== null && typeof cosmeticId !== 'string') {
    throw new HttpsError("invalid-argument", "Cosmetic ID must be a string or null.");
  }

  const correlationId = generateCorrelationId();
  logWithCorrelation("info", "equipFluxCosmetic: invoked", correlationId, { uid });

  // Determine the slot: from explicit param, from cosmetic ID prefix, or reject
  const validSlots = ['aura', 'particle', 'frame', 'trail'] as const;
  const resolvedSlot = slot
    || (cosmeticId?.startsWith('aura_') ? 'aura'
      : cosmeticId?.startsWith('particle_') ? 'particle'
      : cosmeticId?.startsWith('frame_') ? 'frame'
      : cosmeticId?.startsWith('trail_') ? 'trail' : null);

  if (!resolvedSlot || !validSlots.includes(resolvedSlot)) {
    throw new HttpsError("invalid-argument", "Could not determine cosmetic slot.");
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const gam = userSnap.data()!.gamification || {};

  if (cosmeticId !== null) {
    const ownedCosmetics: string[] = gam.ownedCosmetics || [];
    if (!ownedCosmetics.includes(cosmeticId)) {
      throw new HttpsError("failed-precondition", "You do not own this cosmetic.");
    }
  }

  // Write to the per-slot field; null clears the slot
  const updateField = `gamification.activeCosmetics.${resolvedSlot}`;
  await userRef.update({ [updateField]: cosmeticId || admin.firestore.FieldValue.delete() });
  return { success: true, slot: resolvedSlot, cosmeticId };
});

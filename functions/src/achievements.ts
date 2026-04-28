import { buildXPUpdates } from "./core";

// Inline achievement definitions (cannot import from ../../lib/ due to tsconfig rootDir)
// Keep in sync with lib/achievements.ts — condition types and targets are authoritative here.
export const ACHIEVEMENT_DEFS: {
  id: string;
  conditionType: string;
  conditionTarget: number;
  conditionStat?: string;
  xpReward: number;
  fluxReward?: number;
}[] = [
  // PROGRESSION — XP
  { id: 'first_steps', conditionType: 'XP_TOTAL', conditionTarget: 100, xpReward: 25 },
  { id: 'xp_5k', conditionType: 'XP_TOTAL', conditionTarget: 5000, xpReward: 150 },
  { id: 'xp_25k', conditionType: 'XP_TOTAL', conditionTarget: 25000, xpReward: 500, fluxReward: 200 },
  { id: 'xp_100k', conditionType: 'XP_TOTAL', conditionTarget: 100000, xpReward: 1000, fluxReward: 500 },
  { id: 'xp_500k', conditionType: 'XP_TOTAL', conditionTarget: 500000, xpReward: 3000, fluxReward: 1500 },
  { id: 'xp_1m', conditionType: 'XP_TOTAL', conditionTarget: 1000000, xpReward: 5000, fluxReward: 3000 },
  // PROGRESSION — Level
  { id: 'rising_star', conditionType: 'LEVEL_REACHED', conditionTarget: 10, xpReward: 100, fluxReward: 50 },
  { id: 'veteran', conditionType: 'LEVEL_REACHED', conditionTarget: 25, xpReward: 250, fluxReward: 100 },
  { id: 'elite', conditionType: 'LEVEL_REACHED', conditionTarget: 50, xpReward: 500, fluxReward: 250 },
  { id: 'legend', conditionType: 'LEVEL_REACHED', conditionTarget: 100, xpReward: 1000, fluxReward: 500 },
  { id: 'vanguard', conditionType: 'LEVEL_REACHED', conditionTarget: 200, xpReward: 2000, fluxReward: 750 },
  { id: 'mythic_rank', conditionType: 'LEVEL_REACHED', conditionTarget: 300, xpReward: 3000, fluxReward: 1000 },
  { id: 'paragon', conditionType: 'LEVEL_REACHED', conditionTarget: 400, xpReward: 5000, fluxReward: 2000 },
  { id: 'eternal', conditionType: 'LEVEL_REACHED', conditionTarget: 500, xpReward: 10000, fluxReward: 5000 },
  // COMBAT — Boss Kills
  { id: 'boss_slayer', conditionType: 'BOSS_KILLS', conditionTarget: 3, xpReward: 300, fluxReward: 150 },
  { id: 'boss_hunter', conditionType: 'BOSS_KILLS', conditionTarget: 10, xpReward: 750, fluxReward: 400 },
  // DEDICATION — Streaks
  { id: 'streak_3', conditionType: 'STREAK_WEEKS', conditionTarget: 3, xpReward: 75 },
  { id: 'streak_8', conditionType: 'STREAK_WEEKS', conditionTarget: 8, xpReward: 200, fluxReward: 100 },
  { id: 'streak_16', conditionType: 'STREAK_WEEKS', conditionTarget: 16, xpReward: 500, fluxReward: 250 },
  { id: 'streak_30', conditionType: 'STREAK_WEEKS', conditionTarget: 30, xpReward: 1500, fluxReward: 750 },
  { id: 'login_7', conditionType: 'LOGIN_STREAK', conditionTarget: 7, xpReward: 100 },
  { id: 'login_30', conditionType: 'LOGIN_STREAK', conditionTarget: 30, xpReward: 300, fluxReward: 150 },
  { id: 'login_90', conditionType: 'LOGIN_STREAK', conditionTarget: 90, xpReward: 1000, fluxReward: 500 },
  { id: 'challenges_10', conditionType: 'CHALLENGES_COMPLETED', conditionTarget: 10, xpReward: 100 },
  { id: 'challenges_50', conditionType: 'CHALLENGES_COMPLETED', conditionTarget: 50, xpReward: 400, fluxReward: 200 },
  { id: 'challenges_200', conditionType: 'CHALLENGES_COMPLETED', conditionTarget: 200, xpReward: 1500, fluxReward: 750 },
  // MASTERY — Crafting & Wheel
  { id: 'craft_10', conditionType: 'ITEMS_CRAFTED', conditionTarget: 10, xpReward: 100, fluxReward: 50 },
  { id: 'craft_50', conditionType: 'ITEMS_CRAFTED', conditionTarget: 50, xpReward: 400, fluxReward: 200 },
  { id: 'wheel_25', conditionType: 'WHEEL_SPINS', conditionTarget: 25, xpReward: 200, fluxReward: 100 },
  // NOTE: ITEMS_COLLECTED, GEAR_SCORE, STAT_THRESHOLD badges rely on client-computed
  // gear/inventory data and are not checked server-side.
];
/**
 * Check all achievement conditions against current (projected) gamification state
 * and return updates needed to unlock any newly met achievements + their rewards.
 *
 * @param data  - Full user Firestore document data
 * @param pendingUpdates - Dot-notation updates already queued for this write (e.g. from buildXPUpdates)
 * @param skipXPRewards - Set true when called from within an XP-granting context to prevent loops
 */
export function checkAndUnlockAchievements(
  data: FirebaseFirestore.DocumentData,
  pendingUpdates: Record<string, any>,
  skipXPRewards = false,
): {
  newUnlocks: string[];
  rewardUpdates: Record<string, any>;
} {
  const gam = data.gamification || {};
  const already = new Set<string>(gam.unlockedAchievements || []);

  // Merge pending updates with current state to get projected values
  const projectedXp = pendingUpdates["gamification.xp"] ?? (gam.xp || 0);
  const projectedLevel = pendingUpdates["gamification.level"] ?? (gam.level || 1);
  const projectedBosses = pendingUpdates["gamification.bossesDefeated"] ?? (gam.bossesDefeated || 0);
  const projectedSpins = pendingUpdates["gamification.wheelSpins"] ?? (gam.wheelSpins || 0);
  const projectedCrafts = pendingUpdates["gamification.itemsCrafted"] ?? (gam.itemsCrafted || 0);
  const projectedStreak = gam.engagementStreak || 0;
  const projectedLoginStreak = gam.loginStreak || 0;
  const projectedChallenges = gam.challengesCompleted || 0;

  const conditionValues: Record<string, number> = {
    XP_TOTAL: projectedXp,
    LEVEL_REACHED: projectedLevel,
    BOSS_KILLS: projectedBosses,
    WHEEL_SPINS: projectedSpins,
    ITEMS_CRAFTED: projectedCrafts,
    STREAK_WEEKS: projectedStreak,
    LOGIN_STREAK: projectedLoginStreak,
    CHALLENGES_COMPLETED: projectedChallenges,
  };

  const newUnlocks: string[] = [];
  let totalXpReward = 0;
  let totalFluxReward = 0;
  const progressUpdates: Record<string, number> = {};

  for (const def of ACHIEVEMENT_DEFS) {
    if (already.has(def.id)) continue;
    const currentValue = conditionValues[def.conditionType] ?? 0;
    progressUpdates[def.id] = currentValue;
    if (currentValue >= def.conditionTarget) {
      newUnlocks.push(def.id);
      totalXpReward += def.xpReward;
      totalFluxReward += def.fluxReward || 0;
    }
  }

  if (newUnlocks.length === 0) {
    return { newUnlocks: [], rewardUpdates: {} };
  }

  const rewardUpdates: Record<string, any> = {};

  // Update unlockedAchievements array
  const currentUnlocked: string[] = gam.unlockedAchievements || [];
  rewardUpdates["gamification.unlockedAchievements"] = [...currentUnlocked, ...newUnlocks];

  // Update progress for all checked achievements
  const currentProgress: Record<string, number> = { ...(gam.achievementProgress || {}) };
  for (const [id, val] of Object.entries(progressUpdates)) {
    currentProgress[id] = val;
  }
  rewardUpdates["gamification.achievementProgress"] = currentProgress;

  // Grant XP reward (unless we're already inside an XP grant to prevent loops)
  if (!skipXPRewards && totalXpReward > 0) {
    // Build a temporary projected data snapshot so buildXPUpdates uses the correct base XP
    const projectedData = {
      ...data,
      gamification: {
        ...gam,
        xp: projectedXp,
        level: projectedLevel,
      },
    };
    const xpResult = buildXPUpdates(projectedData, totalXpReward);
    Object.assign(rewardUpdates, xpResult.updates);
  }

  // Grant Flux reward
  if (totalFluxReward > 0) {
    const baseCurrency = rewardUpdates["gamification.currency"] ?? (pendingUpdates["gamification.currency"] ?? (gam.currency || 0));
    rewardUpdates["gamification.currency"] = (baseCurrency as number) + totalFluxReward;
  }

  return { newUnlocks, rewardUpdates };
}
/**
 * Write ACHIEVEMENT_UNLOCKED notifications for newly unlocked badges.
 * Only call from non-transactional contexts (boss defeats, etc.).
 * Transaction-based functions return newUnlocks[] for the client to handle.
 */
export async function writeAchievementNotifications(
  db: FirebaseFirestore.Firestore,
  userId: string,
  newUnlocks: string[],
): Promise<void> {
  if (newUnlocks.length === 0) return;
  const timestamp = new Date().toISOString();
  const writes = newUnlocks.map((achievementId) => {
    const def = ACHIEVEMENT_DEFS.find((d) => d.id === achievementId);
    return db.collection("notifications").add({
      type: "ACHIEVEMENT_UNLOCKED",
      userId,
      achievementId,
      message: `Achievement unlocked: ${achievementId}`,
      xpReward: def?.xpReward || 0,
      fluxReward: def?.fluxReward || 0,
      timestamp,
    });
  });
  await Promise.allSettled(writes);
}

import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateLoot } from "./gamification-items";

export const MAX_LEVEL = 500;
export const MAX_XP_PER_SUBMISSION = 500;
export const DEFAULT_XP_PER_MINUTE = 10;
export const ENGAGEMENT_COOLDOWN_MS = 5 * 60 * 1000;

export const XP_BRACKETS: [number, number][] = [
  [50, 1000],
  [200, 2000],
  [350, 3000],
  [450, 4000],
  [500, 5000],
];

export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  let remaining = xp;
  let currentLevel = 1;
  let prevCap = 0;
  for (const [cap, xpPer] of XP_BRACKETS) {
    const levelsInBracket = cap - prevCap;
    const xpForBracket = levelsInBracket * xpPer;
    if (remaining < xpForBracket) {
      currentLevel += Math.floor(remaining / xpPer);
      return Math.min(currentLevel, MAX_LEVEL);
    }
    remaining -= xpForBracket;
    currentLevel += levelsInBracket;
    prevCap = cap;
  }
  return MAX_LEVEL;
}

export async function getActiveXPMultiplier(classType?: string): Promise<number> {
  const db = admin.firestore();
  const eventsSnap = await db.collection("xp_events")
    .where("isActive", "==", true).get();
  let multiplier = 1.0;
  const now = new Date();
  eventsSnap.docs.forEach((d) => {
    const event = d.data();
    if (event.expiresAt && new Date(event.expiresAt) < now) return;
    if (event.type === "GLOBAL" ||
        (event.type === "CLASS_SPECIFIC" && event.targetClass === classType)) {
      if (event.multiplier > multiplier) multiplier = event.multiplier;
    }
  });
  return multiplier;
}

export interface CallableAuth {
  uid: string;
  token?: Record<string, unknown>;
}

export interface Affix {
  name: string;
  type: "PREFIX" | "SUFFIX";
  stat: string;
  value: number;
  tier: number;
}

export interface LootItem {
  id: string;
  name: string;
  baseName: string;
  rarity: string;
  slot: string;
  visualId: string;
  stats: Record<string, number>;
  affixes: Affix[];
  effects?: { id: string; name: string; description: string; type: string }[];
  description: string;
  obtainedAt: string;
}

export async function verifyAdmin(auth: CallableAuth | undefined): Promise<void> {
  if (!auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  const user = await admin.auth().getUser(auth.uid);
  if (!user.customClaims?.admin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
}

export function verifyAuth(auth: CallableAuth | undefined): string {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Must be logged in.");
  return auth.uid;
}

export function getProfilePaths(classType?: string) {
  if (classType) {
    const base = `gamification.classProfiles.${classType}`;
    return {
      inventory: `${base}.inventory`,
      equipped: `${base}.equipped`,
      appearance: `${base}.appearance`,
    };
  }
  return {
    inventory: "gamification.inventory",
    equipped: "gamification.equipped",
    appearance: "gamification.appearance",
  };
}

export function getProfileData(data: FirebaseFirestore.DocumentData, classType?: string) {
  if (classType && data.gamification?.classProfiles?.[classType]) {
    const profile = data.gamification.classProfiles[classType];
    return {
      inventory: profile.inventory || [],
      equipped: profile.equipped || {},
    };
  }
  return {
    inventory: data.gamification?.inventory || [],
    equipped: data.gamification?.equipped || {},
  };
}

export function buildXPUpdates(
  data: FirebaseFirestore.DocumentData,
  xpAmount: number,
  classType?: string,
  customDropPool?: LootItem[],
): { updates: Record<string, any>; newXP: number; newLevel: number; leveledUp: boolean } {
  const gam = data.gamification || {};
  const currentXP = gam.xp || 0;
  const currentLevel = gam.level || 1;
  let boostMultiplier = 1;
  const now = new Date();
  const activeBoosts: Array<{ expiresAt: string; value: number }> = gam.activeBoosts || [];
  for (const boost of activeBoosts) {
    if (boost.value > 1 && new Date(boost.expiresAt) > now) {
      boostMultiplier = Math.max(boostMultiplier, boost.value);
    }
  }
  const boostedXP = xpAmount > 0 ? Math.round(xpAmount * boostMultiplier) : xpAmount;
  const newXP = Math.max(0, currentXP + boostedXP);
  const newLevel = Math.min(levelForXp(newXP), MAX_LEVEL);
  const leveledUp = newLevel > currentLevel;
  const updates: Record<string, any> = {
    "gamification.xp": newXP,
    "gamification.level": newLevel,
  };
  if (classType) {
    const classXpMap = gam.classXp || {};
    const currentClassXp = classXpMap[classType] || 0;
    updates[`gamification.classXp.${classType}`] = Math.max(0, currentClassXp + boostedXP);
  }
  if (leveledUp) {
    updates["gamification.currency"] = (gam.currency || 0) + 100;
    const spEarned = Array.from(
      { length: newLevel - currentLevel },
      (_, i) => currentLevel + 1 + i
    ).filter(lvl => lvl % 2 === 0).length;
    if (spEarned > 0) {
      updates["gamification.skillPoints"] = (gam.skillPoints || 0) + spEarned;
    }
    const newItem = generateLoot(newLevel, undefined, customDropPool);
    if (classType && classType !== "Uncategorized") {
      const cp = data.gamification?.classProfiles?.[classType] || {};
      const inv = cp.inventory || [];
      updates[`gamification.classProfiles.${classType}.inventory`] = [...inv, newItem];
    } else {
      const inv = data.gamification?.inventory || [];
      updates["gamification.inventory"] = [...inv, newItem];
    }
  }
  return { updates, newXP, newLevel, leveledUp };
}

export interface TelemetryThresholds {
  flagPasteCount: number;
  flagMinEngagement: number;
  supportKeystrokes: number;
  supportMinEngagement: number;
  successMinKeystrokes: number;
}

export const DEFAULT_THRESHOLDS: TelemetryThresholds = {
  flagPasteCount: 5,
  flagMinEngagement: 300,
  supportKeystrokes: 500,
  supportMinEngagement: 1800,
  successMinKeystrokes: 100,
};

export function calculateFeedbackServerSide(
  metrics: {
    pasteCount: number;
    engagementTime: number;
    keystrokes: number;
    tabSwitchCount?: number;
    wordCount?: number;
    wordsPerSecond?: number;
  },
  thresholds: Partial<TelemetryThresholds> = {},
  context?: { responseCount?: number; hasWrittenResponses?: boolean }
): { status: string; feedback: string } {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  if (metrics.engagementTime < 30 && context?.hasWrittenResponses) {
    return { status: "FLAGGED", feedback: "Impossibly fast submission: responses submitted with near-zero engagement time." };
  }
  if (context?.responseCount && context.responseCount > 0 && metrics.engagementTime > 0) {
    const secondsPerResponse = metrics.engagementTime / context.responseCount;
    if (secondsPerResponse < 5 && context.responseCount >= 2) {
      return { status: "FLAGGED", feedback: "Implausible speed: average time per response too low for genuine work." };
    }
  }
  if (metrics.keystrokes === 0 && metrics.pasteCount === 0 && context?.hasWrittenResponses) {
    return { status: "FLAGGED", feedback: "No input activity detected despite non-empty responses — possible pre-fill or API exploit." };
  }
  if ((metrics.tabSwitchCount || 0) > 5) {
    return { status: "FLAGGED", feedback: "Excessive tab switching during assessment." };
  }
  if (metrics.pasteCount > 15) {
    return { status: "FLAGGED", feedback: "Elevated paste count — student may be assembling an answer from multiple sources." };
  }
  if (metrics.pasteCount > 0 && metrics.wordCount && metrics.wordCount > 0 && metrics.wordCount / metrics.pasteCount < 10) {
    return { status: "FLAGGED", feedback: "High paste density — frequent small pastes detected." };
  }
  if (metrics.wordsPerSecond && metrics.wordsPerSecond > 3.0 && metrics.keystrokes > 0) {
    return { status: "FLAGGED", feedback: "Impossible typing speed detected — possible automated input or macro." };
  }
  if (metrics.keystrokes === 0 && metrics.wordCount && metrics.wordCount > 20) {
    return { status: "FLAGGED", feedback: "Text present with zero keystrokes — possible dictation, paste, or automated input." };
  }
  if (metrics.keystrokes > 0 && metrics.wordCount && metrics.wordCount > 0 && metrics.wordCount / metrics.keystrokes > 0.5) {
    return { status: "FLAGGED", feedback: "Word-to-keystroke ratio is implausibly high — possible paste or auto-insert." };
  }
  if (metrics.pasteCount > t.flagPasteCount && metrics.engagementTime < t.flagMinEngagement) {
    return { status: "FLAGGED", feedback: "AI Usage Suspected: Abnormal frequency of pasted content detected." };
  }
  if (metrics.keystrokes > t.supportKeystrokes && metrics.engagementTime > t.supportMinEngagement) {
    return { status: "SUPPORT_NEEDED", feedback: "Student may be struggling — high effort with extended time." };
  }
  if (metrics.pasteCount === 0 && metrics.keystrokes > t.successMinKeystrokes) {
    return { status: "SUCCESS", feedback: "Excellent independent work." };
  }
  return { status: "NORMAL", feedback: "Assignment submitted successfully." };
}

export function calculateServerStats(equipped: Record<string, unknown> | undefined): { tech: number; focus: number; analysis: number; charisma: number } {
  const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
  if (!equipped) return base;
  for (const item of Object.values(equipped)) {
    if (!item || typeof item !== 'object') continue;
    const it = item as { stats?: Record<string, number>; gems?: { stat: string; value: number }[] };
    if (it.stats) {
      for (const [key, val] of Object.entries(it.stats)) {
        if (key in base) base[key as keyof typeof base] += Number(val) || 0;
      }
    }
    if (Array.isArray(it.gems)) {
      for (const gem of it.gems) {
        if (gem.stat in base) base[gem.stat as keyof typeof base] += Number(gem.value) || 0;
      }
    }
  }
  return base;
}

export function deriveCombatStats(stats: { tech: number; focus: number; analysis: number; charisma: number }): {
  maxHp: number; armorPercent: number; critChance: number; critMultiplier: number;
} {
  const maxHp = 100 + Math.max(0, stats.charisma - 10) * 5;
  const armorPercent = Math.min(stats.analysis * 0.5, 50);
  const critChance = Math.min(stats.focus * 0.01, 0.40);
  const critMultiplier = 2 + Math.max(0, stats.focus - 10) * 0.02;
  return { maxHp, armorPercent, critChance, critMultiplier };
}

export function calculateBossDamage(stats: { tech: number; focus: number; analysis: number; charisma: number }, gearScore: number): { damage: number; isCrit: boolean } {
  let damage = 8;
  damage += Math.floor(stats.tech / 5);
  damage += Math.floor(gearScore / 50);
  const variance = 0.8 + Math.random() * 0.4;
  damage = Math.round(damage * variance);
  const { critChance, critMultiplier } = deriveCombatStats(stats);
  const isCrit = Math.random() < critChance;
  if (isCrit) damage = Math.round(damage * critMultiplier);
  return { damage: Math.max(1, Math.min(damage, 200)), isCrit };
}

export function calculateServerGearScore(equipped: Record<string, unknown> | undefined): number {
  if (!equipped) return 0;
  let totalScore = 0;
  for (const item of Object.values(equipped)) {
    if (!item || typeof item !== 'object') continue;
    const it = item as { affixes?: { tier: number }[]; rarity?: string };
    let tiers = (it.affixes || []).map((a: { tier: number }) => a.tier);
    if (it.rarity === 'UNIQUE' && tiers.length === 0) tiers = [10];
    const avgTier = tiers.length > 0 ? tiers.reduce((a: number, b: number) => a + b, 0) / tiers.length : 1;
    let rarityBonus = 0;
    switch (it.rarity) { case 'UNCOMMON': rarityBonus = 10; break; case 'RARE': rarityBonus = 30; break; case 'UNIQUE': rarityBonus = 60; break; }
    totalScore += (avgTier * 10) + rarityBonus;
  }
  return Math.floor(totalScore);
}

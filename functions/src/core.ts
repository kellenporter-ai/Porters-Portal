import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { randomUUID } from "crypto";
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

export const VALID_CLASS_TYPES = [
  'AP Physics',
  'Honors Physics',
  'Forensic Science',
  'Uncategorized',
  'GLOBAL',
  'Sandbox Class',
];

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && value >= 0;
}

function guardNumber(name: string, value: unknown, defaultValue: number): number {
  if (!isValidNumber(value)) {
    logger.warn(`Invalid numeric input for ${name}: ${value}, using default ${defaultValue}`);
    return defaultValue;
  }
  return value;
}

export function levelForXp(xp: number): number {
  if (!isValidNumber(xp)) {
    logger.warn(`Invalid XP value in levelForXp: ${xp}, defaulting to level 1`);
    return 1;
  }
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

function validateClassType(classType: string): void {
  if (!VALID_CLASS_TYPES.includes(classType)) {
    throw new HttpsError("invalid-argument", `Invalid classType: "${classType}". Must be one of: ${VALID_CLASS_TYPES.join(", ")}`);
  }
}

export function getProfilePaths(classType?: string) {
  if (classType) {
    validateClassType(classType);
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
  if (classType) {
    validateClassType(classType);
    if (data.gamification?.classProfiles?.[classType]) {
      const profile = data.gamification.classProfiles[classType];
      return {
        inventory: profile.inventory || [],
        equipped: profile.equipped || {},
      };
    }
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
  // xpAmount may be negative (admin XP deduction); use a finite-number check that allows negatives.
  const safeXpAmount = (typeof xpAmount === "number" && Number.isFinite(xpAmount)) ? xpAmount : 0;
  if (classType) {
    validateClassType(classType);
  }

  const gam = data.gamification || {};
  const currentXP = guardNumber("gamification.xp", gam.xp, 0);
  const currentLevel = guardNumber("gamification.level", gam.level, 1);
  let boostMultiplier = 1;
  const now = new Date();
  const activeBoosts: Array<{ expiresAt: string; value: number }> = gam.activeBoosts || [];
  for (const boost of activeBoosts) {
    if (boost.value > 1 && new Date(boost.expiresAt) > now) {
      boostMultiplier = Math.max(boostMultiplier, boost.value);
    }
  }
  const boostedXP = safeXpAmount > 0 ? Math.round(safeXpAmount * boostMultiplier) : safeXpAmount;
  const newXP = Math.max(0, currentXP + boostedXP);
  const newLevel = Math.min(levelForXp(newXP), MAX_LEVEL);
  const leveledUp = newLevel > currentLevel;
  const updates: Record<string, any> = {
    "gamification.xp": newXP,
    "gamification.level": newLevel,
  };
  if (classType) {
    const classXpMap = gam.classXp || {};
    const currentClassXp = guardNumber(`classXp.${classType}`, classXpMap[classType], 0);
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
    autoInsertCount?: number;
  },
  thresholds: Partial<TelemetryThresholds> = {},
  context?: { responseCount?: number; hasWrittenResponses?: boolean; assistiveTech?: boolean }
): { status: string; feedback: string; assistiveTechOverrides?: string[] } {
  const safeMetrics = {
    pasteCount: guardNumber("pasteCount", metrics.pasteCount, 0),
    engagementTime: guardNumber("engagementTime", metrics.engagementTime, 0),
    keystrokes: guardNumber("keystrokes", metrics.keystrokes, 0),
    tabSwitchCount: guardNumber("tabSwitchCount", metrics.tabSwitchCount, 0),
    wordCount: guardNumber("wordCount", metrics.wordCount, 0),
    wordsPerSecond: guardNumber("wordsPerSecond", metrics.wordsPerSecond, 0),
    autoInsertCount: guardNumber("autoInsertCount", metrics.autoInsertCount, 0),
  };

  // Cap client-reported raw counts to prevent trivial DevTools bypasses
  const maxKeystrokes = safeMetrics.wordCount > 0 ? safeMetrics.wordCount * 10 : safeMetrics.keystrokes;
  const maxPasteCount = safeMetrics.wordCount > 0 ? Math.max(0, Math.ceil(safeMetrics.wordCount / 2)) : safeMetrics.pasteCount;
  safeMetrics.keystrokes = Math.min(safeMetrics.keystrokes, maxKeystrokes);
  safeMetrics.pasteCount = Math.min(safeMetrics.pasteCount, maxPasteCount);

  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const overrides: string[] = [];
  const isAssistive = !!context?.assistiveTech;

  // Helper: returns true if the check should be suppressed due to assistive tech
  const maybeOverride = (checkName: string, wouldFlag: boolean): boolean => {
    if (wouldFlag && isAssistive) {
      overrides.push(checkName);
      return true;
    }
    return false;
  };

  // ── CHECKS THAT ARE NEVER OVERRIDDEN ──
  // These indicate behavior that assistive tech cannot explain

  if (safeMetrics.wordsPerSecond > 3.0 && safeMetrics.keystrokes > 0) {
    return { status: "FLAGGED", feedback: "Impossible typing speed detected — possible automated input or macro." };
  }
  if (safeMetrics.pasteCount > 15) {
    return { status: "FLAGGED", feedback: "Elevated paste count — student may be assembling an answer from multiple sources." };
  }
  if (safeMetrics.pasteCount > t.flagPasteCount && safeMetrics.engagementTime < t.flagMinEngagement) {
    return { status: "FLAGGED", feedback: "AI Usage Suspected: Abnormal frequency of pasted content detected." };
  }

  // ── CHECKS THAT MAY BE OVERRIDDEN BY ASSISTIVE TECH ──

  if (safeMetrics.engagementTime < 30 && context?.hasWrittenResponses) {
    if (!maybeOverride("impossibly_fast", true)) {
      return { status: "FLAGGED", feedback: "Impossibly fast submission: responses submitted with near-zero engagement time." };
    }
  }
  if (context?.responseCount && context.responseCount > 0 && safeMetrics.engagementTime > 0) {
    const secondsPerResponse = safeMetrics.engagementTime / context.responseCount;
    if (secondsPerResponse < 5 && context.responseCount >= 2) {
      if (!maybeOverride("implausible_speed", true)) {
        return { status: "FLAGGED", feedback: "Implausible speed: average time per response too low for genuine work." };
      }
    }
  }
  if (safeMetrics.keystrokes === 0 && safeMetrics.pasteCount === 0 && context?.hasWrittenResponses) {
    if (!maybeOverride("zero_input", true)) {
      return { status: "FLAGGED", feedback: "No input activity detected despite non-empty responses — possible pre-fill or API exploit." };
    }
  }
  if (safeMetrics.tabSwitchCount > 5) {
    if (!maybeOverride("tab_switching", true)) {
      return { status: "FLAGGED", feedback: "Excessive tab switching during assessment." };
    }
  }
  if (safeMetrics.pasteCount > 0 && safeMetrics.wordCount > 0 && safeMetrics.wordCount / safeMetrics.pasteCount < 10) {
    if (!maybeOverride("paste_density", true)) {
      return { status: "FLAGGED", feedback: "High paste density — frequent small pastes detected." };
    }
  }
  if (safeMetrics.keystrokes === 0 && safeMetrics.wordCount > 20) {
    if (!maybeOverride("zero_keystrokes", true)) {
      return { status: "FLAGGED", feedback: "Text present with zero keystrokes — possible dictation, paste, or automated input." };
    }
  }
  if (safeMetrics.autoInsertCount > 5 && safeMetrics.wordCount > 20 && safeMetrics.keystrokes < safeMetrics.wordCount * 3) {
    if (!maybeOverride("auto_insert", true)) {
      return { status: "FLAGGED", feedback: "Heavy auto-insert/dictation detected — verify original work." };
    }
  }
  if (safeMetrics.keystrokes > 0 && safeMetrics.wordCount > 0 && safeMetrics.wordCount / safeMetrics.keystrokes > 0.5) {
    if (!maybeOverride("word_keystroke_ratio", true)) {
      return { status: "FLAGGED", feedback: "Word-to-keystroke ratio is implausibly high — possible paste or auto-insert." };
    }
  }

  // ── SUPPORT / SUCCESS ──
  if (safeMetrics.keystrokes > t.supportKeystrokes && safeMetrics.engagementTime > t.supportMinEngagement) {
    return { status: "SUPPORT_NEEDED", feedback: "Student may be struggling — high effort with extended time." };
  }
  if (safeMetrics.pasteCount === 0 && safeMetrics.keystrokes > t.successMinKeystrokes) {
    return { status: "SUCCESS", feedback: "Excellent independent work." };
  }

  if (overrides.length > 0) {
    return {
      status: "NORMAL",
      feedback: `Assignment submitted successfully. (${overrides.length} integrity check${overrides.length > 1 ? 's' : ''} overridden due to reported assistive technology.)`,
      assistiveTechOverrides: overrides,
    };
  }
  return { status: "NORMAL", feedback: "Assignment submitted successfully." };
}

/**
 * Compute a server-side plausibility score (0-100) from authoritative facts only.
 * Uses tamper-proof data: server elapsed time, word count, response count,
 * and block save timestamps. A low score indicates physically impossible behavior.
 */
export function computePlausibilityScore(
  serverElapsedSec: number,
  wordCount: number,
  responseCount: number,
  blockSaveTimestamps?: number[]
): { score: number; factors: string[] } {
  let score = 100;
  const factors: string[] = [];

  // Factor 1: Words-per-second on elapsed time (not engagement)
  // Even with dictation, 3 WPS is physically impossible
  const wpsOnElapsed = serverElapsedSec > 0 ? wordCount / serverElapsedSec : 0;
  if (wpsOnElapsed > 3.0) {
    score -= 40;
    factors.push(`Impossible WPS on elapsed time (${wpsOnElapsed.toFixed(2)})`);
  } else if (wpsOnElapsed > 2.0) {
    score -= 25;
    factors.push(`Very high WPS on elapsed time (${wpsOnElapsed.toFixed(2)})`);
  } else if (wpsOnElapsed > 1.5) {
    score -= 10;
    factors.push(`High WPS on elapsed time (${wpsOnElapsed.toFixed(2)})`);
  }

  // Factor 2: Time-per-response
  const timePerResponse = responseCount > 0 ? serverElapsedSec / responseCount : Infinity;
  if (timePerResponse < 5) {
    score -= 30;
    factors.push(`Very fast per-response time (${timePerResponse.toFixed(1)}s)`);
  } else if (timePerResponse < 10) {
    score -= 15;
    factors.push(`Fast per-response time (${timePerResponse.toFixed(1)}s)`);
  } else if (timePerResponse < 15) {
    score -= 5;
    factors.push(`Quick per-response time (${timePerResponse.toFixed(1)}s)`);
  }

  // Factor 3: Burst pattern (multiple blocks saved within same few seconds)
  if (blockSaveTimestamps && blockSaveTimestamps.length >= 3) {
    const sorted = [...blockSaveTimestamps].sort((a, b) => a - b);
    const intervals = sorted.slice(1).map((t, i) => t - sorted[i]);
    const minInterval = Math.min(...intervals);
    if (minInterval < 1000) {
      score -= 20;
      factors.push(`Burst saves detected (${minInterval}ms between answers)`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), factors };
}

export function calculateServerStats(equipped: Record<string, unknown> | undefined): { tech: number; focus: number; analysis: number; charisma: number } {
  const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
  if (!equipped) return base;
  for (const item of Object.values(equipped)) {
    if (!item || typeof item !== 'object') continue;
    const it = item as { stats?: Record<string, number>; gems?: { stat: string; value: number }[] };
    if (it.stats) {
      for (const [key, val] of Object.entries(it.stats)) {
        if (key in base) {
          const num = Number(val);
          base[key as keyof typeof base] += isValidNumber(num) ? num : 0;
        }
      }
    }
    if (Array.isArray(it.gems)) {
      for (const gem of it.gems) {
        if (gem.stat in base) {
          const num = Number(gem.value);
          base[gem.stat as keyof typeof base] += isValidNumber(num) ? num : 0;
        }
      }
    }
  }
  return base;
}

export function deriveCombatStats(stats: { tech: number; focus: number; analysis: number; charisma: number }): {
  maxHp: number; armorPercent: number; critChance: number; critMultiplier: number;
} {
  const safeStats = {
    tech: guardNumber("stats.tech", stats.tech, 10),
    focus: guardNumber("stats.focus", stats.focus, 10),
    analysis: guardNumber("stats.analysis", stats.analysis, 10),
    charisma: guardNumber("stats.charisma", stats.charisma, 10),
  };
  const maxHp = 100 + Math.max(0, safeStats.charisma - 10) * 5;
  const armorPercent = Math.min(safeStats.analysis * 0.5, 50);
  const critChance = Math.min(safeStats.focus * 0.01, 0.40);
  const critMultiplier = 2 + Math.max(0, safeStats.focus - 10) * 0.02;
  return { maxHp, armorPercent, critChance, critMultiplier };
}

export function calculateBossDamage(stats: { tech: number; focus: number; analysis: number; charisma: number }, gearScore: number): { damage: number; isCrit: boolean } {
  const safeStats = {
    tech: guardNumber("stats.tech", stats.tech, 10),
    focus: guardNumber("stats.focus", stats.focus, 10),
    analysis: guardNumber("stats.analysis", stats.analysis, 10),
    charisma: guardNumber("stats.charisma", stats.charisma, 10),
  };
  const safeGearScore = guardNumber("gearScore", gearScore, 0);
  let damage = 8;
  damage += Math.floor(safeStats.tech / 5);
  damage += Math.floor(safeGearScore / 50);
  const variance = 0.8 + Math.random() * 0.4;
  damage = Math.round(damage * variance);
  const { critChance, critMultiplier } = deriveCombatStats(safeStats);
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
    let tiers = (it.affixes || [])
      .map((a: { tier: number }) => a.tier)
      .filter((t: unknown) => isValidNumber(t));
    if (it.rarity === 'UNIQUE' && tiers.length === 0) tiers = [10];
    const avgTier = tiers.length > 0 ? tiers.reduce((a: number, b: number) => a + b, 0) / tiers.length : 1;
    let rarityBonus = 0;
    switch (it.rarity) { case 'UNCOMMON': rarityBonus = 10; break; case 'RARE': rarityBonus = 30; break; case 'UNIQUE': rarityBonus = 60; break; }
    totalScore += (avgTier * 10) + rarityBonus;
  }
  return Math.floor(totalScore);
}

export function generateCorrelationId(): string {
  return randomUUID();
}

export function logWithCorrelation(
  level: 'info' | 'warn' | 'error',
  message: string,
  correlationId: string,
  meta?: Record<string, unknown>
) {
  logger[level](message, { correlationId, ...meta });
}

// ==========================================
// METRICS INTEGRITY VALIDATION
// ==========================================

export interface MetricsValidationResult {
  valid: boolean;
  rejectionReason?: string;
  clampedMetrics: Record<string, unknown>;
  violations: string[];
}

/**
 * Validate and clamp client-reported telemetry metrics against server-computed bounds.
 * Rejects physically impossible values; clamps suspicious-but-possible values.
 */
export function validateMetricsIntegrity(
  rawMetrics: Record<string, unknown>,
  serverElapsedSec: number,
  wordCount: number,
  responseCount: number
): MetricsValidationResult {
  const violations: string[] = [];
  const clamped: Record<string, unknown> = { ...rawMetrics };

  // Helper to safely read numbers
  const getNum = (key: string, def = 0): number => {
    const v = rawMetrics[key];
    return typeof v === 'number' && !isNaN(v) ? v : def;
  };

  const engagementTime = getNum('engagementTime', 0);
  const pasteCount = getNum('pasteCount', 0);
  const keystrokes = getNum('keystrokes', 0);
  const clickCount = getNum('clickCount', 0);
  const tabSwitchCount = getNum('tabSwitchCount', 0);
  const blurCount = getNum('blurCount', 0);
  const autoInsertCount = getNum('autoInsertCount', 0);

  // ── REJECTION: physically impossible ──

  if (engagementTime < 0 || engagementTime > 86400) {
    return { valid: false, rejectionReason: `Impossible engagementTime: ${engagementTime}`, clampedMetrics: clamped, violations };
  }
  if (pasteCount < 0 || pasteCount > 10000) {
    return { valid: false, rejectionReason: `Impossible pasteCount: ${pasteCount}`, clampedMetrics: clamped, violations };
  }
  if (keystrokes < 0 || keystrokes > 100000) {
    return { valid: false, rejectionReason: `Impossible keystrokes: ${keystrokes}`, clampedMetrics: clamped, violations };
  }
  if (clickCount < 0 || clickCount > 500000) {
    return { valid: false, rejectionReason: `Impossible clickCount: ${clickCount}`, clampedMetrics: clamped, violations };
  }
  if (tabSwitchCount < 0 || tabSwitchCount > 10000) {
    return { valid: false, rejectionReason: `Impossible tabSwitchCount: ${tabSwitchCount}`, clampedMetrics: clamped, violations };
  }

  // ── CLAMPING: suspicious but within physical bounds ──

  // engagementTime: already clamped to serverElapsedSec + 5 in submitAssessment
  // Keep the raw value for forensic logging, but note if it exceeds bounds
  if (serverElapsedSec > 0 && engagementTime > serverElapsedSec + 5) {
    violations.push(`engagementTime (${engagementTime}) exceeds server elapsed (${serverElapsedSec})`);
    clamped.engagementTime = Math.min(engagementTime, serverElapsedSec + 5);
  }

  // pasteCount: cannot paste more than wordCount/2 (each paste must contribute at least 2 words on average)
  const maxPaste = wordCount > 0 ? Math.max(0, Math.ceil(wordCount / 2)) : pasteCount;
  if (pasteCount > maxPaste) {
    violations.push(`pasteCount (${pasteCount}) exceeds max allowed (${maxPaste}) for ${wordCount} words`);
    clamped.pasteCount = maxPaste;
  }

  // keystrokes: cannot type more than 10 chars per word on average (generous upper bound)
  const maxKeystrokes = wordCount > 0 ? wordCount * 10 : keystrokes;
  if (keystrokes > maxKeystrokes) {
    violations.push(`keystrokes (${keystrokes}) exceeds max allowed (${maxKeystrokes}) for ${wordCount} words`);
    clamped.keystrokes = maxKeystrokes;
  }

  // clickCount: cannot click more than 5 times per second on average
  const maxClicks = serverElapsedSec > 0 ? Math.floor(serverElapsedSec * 5) : clickCount;
  if (clickCount > maxClicks) {
    violations.push(`clickCount (${clickCount}) exceeds max allowed (${maxClicks}) for ${serverElapsedSec}s elapsed`);
    clamped.clickCount = maxClicks;
  }

  // tabSwitchCount: cannot switch tabs more than once per 2 seconds on average
  const maxTabSwitches = serverElapsedSec > 0 ? Math.floor(serverElapsedSec / 2) : tabSwitchCount;
  if (tabSwitchCount > maxTabSwitches) {
    violations.push(`tabSwitchCount (${tabSwitchCount}) exceeds max allowed (${maxTabSwitches}) for ${serverElapsedSec}s elapsed`);
    clamped.tabSwitchCount = maxTabSwitches;
  }

  // blurCount: same bound as tabSwitchCount
  const maxBlurs = serverElapsedSec > 0 ? Math.floor(serverElapsedSec / 2) : blurCount;
  if (blurCount > maxBlurs) {
    violations.push(`blurCount (${blurCount}) exceeds max allowed (${maxBlurs}) for ${serverElapsedSec}s elapsed`);
    clamped.blurCount = maxBlurs;
  }

  // autoInsertCount: cannot auto-insert more than wordCount
  const maxAutoInsert = wordCount > 0 ? wordCount : autoInsertCount;
  if (autoInsertCount > maxAutoInsert) {
    violations.push(`autoInsertCount (${autoInsertCount}) exceeds max allowed (${maxAutoInsert}) for ${wordCount} words`);
    clamped.autoInsertCount = maxAutoInsert;
  }

  // perBlockTiming: sum should not exceed engagementTime * 1.5
  const perBlockTiming = rawMetrics.perBlockTiming as Record<string, number> | undefined;
  if (perBlockTiming && typeof perBlockTiming === 'object') {
    const timingSum = Object.values(perBlockTiming).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
    const clampedEngagement = (clamped.engagementTime as number) || engagementTime;
    if (timingSum > clampedEngagement * 1.5) {
      violations.push(`perBlockTiming sum (${timingSum.toFixed(1)}s) exceeds 1.5x engagement (${(clampedEngagement * 1.5).toFixed(1)}s)`);
      // Scale down proportionally rather than dropping
      const scale = (clampedEngagement * 1.5) / timingSum;
      const scaledTiming: Record<string, number> = {};
      for (const [k, v] of Object.entries(perBlockTiming)) {
        scaledTiming[k] = typeof v === 'number' ? Math.round(v * scale * 10) / 10 : 0;
      }
      clamped.perBlockTiming = scaledTiming;
    }
  }

  // typingCadence bounds
  const typingCadence = rawMetrics.typingCadence as Record<string, unknown> | undefined;
  if (typingCadence && typeof typingCadence === 'object') {
    const avgInterval = typeof typingCadence.avgIntervalMs === 'number' ? typingCadence.avgIntervalMs : 0;
    const burstCount = typeof typingCadence.burstCount === 'number' ? typingCadence.burstCount : 0;
    if (avgInterval < 0 || avgInterval > 10000) {
      violations.push(`typingCadence.avgIntervalMs (${avgInterval}) out of bounds`);
      clamped.typingCadence = { ...typingCadence, avgIntervalMs: Math.max(0, Math.min(avgInterval, 10000)) };
    }
    const maxBursts = keystrokes > 0 ? Math.floor(keystrokes / 5) : burstCount;
    if (burstCount > maxBursts) {
      violations.push(`typingCadence.burstCount (${burstCount}) exceeds max allowed (${maxBursts})`);
      clamped.typingCadence = { ...typingCadence, burstCount: maxBursts };
    }
  }

  return { valid: true, clampedMetrics: clamped, violations };
}

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";


admin.initializeApp();


const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "kellporter2@paps.net";

// ==========================================
// SHARED CONSTANTS
// ==========================================
const MAX_LEVEL = 500;
const MAX_XP_PER_SUBMISSION = 500;
const DEFAULT_XP_PER_MINUTE = 10;
const ENGAGEMENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Tiered XP brackets: each entry is [maxLevel, xpPerLevel]
// Levels 1-50: 1000 XP/lvl, 51-200: 2000, 201-350: 3000, 351-450: 4000, 451-500: 5000
const XP_BRACKETS: [number, number][] = [
  [50, 1000],
  [200, 2000],
  [350, 3000],
  [450, 4000],
  [500, 5000],
];

/** Determine the level for a given total XP amount */
function levelForXp(xp: number): number {
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

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Looks up active XP multiplier events and returns the effective multiplier.
 * Checks for global events and class-specific events.
 * @param {string} classType - The class to check for specific events.
 * @return {Promise<number>} The multiplier to apply (1.0 if no active event).
 */
async function getActiveXPMultiplier(classType?: string): Promise<number> {
  const db = admin.firestore();
  const eventsSnap = await db.collection("xp_events")
    .where("isActive", "==", true).get();
  let multiplier = 1.0;
  const now = new Date();
  eventsSnap.docs.forEach((d) => {
    const event = d.data();
    // Skip expired events
    if (event.expiresAt && new Date(event.expiresAt) < now) return;
    // Apply global events or class-matching events
    if (event.type === "GLOBAL" ||
        (event.type === "CLASS_SPECIFIC" &&
         event.targetClass === classType)) {
      // Use the highest multiplier if multiple events overlap
      if (event.multiplier > multiplier) {
        multiplier = event.multiplier;
      }
    }
  });
  return multiplier;
}

interface CallableAuth {
  uid: string;
  token?: Record<string, unknown>;
}

interface Affix {
  name: string;
  type: "PREFIX" | "SUFFIX";
  stat: string;
  value: number;
  tier: number;
}

interface LootItem {
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

async function verifyAdmin(auth: CallableAuth | undefined): Promise<void> {
  if (!auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  const user = await admin.auth().getUser(auth.uid);
  if (!user.customClaims?.admin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
}

function verifyAuth(auth: CallableAuth | undefined): string {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Must be logged in.");
  return auth.uid;
}

// Loot generation logic (mirrored from client gamification.ts so server is authoritative)

/**
 * Resolves the Firestore field paths for inventory, equipped, and appearance.
 * If classType is provided, uses per-class profile paths.
 * Falls back to legacy global paths for backward compatibility.
 * @param {string} classType - The class to resolve paths for.
 * @return {object} Object with inventory, equipped, and appearance field paths.
 */
function getProfilePaths(classType?: string) {
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

/**
 * Reads the inventory and equipped for a given class (or legacy global).
 * @param {FirebaseFirestore.DocumentData} data - The user document data.
 * @param {string} classType - The class to resolve profile for.
 * @return {object} Object with inventory and equipped arrays.
 */
function getProfileData(data: FirebaseFirestore.DocumentData, classType?: string) {
  if (classType && data.gamification?.classProfiles?.[classType]) {
    const profile = data.gamification.classProfiles[classType];
    return {
      inventory: profile.inventory || [],
      equipped: profile.equipped || {},
    };
  }
  // Legacy fallback
  return {
    inventory: data.gamification?.inventory || [],
    equipped: data.gamification?.equipped || {},
  };
}

const SLOTS = ["HEAD", "CHEST", "HANDS", "FEET", "BELT", "AMULET", "RING"];

const BASE_ITEMS: Record<string, { name: string; vid: string }[]> = {
  HEAD: [{ name: "Synthetic Visor", vid: "visor" }, { name: "Fiber Helm", vid: "helm" }, { name: "Neural Band", vid: "band" }],
  CHEST: [{ name: "Polymer Vest", vid: "vest" }, { name: "Lab Coat", vid: "coat" }, { name: "Exo-Plate", vid: "plate" }],
  HANDS: [{ name: "Tactical Gloves", vid: "gloves" }, { name: "Data Gauntlets", vid: "gauntlets" }, { name: "Precision Grips", vid: "grips" }],
  FEET: [{ name: "Mag-Boots", vid: "boots" }, { name: "Running Treads", vid: "treads" }, { name: "Stabilizers", vid: "stabs" }],
  BELT: [{ name: "Utility Belt", vid: "belt" }, { name: "Field Sash", vid: "sash" }],
  AMULET: [{ name: "Quantum Chip", vid: "chip" }, { name: "Resonance Core", vid: "core" }],
  RING: [{ name: "Circuit Ring", vid: "ring" }, { name: "Focus Band", vid: "band" }],
};

const PREFIX_DEFS = [
  { name: "Reinforced", stat: "focus" }, { name: "Calculated", stat: "analysis" },
  { name: "Diplomatic", stat: "charisma" }, { name: "Hardened", stat: "focus" },
  { name: "Tech-Savvy", stat: "tech" }, { name: "Dynamic", stat: "tech" },
];

const SUFFIX_DEFS = [
  { name: "of Computing", stat: "tech" }, { name: "of Insight", stat: "analysis" },
  { name: "of the Hawk", stat: "focus" }, { name: "of Command", stat: "charisma" },
  { name: "of Precision", stat: "tech" }, { name: "of the Owl", stat: "analysis" },
];

const UNIQUES = [
  { name: "Newton's Prism", slot: "AMULET", uniqueStat: { stat: "analysis", val: 50 }, effect: "Light refraction grants +20% XP" },
  { name: "Tesla's Coils", slot: "HANDS", uniqueStat: { stat: "tech", val: 45 }, effect: "Shocking discoveries yield bonus resources" },
  { name: "Curie's Determination", slot: "RING", uniqueStat: { stat: "focus", val: 40 }, effect: "Radiation resistance (Mental fatigue reduction)" },
  { name: "Einstein's Relativistic Boots", slot: "FEET", uniqueStat: { stat: "tech", val: 50 }, effect: "Time dilation allows late submission grace period" },
];

const FLUX_COSTS: Record<string, number> = { RECALIBRATE: 5, REFORGE: 25, OPTIMIZE: 50, SOCKET: 30, ENCHANT: 15 };

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const rollTier = (level: number, rarity: string): number => {
  // Scale tiers across 500 levels: tier 1 at level 1, tier 10 at level ~450+
  const maxTierAvailable = Math.min(10, Math.max(1, Math.floor(level / 50) + 1));
  let minT = 1;
  let maxT = maxTierAvailable;
  if (rarity === "COMMON") {
    maxT = Math.max(1, Math.ceil(maxTierAvailable * 0.5));
  } else if (rarity === "UNCOMMON") {
    minT = Math.max(1, Math.floor(maxTierAvailable * 0.3));
    maxT = Math.max(minT, Math.floor(maxTierAvailable * 0.8));
  } else if (rarity === "RARE") {
    minT = Math.max(1, Math.floor(maxTierAvailable * 0.5));
  } else if (rarity === "UNIQUE") {
    minT = Math.max(1, Math.floor(maxTierAvailable * 0.8));
  }
  return Math.floor(Math.random() * (maxT - minT + 1)) + minT;
};

const rollValue = (tier: number): number => Math.max(1, tier * 5 + Math.floor(Math.random() * 5) - 2);

/**
 * Fetch custom items marked as droppable from the customItems collection.
 * Called before loot generation to provide the custom drop pool.
 */
async function fetchCustomDropPool(): Promise<LootItem[]> {
  try {
    const db = admin.firestore();
    const snap = await db.collection("customItems").where("canDropInLoot", "==", true).get();
    return snap.docs.map((d) => {
      const data = d.data();
      // Strip library metadata, return as LootItem
      const { createdBy, createdAt, tags, canDropInLoot, dropWeight, ...item } = data;
      return { ...item, id: d.id } as LootItem;
    });
  } catch {
    return [];
  }
}

function generateLoot(level: number, forcedRarity?: string, customDropPool?: LootItem[]): LootItem {
  // 8% chance to drop a custom item from the pool (if pool is available and non-empty)
  if (!forcedRarity && customDropPool && customDropPool.length > 0 && Math.random() < 0.08) {
    const template = pick(customDropPool);
    return {
      ...template,
      id: Math.random().toString(36).substring(2, 9),
      obtainedAt: new Date().toISOString(),
    };
  }

  let rarity = "COMMON";
  if (forcedRarity) {
    rarity = forcedRarity;
  } else {
    const roll = Math.random();
    if (roll > 0.98) rarity = "UNIQUE";
    else if (roll > 0.85) rarity = "RARE";
    else if (roll > 0.60) rarity = "UNCOMMON";
  }

  if (rarity === "UNIQUE") {
    const template = pick(UNIQUES) as Record<string, any>;
    const slot = template.slot || pick(SLOTS);
    const base = pick(BASE_ITEMS[slot] || BASE_ITEMS["HEAD"]);
    const stats: Record<string, number> = {}; const affixes: Affix[] = [];
    stats[template.uniqueStat.stat] = template.uniqueStat.val;
    const tier = rollTier(level, "UNIQUE");
    const pref = pick(PREFIX_DEFS); const pVal = rollValue(tier);
    affixes.push({ name: pref.name, type: "PREFIX", stat: pref.stat, value: pVal, tier });
    stats[pref.stat] = (stats[pref.stat] || 0) + pVal;
    const suff = pick(SUFFIX_DEFS); const sVal = rollValue(tier);
    affixes.push({ name: suff.name, type: "SUFFIX", stat: suff.stat, value: sVal, tier });
    stats[suff.stat] = (stats[suff.stat] || 0) + sVal;
    return {
      id: Math.random().toString(36).substring(2, 9), name: template.name, baseName: base.name,
      rarity: "UNIQUE", slot, visualId: `unique_${template.name.toLowerCase().replace(/\s/g, "_")}`,
      stats, affixes, effects: [{ id: "u1", name: "Unique Power", description: template.effect, type: "SPECIAL" }],
      description: "A legendary artifact discovered in the archives of history.", obtainedAt: new Date().toISOString(),
    };
  }

  const slot = pick(SLOTS);
  const baseItem = pick(BASE_ITEMS[slot] || BASE_ITEMS["HEAD"]);
  const affixes: Affix[] = [];
  let prefixCount = 0;
  let suffixCount = 0;
  if (rarity === "COMMON") {
    if (Math.random() > 0.5) {
      prefixCount = 1;
    } else {
      suffixCount = 1;
    }
  } else if (rarity === "UNCOMMON") {
    prefixCount = 1;
    suffixCount = 1;
  } else if (rarity === "RARE") {
    if (Math.random() > 0.5) {
      prefixCount = 2;
      suffixCount = 1;
    } else {
      prefixCount = 1;
      suffixCount = 2;
    }
  }

  const used = new Set<string>();
  for (let i = 0; i < prefixCount; i++) {
    let def = pick(PREFIX_DEFS); let s = 0;
    while (used.has(def.name) && s < 10) { def = pick(PREFIX_DEFS); s++; }
    used.add(def.name);
    const tier = rollTier(level, rarity); const val = rollValue(tier);
    affixes.push({ name: def.name, type: "PREFIX", stat: def.stat, value: val, tier });
  }
  for (let i = 0; i < suffixCount; i++) {
    let def = pick(SUFFIX_DEFS); let s = 0;
    while (used.has(def.name) && s < 10) { def = pick(SUFFIX_DEFS); s++; }
    used.add(def.name);
    const tier = rollTier(level, rarity); const val = rollValue(tier);
    affixes.push({ name: def.name, type: "SUFFIX", stat: def.stat, value: val, tier });
  }

  const primaryPrefix = affixes.filter((a) => a.type === "PREFIX").sort((a, b) => b.tier - a.tier)[0];
  const primarySuffix = affixes.filter((a) => a.type === "SUFFIX").sort((a, b) => b.tier - a.tier)[0];
  let name = baseItem.name;
  if (primaryPrefix) name = `${primaryPrefix.name} ${name}`;
  if (primarySuffix) name = `${name} ${primarySuffix.name}`;

  const stats: Record<string, number> = {};
  affixes.forEach((aff) => { stats[aff.stat] = (stats[aff.stat] || 0) + aff.value; });

  return {
    id: Math.random().toString(36).substring(2, 9), name, baseName: baseItem.name,
    rarity, slot, visualId: baseItem.vid, stats, affixes,
    description: `A ${rarity.toLowerCase()} quality item.`, obtainedAt: new Date().toISOString(),
  };
}

function getDisenchantValue(item: LootItem): number {
  const totalTier = (item.affixes || []).reduce((acc: number, a: Affix) => acc + a.tier, 0);
  const avgTier = item.affixes?.length > 0 ? totalTier / item.affixes.length : 1;
  let base = 2;
  if (item.rarity === "UNCOMMON") base = 5;
  else if (item.rarity === "RARE") base = 15;
  else if (item.rarity === "UNIQUE") base = 50;
  return Math.floor(base * (1 + avgTier * 0.2));
}

function calculatePlayerStats(userData: FirebaseFirestore.DocumentData) {
  const base: Record<string, number> = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
  const equipped = userData.gamification?.equipped;
  if (!equipped) return base;
  Object.values(equipped).filter(Boolean).forEach((item) => {
    const lootItem = item as LootItem;
    if (lootItem.stats) {
      Object.entries(lootItem.stats).forEach(([key, val]) => {
        base[key] = (base[key] || 0) + (val as number);
      });
    }
  });
  return base;
}

/**
 * Shared helper: applies XP to a user document inside a transaction.
 * Handles level-up detection, loot generation, class XP, and currency bonus.
 * Returns the computed update fields and whether a level-up occurred.
 */
function buildXPUpdates(
  data: FirebaseFirestore.DocumentData,
  xpAmount: number,
  classType?: string,
  customDropPool?: LootItem[],
): { updates: Record<string, any>; newXP: number; newLevel: number; leveledUp: boolean } {
  const gam = data.gamification || {};
  const currentXP = gam.xp || 0;
  const currentLevel = gam.level || 1;

  // Apply active XP boosts (Flux Shop consumables)
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

    // Award 1 skill point every 2 levels (on even levels)
    // Count how many even levels were crossed from currentLevel+1 to newLevel
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

    const userRecord = await admin.auth().getUserByEmail(ADMIN_EMAIL);
    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    logger.info(`Admin claim set for ${ADMIN_EMAIL}`);
    res.status(200).send(`SUCCESS: Admin claim set for ${ADMIN_EMAIL}. Sign out and back in for it to take effect.`);
  } catch (error) {
    logger.error("Failed to set admin claim", error);
    res.status(500).send("FAILED: An internal error occurred.");
  }
});

// ============================================================
// TELEMETRY FEEDBACK (ported from client lib/telemetry.ts)
// ============================================================

interface TelemetryThresholds {
  flagPasteCount: number;
  flagMinEngagement: number;
  supportKeystrokes: number;
  supportMinEngagement: number;
  successMinKeystrokes: number;
}

const DEFAULT_THRESHOLDS: TelemetryThresholds = {
  flagPasteCount: 5,
  flagMinEngagement: 300,
  supportKeystrokes: 500,
  supportMinEngagement: 1800,
  successMinKeystrokes: 100,
};

function calculateFeedbackServerSide(
  metrics: { pasteCount: number; engagementTime: number; keystrokes: number; tabSwitchCount?: number },
  thresholds: Partial<TelemetryThresholds> = {}
): { status: string; feedback: string } {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  // Assessment-specific: excessive tab switching
  if ((metrics.tabSwitchCount || 0) > 5) {
    return { status: "FLAGGED", feedback: "Excessive tab switching during assessment." };
  }

  // AI Usage Suspicion: High pastes, very low engagement time
  if (metrics.pasteCount > t.flagPasteCount && metrics.engagementTime < t.flagMinEngagement) {
    return { status: "FLAGGED", feedback: "AI Usage Suspected: Abnormal frequency of pasted content detected." };
  }

  // Support Needed: High keystrokes, very long engagement
  if (metrics.keystrokes > t.supportKeystrokes && metrics.engagementTime > t.supportMinEngagement) {
    return { status: "SUPPORT_NEEDED", feedback: "Student may be struggling — high effort with extended time." };
  }

  // Success: No pastes, steady progress
  if (metrics.pasteCount === 0 && metrics.keystrokes > t.successMinKeystrokes) {
    return { status: "SUCCESS", feedback: "Excellent independent work." };
  }

  return { status: "NORMAL", feedback: "Assignment submitted successfully." };
}

// ==========================================
// GAMIFICATION CLOUD FUNCTIONS
// ==========================================

/**
 * awardXP — Server-authoritative XP granting with transaction safety.
 * Called when a student completes engagement with a resource, or by admin for manual adjustment.
 */
export const awardXP = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { targetUserId, amount, classType } = request.data;

  // If targeting someone else, must be admin
  const effectiveUserId = targetUserId || uid;
  if (effectiveUserId !== uid) {
    await verifyAdmin(request.auth);
  }

  // Validate amount
  const xpAmount = Number(amount);
  if (isNaN(xpAmount) || xpAmount === 0) {
    throw new HttpsError("invalid-argument", "Invalid XP amount.");
  }

  // Non-admin students can only earn positive XP, capped per-event
  if (effectiveUserId === uid && !request.auth?.token?.admin) {
    if (xpAmount < 0 || xpAmount > MAX_XP_PER_SUBMISSION) {
      throw new HttpsError("invalid-argument", "XP amount out of range.");
    }
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${effectiveUserId}`);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const { updates, newXP, newLevel, leveledUp } = buildXPUpdates(data, xpAmount, classType);

    transaction.update(userRef, updates);
    return { newXP, newLevel, leveledUp };
  });
});

/**
 * acceptQuest — Student accepts a quest from the board.
 */
export const acceptQuest = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { questId } = request.data;
  if (!questId) throw new HttpsError("invalid-argument", "Quest ID required.");

  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${uid}`);
    const questRef = db.doc(`quests/${questId}`);

    const [userSnap, questSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(questRef),
    ]);

    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
    if (!questSnap.exists) throw new HttpsError("not-found", "Quest not found.");

    const quest = questSnap.data()!;
    if (!quest.isActive) throw new HttpsError("failed-precondition", "Quest is not active.");

    const gamification = userSnap.data()!.gamification || {};
    const activeQuests = gamification.activeQuests || [];
    const completedQuests = gamification.completedQuests || [];

    if (activeQuests.some((q: { questId: string }) => q.questId === questId)) {
      throw new HttpsError("already-exists", "Quest already accepted.");
    }
    if (completedQuests.includes(questId)) {
      throw new HttpsError("already-exists", "Quest already completed.");
    }

    activeQuests.push({ questId, status: "ACCEPTED", acceptedAt: new Date().toISOString() });
    transaction.update(userRef, { "gamification.activeQuests": activeQuests });
    return { success: true };
  });
});

/**
 * deployMission — Student deploys (attempts) an accepted quest. Server checks stats.
 */
export const deployMission = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { questId } = request.data;
  if (!questId) throw new HttpsError("invalid-argument", "Quest ID required.");

  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${uid}`);
    const questRef = db.doc(`quests/${questId}`);

    const [userSnap, questSnap] = await Promise.all([
      transaction.get(userRef), transaction.get(questRef),
    ]);

    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
    if (!questSnap.exists) throw new HttpsError("not-found", "Quest not found.");

    const userData = userSnap.data()!;
    const quest = questSnap.data()!;
    const activeQuests = userData.gamification?.activeQuests || [];
    const questIdx = activeQuests.findIndex((q: { questId: string }) => q.questId === questId);
    if (questIdx === -1) throw new HttpsError("not-found", "Quest not in active list.");

    const stats = calculatePlayerStats(userData);
    const reqs = quest.statRequirements || {};
    const passed =
      (reqs.tech || 0) <= stats.tech && (reqs.focus || 0) <= stats.focus &&
      (reqs.analysis || 0) <= stats.analysis && (reqs.charisma || 0) <= stats.charisma;

    const updatedQuests = [...activeQuests];
    updatedQuests[questIdx] = { ...updatedQuests[questIdx], status: "DEPLOYED", deploymentRoll: passed ? 100 : 0 };
    transaction.update(userRef, { "gamification.activeQuests": updatedQuests });
    return { passed, stats };
  });
});

/**
 * resolveQuest — Admin resolves a deployed quest (success/fail). Awards rewards server-side.
 */
export const resolveQuest = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { userId, questId, success, classType } = request.data;
  if (!userId || !questId) throw new HttpsError("invalid-argument", "userId and questId required.");

  const db = admin.firestore();

  // Pre-fetch custom drop pool before transaction (can't do collection reads inside a transaction)
  const customPool = await fetchCustomDropPool();

  return db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${userId}`);
    const questRef = db.doc(`quests/${questId}`);
    const [userSnap, questSnap] = await Promise.all([transaction.get(userRef), transaction.get(questRef)]);

    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
    if (!questSnap.exists) throw new HttpsError("not-found", "Quest not found.");

    const data = userSnap.data()!;
    const quest = questSnap.data()!;
    const gamification = data.gamification || {};
    const activeQuests = gamification.activeQuests || [];
    const completedQuests = gamification.completedQuests || [];

    const updatedQuests = activeQuests.filter((q: { questId: string }) => q.questId !== questId);
    const updates: Record<string, any> = { "gamification.activeQuests": updatedQuests };

    if (success) {
      if (!completedQuests.includes(questId)) {
        completedQuests.push(questId);
        updates["gamification.completedQuests"] = completedQuests;
      }

      const effectiveClass = classType || data.classType || "";
      const xpReward = Number(quest.xpReward) || 0;
      const fluxReward = Number(quest.fluxReward) || 0;

      // Use shared XP helper for level-up + loot + class XP
      const xpResult = buildXPUpdates(data, xpReward, effectiveClass || undefined, customPool);
      Object.assign(updates, xpResult.updates);

      // Add quest-specific flux reward (on top of the level-up currency bonus)
      if (fluxReward > 0) {
        updates["gamification.currency"] = (updates["gamification.currency"] || (gamification.currency || 0)) + fluxReward;
      }

      // Quest item rewards (separate from level-up loot)
      if (quest.itemRewardRarity) {
        const currentLevel = gamification.level || 1;
        const paths = getProfilePaths(effectiveClass);
        // Use whatever inventory buildXPUpdates already wrote (includes level-up loot), or the profile inventory
        const currentInv = updates[paths.inventory] || getProfileData(data, effectiveClass || undefined).inventory;
        updates[paths.inventory] = [...currentInv, generateLoot(currentLevel, quest.itemRewardRarity), generateLoot(currentLevel)];
      }

      // Custom item reward from library
      if (quest.customItemRewardId && typeof quest.customItemRewardId === "string") {
        const customItemSnap = await transaction.get(db.doc(`customItems/${quest.customItemRewardId}`));
        if (customItemSnap.exists) {
          const raw = customItemSnap.data()! as Record<string, any>;
          const paths = getProfilePaths(effectiveClass);
          const currentInv = updates[paths.inventory] || getProfileData(data, effectiveClass || undefined).inventory;
          // Strip library metadata, grant a fresh copy with new ID and timestamp
          const { createdBy: _a, createdAt: _b, tags: _c, canDropInLoot: _d, dropWeight: _e, ...itemFields } = raw;
          const grantedItem = {
            ...itemFields,
            id: Math.random().toString(36).substring(2, 9),
            obtainedAt: new Date().toISOString(),
          };
          updates[paths.inventory] = [...currentInv, grantedItem];
        }
      }
    }

    transaction.update(userRef, updates);
    return { success: true };
  });
});

/**
 * equipItem — Student equips an item from inventory.
 */
export const equipItem = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, classType } = request.data;
  if (!itemId) throw new HttpsError("invalid-argument", "Item ID required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const { inventory, equipped } = getProfileData(data, classType);

    const itemIdx = inventory.findIndex((i: LootItem) => i.id === itemId);
    if (itemIdx === -1) throw new HttpsError("not-found", "Item not in inventory.");
    const item = inventory[itemIdx];

    let targetSlot = item.slot;
    if (item.slot === "RING") targetSlot = !equipped.RING1 ? "RING1" : "RING2";

    // Swap: if a different item is already in the target slot, return it to inventory
    const newInventory = inventory.filter((_: LootItem, i: number) => i !== itemIdx);
    const existingItem = equipped[targetSlot];
    if (existingItem) {
      newInventory.push(existingItem);
    }

    transaction.update(userRef, {
      [paths.inventory]: newInventory,
      [`${paths.equipped}.${targetSlot}`]: item,
    });
    return { equipped: targetSlot };
  });
});

/**
 * unequipItem — Student moves an equipped item back to inventory.
 */
export const unequipItem = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { slot, classType } = request.data;
  if (!slot) throw new HttpsError("invalid-argument", "Slot required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const { inventory, equipped } = getProfileData(data, classType);

    const item = equipped[slot];
    if (!item) throw new HttpsError("not-found", "No item in that slot.");

    const newInventory = [...inventory, item];
    const newEquipped = { ...equipped };
    delete newEquipped[slot];

    transaction.update(userRef, {
      [paths.inventory]: newInventory,
      [paths.equipped]: newEquipped,
    });
    return { unequipped: slot };
  });
});

/**
 * disenchantItem — Student disenchants an item for Cyber-Flux.
 */
export const disenchantItem = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, classType } = request.data;
  if (!itemId) throw new HttpsError("invalid-argument", "Item ID required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const { inventory, equipped } = getProfileData(data, classType);
    const currentCurrency = data.gamification?.currency || 0;
    const item = inventory.find((i: LootItem) => i.id === itemId);
    if (!item) throw new HttpsError("not-found", "Item not in inventory.");

    const fluxValue = getDisenchantValue(item);
    const newInventory = inventory.filter((i: LootItem) => i.id !== itemId);

    // Also unequip if the item is currently equipped in any slot
    const newEquipped = { ...equipped };
    for (const [slot, eqItem] of Object.entries(newEquipped)) {
      if (eqItem && (eqItem as LootItem).id === itemId) {
        delete newEquipped[slot];
      }
    }

    transaction.update(userRef, {
      [paths.inventory]: newInventory,
      "gamification.currency": currentCurrency + fluxValue,
      [paths.equipped]: newEquipped,
    });
    return { fluxGained: fluxValue };
  });
});

/**
 * craftItem — Student crafts (recalibrate/reforge/optimize) an item. All RNG server-side.
 */
export const craftItem = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, action, classType } = request.data;
  if (!itemId || !action) throw new HttpsError("invalid-argument", "Item ID and action required.");
  if (!["RECALIBRATE", "REFORGE", "OPTIMIZE"].includes(action)) throw new HttpsError("invalid-argument", "Invalid craft action.");

  const cost = FLUX_COSTS[action];
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const { inventory, equipped } = getProfileData(data, classType);
    const currentCurrency = data.gamification?.currency || 0;
    const playerLevel = data.gamification?.level || 1;

    // Check if player wants to use a reroll token for REFORGE
    const rerollTokens = data.gamification?.rerollTokens || 0;
    const useRerollToken = action === "REFORGE" && rerollTokens > 0 && request.data.useRerollToken === true;

    if (!useRerollToken && currentCurrency < cost) throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");

    // Item can be in inventory OR currently equipped — check both
    const itemIdx = inventory.findIndex((i: LootItem) => i.id === itemId);
    let equippedSlot: string | null = null;
    if (itemIdx === -1) {
      for (const [slot, eqItem] of Object.entries(equipped)) {
        if (eqItem && (eqItem as LootItem).id === itemId) { equippedSlot = slot; break; }
      }
      if (!equippedSlot) throw new HttpsError("not-found", "Item not in inventory.");
    }

    const sourceItem = equippedSlot ? equipped[equippedSlot] : inventory[itemIdx];
    const item = JSON.parse(JSON.stringify(sourceItem));
    if (item.rarity === "UNIQUE" && action === "REFORGE") throw new HttpsError("failed-precondition", "Cannot reforge unique items.");

    if (action === "RECALIBRATE") {
      item.affixes.forEach((aff: Affix) => { aff.value = rollValue(aff.tier); });
      item.stats = {};
      item.affixes.forEach((aff: Affix) => { item.stats[aff.stat] = (item.stats[aff.stat] || 0) + aff.value; });
      if (item.rarity === "UNIQUE") {
        const template = UNIQUES.find((u) => u.name === item.name);
        if (template) item.stats[template.uniqueStat.stat] = template.uniqueStat.val;
      }
    } else if (action === "REFORGE") {
      let pCount = 0;
      let sCount = 0;
      if (item.rarity === "COMMON") {
        if (Math.random() > 0.5) {
          pCount = 1;
        } else {
          sCount = 1;
        }
      } else if (item.rarity === "UNCOMMON") {
        pCount = 1;
        sCount = 1;
      } else if (item.rarity === "RARE") {
        if (Math.random() > 0.5) {
          pCount = 2;
          sCount = 1;
        } else {
          pCount = 1;
          sCount = 2;
        }
      }
      item.affixes = []; item.stats = {};
      const usedNames = new Set<string>();
      for (let i = 0; i < pCount; i++) {
        let def = pick(PREFIX_DEFS); let s = 0;
        while (usedNames.has(def.name) && s < 10) { def = pick(PREFIX_DEFS); s++; }
        usedNames.add(def.name);
        const tier = rollTier(playerLevel, item.rarity); const val = rollValue(tier);
        item.affixes.push({ name: def.name, type: "PREFIX", stat: def.stat, value: val, tier });
        item.stats[def.stat] = (item.stats[def.stat] || 0) + val;
      }
      for (let i = 0; i < sCount; i++) {
        let def = pick(SUFFIX_DEFS); let s = 0;
        while (usedNames.has(def.name) && s < 10) { def = pick(SUFFIX_DEFS); s++; }
        usedNames.add(def.name);
        const tier = rollTier(playerLevel, item.rarity); const val = rollValue(tier);
        item.affixes.push({ name: def.name, type: "SUFFIX", stat: def.stat, value: val, tier });
        item.stats[def.stat] = (item.stats[def.stat] || 0) + val;
      }
      const pp = item.affixes.filter((a: Affix) => a.type === "PREFIX").sort((a: Affix, b: Affix) => b.tier - a.tier)[0];
      const ps = item.affixes.filter((a: Affix) => a.type === "SUFFIX").sort((a: Affix, b: Affix) => b.tier - a.tier)[0];
      let newName = item.baseName;
      if (pp) newName = `${pp.name} ${newName}`;
      if (ps) newName = `${newName} ${ps.name}`;
      item.name = newName;
    } else if (action === "OPTIMIZE") {
      item.stats = {};
      item.affixes.forEach((aff: Affix) => {
        const newTier = rollTier(playerLevel, item.rarity);
        aff.tier = Math.max(aff.tier, newTier);
        aff.value = rollValue(aff.tier);
        item.stats[aff.stat] = (item.stats[aff.stat] || 0) + aff.value;
      });
      if (item.rarity === "UNIQUE") {
        const template = UNIQUES.find((u) => u.name === item.name);
        if (template) item.stats[template.uniqueStat.stat] = template.uniqueStat.val;
      }
    }

    // Write modified item back to wherever it was found
    const actualCost = useRerollToken ? 0 : cost;
    const updates: Record<string, unknown> = { "gamification.currency": currentCurrency - actualCost };
    if (useRerollToken) {
      updates["gamification.rerollTokens"] = rerollTokens - 1;
    }
    if (equippedSlot) {
      updates[`${paths.equipped}.${equippedSlot}`] = item;
    } else {
      inventory[itemIdx] = item;
      updates[paths.inventory] = inventory;
    }
    transaction.update(userRef, updates);
    return { item, newCurrency: currentCurrency - actualCost, usedRerollToken: useRerollToken };
  });
});

/**
 * adminUpdateInventory — Admin directly sets a player's inventory and currency.
 */
export const adminUpdateInventory = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { userId, inventory, currency, classType } = request.data;
  if (!userId || typeof userId !== "string") throw new HttpsError("invalid-argument", "User ID required.");
  if (!Array.isArray(inventory)) throw new HttpsError("invalid-argument", "Inventory must be an array.");
  const validatedCurrency = Number(currency);
  if (isNaN(validatedCurrency) || validatedCurrency < 0) throw new HttpsError("invalid-argument", "Currency must be a non-negative number.");
  const db = admin.firestore();
  const updates: Record<string, unknown> = { "gamification.currency": validatedCurrency };
  if (classType && typeof classType === "string") {
    updates[`gamification.classProfiles.${classType}.inventory`] = inventory;
  } else {
    updates["gamification.inventory"] = inventory;
  }
  await db.doc(`users/${userId}`).update(updates);
  return { success: true };
});

/**
 * adminUpdateEquipped — Admin directly sets equipped items.
 */
export const adminUpdateEquipped = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { userId, equipped, classType } = request.data;
  if (!userId || typeof userId !== "string") throw new HttpsError("invalid-argument", "User ID required.");
  if (typeof equipped !== "object" || equipped === null || Array.isArray(equipped)) {
    throw new HttpsError("invalid-argument", "Equipped must be an object.");
  }
  const db = admin.firestore();
  const updates: Record<string, unknown> = {};
  if (classType && typeof classType === "string") {
    updates[`gamification.classProfiles.${classType}.equipped`] = equipped;
  } else {
    updates["gamification.equipped"] = equipped;
  }
  await db.doc(`users/${userId}`).update(updates);
  return { success: true };
});

/**
 * adminGrantItem — Admin adds a specific RPGItem to a student's inventory.
 */
export const adminGrantItem = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { userId, item, classType } = request.data;
  if (!userId || typeof userId !== "string") throw new HttpsError("invalid-argument", "User ID required.");
  if (!item || typeof item !== "object" || !item.id) throw new HttpsError("invalid-argument", "Valid item required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${userId}`);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  const data = snap.data()!;

  const invPath = classType && typeof classType === "string"
    ? `gamification.classProfiles.${classType}.inventory`
    : "gamification.inventory";

  const currentInv: unknown[] = classType
    ? (data.gamification?.classProfiles?.[classType]?.inventory || [])
    : (data.gamification?.inventory || []);

  await userRef.update({ [invPath]: [...currentInv, item] });
  return { success: true };
});

/**
 * adminEditItem — Admin modifies an existing item in a student's inventory by ID.
 */
export const adminEditItem = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { userId, itemId, updates, classType } = request.data;
  if (!userId || typeof userId !== "string") throw new HttpsError("invalid-argument", "User ID required.");
  if (!itemId || typeof itemId !== "string") throw new HttpsError("invalid-argument", "Item ID required.");
  if (!updates || typeof updates !== "object") throw new HttpsError("invalid-argument", "Updates object required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${userId}`);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  const data = snap.data()!;

  const isClassProfile = classType && typeof classType === "string";
  const currentInv: Record<string, unknown>[] = isClassProfile
    ? (data.gamification?.classProfiles?.[classType]?.inventory || [])
    : (data.gamification?.inventory || []);

  const idx = currentInv.findIndex((i: Record<string, unknown>) => i.id === itemId);
  if (idx === -1) throw new HttpsError("not-found", "Item not found in inventory.");

  currentInv[idx] = { ...currentInv[idx], ...updates, id: itemId };

  const invPath = isClassProfile
    ? `gamification.classProfiles.${classType}.inventory`
    : "gamification.inventory";

  await userRef.update({ [invPath]: currentInv });

  // Also update the item if it's currently equipped
  const equippedPath = isClassProfile
    ? data.gamification?.classProfiles?.[classType]?.equipped
    : data.gamification?.equipped;

  if (equippedPath && typeof equippedPath === "object") {
    const eqUpdates: Record<string, unknown> = {};
    for (const [slot, eqItem] of Object.entries(equippedPath as Record<string, Record<string, unknown>>)) {
      if (eqItem && eqItem.id === itemId) {
        const prefix = isClassProfile
          ? `gamification.classProfiles.${classType}.equipped.${slot}`
          : `gamification.equipped.${slot}`;
        eqUpdates[prefix] = { ...eqItem, ...updates, id: itemId };
      }
    }
    if (Object.keys(eqUpdates).length > 0) {
      await userRef.update(eqUpdates);
    }
  }

  return { success: true };
});

// ==========================================
// SCHEDULED FUNCTIONS
// ==========================================

// Weekly reset — Archives THEN deletes, chunked for >500 doc safety
export const sundayReset = onSchedule(
  { schedule: "59 23 * * 0", timeZone: "America/New_York" },
  async () => {
    const db = admin.firestore();
    const collectionsToReset = ["submissions", "evidence"];
    const archiveTimestamp = new Date().toISOString();

    logger.info("Starting weekly reset...");

    for (const collectionName of collectionsToReset) {
      const snapshot = await db.collection(collectionName).get();
      if (snapshot.empty) { logger.info(`No documents in ${collectionName}, skipping.`); continue; }

      // Archive in chunks of 499
      let chunk = db.batch();
      let count = 0;
      for (const docSnap of snapshot.docs) {
        chunk.set(db.collection(`archived_${collectionName}`).doc(docSnap.id), {
          ...docSnap.data(), archivedAt: archiveTimestamp, originalCollection: collectionName,
        });
        count++;
        if (count % 499 === 0) { await chunk.commit(); chunk = db.batch(); }
      }
      if (count % 499 !== 0) await chunk.commit();
      logger.info(`Archived ${count} docs from ${collectionName}.`);

      // Delete in chunks of 499
      chunk = db.batch();
      count = 0;
      for (const docSnap of snapshot.docs) {
        chunk.delete(docSnap.ref);
        count++;
        if (count % 499 === 0) { await chunk.commit(); chunk = db.batch(); }
      }
      if (count % 499 !== 0) await chunk.commit();
      logger.info(`Deleted ${count} docs from ${collectionName}.`);
    }
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

    // 1. Fetch all students
    const usersSnap = await db.collection("users")
      .where("role", "==", "STUDENT").get();
    if (usersSnap.empty) {
      logger.info("dailyAnalysis: No students found. Skipping.");
      return;
    }

    // 2. Fetch recent submissions (from archived + current)
    const submissionsSnap = await db.collection("submissions")
      .where("submittedAt", ">=", windowStartISO).get();

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
export const submitEngagement = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { assignmentId, assignmentTitle, metrics, classType } = request.data;

  if (!assignmentId || !metrics) {
    throw new HttpsError("invalid-argument", "Missing assignmentId or metrics.");
  }

  // Validate metrics are reasonable
  const engagementTime = Number(metrics.engagementTime) || 0;
  const keystrokes = Number(metrics.keystrokes) || 0;
  const pasteCount = Number(metrics.pasteCount) || 0;
  const clickCount = Number(metrics.clickCount) || 0;
  const tabSwitchCount = Number(metrics.tabSwitchCount) || 0;

  // Reject impossible values
  if (engagementTime < 10) {
    throw new HttpsError("invalid-argument", "Engagement too short.");
  }
  if (engagementTime > 14400) {
    // Cap at 4 hours — anything beyond is likely a tab left open
    throw new HttpsError("invalid-argument", "Engagement time exceeds maximum.");
  }

  // Calculate XP server-side — read per-class rate from config if available
  const db = admin.firestore();
  let xpPerMinute = DEFAULT_XP_PER_MINUTE;
  let thresholds: Partial<TelemetryThresholds> = {};
  if (classType) {
    const configSnap = await db.collection("class_configs")
      .where("className", "==", classType).limit(1).get();
    if (!configSnap.empty) {
      const configData = configSnap.docs[0].data();
      if (configData.xpPerMinute && configData.xpPerMinute > 0) {
        xpPerMinute = Math.min(configData.xpPerMinute, 100); // Cap at 100/min safety
      }
      thresholds = configData.telemetryThresholds || {};
    }
  }

  const minutes = engagementTime / 60;
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

  // Create submission
  const validatedMetrics = { engagementTime, keystrokes, pasteCount, tabSwitchCount };
  const submission = {
    userId: uid,
    userName: request.data.userName || "Student",
    assignmentId,
    assignmentTitle: assignmentTitle || "",
    metrics: { engagementTime, keystrokes, pasteCount, clickCount, tabSwitchCount, startTime: metrics.startTime || 0, lastActive: metrics.lastActive || 0 },
    submittedAt: new Date().toISOString(),
    status: calculateFeedbackServerSide(validatedMetrics, thresholds).status,
    score: xpEarned,
    privateComments: [],
    hasUnreadAdmin: false,
    hasUnreadStudent: false,
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

  logger.info(`submitEngagement: ${uid} earned ${xpEarned} XP (${multiplier}x) on ${assignmentId}`);
  return { xpEarned, baseXP, multiplier, leveledUp, status: submission.status };
});

// ==========================================
// SUBMIT ASSESSMENT — Server-side grading + telemetry
// ==========================================
export const submitAssessment = onCall(async (request) => {
  // 1. Verify auth
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");
  const uid = request.auth.uid;

  const { assignmentId, userName, responses, metrics, classType } = request.data;
  if (!assignmentId || !responses || !metrics) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }

  // 2. Read assignment to get answer keys
  const db = admin.firestore();
  const assignmentSnap = await db.doc(`assignments/${assignmentId}`).get();
  if (!assignmentSnap.exists) throw new HttpsError("not-found", "Assignment not found");
  const assignment = assignmentSnap.data()!;

  if (!assignment.isAssessment) throw new HttpsError("invalid-argument", "Not an assessment");

  // 3. Grade auto-gradable blocks
  const blocks = assignment.lessonBlocks || [];
  let correct = 0;
  let total = 0;
  const perBlock: Record<string, { correct: boolean; answer: unknown; needsReview?: boolean }> = {};

  for (const block of blocks) {
    if (["MC", "SHORT_ANSWER", "SORTING", "RANKING"].includes(block.type)) {
      const resp = responses[block.id];
      let isCorrect = false;
      let needsReview = false;

      if (block.type === "MC" && resp?.selected === block.correctAnswer) {
        isCorrect = true;
      }
      if (block.type === "SHORT_ANSWER") {
        const accepted = (block.acceptedAnswers || []).map((a: string) => a.toLowerCase().trim()).filter(Boolean);
        if (accepted.length === 0) {
          // No accepted answers — requires manual/rubric review
          needsReview = true;
        } else {
          isCorrect = accepted.includes((resp?.answer || "").toLowerCase().trim());
        }
      }
      if (block.type === "SORTING") {
        const sortItems = block.sortItems || [];
        const placements = resp?.placements || {};
        isCorrect = sortItems.length > 0 && sortItems.every((item: { correct: string }, idx: number) =>
          placements[String(idx)] === item.correct
        );
      }
      if (block.type === "RANKING") {
        const items = block.items || [];
        const order = resp?.order || [];
        isCorrect = items.length > 0 && order.length === items.length &&
          order.every((o: { item: string }, idx: number) => o.item === items[idx]);
      }

      if (needsReview) {
        perBlock[block.id] = { correct: false, answer: resp, needsReview: true };
      } else {
        total++;
        if (isCorrect) correct++;
        perBlock[block.id] = { correct: isCorrect, answer: resp };
      }
    }
  }

  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  // 4. Determine attempt number
  const existingSubs = await db.collection("submissions")
    .where("userId", "==", uid)
    .where("assignmentId", "==", assignmentId)
    .where("isAssessment", "==", true)
    .get();
  const attemptNumber = existingSubs.size + 1;

  // 5. Calculate telemetry status
  let assessmentThresholds: Partial<TelemetryThresholds> = {};
  if (classType) {
    const configSnap = await db.collection("class_configs")
      .where("className", "==", classType).limit(1).get();
    if (!configSnap.empty) {
      assessmentThresholds = configSnap.docs[0].data().telemetryThresholds || {};
    }
  }
  const { status } = calculateFeedbackServerSide({
    pasteCount: metrics.pasteCount || 0,
    engagementTime: metrics.engagementTime || 0,
    keystrokes: metrics.keystrokes || 0,
    tabSwitchCount: metrics.tabSwitchCount || 0,
  }, assessmentThresholds);

  // 5b. Look up student's section for this class
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
      engagementTime: metrics.engagementTime || 0,
      keystrokes: metrics.keystrokes || 0,
      pasteCount: metrics.pasteCount || 0,
      clickCount: metrics.clickCount || 0,
      startTime: metrics.startTime || 0,
      lastActive: metrics.lastActive || 0,
      tabSwitchCount: metrics.tabSwitchCount || 0,
      perBlockTiming: metrics.perBlockTiming || {},
      typingCadence: metrics.typingCadence || {},
    },
    submittedAt: new Date().toISOString(),
    status,
    score: percentage,
    isAssessment: true,
    attemptNumber,
    assessmentScore: { correct, total, percentage, perBlock },
    blockResponses: responses,
    privateComments: [],
    hasUnreadAdmin: true,
    hasUnreadStudent: false,
    ...(userSection ? { userSection } : {}),
  };

  await db.collection("submissions").add(assessmentSubmission);

  // 7. Award XP scaled by percentage
  const baseXP = Math.round(percentage * 0.5); // 0-50 XP
  let xpEarned = 0;
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

  logger.info(`submitAssessment: ${uid} scored ${percentage}% (${correct}/${total}) on ${assignmentId}, attempt #${attemptNumber}`);
  return {
    assessmentScore: { correct, total, percentage, perBlock },
    attemptNumber,
    status,
    xpEarned,
  };
});

// ==========================================
// SEND CLASS MESSAGE — Server-side mute + moderation
// ==========================================
const BANNED_WORDS = [
  "fuck", "shit", "piss", "ass", "bitch", "damn", "cunt",
  "mierda", "puta", "pendejo", "carajo", "cabron", "verga",
  "joder", "sex", "sexual", "porn",
];
const BANNED_PATTERNS = BANNED_WORDS.map((word) => new RegExp(`\\b${word}\\b`, "i"));

function checkModeration(text: string): boolean {
  const cleaned = text.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "");
  return BANNED_PATTERNS.some((pattern) => pattern.test(cleaned));
}

export const sendClassMessage = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { content, channelId, classType } = request.data;

  if (!content || !channelId) {
    throw new HttpsError("invalid-argument", "Missing content or channelId.");
  }

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Message cannot be empty.");
  }

  if (content.length > 2000) {
    throw new HttpsError("invalid-argument", "Message too long.");
  }

  const db = admin.firestore();

  // Server-side mute check
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }
  const userData = userSnap.data()!;

  if (userData.mutedUntil) {
    const muteEnd = new Date(userData.mutedUntil).getTime();
    if (muteEnd > Date.now()) {
      throw new HttpsError("permission-denied", "You are currently muted.");
    }
  }

  // Validate group membership for group channels
  if (channelId.startsWith("group_")) {
    const groupId = channelId.replace("group_", "");
    const groupSnap = await db.doc(`student_groups/${groupId}`).get();
    if (!groupSnap.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }
    const members = groupSnap.data()!.members || [];
    const isMember = members.some((m: { userId: string }) => m.userId === uid);
    if (!isMember && userData.role !== "ADMIN") {
      throw new HttpsError("permission-denied", "Not a member of this group.");
    }
  }

  // Server-side moderation
  const isFlagged = checkModeration(content);

  const messageData: Record<string, unknown> = {
    senderId: uid,
    senderName: userData.name || "Student",
    content: content.trim(),
    timestamp: new Date().toISOString(),
    isFlagged,
    channelId,
    reactions: {},
    pinnedBy: [],
    isGlobalPinned: false,
  };

  if (isFlagged) {
    messageData.systemNote = "SYSTEM: This message was flagged for inappropriate content.";
  }

  const msgRef = await db.collection("class_messages").add(messageData);

  if (isFlagged) {
    await db.collection("chat_flags").add({
      messageId: msgRef.id,
      senderId: uid,
      senderName: userData.name || "Student",
      content: content.trim(),
      timestamp: new Date().toISOString(),
      classType: classType || "Unknown",
      isResolved: false,
    });
  }

  logger.info(`sendClassMessage: ${uid} sent message in ${channelId}${isFlagged ? " [FLAGGED]" : ""}`);
  return { messageId: msgRef.id, isFlagged };
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
export const awardQuestionXP = onCall(async (request) => {
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
          return { awarded: false, reason: "Too fast" };
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
    logger.error(`awardQuestionXP failed for ${uid}:`, err);
    throw new HttpsError("internal", "Failed to award XP.");
  });
});

/**
 * penalizeWrongAnswer — Deducts XP when a student submits a wrong answer.
 * Penalty = ceil(question.xp / 2). Applied every wrong attempt to discourage
 * random clicking. XP floor is 0 (buildXPUpdates handles this).
 */
export const penalizeWrongAnswer = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { assignmentId, questionId, classType } = request.data;
  if (!assignmentId || !questionId) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

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

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }

    const data = userSnap.data()!;
    const { updates, newXP } = buildXPUpdates(data, -penalty, classType);

    transaction.update(userRef, updates);
    return { penalized: true, penalty, newXP };
  }).catch((err) => {
    if (err instanceof HttpsError) throw err;
    logger.error(`penalizeWrongAnswer failed for ${uid}:`, err);
    throw new HttpsError("internal", "Failed to apply penalty.");
  });
});

// ==========================================
// ENGAGEMENT STREAK LOGIC
// ==========================================

/**
 * updateStreak — Called after engagement submission to update weekly streak.
 */
export const updateStreak = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);

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

    const newStreak = isConsecutive ? currentStreak + 1 : 1;

    transaction.update(userRef, {
      "gamification.engagementStreak": newStreak,
      "gamification.lastStreakWeek": currentWeekId,
    });

    return { streak: newStreak, weekId: currentWeekId };
  });
});

// ==========================================
// DAILY LOGIN REWARD
// ==========================================

const DAILY_LOGIN_REWARDS = [
  { day: 1, xp: 25, flux: 5 },
  { day: 2, xp: 30, flux: 5 },
  { day: 3, xp: 40, flux: 10 },
  { day: 4, xp: 50, flux: 10 },
  { day: 5, xp: 75, flux: 15 },
  { day: 6, xp: 100, flux: 20 },
  { day: 7, xp: 150, flux: 50 },
];

export const claimDailyLogin = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);

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

// ==========================================
// FORTUNE WHEEL
// ==========================================

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

export const spinFortuneWheel = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { classType } = request.data;
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const WHEEL_COST = 25; // Flux cost to spin

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const gam = data.gamification || {};
    const today = new Date().toISOString().split("T")[0];

    if (gam.lastWheelSpin === today) {
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
      "gamification.lastWheelSpin": today,
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

    transaction.update(userRef, updates);

    return { prizeId: prize.id, prizeType: prize.type, rewardDescription };
  });
});

// ==========================================
// SKILL TREE
// ==========================================

// Server-side skill cost map — prevents client from sending a fake cost
const SKILL_COSTS: Record<string, number> = {
  // THEORIST
  th_1: 1, th_2: 1, th_3: 2, th_4: 2, th_5: 3, th_6: 5,
  // EXPERIMENTALIST
  ex_1: 1, ex_2: 1, ex_3: 2, ex_4: 2, ex_5: 3, ex_6: 5,
  // ANALYST
  an_1: 1, an_2: 1, an_3: 2, an_4: 2, an_5: 3, an_6: 5,
  // DIPLOMAT
  di_1: 1, di_2: 1, di_3: 2, di_4: 2, di_5: 3, di_6: 5,
};

export const unlockSkill = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { skillId, specialization } = request.data;
  if (!skillId) throw new HttpsError("invalid-argument", "Skill ID required.");

  // Look up cost server-side — never trust client-sent cost
  const cost = SKILL_COSTS[skillId];
  if (cost === undefined) {
    throw new HttpsError("invalid-argument", `Unknown skill: ${skillId}`);
  }

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

// ==========================================
// ITEM ENCHANTING / SOCKETING
// ==========================================

export const addSocket = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, classType } = request.data;
  if (!itemId) throw new HttpsError("invalid-argument", "Item ID required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);
  const SOCKET_ADD_COST = FLUX_COSTS.SOCKET;

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
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

export const socketGem = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, gemId, classType } = request.data;
  if (!itemId || !gemId) throw new HttpsError("invalid-argument", "Item ID and Gem ID required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);
  const ENCHANT_COST_VAL = FLUX_COSTS.ENCHANT;

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
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

/**
 * unsocketGem — Removes a gem from an item and returns it to the gem inventory.
 * Cost scales with item rarity, gem tier, and number of prior unsockets on the item.
 * Formula: ceil(10 * rarityMult * gemTier * (1 + unsocketCount))
 */
const UNSOCKET_RARITY_MULT: Record<string, number> = {
  COMMON: 1, UNCOMMON: 2, RARE: 4, UNIQUE: 8,
};

export const unsocketGem = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId, gemIndex, classType } = request.data;
  if (!itemId || gemIndex === undefined || gemIndex === null) {
    throw new HttpsError("invalid-argument", "Item ID and gem index required.");
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const paths = getProfilePaths(classType);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
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

// ==========================================
// BOSS ENCOUNTERS (Distributed Counter Pattern)
// ==========================================

const BOSS_SHARD_COUNT = 10; // Supports ~10 concurrent writes/sec

// --- Server-side stat calculation from equipped gear ---
function calculateServerStats(equipped: Record<string, unknown> | undefined): { tech: number; focus: number; analysis: number; charisma: number } {
  const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
  if (!equipped) return base;
  for (const item of Object.values(equipped)) {
    if (!item || typeof item !== 'object') continue;
    const it = item as { stats?: Record<string, number>; gems?: { stat: string; value: number }[]; runewordActive?: string };
    // Item base stats
    if (it.stats) {
      for (const [key, val] of Object.entries(it.stats)) {
        if (key in base) base[key as keyof typeof base] += Number(val) || 0;
      }
    }
    // Gem stats
    if (Array.isArray(it.gems)) {
      for (const gem of it.gems) {
        if (gem.stat in base) base[gem.stat as keyof typeof base] += Number(gem.value) || 0;
      }
    }
  }
  return base;
}

// --- Derived combat stats from player attributes ---
function deriveCombatStats(stats: { tech: number; focus: number; analysis: number; charisma: number }): {
  maxHp: number; armorPercent: number; critChance: number; critMultiplier: number;
} {
  // Charisma → Health: base 100 + 5 per charisma above 10
  const maxHp = 100 + Math.max(0, stats.charisma - 10) * 5;
  // Analysis → Armor: 0.5% damage reduction per point, capped at 50%
  const armorPercent = Math.min(stats.analysis * 0.5, 50);
  // Focus → Crit chance: 1% per point, capped at 40%
  const critChance = Math.min(stats.focus * 0.01, 0.40);
  // Focus → Crit damage: base 2x + 0.02x per focus above 10
  const critMultiplier = 2 + Math.max(0, stats.focus - 10) * 0.02;
  return { maxHp, armorPercent, critChance, critMultiplier };
}

// --- Calculate boss damage from player stats ---
function calculateBossDamage(stats: { tech: number; focus: number; analysis: number; charisma: number }, gearScore: number): { damage: number; isCrit: boolean } {
  // Base damage: 8
  let damage = 8;
  // Tech: primary damage stat (+1 per 5 tech)
  damage += Math.floor(stats.tech / 5);
  // Gear score bonus (+1 per 50 gear score)
  damage += Math.floor(gearScore / 50);
  // Random variance: ±20%
  const variance = 0.8 + Math.random() * 0.4;
  damage = Math.round(damage * variance);
  // Focus: crit chance + crit damage from derived stats
  const { critChance, critMultiplier } = deriveCombatStats(stats);
  const isCrit = Math.random() < critChance;
  if (isCrit) damage = Math.round(damage * critMultiplier);
  // Clamp: min 1, max 200
  return { damage: Math.max(1, Math.min(damage, 200)), isCrit };
}

function calculateServerGearScore(equipped: Record<string, unknown> | undefined): number {
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
  const shardsSnap = await db.collection(`boss_encounters/${bossId}/shards`).get();
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
      // Read damage_log subcollection to find all unique contributors
      const logSnap = await db.collection(`boss_encounters/${bossId}/damage_log`).get();
      const contributorIds = new Set<string>();
      logSnap.forEach(doc => {
        const entry = doc.data();
        if (entry.userId) contributorIds.add(entry.userId);
      });

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

          if (Object.keys(contribUpdates).length > 0) {
            await contribRef.update(contribUpdates);
          }
        } catch (err) {
          console.error(`Failed to reward boss contributor ${contributorId}:`, err);
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

const BOSS_REWARD_TIERS = [1.5, 1.4, 1.3, 1.2, 1.1];
const BOSS_PARTICIPATION_MIN_ATTEMPTS = 5;
const BOSS_PARTICIPATION_MIN_CORRECT = 1;

export const answerBossQuiz = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { quizId, questionId, answer } = request.data;
  if (!quizId || !questionId || answer === undefined) {
    throw new HttpsError("invalid-argument", "Quiz ID, question ID, and answer required.");
  }

  const db = admin.firestore();
  const quizRef = db.doc(`boss_quizzes/${quizId}`);
  const userRef = db.doc(`users/${uid}`);
  const progressRef = db.doc(`boss_quiz_progress/${uid}_${quizId}`);

  const [quizSnap, userSnap, progressSnap] = await Promise.all([
    quizRef.get(), userRef.get(), progressRef.get(),
  ]);

  if (!quizSnap.exists) throw new HttpsError("not-found", "Quiz not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const quiz = quizSnap.data()!;
  if (!quiz.isActive) throw new HttpsError("failed-precondition", "Quiz is not active.");

  const questions = quiz.questions || [];
  const question = questions.find((q: { id: string }) => q.id === questionId);
  if (!question) throw new HttpsError("not-found", "Question not found.");

  // Check if already answered
  const progress = progressSnap.exists
    ? progressSnap.data()!
    : { answeredQuestions: [], currentHp: -1, combatStats: null };
  if (progress.answeredQuestions.includes(questionId)) {
    return {
      alreadyAnswered: true, correct: false, damage: 0, newHp: quiz.currentHp,
      playerDamage: 0, playerHp: progress.currentHp, playerMaxHp: 100,
      knockedOut: false, isCrit: false, healAmount: 0, shieldBlocked: false,
    };
  }

  // Player combat stats from gear
  const userData = userSnap.data()!;
  const gam = userData.gamification || {};
  const activeClass = quiz.classType || userData.classType || "";
  const profile = gam.classProfiles?.[activeClass];
  const equipped = profile?.equipped || gam.equipped || {};
  const playerAttrStats = calculateServerStats(equipped);
  const baseCombat = deriveCombatStats(playerAttrStats);
  let { maxHp } = baseCombat;
  let armorPercent = baseCombat.armorPercent;
  let critChance = baseCombat.critChance;
  let adjustedCritMultiplier = baseCombat.critMultiplier;

  // --- Apply modifiers to combat stats ---
  const mods: { type: string; value?: number }[] = quiz.modifiers || [];
  if (hasMod(mods, "ARMOR_BREAK") || hasMod(mods, "GLASS_CANNON")) armorPercent = 0;
  if (hasMod(mods, "CRIT_SURGE")) critChance = Math.min(1, critChance + modVal(mods, "CRIT_SURGE", 20) / 100);

  // --- Derive player role and apply role bonuses ---
  const playerRole = derivePlayerRole(playerAttrStats);
  let roleDamageMultiplier = 1;
  if (playerRole === 'VANGUARD') roleDamageMultiplier = 1.15;
  if (playerRole === 'STRIKER') {
    critChance = Math.min(1, critChance + 0.10);
    adjustedCritMultiplier += 0.5;
  }

  // --- Check active boss abilities ---
  const activeAbilities: { abilityId: string; effect: string; value: number; remainingQuestions: number }[] = quiz.activeAbilities || [];
  let silenced = false;
  let enrageMultiplier = 1;

  for (const ability of activeAbilities) {
    if (ability.effect === 'SILENCE' && ability.remainingQuestions > 0) silenced = true;
    if (ability.effect === 'ENRAGE' && ability.remainingQuestions > 0) enrageMultiplier = 1 + (ability.value / 100);
    if (ability.effect === 'FOCUS_FIRE' && ability.remainingQuestions > 0) {
      // Focus fire targets top damage dealer — resolved on client via return data
    }
  }

  // Initialize player HP
  let playerHp = progress.currentHp >= 0 ? progress.currentHp : maxHp;
  if (playerHp <= 0) {
    return {
      alreadyAnswered: false, correct: false, damage: 0, newHp: quiz.currentHp,
      playerDamage: 0, playerHp: 0, playerMaxHp: maxHp, knockedOut: true,
      isCrit: false, healAmount: 0, shieldBlocked: false,
    };
  }

  // Initialize combat stats
  const cs = progress.combatStats || {
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

  const batch = db.batch();

  if (isCorrect) {
    cs.questionsCorrect++;
    cs.currentStreak++;
    if (cs.currentStreak > cs.longestStreak) cs.longestStreak = cs.currentStreak;
    cs.correctByDifficulty[question.difficulty as "EASY" | "MEDIUM" | "HARD"]++;

    damage = quiz.damagePerCorrect || 10;
    if (question.damageBonus) damage += question.damageBonus;

    // Modifier: player damage boost
    if (hasMod(mods, "PLAYER_DAMAGE_BOOST")) damage += modVal(mods, "PLAYER_DAMAGE_BOOST", 25);
    // Modifier: double or nothing
    if (hasMod(mods, "DOUBLE_OR_NOTHING")) damage *= 2;
    // Modifier: glass cannon
    if (hasMod(mods, "GLASS_CANNON")) damage *= 2;
    // Modifier: streak bonus
    if (hasMod(mods, "STREAK_BONUS") && cs.currentStreak > 1) {
      damage += modVal(mods, "STREAK_BONUS", 10) * (cs.currentStreak - 1);
    }
    // Modifier: last stand (+50% when below 25% HP)
    if (hasMod(mods, "LAST_STAND") && playerHp < maxHp * 0.25) {
      damage = Math.round(damage * 1.5);
    }

    // Role damage multiplier (VANGUARD +15%)
    damage = Math.round(damage * roleDamageMultiplier);

    // Crit roll — silence prevents crits
    if (!silenced && Math.random() < critChance) {
      isCrit = true;
      damage = Math.round(damage * adjustedCritMultiplier);
      cs.criticalHits++;
    }

    damage = Math.max(1, Math.round(damage));
    cs.totalDamageDealt += damage;

    // Distributed counter: write damage to a random shard
    const shardId = Math.floor(Math.random() * BOSS_SHARD_COUNT).toString();
    batch.set(db.doc(`boss_quizzes/${quizId}/shards/${shardId}`), {
      damageDealt: admin.firestore.FieldValue.increment(damage),
    }, { merge: true });

    // Write to damage_log subcollection for real-time battle feed
    const quizLogRef = db.collection(`boss_quizzes/${quizId}/damage_log`).doc();
    batch.set(quizLogRef, {
      userId: uid,
      userName: userData.name || "Student",
      damage,
      isCrit,
      timestamp: new Date().toISOString(),
    });

    // Award XP
    const xpResult = buildXPUpdates(userData, damage, activeClass);
    batch.update(userRef, xpResult.updates);

    // Modifier: healing wave
    if (hasMod(mods, "HEALING_WAVE")) {
      healAmount = modVal(mods, "HEALING_WAVE", 10);
      playerHp = Math.min(maxHp, playerHp + healAmount);
      cs.healingReceived += healAmount;
    }
  } else {
    cs.currentStreak = 0;
    cs.incorrectByDifficulty[question.difficulty as "EASY" | "MEDIUM" | "HARD"]++;

    // Modifier: shield wall (block first N wrong answers)
    const shieldMax = hasMod(mods, "SHIELD_WALL") ? modVal(mods, "SHIELD_WALL", 2) : 0;
    if (shieldMax > 0 && cs.shieldBlocksUsed < shieldMax) {
      shieldBlocked = true;
      cs.shieldBlocksUsed++;
    } else {
      // Boss retaliates
      let baseBossDamage = question.difficulty === "HARD" ? 30 : question.difficulty === "MEDIUM" ? 20 : 15;
      if (hasMod(mods, "BOSS_DAMAGE_BOOST")) baseBossDamage += modVal(mods, "BOSS_DAMAGE_BOOST", 15);
      if (hasMod(mods, "DOUBLE_OR_NOTHING")) baseBossDamage *= 2;
      // Apply enrage multiplier from active abilities
      baseBossDamage = Math.round(baseBossDamage * enrageMultiplier);

      const rawDamage = baseBossDamage;
      playerDamage = Math.max(1, Math.round(rawDamage * (1 - armorPercent / 100)));
      const damageBlocked = rawDamage - playerDamage;
      cs.damageReduced += Math.max(0, damageBlocked);
      cs.bossDamageTaken += playerDamage;
      playerHp = Math.max(0, playerHp - playerDamage);
    }
  }

  // Modifier: time pressure (lose HP each question regardless)
  if (hasMod(mods, "TIME_PRESSURE")) {
    const tickDmg = modVal(mods, "TIME_PRESSURE", 5);
    playerHp = Math.max(0, playerHp - tickDmg);
    cs.bossDamageTaken += tickDmg;
  }

  // --- Commander healing: on correct answer, heal 2 random allies by 5 HP ---
  if (playerRole === 'COMMANDER' && isCorrect) {
    try {
      const allProgressSnaps = await db.collection("boss_quiz_progress")
        .where("quizId", "==", quizId).get();
      const allies: string[] = [];
      allProgressSnaps.forEach(d => {
        const data = d.data();
        if (data.userId && data.userId !== uid && data.currentHp > 0) allies.push(data.userId);
      });
      const shuffled = allies.sort(() => Math.random() - 0.5).slice(0, 2);
      let totalHealed = 0;
      for (const allyId of shuffled) {
        const allyRef = db.doc(`boss_quiz_progress/${allyId}_${quizId}`);
        const allySnap = await allyRef.get();
        if (allySnap.exists) {
          const allyData = allySnap.data()!;
          const allyMaxHp = allyData.maxHp || 100;
          const oldHp = allyData.currentHp || 0;
          const newAllyHp = Math.min(allyMaxHp, oldHp + 5);
          if (newAllyHp > oldHp) {
            await allyRef.update({ currentHp: newAllyHp });
            totalHealed += (newAllyHp - oldHp);
          }
        }
      }
      cs.roleHealingGiven = (cs.roleHealingGiven || 0) + totalHealed;
    } catch { /* ignore healing errors */ }
  }

  // Persist progress + combat stats (includes role for leaderboard/display)
  batch.set(progressRef, {
    userId: uid,
    quizId,
    answeredQuestions: [...progress.answeredQuestions, questionId],
    currentHp: playerHp,
    maxHp,
    lastUpdated: new Date().toISOString(),
    combatStats: { ...cs, role: playerRole },
  }, { merge: true });

  await batch.commit();

  // Aggregate HP from shards — use scaledMaxHp if set, otherwise maxHp
  const shardsSnap = await db.collection(`boss_quizzes/${quizId}/shards`).get();
  let totalDamage = 0;
  shardsSnap.forEach((d) => { totalDamage += d.data().damageDealt || 0; });
  const effectiveMaxHp = quiz.scaledMaxHp || quiz.maxHp;
  const newHp = Math.max(0, effectiveMaxHp - totalDamage);

  // --- Phase transition check ---
  let phaseTransition: { phase: number; name: string; dialogue?: string; newAppearance?: unknown } | null = null;
  const phases = quiz.phases || [];
  const currentPhase = quiz.currentPhase || 0;
  if (phases.length > 0 && newHp > 0) {
    const hpPercent = (newHp / effectiveMaxHp) * 100;
    for (let i = phases.length - 1; i >= 0; i--) {
      if (i > currentPhase && hpPercent <= phases[i].hpThreshold) {
        phaseTransition = {
          phase: i,
          name: phases[i].name,
          dialogue: phases[i].dialogue,
          newAppearance: phases[i].bossAppearance,
        };
        await quizRef.update({
          currentPhase: i,
          ...(phases[i].damagePerCorrect ? { damagePerCorrect: phases[i].damagePerCorrect } : {}),
        });
        break;
      }
    }
  }

  // --- Boss ability triggers ---
  let triggeredAbility: { name: string; effect: string; value: number } | null = null;
  const bossAbilities = quiz.bossAbilities || [];
  const totalQuestions = (quiz.totalQuestionsAnswered || 0) + 1;

  for (const ability of bossAbilities) {
    let shouldTrigger = false;
    if (ability.trigger === 'EVERY_N_QUESTIONS' && totalQuestions % ability.triggerValue === 0) shouldTrigger = true;
    if (ability.trigger === 'HP_THRESHOLD' && newHp > 0) {
      const hpPct = (newHp / effectiveMaxHp) * 100;
      if (hpPct <= ability.triggerValue) shouldTrigger = true;
    }
    if (ability.trigger === 'RANDOM_CHANCE' && Math.random() * 100 < ability.triggerValue) shouldTrigger = true;
    if (ability.trigger === 'ON_PHASE' && phaseTransition && phaseTransition.phase === ability.triggerValue) shouldTrigger = true;

    if (shouldTrigger) {
      triggeredAbility = { name: ability.name, effect: ability.effect, value: ability.value };

      if (ability.effect === 'AOE_DAMAGE') {
        // Sentinels absorb 20% of AOE damage
        const aoeAmount = playerRole === 'SENTINEL'
          ? Math.round(ability.value * 0.80)
          : ability.value;
        const absorbed = ability.value - aoeAmount;
        playerHp = Math.max(0, playerHp - aoeAmount);
        cs.bossDamageTaken += aoeAmount;
        cs.abilitiesSurvived = (cs.abilitiesSurvived || 0) + 1;
        if (absorbed > 0) cs.aoeDamageAbsorbed = (cs.aoeDamageAbsorbed || 0) + absorbed;
      }
      if (ability.effect === 'HEAL_BOSS') {
        const healAmount = Math.round(effectiveMaxHp * (ability.value / 100));
        const healShardId = Math.floor(Math.random() * BOSS_SHARD_COUNT).toString();
        await db.doc(`boss_quizzes/${quizId}/shards/${healShardId}`).set({
          damageDealt: admin.firestore.FieldValue.increment(-healAmount),
        }, { merge: true });
      }

      if (ability.duration && ability.duration > 0) {
        const updatedAbilities = [
          ...activeAbilities.filter((a) => a.abilityId !== ability.id),
          { abilityId: ability.id, effect: ability.effect, value: ability.value, remainingQuestions: ability.duration },
        ];
        await quizRef.update({ activeAbilities: updatedAbilities });
      }

      break; // Only trigger one ability per answer
    }
  }

  // Decrement remaining questions on active abilities
  if (activeAbilities.length > 0) {
    const decremented = activeAbilities
      .map((a) => ({ ...a, remainingQuestions: a.remainingQuestions - 1 }))
      .filter((a) => a.remainingQuestions > 0);
    await quizRef.update({ activeAbilities: decremented, totalQuestionsAnswered: totalQuestions });
  } else {
    await quizRef.update({ totalQuestionsAnswered: totalQuestions });
  }

  // Boss defeated — distribute tiered rewards
  let bossDefeated = false;
  if (newHp <= 0 && quiz.isActive) {
    await quizRef.update({ isActive: false, currentHp: 0 });
    bossDefeated = true;

    const rewards = quiz.rewards || {};
    const baseRewardXp = rewards.xp || 0;
    const baseRewardFlux = rewards.flux || 0;
    const rewardItemRarity = rewards.itemRarity || null;

    // Collect contributors for both standard rewards and loot
    const allProgressSnaps = await db.collection("boss_quiz_progress")
      .where("quizId", "==", quizId).get();

    const contributors: { id: string; dmg: number; attempts: number; correct: number }[] = [];
    allProgressSnaps.forEach((d) => {
      const data = d.data();
      if (!data.userId) return;
      const stats = data.combatStats || {};
      contributors.push({
        id: data.userId,
        dmg: stats.totalDamageDealt || 0,
        attempts: stats.questionsAttempted || data.answeredQuestions?.length || 0,
        correct: stats.questionsCorrect || 0,
      });
    });
    contributors.sort((a, b) => b.dmg - a.dmg);

    if (baseRewardXp > 0 || baseRewardFlux > 0 || rewardItemRarity) {
      // Build leaderboard sorted by totalDamageDealt
      const quizClass = quiz.classType && quiz.classType !== "GLOBAL" ? quiz.classType : undefined;

      for (let i = 0; i < contributors.length; i++) {
        const c = contributors[i];
        // Participation gate: minimum 5 attempts AND at least 1 correct
        const participated = c.attempts >= BOSS_PARTICIPATION_MIN_ATTEMPTS && c.correct >= BOSS_PARTICIPATION_MIN_CORRECT;
        if (!participated) continue;

        // Tiered multiplier: top 5 get bonuses
        const tierMultiplier = i < BOSS_REWARD_TIERS.length ? BOSS_REWARD_TIERS[i] : 1;

        try {
          const contribRef = db.doc(`users/${c.id}`);
          const contribSnap = await contribRef.get();
          if (!contribSnap.exists) continue;
          const contribData = contribSnap.data()!;
          const contribGam = contribData.gamification || {};
          const contribUpdates: Record<string, any> = {};

          if (baseRewardXp > 0) {
            const scaledXp = Math.round(baseRewardXp * tierMultiplier);
            const xpRes = buildXPUpdates(contribData, scaledXp, quizClass);
            Object.assign(contribUpdates, xpRes.updates);
          }

          if (baseRewardFlux > 0) {
            const scaledFlux = Math.round(baseRewardFlux * tierMultiplier);
            const baseCurrency = contribUpdates["gamification.currency"] ?? (contribGam.currency || 0);
            contribUpdates["gamification.currency"] = baseCurrency + scaledFlux;
          }

          if (rewardItemRarity) {
            const loot = generateLoot(contribGam.level || 1, rewardItemRarity);
            const contribClass = quizClass || contribData.classType;
            if (contribClass && contribClass !== "Uncategorized" && contribGam.classProfiles?.[contribClass]) {
              const inv = contribGam.classProfiles[contribClass].inventory || [];
              contribUpdates[`gamification.classProfiles.${contribClass}.inventory`] = [...inv, loot];
            } else {
              const inv = contribGam.inventory || [];
              contribUpdates["gamification.inventory"] = [...inv, loot];
            }
          }

          // Store the tier rank on progress for client display
          const progressDocRef = db.doc(`boss_quiz_progress/${c.id}_${quizId}`);
          await progressDocRef.update({
            rewardTier: i < BOSS_REWARD_TIERS.length ? i + 1 : 0,
            rewardMultiplier: tierMultiplier,
            participated: true,
          });

          if (Object.keys(contribUpdates).length > 0) {
            await contribRef.update(contribUpdates);
          }
        } catch (err) {
          console.error(`Failed to reward quiz boss contributor ${c.id}:`, err);
        }
      }

      // Mark non-participants
      for (const c of contributors) {
        const participated = c.attempts >= BOSS_PARTICIPATION_MIN_ATTEMPTS && c.correct >= BOSS_PARTICIPATION_MIN_CORRECT;
        if (!participated) {
          try {
            await db.doc(`boss_quiz_progress/${c.id}_${quizId}`).update({
              rewardTier: 0, rewardMultiplier: 0, participated: false,
            });
          } catch { /* ignore */ }
        }
      }
    }

    // --- Distribute boss-specific loot from lootTable ---
    const lootTable = quiz.lootTable || [];
    if (lootTable.length > 0 && contributors.length > 0) {
      const lootDrops: Record<string, unknown[]> = {};
      const quizClass = quiz.classType && quiz.classType !== "GLOBAL" ? quiz.classType : undefined;

      for (const entry of lootTable) {
        let drops = 0;
        const maxDrops = entry.maxDrops || contributors.length;

        for (const c of contributors) {
          if (drops >= maxDrops) break;
          if (c.attempts < BOSS_PARTICIPATION_MIN_ATTEMPTS || c.correct < BOSS_PARTICIPATION_MIN_CORRECT) continue;

          if (Math.random() * 100 < entry.dropChance) {
            if (!lootDrops[c.id]) lootDrops[c.id] = [];
            lootDrops[c.id].push({
              id: Math.random().toString(36).substring(2, 12),
              name: entry.itemName,
              slot: entry.slot,
              rarity: entry.rarity,
              stats: entry.stats || {},
              affixes: [],
              gems: [],
              sockets: 0,
              isBossLoot: true,
              bossName: quiz.bossName,
            });
            drops++;
          }
        }
      }

      for (const [userId, items] of Object.entries(lootDrops)) {
        try {
          const userRef = db.doc(`users/${userId}`);
          const userSnap = await userRef.get();
          if (!userSnap.exists) continue;
          const userData2 = userSnap.data()!;
          const gam2 = userData2.gamification || {};

          if (quizClass && gam2.classProfiles?.[quizClass]) {
            const inv = gam2.classProfiles[quizClass].inventory || [];
            await userRef.update({
              [`gamification.classProfiles.${quizClass}.inventory`]: [...inv, ...items],
            });
          } else {
            const inv = gam2.inventory || [];
            await userRef.update({ "gamification.inventory": [...inv, ...items] });
          }
        } catch { /* ignore individual loot errors */ }
      }
    }
  }

  return {
    correct: isCorrect, damage, newHp, bossDefeated,
    playerDamage, playerHp, playerMaxHp: maxHp,
    knockedOut: playerHp <= 0,
    isCrit, healAmount, shieldBlocked,
    // Phase 1 additions
    playerRole,
    phaseTransition,
    triggeredAbility,
    activeAbilities: activeAbilities.filter((a) => a.remainingQuestions > 0),
  };
});

export const scaleBossHp = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  // Admin check
  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  if (!userSnap.exists || userSnap.data()?.role !== 'ADMIN') {
    throw new HttpsError("permission-denied", "Admin only.");
  }

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
    const usersSnap = await db.collection('users').where('role', '==', 'STUDENT').get();
    const targetStudents: FirebaseFirestore.DocumentData[] = [];

    usersSnap.forEach(d => {
      const data = d.data();
      if (quiz.classType && quiz.classType !== 'GLOBAL') {
        if (data.classType !== quiz.classType) return;
      }
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
          scaledHp *= 1 + ((avgLevel - 10) * 0.005);
        }
      }
    }
  }

  const finalHp = Math.round(scaledHp);
  await quizRef.update({ scaledMaxHp: finalHp, currentHp: finalHp });

  return { scaledMaxHp: finalHp, originalMaxHp: quiz.maxHp };
});

// ==========================================
// GROUP QUESTS / PARTIES
// ==========================================

export const createParty = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { questId, userName } = request.data;
  if (!questId) throw new HttpsError("invalid-argument", "Quest ID required.");

  const db = admin.firestore();
  const questSnap = await db.doc(`quests/${questId}`).get();
  if (!questSnap.exists) throw new HttpsError("not-found", "Quest not found.");

  const quest = questSnap.data()!;
  if (!quest.isGroupQuest) throw new HttpsError("failed-precondition", "Not a group quest.");

  const partyId = Math.random().toString(36).substring(2, 9);
  await db.doc(`parties/${partyId}`).set({
    id: partyId,
    leaderId: uid,
    leaderName: userName || "Leader",
    members: [{ userId: uid, userName: userName || "Leader", joinedAt: new Date().toISOString() }],
    questId,
    status: "FORMING",
    createdAt: new Date().toISOString(),
    maxSize: quest.maxPlayers || 4,
  });

  await db.doc(`users/${uid}`).update({ "gamification.partyId": partyId });

  return { partyId };
});

export const joinParty = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { partyId, userName } = request.data;
  if (!partyId) throw new HttpsError("invalid-argument", "Party ID required.");

  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const partyRef = db.doc(`parties/${partyId}`);
    const partySnap = await transaction.get(partyRef);
    if (!partySnap.exists) throw new HttpsError("not-found", "Party not found.");

    const party = partySnap.data()!;
    if (party.status !== "FORMING") throw new HttpsError("failed-precondition", "Party is no longer accepting members.");
    if (party.members.length >= party.maxSize) throw new HttpsError("failed-precondition", "Party is full.");
    if (party.members.some((m: { userId: string }) => m.userId === uid)) {
      throw new HttpsError("already-exists", "Already in this party.");
    }

    const newMembers = [...party.members, { userId: uid, userName: userName || "Agent", joinedAt: new Date().toISOString() }];
    transaction.update(partyRef, { members: newMembers });
    transaction.update(db.doc(`users/${uid}`), { "gamification.partyId": partyId });

    return { success: true, memberCount: newMembers.length };
  });
});

// ==========================================
// PEER TUTORING
// ==========================================

export const completeTutoring = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { sessionId, tutorId } = request.data;
  if (!sessionId || !tutorId) throw new HttpsError("invalid-argument", "Session ID and tutor ID required.");

  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const sessionRef = db.doc(`tutoring_sessions/${sessionId}`);
    const tutorRef = db.doc(`users/${tutorId}`);
    const [sessionSnap, tutorSnap] = await Promise.all([
      transaction.get(sessionRef), transaction.get(tutorRef),
    ]);

    if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found.");
    if (!tutorSnap.exists) throw new HttpsError("not-found", "Tutor not found.");

    const session = sessionSnap.data()!;
    if (session.status === "VERIFIED") {
      throw new HttpsError("already-exists", "Session already verified.");
    }
    const xpReward = session.xpReward || 75;
    const fluxReward = session.fluxReward || 25;

    const tutorData = tutorSnap.data()!;
    const xpResult = buildXPUpdates(tutorData, xpReward, session.classType || tutorData.classType);
    const gam = tutorData.gamification || {};

    // Add flux ON TOP of any level-up currency bonus
    const baseCurrency = xpResult.updates["gamification.currency"] ?? (gam.currency || 0);

    transaction.update(sessionRef, {
      status: "VERIFIED",
      completedAt: new Date().toISOString(),
      verifiedBy: request.auth?.uid,
    });

    transaction.update(tutorRef, {
      ...xpResult.updates,
      "gamification.currency": baseCurrency + fluxReward,
      "gamification.tutoringSessionsCompleted": (gam.tutoringSessionsCompleted || 0) + 1,
      "gamification.tutoringXpEarned": (gam.tutoringXpEarned || 0) + xpReward,
    });

    return { xpAwarded: xpReward, fluxAwarded: fluxReward };
  });
});

// ==========================================
// KNOWLEDGE-GATED LOOT
// ==========================================

export const claimKnowledgeLoot = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { gateId, classType } = request.data;
  if (!gateId) throw new HttpsError("invalid-argument", "Gate ID required.");

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
    const userData = userSnap.data()!;
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

// ==========================================
// SEASONAL COSMETICS
// ==========================================

export const purchaseCosmetic = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { cosmeticId } = request.data;
  if (!cosmeticId) throw new HttpsError("invalid-argument", "Cosmetic ID required.");

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

// ==========================================
// DAILY CHALLENGES
// ==========================================

export const claimDailyChallenge = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { challengeId, classType } = request.data;
  if (!challengeId) throw new HttpsError("invalid-argument", "Challenge ID required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
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

// ==========================================
// ONE-TIME MIGRATION — sync classXp for single-class students
// REMOVE THIS FUNCTION AFTER RUNNING
// ==========================================
export const migrateClassXp = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const dryRun = request.data?.dryRun !== false; // default true for safety

  const db = admin.firestore();
  const snapshot = await db.collection("users").where("role", "==", "STUDENT").get();

  const BATCH_SIZE = 400;
  const toUpdate: { id: string; name: string; classType: string; currentClassXp: number; totalXp: number }[] = [];

  let skippedMultiClass = 0;
  let skippedAlreadyCorrect = 0;
  let skippedNoClass = 0;
  let skippedNoXp = 0;

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
    totalScanned: snapshot.size,
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

    // Find all students enrolled in this class
    const db = admin.firestore();
    const studentsSnap = await db.collection("users")
      .where("role", "==", "STUDENT")
      .where("isWhitelisted", "==", true)
      .get();

    let emailsSent = 0;
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
    });

    await Promise.all(emailPromises);
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

    // Get all students with active streaks
    const studentsSnap = await db.collection("users")
      .where("role", "==", "STUDENT")
      .where("isWhitelisted", "==", true)
      .get();

    let emailsSent = 0;
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

    await Promise.all(emailPromises);
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
  const snap = await db.collection("assignments").get();

  let updated = 0;
  let skipped = 0;
  const batch = db.batch();

  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.createdAt) {
      skipped++;
      return;
    }
    // Use Firestore's native document creation timestamp
    const createTime = doc.createTime?.toDate().toISOString() ||
      new Date().toISOString();
    batch.update(doc.ref, {
      createdAt: createTime,
      updatedAt: data.updatedAt || createTime,
    });
    updated++;
  });

  if (updated > 0) {
    await batch.commit();
  }

  logger.info(`backfillAssignmentDates: updated ${updated}, skipped ${skipped}`);
  return { updated, skipped };
});

// ==========================================
// DUNGEON EXPEDITION FUNCTIONS
// ==========================================

export const startDungeonRun = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { dungeonId } = request.data;
  if (!dungeonId) throw new HttpsError("invalid-argument", "Dungeon ID required.");

  const db = admin.firestore();
  const dungeonRef = db.doc(`dungeons/${dungeonId}`);
  const userRef = db.doc(`users/${uid}`);

  const [dungeonSnap, userSnap] = await Promise.all([dungeonRef.get(), userRef.get()]);
  if (!dungeonSnap.exists) throw new HttpsError("not-found", "Dungeon not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const dungeon = dungeonSnap.data()!;
  if (!dungeon.isActive) throw new HttpsError("failed-precondition", "Dungeon is not active.");

  const userData = userSnap.data()!;
  const gam = userData.gamification || {};

  // Check level requirement
  if (dungeon.minLevel && (gam.level || 1) < dungeon.minLevel) {
    throw new HttpsError("failed-precondition", `Requires level ${dungeon.minLevel}.`);
  }

  // Check gear score requirement
  const activeClass = dungeon.classType || userData.classType || '';
  const profile = gam.classProfiles?.[activeClass];
  const equipped = profile?.equipped || gam.equipped || {};
  const gearScore = calculateServerGearScore(equipped);
  if (dungeon.minGearScore && gearScore < dungeon.minGearScore) {
    throw new HttpsError("failed-precondition", `Requires gear score ${dungeon.minGearScore}.`);
  }

  // Check reset cooldown — query completed/failed runs separately to avoid complex composite index
  if (dungeon.resetsAt) {
    const completedRuns = await db.collection('dungeon_runs')
      .where('userId', '==', uid)
      .where('dungeonId', '==', dungeonId)
      .where('status', '==', 'COMPLETED')
      .get();
    const failedRuns = await db.collection('dungeon_runs')
      .where('userId', '==', uid)
      .where('dungeonId', '==', dungeonId)
      .where('status', '==', 'FAILED')
      .get();
    const allFinished = [...completedRuns.docs, ...failedRuns.docs]
      .map(d => d.data())
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));

    if (allFinished.length > 0) {
      const lastRun = allFinished[0];
      const lastRunTime = new Date(lastRun.startedAt);
      const now = new Date();

      if (dungeon.resetsAt === 'DAILY') {
        if (lastRunTime.toDateString() === now.toDateString()) {
          throw new HttpsError("failed-precondition", "Dungeon resets daily. Try again tomorrow.");
        }
      } else if (dungeon.resetsAt === 'WEEKLY') {
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        if (now.getTime() - lastRunTime.getTime() < weekMs) {
          throw new HttpsError("failed-precondition", "Dungeon resets weekly.");
        }
      }
    }
  }

  // Check for active run
  const activeRuns = await db.collection('dungeon_runs')
    .where('userId', '==', uid)
    .where('dungeonId', '==', dungeonId)
    .where('status', '==', 'IN_PROGRESS')
    .limit(1)
    .get();

  if (!activeRuns.empty) {
    // Return existing active run
    const existingRun = activeRuns.docs[0].data();
    return { runId: activeRuns.docs[0].id, ...existingRun, resumed: true };
  }

  // Calculate player combat stats
  const playerStats = calculateServerStats(equipped);
  const combat = deriveCombatStats(playerStats);

  // Create new run
  const runId = `${uid}_${dungeonId}_${Date.now()}`;
  const firstRoom = dungeon.rooms?.[0];

  const run = {
    id: runId,
    dungeonId,
    dungeonName: dungeon.name,
    userId: uid,
    currentRoom: 0,
    playerHp: combat.maxHp,
    maxHp: combat.maxHp,
    roomsCleared: 0,
    totalDamageDealt: 0,
    questionsCorrect: 0,
    questionsAttempted: 0,
    status: 'IN_PROGRESS',
    startedAt: new Date().toISOString(),
    answeredQuestions: [],
    currentRoomEnemyHp: firstRoom?.enemyHp || 0,
    lootCollected: [],
    combatStats: {
      totalDamageDealt: 0, criticalHits: 0, damageReduced: 0, bossDamageTaken: 0,
      correctByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
      incorrectByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
      longestStreak: 0, currentStreak: 0, shieldBlocksUsed: 0,
      healingReceived: 0, questionsAttempted: 0, questionsCorrect: 0,
    },
  };

  await db.doc(`dungeon_runs/${runId}`).set(run);

  return { runId, ...run, resumed: false };
});

export const answerDungeonRoom = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { runId, questionId, answer } = request.data;
  if (!runId || !questionId || answer === undefined) {
    throw new HttpsError("invalid-argument", "Run ID, question ID, and answer required.");
  }

  const db = admin.firestore();
  const runRef = db.doc(`dungeon_runs/${runId}`);
  const userRef = db.doc(`users/${uid}`);

  const [runSnap, userSnap] = await Promise.all([runRef.get(), userRef.get()]);
  if (!runSnap.exists) throw new HttpsError("not-found", "Run not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const run = runSnap.data()!;
  if (run.userId !== uid) throw new HttpsError("permission-denied", "Not your run.");
  if (run.status !== 'IN_PROGRESS') throw new HttpsError("failed-precondition", "Run is not active.");

  // Get dungeon data
  const dungeonSnap = await db.doc(`dungeons/${run.dungeonId}`).get();
  if (!dungeonSnap.exists) throw new HttpsError("not-found", "Dungeon not found.");
  const dungeon = dungeonSnap.data()!;

  const currentRoom = dungeon.rooms?.[run.currentRoom];
  if (!currentRoom) throw new HttpsError("not-found", "Room not found.");

  // Find question in current room
  const question = currentRoom.questions?.find((q: { id: string }) => q.id === questionId);
  if (!question) throw new HttpsError("not-found", "Question not found.");

  // Check if already answered
  if (run.answeredQuestions.includes(questionId)) {
    return { alreadyAnswered: true, correct: false, damage: 0, playerHp: run.playerHp, enemyHp: run.currentRoomEnemyHp, roomCleared: false, dungeonComplete: false, dungeonFailed: false };
  }

  // Player combat stats from gear
  const userData = userSnap.data()!;
  const gam = userData.gamification || {};
  const activeClass = dungeon.classType || userData.classType || '';
  const profile = gam.classProfiles?.[activeClass];
  const equipped = profile?.equipped || gam.equipped || {};
  const playerStats = calculateServerStats(equipped);
  const gearScore = calculateServerGearScore(equipped);
  const combat = deriveCombatStats(playerStats);

  let playerHp = run.playerHp;
  let enemyHp = run.currentRoomEnemyHp || currentRoom.enemyHp || 100;
  const cs = run.combatStats || { totalDamageDealt: 0, criticalHits: 0, damageReduced: 0, bossDamageTaken: 0, correctByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 }, incorrectByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 }, longestStreak: 0, currentStreak: 0, shieldBlocksUsed: 0, healingReceived: 0, questionsAttempted: 0, questionsCorrect: 0 };
  cs.questionsAttempted++;

  const isCorrect = Number(answer) === question.correctAnswer;
  let damage = 0;
  let playerDamage = 0;
  let isCrit = false;

  if (isCorrect) {
    cs.questionsCorrect++;
    cs.currentStreak++;
    if (cs.currentStreak > cs.longestStreak) cs.longestStreak = cs.currentStreak;
    cs.correctByDifficulty[question.difficulty as 'EASY' | 'MEDIUM' | 'HARD']++;

    // Calculate damage using existing boss damage formula
    const result = calculateBossDamage(playerStats, gearScore);
    damage = result.damage;
    isCrit = result.isCrit;

    // Add question difficulty bonus
    if (question.damageBonus) damage += question.damageBonus;

    if (isCrit) cs.criticalHits++;
    cs.totalDamageDealt += damage;
    enemyHp = Math.max(0, enemyHp - damage);
  } else {
    cs.currentStreak = 0;
    cs.incorrectByDifficulty[question.difficulty as 'EASY' | 'MEDIUM' | 'HARD']++;

    // Enemy retaliates
    const baseDamage = currentRoom.enemyDamage || (question.difficulty === 'HARD' ? 25 : question.difficulty === 'MEDIUM' ? 15 : 10);
    const rawDamage = baseDamage;
    playerDamage = Math.max(1, Math.round(rawDamage * (1 - combat.armorPercent / 100)));
    cs.damageReduced += Math.max(0, rawDamage - playerDamage);
    cs.bossDamageTaken += playerDamage;
    playerHp = Math.max(0, playerHp - playerDamage);
  }

  // Check room clear
  let roomCleared = false;
  let nextRoom = run.currentRoom;
  let nextEnemyHp = enemyHp;
  let healAmount = 0;
  let lootDrop: unknown = null;

  if (currentRoom.type === 'REST') {
    // REST rooms auto-clear and heal
    roomCleared = true;
    healAmount = currentRoom.healAmount || 25;
    playerHp = Math.min(run.maxHp, playerHp + healAmount);
    cs.healingReceived += healAmount;
  } else if (currentRoom.type === 'TREASURE') {
    // TREASURE rooms auto-clear
    roomCleared = true;
    if (currentRoom.loot?.length) {
      // Roll for room loot
      for (const entry of currentRoom.loot) {
        if (Math.random() * 100 < entry.dropChance) {
          lootDrop = { id: Math.random().toString(36).substring(2, 12), name: entry.itemName, slot: entry.slot, rarity: entry.rarity, stats: entry.stats || {}, affixes: [], gems: [], sockets: 0, isDungeonLoot: true, dungeonName: dungeon.name };
          break;
        }
      }
    }
  } else if (enemyHp <= 0) {
    roomCleared = true;
  }

  // Check if all room questions answered (for PUZZLE rooms)
  const roomQuestions = currentRoom.questions || [];
  const answeredInRoom = [...run.answeredQuestions, questionId].filter(
    (qId: string) => roomQuestions.some((rq: { id: string }) => rq.id === qId)
  );
  if (currentRoom.type === 'PUZZLE' && answeredInRoom.length >= roomQuestions.length) {
    roomCleared = true;
  }

  if (roomCleared) {
    nextRoom = run.currentRoom + 1;
    const nextRoomData = dungeon.rooms?.[nextRoom];
    nextEnemyHp = nextRoomData?.enemyHp || 0;
  }

  // Check dungeon completion or failure
  let dungeonComplete = false;
  let dungeonFailed = false;
  let status = 'IN_PROGRESS';

  if (playerHp <= 0) {
    dungeonFailed = true;
    status = 'FAILED';
  } else if (roomCleared && nextRoom >= (dungeon.rooms?.length || 0)) {
    dungeonComplete = true;
    status = 'COMPLETED';
  }

  // Update run
  const runUpdate: Record<string, unknown> = {
    playerHp,
    currentRoom: roomCleared ? nextRoom : run.currentRoom,
    currentRoomEnemyHp: roomCleared ? nextEnemyHp : enemyHp,
    roomsCleared: roomCleared ? run.roomsCleared + 1 : run.roomsCleared,
    totalDamageDealt: cs.totalDamageDealt,
    questionsCorrect: cs.questionsCorrect,
    questionsAttempted: cs.questionsAttempted,
    answeredQuestions: [...run.answeredQuestions, questionId],
    combatStats: cs,
    status,
  };

  if (lootDrop) {
    runUpdate.lootCollected = [...(run.lootCollected || []), { itemName: (lootDrop as { name: string }).name, rarity: (lootDrop as { rarity: string }).rarity }];
  }

  if (dungeonComplete || dungeonFailed) {
    runUpdate.completedAt = new Date().toISOString();
  }

  await runRef.update(runUpdate);

  // If loot dropped, add to inventory
  if (lootDrop) {
    try {
      if (activeClass && activeClass !== 'Uncategorized' && gam.classProfiles?.[activeClass]) {
        const inv = gam.classProfiles[activeClass].inventory || [];
        await userRef.update({ [`gamification.classProfiles.${activeClass}.inventory`]: [...inv, lootDrop] });
      } else {
        const inv = gam.inventory || [];
        await userRef.update({ "gamification.inventory": [...inv, lootDrop] });
      }
    } catch { /* ignore */ }
  }

  return {
    correct: isCorrect, damage, isCrit, playerDamage, playerHp, enemyHp: roomCleared ? nextEnemyHp : enemyHp,
    roomCleared, dungeonComplete, dungeonFailed, healAmount,
    currentRoom: roomCleared ? nextRoom : run.currentRoom,
    roomsCleared: roomCleared ? run.roomsCleared + 1 : run.roomsCleared,
    lootDrop: lootDrop ? { name: (lootDrop as { name: string }).name, rarity: (lootDrop as { rarity: string }).rarity } : null,
  };
});

export const claimDungeonRewards = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { runId } = request.data;
  if (!runId) throw new HttpsError("invalid-argument", "Run ID required.");

  const db = admin.firestore();
  const runRef = db.doc(`dungeon_runs/${runId}`);
  const runSnap = await runRef.get();
  if (!runSnap.exists) throw new HttpsError("not-found", "Run not found.");

  const run = runSnap.data()!;
  if (run.userId !== uid) throw new HttpsError("permission-denied", "Not your run.");
  if (run.status !== 'COMPLETED') throw new HttpsError("failed-precondition", "Dungeon not completed.");
  if (run.rewardsClaimed) throw new HttpsError("failed-precondition", "Rewards already claimed.");

  // Get dungeon data for rewards
  const dungeonSnap = await db.doc(`dungeons/${run.dungeonId}`).get();
  if (!dungeonSnap.exists) throw new HttpsError("not-found", "Dungeon not found.");
  const dungeon = dungeonSnap.data()!;

  const rewards = dungeon.rewards || {};
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const userData = userSnap.data()!;
  const gam = userData.gamification || {};
  const activeClass = dungeon.classType || userData.classType;

  // Award XP (may trigger level-up with loot)
  const xpResult = buildXPUpdates(userData, rewards.xp || 0, activeClass);
  const updates: Record<string, unknown> = { ...xpResult.updates };

  // Award Flux
  if (rewards.flux) {
    const baseCurrency = updates["gamification.currency"] ?? (gam.currency || 0);
    updates["gamification.currency"] = (baseCurrency as number) + rewards.flux;
  }

  // Generate guaranteed loot if specified
  if (rewards.itemRarity) {
    const loot = generateLoot(gam.level || 1, rewards.itemRarity);
    if (activeClass && activeClass !== 'Uncategorized' && gam.classProfiles?.[activeClass]) {
      const invPath = `gamification.classProfiles.${activeClass}.inventory`;
      const currentInv = updates[invPath] || gam.classProfiles[activeClass].inventory || [];
      updates[invPath] = [...(currentInv as unknown[]), loot];
    } else {
      const currentInv = updates["gamification.inventory"] || gam.inventory || [];
      updates["gamification.inventory"] = [...(currentInv as unknown[]), loot];
    }
  }

  await userRef.update(updates);
  await runRef.update({ rewardsClaimed: true });

  return {
    xpAwarded: rewards.xp || 0,
    fluxAwarded: rewards.flux || 0,
    itemRarityAwarded: rewards.itemRarity || null,
    leveledUp: xpResult.leveledUp,
    newLevel: xpResult.newLevel,
  };
});

// ==========================================
// IDLE AGENT MISSIONS
// ==========================================

export const deployIdleMission = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { missionId } = request.data;
  if (!missionId) throw new HttpsError("invalid-argument", "Mission ID required.");

  const db = admin.firestore();
  const missionRef = db.doc(`idle_missions/${missionId}`);
  const userRef = db.doc(`users/${uid}`);

  const [missionSnap, userSnap] = await Promise.all([missionRef.get(), userRef.get()]);
  if (!missionSnap.exists) throw new HttpsError("not-found", "Mission not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const mission = missionSnap.data()!;
  if (!mission.isActive) throw new HttpsError("failed-precondition", "Mission not active.");

  const userData = userSnap.data()!;
  const gam = userData.gamification || {};

  // Check level requirement
  if (mission.minLevel && (gam.level || 1) < mission.minLevel) {
    throw new HttpsError("failed-precondition", `Requires level ${mission.minLevel}.`);
  }

  // Check mission slots (1 at lv1, 2 at lv25, 3 at lv50)
  const level = gam.level || 1;
  const maxSlots = level >= 50 ? 3 : level >= 25 ? 2 : 1;
  const activeMissions: unknown[] = gam.activeMissions || [];
  const unclaimed = activeMissions.filter((m: any) => !m.claimed);
  if (unclaimed.length >= maxSlots) {
    throw new HttpsError(
      "failed-precondition",
      `All ${maxSlots} mission slot${maxSlots > 1 ? "s" : ""} are in use. Claim or wait for a mission to finish.`
    );
  }

  // Check not already deployed on this specific mission
  if (activeMissions.some((m: any) => m.missionId === missionId && !m.claimed)) {
    throw new HttpsError("failed-precondition", "Already deployed on this mission.");
  }

  // Snapshot player stats from the mission's class profile
  const activeClass = mission.classType || userData.classType || '';
  const profile = gam.classProfiles?.[activeClass];
  const equipped = profile?.equipped || gam.equipped || {};
  const stats = calculateServerStats(equipped);
  const gearScore = calculateServerGearScore(equipped);

  const now = new Date();
  const completesAt = new Date(now.getTime() + mission.duration * 60 * 1000);

  const newMission = {
    missionId,
    missionName: mission.name,
    deployedAt: now.toISOString(),
    completesAt: completesAt.toISOString(),
    stats,
    gearScore,
    classType: activeClass,
    claimed: false,
  };

  await userRef.update({
    "gamification.activeMissions": [...activeMissions, newMission],
  });

  return { deployed: true, completesAt: completesAt.toISOString(), stats, gearScore };
});

export const claimIdleMission = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { missionId } = request.data;
  if (!missionId) throw new HttpsError("invalid-argument", "Mission ID required.");

  const db = admin.firestore();
  const missionRef = db.doc(`idle_missions/${missionId}`);
  const userRef = db.doc(`users/${uid}`);

  const [missionSnap, userSnap] = await Promise.all([missionRef.get(), userRef.get()]);
  if (!missionSnap.exists) throw new HttpsError("not-found", "Mission not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const mission = missionSnap.data()!;
  const userData = userSnap.data()!;
  const gam = userData.gamification || {};
  const activeMissions: any[] = gam.activeMissions || [];

  // Find the matching unclaimed active mission
  const idx = activeMissions.findIndex((m: any) => m.missionId === missionId && !m.claimed);
  if (idx === -1) throw new HttpsError("not-found", "No active mission found.");

  const active = activeMissions[idx];

  // Check if timer has completed
  if (new Date(active.completesAt) > new Date()) {
    throw new HttpsError("failed-precondition", "Mission not yet complete.");
  }

  // Calculate base rewards
  const rewards = mission.rewards || {};
  let xpReward = rewards.xp || 0;
  let fluxReward = rewards.flux || 0;
  const bonusesApplied: string[] = [];

  // Apply stat bonuses
  if (mission.statBonuses?.length) {
    for (const bonus of mission.statBonuses) {
      const statValue = active.stats[bonus.stat] || 10;
      if (statValue >= bonus.threshold) {
        xpReward = Math.round(xpReward * bonus.bonusMultiplier);
        fluxReward = Math.round(fluxReward * bonus.bonusMultiplier);
        bonusesApplied.push(bonus.description);
      }
    }
  }

  // Gear score bonus: +1% rewards per 10 gear score above 0
  const gsBonus = 1 + (active.gearScore / 1000);
  xpReward = Math.round(xpReward * gsBonus);
  fluxReward = Math.round(fluxReward * gsBonus);

  // Award XP (handles level-up logic)
  const xpResult = buildXPUpdates(userData, xpReward, active.classType);
  const updates: Record<string, unknown> = { ...xpResult.updates };

  // Award Flux
  if (fluxReward > 0) {
    const baseCurrency = updates["gamification.currency"] ?? (gam.currency || 0);
    updates["gamification.currency"] = (baseCurrency as number) + fluxReward;
  }

  // Generate loot if specified
  let lootGenerated: unknown = null;
  if (rewards.itemRarity) {
    lootGenerated = generateLoot(gam.level || 1, rewards.itemRarity);
    const activeClass = active.classType;
    if (activeClass && activeClass !== 'Uncategorized' && gam.classProfiles?.[activeClass]) {
      const invPath = `gamification.classProfiles.${activeClass}.inventory`;
      const inv = updates[invPath] || gam.classProfiles[activeClass].inventory || [];
      updates[invPath] = [...(inv as unknown[]), lootGenerated];
    } else {
      const inv = updates["gamification.inventory"] || gam.inventory || [];
      updates["gamification.inventory"] = [...(inv as unknown[]), lootGenerated];
    }
  }

  // Mark mission as claimed
  const updatedMissions = [...activeMissions];
  updatedMissions[idx] = { ...updatedMissions[idx], claimed: true };
  updates["gamification.activeMissions"] = updatedMissions;

  await userRef.update(updates);

  return {
    xpAwarded: xpReward,
    fluxAwarded: fluxReward,
    bonusesApplied,
    leveledUp: xpResult.leveledUp,
    newLevel: xpResult.newLevel,
    loot: lootGenerated ? true : false,
  };
});

// ==========================================
// PVP ARENA
// ==========================================

/**
 * simulateArenaCombat — Server-side 10-round combat simulation.
 * Both players attack simultaneously each round; roles apply bonuses/mitigation.
 */
function simulateArenaCombat(p1: any, p2: any): any[] {
  const rounds: any[] = [];
  let p1Hp = p1.maxHp;
  let p2Hp = p2.maxHp;

  const p1Combat = deriveCombatStats(p1.stats);
  const p2Combat = deriveCombatStats(p2.stats);

  for (let i = 0; i < 10 && p1Hp > 0 && p2Hp > 0; i++) {
    // P1 attacks P2
    const p1Atk = calculateBossDamage(p1.stats, p1.gearScore);
    let p1Dmg = p1Atk.damage;
    if (p1.role === 'VANGUARD') p1Dmg = Math.round(p1Dmg * 1.15);
    const p2Blocked = Math.round(p1Dmg * (p2Combat.armorPercent / 100));
    p1Dmg = Math.max(1, p1Dmg - p2Blocked);
    if (p2.role === 'SENTINEL') p1Dmg = Math.max(1, Math.round(p1Dmg * 0.9));

    // P2 attacks P1
    const p2Atk = calculateBossDamage(p2.stats, p2.gearScore);
    let p2Dmg = p2Atk.damage;
    if (p2.role === 'VANGUARD') p2Dmg = Math.round(p2Dmg * 1.15);
    const p1Blocked = Math.round(p2Dmg * (p1Combat.armorPercent / 100));
    p2Dmg = Math.max(1, p2Dmg - p1Blocked);
    if (p1.role === 'SENTINEL') p2Dmg = Math.max(1, Math.round(p2Dmg * 0.9));

    // Commander heals self each round
    if (p1.role === 'COMMANDER') p1Hp = Math.min(p1.maxHp, p1Hp + 3);
    if (p2.role === 'COMMANDER') p2Hp = Math.min(p2.maxHp, p2Hp + 3);

    p2Hp = Math.max(0, p2Hp - p1Dmg);
    p1Hp = Math.max(0, p1Hp - p2Dmg);

    rounds.push({
      roundNumber: i + 1,
      p1Action: { damage: p1Dmg, isCrit: p1Atk.isCrit, blocked: p2Blocked },
      p2Action: { damage: p2Dmg, isCrit: p2Atk.isCrit, blocked: p1Blocked },
      p1HpAfter: p1Hp,
      p2HpAfter: p2Hp,
    });
  }

  return rounds;
}

/**
 * updateArenaProfiles — Updates both players' arena profiles and awards XP/Flux.
 */
async function updateArenaProfiles(
  db: FirebaseFirestore.Firestore,
  p1Id: string,
  p2Id: string,
  winnerId: string | null,
  classType: string
) {
  const today = new Date().toDateString();

  for (const playerId of [p1Id, p2Id]) {
    const isWinner = playerId === winnerId;
    const userRef = db.doc(`users/${playerId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) continue;

    const userData = userSnap.data()!;
    const gam = userData.gamification || {};
    const ap = gam.arenaProfile || { rating: 1000, wins: 0, losses: 0, matchesPlayedToday: 0 };

    const matchesToday = ap.lastMatchDate === today ? ap.matchesPlayedToday + 1 : 1;

    const updates: Record<string, unknown> = {
      "gamification.arenaProfile": {
        rating: Math.max(0, ap.rating + (isWinner ? 15 : winnerId === null ? 0 : -10)),
        wins: ap.wins + (isWinner ? 1 : 0),
        losses: ap.losses + (!isWinner && winnerId !== null ? 1 : 0),
        matchesPlayedToday: matchesToday,
        lastMatchDate: today,
      },
    };

    // Award XP and Flux
    const xpReward = isWinner ? 50 : 20;
    const fluxReward = isWinner ? 10 : 5;

    const xpResult = buildXPUpdates(userData, xpReward, classType);
    Object.assign(updates, xpResult.updates);

    const baseCurrency = updates["gamification.currency"] ?? (gam.currency || 0);
    updates["gamification.currency"] = (baseCurrency as number) + fluxReward;

    await userRef.update(updates);
  }
}

/**
 * queueArenaDuel — Student calls this to enter the arena matchmaking queue.
 * If an opponent is found within ±100 gear score, the duel is simulated immediately.
 * Otherwise, the player is placed in a QUEUED document to wait for a challenger.
 */
export const queueArenaDuel = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { classType } = request.data;
  if (!classType) throw new HttpsError("invalid-argument", "Class type required.");

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const userData = userSnap.data()!;
  const gam = userData.gamification || {};

  // Check daily match limit (5 per day)
  const arenaProfile: any = gam.arenaProfile || { rating: 1000, wins: 0, losses: 0, matchesPlayedToday: 0 };
  const today = new Date().toDateString();
  if (arenaProfile.lastMatchDate === today && arenaProfile.matchesPlayedToday >= 5) {
    throw new HttpsError("failed-precondition", "Daily match limit reached (5/day).");
  }

  // Get player stats from equipped gear
  const profile = gam.classProfiles?.[classType];
  const equipped = profile?.equipped || gam.equipped || {};
  const stats = calculateServerStats(equipped);
  const gearScore = calculateServerGearScore(equipped);
  const combat = deriveCombatStats(stats);
  const role = derivePlayerRole(stats);

  const player: any = {
    userId: uid,
    name: gam.codename || userData.name || 'Student',
    gearScore,
    stats,
    role,
    hp: combat.maxHp,
    maxHp: combat.maxHp,
  };

  // Search for a queued opponent within gear score bracket
  const queueSnap = await db.collection('arena_matches')
    .where('status', '==', 'QUEUED')
    .where('classType', '==', classType)
    .limit(10)
    .get();

  let matchedDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (const docSnap of queueSnap.docs) {
    const match = docSnap.data();
    if (match.player1?.userId === uid) continue; // Can't fight yourself
    const scoreDiff = Math.abs((match.player1?.gearScore || 0) - gearScore);
    if (scoreDiff <= 100) {
      matchedDoc = docSnap;
      break;
    }
  }

  if (matchedDoc) {
    // Opponent found — simulate combat server-side
    const matchData = matchedDoc.data();
    const p1 = matchData.player1;
    const p2 = player;

    const rounds = simulateArenaCombat(p1, p2);
    const finalRound = rounds[rounds.length - 1];
    const winnerId =
      finalRound.p1HpAfter > finalRound.p2HpAfter ? p1.userId :
      finalRound.p2HpAfter > finalRound.p1HpAfter ? p2.userId :
      null; // Tie = no winner

    await matchedDoc.ref.update({
      player2: p2,
      rounds,
      winnerId: winnerId || null,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    });

    // Update both players' profiles and award rewards
    await updateArenaProfiles(db, p1.userId, p2.userId, winnerId, classType);

    return { status: 'MATCHED', matchId: matchedDoc.id, winnerId, rounds, opponent: p1 };
  } else {
    // No opponent found — join queue
    const matchId = Math.random().toString(36).substring(2, 12);
    await db.doc(`arena_matches/${matchId}`).set({
      id: matchId,
      classType,
      mode: 'AUTO_DUEL',
      player1: player,
      player2: null,
      rounds: [],
      status: 'QUEUED',
      createdAt: new Date().toISOString(),
    });

    return { status: 'QUEUED', matchId };
  }
});

/**
 * cancelArenaQueue — Removes a QUEUED arena match created by the calling user.
 */
export const cancelArenaQueue = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { matchId } = request.data;
  if (!matchId) throw new HttpsError("invalid-argument", "Match ID required.");

  const db = admin.firestore();
  const matchRef = db.doc(`arena_matches/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found.");

  const match = matchSnap.data()!;
  if (match.player1?.userId !== uid) throw new HttpsError("permission-denied", "Not your match.");
  if (match.status !== 'QUEUED') throw new HttpsError("failed-precondition", "Match already in progress.");

  await matchRef.delete();
  return { cancelled: true };
});

// ==========================================
// FLUX SHOP — Consumable Purchases
// ==========================================

/** Server-side item catalog — must mirror client FLUX_SHOP_ITEMS */
const FLUX_SHOP_CATALOG: Record<string, {
  type: 'XP_BOOST' | 'REROLL_TOKEN' | 'NAME_COLOR' | 'AGENT_COSMETIC';
  cost: number;
  value?: number;
  duration?: number; // hours
  dailyLimit: number;
}> = {
  xp_boost_1h: { type: 'XP_BOOST', cost: 75, value: 1.5, duration: 1, dailyLimit: 2 },
  xp_boost_3h: { type: 'XP_BOOST', cost: 150, value: 1.5, duration: 3, dailyLimit: 1 },
  reroll_token: { type: 'REROLL_TOKEN', cost: 50, dailyLimit: 3 },
  name_color_cyan: { type: 'NAME_COLOR', cost: 100, value: 0x00e5ff, dailyLimit: 0 },
  name_color_gold: { type: 'NAME_COLOR', cost: 100, value: 0xffd700, dailyLimit: 0 },
  name_color_magenta: { type: 'NAME_COLOR', cost: 100, value: 0xff00ff, dailyLimit: 0 },
  name_color_lime: { type: 'NAME_COLOR', cost: 100, value: 0x76ff03, dailyLimit: 0 },
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
};

export const purchaseFluxItem = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { itemId } = request.data;
  if (!itemId || typeof itemId !== 'string') throw new HttpsError("invalid-argument", "Item ID required.");

  const item = FLUX_SHOP_CATALOG[itemId];
  if (!item) throw new HttpsError("not-found", "Item not found in shop catalog.");

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
      updates["gamification.nameColor"] = hexColor;
      result.nameColor = hexColor;
    } else if (item.type === 'AGENT_COSMETIC') {
      const ownedCosmetics: string[] = gam.ownedCosmetics || [];
      if (ownedCosmetics.includes(itemId)) {
        throw new HttpsError("already-exists", "You already own this cosmetic.");
      }
      ownedCosmetics.push(itemId);
      updates["gamification.ownedCosmetics"] = ownedCosmetics;
      updates["gamification.activeCosmetic"] = itemId;
      result.cosmeticId = itemId;
    }

    transaction.update(userRef, updates);
    return result;
  });
});

// Equip or unequip an agent cosmetic (server-validated ownership check)
export const equipFluxCosmetic = onCall(async (request) => {
  const uid = verifyAuth(request.auth);
  const { cosmeticId } = request.data;

  // cosmeticId can be null (unequip) or a string (equip)
  if (cosmeticId !== null && typeof cosmeticId !== 'string') {
    throw new HttpsError("invalid-argument", "Cosmetic ID must be a string or null.");
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

  await userRef.update({ "gamification.activeCosmetic": cosmeticId });
  return { success: true, activeCosmetic: cosmeticId };
});

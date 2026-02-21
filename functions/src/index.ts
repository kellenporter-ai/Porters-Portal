import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";


admin.initializeApp();


const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "kellporter2@paps.net";

// ==========================================
// SHARED CONSTANTS (Bug 1 fix: single source of truth)
// ==========================================
const XP_PER_LEVEL = 1000;
const MAX_XP_PER_SUBMISSION = 500;
const DEFAULT_XP_PER_MINUTE = 10;
const ENGAGEMENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

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
  const maxTierAvailable = Math.min(10, Math.max(1, Math.floor(level / 10) + 1));
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

function generateLoot(level: number, forcedRarity?: string): LootItem {
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
): { updates: Record<string, any>; newXP: number; newLevel: number; leveledUp: boolean } {
  const gam = data.gamification || {};
  const currentXP = gam.xp || 0;
  const currentLevel = gam.level || 1;
  const newXP = Math.max(0, currentXP + xpAmount);
  const newLevel = Math.floor(newXP / XP_PER_LEVEL) + 1;
  const leveledUp = newLevel > currentLevel;

  const updates: Record<string, any> = {
    "gamification.xp": newXP,
    "gamification.level": newLevel,
  };

  if (classType) {
    const classXpMap = gam.classXp || {};
    const currentClassXp = classXpMap[classType] || 0;
    updates[`gamification.classXp.${classType}`] = Math.max(0, currentClassXp + xpAmount);
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

    const newItem = generateLoot(newLevel);
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
      const xpResult = buildXPUpdates(data, xpReward, effectiveClass || undefined);
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

    if (currentCurrency < cost) throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");

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
    const updates: Record<string, unknown> = { "gamification.currency": currentCurrency - cost };
    if (equippedSlot) {
      updates[`${paths.equipped}.${equippedSlot}`] = item;
    } else {
      inventory[itemIdx] = item;
      updates[paths.inventory] = inventory;
    }
    transaction.update(userRef, updates);
    return { item, newCurrency: currentCurrency - cost };
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
  if (classType) {
    const configSnap = await db.collection("class_configs")
      .where("className", "==", classType).limit(1).get();
    if (!configSnap.empty) {
      const configData = configSnap.docs[0].data();
      if (configData.xpPerMinute && configData.xpPerMinute > 0) {
        xpPerMinute = Math.min(configData.xpPerMinute, 100); // Cap at 100/min safety
      }
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
  const submission = {
    userId: uid,
    userName: request.data.userName || "Student",
    assignmentId,
    assignmentTitle: assignmentTitle || "",
    metrics: { engagementTime, keystrokes, pasteCount, clickCount, startTime: metrics.startTime || 0, lastActive: metrics.lastActive || 0 },
    submittedAt: new Date().toISOString(),
    status: "SUCCESS",
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
  return { xpEarned, baseXP, multiplier, leveledUp, status: "SUCCESS" };
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
  const tier = Math.min(5, Math.max(1, Math.floor(level / 10) + 1));
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
  const critMultiplier = baseCombat.critMultiplier;

  // --- Apply modifiers to combat stats ---
  const mods: { type: string; value?: number }[] = quiz.modifiers || [];
  if (hasMod(mods, "ARMOR_BREAK") || hasMod(mods, "GLASS_CANNON")) armorPercent = 0;
  if (hasMod(mods, "CRIT_SURGE")) critChance = Math.min(1, critChance + modVal(mods, "CRIT_SURGE", 20) / 100);

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

    // Crit roll
    if (Math.random() < critChance) {
      isCrit = true;
      damage = Math.round(damage * critMultiplier);
      cs.criticalHits++;
    }

    damage = Math.max(1, Math.round(damage));
    cs.totalDamageDealt += damage;

    // Distributed counter: write damage to a random shard
    const shardId = Math.floor(Math.random() * BOSS_SHARD_COUNT).toString();
    batch.set(db.doc(`boss_quizzes/${quizId}/shards/${shardId}`), {
      damageDealt: admin.firestore.FieldValue.increment(damage),
    }, { merge: true });

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

  // Persist progress + combat stats
  batch.set(progressRef, {
    userId: uid,
    quizId,
    answeredQuestions: [...progress.answeredQuestions, questionId],
    currentHp: playerHp,
    maxHp,
    lastUpdated: new Date().toISOString(),
    combatStats: cs,
  }, { merge: true });

  await batch.commit();

  // Aggregate HP from shards
  const shardsSnap = await db.collection(`boss_quizzes/${quizId}/shards`).get();
  let totalDamage = 0;
  shardsSnap.forEach((d) => { totalDamage += d.data().damageDealt || 0; });
  const newHp = Math.max(0, quiz.maxHp - totalDamage);

  // Boss defeated — distribute tiered rewards
  let bossDefeated = false;
  if (newHp <= 0 && quiz.isActive) {
    await quizRef.update({ isActive: false, currentHp: 0 });
    bossDefeated = true;

    const rewards = quiz.rewards || {};
    const baseRewardXp = rewards.xp || 0;
    const baseRewardFlux = rewards.flux || 0;
    const rewardItemRarity = rewards.itemRarity || null;

    if (baseRewardXp > 0 || baseRewardFlux > 0 || rewardItemRarity) {
      const allProgressSnaps = await db.collection("boss_quiz_progress")
        .where("quizId", "==", quizId).get();

      // Build leaderboard sorted by totalDamageDealt
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
  }

  return {
    correct: isCorrect, damage, newHp, bossDefeated,
    playerDamage, playerHp, playerMaxHp: maxHp,
    knockedOut: playerHp <= 0,
    isCrit, healAmount, shieldBlocked,
  };
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
  const snapshot = await db.collection("users").where("role", "==", "student").get();

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

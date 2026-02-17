import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";


admin.initializeApp();


const ADMIN_EMAIL = "kellporter2@paps.net";

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

async function verifyAdmin(auth: any): Promise<void> {
  if (!auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  const user = await admin.auth().getUser(auth.uid);
  if (!user.customClaims?.admin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
}

function verifyAuth(auth: any): string {
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
 * @param {any} data - The user document data.
 * @param {string} classType - The class to resolve profile for.
 * @return {object} Object with inventory and equipped arrays.
 */
function getProfileData(data: any, classType?: string) {
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

const FLUX_COSTS: Record<string, number> = { RECALIBRATE: 5, REFORGE: 25, OPTIMIZE: 50 };

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

function generateLoot(level: number, forcedRarity?: string) {
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
    const template: any = pick(UNIQUES);
    const slot = template.slot || pick(SLOTS);
    const base = pick(BASE_ITEMS[slot] || BASE_ITEMS["HEAD"]);
    const stats: any = {}; const affixes: any[] = [];
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
  const affixes: any[] = [];
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

  const primaryPrefix = affixes.filter((a: any) => a.type === "PREFIX").sort((a: any, b: any) => b.tier - a.tier)[0];
  const primarySuffix = affixes.filter((a: any) => a.type === "SUFFIX").sort((a: any, b: any) => b.tier - a.tier)[0];
  let name = baseItem.name;
  if (primaryPrefix) name = `${primaryPrefix.name} ${name}`;
  if (primarySuffix) name = `${name} ${primarySuffix.name}`;

  const stats: any = {};
  affixes.forEach((aff: any) => { stats[aff.stat] = (stats[aff.stat] || 0) + aff.value; });

  return {
    id: Math.random().toString(36).substring(2, 9), name, baseName: baseItem.name,
    rarity, slot, visualId: baseItem.vid, stats, affixes,
    description: `A ${rarity.toLowerCase()} quality item.`, obtainedAt: new Date().toISOString(),
  };
}

function getDisenchantValue(item: any): number {
  const totalTier = (item.affixes || []).reduce((acc: number, a: any) => acc + a.tier, 0);
  const avgTier = item.affixes?.length > 0 ? totalTier / item.affixes.length : 1;
  let base = 2;
  if (item.rarity === "UNCOMMON") base = 5;
  else if (item.rarity === "RARE") base = 15;
  else if (item.rarity === "UNIQUE") base = 50;
  return Math.floor(base * (1 + avgTier * 0.2));
}

function calculatePlayerStats(userData: any) {
  const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
  const equipped = userData.gamification?.equipped;
  if (!equipped) return base;
  Object.values(equipped).filter(Boolean).forEach((item: any) => {
    if (item.stats) {
      Object.entries(item.stats).forEach(([key, val]) => {
        (base as any)[key] = ((base as any)[key] || 0) + (val as number);
      });
    }
  });
  return base;
}

// ==========================================
// ADMIN SETUP — Set Custom Claims
// ==========================================

// Call this ONCE via browser URL after deploy to bootstrap your admin account.
// e.g., https://us-central1-porters-portal.cloudfunctions.net/setAdminClaim
export const setAdminClaim = onRequest(async (_req, res) => {
  try {
    const userRecord = await admin.auth().getUserByEmail(ADMIN_EMAIL);
    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    logger.info(`Admin claim set for ${ADMIN_EMAIL}`);
    res.status(200).send(`SUCCESS: Admin claim set for ${ADMIN_EMAIL}. Sign out and back in for it to take effect.`);
  } catch (error) {
    logger.error("Failed to set admin claim", error);
    res.status(500).send("FAILED: " + error);
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
    if (xpAmount < 0 || xpAmount > 500) {
      throw new HttpsError("invalid-argument", "XP amount out of range.");
    }
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${effectiveUserId}`);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const data = userSnap.data()!;
    const currentXP = data.gamification?.xp || 0;
    const currentLevel = data.gamification?.level || 1;
    const newXP = Math.max(0, currentXP + xpAmount);
    const newLevel = Math.floor(newXP / XP_PER_LEVEL) + 1;

    const updates: any = {
      "gamification.xp": newXP,
      "gamification.level": newLevel,
    };

    if (classType) {
      const classXpMap = data.gamification?.classXp || {};
      const currentClassXp = classXpMap[classType] || 0;
      updates[`gamification.classXp.${classType}`] = Math.max(0, currentClassXp + xpAmount);
    }

    // Level-up loot drop — goes to the class profile if classType specified
    if (newLevel > currentLevel) {
      const newItem = generateLoot(newLevel);
      if (classType) {
        const classProfile = data.gamification?.classProfiles?.[classType] || {};
        const classInventory = classProfile.inventory || [];
        updates[`gamification.classProfiles.${classType}.inventory`] = [...classInventory, newItem];
      } else {
        const currentInventory = data.gamification?.inventory || [];
        updates["gamification.inventory"] = [...currentInventory, newItem];
      }
    }

    transaction.update(userRef, updates);
    return { newXP, newLevel, leveledUp: newLevel > currentLevel };
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

    if (activeQuests.some((q: any) => q.questId === questId)) {
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
    const questIdx = activeQuests.findIndex((q: any) => q.questId === questId);
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

    const updatedQuests = activeQuests.filter((q: any) => q.questId !== questId);
    const updates: any = { "gamification.activeQuests": updatedQuests };

    if (success) {
      if (!completedQuests.includes(questId)) {
        completedQuests.push(questId);
        updates["gamification.completedQuests"] = completedQuests;
      }
      const currentXP = gamification.xp || 0;
      const currentFlux = gamification.currency || 0;
      const currentLevel = gamification.level || 1;
      const newInventory = [...(gamification.inventory || [])];

      const newXP = currentXP + quest.xpReward;
      const newFlux = currentFlux + (quest.fluxReward || 0);
      const newLevel = Math.floor(newXP / XP_PER_LEVEL) + 1;

      if (quest.itemRewardRarity) {
        newInventory.push(generateLoot(currentLevel, quest.itemRewardRarity));
        newInventory.push(generateLoot(currentLevel)); // Bonus random item
      }
      if (newLevel > currentLevel) {
        newInventory.push(generateLoot(newLevel));
      }

      updates["gamification.xp"] = newXP;
      updates["gamification.currency"] = newFlux;
      updates["gamification.inventory"] = newInventory;
      updates["gamification.level"] = newLevel;

      // Update class-specific XP so student dashboard reflects the change
      const effectiveClass = classType || data.classType || "";
      if (effectiveClass) {
        const classXpMap = gamification.classXp || {};
        const currentClassXp = classXpMap[effectiveClass] || 0;
        updates[`gamification.classXp.${effectiveClass}`] = currentClassXp + quest.xpReward;
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

    const item = inventory.find((i: any) => i.id === itemId);
    if (!item) throw new HttpsError("not-found", "Item not in inventory.");

    let targetSlot = item.slot;
    if (item.slot === "RING") targetSlot = !equipped.RING1 ? "RING1" : "RING2";

    transaction.update(userRef, { [`${paths.equipped}.${targetSlot}`]: item });
    return { equipped: targetSlot };
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
    const item = inventory.find((i: any) => i.id === itemId);
    if (!item) throw new HttpsError("not-found", "Item not in inventory.");

    const fluxValue = getDisenchantValue(item);
    const newInventory = inventory.filter((i: any) => i.id !== itemId);

    // Also unequip if the item is currently equipped in any slot
    const newEquipped = { ...equipped };
    for (const [slot, eqItem] of Object.entries(newEquipped)) {
      if (eqItem && (eqItem as any).id === itemId) {
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
    const { inventory } = getProfileData(data, classType);
    const currentCurrency = data.gamification?.currency || 0;
    const playerLevel = data.gamification?.level || 1;

    if (currentCurrency < cost) throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");
    const itemIdx = inventory.findIndex((i: any) => i.id === itemId);
    if (itemIdx === -1) throw new HttpsError("not-found", "Item not in inventory.");

    const item = JSON.parse(JSON.stringify(inventory[itemIdx]));
    if (item.rarity === "UNIQUE" && action === "REFORGE") throw new HttpsError("failed-precondition", "Cannot reforge unique items.");

    if (action === "RECALIBRATE") {
      item.affixes.forEach((aff: any) => { aff.value = rollValue(aff.tier); });
      item.stats = {};
      item.affixes.forEach((aff: any) => { item.stats[aff.stat] = (item.stats[aff.stat] || 0) + aff.value; });
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
      const pp = item.affixes.filter((a: any) => a.type === "PREFIX").sort((a: any, b: any) => b.tier - a.tier)[0];
      const ps = item.affixes.filter((a: any) => a.type === "SUFFIX").sort((a: any, b: any) => b.tier - a.tier)[0];
      let newName = item.baseName;
      if (pp) newName = `${pp.name} ${newName}`;
      if (ps) newName = `${newName} ${ps.name}`;
      item.name = newName;
    } else if (action === "OPTIMIZE") {
      item.stats = {};
      item.affixes.forEach((aff: any) => {
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

    inventory[itemIdx] = item;
    transaction.update(userRef, { [paths.inventory]: inventory, "gamification.currency": currentCurrency - cost });
    return { item, newCurrency: currentCurrency - cost };
  });
});

/**
 * adminUpdateInventory — Admin directly sets a player's inventory and currency.
 */
export const adminUpdateInventory = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { userId, inventory, currency } = request.data;
  if (!userId) throw new HttpsError("invalid-argument", "User ID required.");
  const db = admin.firestore();
  await db.doc(`users/${userId}`).update({ "gamification.inventory": inventory || [], "gamification.currency": currency ?? 0 });
  return { success: true };
});

/**
 * adminUpdateEquipped — Admin directly sets equipped items.
 */
export const adminUpdateEquipped = onCall(async (request) => {
  await verifyAdmin(request.auth);
  const { userId, equipped } = request.data;
  if (!userId) throw new HttpsError("invalid-argument", "User ID required.");
  const db = admin.firestore();
  await db.doc(`users/${userId}`).update({ "gamification.equipped": equipped || {} });
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
// UTILITY FUNCTIONS
// ==========================================

export const fixCors = onRequest(async (_req, res) => {
  try {
    const bucket = admin.storage().bucket();
    await bucket.setCorsConfiguration([{
      origin: ["*"],
      method: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
      maxAgeSeconds: 3600,
    }]);
    logger.info("CORS configuration updated for bucket");
    res.status(200).send("SUCCESS: Storage permissions fixed.");
  } catch (error) {
    logger.error("Failed to set CORS", error);
    res.status(500).send("FAILED: " + error);
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

  // Rate limiting: use a dedicated doc to avoid composite index requirement
  const rateLimitRef = db.doc(`engagement_cooldowns/${uid}_${assignmentId}`);
  const rateLimitSnap = await rateLimitRef.get();
  if (rateLimitSnap.exists) {
    const lastTime = rateLimitSnap.data()!.lastSubmitted || 0;
    const cooldownMs = ENGAGEMENT_COOLDOWN_MS;
    if (Date.now() - lastTime < cooldownMs) {
      throw new HttpsError("resource-exhausted",
        "Please wait before resubmitting this resource.");
    }
  }

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

  // Update rate limit timestamp
  await rateLimitRef.set({ lastSubmitted: Date.now() }, { merge: true });

  // Award XP via transaction (same logic as awardXP)
  const effectiveClass = classType || "Uncategorized";
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return;

    const data = userSnap.data()!;
    const gam = data.gamification || {};
    const currentXP = gam.xp || 0;
    const newXP = currentXP + xpEarned;
    const currentClassXP = gam.classXp?.[effectiveClass] || 0;
    const newClassXP = currentClassXP + xpEarned;
    const currentLevel = gam.level || 1;
    const newLevel = Math.floor(newXP / XP_PER_LEVEL) + 1;

    // Use dot-notation to avoid stomping concurrent gamification changes
    const updates: Record<string, any> = {
      "gamification.xp": newXP,
      [`gamification.classXp.${effectiveClass}`]: newClassXP,
    };

    if (newLevel > currentLevel) {
      updates["gamification.level"] = newLevel;
      updates["gamification.currency"] = (gam.currency || 0) + 100;

      // Generate loot drop on level-up (matches awardXP/awardQuestionXP behavior)
      const newItem = generateLoot(newLevel);
      if (effectiveClass && effectiveClass !== "Uncategorized") {
        const cp = data.gamification?.classProfiles?.[effectiveClass] || {};
        const inv = cp.inventory || [];
        updates[`gamification.classProfiles.${effectiveClass}.inventory`] =
          [...inv, newItem];
      } else {
        const inv = data.gamification?.inventory || [];
        updates["gamification.inventory"] = [...inv, newItem];
      }
    }

    transaction.update(userRef, updates);
  });

  logger.info(`submitEngagement: ${uid} earned ${xpEarned} XP (${multiplier}x) on ${assignmentId}`);
  return { xpEarned, baseXP, multiplier, status: "SUCCESS" };
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

  // Light validation — check a few required fields
  const valid = questions.every((q: any) =>
    q.id && q.tier && q.type && q.stem && q.options && q.correctAnswer);
  if (!valid) {
    throw new HttpsError(
      "invalid-argument",
      "Some questions are missing required fields (id, tier, type, stem, options, correctAnswer).",
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
    const question = questions.find((q: any) => q.id === questionId);
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
    const currentXP = data.gamification?.xp || 0;
    const newXP = currentXP + serverXP;
    const newLevel = Math.floor(newXP / XP_PER_LEVEL) + 1;
    const currentLevel = data.gamification?.level || 1;

    const updates: any = {
      "gamification.xp": newXP,
      "gamification.level": newLevel,
    };

    if (classType) {
      const classXpMap = data.gamification?.classXp || {};
      updates[`gamification.classXp.${classType}`] =
        (classXpMap[classType] || 0) + serverXP;
    }

    if (newLevel > currentLevel) {
      const newItem = generateLoot(newLevel);
      if (classType) {
        const cp =
          data.gamification?.classProfiles?.[classType] || {};
        const inv = cp.inventory || [];
        const pth = "gamification.classProfiles" +
          `.${classType}.inventory`;
        updates[pth] = [...inv, newItem];
      } else {
        const inv = data.gamification?.inventory || [];
        updates["gamification.inventory"] = [...inv, newItem];
      }
    }

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
      leveledUp: newLevel > currentLevel,
    };
  }).catch((err: any) => {
    // Rec 2: Log unexpected errors for debugging
    if (err instanceof HttpsError) throw err;
    logger.error(`awardQuestionXP failed for ${uid}:`, err);
    throw new HttpsError("internal", "Failed to award XP.");
  });
});

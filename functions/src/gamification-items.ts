import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  verifyAuth,
  verifyAdmin,
  buildXPUpdates,
  getProfilePaths,
  getProfileData,
  MAX_XP_PER_SUBMISSION,
  LootItem,
  Affix,
  generateCorrelationId,
  logWithCorrelation,
} from "./core";
import { checkAndUnlockAchievements, writeAchievementNotifications } from "./achievements";

// ── Gear slots ──────────────────────────────────────────────────────
const SLOTS = [
  "weapon", "chest", "helmet", "gloves", "boots",
  "accessory1", "accessory2", "mount",
];

// ── Base items per slot ─────────────────────────────────────────────
interface BaseItemDef {
  name: string;
  slot: string;
  visualId: string;
  baseStats: Record<string, number>;
}

const BASE_ITEMS: BaseItemDef[] = [
  { name: "Blaster Pistol", slot: "weapon", visualId: "blaster_pistol", baseStats: { tech: 2 } },
  { name: "Nano Sabre", slot: "weapon", visualId: "nano_sabre", baseStats: { tech: 3 } },
  { name: "Tactical Jacket", slot: "chest", visualId: "tactical_jacket", baseStats: { focus: 2 } },
  { name: "Energy Armor", slot: "chest", visualId: "energy_armor", baseStats: { analysis: 2 } },
  { name: "Recon Visor", slot: "helmet", visualId: "recon_visor", baseStats: { focus: 1, analysis: 1 } },
  { name: "Titan Helm", slot: "helmet", visualId: "titan_helm", baseStats: { charisma: 2 } },
  { name: "Tech Gloves", slot: "gloves", visualId: "tech_gloves", baseStats: { tech: 1, focus: 1 } },
  { name: "Stealth Boots", slot: "boots", visualId: "stealth_boots", baseStats: { focus: 2 } },
  { name: "Command Boots", slot: "boots", visualId: "command_boots", baseStats: { charisma: 2 } },
  { name: "Data Chip", slot: "accessory1", visualId: "data_chip", baseStats: { analysis: 2 } },
  { name: "Focus Lens", slot: "accessory2", visualId: "focus_lens", baseStats: { focus: 2 } },
  { name: "Hoverboard", slot: "mount", visualId: "hoverboard", baseStats: { charisma: 3 } },
];

// ── Prefix / Suffix affix tables ────────────────────────────────────
interface AffixDef {
  name: string;
  stat: string;
  valueAtTier1: number;
}

const PREFIX_DEFS: AffixDef[] = [
  { name: "Sharp", stat: "tech", valueAtTier1: 2 },
  { name: "Reinforced", stat: "analysis", valueAtTier1: 2 },
  { name: "Swift", stat: "focus", valueAtTier1: 2 },
  { name: "Charming", stat: "charisma", valueAtTier1: 2 },
  { name: "Balanced", stat: "tech", valueAtTier1: 1 },
  { name: "Sturdy", stat: "analysis", valueAtTier1: 1 },
  { name: "Agile", stat: "focus", valueAtTier1: 1 },
  { name: "Inspiring", stat: "charisma", valueAtTier1: 1 },
];

const SUFFIX_DEFS: AffixDef[] = [
  { name: "of Power", stat: "tech", valueAtTier1: 3 },
  { name: "of Wisdom", stat: "analysis", valueAtTier1: 3 },
  { name: "of Speed", stat: "focus", valueAtTier1: 3 },
  { name: "of Leadership", stat: "charisma", valueAtTier1: 3 },
  { name: "of Might", stat: "tech", valueAtTier1: 2 },
  { name: "of Insight", stat: "analysis", valueAtTier1: 2 },
  { name: "of Haste", stat: "focus", valueAtTier1: 2 },
  { name: "of Command", stat: "charisma", valueAtTier1: 2 },
];

// ── Unique pool (rare drops) ────────────────────────────────────────
interface UniqueDef {
  name: string;
  slot: string;
  visualId: string;
  stats: Record<string, number>;
  effects?: { id: string; name: string; description: string; type: string }[];
  description: string;
}

const UNIQUES: UniqueDef[] = [
  {
    name: "Eternity Edge",
    slot: "weapon",
    visualId: "eternity_edge",
    stats: { tech: 8, focus: 5 },
    effects: [{ id: "eternity_proc", name: "Eternal Strike", description: "10% chance to deal double damage", type: "combat" }],
    description: "Forged in the heart of a dying star.",
  },
  {
    name: "Voidweave Cloak",
    slot: "chest",
    visualId: "voidweave_cloak",
    stats: { analysis: 8, charisma: 4 },
    effects: [{ id: "void_shroud", name: "Void Shroud", description: "Reduces incoming damage by 15%", type: "combat" }],
    description: "Woven from the fabric of a black hole.",
  },
  {
    name: "Crown of the Architect",
    slot: "helmet",
    visualId: "architect_crown",
    stats: { focus: 8, analysis: 5 },
    effects: [{ id: "architects_gaze", name: "Architect's Gaze", description: "Reveals hidden traps in dungeons", type: "exploration" }],
    description: "Worn by the builder of the cosmos.",
  },
  {
    name: "Starlight Gauntlets",
    slot: "gloves",
    visualId: "starlight_gauntlets",
    stats: { tech: 6, focus: 4, charisma: 2 },
    effects: [{ id: "starlight_touch", name: "Starlight Touch", description: "Crafting success rate +20%", type: "crafting" }],
    description: "Each thread pulses with captured starlight.",
  },
  {
    name: "Chrono Boots",
    slot: "boots",
    visualId: "chrono_boots",
    stats: { focus: 10 },
    effects: [{ id: "time_dilation", name: "Time Dilation", description: "+15% movement speed in all modes", type: "movement" }],
    description: "Step outside the river of time.",
  },
];

// ── Flux costs ──────────────────────────────────────────────────────
const FLUX_COSTS: Record<string, number> = {
  REROLL: 25,
  CRAFT_COMMON: 10,
  CRAFT_UNCOMMON: 25,
  CRAFT_RARE: 50,
  CRAFT_UNIQUE: 100,
  SALVAGE: 0,
  UPGRADE: 50,
  TRADE: 10,
};

// ── Random helpers ──────────────────────────────────────────────────
function pick<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollTier(playerLevel: number): number {
  const maxTier = Math.min(10, Math.ceil(playerLevel / 5));
  const roll = Math.random();
  if (roll < 0.4) return Math.max(1, maxTier - 2);
  if (roll < 0.7) return Math.max(1, maxTier - 1);
  if (roll < 0.9) return maxTier;
  return Math.min(10, maxTier + 1);
}

function rollValue(baseValue: number, tier: number): number {
  return Math.ceil(baseValue * (0.8 + tier * 0.2 + Math.random() * 0.2));
}

function generateLoot(
  playerLevel: number,
  rarityOverride?: string,
  customPool?: LootItem[],
): LootItem {
  if (customPool && customPool.length > 0 && Math.random() < 0.5) {
    const item = pick(customPool)!;
    return { ...item, id: `${item.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, obtainedAt: new Date().toISOString() };
  }
  const roll = Math.random();
  let rarity: string;
  if (rarityOverride) {
    rarity = rarityOverride;
  } else if (roll < 0.01) {
    rarity = "UNIQUE";
  } else if (roll < 0.1) {
    rarity = "RARE";
  } else if (roll < 0.35) {
    rarity = "UNCOMMON";
  } else {
    rarity = "COMMON";
  }

  const tier = rollTier(playerLevel);

  if (rarity === "UNIQUE") {
    const unique = pick(UNIQUES);
    if (unique) {
      return {
        id: `unique_${unique.name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`,
        name: unique.name,
        baseName: unique.name,
        rarity: "UNIQUE",
        slot: unique.slot,
        visualId: unique.visualId,
        stats: unique.stats,
        affixes: [],
        effects: unique.effects,
        description: unique.description,
        obtainedAt: new Date().toISOString(),
      };
    }
  }

  const base = pick(BASE_ITEMS.filter((b) => b.slot === pick(SLOTS))) || BASE_ITEMS[0];
  const affixes: Affix[] = [];
  if (rarity !== "COMMON") {
    const prefix = pick(PREFIX_DEFS);
    if (prefix) {
      affixes.push({ name: prefix.name, type: "PREFIX", stat: prefix.stat, value: rollValue(prefix.valueAtTier1, tier), tier });
    }
  }
  if (rarity === "RARE" || rarity === "UNIQUE") {
    const suffix = pick(SUFFIX_DEFS);
    if (suffix) {
      affixes.push({ name: suffix.name, type: "SUFFIX", stat: suffix.stat, value: rollValue(suffix.valueAtTier1, tier), tier });
    }
  }
  const stats: Record<string, number> = { ...base.baseStats };
  for (const a of affixes) {
    stats[a.stat] = (stats[a.stat] || 0) + a.value;
  }

  return {
    id: `loot_${base.slot}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: affixes.length > 0 ? `${affixes.find((a) => a.type === "PREFIX")?.name || ""} ${base.name} ${affixes.find((a) => a.type === "SUFFIX")?.name || ""}`.trim() : base.name,
    baseName: base.name,
    rarity,
    slot: base.slot,
    visualId: base.visualId,
    stats,
    affixes,
    description: `A ${rarity.toLowerCase()} ${base.name.toLowerCase()} with ${affixes.length} magical properties.`,
    obtainedAt: new Date().toISOString(),
  };
}

function getDisenchantValue(item: LootItem): number {
  let value = 5;
  switch (item.rarity) {
    case "UNCOMMON": value = 15; break;
    case "RARE": value = 40; break;
    case "UNIQUE": value = 100; break;
  }
  for (const a of item.affixes) {
    value += a.tier * 3;
  }
  return value;
}

// ── Cloud Functions ─────────────────────────────────────────────────

export const awardXP = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  const userId = verifyAuth(request.auth);
  const { xpAmount, classType } = request.data || {};
  if (typeof xpAmount !== "number" || xpAmount <= 0) {
    throw new HttpsError("invalid-argument", "xpAmount must be a positive number.");
  }
  if (xpAmount > MAX_XP_PER_SUBMISSION) {
    throw new HttpsError("invalid-argument", `Maximum XP per submission is ${MAX_XP_PER_SUBMISSION}.`);
  }
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  const rateLimitRef = db.collection("xp_rate_limits").doc(userId);
  await db.runTransaction(async (t) => {
    const [userSnap, rateSnap] = await Promise.all([
      t.get(userRef),
      t.get(rateLimitRef),
    ]);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    // Rate limiting: 5-second gap + 5000 XP/day cap
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const rateData = rateSnap.exists ? rateSnap.data()! : null;
    if (rateData) {
      const lastAwardAt = typeof rateData.lastAwardAt === "number" ? rateData.lastAwardAt : 0;
      if (now - lastAwardAt < 5000) {
        throw new HttpsError("resource-exhausted", "XP award rate limited. Please wait at least 5 seconds between awards.");
      }
      const dayKey = rateData.dayKey || "";
      const dailyTotal = typeof rateData.dailyTotal === "number" ? rateData.dailyTotal : 0;
      const currentDaily = dayKey === today ? dailyTotal : 0;
      if (currentDaily + xpAmount > 5000) {
        throw new HttpsError("resource-exhausted", "Daily XP cap of 5000 reached.");
      }
    }

    const data = userSnap.data()!;
    const result = buildXPUpdates(data, xpAmount, classType);
    const achievementResult = checkAndUnlockAchievements(data, result.updates, true);
    const finalUpdates = { ...result.updates, ...achievementResult.rewardUpdates };
    t.update(userRef, finalUpdates);

    const currentDailyTotal = (rateData?.dayKey === today && typeof rateData?.dailyTotal === "number") ? rateData.dailyTotal : 0;
    t.set(rateLimitRef, {
      lastAwardAt: now,
      dailyTotal: currentDailyTotal + xpAmount,
      dayKey: today,
    });

    if (achievementResult.newUnlocks.length > 0) {
      await writeAchievementNotifications(db, userId, achievementResult.newUnlocks);
    }
  });
  logWithCorrelation('info', 'XP awarded', correlationId, { userId, xpAmount, classType });
  return { success: true };
});

export const equipItem = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  const userId = verifyAuth(request.auth);
  const { itemId, slot, classType } = request.data || {};
  if (typeof itemId !== "string" || typeof slot !== "string") {
    throw new HttpsError("invalid-argument", "itemId and slot are required.");
  }
  const paths = getProfilePaths(classType);
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "User not found.");
    const data = snap.data()!;
    const { inventory, equipped } = getProfileData(data, classType);
    const itemIndex = inventory.findIndex((it: any) => it.id === itemId);
    if (itemIndex === -1) throw new HttpsError("not-found", "Item not found in inventory.");
    const item = inventory[itemIndex];
    if (item.slot !== slot) throw new HttpsError("invalid-argument", `Item ${item.name} cannot be equipped in ${slot} slot.`);
    const newInventory = inventory.filter((_: any, i: number) => i !== itemIndex);
    const newEquipped = { ...equipped, [slot]: item };
    if (classType && classType !== "Uncategorized") {
      t.update(userRef, { [`${paths.inventory}`]: newInventory, [`${paths.equipped}`]: newEquipped });
    } else {
      t.update(userRef, { "gamification.inventory": newInventory, "gamification.equipped": newEquipped });
    }
  });
  logWithCorrelation('info', 'Item equipped', correlationId, { userId, itemId, slot, classType });
  return { success: true };
});

export const unequipItem = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  const userId = verifyAuth(request.auth);
  const { slot, classType } = request.data || {};
  if (typeof slot !== "string") {
    throw new HttpsError("invalid-argument", "slot is required.");
  }
  const paths = getProfilePaths(classType);
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "User not found.");
    const data = snap.data()!;
    const { inventory, equipped } = getProfileData(data, classType);
    const item = equipped[slot];
    if (!item) throw new HttpsError("not-found", "No item equipped in that slot.");
    const newEquipped = { ...equipped };
    delete newEquipped[slot];
    const newInventory = [...inventory, item];
    if (classType && classType !== "Uncategorized") {
      t.update(userRef, { [`${paths.inventory}`]: newInventory, [`${paths.equipped}`]: newEquipped });
    } else {
      t.update(userRef, { "gamification.inventory": newInventory, "gamification.equipped": newEquipped });
    }
  });
  logWithCorrelation('info', 'Item unequipped', correlationId, { userId, slot, classType });
  return { success: true };
});

export const disenchantItem = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  const userId = verifyAuth(request.auth);
  const { itemId, classType } = request.data || {};
  if (typeof itemId !== "string") {
    throw new HttpsError("invalid-argument", "itemId is required.");
  }
  const paths = getProfilePaths(classType);
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "User not found.");
    const data = snap.data()!;
    const { inventory } = getProfileData(data, classType);
    const itemIndex = inventory.findIndex((it: any) => it.id === itemId);
    if (itemIndex === -1) throw new HttpsError("not-found", "Item not found in inventory.");
    const item = inventory[itemIndex];
    const fluxValue = getDisenchantValue(item);
    const newInventory = inventory.filter((_: any, i: number) => i !== itemIndex);
    const currentFlux = data.gamification?.flux || 0;
    if (classType && classType !== "Uncategorized") {
      t.update(userRef, { [`${paths.inventory}`]: newInventory, "gamification.flux": currentFlux + fluxValue });
    } else {
      t.update(userRef, { "gamification.inventory": newInventory, "gamification.flux": currentFlux + fluxValue });
    }
  });
  logWithCorrelation('info', 'Item disenchanted', correlationId, { userId, itemId, classType });
  return { success: true };
});

export const craftItem = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  const userId = verifyAuth(request.auth);
  const { targetRarity, classType } = request.data || {};
  const VALID_RARITIES = ["COMMON", "UNCOMMON", "RARE", "UNIQUE"];
  if (typeof targetRarity === "string" && !VALID_RARITIES.includes(targetRarity)) {
    throw new HttpsError("invalid-argument", `targetRarity must be one of: ${VALID_RARITIES.join(", ")}`);
  }
  const rarity = typeof targetRarity === "string" ? targetRarity : "COMMON";
  const cost = FLUX_COSTS[`CRAFT_${rarity}`] || FLUX_COSTS.CRAFT_COMMON;
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  const result = await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "User not found.");
    const data = snap.data()!;
    const currentFlux = data.gamification?.flux || 0;
    if (currentFlux < cost) throw new HttpsError("failed-precondition", `Not enough flux. Need ${cost}, have ${currentFlux}.`);
    const playerLevel = data.gamification?.level || 1;
    const newItem = generateLoot(playerLevel, rarity);
    const paths = getProfilePaths(classType);
    const { inventory } = getProfileData(data, classType);
    const newInventory = [...inventory, newItem];
    if (classType && classType !== "Uncategorized") {
      t.update(userRef, { [`${paths.inventory}`]: newInventory, "gamification.flux": currentFlux - cost });
    } else {
      t.update(userRef, { "gamification.inventory": newInventory, "gamification.flux": currentFlux - cost });
    }
    return { item: newItem };
  });
  logWithCorrelation('info', 'Item crafted', correlationId, { userId, rarity, itemName: result.item.name });
  return { success: true, item: result.item };
});

export const adminUpdateInventory = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);
  const { userId, inventory } = request.data || {};
  if (typeof userId !== "string" || !Array.isArray(inventory)) {
    throw new HttpsError("invalid-argument", "userId and inventory array required.");
  }
  await admin.firestore().collection("users").doc(userId).update({ "gamification.inventory": inventory });
  logWithCorrelation('info', 'Admin updated inventory', correlationId, { userId });
  return { success: true };
});

export const adminUpdateEquipped = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);
  const { userId, equipped } = request.data || {};
  if (typeof userId !== "string" || typeof equipped !== "object" || equipped === null) {
    throw new HttpsError("invalid-argument", "userId and equipped object required.");
  }
  await admin.firestore().collection("users").doc(userId).update({ "gamification.equipped": equipped });
  logWithCorrelation('info', 'Admin updated equipped', correlationId, { userId });
  return { success: true };
});

export const adminGrantItem = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);
  const { userId, item, classType } = request.data || {};
  if (typeof userId !== "string" || typeof item !== "object" || item === null) {
    throw new HttpsError("invalid-argument", "userId and item object required.");
  }
  const paths = getProfilePaths(classType);
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "User not found.");
    const data = snap.data()!;
    const { inventory } = getProfileData(data, classType);
    const newInventory = [...inventory, { ...item, obtainedAt: new Date().toISOString() }];
    if (classType && classType !== "Uncategorized") {
      t.update(userRef, { [`${paths.inventory}`]: newInventory });
    } else {
      t.update(userRef, { "gamification.inventory": newInventory });
    }
  });
  logWithCorrelation('info', 'Admin granted item', correlationId, { userId, itemName: item.name });
  return { success: true };
});

export const adminEditItem = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);
  const { userId, itemId, changes, classType } = request.data || {};
  if (typeof userId !== "string" || typeof itemId !== "string" || typeof changes !== "object" || changes === null) {
    throw new HttpsError("invalid-argument", "userId, itemId, and changes object required.");
  }
  const paths = getProfilePaths(classType);
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new HttpsError("not-found", "User not found.");
    const data = snap.data()!;
    const { inventory } = getProfileData(data, classType);
    const idx = inventory.findIndex((it: any) => it.id === itemId);
    if (idx === -1) throw new HttpsError("not-found", "Item not found.");
    const newInventory = [...inventory];
    newInventory[idx] = { ...newInventory[idx], ...changes };
    if (classType && classType !== "Uncategorized") {
      t.update(userRef, { [`${paths.inventory}`]: newInventory });
    } else {
      t.update(userRef, { "gamification.inventory": newInventory });
    }
  });
  logWithCorrelation('info', 'Admin edited item', correlationId, { userId, itemId });
  return { success: true };
});

export const useConsumable = onCall({ memory: "256MiB" }, async (request) => {
  const correlationId = generateCorrelationId();
  const uid = verifyAuth(request.auth);
  const { eventId, consumableId } = request.data;
  if (!eventId || !consumableId) {
    throw new HttpsError("invalid-argument", "Event ID and consumable ID required.");
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);

  const CONSUMABLE_COSTS: Record<string, number> = {
    SECOND_WIND: 25,
    STUDY_GUIDE: 15,
    ADRENALINE_SHOT: 40,
    TEAM_MEDKIT: 35,
  };

  const cost = CONSUMABLE_COSTS[consumableId];
  if (cost === undefined) throw new HttpsError("invalid-argument", "Unknown consumable.");

  const result = await db.runTransaction(async (t) => {
    const [userSnap, progressSnap] = await Promise.all([t.get(userRef), t.get(progressRef)]);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
    if (!progressSnap.exists) throw new HttpsError("not-found", "Progress not found.");

    const userData = userSnap.data()!;
    const gam = userData.gamification || {};
    const currency = gam.currency || 0;

    if (currency < cost) throw new HttpsError("failed-precondition", "Insufficient Cyber-Flux.");

    const progress = progressSnap.data()!;
    const currentAttempt = progress.attempts?.find((a: { status: string }) => a.status === 'active');
    if (!currentAttempt) throw new HttpsError("failed-precondition", "No active attempt.");

    let effectResult: Record<string, unknown> = {};

    switch (consumableId) {
      case 'SECOND_WIND':
        currentAttempt.currentHp = Math.min(currentAttempt.maxHp, Math.round(currentAttempt.currentHp + currentAttempt.maxHp * 0.25));
        effectResult = { type: 'HEAL', value: Math.round(currentAttempt.maxHp * 0.25), newHp: currentAttempt.currentHp };
        break;
      case 'STUDY_GUIDE':
        effectResult = { type: 'HINT', value: 1, message: 'One wrong answer has been eliminated.' };
        break;
      case 'ADRENALINE_SHOT':
        effectResult = { type: 'DAMAGE_BOOST', value: 2.0, selfDamage: 10, message: 'Next answer deals 2x damage but you take 10 damage.' };
        break;
      case 'TEAM_MEDKIT':
        effectResult = { type: 'TEAM_HEAL', value: 10, message: 'All allies healed for 10 HP.' };
        break;
    }

    t.update(userRef, { "gamification.currency": admin.firestore.FieldValue.increment(-cost) });
    t.update(progressRef, { attempts: progress.attempts });

    return { consumableId, effect: effectResult, remainingCurrency: currency - cost };
  });

  logWithCorrelation('info', 'Consumable used', correlationId, { uid, eventId, consumableId, effectType: result.effect.type });
  return { success: true, ...result };
});

export {
  SLOTS,
  BASE_ITEMS,
  PREFIX_DEFS,
  SUFFIX_DEFS,
  UNIQUES,
  FLUX_COSTS,
  pick,
  rollTier,
  rollValue,
  generateLoot,
  getDisenchantValue,
};

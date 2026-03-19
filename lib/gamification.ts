
import { ItemRarity, RPGItem, EquipmentSlot, User, PlayerRole } from '../types';
import { RUNEWORD_DEFINITIONS } from './runewords';
import { getActiveSetBonuses } from './achievements';

// ==========================================
// XP BRACKET SYSTEM (must mirror server-side)
// ==========================================
export const MAX_LEVEL = 500;

// Tiered XP brackets: [maxLevel, xpPerLevel]
export const XP_BRACKETS: [number, number][] = [
  [50, 1000],
  [200, 2000],
  [350, 3000],
  [450, 4000],
  [500, 5000],
];

/** Total XP required to reach a given level */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let totalXp = 0;
  let prevCap = 0;
  for (const [cap, xpPer] of XP_BRACKETS) {
    if (level - 1 <= prevCap) break;
    const levelsInBracket = Math.min(level - 1, cap) - prevCap;
    totalXp += levelsInBracket * xpPer;
    prevCap = cap;
  }
  return totalXp;
}

/** Determine the level for a given total XP amount */
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

/** XP needed for the current level bracket (cost to go from current level to next) */
export function xpForCurrentBracket(level: number): number {
  for (const [cap, xpPer] of XP_BRACKETS) {
    if (level - 1 < cap) return xpPer;
  }
  return XP_BRACKETS[XP_BRACKETS.length - 1][1];
}

/** Get progress within current level as a percentage (0-100) */
export function getLevelProgress(totalXp: number, level: number): number {
  if (level >= MAX_LEVEL) return 100;
  const xpAtCurrentLevel = xpForLevel(level);
  const xpAtNextLevel = xpForLevel(level + 1);
  const xpIntoLevel = totalXp - xpAtCurrentLevel;
  const xpNeeded = xpAtNextLevel - xpAtCurrentLevel;
  if (xpNeeded <= 0) return 100;
  return Math.min(100, Math.max(0, (xpIntoLevel / xpNeeded) * 100));
}

// --- VISUALIZATION HELPERS ---
// Extended element list to cover 100 rank groups (500 levels / 5 tiers = 100 elements)
const ELEMENT_NAMES = [
  // 1-40 (original)
  "Hydrogen", "Helium", "Lithium", "Beryllium", "Boron", "Carbon", "Nitrogen", "Oxygen", "Fluorine", "Neon",
  "Sodium", "Magnesium", "Aluminum", "Silicon", "Phosphorus", "Sulfur", "Chlorine", "Argon", "Potassium", "Calcium",
  "Scandium", "Titanium", "Vanadium", "Chromium", "Manganese", "Iron", "Cobalt", "Nickel", "Copper", "Zinc",
  "Gallium", "Germanium", "Arsenic", "Selenium", "Bromine", "Krypton", "Rubidium", "Strontium", "Yttrium", "Zirconium",
  // 41-80
  "Niobium", "Molybdenum", "Technetium", "Ruthenium", "Rhodium", "Palladium", "Silver", "Cadmium", "Indium", "Tin",
  "Antimony", "Tellurium", "Iodine", "Xenon", "Cesium", "Barium", "Lanthanum", "Cerium", "Praseodymium", "Neodymium",
  "Promethium", "Samarium", "Europium", "Gadolinium", "Terbium", "Dysprosium", "Holmium", "Erbium", "Thulium", "Ytterbium",
  "Lutetium", "Hafnium", "Tantalum", "Tungsten", "Rhenium", "Osmium", "Iridium", "Platinum", "Gold", "Mercury",
  // 81-100
  "Thallium", "Lead", "Bismuth", "Polonium", "Astatine", "Radon", "Francium", "Radium", "Actinium", "Thorium",
  "Protactinium", "Uranium", "Neptunium", "Plutonium", "Americium", "Curium", "Berkelium", "Californium", "Einsteinium", "Fermium"
];
const ROMANS = ['I', 'II', 'III', 'IV', 'V'];

const getElementStyle = (atomicNumber: number) => {
  // Noble gases
  if ([2, 10, 18, 36, 54, 86].includes(atomicNumber)) return { color: 'border-fuchsia-500 text-fuchsia-400', glow: 'shadow-fuchsia-500/50' };
  // Halogens
  if ([9, 17, 35, 53, 85].includes(atomicNumber)) return { color: 'border-yellow-400 text-yellow-400', glow: 'shadow-yellow-400/40' };
  // Alkali metals
  if ([3, 11, 19, 37, 55, 87].includes(atomicNumber)) return { color: 'border-red-500 text-red-500', glow: 'shadow-red-500/40' };
  // Precious metals (special styling for late-game prestige)
  if ([44, 45, 46, 47, 76, 77, 78, 79].includes(atomicNumber)) return { color: 'border-amber-400 text-amber-300', glow: 'shadow-amber-400/50' };
  // Actinides (endgame prestige)
  if (atomicNumber >= 89) return { color: 'border-rose-500 text-rose-400', glow: 'shadow-rose-500/50' };
  // Lanthanides
  if (atomicNumber >= 57 && atomicNumber <= 71) return { color: 'border-indigo-400 text-indigo-300', glow: 'shadow-indigo-400/40' };
  // Default transition metals
  return { color: 'border-cyan-400 text-cyan-400', glow: 'shadow-cyan-400/30' };
};

export const getRankDetails = (level: number) => {
  const elementIndex = Math.floor((level - 1) / 5);
  const romanIndex = (level - 1) % 5;
  const safeIndex = Math.min(elementIndex, ELEMENT_NAMES.length - 1);
  const name = ELEMENT_NAMES[safeIndex] || "Fermium";
  const roman = ROMANS[romanIndex];
  const atomicNumber = safeIndex + 1;
  const style = getElementStyle(atomicNumber);

  return {
    rankName: `${name} ${roman}`,
    tierColor: style.color,
    tierGlow: style.glow
  };
};

// --- ECONOMY ---
// Loot generation, crafting, and quest rewards now run server-side in Cloud Functions.
// This file only contains display helpers used by the UI.

// --- CRAFTING & ECONOMY ---

// --- FLUX SHOP CATALOG ---
// Consumable items students can purchase with Cyber-Flux.
// IDs must match server-side validation in purchaseFluxItem Cloud Function.
import { FluxShopItem, AgentCosmeticDef } from '../types';
import { CHARACTER_MODELS } from './characterModels';

// --- AGENT COSMETIC DEFINITIONS ---
// Visual cosmetics for operative avatars. Each cosmetic has a unique visual effect.
// These definitions drive both the shop display and avatar rendering.
export const AGENT_COSMETICS: AgentCosmeticDef[] = [
    // --- AURAS (ambient glow around the agent) ---
    { id: 'aura_ember', name: 'Ember Aura', description: 'A warm flickering glow surrounds your operative', visualType: 'AURA', color: '#ff6b35', secondaryColor: '#ffd700', intensity: 0.6 },
    { id: 'aura_frost', name: 'Frost Aura', description: 'Icy blue radiance emanates from your operative', visualType: 'AURA', color: '#00d4ff', secondaryColor: '#e0f7ff', intensity: 0.6 },
    { id: 'aura_void', name: 'Void Aura', description: 'Dark purple energy pulses around your operative', visualType: 'AURA', color: '#9333ea', secondaryColor: '#1a0033', intensity: 0.7 },
    { id: 'aura_radiant', name: 'Radiant Aura', description: 'Brilliant golden light radiates from your operative', visualType: 'AURA', color: '#fbbf24', secondaryColor: '#fff7ed', intensity: 0.8 },
    { id: 'aura_toxic', name: 'Toxic Aura', description: 'Corrosive green fumes seep from your operative', visualType: 'AURA', color: '#22c55e', secondaryColor: '#064e3b', intensity: 0.65 },
    { id: 'aura_bloodmoon', name: 'Blood Moon Aura', description: 'A crimson haze pulses with each heartbeat', visualType: 'AURA', color: '#dc2626', secondaryColor: '#450a0a', intensity: 0.7 },
    { id: 'aura_aurora', name: 'Aurora Aura', description: 'Shifting northern lights shimmer around your operative', visualType: 'AURA', color: '#34d399', secondaryColor: '#818cf8', intensity: 0.55 },
    { id: 'aura_solar', name: 'Solar Flare Aura', description: 'Blinding solar corona erupts from your operative', visualType: 'AURA', color: '#fb923c', secondaryColor: '#fef08a', intensity: 0.85 },

    // --- PARTICLES (floating elements around the agent) ---
    { id: 'particle_fireflies', name: 'Fireflies', description: 'Glowing fireflies drift around your operative', visualType: 'PARTICLE', color: '#84cc16', secondaryColor: '#fef08a', particleCount: 10, intensity: 0.5 },
    { id: 'particle_stardust', name: 'Stardust', description: 'Sparkling star particles float around your operative', visualType: 'PARTICLE', color: '#f0abfc', secondaryColor: '#ffffff', particleCount: 12, intensity: 0.6 },
    { id: 'particle_embers', name: 'Floating Embers', description: 'Hot embers rise and fade around your operative', visualType: 'PARTICLE', color: '#f97316', secondaryColor: '#ef4444', particleCount: 8, intensity: 0.5 },
    { id: 'particle_snow', name: 'Snowfall', description: 'Gentle snowflakes drift around your operative', visualType: 'PARTICLE', color: '#e0f2fe', secondaryColor: '#ffffff', particleCount: 14, intensity: 0.4 },
    { id: 'particle_sakura', name: 'Cherry Blossoms', description: 'Delicate pink petals swirl in an unseen breeze', visualType: 'PARTICLE', color: '#f9a8d4', secondaryColor: '#fce7f3', particleCount: 10, intensity: 0.45 },
    { id: 'particle_binary', name: 'Binary Rain', description: 'Cascading data fragments dissolve into the void', visualType: 'PARTICLE', color: '#4ade80', secondaryColor: '#22c55e', particleCount: 16, intensity: 0.5 },
    { id: 'particle_ashes', name: 'Cinder Ash', description: 'Smoldering ash drifts upward like dying stars', visualType: 'PARTICLE', color: '#a3a3a3', secondaryColor: '#f97316', particleCount: 8, intensity: 0.4 },
    { id: 'particle_crystals', name: 'Shattered Crystals', description: 'Fractured crystal shards orbit your operative', visualType: 'PARTICLE', color: '#67e8f9', secondaryColor: '#a78bfa', particleCount: 6, intensity: 0.65 },

    // --- FRAMES (decorative border/outline around the agent) ---
    { id: 'frame_circuit', name: 'Circuit Frame', description: 'A glowing circuit-board frame outlines your operative', visualType: 'FRAME', color: '#22d3ee', secondaryColor: '#0e7490', intensity: 0.6 },
    { id: 'frame_thorns', name: 'Thorn Frame', description: 'Twisted energy thorns frame your operative', visualType: 'FRAME', color: '#dc2626', secondaryColor: '#7f1d1d', intensity: 0.5 },
    { id: 'frame_diamond', name: 'Diamond Frame', description: 'A crystalline diamond border frames your operative', visualType: 'FRAME', color: '#a78bfa', secondaryColor: '#f5f3ff', intensity: 0.7 },
    { id: 'frame_hex', name: 'Hex Grid Frame', description: 'Tessellating hexagons lock around your operative', visualType: 'FRAME', color: '#f59e0b', secondaryColor: '#78350f', intensity: 0.6 },
    { id: 'frame_glitch', name: 'Glitch Frame', description: 'Corrupted scan-lines flicker at the edges of reality', visualType: 'FRAME', color: '#f43f5e', secondaryColor: '#22d3ee', intensity: 0.65 },
    { id: 'frame_rune', name: 'Rune Frame', description: 'Ancient glyphs inscribe a ward around your operative', visualType: 'FRAME', color: '#c084fc', secondaryColor: '#e9d5ff', intensity: 0.7 },
    { id: 'frame_neon', name: 'Neon Frame', description: 'Bright neon tubing buzzes with electric energy', visualType: 'FRAME', color: '#a3e635', secondaryColor: '#ecfccb', intensity: 0.75 },

    // --- TRAILS (motion/energy trails behind the agent) ---
    { id: 'trail_lightning', name: 'Lightning Trail', description: 'Electric bolts crackle around your operative', visualType: 'TRAIL', color: '#38bdf8', secondaryColor: '#ffffff', intensity: 0.7 },
    { id: 'trail_shadow', name: 'Shadow Trail', description: 'Dark wisps trail behind your operative', visualType: 'TRAIL', color: '#475569', secondaryColor: '#1e293b', intensity: 0.5 },
    { id: 'trail_plasma', name: 'Plasma Trail', description: 'Superheated plasma arcs around your operative', visualType: 'TRAIL', color: '#e879f9', secondaryColor: '#7c3aed', intensity: 0.8 },
    { id: 'trail_venom', name: 'Venom Trail', description: 'Toxic droplets sizzle in your operative\'s wake', visualType: 'TRAIL', color: '#4ade80', secondaryColor: '#166534', intensity: 0.6 },
    { id: 'trail_inferno', name: 'Inferno Trail', description: 'Roaring flames lick the ground behind your operative', visualType: 'TRAIL', color: '#f97316', secondaryColor: '#dc2626', intensity: 0.75 },
    { id: 'trail_ice', name: 'Frost Wake Trail', description: 'Crystalline ice shards form and shatter in your path', visualType: 'TRAIL', color: '#67e8f9', secondaryColor: '#e0f2fe', intensity: 0.6 },
    { id: 'trail_spectral', name: 'Spectral Trail', description: 'Ghostly after-images echo your operative\'s movements', visualType: 'TRAIL', color: '#c4b5fd', secondaryColor: '#4c1d95', intensity: 0.65 },
];

export const FLUX_SHOP_ITEMS: FluxShopItem[] = [
    {
        id: 'xp_boost_1h',
        name: 'XP Surge (1h)',
        description: '+50% XP from all sources for 1 hour',
        type: 'XP_BOOST',
        cost: 75,
        icon: '⚡',
        value: 1.5,
        duration: 1,
        dailyLimit: 2,
        isAvailable: true,
    },
    {
        id: 'xp_boost_3h',
        name: 'XP Overdrive (3h)',
        description: '+50% XP from all sources for 3 hours',
        type: 'XP_BOOST',
        cost: 150,
        icon: '🔥',
        value: 1.5,
        duration: 3,
        dailyLimit: 1,
        isAvailable: true,
    },
    {
        id: 'reroll_token',
        name: 'Reroll Token',
        description: 'Free reforge on any item (saves 25 Flux)',
        type: 'REROLL_TOKEN',
        cost: 50,
        icon: '🔄',
        dailyLimit: 3,
        isAvailable: true,
    },
    {
        id: 'name_color_cyan',
        name: 'Cyan Codename',
        description: 'Change your codename color to cyan',
        type: 'NAME_COLOR',
        cost: 100,
        icon: '🎨',
        value: 0x00e5ff,
        dailyLimit: 0,
        isAvailable: true,
    },
    {
        id: 'name_color_gold',
        name: 'Gold Codename',
        description: 'Change your codename color to gold',
        type: 'NAME_COLOR',
        cost: 100,
        icon: '🎨',
        value: 0xffd700,
        dailyLimit: 0,
        isAvailable: true,
    },
    {
        id: 'name_color_magenta',
        name: 'Magenta Codename',
        description: 'Change your codename color to magenta',
        type: 'NAME_COLOR',
        cost: 100,
        icon: '🎨',
        value: 0xff00ff,
        dailyLimit: 0,
        isAvailable: true,
    },
    {
        id: 'name_color_lime',
        name: 'Lime Codename',
        description: 'Change your codename color to lime',
        type: 'NAME_COLOR',
        cost: 100,
        icon: '🎨',
        value: 0x76ff03,
        dailyLimit: 0,
        isAvailable: true,
    },
    // --- AGENT COSMETICS ---
    // Auras (150 Flux)
    ...AGENT_COSMETICS.filter(c => c.visualType === 'AURA').map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: 'AGENT_COSMETIC' as const,
        cost: 150,
        icon: '✨',
        dailyLimit: 0,
        isAvailable: true,
    })),
    // Particles (200 Flux)
    ...AGENT_COSMETICS.filter(c => c.visualType === 'PARTICLE').map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: 'AGENT_COSMETIC' as const,
        cost: 200,
        icon: '🌟',
        dailyLimit: 0,
        isAvailable: true,
    })),
    // Frames (250 Flux)
    ...AGENT_COSMETICS.filter(c => c.visualType === 'FRAME').map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: 'AGENT_COSMETIC' as const,
        cost: 250,
        icon: '🔲',
        dailyLimit: 0,
        isAvailable: true,
    })),
    // Trails (300 Flux)
    ...AGENT_COSMETICS.filter(c => c.visualType === 'TRAIL').map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: 'AGENT_COSMETIC' as const,
        cost: 300,
        icon: '💫',
        dailyLimit: 0,
        isAvailable: true,
    })),
    // --- CHARACTER MODELS ---
    // 3D character models — free starters excluded (cost = 0)
    ...CHARACTER_MODELS.filter(m => m.cost > 0).map(m => ({
        id: m.id,
        name: m.name,
        description: m.description,
        type: 'CHARACTER_MODEL' as const,
        cost: m.cost,
        icon: '🧑‍💻',
        dailyLimit: 0,
        isAvailable: true,
    })),
];

export const FLUX_COSTS: Record<string, number> = {
    RECALIBRATE: 5,
    REFORGE: 25,
    OPTIMIZE: 50,
    SOCKET: 30,
    ENCHANT: 15,
    UNSOCKET_BASE: 10,
};

const RARITY_MULTIPLIER: Record<ItemRarity, number> = {
    COMMON: 1,
    UNCOMMON: 2,
    RARE: 4,
    UNIQUE: 8,
};

export const getUnsocketCost = (itemRarity: ItemRarity, gemTier: number, unsocketCount: number): number => {
    const base = FLUX_COSTS.UNSOCKET_BASE;
    const rarityMult = RARITY_MULTIPLIER[itemRarity];
    const tierMult = Math.max(1, gemTier);
    const repeatMult = 1 + unsocketCount;
    return Math.ceil(base * rarityMult * tierMult * repeatMult);
};

export const getDisenchantValue = (item: RPGItem): number => {
    const totalTier = item.affixes.reduce((acc, a) => acc + a.tier, 0);
    const avgTier = item.affixes.length > 0 ? totalTier / item.affixes.length : 1;
    
    let base = 0;
    switch(item.rarity) {
        case 'COMMON': base = 2; break;
        case 'UNCOMMON': base = 5; break;
        case 'RARE': base = 15; break;
        case 'UNIQUE': base = 50; break;
    }

    return Math.floor(base * (1 + (avgTier * 0.2)));
};


// --- Derived combat stats from player attributes ---
export const deriveCombatStats = (stats: { tech: number; focus: number; analysis: number; charisma: number }) => {
    const maxHp = 100 + Math.max(0, stats.charisma - 10) * 5;
    const armorPercent = Math.min(stats.analysis * 0.5, 50);
    const critChance = Math.min(stats.focus * 0.01, 0.40);
    const critMultiplier = 2 + Math.max(0, stats.focus - 10) * 0.02;
    return { maxHp, armorPercent, critChance, critMultiplier };
};

// --- PLAYER ROLE DERIVATION ---
export const derivePlayerRole = (stats: { tech: number; focus: number; analysis: number; charisma: number }): PlayerRole => {
  const statMap: { stat: number; role: PlayerRole }[] = [
    { stat: stats.tech, role: 'VANGUARD' },
    { stat: stats.focus, role: 'STRIKER' },
    { stat: stats.analysis, role: 'SENTINEL' },
    { stat: stats.charisma, role: 'COMMANDER' },
  ];
  // Highest stat wins; ties go to first in order (tech > focus > analysis > charisma)
  statMap.sort((a, b) => b.stat - a.stat);
  return statMap[0].role;
};

// craftItem, generateLoot, generateQuestRewards — removed (server-side only)

export const calculatePlayerStats = (user: Pick<User, 'gamification'>) => {
  const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
  if (!user.gamification?.equipped) return base;

  const equipped = user.gamification.equipped;
  const equippedItems: RPGItem[] = Object.values(equipped).filter(Boolean) as RPGItem[];

  equippedItems.forEach((item) => {
      if (item.stats) {
          Object.entries(item.stats).forEach(([key, val]) => {
              base[key as keyof typeof base] += (val as number);
          });
      }
  });

  return base;
};

export const calculateGearScore = (equipped: Partial<Record<EquipmentSlot, RPGItem>> | undefined): number => {
    if (!equipped) return 0;
    
    let totalScore = 0;
    const items = Object.values(equipped).filter(Boolean) as RPGItem[];
    
    if (items.length === 0) return 0;

    items.forEach(item => {
        let tiers = item.affixes.map(a => a.tier);
        if (item.rarity === 'UNIQUE' && tiers.length === 0) tiers = [10];
        
        const avgTier = tiers.length > 0 ? tiers.reduce((a,b) => a+b, 0) / tiers.length : 1;
        
        let rarityBonus = 0;
        switch (item.rarity) {
            case 'COMMON': rarityBonus = 0; break;
            case 'UNCOMMON': rarityBonus = 10; break;
            case 'RARE': rarityBonus = 30; break;
            case 'UNIQUE': rarityBonus = 60; break;
        }

        totalScore += (avgTier * 10) + rarityBonus;
    });

    return Math.floor(totalScore);
};

// --- SET BONUS HELPERS ---
export const calculateSetBonusStats = (equipped: Partial<Record<EquipmentSlot, RPGItem>> | undefined): Record<string, number> => {
    if (!equipped) return {};
    const items = Object.values(equipped).filter(Boolean) as RPGItem[];
    const activeSets = getActiveSetBonuses(items);
    const bonusStats: Record<string, number> = {};
    activeSets.forEach(({ activeBonus }: { activeBonus: { effects: { stat: string; value: number }[] } }) => {
        activeBonus.effects.forEach((e: { stat: string; value: number }) => {
            bonusStats[e.stat] = (bonusStats[e.stat] || 0) + e.value;
        });
    });
    return bonusStats;
};

// --- GEM STAT HELPERS ---
export const calculateGemStats = (equipped: Partial<Record<EquipmentSlot, RPGItem>> | undefined): Record<string, number> => {
    if (!equipped) return {};
    const gemStats: Record<string, number> = {};
    const items = Object.values(equipped).filter(Boolean) as RPGItem[];
    items.forEach(item => {
        (item.gems || []).forEach(gem => {
            gemStats[gem.stat] = (gemStats[gem.stat] || 0) + gem.value;
        });
    });
    return gemStats;
};

// --- RUNEWORD STAT HELPERS ---
export const calculateRunewordStats = (equipped: Partial<Record<EquipmentSlot, RPGItem>> | undefined): Record<string, number> => {
    if (!equipped) return {};
    const rwStats: Record<string, number> = {};
    const items = Object.values(equipped).filter(Boolean) as RPGItem[];
    items.forEach(item => {
        if (!item.runewordActive) return;
        const rw = RUNEWORD_DEFINITIONS.find(r => r.id === item.runewordActive);
        if (!rw) return;
        for (const [stat, val] of Object.entries(rw.bonusStats)) {
            rwStats[stat] = (rwStats[stat] || 0) + val;
        }
    });
    return rwStats;
};

export const getRunewordForItem = (item: RPGItem) => {
    if (!item.runewordActive) return null;
    return RUNEWORD_DEFINITIONS.find(r => r.id === item.runewordActive) || null;
};

export const getAssetColors = (rarity: ItemRarity): { border: string; text: string; bg: string; glow: string; shimmer: string } => {
    switch(rarity) {
        case 'COMMON': return { border: 'border-slate-500', text: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-500/10', glow: 'shadow-none', shimmer: '' };
        case 'UNCOMMON': return { border: 'border-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10', glow: 'shadow-emerald-500/20', shimmer: 'rarity-shimmer-uncommon' };
        case 'RARE': return { border: 'border-yellow-400', text: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-500/10', glow: 'shadow-yellow-500/30', shimmer: 'rarity-shimmer-rare' };
        case 'UNIQUE': return { border: 'border-orange-500', text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-500/10', glow: 'shadow-orange-500/40', shimmer: 'rarity-shimmer-unique' };
        default: return { border: 'border-slate-500', text: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-500/10', glow: 'shadow-none', shimmer: '' };
    }
};

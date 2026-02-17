
import { ItemRarity, RPGItem, EquipmentSlot } from '../types';

// --- VISUALIZATION HELPERS ---
const ELEMENT_NAMES = [
  "Hydrogen", "Helium", "Lithium", "Beryllium", "Boron", "Carbon", "Nitrogen", "Oxygen", "Fluorine", "Neon",
  "Sodium", "Magnesium", "Aluminum", "Silicon", "Phosphorus", "Sulfur", "Chlorine", "Argon", "Potassium", "Calcium",
  "Scandium", "Titanium", "Vanadium", "Chromium", "Manganese", "Iron", "Cobalt", "Nickel", "Copper", "Zinc",
  "Gallium", "Germanium", "Arsenic", "Selenium", "Bromine", "Krypton", "Rubidium", "Strontium", "Yttrium", "Zirconium"
];
const ROMANS = ['I', 'II', 'III', 'IV', 'V'];

const getElementStyle = (atomicNumber: number) => {
  if ([2, 10, 18, 36, 54, 86].includes(atomicNumber)) return { color: 'border-fuchsia-500 text-fuchsia-400', glow: 'shadow-fuchsia-500/50' };
  if ([9, 17, 35, 53, 85].includes(atomicNumber)) return { color: 'border-yellow-400 text-yellow-400', glow: 'shadow-yellow-400/40' };
  if ([3, 11, 19, 37, 55, 87].includes(atomicNumber)) return { color: 'border-red-500 text-red-500', glow: 'shadow-red-500/40' };
  return { color: 'border-cyan-400 text-cyan-400', glow: 'shadow-cyan-400/30' };
};

export const getRankDetails = (level: number) => {
  const elementIndex = Math.floor((level - 1) / 5);
  const romanIndex = (level - 1) % 5;
  const safeIndex = Math.min(elementIndex, ELEMENT_NAMES.length - 1);
  const name = ELEMENT_NAMES[safeIndex] || "Unknownium";
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

export const FLUX_COSTS = {
    RECALIBRATE: 5, 
    REFORGE: 25,    
    OPTIMIZE: 50    
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


// craftItem, generateLoot, generateQuestRewards — removed (server-side only)

export const calculatePlayerStats = (user: any) => {
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

export const getAssetColors = (rarity: ItemRarity): { border: string; text: string; bg: string; glow: string; shimmer: string } => {
    switch(rarity) {
        case 'COMMON': return { border: 'border-slate-500', text: 'text-slate-300', bg: 'bg-slate-500/10', glow: 'shadow-none', shimmer: '' };
        case 'UNCOMMON': return { border: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', glow: 'shadow-emerald-500/20', shimmer: 'rarity-shimmer-uncommon' };
        case 'RARE': return { border: 'border-yellow-400', text: 'text-yellow-300', bg: 'bg-yellow-500/10', glow: 'shadow-yellow-500/30', shimmer: 'rarity-shimmer-rare' };
        case 'UNIQUE': return { border: 'border-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', glow: 'shadow-orange-500/40', shimmer: 'rarity-shimmer-unique' };
        default: return { border: 'border-slate-500', text: 'text-slate-300', bg: 'bg-slate-500/10', glow: 'shadow-none', shimmer: '' };
    }
};

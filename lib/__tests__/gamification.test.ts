import { describe, it, expect } from 'vitest';
import {
  xpForLevel,
  levelForXp,
  xpForCurrentBracket,
  getLevelProgress,
  getRankDetails,
  MAX_LEVEL,
  XP_BRACKETS,
  FLUX_COSTS,
  getUnsocketCost,
  getDisenchantValue,
  deriveCombatStats,
  calculatePlayerStats,
  calculateGearScore,
  calculateGemStats,
  calculateRunewordStats,
  getRunewordForItem,
  getAssetColors,
} from '../gamification';
import { RPGItem, EquipmentSlot } from '../../types';

// ─── Helpers ───
function makeItem(overrides: Partial<RPGItem> = {}): RPGItem {
  return {
    id: 'test-item',
    name: 'Test Blade',
    baseName: 'Blade',
    rarity: 'COMMON',
    slot: 'CHEST',
    visualId: 'v1',
    stats: {},
    affixes: [],
    description: 'A test item',
    obtainedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── XP Bracket System ───
describe('xpForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it('returns 0 for level 0 and below', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-5)).toBe(0);
  });

  it('returns 1000 for level 2 (first bracket: 1000 XP/level)', () => {
    expect(xpForLevel(2)).toBe(1000);
  });

  it('returns correct XP at bracket boundary (level 51)', () => {
    // Levels 1-50: 50 levels × 1000 = 50,000
    expect(xpForLevel(51)).toBe(50_000);
  });

  it('returns correct XP at level 52 (crosses into second bracket)', () => {
    // 50,000 + 1 × 2000 = 52,000
    expect(xpForLevel(52)).toBe(52_000);
  });

  it('returns correct XP at level 201 (third bracket start)', () => {
    // Bracket 1: 50 × 1000 = 50,000
    // Bracket 2: 150 × 2000 = 300,000
    expect(xpForLevel(201)).toBe(350_000);
  });

  it('returns correct XP at level 351 (fourth bracket start)', () => {
    // 50,000 + 300,000 + 150 × 3000 = 800,000
    expect(xpForLevel(351)).toBe(800_000);
  });

  it('returns correct XP at level 451 (fifth bracket start)', () => {
    // 50,000 + 300,000 + 450,000 + 100 × 4000 = 1,200,000
    expect(xpForLevel(451)).toBe(1_200_000);
  });

  it('returns correct XP at max level 500', () => {
    // 50,000 + 300,000 + 450,000 + 400,000 + 49 × 5000 = 1,445,000
    expect(xpForLevel(500)).toBe(1_445_000);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
      const xp = xpForLevel(lvl);
      expect(xp).toBeGreaterThanOrEqual(prev);
      prev = xp;
    }
  });
});

describe('levelForXp', () => {
  it('returns 1 for 0 XP', () => {
    expect(levelForXp(0)).toBe(1);
  });

  it('returns 1 for negative XP', () => {
    expect(levelForXp(-100)).toBe(1);
  });

  it('returns 2 for exactly 1000 XP', () => {
    expect(levelForXp(1000)).toBe(2);
  });

  it('returns 1 for 999 XP (not yet level 2)', () => {
    expect(levelForXp(999)).toBe(1);
  });

  it('returns MAX_LEVEL for extremely high XP', () => {
    expect(levelForXp(999_999_999)).toBe(MAX_LEVEL);
  });

  it('is the inverse of xpForLevel at every bracket boundary', () => {
    const boundaryLevels = [1, 2, 50, 51, 200, 201, 350, 351, 450, 451, 500];
    for (const lvl of boundaryLevels) {
      const xp = xpForLevel(lvl);
      expect(levelForXp(xp)).toBe(lvl);
    }
  });

  it('round-trips correctly for sampled levels', () => {
    for (const lvl of [1, 10, 25, 50, 75, 100, 200, 300, 400, 500]) {
      expect(levelForXp(xpForLevel(lvl))).toBe(lvl);
    }
  });
});

describe('xpForCurrentBracket', () => {
  it('returns 1000 for levels in the first bracket (1-50)', () => {
    expect(xpForCurrentBracket(1)).toBe(1000);
    expect(xpForCurrentBracket(25)).toBe(1000);
    expect(xpForCurrentBracket(50)).toBe(1000);
  });

  it('returns 2000 for levels in the second bracket (51-200)', () => {
    expect(xpForCurrentBracket(51)).toBe(2000);
    expect(xpForCurrentBracket(100)).toBe(2000);
    expect(xpForCurrentBracket(200)).toBe(2000);
  });

  it('returns 3000 for levels in the third bracket (201-350)', () => {
    expect(xpForCurrentBracket(201)).toBe(3000);
  });

  it('returns 4000 for levels in the fourth bracket (351-450)', () => {
    expect(xpForCurrentBracket(351)).toBe(4000);
  });

  it('returns 5000 for levels in the fifth bracket (451-500)', () => {
    expect(xpForCurrentBracket(451)).toBe(5000);
    expect(xpForCurrentBracket(500)).toBe(5000);
  });
});

describe('getLevelProgress', () => {
  it('returns 0% at the exact start of a level', () => {
    expect(getLevelProgress(xpForLevel(10), 10)).toBe(0);
  });

  it('returns 50% halfway through a level', () => {
    const xpAtLvl10 = xpForLevel(10);
    const xpAtLvl11 = xpForLevel(11);
    const midpoint = xpAtLvl10 + (xpAtLvl11 - xpAtLvl10) / 2;
    expect(getLevelProgress(midpoint, 10)).toBeCloseTo(50, 1);
  });

  it('returns 100% at max level', () => {
    expect(getLevelProgress(xpForLevel(MAX_LEVEL), MAX_LEVEL)).toBe(100);
  });

  it('never returns negative', () => {
    expect(getLevelProgress(0, 1)).toBeGreaterThanOrEqual(0);
  });

  it('never exceeds 100', () => {
    expect(getLevelProgress(999_999_999, 499)).toBeLessThanOrEqual(100);
  });
});

// ─── Rank System ───
describe('getRankDetails', () => {
  it('returns Hydrogen I for level 1', () => {
    const rank = getRankDetails(1);
    expect(rank.rankName).toBe('Hydrogen I');
  });

  it('returns Hydrogen V for level 5', () => {
    const rank = getRankDetails(5);
    expect(rank.rankName).toBe('Hydrogen V');
  });

  it('returns Helium I for level 6', () => {
    const rank = getRankDetails(6);
    expect(rank.rankName).toBe('Helium I');
  });

  it('returns a valid rank for max level', () => {
    const rank = getRankDetails(MAX_LEVEL);
    expect(rank.rankName).toBeDefined();
    expect(rank.tierColor).toBeDefined();
    expect(rank.tierGlow).toBeDefined();
  });

  it('applies noble gas styling for Helium (atomic #2)', () => {
    const rank = getRankDetails(6); // Helium I
    expect(rank.tierColor).toContain('fuchsia');
  });
});

// ─── Economy: Unsocket Costs ───
describe('getUnsocketCost', () => {
  it('calculates base cost for COMMON rarity, tier 1, first unsocket', () => {
    // base(10) × rarityMult(1) × tierMult(1) × repeatMult(1) = 10
    expect(getUnsocketCost('COMMON', 1, 0)).toBe(10);
  });

  it('scales with rarity', () => {
    const common = getUnsocketCost('COMMON', 1, 0);
    const uncommon = getUnsocketCost('UNCOMMON', 1, 0);
    const rare = getUnsocketCost('RARE', 1, 0);
    const unique = getUnsocketCost('UNIQUE', 1, 0);
    expect(uncommon).toBe(common * 2);
    expect(rare).toBe(common * 4);
    expect(unique).toBe(common * 8);
  });

  it('scales with gem tier', () => {
    const tier1 = getUnsocketCost('COMMON', 1, 0);
    const tier3 = getUnsocketCost('COMMON', 3, 0);
    expect(tier3).toBe(tier1 * 3);
  });

  it('scales with unsocket count (repeat penalty)', () => {
    const first = getUnsocketCost('COMMON', 1, 0);
    const second = getUnsocketCost('COMMON', 1, 1);
    const third = getUnsocketCost('COMMON', 1, 2);
    expect(second).toBe(first * 2);
    expect(third).toBe(first * 3);
  });
});

// ─── Economy: Disenchant Values ───
describe('getDisenchantValue', () => {
  it('returns base value for item with no affixes', () => {
    const item = makeItem({ rarity: 'COMMON', affixes: [] });
    // base(2) × (1 + 1 × 0.2) = 2.4 → floor → 2
    expect(getDisenchantValue(item)).toBe(2);
  });

  it('scales with rarity', () => {
    const common = getDisenchantValue(makeItem({ rarity: 'COMMON', affixes: [] }));
    const uncommon = getDisenchantValue(makeItem({ rarity: 'UNCOMMON', affixes: [] }));
    const rare = getDisenchantValue(makeItem({ rarity: 'RARE', affixes: [] }));
    const unique = getDisenchantValue(makeItem({ rarity: 'UNIQUE', affixes: [] }));
    expect(uncommon).toBeGreaterThan(common);
    expect(rare).toBeGreaterThan(uncommon);
    expect(unique).toBeGreaterThan(rare);
  });

  it('scales with affix tiers', () => {
    const lowTier = makeItem({
      rarity: 'RARE',
      affixes: [{ type: 'PREFIX', stat: 'tech', value: 5, tier: 1, name: 'Low' }],
    });
    const highTier = makeItem({
      rarity: 'RARE',
      affixes: [{ type: 'PREFIX', stat: 'tech', value: 20, tier: 8, name: 'High' }],
    });
    expect(getDisenchantValue(highTier)).toBeGreaterThan(getDisenchantValue(lowTier));
  });
});

// ─── Combat Stats ───
describe('deriveCombatStats', () => {
  it('returns 100 HP for base stats (all 10)', () => {
    const stats = deriveCombatStats({ tech: 10, focus: 10, analysis: 10, charisma: 10 });
    expect(stats.maxHp).toBe(100);
  });

  it('gains HP from charisma above 10', () => {
    const stats = deriveCombatStats({ tech: 10, focus: 10, analysis: 10, charisma: 20 });
    expect(stats.maxHp).toBe(150); // 100 + 10*5
  });

  it('caps armor at 50%', () => {
    const stats = deriveCombatStats({ tech: 10, focus: 10, analysis: 200, charisma: 10 });
    expect(stats.armorPercent).toBe(50);
  });

  it('caps crit chance at 40%', () => {
    const stats = deriveCombatStats({ tech: 10, focus: 500, analysis: 10, charisma: 10 });
    expect(stats.critChance).toBe(0.40);
  });

  it('calculates crit multiplier from focus', () => {
    const stats = deriveCombatStats({ tech: 10, focus: 20, analysis: 10, charisma: 10 });
    // 2 + (20-10) * 0.02 = 2.2
    expect(stats.critMultiplier).toBeCloseTo(2.2);
  });
});

// ─── Player Stats ───
describe('calculatePlayerStats', () => {
  it('returns base 10 for all stats with no equipment', () => {
    const stats = calculatePlayerStats({ gamification: {} as any });
    expect(stats).toEqual({ tech: 10, focus: 10, analysis: 10, charisma: 10 });
  });

  it('adds equipped item stats', () => {
    const equipped: Partial<Record<EquipmentSlot, RPGItem>> = {
      CHEST: makeItem({ stats: { tech: 5, focus: 3 } }),
      HEAD: makeItem({ slot: 'HEAD', stats: { analysis: 7 } }),
    };
    const stats = calculatePlayerStats({ gamification: { equipped } as any });
    expect(stats.tech).toBe(15);
    expect(stats.focus).toBe(13);
    expect(stats.analysis).toBe(17);
    expect(stats.charisma).toBe(10);
  });
});

// ─── Gear Score ───
describe('calculateGearScore', () => {
  it('returns 0 for undefined equipped', () => {
    expect(calculateGearScore(undefined)).toBe(0);
  });

  it('returns 0 for empty equipped', () => {
    expect(calculateGearScore({})).toBe(0);
  });

  it('calculates score from affix tiers and rarity bonus', () => {
    const equipped: Partial<Record<EquipmentSlot, RPGItem>> = {
      CHEST: makeItem({
        rarity: 'RARE',
        affixes: [
          { type: 'PREFIX', stat: 'tech', value: 10, tier: 5, name: 'A' },
          { type: 'SUFFIX', stat: 'focus', value: 8, tier: 3, name: 'B' },
        ],
      }),
    };
    const score = calculateGearScore(equipped);
    // avgTier = (5+3)/2 = 4, rarityBonus = 30
    // score = 4*10 + 30 = 70
    expect(score).toBe(70);
  });

  it('uses tier 10 fallback for UNIQUE items with no affixes', () => {
    const equipped: Partial<Record<EquipmentSlot, RPGItem>> = {
      CHEST: makeItem({ rarity: 'UNIQUE', affixes: [] }),
    };
    // avgTier = 10, rarityBonus = 60 → 100 + 60 = 160
    expect(calculateGearScore(equipped)).toBe(160);
  });
});

// ─── Gem Stats ───
describe('calculateGemStats', () => {
  it('returns empty for undefined equipped', () => {
    expect(calculateGemStats(undefined)).toEqual({});
  });

  it('aggregates gem stats across items', () => {
    const equipped: Partial<Record<EquipmentSlot, RPGItem>> = {
      CHEST: makeItem({
        gems: [
          { name: 'Ruby', stat: 'tech', value: 5, tier: 1, color: '#f00' },
          { name: 'Sapphire', stat: 'analysis', value: 3, tier: 1, color: '#00f' },
        ],
      }),
      HEAD: makeItem({
        slot: 'HEAD',
        gems: [{ name: 'Ruby', stat: 'tech', value: 7, tier: 2, color: '#f00' }],
      }),
    };
    const stats = calculateGemStats(equipped);
    expect(stats.tech).toBe(12);
    expect(stats.analysis).toBe(3);
  });
});

// ─── Asset Colors ───
describe('getAssetColors', () => {
  it('returns slate colors for COMMON', () => {
    const colors = getAssetColors('COMMON');
    expect(colors.border).toContain('slate');
  });

  it('returns emerald colors for UNCOMMON', () => {
    const colors = getAssetColors('UNCOMMON');
    expect(colors.border).toContain('emerald');
  });

  it('returns yellow colors for RARE', () => {
    const colors = getAssetColors('RARE');
    expect(colors.border).toContain('yellow');
  });

  it('returns orange colors for UNIQUE', () => {
    const colors = getAssetColors('UNIQUE');
    expect(colors.border).toContain('orange');
  });
});

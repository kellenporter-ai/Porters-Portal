// Pure-logic unit tests for functions/src/core.ts (audit Phase 2.1, Task F).
// Runs against the compiled output (lib/) via functions/vitest.config.mts,
// using the functions/ node_modules dependency graph.
import { describe, it, expect } from 'vitest';
import {
  levelForXp,
  buildXPUpdates,
  getProfilePaths,
  getProfileData,
  calculateServerStats,
  deriveCombatStats,
  calculateServerGearScore,
  VALID_CLASS_TYPES,
  MAX_LEVEL,
} from '../lib/core.js';

// levelForXp -------------------------------------------------------------
describe('levelForXp', () => {
  it('returns level 1 for zero/negative/invalid XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(NaN)).toBe(1);
    expect(levelForXp('abc')).toBe(1);
  });

  it('computes levels within the first bracket (50 levels @ 1000 xp/level)', () => {
    expect(levelForXp(1000)).toBe(2);
    expect(levelForXp(2000)).toBe(3);
    expect(levelForXp(49_000)).toBe(50); // one short of bracket boundary
  });

  it('computes levels across bracket boundaries', () => {
    // Bracket 1: 50 levels * 1000 = 50,000 xp → level 51 at 50,000
    expect(levelForXp(50_000)).toBe(51);
    // Bracket 2: 150 levels * 2000 = 300,000; 350,000 xp → level 201
    expect(levelForXp(50_000 + 300_000)).toBe(201);
    // Bracket 3: 150 levels * 3000 = 450,000; 800,000 xp → level 351
    expect(levelForXp(50_000 + 300_000 + 450_000)).toBe(351);
  });

  it('caps at MAX_LEVEL regardless of XP', () => {
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
    // Exactly the cumulative xp for level 500
    expect(levelForXp(1_450_000)).toBe(MAX_LEVEL);
    expect(levelForXp(1_449_999)).toBeGreaterThan(450);
    expect(levelForXp(1_449_999)).toBeLessThanOrEqual(MAX_LEVEL);
  });
});

// buildXPUpdates ---------------------------------------------------------
const baseGam = () => ({
  gamification: { xp: 100, level: 1, currency: 10, skillPoints: 0, inventory: [] },
});

describe('buildXPUpdates', () => {
  it('adds XP and updates level without leveling rewards when not leveled up', () => {
    const { updates, newXP, newLevel, leveledUp } = buildXPUpdates(baseGam(), 50);
    expect(newXP).toBe(150);
    expect(newLevel).toBe(levelForXp(150));
    expect(leveledUp).toBe(false);
    expect(updates['gamification.xp']).toBe(150);
    expect(updates['gamification.level']).toBe(newLevel);
    expect(updates['gamification.currency']).toBeUndefined();
    expect(updates['gamification.inventory']).toBeUndefined();
  });

  it('grants 100 currency and loot on level-up', () => {
    // 49,100 xp + 900 = 50,000 → level 51 (from level 49)
    const data = { gamification: { xp: 49_100, level: 49, currency: 5, inventory: [] } };
    const { updates, newLevel, leveledUp } = buildXPUpdates(data, 900);
    expect(leveledUp).toBe(true);
    expect(newLevel).toBe(51);
    expect(updates['gamification.currency']).toBe(105);
    expect(updates['gamification.inventory']).toHaveLength(1);
    expect(updates['gamification.inventory'][0].rarity).toBeTruthy();
  });

  it('awards skill points for every even level gained', () => {
    // level 49 → 51 crosses level 50 (even) only → 1 SP
    const data = { gamification: { xp: 49_100, level: 49, skillPoints: 0, inventory: [] } };
    const { updates } = buildXPUpdates(data, 900);
    expect(updates['gamification.skillPoints']).toBe(1);
    // level 1 → 5 crosses 2 and 4 → 2 SP
    const data2 = { gamification: { xp: 0, level: 1, skillPoints: 0, inventory: [] } };
    const { updates: u2 } = buildXPUpdates(data2, 4000);
    expect(u2['gamification.skillPoints']).toBe(2);
  });

  it('floors XP at 0 for deductions exceeding balance', () => {
    const { updates, newXP } = buildXPUpdates(baseGam(), -500);
    expect(newXP).toBe(0);
    expect(updates['gamification.xp']).toBe(0);
  });

  it('applies a positive active boost multiplier but never boosts deductions', () => {
    const data = {
      gamification: {
        ...baseGam().gamification,
        activeBoosts: [{ value: 2, expiresAt: new Date(Date.now() + 60_000).toISOString() }],
      },
    };
    const boosted = buildXPUpdates(data, 100);
    expect(boosted.updates['gamification.xp']).toBe(300); // 100 + 100*2
    const deducted = buildXPUpdates(data, -100);
    expect(deducted.updates['gamification.xp']).toBe(0); // 100 - 100, no boost
  });

  it('ignores expired boosts', () => {
    const data = {
      gamification: {
        ...baseGam().gamification,
        activeBoosts: [{ value: 3, expiresAt: new Date(Date.now() - 60_000).toISOString() }],
      },
    };
    const { updates } = buildXPUpdates(data, 100);
    expect(updates['gamification.xp']).toBe(200);
  });

  it('guards non-numeric stored xp/level to defaults instead of NaN', () => {
    const data = { gamification: { xp: 'bad', level: null } };
    const { updates, newXP, newLevel } = buildXPUpdates(data, 50);
    expect(newXP).toBe(50); // 0 + 50
    expect(newLevel).toBe(1);
    expect(Number.isNaN(updates['gamification.xp'])).toBe(false);
  });

  it('writes level-up loot to the class profile for classType (not Uncategorized)', () => {
    const data = {
      gamification: {
        xp: 49_100, level: 49, currency: 0, skillPoints: 0,
        classProfiles: { Physics: { inventory: [{ id: 'old' }] } },
      },
    };
    const { updates } = buildXPUpdates(data, 900, 'Physics');
    expect(updates['gamification.classProfiles.Physics.inventory']).toHaveLength(2);
  });

  it('routes Uncategorized classType loot to the global inventory', () => {
    const data = { gamification: { xp: 49_100, level: 49, currency: 0, inventory: [] } };
    const { updates } = buildXPUpdates(data, 900, 'Uncategorized');
    expect(updates['gamification.inventory']).toHaveLength(1);
    expect(updates['gamification.classProfiles.Uncategorized.inventory']).toBeUndefined();
  });

  it('creates the class profile inventory on first level-up for that class', () => {
    const data = { gamification: { xp: 49_100, level: 49 } };
    const { updates } = buildXPUpdates(data, 900, 'Physics');
    expect(updates['gamification.classProfiles.Physics.inventory']).toHaveLength(1);
  });

  it('rejects an invalid classType with invalid-argument (engagement-mirror parity)', () => {
    expect(() => buildXPUpdates(baseGam(), 10, 'NotAClass')).toThrowError(/invalid classType/i);
    expect(() => buildXPUpdates(baseGam(), 10, 'Physics ')).toThrowError(/invalid classType/i);
  });

  it('accepts every VALID_CLASS_TYPES entry, including plain Physics', () => {
    for (const ct of VALID_CLASS_TYPES) {
      expect(() => buildXPUpdates(baseGam(), 10, ct)).not.toThrow();
    }
  });

  it('treats non-finite xpAmount as 0', () => {
    const { updates } = buildXPUpdates(baseGam(), Infinity);
    expect(updates['gamification.xp']).toBe(100);
  });
});

// getProfilePaths / getProfileData (validateClassType guards) ------------
describe('validateClassType via profile helpers', () => {
  it('throws on arbitrary classType, accepts all valid ones', () => {
    expect(() => getProfilePaths('bogus')).toThrowError(/Invalid classType/);
    expect(() => getProfileData({}, 'bogus')).toThrowError(/Invalid classType/);
    for (const ct of VALID_CLASS_TYPES) {
      const paths = getProfilePaths(ct);
      expect(paths.inventory).toBe(`gamification.classProfiles.${ct}.inventory`);
    }
  });

  it('uses class profile data when present, falls back to global', () => {
    const data = {
      gamification: {
        inventory: ['globalItem'],
        equipped: { weapon: 'w' },
        classProfiles: { Physics: { inventory: ['classItem'], equipped: { chest: 'c' } } },
      },
    };
    expect(getProfileData(data, 'Physics')).toEqual({ inventory: ['classItem'], equipped: { chest: 'c' } });
    expect(getProfileData(data)).toEqual({ inventory: ['globalItem'], equipped: { weapon: 'w' } });
    expect(getProfileData({}, 'Physics')).toEqual({ inventory: [], equipped: {} });
  });
});

// Server-side stat derivations -------------------------------------------
describe('calculateServerStats / deriveCombatStats / calculateServerGearScore', () => {
  it('starts from base 10s with no gear', () => {
    expect(calculateServerStats(undefined)).toEqual({ tech: 10, focus: 10, analysis: 10, charisma: 10 });
  });

  it('sums item stats and gem values, ignoring junk entries', () => {
    const equipped = {
      weapon: { stats: { tech: 5 }, gems: [{ stat: 'focus', value: 3 }] },
      chest: null,
      boots: 'corrupted-string',
      helmet: { stats: { unknownStat: 99, tech: 'NaN-ish' } },
    };
    expect(calculateServerStats(equipped)).toEqual({ tech: 15, focus: 13, analysis: 10, charisma: 10 });
  });

  it('derives combat stats with caps', () => {
    const { maxHp, armorPercent, critChance, critMultiplier } = deriveCombatStats({
      tech: 10, focus: 100, analysis: 200, charisma: 30,
    });
    expect(maxHp).toBe(200);
    expect(armorPercent).toBe(50); // capped at 50
    expect(critChance).toBe(0.4); // capped at 0.40
    expect(critMultiplier).toBe(2 + 90 * 0.02);
  });

  it('scores gear by affix tiers and rarity, unique-without-affixes counts as tier 10', () => {
    const equipped = {
      a: { affixes: [{ tier: 2 }, { tier: 4 }], rarity: 'RARE' },       // avg 3 → 30 + 30
      b: { rarity: 'UNIQUE' },                                            // tier 10 → 100 + 60
      c: { rarity: 'COMMON' },                                            // no affixes → avg 1 → 10
    };
    expect(calculateServerGearScore(equipped)).toBe(230);
    expect(calculateServerGearScore(undefined)).toBe(0);
  });
});

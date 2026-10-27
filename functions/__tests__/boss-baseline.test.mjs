// Characterization tests for the current pure combat behaviour (I3.1).
// These lock the pre-identity baseline; do not tune the implementation to fit.
import { describe, it, expect } from 'vitest';
import {
  HIT_CEILING_FRACTION,
  deriveCombatStats,
  computePlayerEhp,
  computeBossAttack,
  computeBossMaxHp,
  computeCorrectHit,
} from '../lib/boss-combat.js';

const FRESH_GEAR = 45;
const FRESH_STATS = { tech: 12, focus: 10, analysis: 10, charisma: 10 };
const MAXED_GEAR = 550;
const MAXED_STATS = { tech: 45, focus: 40, analysis: 40, charisma: 40 };
const MAXED_TANK_STATS = { tech: 45, focus: 40, analysis: 100, charisma: 60 };

const missesToKO = (stats) => {
  const combat = deriveCombatStats(stats);
  const playerEhp = computePlayerEhp(combat);
  let hp = combat.maxHp;
  let misses = 0;
  while (hp > 0) {
    hp -= computeBossAttack({ stats, playerEhp }).damage;
    misses++;
  }
  return misses;
};

describe('I3.1 current combat baseline', () => {
  it('locks fresh loadout stats, EHP, boss damage, and third-miss KO', () => {
    const combat = deriveCombatStats(FRESH_STATS);
    const playerEhp = computePlayerEhp(combat);
    const attack = computeBossAttack({ stats: FRESH_STATS, playerEhp });

    expect(combat.maxHp).toBe(100);
    expect(combat.armorPercent).toBe(5);
    expect(playerEhp).toBeCloseTo(105.3, 1);
    expect(attack.damage).toBe(40);
    expect(missesToKO(FRESH_STATS)).toBe(3);
  });

  it('locks maxed balanced KO on miss 4 and maxed tank KO on miss 5', () => {
    expect(missesToKO(MAXED_STATS)).toBe(4);
    expect(missesToKO(MAXED_TANK_STATS)).toBe(5);
  });

  it('locks fresh and maxed boss HP', () => {
    expect(computeBossMaxHp(FRESH_GEAR, FRESH_STATS)).toBe(1809);
    expect(computeBossMaxHp(MAXED_GEAR, MAXED_STATS)).toBe(8526);
  });

  it('locks the 45% damage ceiling for a stacked guaranteed crit', () => {
    const stackedGear = 5000;
    const bossMaxHp = computeBossMaxHp(stackedGear, MAXED_STATS);
    const ceiling = Math.floor(bossMaxHp * HIT_CEILING_FRACTION);
    const hit = computeCorrectHit({
      gearScore: stackedGear,
      stats: MAXED_STATS,
      difficulty: 'HARD',
      streak: 100,
      rand: 0.5,
      critRoll: 0,
      bossMaxHp,
    });

    expect(hit.isCrit).toBe(true);
    expect(hit.preCeilingDamage).toBeGreaterThan(ceiling);
    expect(hit.damage).toBe(ceiling);
    expect(hit.damage).toBeLessThanOrEqual(bossMaxHp * 0.45);
  });
});

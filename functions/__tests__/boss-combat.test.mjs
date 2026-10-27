// Pure-logic unit tests for functions/src/boss-combat.ts (async boss redesign,
// increment 1). Runs against compiled output (lib/) via functions/vitest.config.mts.
// Calibration gates are from the approved design (temp/boss-increment1-plan.md).
import { describe, it, expect } from 'vitest';
import {
  PLAYER_BASE_STATS,
  EHP_BASELINE,
  BOSS_HP_BASE,
  BOSS_HP_EXPONENT,
  HIT_CEILING_FRACTION,
  BOSS_ATTACK_BASE,
  BOSS_ATTACK_EXPONENT,
  DIFFICULTY_MOD,
  deriveCombatStats,
  computePlayerPowerIndex,
  computeBossMaxHp,
  computePlayerEhp,
  computeBossRawAttack,
  computeStreakMultiplier,
  computeCorrectHit,
  computeBossAttack,
} from '../lib/boss-combat.js';

const FRESH_STATS = { tech: 12, focus: 10, analysis: 10, charisma: 10 };
const FRESH_GEAR = 45;

const MAXED_STATS = { tech: 45, focus: 40, analysis: 40, charisma: 40 };
const MAXED_GEAR = 550;

const MAXED_TANK_STATS = { tech: 45, focus: 40, analysis: 100, charisma: 60 };

// computePlayerPowerIndex -------------------------------------------------
describe('computePlayerPowerIndex', () => {
  it('matches the calibration values', () => {
    expect(computePlayerPowerIndex(FRESH_GEAR, FRESH_STATS)).toBeCloseTo(1.378, 2);
    expect(computePlayerPowerIndex(MAXED_GEAR, MAXED_STATS)).toBeCloseTo(9.567, 2);
  });

  it('is 1 at base stats with zero gear', () => {
    expect(computePlayerPowerIndex(0, PLAYER_BASE_STATS)).toBe(1);
  });
});

// computeBossMaxHp --------------------------------------------------------
describe('computeBossMaxHp', () => {
  it('matches the calibration values', () => {
    const fresh = computeBossMaxHp(FRESH_GEAR, FRESH_STATS);
    expect(fresh).toBeGreaterThanOrEqual(1750);
    expect(fresh).toBeLessThanOrEqual(1870);

    const maxed = computeBossMaxHp(MAXED_GEAR, MAXED_STATS);
    expect(maxed).toBeGreaterThanOrEqual(8270);
    expect(maxed).toBeLessThanOrEqual(8770);
  });

  it('never goes below 1', () => {
    expect(computeBossMaxHp(0, PLAYER_BASE_STATS)).toBe(
      Math.round(BOSS_HP_BASE * Math.pow(1, BOSS_HP_EXPONENT))
    );
  });
});

// deriveCombatStats / EHP -------------------------------------------------
describe('deriveCombatStats and EHP', () => {
  it('mirrors the frontend derivation', () => {
    const c = deriveCombatStats(MAXED_STATS);
    expect(c.maxHp).toBe(100 + 30 * 5);
    expect(c.armorPercent).toBe(20);
    expect(c.critChance).toBeCloseTo(0.4, 5);
    expect(c.critMultiplier).toBeCloseTo(2.6, 5);
  });

  it('clamps analysis armor at 50%', () => {
    expect(deriveCombatStats(MAXED_TANK_STATS).armorPercent).toBe(50);
  });

  it('EHP baseline sanity: base stats (5% armor) give 100/0.95 = 105.26', () => {
    const base = deriveCombatStats(PLAYER_BASE_STATS);
    expect(base.armorPercent).toBe(5);
    expect(computePlayerEhp(base)).toBeCloseTo(105.2631578, 5);
    expect(EHP_BASELINE).toBeCloseTo(105.3, 5);
  });
});

// Correct hits ------------------------------------------------------------
describe('computeCorrectHit', () => {
  it('maxed MEDIUM hit with streak=2 lands in the 900-1150 band', () => {
    const bossMaxHp = computeBossMaxHp(MAXED_GEAR, MAXED_STATS);
    const res = computeCorrectHit({
      gearScore: MAXED_GEAR,
      stats: MAXED_STATS,
      difficulty: 'MEDIUM',
      streak: 2,
      rand: 0.5,
      critRoll: 0.99, // above critChance (0.4) -> no crit
      bossMaxHp,
    });
    expect(res.isCrit).toBe(false);
    expect(res.damage).toBeGreaterThanOrEqual(900);
    expect(res.damage).toBeLessThanOrEqual(1150);
  });

  it('streak multiplier is flat and capped', () => {
    expect(computeStreakMultiplier(0)).toBe(1);
    expect(computeStreakMultiplier(2)).toBeCloseTo(1.1, 5);
    expect(computeStreakMultiplier(100)).toBe(1.25);
    expect(computeStreakMultiplier(-3)).toBe(1); // negative streak guarded
  });

  it('crit ceiling: stacked crit never exceeds floor(bossMaxHp * 0.45)', () => {
    const bossMaxHp = computeBossMaxHp(MAXED_GEAR, MAXED_STATS);
    const ceiling = Math.floor(bossMaxHp * HIT_CEILING_FRACTION);
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
      for (const streak of [0, 5, 20, 100]) {
        const res = computeCorrectHit({
          gearScore: MAXED_GEAR,
          stats: MAXED_STATS,
          difficulty,
          streak,
          rand: 0.999,
          critRoll: 0, // guaranteed crit
          bossMaxHp,
        });
        expect(res.isCrit).toBe(true);
        expect(res.damage).toBeLessThanOrEqual(ceiling);
        expect(res.damage).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// Fight length ------------------------------------------------------------
describe('power compresses fight length', () => {
  it('fresh needs 11-13 average hits, maxed needs 5-7, and fresh > maxed', () => {
    // Per the calibration spec: rand=0.5 and streak=2 are FIXED for the whole
    // fight; the average is taken over critRoll swept 0..1 per fight.
    const avgHits = (gearScore, stats) => {
      const bossMaxHp = computeBossMaxHp(gearScore, stats);
      let total = 0;
      const trials = 1000;
      for (let i = 0; i < trials; i++) {
        const critRoll = i / trials; // fixed per fight, swept 0..1
        let hp = bossMaxHp;
        let hits = 0;
        while (hp > 0 && hits < 500) {
          const res = computeCorrectHit({
            gearScore,
            stats,
            difficulty: 'MEDIUM',
            streak: 2,
            rand: 0.5,
            critRoll,
            bossMaxHp,
          });
          hp -= res.damage;
          hits++;
        }
        total += hits;
      }
      return total / trials;
    };

    const freshHits = avgHits(FRESH_GEAR, FRESH_STATS);
    const maxedHits = avgHits(MAXED_GEAR, MAXED_STATS);

    expect(freshHits).toBeGreaterThan(maxedHits);
    expect(freshHits).toBeGreaterThanOrEqual(11);
    expect(freshHits).toBeLessThanOrEqual(13);
    expect(maxedHits).toBeGreaterThanOrEqual(5);
    expect(maxedHits).toBeLessThanOrEqual(7);
  });
});

// Miss budget -------------------------------------------------------------
describe('miss budget', () => {
  // Applies computeBossAttack repeatedly against maxHp; returns the miss
  // number on which HP reaches 0 (1-indexed).
  const missesToKO = (stats) => {
    const combat = deriveCombatStats(stats);
    const ehp = computePlayerEhp(combat);
    let hp = combat.maxHp;
    let miss = 0;
    while (hp > 0) {
      miss++;
      const atk = computeBossAttack({ stats, playerEhp: ehp });
      hp -= atk.damage;
    }
    return miss;
  };

  it('fresh student is knocked out on the 3rd wrong answer', () => {
    const ko = missesToKO(FRESH_STATS);
    expect(ko).toBeLessThanOrEqual(3);
    // still alive after miss 2
    expect(ko).toBeGreaterThan(2);
  });

  it('maxed balanced survives 3 misses, KO on the 4th', () => {
    expect(missesToKO(MAXED_STATS)).toBe(4);
  });

  it('maxed tank survives 4 misses, KO on the 5th', () => {
    expect(missesToKO(MAXED_TANK_STATS)).toBe(5);
  });
});

// Boss attack details -----------------------------------------------------
describe('computeBossAttack', () => {
  it('armor is absorbed, not ignored (maxed tank)', () => {
    const combat = deriveCombatStats(MAXED_TANK_STATS);
    const ehp = computePlayerEhp(combat);
    const atk = computeBossAttack({ stats: MAXED_TANK_STATS, playerEhp: ehp });
    expect(atk.absorbed).toBeGreaterThan(0);
    expect(atk.damage).toBeLessThan(atk.rawAttack);
  });

  it('raw attack scales with EHP around the baseline', () => {
    expect(computeBossRawAttack(EHP_BASELINE)).toBeCloseTo(BOSS_ATTACK_BASE, 5);
    const higher = computeBossRawAttack(EHP_BASELINE * 2);
    expect(higher).toBeGreaterThan(BOSS_ATTACK_BASE);
    expect(higher).toBeCloseTo(BOSS_ATTACK_BASE * Math.pow(2, BOSS_ATTACK_EXPONENT), 5);
  });

  it('damage is at least 1 and absorbed never negative', () => {
    const atk = computeBossAttack({ stats: PLAYER_BASE_STATS, playerEhp: 1 });
    expect(atk.damage).toBeGreaterThanOrEqual(1);
    expect(atk.absorbed).toBeGreaterThanOrEqual(0);
  });
});

// Constants ---------------------------------------------------------------
describe('exported constants', () => {
  it('match the approved design', () => {
    expect(PLAYER_BASE_STATS).toEqual({ tech: 10, focus: 10, analysis: 10, charisma: 10 });
    expect(DIFFICULTY_MOD).toEqual({ EASY: 0.85, MEDIUM: 1.0, HARD: 1.2 });
    expect(HIT_CEILING_FRACTION).toBe(0.45);
    expect(BOSS_ATTACK_EXPONENT).toBe(0.72);
  });
});

// Monotonicity / robustness ----------------------------------------------
describe('monotonicity and robustness', () => {
  it('higher gearScore -> strictly higher bossMaxHp', () => {
    let prev = 0;
    for (const gear of [0, 25, 45, 100, 250, 550]) {
      const hp = computeBossMaxHp(gear, MAXED_STATS);
      expect(hp).toBeGreaterThan(prev);
      prev = hp;
    }
  });

  it('higher streak -> non-decreasing damage', () => {
    const bossMaxHp = computeBossMaxHp(MAXED_GEAR, MAXED_STATS);
    let prev = 0;
    for (const streak of [0, 1, 2, 5, 10, 50]) {
      const res = computeCorrectHit({
        gearScore: MAXED_GEAR,
        stats: MAXED_STATS,
        difficulty: 'HARD',
        streak,
        rand: 0.5,
        critRoll: 0.9,
        bossMaxHp,
      });
      expect(res.damage).toBeGreaterThanOrEqual(prev);
      prev = res.damage;
    }
  });

  it('never returns NaN/Infinity/negative across a stats x difficulty matrix', () => {
    const statSets = [
      PLAYER_BASE_STATS,
      FRESH_STATS,
      MAXED_STATS,
      MAXED_TANK_STATS,
      { tech: 0, focus: 0, analysis: 0, charisma: 0 },
      { tech: 100, focus: 100, analysis: 100, charisma: 100 },
    ];
    for (const stats of statSets) {
      for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
        for (const gear of [0, 45, 550]) {
          const bossMaxHp = computeBossMaxHp(gear, stats);
          expect(Number.isFinite(bossMaxHp)).toBe(true);
          expect(bossMaxHp).toBeGreaterThanOrEqual(1);

          const combat = deriveCombatStats(stats);
          const ehp = computePlayerEhp(combat);
          expect(Number.isFinite(ehp)).toBe(true);

          const hit = computeCorrectHit({
            gearScore: gear,
            stats,
            difficulty,
            streak: 3,
            rand: 0.3,
            critRoll: 0.2,
            bossMaxHp,
          });
          expect(Number.isFinite(hit.damage)).toBe(true);
          expect(hit.damage).toBeGreaterThanOrEqual(1);

          const atk = computeBossAttack({ stats, playerEhp: ehp });
          expect(Number.isFinite(atk.damage)).toBe(true);
          expect(atk.damage).toBeGreaterThanOrEqual(1);
          expect(Number.isFinite(atk.rawAttack)).toBe(true);
          expect(Number.isFinite(atk.absorbed)).toBe(true);
          expect(atk.absorbed).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

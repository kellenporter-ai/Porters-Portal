import { describe, it, expect } from 'vitest';
import {
  MIN_MISS_DAMAGE,
  SKILL_NODE_IDS,
  computeCorrectHit,
  computePlayerEhp,
  computeBossRawAttack,
  deriveCombatStats,
  resolveBossTurn,
} from '../lib/boss-combat.js';

const BASE_STATS = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
const TANK_STATS = { tech: 10, focus: 10, analysis: 100, charisma: 10 };
const GLASS_STATS = { tech: 45, focus: 40, analysis: 40, charisma: 40 };

const stateFor = (overrides = {}) => ({
  bossHp: 1000,
  bossMaxHp: 1000,
  playerHp: 100,
  playerMaxHp: 100,
  streak: 0,
  healsUsedThisAttempt: 0,
  attemptDamageReduction: 0,
  lethalSaveUsed: false,
  shieldHp: 0,
  isFirstOfAttempt: false,
  isFirstMissOfAttempt: false,
  ...overrides,
});

const answerFor = (overrides = {}) => ({
  correct: false,
  difficulty: 'MEDIUM',
  isRevision: false,
  rand: 0.5,
  critRoll: 0.99,
  gearScore: 0,
  stats: { ...BASE_STATS },
  ...overrides,
});

function advanceMiss(state, identity = null, ownedNodeIds = [], overrides = {}) {
  const result = resolveBossTurn(identity, ownedNodeIds, state, answerFor(overrides));
  return [result, stateFor({
    ...state,
    bossHp: result.bossHp,
    playerHp: result.playerHp,
    streak: result.streak,
    healsUsedThisAttempt: result.healsUsedThisAttempt,
    attemptDamageReduction: result.attemptDamageReduction,
    lethalSaveUsed: result.lethalSaveUsed,
    shieldHp: result.shieldHp,
    isFirstOfAttempt: false,
    isFirstMissOfAttempt: false,
  })];
}

describe('skill-adjusted correct hits', () => {
  const hitInput = () => ({
    gearScore: 0,
    stats: { ...BASE_STATS },
    difficulty: 'MEDIUM',
    streak: 0,
    rand: 0.5,
    critRoll: 0.2,
    bossMaxHp: 1000,
  });

  it('keeps legacy behavior when every optional field is omitted', () => {
    expect(computeCorrectHit(hitInput())).toEqual(computeCorrectHit({
      ...hitInput(),
      damageMultiplier: 1,
      critBonus: 0,
      guaranteedCrit: false,
    }));
  });

  it('caps total crit chance at 0.65 and honors a guaranteed crit', () => {
    const justOutsideCap = computeCorrectHit({
      ...hitInput(),
      critRoll: 0.65,
      critBonus: 0.6,
    });
    const justInsideCap = computeCorrectHit({
      ...hitInput(),
      critRoll: 0.649999,
      critBonus: 0.6,
    });
    const guaranteed = computeCorrectHit({
      ...hitInput(),
      critRoll: 0.99,
      guaranteedCrit: true,
    });
    expect(justOutsideCap.isCrit).toBe(false);
    expect(justInsideCap.isCrit).toBe(true);
    expect(guaranteed.isCrit).toBe(true);
  });

  it('clamps the multiplier and applies it before the 45% ceiling', () => {
    const capped = computeCorrectHit({
      ...hitInput(),
      critRoll: 0.99,
      damageMultiplier: 99,
    });
    expect(capped.preCeilingDamage).toBe(130);
    expect(capped.damage).toBe(130);
    expect(capped.damage).toBeLessThanOrEqual(Math.floor(1000 * 0.45));

    const ceiling = computeCorrectHit({
      ...hitInput(),
      stats: { tech: 45, focus: 40, analysis: 40, charisma: 40 },
      gearScore: 550,
      bossMaxHp: 1000,
      damageMultiplier: 99,
      guaranteedCrit: true,
    });
    expect(ceiling.preCeilingDamage).toBeGreaterThan(450);
    expect(ceiling.damage).toBe(450);
  });
});

describe('pure boss turn resolution', () => {
  it('knocks out a max-tank Guardian on miss 6, never miss 5, at the floor', () => {
    const combat = deriveCombatStats(TANK_STATS);
    const ehp = computePlayerEhp({ maxHp: 100, armorPercent: combat.armorPercent });
    const attack = Math.max(1, Math.round(computeBossRawAttack(ehp) * 0.5));
    expect(attack * 0.75 * 0.5).toBeLessThan(MIN_MISS_DAMAGE);

    let state = stateFor({
      playerHp: 130,
      playerMaxHp: 130,
      attemptDamageReduction: 0.5,
    });
    for (let miss = 1; miss <= 6; miss++) {
      const [result, next] = advanceMiss(
        state,
        'GUARDIAN',
        SKILL_NODE_IDS.GUARDIAN,
        { stats: { ...TANK_STATS } },
      );
      expect(result.playerHp).toBe(Math.max(0, 130 - miss * MIN_MISS_DAMAGE));
      expect(result.knockout).toBe(miss === 6);
      if (miss === 5) expect(result.knockout).toBe(false);
      state = next;
    }
  });

  it('applies MIN_MISS_DAMAGE after worst-case multiplicative mitigation', () => {
    const result = resolveBossTurn('GUARDIAN', SKILL_NODE_IDS.GUARDIAN, stateFor({
      attemptDamageReduction: 0.5,
    }), answerFor({ stats: { ...TANK_STATS } }));
    expect(result.damageTaken).toBe(MIN_MISS_DAMAGE);
    expect(result.damageTaken).toBeGreaterThanOrEqual(MIN_MISS_DAMAGE);
    expect(result.playerHp).toBe(100 - MIN_MISS_DAMAGE);
  });

  it('does not let a max-output Berserker kill before the third correct answer', () => {
    let state = stateFor({
      bossHp: 100,
      bossMaxHp: 100,
      playerHp: 10,
      playerMaxHp: 100,
    });
    for (let hit = 1; hit <= 2; hit++) {
      const result = resolveBossTurn('BERSERKER', SKILL_NODE_IDS.BERSERKER, state,
        answerFor({
          correct: true,
          gearScore: 550,
          critRoll: 0,
          stats: { ...GLASS_STATS },
        }));
      expect(result.isCrit).toBe(true);
      expect(result.victory).toBe(false);
      expect(result.bossHp).toBe(100 - hit * 45);
      // Siphon heals after the hit; keep HP below Reckless's 80% trigger so
      // every subsequent turn still exercises maximum crit-adjusted output.
      state = stateFor({ ...state, bossHp: result.bossHp, streak: result.streak, playerHp: 10 });
    }
    const third = resolveBossTurn('BERSERKER', SKILL_NODE_IDS.BERSERKER, state,
      answerFor({ correct: true, gearScore: 550, stats: { ...GLASS_STATS } }));
    expect(third.victory).toBe(true);
    expect(third.executed).toBe(false); // ordinary damage already kills; execute must not relabel it
  });

  it('keeps SPEEDSTER streak on the first miss, then resets on the second', () => {
    let state = stateFor({ isFirstOfAttempt: true });
    const hitAnswer = answerFor({ correct: true });
    const firstHit = resolveBossTurn('SPEEDSTER', ['spd_1', 'spd_2'], state, hitAnswer);
    state = stateFor({ ...state, streak: firstHit.streak, isFirstOfAttempt: false });
    const secondHit = resolveBossTurn('SPEEDSTER', ['spd_1', 'spd_2'], state, hitAnswer);
    expect(secondHit.streak).toBe(2);
    state = stateFor({
      ...state,
      bossHp: secondHit.bossHp,
      streak: secondHit.streak,
      isFirstMissOfAttempt: true,
    });
    const firstMiss = resolveBossTurn('SPEEDSTER', ['spd_1', 'spd_2'], state, answerFor());
    expect(firstMiss.streak).toBe(2);
    state = stateFor({ ...state, streak: firstMiss.streak, isFirstMissOfAttempt: false });
    const secondMiss = resolveBossTurn('SPEEDSTER', ['spd_1', 'spd_2'], state, answerFor());
    expect(secondMiss.streak).toBe(0);
  });

  it('labels execute only when normal damage leaves the boss alive', () => {
    const lethal = resolveBossTurn('BERSERKER', ['ber_6'], stateFor({
      bossHp: 1,
      bossMaxHp: 1000,
    }), answerFor({ correct: true }));
    expect(lethal.bossHp).toBe(0);
    expect(lethal.victory).toBe(true);
    expect(lethal.executed).toBe(false);

    const execute = resolveBossTurn('BERSERKER', ['ber_6'], stateFor({
      bossHp: 110,
      bossMaxHp: 1000,
    }), answerFor({ correct: true }));
    expect(execute.bossHp).toBe(0);
    expect(execute.executed).toBe(true);
  });

  it('does not consume a lethal save when the miss leaves 15 HP', () => {
    const result = resolveBossTurn('JUGGERNAUT', ['jug_6'], stateFor({
      playerHp: 48,
      playerMaxHp: 100,
    }), answerFor({ stats: { ...TANK_STATS } }));
    expect(result.playerHp).toBe(15);
    expect(result.knockback).toBe(false);
    expect(result.lethalSaveConsumed).toBe(false);
    expect(result.lethalSaveUsed).toBe(false);
  });

  it('consumes JUGGERNAUT lethal save once, then knocks out on the next lethal miss', () => {
    const first = resolveBossTurn('JUGGERNAUT', ['jug_6'], stateFor({
      playerHp: 10,
      playerMaxHp: 100,
    }), answerFor());
    expect(first.knockback).toBe(true);
    expect(first.knockout).toBe(false);
    expect(first.lethalSaveConsumed).toBe(true);
    expect(first.lethalSaveUsed).toBe(true);
    expect(first.playerHp).toBe(1);

    const second = resolveBossTurn('JUGGERNAUT', ['jug_6'], stateFor({
      playerHp: 1,
      playerMaxHp: 100,
      lethalSaveUsed: first.lethalSaveUsed,
    }), answerFor());
    expect(second.knockback).toBe(true);
    expect(second.knockout).toBe(true);
    expect(second.lethalSaveConsumed).toBe(false);
    expect(second.playerHp).toBe(0);
  });

  it('applies the floor before a 15 HP shield absorbs exactly 15 of 22 damage', () => {
    const result = resolveBossTurn('GUARDIAN', ['grd_5'], stateFor({
      attemptDamageReduction: 0.5,
      shieldHp: 15,
    }), answerFor({ stats: { ...TANK_STATS } }));
    expect(result.damageTaken).toBe(7);
    expect(result.shieldHp).toBe(0);
    expect(result.playerHp).toBe(93);
  });

  it('normalizes missing legacy fields without NaN or a free lethal save', () => {
    const state = stateFor();
    delete state.attemptDamageReduction;
    delete state.lethalSaveUsed;
    delete state.shieldHp;
    const result = resolveBossTurn(null, [], state, answerFor());
    expect(result.attemptDamageReduction).toBe(0);
    expect(result.lethalSaveUsed).toBe(false);
    expect(result.shieldHp).toBe(0);
    expect(result.playerHp).toBe(60);
    expect(Object.values(result).every((value) =>
      typeof value !== 'number' || Number.isFinite(value))).toBe(true);
  });

  it('enforces heal, shield, streak, HP, and applied-key result contracts', () => {
    const heal = resolveBossTurn('CLERIC', ['clr_2'], stateFor({
      playerHp: 35,
      playerMaxHp: 100,
      healsUsedThisAttempt: 7,
    }), answerFor({ correct: true }));
    expect(heal.healApplied).toBe(1);
    expect(heal.playerHp).toBe(36);
    expect(heal.healsUsedThisAttempt).toBe(8);

    const shield = resolveBossTurn('TACTICIAN', ['tac_6'], stateFor({
      shieldHp: 15,
      isFirstOfAttempt: true,
    }), answerFor({ correct: true }));
    expect(shield.shieldHp).toBe(20);
    expect(shield.appliedKeys).toEqual(['Contingency']);
  });

  it('reports a correct heal capped by the per-attempt allowance', () => {
    const result = resolveBossTurn('BERSERKER', ['ber_4'], stateFor({
      playerHp: 40, healsUsedThisAttempt: 8,
    }), answerFor({ correct: true }));
    expect(result.healApplied).toBe(0);
    expect(result.healCapped).toBe(true);
  });

  it('does not report a cap when four healing lands', () => {
    const result = resolveBossTurn('BERSERKER', ['ber_4'], stateFor({
      playerHp: 40,
    }), answerFor({ correct: true }));
    expect(result.healApplied).toBe(4);
    expect(result.healCapped).toBe(false);
  });

  it('does not report a cap without a heal node', () => {
    const result = resolveBossTurn('BERSERKER', ['ber_1'], stateFor({
      playerHp: 40, healsUsedThisAttempt: 8,
    }), answerFor({ correct: true }));
    expect(result.healCapped).toBe(false);
  });

  it('reports an otherwise-applicable heal suppressed at full HP', () => {
    const result = resolveBossTurn('CLERIC', ['clr_2'], stateFor(), answerFor({ correct: true }));
    expect(result.healApplied).toBe(0);
    expect(result.healCapped).toBe(true);
  });

  it('returns finite numeric skill telemetry on a normal turn', () => {
    const result = resolveBossTurn('BERSERKER', ['ber_1', 'ber_4'], stateFor({
      playerHp: 40,
    }), answerFor({ correct: true }));
    expect(result.rank).toBe(2);
    expect(result.damageMultiplier).toBe(1.08);
    expect(result.incomingMultiplier).toBe(1);
    expect(result.critBonus).toBe(0);
    for (const key of ['rank', 'damageMultiplier', 'incomingMultiplier', 'critBonus', 'healApplied']) {
      expect(Number.isFinite(result[key])).toBe(true);
    }
    expect(result.healCapped).toBe(false);
  });

  it('treats null or unknown identities as neutral and malformed input as a no-op', () => {
    const state = stateFor();
    const neutral = resolveBossTurn(null, SKILL_NODE_IDS.GUARDIAN, state, answerFor());
    expect(neutral.damageTaken).toBe(40);
    expect(neutral.appliedKeys).toEqual([]);

    const malformed = resolveBossTurn('NOT_AN_IDENTITY', [], state, answerFor());
    expect(malformed.bossHp).toBe(state.bossHp);
    expect(malformed.playerHp).toBe(state.playerHp);
    expect(malformed.streak).toBe(state.streak);
    expect(malformed.damageDealt).toBe(0);
    expect(malformed.damageTaken).toBe(0);

    expect(() => resolveBossTurn(null, [], null, answerFor())).not.toThrow();
    expect(() => resolveBossTurn(null, [], state, {
      ...answerFor(),
      stats: { tech: NaN, focus: 10, analysis: 10, charisma: 10 },
    })).not.toThrow();
  });
});

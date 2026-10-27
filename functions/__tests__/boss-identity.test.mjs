// Pure skill-identity evaluator tests (I3.2). Runs against compiled lib output.
import { describe, it, expect } from 'vitest';
import {
  SKILL_IDENTITY_VERSION,
  MAX_SKILL_RANK,
  HEAL_CAP_PER_ANSWER,
  HEAL_CAP_PER_ATTEMPT,
  SKILL_NODE_IDS,
  computeSkillRank,
  evaluateSkillIdentity,
} from '../lib/boss-combat.js';

const IDENTITIES = [
  'JUGGERNAUT', 'BERSERKER', 'SNIPER', 'SPEEDSTER',
  'GUARDIAN', 'CLERIC', 'TACTICIAN', 'SCHOLAR',
];

const inputFor = (identity, overrides = {}) => ({
  identity,
  rank: 6,
  correct: true,
  streak: 5,
  priorStreak: 0,
  playerHp: 20,
  playerMaxHp: 100,
  bossHp: 20,
  bossMaxHp: 100,
  difficulty: 'HARD',
  isHardestDifficulty: true,
  isRevision: true,
  healsUsedThisAttempt: 0,
  ...overrides,
});

const neutral = (identity, rank = 0) => ({
  damageMultiplier: 1,
  incomingMultiplier: 1,
  healApplied: 0,
  critBonus: 0,
  identity,
  rank,
});

describe('skill identity catalogue and rank derivation', () => {
  it('recognizes all 8 identities and exposes versioned constants', () => {
    expect(SKILL_IDENTITY_VERSION).toBe(1);
    expect(MAX_SKILL_RANK).toBe(6);
    expect(HEAL_CAP_PER_ANSWER).toBe(4);
    expect(HEAL_CAP_PER_ATTEMPT).toBe(8);
    expect(Object.keys(SKILL_NODE_IDS).sort()).toEqual([...IDENTITIES].sort());
    for (const identity of IDENTITIES) {
      expect(evaluateSkillIdentity(inputFor(identity)).identity).toBe(identity);
    }
  });

  it('contains all 48 real node ids exactly once across the eight lists', () => {
    const allIds = Object.values(SKILL_NODE_IDS).flat();
    expect(allIds).toHaveLength(48);
    expect(new Set(allIds).size).toBe(48);
    for (const identity of IDENTITIES) {
      expect(SKILL_NODE_IDS[identity]).toHaveLength(6);
      const prefix = {
        JUGGERNAUT: 'jug', BERSERKER: 'ber', SNIPER: 'sni', SPEEDSTER: 'spd',
        GUARDIAN: 'grd', CLERIC: 'clr', TACTICIAN: 'tac', SCHOLAR: 'sch',
      }[identity];
      expect(SKILL_NODE_IDS[identity]).toEqual(
        Array.from({ length: 6 }, (_, index) => `${prefix}_${index + 1}`)
      );
    }
  });

  it('derives rank from distinct valid ids only and clamps at 6', () => {
    const jug = SKILL_NODE_IDS.JUGGERNAUT;
    expect(computeSkillRank('JUGGERNAUT', [])).toBe(0);
    expect(computeSkillRank('JUGGERNAUT', jug.slice(0, 3))).toBe(3);
    expect(computeSkillRank('JUGGERNAUT', [jug[0], jug[0], jug[1]])).toBe(2);
    expect(computeSkillRank('JUGGERNAUT', ['unknown', ...SKILL_NODE_IDS.CLERIC])).toBe(0);
    expect(computeSkillRank('JUGGERNAUT', [...jug, ...jug, 'unknown', 'clr_1'])).toBe(6);
    expect(computeSkillRank('NOT_AN_IDENTITY', jug)).toBe(0);
    expect(computeSkillRank('JUGGERNAUT', null)).toBe(0);
  });
});

describe('identity damage and neutral behaviour', () => {
  it('is neutral at rank 0 for all eight identities', () => {
    for (const identity of IDENTITIES) {
      expect(evaluateSkillIdentity(inputFor(identity, { rank: 0 }))).toEqual(neutral(identity));
    }
  });

  it('reaches every documented rank-6 maximum', () => {
    const cases = [
      ['JUGGERNAUT', { playerHp: 25 }, 1.18],
      ['BERSERKER', { bossHp: 25 }, 1.24],
      ['SNIPER', { bossHp: 100 }, 1.24],
      ['SPEEDSTER', { streak: 5 }, 1.24],
      ['TACTICIAN', { isRevision: true }, 1.24],
      ['SCHOLAR', { isHardestDifficulty: true }, 1.24],
    ];
    for (const [identity, overrides, expected] of cases) {
      const result = evaluateSkillIdentity(inputFor(identity, overrides));
      expect(result.damageMultiplier).toBeCloseTo(expected, 10);
      expect(result.rank).toBe(6);
      expect(result.incomingMultiplier).toBe(1);
      expect(result.critBonus).toBe(0);
    }
  });

  it('uses neutral outgoing damage on a wrong answer for every identity', () => {
    for (const identity of IDENTITIES) {
      const result = evaluateSkillIdentity(inputFor(identity, {
        correct: false,
        playerHp: identity === 'GUARDIAN' ? 100 : 20,
        bossHp: identity === 'SNIPER' ? 100 : 20,
      }));
      expect(result.damageMultiplier).toBe(1);
      expect(result.healApplied).toBe(0);
    }
  });

  it('leaves damage neutral outside each conditional trigger', () => {
    const cases = [
      ['JUGGERNAUT', { playerHp: 100 }],
      ['BERSERKER', { bossHp: 100 }],
      ['SNIPER', { bossHp: 99 }],
      ['SPEEDSTER', { streak: 1 }],
      ['TACTICIAN', { isRevision: false }],
      ['SCHOLAR', { isHardestDifficulty: false }],
    ];
    for (const [identity, overrides] of cases) {
      expect(evaluateSkillIdentity(inputFor(identity, overrides)).damageMultiplier).toBe(1);
    }
  });
});

describe('identity healing and miss-budget safety', () => {
  it('grants Guardian its rank-6 full-HP shield only at full HP', () => {
    expect(evaluateSkillIdentity(inputFor('GUARDIAN', { playerHp: 100 })).healApplied).toBe(4);
    expect(evaluateSkillIdentity(inputFor('GUARDIAN', { playerHp: 98 })).healApplied).toBe(0);
  });

  it('caps Cleric at 4 per answer and 8 across an attempt', () => {
    const perAnswer = evaluateSkillIdentity(inputFor('CLERIC', { playerHp: 50 }));
    expect(perAnswer.healApplied).toBe(4);

    const byAttempt = [0, 4, 7, 8, 20].map((healsUsedThisAttempt) =>
      evaluateSkillIdentity(inputFor('CLERIC', { playerHp: 50, healsUsedThisAttempt })).healApplied
    );
    expect(byAttempt).toEqual([4, 4, 1, 0, 0]);

    let total = 0;
    for (let answer = 0; answer < 5; answer++) {
      total += evaluateSkillIdentity(inputFor('CLERIC', {
        playerHp: 50,
        healsUsedThisAttempt: total,
      })).healApplied;
    }
    expect(total).toBe(8);
  });

  it('never heals beyond missing HP', () => {
    expect(evaluateSkillIdentity(inputFor('CLERIC', { playerHp: 99 })).healApplied).toBe(1);
    expect(evaluateSkillIdentity(inputFor('CLERIC', { playerHp: 100 })).healApplied).toBe(0);
  });

  it('preserves the fresh-student third-miss KO with alternating rank-6 Cleric heals', () => {
    let hp = 100;
    let streak = 0;
    let misses = 0;
    let healsUsedThisAttempt = 0;
    let koOnMiss = null;
    const answers = [true, false, true, false, true, false];

    for (const correct of answers) {
      const priorStreak = streak;
      streak = correct ? streak + 1 : 0;
      if (correct) {
        const result = evaluateSkillIdentity(inputFor('CLERIC', {
          playerHp: hp,
          priorStreak,
          streak,
          healsUsedThisAttempt,
        }));
        hp = Math.min(100, hp + result.healApplied);
        healsUsedThisAttempt += result.healApplied;
      } else {
        misses++;
        hp -= 40;
        if (hp <= 0 && koOnMiss === null) {
          koOnMiss = misses;
        }
      }
    }

    expect(healsUsedThisAttempt).toBe(8);
    expect(koOnMiss).toBe(3);
    expect(hp).toBeLessThanOrEqual(0);
  });
});

describe('identity malformed-input handling', () => {
  it('returns neutral for invalid rank, NaN, and negative HP without throwing', () => {
    const malformed = [
      inputFor('JUGGERNAUT', { rank: 99 }),
      inputFor('BERSERKER', { rank: NaN }),
      inputFor('CLERIC', { playerHp: -1 }),
      inputFor('SPEEDSTER', { streak: NaN }),
    ];
    for (const input of malformed) {
      expect(() => evaluateSkillIdentity(input)).not.toThrow();
      expect(evaluateSkillIdentity(input)).toEqual(neutral(input.identity));
    }
  });

  it('returns a neutral result for null input without throwing', () => {
    expect(() => evaluateSkillIdentity(null)).not.toThrow();
    expect(evaluateSkillIdentity(null)).toEqual(neutral('JUGGERNAUT'));
  });
});

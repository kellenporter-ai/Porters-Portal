import { describe, it, expect } from 'vitest';
import { resolveIdentityModifiers } from '../lib/bosses.js';
import { SKILL_NODE_IDS } from '../lib/boss-combat.js';

const IDENTITIES = ['JUGGERNAUT', 'BERSERKER', 'SNIPER', 'SPEEDSTER', 'GUARDIAN', 'CLERIC', 'TACTICIAN', 'SCHOLAR'];
const args = (specId, overrides = {}) => ({
  specId,
  unlockedSkills: specId && SKILL_NODE_IDS[specId] ? [...SKILL_NODE_IDS[specId]] : [],
  correct: true,
  streak: 5,
  priorStreak: 0,
  playerHp: 20,
  playerMaxHp: 100,
  bossHp: 20,
  bossMaxHp: 100,
  difficulty: 'HARD',
  isRevision: true,
  healsUsedThisAttempt: 0,
  ...overrides,
});

describe('answerBossEvent identity modifier resolution', () => {
  it('is fully neutral without a specialization', () => {
    expect(resolveIdentityModifiers(args(undefined))).toEqual({
      damageMultiplier: 1, incomingMultiplier: 1, healApplied: 0,
      critBonus: 0, rank: 0, identity: null,
    });
  });

  it('is neutral and does not throw for an unknown specialization', () => {
    expect(() => resolveIdentityModifiers(args('UNKNOWN'))).not.toThrow();
    expect(resolveIdentityModifiers(args('UNKNOWN'))).toMatchObject({
      damageMultiplier: 1, incomingMultiplier: 1, healApplied: 0, rank: 0, identity: null,
    });
  });

  it('triggers all six damage identities and both healing identities at rank 6', () => {
    const triggers = {
      JUGGERNAUT: { playerHp: 20 }, BERSERKER: { bossHp: 20 },
      SNIPER: { bossHp: 100 }, SPEEDSTER: { streak: 5 },
      TACTICIAN: { isRevision: true }, SCHOLAR: { difficulty: 'HARD' },
    };
    for (const [identity, overrides] of Object.entries(triggers)) {
      expect(resolveIdentityModifiers(args(identity, overrides)).damageMultiplier).toBeGreaterThan(1);
    }
    expect(resolveIdentityModifiers(args('GUARDIAN', { playerHp: 100 }))).toMatchObject({ damageMultiplier: 1, healApplied: 4 });
    expect(resolveIdentityModifiers(args('CLERIC', { playerHp: 50 }))).toMatchObject({ damageMultiplier: 1, healApplied: 4 });
  });

  it('never grants bonus outgoing damage on a wrong answer', () => {
    for (const identity of IDENTITIES) {
      expect(resolveIdentityModifiers(args(identity, { correct: false, streak: 0 })).damageMultiplier).toBe(1);
    }
  });

  it('never lets Cleric healing exceed missing HP', () => {
    expect(resolveIdentityModifiers(args('CLERIC', { playerHp: 99 })).healApplied).toBe(1);
    expect(resolveIdentityModifiers(args('CLERIC', { playerHp: 100 })).healApplied).toBe(0);
  });

  it('forces healing to zero after eight HP for Cleric and Guardian', () => {
    for (const identity of ['CLERIC', 'GUARDIAN']) {
      expect(resolveIdentityModifiers(args(identity, { healsUsedThisAttempt: 8 })).healApplied).toBe(0);
    }
  });

  it('counts distinct unlocked ids for the selected identity only', () => {
    const jug = SKILL_NODE_IDS.JUGGERNAUT;
    const result = resolveIdentityModifiers(args('JUGGERNAUT', {
      unlockedSkills: [jug[0], jug[0], jug[1], jug[2], 'unknown', ...SKILL_NODE_IDS.CLERIC],
    }));
    expect(result.rank).toBe(3);
    expect(result.identity).toBe('JUGGERNAUT');
  });
});

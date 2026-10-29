import { describe, it, expect } from 'vitest';
import {
  SKILL_NODE_IDS,
  SKILL_TREE,
  HEAL_CAP_PER_ANSWER,
  HEAL_CAP_PER_ATTEMPT,
  evaluateSkillNodes,
} from '../lib/boss-combat.js';

const IDENTITIES = Object.keys(SKILL_NODE_IDS);

const inputFor = (identity, overrides = {}) => ({
  identity,
  ownedNodeIds: SKILL_NODE_IDS[identity],
  correct: true,
  streak: 3,
  priorStreak: 0,
  playerHp: 40,
  playerMaxHp: 100,
  bossHp: 70,
  bossMaxHp: 100,
  difficulty: 'HARD',
  isRevision: true,
  healsUsedThisAttempt: 0,
  isFirstOfAttempt: true,
  ...overrides,
});

const neutral = () => ({
  damageMultiplier: 1,
  critBonus: 0,
  damageTakenMultiplier: 1,
  heal: 0,
  shield: 0,
  keepStreakOnMiss: false,
  lethalSave: false,
  execute: false,
  appliedNodeIds: [],
  appliedKeys: [],
});

describe('skill node table', () => {
  it('has exactly six ordered nodes with the fixed cost ladder in every tree', () => {
    expect(Object.keys(SKILL_TREE).sort()).toEqual([...IDENTITIES].sort());
    for (const identity of IDENTITIES) {
      expect(SKILL_TREE[identity]).toHaveLength(6);
      expect(SKILL_TREE[identity].map((node) => node.slot)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(SKILL_TREE[identity].map((node) => node.cost)).toEqual([1, 1, 2, 2, 3, 5]);
      expect(new Set(SKILL_TREE[identity].map((node) => node.key)).size).toBe(6);
    }
  });
});

describe('node-based effect evaluation', () => {
  it('never exceeds the 1.30 damage cap with all six nodes owned', () => {
    // HP_ABOVE_50 and HP_BELOW_50 cannot both hold. Exercise both sides (and
    // both boss thresholds) so every conditional damage node gets its turn.
    const contexts = [
      { playerHp: 40, bossHp: 70 },
      { playerHp: 80, bossHp: 70 },
      { playerHp: 40, bossHp: 40 },
      { playerHp: 80, bossHp: 40 },
    ];
    for (const identity of IDENTITIES) {
      for (const context of contexts) {
        const result = evaluateSkillNodes(inputFor(identity, context));
        expect(result.damageMultiplier).toBeGreaterThanOrEqual(1);
        expect(result.damageMultiplier).toBeLessThanOrEqual(1.30);
      }
    }
  });

  it('makes slot 3 and slot 4 distinct in at least six trees', () => {
    let distinctTrees = 0;
    for (const identity of IDENTITIES) {
      const ids = SKILL_NODE_IDS[identity];
      const slot3 = evaluateSkillNodes(inputFor(identity, { ownedNodeIds: [ids[2]] }));
      const slot4 = evaluateSkillNodes(inputFor(identity, { ownedNodeIds: [ids[3]] }));
      expect(slot3.appliedKeys).not.toEqual(slot4.appliedKeys);
      distinctTrees++;
    }
    expect(distinctTrees).toBeGreaterThanOrEqual(6);
  });

  it('distinguishes owning slots 1+2 from owning slots 1+3', () => {
    const firstBuild = evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds: ['jug_1', 'jug_2'],
    }));
    const secondBuild = evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds: ['jug_1', 'jug_3'],
    }));
    expect(firstBuild.damageMultiplier).toBe(1.08);
    expect(secondBuild.damageMultiplier).toBeCloseTo(1.08 * 1.12);
    expect(firstBuild.appliedKeys).not.toEqual(secondBuild.appliedKeys);
  });

  it('gives two four-node builds in one tree different effects', () => {
    const firstBuild = evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds: ['jug_1', 'jug_2', 'jug_3', 'jug_4'],
    }));
    const secondBuild = evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds: ['jug_1', 'jug_2', 'jug_5', 'jug_6'],
    }));
    expect(firstBuild.appliedNodeIds).toHaveLength(3);
    expect(secondBuild.appliedNodeIds).toHaveLength(2);
    expect(firstBuild.damageMultiplier).not.toBe(secondBuild.damageMultiplier);
    expect(firstBuild.appliedKeys).not.toEqual(secondBuild.appliedKeys);
  });

  it('does not apply outgoing damage or crit nodes on a miss', () => {
    const result = evaluateSkillNodes(inputFor('SCHOLAR', { correct: false }));
    expect(result.damageMultiplier).toBe(1);
    expect(result.critBonus).toBe(0);
    expect(result.appliedKeys).not.toContain('Mastery');
    expect(result.appliedKeys).not.toContain('Insight');
  });

  it('caps combined crit bonuses at 0.25', () => {
    const result = evaluateSkillNodes(inputFor('SNIPER', {
      ownedNodeIds: ['sni_2', 'sni_4'],
    }));
    expect(result.critBonus).toBe(0.25);
  });
});

describe('healing and defensive invariants', () => {
  it('respects the per-answer heal cap', () => {
    const original = SKILL_TREE.BERSERKER[3].value;
    try {
      SKILL_TREE.BERSERKER[3].value = 12;
      const result = evaluateSkillNodes(inputFor('BERSERKER', {
        ownedNodeIds: ['ber_4'],
      }));
      expect(result.heal).toBe(HEAL_CAP_PER_ANSWER);
    } finally {
      SKILL_TREE.BERSERKER[3].value = original;
    }
  });

  it('respects the per-attempt heal cap as healing accumulates', () => {
    const heals = [0, 4, 7, 8, 20].map((healsUsedThisAttempt) =>
      evaluateSkillNodes(inputFor('BERSERKER', {
        ownedNodeIds: ['ber_4'],
        healsUsedThisAttempt,
      })).heal
    );
    expect(heals).toEqual([4, 4, 1, 0, 0]);
    expect(HEAL_CAP_PER_ATTEMPT).toBe(8);
  });

  it('never heals beyond missing HP', () => {
    expect(evaluateSkillNodes(inputFor('CLERIC', {
      ownedNodeIds: ['clr_2'],
      playerHp: 99,
    })).heal).toBe(1);
    expect(evaluateSkillNodes(inputFor('CLERIC', {
      ownedNodeIds: ['clr_2'],
      playerHp: 100,
    })).heal).toBe(0);
  });

  it('enables lethal save only while its condition holds', () => {
    const ownedNodeIds = ['jug_6'];
    expect(evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds,
      playerHp: 80,
    })).lethalSave).toBe(true);
    expect(evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds,
      playerHp: 40,
    })).lethalSave).toBe(false);
  });

  it('floors damage taken at 0.75 even for an excessive multiplier', () => {
    const original = SKILL_TREE.CLERIC[3].value;
    try {
      SKILL_TREE.CLERIC[3].value = 0.5;
      const result = evaluateSkillNodes(inputFor('CLERIC', {
        ownedNodeIds: ['clr_4'],
      }));
      expect(result.damageTakenMultiplier).toBe(0.75);
    } finally {
      SKILL_TREE.CLERIC[3].value = original;
    }
  });

  it('only executes on a correct answer below the boss HP threshold', () => {
    const ownedNodeIds = ['ber_6'];
    expect(evaluateSkillNodes(inputFor('BERSERKER', {
      ownedNodeIds,
      bossHp: 10,
    })).execute).toBe(true);
    expect(evaluateSkillNodes(inputFor('BERSERKER', {
      ownedNodeIds,
      bossHp: 20,
    })).execute).toBe(false);
    expect(evaluateSkillNodes(inputFor('BERSERKER', {
      ownedNodeIds,
      bossHp: 10,
      correct: false,
    })).execute).toBe(false);
  });
});

describe('invalid and foreign input handling', () => {
  it('ignores unknown, duplicate, and cross-specialization node ids', () => {
    const result = evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds: ['unknown', 'jug_99', ...SKILL_NODE_IDS.SCHOLAR, 'unknown'],
    }));
    expect(result).toEqual(neutral());
  });

  it('returns fresh neutral results for malformed input and never throws', () => {
    const malformed = [
      null,
      undefined,
      {},
      inputFor('JUGGERNAUT', { identity: 'UNKNOWN' }),
      inputFor('JUGGERNAUT', { ownedNodeIds: null }),
      inputFor('JUGGERNAUT', { correct: 'yes' }),
      inputFor('JUGGERNAUT', { streak: NaN }),
      inputFor('JUGGERNAUT', { playerHp: -1 }),
      inputFor('JUGGERNAUT', { playerMaxHp: 0 }),
      inputFor('JUGGERNAUT', { difficulty: 'EXTREME' }),
      inputFor('JUGGERNAUT', { healsUsedThisAttempt: -1 }),
    ];
    for (const input of malformed) {
      expect(() => evaluateSkillNodes(input)).not.toThrow();
      const result = evaluateSkillNodes(input);
      expect(result).toEqual(neutral());
      expect(result.appliedNodeIds).not.toBe(result.appliedKeys);
    }
  });
});

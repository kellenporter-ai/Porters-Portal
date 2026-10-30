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
  requestedHeal: 0,
  shield: 0,
  keepStreakOnMiss: false,
  lethalSave: false,
  execute: false,
  guaranteedCrit: false,
  attemptDamageReduction: 0,
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
    expect(secondBuild.appliedNodeIds).toHaveLength(3);
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
    const original = SKILL_TREE.SNIPER[1].value;
    try {
      SKILL_TREE.SNIPER[1].value = 0.40;
      const result = evaluateSkillNodes(inputFor('SNIPER', {
        ownedNodeIds: ['sni_2'],
      }));
      expect(result.critBonus).toBe(0.25);
    } finally {
      SKILL_TREE.SNIPER[1].value = original;
    }
  });
});

describe('precise design conditions and node kinds', () => {
  it('guarantees a Sniper crit only on the first correct answer of an attempt', () => {
    const ownedNodeIds = ['sni_4'];
    expect(evaluateSkillNodes(inputFor('SNIPER', {
      ownedNodeIds,
      isFirstOfAttempt: true,
    })).guaranteedCrit).toBe(true);
    expect(evaluateSkillNodes(inputFor('SNIPER', {
      ownedNodeIds,
      isFirstOfAttempt: false,
    })).guaranteedCrit).toBe(false);
  });

  it('heals a hurt Guardian at 95% and 40% HP, but not at full HP', () => {
    const ownedNodeIds = ['grd_4'];
    for (const playerHp of [95, 40]) {
      expect(evaluateSkillNodes(inputFor('GUARDIAN', {
        ownedNodeIds,
        playerHp,
      })).heal).toBe(3);
    }
    expect(evaluateSkillNodes(inputFor('GUARDIAN', {
      ownedNodeIds,
      playerHp: 100,
    })).heal).toBe(0);
  });

  it('applies Berserker crit at 70% HP but not at 85% HP', () => {
    const ownedNodeIds = ['ber_2'];
    expect(evaluateSkillNodes(inputFor('BERSERKER', {
      ownedNodeIds,
      playerHp: 70,
    })).critBonus).toBe(0.10);
    expect(evaluateSkillNodes(inputFor('BERSERKER', {
      ownedNodeIds,
      playerHp: 85,
    })).critBonus).toBe(0);
  });

  it('applies Sniper crit at boss 55% HP but not at boss 45% HP', () => {
    const ownedNodeIds = ['sni_2'];
    expect(evaluateSkillNodes(inputFor('SNIPER', {
      ownedNodeIds,
      bossHp: 55,
    })).critBonus).toBe(0.15);
    expect(evaluateSkillNodes(inputFor('SNIPER', {
      ownedNodeIds,
      bossHp: 45,
    })).critBonus).toBe(0);
  });

  it('accumulates and caps Cleric attempt damage reduction after a miss', () => {
    const original = SKILL_TREE.CLERIC[3].value;
    const ownedNodeIds = ['clr_4'];
    try {
      expect(evaluateSkillNodes(inputFor('CLERIC', {
        ownedNodeIds,
        priorStreak: 0,
      })).attemptDamageReduction).toBeCloseTo(0.20);
      expect(evaluateSkillNodes(inputFor('CLERIC', {
        ownedNodeIds,
        priorStreak: 2,
      })).attemptDamageReduction).toBe(0);
      expect(evaluateSkillNodes(inputFor('CLERIC', {
        ownedNodeIds,
        priorStreak: 0,
        correct: false,
      })).attemptDamageReduction).toBe(0);

      SKILL_TREE.CLERIC[3].value = 0.60;
      expect(evaluateSkillNodes(inputFor('CLERIC', {
        ownedNodeIds,
        priorStreak: 0,
      })).attemptDamageReduction).toBe(0.50);
    } finally {
      SKILL_TREE.CLERIC[3].value = original;
    }
  });

  it('keeps Speedster streak only on the first miss of an attempt', () => {
    const ownedNodeIds = ['spd_2'];
    expect(evaluateSkillNodes(inputFor('SPEEDSTER', {
      ownedNodeIds,
      correct: false,
      isFirstMissOfAttempt: true,
    })).keepStreakOnMiss).toBe(true);
    expect(evaluateSkillNodes(inputFor('SPEEDSTER', {
      ownedNodeIds,
      correct: false,
      isFirstMissOfAttempt: undefined,
    })).keepStreakOnMiss).toBe(false);
    expect(evaluateSkillNodes(inputFor('SPEEDSTER', {
      ownedNodeIds,
      correct: false,
      isFirstMissOfAttempt: false,
    })).keepStreakOnMiss).toBe(false);
  });

  it('keeps Scholar streak only on the first miss and only on HARD', () => {
    const ownedNodeIds = ['sch_2'];
    expect(evaluateSkillNodes(inputFor('SCHOLAR', {
      ownedNodeIds,
      correct: false,
      difficulty: 'HARD',
      isFirstMissOfAttempt: true,
    })).keepStreakOnMiss).toBe(true);
    expect(evaluateSkillNodes(inputFor('SCHOLAR', {
      ownedNodeIds,
      correct: false,
      difficulty: 'HARD',
      isFirstMissOfAttempt: false,
    })).keepStreakOnMiss).toBe(false);
    expect(evaluateSkillNodes(inputFor('SCHOLAR', {
      ownedNodeIds,
      correct: false,
      difficulty: 'MEDIUM',
      isFirstMissOfAttempt: true,
    })).keepStreakOnMiss).toBe(false);
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

  it('enables Juggernaut lethal save at absolute HP 10 and above', () => {
    const ownedNodeIds = ['jug_6'];
    expect(evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds,
      playerHp: 10,
    })).lethalSave).toBe(true);
    expect(evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds,
      playerHp: 60,
    })).lethalSave).toBe(true);
    expect(evaluateSkillNodes(inputFor('JUGGERNAUT', {
      ownedNodeIds,
      playerHp: 9,
    })).lethalSave).toBe(false);
  });

  it('floors damage taken at 0.75 even for an excessive multiplier', () => {
    const original = SKILL_TREE.JUGGERNAUT[4].value;
    try {
      SKILL_TREE.JUGGERNAUT[4].value = 0.5;
      const result = evaluateSkillNodes(inputFor('JUGGERNAUT', {
        ownedNodeIds: ['jug_5'],
      }));
      expect(result.damageTakenMultiplier).toBe(0.75);
    } finally {
      SKILL_TREE.JUGGERNAUT[4].value = original;
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
      inputFor('JUGGERNAUT', { isFirstMissOfAttempt: 'yes' }),
    ];
    for (const input of malformed) {
      expect(() => evaluateSkillNodes(input)).not.toThrow();
      const result = evaluateSkillNodes(input);
      expect(result).toEqual(neutral());
      expect(result.appliedNodeIds).not.toBe(result.appliedKeys);
    }
  });
});

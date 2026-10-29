// Regression: respec silently destroyed the player's skill points.
//
// respecSpecialization cleared `unlockedSkills` but never refunded the points
// spent on those nodes. A code comment claimed points were "derived, so clearing
// the array refunds them naturally" — that was false. `skillPoints` is a stored
// counter decremented on each unlock, so every respec permanently destroyed the
// investment. A level 13 account that should hold 6 points held 1.
import { describe, it, expect } from 'vitest';
import { SKILL_NODE_COSTS, sumSpentSkillPoints, SKILL_NODE_IDS } from '../lib/boss-combat.js';

describe('skill point refund on respec', () => {
  it('the cost ladder matches SKILL_NODES_V2 (1,1,2,2,3,5 per tree)', () => {
    expect(SKILL_NODE_IDS.BERSERKER.map((id) => SKILL_NODE_COSTS[id])).toEqual([1, 1, 2, 2, 3, 5]);
    expect(SKILL_NODE_IDS.GUARDIAN.map((id) => SKILL_NODE_COSTS[id])).toEqual([1, 1, 2, 2, 3, 5]);
  });

  it('maxing a full tree costs exactly 14 points', () => {
    expect(sumSpentSkillPoints(SKILL_NODE_IDS.SCHOLAR)).toBe(14);
  });

  it('refunds nothing when nothing is unlocked', () => {
    expect(sumSpentSkillPoints([])).toBe(0);
    expect(sumSpentSkillPoints(undefined)).toBe(0);
  });

  it('refunds the exact cost of the nodes held', () => {
    expect(sumSpentSkillPoints(['ber_1'])).toBe(1);
    expect(sumSpentSkillPoints(['ber_1', 'ber_2'])).toBe(2);
    expect(sumSpentSkillPoints(['ber_1', 'ber_2', 'ber_3'])).toBe(4); // 1+1+2
    expect(sumSpentSkillPoints(['ber_1', 'ber_6'])).toBe(6); // 1+5
    expect(sumSpentSkillPoints(['ber_1', 'ber_2', 'ber_3', 'ber_4', 'ber_5', 'ber_6'])).toBe(14);
  });

  it('duplicates never double-refund', () => {
    expect(sumSpentSkillPoints(['ber_1', 'ber_1', 'ber_1'])).toBe(1);
  });

  it('unknown or malformed ids refund nothing rather than NaN', () => {
    expect(sumSpentSkillPoints(['not_a_node', 'ber_1'])).toBe(1);
    expect(sumSpentSkillPoints(['', null, undefined, 42, 'ber_1'])).toBe(1);
    expect(Number.isNaN(sumSpentSkillPoints(['bogus']))).toBe(false);
  });

  it('the reported live case: 1 node held must return at least 1 point', () => {
    // The account held 1 BERSERKER node and 1 SP. A respec must not leave it worse.
    const refund = sumSpentSkillPoints(['ber_5']); // tier 5, cost 3
    expect(refund).toBe(3);
    expect(refund).toBeGreaterThan(0);
  });

  it('the old behaviour WOULD have refunded nothing (negative control)', () => {
    // Reproduces the pre-fix logic: clear the array, never touch the counter.
    const buggyRespec = (gam) => ({
      skillPoints: gam.skillPoints, // untouched -> points lost
      unlockedSkills: [],
    });
    const before = { skillPoints: 1, unlockedSkills: ['ber_5'] };
    const after = buggyRespec(before);
    expect(after.skillPoints).toBe(1); // no refund
    expect(sumSpentSkillPoints(before.unlockedSkills)).toBe(3); // what should have come back
  });
});

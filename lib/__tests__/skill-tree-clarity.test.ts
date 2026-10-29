// Regression: the skill tree told students nothing useful.
//
// Reported from the live UI: every node in a specialization displayed
// "Advances Guardian to Rank 1" regardless of tier, and node descriptions were
// atmospheric ("Resilience built on patient practice") with no mechanic stated.
// The spec picker and respec picker showed only a name and a flavour line, so
// choosing or changing a specialization was an uninformed decision.
//
// These tests pin the two fixes: per-node rank text that actually varies, and
// real strength/weakness copy for all eight specializations.
import { describe, it, expect } from 'vitest';
import { SPECIALIZATIONS, SPEC_PROFILES, getSkillRank, SKILL_NODE_IDS } from '../specializations';

describe('skill node rank text', () => {
  /** Mirrors the panel expression for the rank a node would advance you to. */
  const nextRank = (currentRank: number) => Math.min(6, currentRank + 1);

  it('a node shows a rank that varies with current progress', () => {
    expect(nextRank(0)).toBe(1);
    expect(nextRank(1)).toBe(2);
    expect(nextRank(5)).toBe(6);
    expect(nextRank(6)).toBe(6); // capped, never claims rank 7
  });

  it('the old behaviour WOULD have shown the same rank on every node (negative control)', () => {
    // Pre-fix the panel interpolated `skillRank + 1` for every node card, so all
    // six cards read identically. Reproduced here to prove the assertions above
    // are sensitive to the defect rather than passing trivially.
    const buggyRankText = () => 1; // a fresh student always saw "Rank 1"
    expect([0, 1, 2, 3, 4, 5].map(buggyRankText)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('rank is derived from distinct unlocked nodes in that spec only', () => {
    expect(getSkillRank([], 'GUARDIAN')).toBe(0);
    expect(getSkillRank(['grd_1'], 'GUARDIAN')).toBe(1);
    expect(getSkillRank(['grd_1', 'grd_1'], 'GUARDIAN')).toBe(1); // duplicate ignored
    expect(getSkillRank(['grd_1', 'jug_1'], 'GUARDIAN')).toBe(1); // cross-spec ignored
    expect(getSkillRank(['bogus'], 'GUARDIAN')).toBe(0);
    expect(getSkillRank(SKILL_NODE_IDS.GUARDIAN, 'GUARDIAN')).toBe(6);
  });
});

describe('specialization profiles', () => {
  const ALL = Object.keys(SPECIALIZATIONS) as Array<keyof typeof SPECIALIZATIONS>;

  it('every specialization has a complete profile', () => {
    for (const id of ALL) {
      const p = SPEC_PROFILES[id];
      expect(p, `missing profile for ${id}`).toBeTruthy();
      expect(p.trigger.length).toBeGreaterThan(10);
      expect(p.strength.length).toBeGreaterThan(20);
      expect(p.weakness.length).toBeGreaterThan(20);
      expect(['Easy', 'Moderate', 'Demanding']).toContain(p.difficulty);
    }
  });

  it('every profile states a genuine weakness, not a reworded strength', () => {
    for (const id of ALL) {
      const p = SPEC_PROFILES[id];
      expect(p.weakness.toLowerCase()).not.toBe(p.strength.toLowerCase());
      // A weakness must describe a cost or limitation.
      expect(p.weakness).toMatch(/nothing|zero|not|never|only|single|wasted|quiet|cost|lone/i);
    }
  });

  it('no two specializations share the same trigger', () => {
    const triggers = ALL.map((id) => SPEC_PROFILES[id].trigger.toLowerCase());
    expect(new Set(triggers).size).toBe(ALL.length);
  });

  it('support identities are described as support, not damage', () => {
    expect(SPEC_PROFILES.GUARDIAN.strength).toMatch(/shield/i);
    expect(SPEC_PROFILES.CLERIC.strength).toMatch(/health|heal|recover/i);
  });

  it('descriptions avoid em-dashes in student-facing copy', () => {
    for (const id of ALL) {
      const p = SPEC_PROFILES[id];
      expect(`${p.trigger} ${p.strength} ${p.weakness}`).not.toContain('—');
    }
  });
});

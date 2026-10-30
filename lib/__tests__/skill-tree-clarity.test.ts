// Regression: choosing or changing a specialization used to show only a name
// and flavour line. Keep concrete strength and weakness copy for every choice.
import { describe, it, expect } from 'vitest';
import { SPECIALIZATIONS, SPEC_PROFILES } from '../specializations';

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

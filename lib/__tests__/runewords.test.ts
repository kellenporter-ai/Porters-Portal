import { describe, it, expect } from 'vitest';
import {
  RUNEWORD_DEFINITIONS,
  checkRunewordMatch,
  getRunewordBonusStats,
} from '../runewords';

// ─── Definitions ───
describe('RUNEWORD_DEFINITIONS', () => {
  it('has unique IDs', () => {
    const ids = RUNEWORD_DEFINITIONS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique names', () => {
    const names = RUNEWORD_DEFINITIONS.map(r => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('pattern length matches requiredSockets for all runewords', () => {
    for (const rw of RUNEWORD_DEFINITIONS) {
      expect(rw.pattern.length).toBe(rw.requiredSockets);
    }
  });

  it('all patterns use valid gem names', () => {
    const validGems = new Set(['Ruby', 'Emerald', 'Sapphire', 'Amethyst']);
    for (const rw of RUNEWORD_DEFINITIONS) {
      for (const gem of rw.pattern) {
        expect(validGems.has(gem)).toBe(true);
      }
    }
  });

  it('all bonusStats values are positive', () => {
    for (const rw of RUNEWORD_DEFINITIONS) {
      for (const val of Object.values(rw.bonusStats)) {
        expect(val).toBeGreaterThan(0);
      }
    }
  });

  it('includes both 2-socket and 3-socket runewords', () => {
    const twoSocket = RUNEWORD_DEFINITIONS.filter(r => r.requiredSockets === 2);
    const threeSocket = RUNEWORD_DEFINITIONS.filter(r => r.requiredSockets === 3);
    expect(twoSocket.length).toBeGreaterThan(0);
    expect(threeSocket.length).toBeGreaterThan(0);
  });
});

// ─── Pattern Matching ───
describe('checkRunewordMatch', () => {
  it('matches Binary (Ruby, Ruby)', () => {
    const rw = checkRunewordMatch(['Ruby', 'Ruby']);
    expect(rw).not.toBeNull();
    expect(rw!.id).toBe('rw_binary');
  });

  it('matches Harmony (Emerald, Sapphire)', () => {
    const rw = checkRunewordMatch(['Emerald', 'Sapphire']);
    expect(rw).not.toBeNull();
    expect(rw!.id).toBe('rw_harmony');
  });

  it('matches Quantum Entanglement (Sapphire, Ruby, Sapphire)', () => {
    const rw = checkRunewordMatch(['Sapphire', 'Ruby', 'Sapphire']);
    expect(rw).not.toBeNull();
    expect(rw!.id).toBe('rw_quantum');
  });

  it('matches Singularity (Amethyst, Sapphire, Ruby)', () => {
    const rw = checkRunewordMatch(['Amethyst', 'Sapphire', 'Ruby']);
    expect(rw).not.toBeNull();
    expect(rw!.id).toBe('rw_singularity');
  });

  it('returns null for non-matching pattern', () => {
    expect(checkRunewordMatch(['Ruby', 'Amethyst'])).toBeNull();
  });

  it('returns null for empty gem list', () => {
    expect(checkRunewordMatch([])).toBeNull();
  });

  it('is order-sensitive (Sapphire, Emerald ≠ Emerald, Sapphire)', () => {
    const harmony = checkRunewordMatch(['Emerald', 'Sapphire']);
    const reversed = checkRunewordMatch(['Sapphire', 'Emerald']);
    expect(harmony).not.toBeNull();
    // Sapphire, Emerald is not a defined pattern — should be null or a different runeword
    if (reversed) {
      expect(reversed.id).not.toBe(harmony!.id);
    }
  });

  it('does not match partial patterns (2 gems for a 3-socket runeword)', () => {
    // Sapphire, Ruby is not Quantum Entanglement (needs 3)
    const rw = checkRunewordMatch(['Sapphire', 'Ruby']);
    if (rw) {
      expect(rw.requiredSockets).toBe(2);
    }
  });

  it('does not match extra gems beyond pattern', () => {
    // Ruby, Ruby, Ruby should not match Binary (Ruby, Ruby)
    const rw = checkRunewordMatch(['Ruby', 'Ruby', 'Ruby']);
    if (rw) {
      expect(rw.requiredSockets).toBe(3);
      expect(rw.id).not.toBe('rw_binary');
    }
  });
});

// ─── Bonus Stats ───
describe('getRunewordBonusStats', () => {
  it('returns correct stats for Binary', () => {
    const stats = getRunewordBonusStats('rw_binary');
    expect(stats).toEqual({ tech: 15 });
  });

  it('returns correct stats for Harmony', () => {
    const stats = getRunewordBonusStats('rw_harmony');
    expect(stats).toEqual({ focus: 8, analysis: 8 });
  });

  it('returns correct stats for Singularity (all 4 stats)', () => {
    const stats = getRunewordBonusStats('rw_singularity');
    expect(stats).toEqual({ tech: 10, focus: 10, analysis: 10, charisma: 10 });
  });

  it('returns empty object for non-existent runeword', () => {
    const stats = getRunewordBonusStats('nonexistent');
    expect(stats).toEqual({});
  });

  it('returns stats for all defined runewords', () => {
    for (const rw of RUNEWORD_DEFINITIONS) {
      const stats = getRunewordBonusStats(rw.id);
      expect(Object.keys(stats).length).toBeGreaterThan(0);
    }
  });
});

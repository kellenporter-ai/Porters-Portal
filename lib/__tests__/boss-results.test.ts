import { describe, it, expect } from 'vitest';
import {
  BOSS_COMPARISON_MIN_VICTORS_BAND,
  BOSS_PAR_DIFFICULTY,
  BOSS_PAR_STREAK_AVG,
  classifyVictorBand,
  computeBossPar,
  deriveBossResult,
  median,
} from '../bossResults';

// ─── computeBossPar: par reference table ──────────────────────────────────────
//
// Ground truth from a 2000-trial Monte Carlo of the real engine formula
// (mean correct answers to kill). The analytic par must land within 1.
describe('computeBossPar — par against Monte Carlo ground truth', () => {
  const REFERENCE: Array<{ bossMaxHp: number; mcMeanCorrect: number }> = [
    { bossMaxHp: 1400, mcMeanCorrect: 12.64 },
    { bossMaxHp: 2120, mcMeanCorrect: 11.39 },
    { bossMaxHp: 3007, mcMeanCorrect: 10.98 },
    { bossMaxHp: 4910, mcMeanCorrect: 9.95 },
  ];

  for (const { bossMaxHp, mcMeanCorrect } of REFERENCE) {
    it(`bossMaxHp ${bossMaxHp} → par within 1 of Monte Carlo ${mcMeanCorrect}`, () => {
      const { par } = computeBossPar(bossMaxHp, 0, 0);
      expect(par).not.toBeNull();
      expect(Math.abs((par as number) - mcMeanCorrect)).toBeLessThanOrEqual(1);
    });
  }

  it('is monotonic: bigger bosses never need more correct answers', () => {
    const pars = [1400, 1584, 2120, 3007, 4000, 4910].map(
      (hp) => computeBossPar(hp, 0, 0).par as number,
    );
    for (let i = 1; i < pars.length; i++) {
      expect(pars[i]).toBeLessThanOrEqual(pars[i - 1]);
    }
  });

  it('returns par null for a legacy boss (null maxHp)', () => {
    const r = computeBossPar(null, 7, 5);
    expect(r.par).toBeNull();
    expect(r.overPar).toBeNull();
    expect(r.strokes).toBe(7);
  });

  it('returns par null for a zero or non-finite maxHp', () => {
    expect(computeBossPar(0, 3, 2).par).toBeNull();
    expect(computeBossPar(Number.NaN, 3, 2).par).toBeNull();
    expect(computeBossPar(Number.POSITIVE_INFINITY, 3, 2).par).toBeNull();
  });

  it('par is always at least 1', () => {
    expect(computeBossPar(1, 0, 0).par).toBeGreaterThanOrEqual(1);
  });

  it('strokes = answeredCount and overPar = strokes - par', () => {
    const { par, strokes, overPar } = computeBossPar(1400, 15, 12);
    expect(par).toBe(12);
    expect(strokes).toBe(15);
    expect(overPar).toBe(3);
  });

  it('overPar can be negative (more efficient than par)', () => {
    const { par, overPar } = computeBossPar(1400, 4, 4);
    expect(overPar).toBe(4 - (par as number));
    expect(overPar).toBeLessThan(0);
  });

  it('floors a non-integer answeredCount', () => {
    expect(computeBossPar(1400, 7.9, 3.2).strokes).toBe(7);
  });

  it('coerces a negative or non-finite answeredCount to 0', () => {
    expect(computeBossPar(1400, -5, 0).strokes).toBe(0);
    expect(computeBossPar(1400, Number.NaN, 0).strokes).toBe(0);
  });

  it('ships MEDIUM as the par baseline difficulty with a 1.0 modifier', () => {
    expect(BOSS_PAR_DIFFICULTY).toBe('MEDIUM');
    // 1.18 is the validated mid-band streak average.
    expect(BOSS_PAR_STREAK_AVG).toBe(1.18);
  });
});

// ─── deriveBossResult: real production shapes ─────────────────────────────────
describe('deriveBossResult — production document shapes', () => {
  it('derives a completed victory from the real production doc shape', () => {
    // The engine always writes userId alongside the counters (bosses.ts:745-756).
    const doc = {
      userId: 'uid_abc',
      eventId: 'evt_1',
      bossMaxHp: 1584,
      bossHp: 0,
      answeredCount: 12,
      correctCount: 10,
      victoryClaimed: true,
      knockoutCount: 0,
    };
    const r = deriveBossResult(doc, 5, 3);
    expect(r).not.toBeNull();
    const res = r!;
    expect(res.isLegacy).toBe(false);
    expect(res.damage).toBe(1584);
    expect(res.pctDefeated).toBe(1);
    expect(res.accuracy).toBeCloseTo(10 / 12, 10);
    expect(res.victory).toBe(true);
    expect(res.answeredCount).toBe(12);
    expect(res.correctCount).toBe(10);
    expect(res.bossHp).toBe(0);
    expect(res.bossMaxHp).toBe(1584);
  });

  it('derives a partial (in-progress) fight', () => {
    const doc = { userId: 'uid_abc', bossMaxHp: 1400, bossHp: 913, answeredCount: 5, correctCount: 4 };
    const res = deriveBossResult(doc, 5, 3)!;
    expect(res.damage).toBe(487);
    expect(res.pctDefeated).toBeCloseTo(487 / 1400, 10);
    expect(res.pctDefeated as number).toBeCloseTo(0.3479, 4);
    expect(res.victory).toBe(false);
    expect(res.isLegacy).toBe(false);
  });

  it('treats a doc with no bossMaxHp as legacy: damage is null, NOT 0', () => {
    const doc = { userId: 'u1', eventId: 'e1', answeredCount: 4, correctCount: 2 };
    const res = deriveBossResult(doc, 5, 3)!;
    expect(res.isLegacy).toBe(true);
    expect(res.damage).toBeNull();
    expect(res.damage).not.toBe(0);
    expect(res.pctDefeated).toBeNull();
    expect(res.pctDefeated).not.toBe(0);
    expect(res.bossMaxHp).toBeNull();
    expect(res.bossHp).toBeNull();
    // Counters still derive — only the HP-derived values are unavailable.
    expect(res.answeredCount).toBe(4);
    expect(res.correctCount).toBe(2);
  });

  it('treats a non-numeric bossMaxHp as legacy (string / null)', () => {
    expect(deriveBossResult({ userId: 'u', bossMaxHp: '1400' }, 0, 0)!.isLegacy).toBe(true);
    expect(deriveBossResult({ userId: 'u', bossMaxHp: null }, 0, 0)!.isLegacy).toBe(true);
  });

  it('returns null for null and undefined input', () => {
    expect(deriveBossResult(null, 5, 3)).toBeNull();
    expect(deriveBossResult(undefined, 5, 3)).toBeNull();
  });

  it('returns null when the doc has no userId', () => {
    expect(deriveBossResult({ bossMaxHp: 1400, bossHp: 100 }, 5, 3)).toBeNull();
    expect(deriveBossResult({ userId: '', bossMaxHp: 1400 }, 5, 3)).toBeNull();
  });

  it('victory is true only when victoryClaimed is strictly true', () => {
    expect(deriveBossResult({ userId: 'u', victoryClaimed: true }, 0, 0)!.victory).toBe(true);
    expect(deriveBossResult({ userId: 'u', victoryClaimed: 'true' }, 0, 0)!.victory).toBe(false);
    expect(deriveBossResult({ userId: 'u', victoryClaimed: 1 }, 0, 0)!.victory).toBe(false);
    expect(deriveBossResult({ userId: 'u' }, 0, 0)!.victory).toBe(false);
  });

  it('inProgress is true only when activeAttempt is truthy', () => {
    expect(deriveBossResult({ userId: 'u', activeAttempt: { id: 'a1' } }, 0, 0)!.inProgress).toBe(true);
    expect(deriveBossResult({ userId: 'u', activeAttempt: null }, 0, 0)!.inProgress).toBe(false);
    expect(deriveBossResult({ userId: 'u' }, 0, 0)!.inProgress).toBe(false);
  });

  it('clamps armour-less damage at 0 when bossHp exceeds bossMaxHp', () => {
    const res = deriveBossResult({ userId: 'u', bossMaxHp: 1400, bossHp: 1600 }, 0, 0)!;
    expect(res.damage).toBe(0);
    expect(res.pctDefeated).toBe(0);
  });

  it('coerces non-finite and negative counters to 0 and floors the rest', () => {
    const res = deriveBossResult(
      { userId: 'u', bossMaxHp: 1400, bossHp: 0, answeredCount: -3, correctCount: 4.9, knockoutCount: Number.NaN },
      0,
      0,
    )!;
    expect(res.answeredCount).toBe(0);
    expect(res.correctCount).toBe(4);
    expect(res.knockoutCount).toBe(0);
  });

  it('accuracy is null at zero answers (never NaN)', () => {
    expect(deriveBossResult({ userId: 'u', answeredCount: 0, correctCount: 0 }, 0, 0)!.accuracy).toBeNull();
    expect(deriveBossResult({ userId: 'u' }, 0, 0)!.accuracy).toBeNull();
  });

  it('damage is 0 and pctDefeated null when bossMaxHp is 0 (guarded divide)', () => {
    const res = deriveBossResult({ userId: 'u', bossMaxHp: 0, bossHp: 0 }, 0, 0)!;
    expect(res.isLegacy).toBe(false);
    expect(res.damage).toBe(0);
    expect(res.pctDefeated).toBeNull();
  });
});

// ─── lastAnsweredAt / attemptCount ───────────────────────────────────────────
describe('deriveBossResult — activity timestamp and attempt count', () => {
  it('surfaces a stored lastAnsweredAt verbatim', () => {
    const doc = {
      userId: 'u',
      eventId: 'e',
      bossMaxHp: 1400,
      bossHp: 0,
      answeredCount: 12,
      correctCount: 10,
      lastAnsweredAt: '2026-10-01T15:04:05.000Z',
    };
    expect(deriveBossResult(doc, 0, 0)!.lastAnsweredAt).toBe('2026-10-01T15:04:05.000Z');
  });

  it('returns null (not undefined, no throw) when the field is absent', () => {
    const res = deriveBossResult({ userId: 'u', bossMaxHp: 1400, bossHp: 0 }, 0, 0)!;
    expect(res.lastAnsweredAt).toBeNull();
    expect(res.lastAnsweredAt).not.toBeUndefined();
  });

  it('returns null for a legacy doc that has no activity field at all', () => {
    const res = deriveBossResult({ userId: 'u', attempts: [], totalDamageDealt: 0 }, 0, 0)!;
    expect(res.isLegacy).toBe(true);
    expect(res.lastAnsweredAt).toBeNull();
  });

  it('returns null when the stored value is not a parseable timestamp', () => {
    const base = { userId: 'u', bossMaxHp: 1400, bossHp: 0 };
    expect(deriveBossResult({ ...base, lastAnsweredAt: 'not-a-date' }, 0, 0)!.lastAnsweredAt).toBeNull();
    expect(deriveBossResult({ ...base, lastAnsweredAt: '' }, 0, 0)!.lastAnsweredAt).toBeNull();
    expect(deriveBossResult({ ...base, lastAnsweredAt: 12345 }, 0, 0)!.lastAnsweredAt).toBeNull();
    expect(deriveBossResult({ ...base, lastAnsweredAt: null }, 0, 0)!.lastAnsweredAt).toBeNull();
  });

  it('defaults attemptCount to 0 when absent', () => {
    expect(deriveBossResult({ userId: 'u', bossMaxHp: 1400 }, 0, 0)!.attemptCount).toBe(0);
  });

  it('surfaces a stored attemptCount and coerces junk to 0', () => {
    const base = { userId: 'u', bossMaxHp: 1400 };
    expect(deriveBossResult({ ...base, attemptCount: 3 }, 0, 0)!.attemptCount).toBe(3);
    expect(deriveBossResult({ ...base, attemptCount: 2.9 }, 0, 0)!.attemptCount).toBe(2);
    expect(deriveBossResult({ ...base, attemptCount: -1 }, 0, 0)!.attemptCount).toBe(0);
    expect(deriveBossResult({ ...base, attemptCount: '4' }, 0, 0)!.attemptCount).toBe(0);
  });

  it('keeps the timestamp independent of legacy-ness', () => {
    // A legacy doc can still carry a timestamp once the student answers again.
    const res = deriveBossResult(
      { userId: 'u', attempts: [], lastAnsweredAt: '2026-10-01T00:00:00.000Z' },
      0,
      0,
    )!;
    expect(res.isLegacy).toBe(true);
    expect(res.lastAnsweredAt).toBe('2026-10-01T00:00:00.000Z');
  });
});

// ─── participationMet ────────────────────────────────────────────────────────
describe('deriveBossResult — participationMet is derived, never stored', () => {
  it('is true only when BOTH thresholds are met', () => {
    const doc = { userId: 'u', bossMaxHp: 1400, bossHp: 0, answeredCount: 6, correctCount: 4 };
    expect(deriveBossResult(doc, 5, 3)!.participationMet).toBe(true);
    expect(deriveBossResult(doc, 7, 3)!.participationMet).toBe(false); // answers short
    expect(deriveBossResult(doc, 5, 5)!.participationMet).toBe(false); // correct short
    expect(deriveBossResult(doc, 5, 4)!.participationMet).toBe(true); // exact boundary
  });

  it('ignores a stored participationMet field that contradicts the counters', () => {
    // The pre-async engine wrote `participated: true` for students who never fought.
    const doc = {
      userId: 'u',
      bossMaxHp: 1400,
      bossHp: 1400,
      answeredCount: 0,
      correctCount: 0,
      participated: true,
      participationMet: true,
    };
    expect(deriveBossResult(doc, 5, 3)!.participationMet).toBe(false);
  });
});

// ─── median ──────────────────────────────────────────────────────────────────
describe('median', () => {
  it('handles an odd-length list', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([10, 0, 5])).toBe(5);
  });

  it('handles an even-length list by averaging the middle pair', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('returns null for an empty list', () => {
    expect(median([])).toBeNull();
  });

  it('handles a single element', () => {
    expect(median([7])).toBe(7);
  });

  it('ignores non-finite entries', () => {
    expect(median([1, Number.NaN, 3, Number.POSITIVE_INFINITY])).toBe(2);
    expect(median([Number.NaN])).toBeNull();
  });

  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

// ─── classifyVictorBand ──────────────────────────────────────────────────────
describe('classifyVictorBand', () => {
  it('returns null below 10 victors (not enough comparators)', () => {
    expect(classifyVictorBand(1, 3, BOSS_COMPARISON_MIN_VICTORS_BAND - 1)).toBeNull();
    expect(classifyVictorBand(-9, 3, 9)).toBeNull();
    expect(classifyVictorBand(0, 0, 0)).toBeNull();
  });

  it('returns a band at exactly 10 victors', () => {
    expect(classifyVictorBand(-2, 3, BOSS_COMPARISON_MIN_VICTORS_BAND)).toBe('ahead');
  });

  it('returns ahead when clearly under median', () => {
    expect(classifyVictorBand(-1, 3, 20)).toBe('ahead');
    expect(classifyVictorBand(0, 10, 20)).toBe('ahead');
  });

  it('returns behind when clearly over median', () => {
    expect(classifyVictorBand(7, 3, 20)).toBe('behind');
    expect(classifyVictorBand(11, 10, 20)).toBe('behind');
  });

  it('resolves an exact tie to typical — NEVER behind', () => {
    const band = classifyVictorBand(4, 4, 20);
    expect(band).toBe('typical');
    expect(band).not.toBe('behind');
  });

  it('resolves a tie at ±0.5 to typical (kinder dead band)', () => {
    expect(classifyVictorBand(3.5, 4, 20)).toBe('typical');
    expect(classifyVictorBand(4.5, 4, 20)).toBe('typical');
  });

  it('just past ±0.5 falls out of the dead band', () => {
    expect(classifyVictorBand(3.49, 4, 20)).toBe('ahead');
    expect(classifyVictorBand(4.51, 4, 20)).toBe('behind');
  });

  it('every tie outcome is typical, never behind (tie-goes-kinder invariant)', () => {
    for (const m of [-5, -1, 0, 1, 2.5, 4, 17]) {
      for (const [offset, label] of [[0, 'exact'], [0.5, '+0.5'], [-0.5, '-0.5']] as const) {
        const band = classifyVictorBand(m + offset, m, 25);
        expect(band, `median ${m} offset ${label}`).toBe('typical');
      }
    }
  });

  it('returns typical for non-finite inputs rather than throwing', () => {
    expect(classifyVictorBand(Number.NaN, 3, 20)).toBe('typical');
    expect(classifyVictorBand(3, Number.NaN, 20)).toBe('typical');
  });
});

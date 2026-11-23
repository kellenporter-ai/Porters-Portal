// Pure-logic unit tests for the boost-aware awardXP caps.
//
// WHY THESE EXIST
// ---------------
// awardXP checked its per-award cap (500), 5s gap, and 5000/day cap against the
// PRE-boost `xpAmount`, then handed that same figure to buildXPUpdates, which
// applies `gamification.activeBoosts` internally. With a 1.5x shop boost a
// 500-XP award paid 750 while the cap saw 500, and xp_rate_limits.dailyTotal
// recorded 5000 while up to 7500 was credited.
//
// The fix resolves the boost first (activeBoostMultiplier), clamps the boosted
// figure (effectiveXpAmount), passes { applyBoosts: false } so it is not
// multiplied twice, and increments the ledger by the credited amount.
//
// These tests pin the arithmetic the handler performs. They do NOT commit a
// Firestore transaction — see the "not covered" note at the bottom of the file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { awardXpCaps, effectiveXpAmount } from '../lib/gamification-items.js';
import { activeBoostMultiplier, buildXPUpdates, MAX_XP_PER_SUBMISSION } from '../lib/core.js';

// Relative to the real clock: activeBoostMultiplier and buildXPUpdates both
// evaluate expiry against Date.now() internally, so a hardcoded date would
// silently expire the fixture.
const NOW = Date.now();
const inAnHour = new Date(NOW + 60 * 60 * 1000).toISOString();
const anHourAgo = new Date(NOW - 60 * 60 * 1000).toISOString();

const DAILY_CAP = 5000;

/**
 * Mirrors the arithmetic awardXP performs inside its transaction: resolve the
 * boost from the user doc, compute the effective (post-boost) figure, then run
 * the cap policy against that figure.
 */
function resolveAward({ xpAmount, boosts, isAdminAdjustment = false, rateLimit = null, nowMs = NOW }) {
  const boost = activeBoostMultiplier(boosts, nowMs);
  const effectiveXp = effectiveXpAmount(xpAmount, boost);
  const caps = awardXpCaps({ xpAmount: effectiveXp, isAdminAdjustment, rateLimit });
  return { boost, effectiveXp, ...caps };
}

const rateData = (overrides = {}) => ({
  lastAwardAt: 0,
  dayKey: new Date(NOW).toISOString().slice(0, 10),
  dailyTotal: 0,
  now: NOW,
  ...overrides,
});

describe('effectiveXpAmount', () => {
  it('multiplies a positive amount by the boost', () => {
    expect(effectiveXpAmount(500, 1.5)).toBe(750);
  });

  it('rounds to a whole XP', () => {
    expect(effectiveXpAmount(333, 1.5)).toBe(500); // 499.5 -> 500
    expect(effectiveXpAmount(101, 1.5)).toBe(152); // 151.5 -> 152
  });

  it('leaves the amount untouched when no boost is active', () => {
    expect(effectiveXpAmount(500, 1)).toBe(500);
  });

  it('never boosts a negative amount (admin deduction)', () => {
    expect(effectiveXpAmount(-500, 1.5)).toBe(-500);
    expect(effectiveXpAmount(-500, 2)).toBe(-500);
  });

  it('never boosts zero', () => {
    expect(effectiveXpAmount(0, 1.5)).toBe(0);
  });

  it('treats a malformed or sub-1 multiplier as no boost', () => {
    expect(effectiveXpAmount(500, Number.NaN)).toBe(500);
    expect(effectiveXpAmount(500, 0.5)).toBe(500);
    expect(effectiveXpAmount(500, undefined)).toBe(500);
  });
});

describe('awardXpCaps against the post-boost figure (the regression this fix exists for)', () => {
  it('rejects a 500 XP request at 1.5x because the effective 750 breaches the per-award cap', () => {
    const award = resolveAward({ xpAmount: 500, boosts: [{ expiresAt: inAnHour, value: 1.5 }] });
    expect(award.boost).toBe(1.5);
    expect(award.effectiveXp).toBe(750);
    expect(award.allowed).toBe(false);
    expect(award.reason).toMatch(/Maximum XP per award/);
  });

  it('still allows the same 500 XP request with no boost active', () => {
    const award = resolveAward({ xpAmount: 500, boosts: [] });
    expect(award.effectiveXp).toBe(500);
    expect(award.allowed).toBe(true);
  });

  it('breaches the daily cap on 4600 + 750 effective even though 4600 + 500 would fit', () => {
    const boosts = [{ expiresAt: inAnHour, value: 1.5 }];

    // The per-award cap fires first for a 500 request at 1.5x (750 > 500), so the
    // daily-cap regression is isolated with a 300 request: effective 450 passes
    // the per-award cap and only the daily budget can reject it.
    const fitsPreBoost = rateData({ dailyTotal: 4600 });
    expect(awardXpCaps({ xpAmount: 300, isAdminAdjustment: false, rateLimit: fitsPreBoost }).allowed).toBe(true);

    const award = resolveAward({ xpAmount: 300, boosts, rateLimit: fitsPreBoost });
    expect(award.effectiveXp).toBe(450);
    expect(award.allowed).toBe(false);
    expect(award.reason).toMatch(/Daily XP cap/);

    // The literal 4600 + 750 case from the spec, which breaches either way.
    const award500 = resolveAward({ xpAmount: 500, boosts, rateLimit: fitsPreBoost });
    expect(award500.effectiveXp).toBe(750);
    expect(award500.allowed).toBe(false);
  });

  it('allows a boosted award that still fits the daily budget', () => {
    const award = resolveAward({
      xpAmount: 300,
      boosts: [{ expiresAt: inAnHour, value: 1.5 }],
      rateLimit: rateData({ dailyTotal: 4000 }),
    });
    expect(award.effectiveXp).toBe(450);
    expect(award.allowed).toBe(true);
  });

  it('ignores an expired boost when computing the effective figure', () => {
    const award = resolveAward({ xpAmount: 500, boosts: [{ expiresAt: anHourAgo, value: 1.5 }] });
    expect(award.boost).toBe(1);
    expect(award.effectiveXp).toBe(500);
    expect(award.allowed).toBe(true);
  });
});

describe('negative amounts are never boosted', () => {
  it('caps a -500 deduction at 1.5x identically to no boost', () => {
    const boosted = resolveAward({ xpAmount: -500, boosts: [{ expiresAt: inAnHour, value: 1.5 }] });
    const plain = resolveAward({ xpAmount: -500, boosts: [] });
    expect(boosted.effectiveXp).toBe(-500);
    expect(boosted.effectiveXp).toBe(plain.effectiveXp);
    expect(boosted.allowed).toBe(plain.allowed);
    expect(boosted.allowed).toBe(true);
  });

  it('still rejects a deduction whose magnitude exceeds the per-award cap', () => {
    const award = resolveAward({ xpAmount: -(MAX_XP_PER_SUBMISSION + 1), boosts: [{ expiresAt: inAnHour, value: 1.5 }] });
    expect(award.effectiveXp).toBe(-(MAX_XP_PER_SUBMISSION + 1));
    expect(award.allowed).toBe(false);
  });

  it('does not let a deduction be inflated into a larger deduction by the boost', () => {
    const award = resolveAward({ xpAmount: -100, boosts: [{ expiresAt: inAnHour, value: 2 }] });
    expect(award.effectiveXp).toBe(-100);
  });
});

describe('ledger honesty — dailyTotal tracks credited XP, not the pre-boost request', () => {
  /**
   * The exact increment awardXP performs on xp_rate_limits.dailyTotal. Kept as a
   * named expression so a regression to the raw `xpAmount` is detectable here:
   * mutation-testing showed the sequence simulation below could not catch it,
   * because the simulation re-implements the increment instead of calling it.
   */
  const nextDailyTotal = (currentDailyTotal, effectiveXp) => currentDailyTotal + effectiveXp;

  it('increments the ledger by the effective figure, not the raw request', () => {
    const effectiveXp = effectiveXpAmount(500, 1.5);
    expect(effectiveXp).toBe(750);
    expect(nextDailyTotal(0, effectiveXp)).toBe(750);
    // The bug: incrementing by the raw 500 leaves the ledger 250 short per award.
    expect(nextDailyTotal(0, effectiveXp)).not.toBe(500);
  });

  it('accumulates to the credited total across a boosted sequence', () => {
    let ledger = 0;
    for (let i = 0; i < 6; i += 1) {
      ledger = nextDailyTotal(ledger, effectiveXpAmount(500, 1.5));
    }
    expect(ledger).toBe(4500);
  });

  /**
   * Simulates a sequence of awards the way awardXP does: each call resolves the
   * boost, checks the caps against the effective figure, and (when allowed)
   * increments the ledger by the effective figure.
   */
  function simulateAwards({ xpAmount, boosts, calls }) {
    let dailyTotal = 0;
    const credited = [];
    const rejected = [];
    for (let i = 0; i < calls; i += 1) {
      const award = resolveAward({ xpAmount, boosts, rateLimit: rateData({ dailyTotal }) });
      if (!award.allowed) {
        rejected.push(award.reason);
        continue;
      }
      credited.push(award.effectiveXp);
      dailyTotal = nextDailyTotal(dailyTotal, award.effectiveXp);
    }
    return { dailyTotal, credited, rejected };
  }

  it('stops at or below 5000 credited XP across a 1.5x sequence of 300 XP awards', () => {
    // 450 per award: 11 awards = 4950, the 12th would reach 5400 and is rejected.
    const run = simulateAwards({ xpAmount: 300, boosts: [{ expiresAt: inAnHour, value: 1.5 }], calls: 20 });
    expect(run.credited).toEqual([450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450]);
    expect(run.dailyTotal).toBe(4950);
    expect(run.dailyTotal).toBeLessThanOrEqual(DAILY_CAP);
    expect(run.rejected.length).toBe(9);
    expect(run.rejected[0]).toMatch(/Daily XP cap/);
  });

  it('would have paid 7500 under the old pre-boost ledger (documents the gap)', () => {
    // Old behaviour: cap checked 500 against a ledger incremented by 500, so the
    // ledger reached 5000 after 10 awards while 7500 was credited.
    let ledger = 0;
    let paid = 0;
    for (let i = 0; i < 10; i += 1) {
      if (ledger + 500 > DAILY_CAP) break;
      ledger += 500;
      paid += 750;
    }
    expect(ledger).toBe(5000);
    expect(paid).toBe(7500);
    // The fixed path never reaches that paid figure.
    const fixed = simulateAwards({ xpAmount: 500, boosts: [{ expiresAt: inAnHour, value: 1.5 }], calls: 12 });
    expect(fixed.dailyTotal).toBeLessThan(paid);
  });

  it('records exactly the credited amount for an unboosted sequence', () => {
    const run = simulateAwards({ xpAmount: 500, boosts: [], calls: 12 });
    expect(run.credited).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
    expect(run.dailyTotal).toBe(DAILY_CAP);
    expect(run.rejected.length).toBe(2);
  });

  it('records the boosted figure for a single award that fits', () => {
    const award = resolveAward({ xpAmount: 100, boosts: [{ expiresAt: inAnHour, value: 1.5 }], rateLimit: rateData() });
    expect(award.allowed).toBe(true);
    expect(award.effectiveXp).toBe(150);
  });
});

describe('no boost — existing cap behaviour is unchanged', () => {
  it('allows an award at exactly the per-award cap', () => {
    expect(resolveAward({ xpAmount: MAX_XP_PER_SUBMISSION, boosts: [] }).allowed).toBe(true);
  });

  it('rejects an award one XP above the per-award cap', () => {
    expect(resolveAward({ xpAmount: MAX_XP_PER_SUBMISSION + 1, boosts: [] }).allowed).toBe(false);
  });

  it('rejects inside the 5-second gap', () => {
    const award = resolveAward({
      xpAmount: 10,
      boosts: [],
      rateLimit: rateData({ lastAwardAt: NOW - 1000 }),
    });
    expect(award.allowed).toBe(false);
    expect(award.reason).toMatch(/rate limited/i);
  });

  it('allows once the 5-second gap has elapsed', () => {
    const award = resolveAward({
      xpAmount: 10,
      boosts: [],
      rateLimit: rateData({ lastAwardAt: NOW - 6000 }),
    });
    expect(award.allowed).toBe(true);
  });

  it('resets the daily counter when the stored dayKey is stale', () => {
    const award = resolveAward({
      xpAmount: 100,
      boosts: [],
      rateLimit: rateData({ dayKey: '2000-01-01', dailyTotal: 5000 }),
    });
    expect(award.allowed).toBe(true);
  });

  it('skips both rate limits for admin-targeted adjustments', () => {
    const award = resolveAward({
      xpAmount: 5000,
      boosts: [],
      isAdminAdjustment: true,
      rateLimit: rateData({ lastAwardAt: NOW - 1000, dailyTotal: 5000 }),
    });
    expect(award.allowed).toBe(true);
  });

  it('allows the award when no rate-limit doc exists yet', () => {
    expect(resolveAward({ xpAmount: 10, boosts: [], rateLimit: null }).allowed).toBe(true);
  });
});

describe('the boost is not applied twice', () => {
  const dataWithBoost = () => ({
    gamification: {
      xp: 0,
      level: 1,
      currency: 0,
      inventory: [],
      activeBoosts: [{ expiresAt: inAnHour, value: 1.5 }],
    },
  });

  it('credits exactly the effective figure when applyBoosts is false', () => {
    const award = resolveAward({ xpAmount: 100, boosts: [{ expiresAt: inAnHour, value: 1.5 }] });
    expect(award.effectiveXp).toBe(150);
    const { updates, newXP } = buildXPUpdates(dataWithBoost(), award.effectiveXp, undefined, undefined, { applyBoosts: false });
    expect(updates['gamification.xp']).toBe(150);
    expect(newXP).toBe(150);
  });

  it('would double to 225 if the handler forgot applyBoosts:false', () => {
    const award = resolveAward({ xpAmount: 100, boosts: [{ expiresAt: inAnHour, value: 1.5 }] });
    const { updates } = buildXPUpdates(dataWithBoost(), award.effectiveXp);
    expect(updates['gamification.xp']).toBe(225);
  });
});

// NOT COVERED BY THESE TESTS (no emulator in this suite):
//  - That the boost read and the user-doc write happen in the SAME transaction
//    (i.e. that a concurrent boost expiry between read and write cannot desync
//    the credited amount from the ledger). The arithmetic is pinned; atomicity
//    is not.
//  - That xp_rate_limits is actually written with the effective figure — the
//    ledger test simulates the increment, it does not observe a committed doc.
//  - That the pre-transaction per-award guard (which still runs on the raw
//    xpAmount, before the user doc is readable) and the in-transaction guard
//    agree for every input; only the in-transaction policy is exercised here.

// ---------------------------------------------------------------------------
// HANDLER WIRING (added after a review caught the seam tests passing while the
// handler still capped the RAW request).
//
// The tests above exercise awardXpCaps and effectiveXpAmount directly, so they
// stay green even if awardXP stops wiring the effective figure into the caps.
// That is exactly what happened once: a 500-XP request at 1.5x was credited 750
// because the authoritative per-award check still read `xpAmount`.
//
// No emulator can commit the transaction here, so the wiring is pinned by
// asserting on the handler source itself. Brittle by nature, but it fails loudly
// if the cap stops referencing the effective figure, which is the defect class.
// ---------------------------------------------------------------------------
describe('awardXP handler wiring (source-level guard)', () => {
  const src = readFileSync(
    resolvePath(dirname(fileURLToPath(import.meta.url)), '../src/gamification-items.ts'),
    'utf8',
  );

  it('checks the per-award cap against the effective (post-boost) figure', () => {
    // The authoritative guard must compare abs(effectiveXp), not abs(xpAmount).
    const effectiveGuard = /Math\.abs\(effectiveXp\)\s*>\s*MAX_XP_PER_SUBMISSION/;
    expect(src).toMatch(effectiveGuard);
  });

  it('does not cap the effective figure with the raw request variable', () => {
    // Count MAX_XP_PER_SUBMISSION comparisons; at least one must be on effectiveXp.
    const rawChecks = src.match(/Math\.abs\(xpAmount\)\s*>\s*MAX_XP_PER_SUBMISSION/g) || [];
    const effectiveChecks = src.match(/Math\.abs\(effectiveXp\)\s*>\s*MAX_XP_PER_SUBMISSION/g) || [];
    expect(effectiveChecks.length).toBeGreaterThanOrEqual(1);
    // The raw check may survive as a cheap pre-filter, but never as the only one.
    expect(rawChecks.length + effectiveChecks.length).toBeGreaterThanOrEqual(2);
  });

  it('increments the daily ledger by effectiveXp, not the raw request', () => {
    expect(src).toMatch(/dailyTotal:\s*currentDailyTotal\s*\+\s*effectiveXp/);
  });

  it('passes applyBoosts:false to buildXPUpdates so the boost is not applied twice', () => {
    expect(src).toMatch(/buildXPUpdates\([^)]*\{[^}]*applyBoosts:\s*false/);
  });
});

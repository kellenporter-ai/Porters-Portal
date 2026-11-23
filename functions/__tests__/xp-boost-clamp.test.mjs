// Pure-logic unit tests for the boost-aware passive-XP clamp.
//
// WHY THESE EXIST
// ---------------
// submitEngagement used to clamp the PRE-boost figure and then let
// buildXPUpdates multiply the clamped result by the student's active boost.
// With a 1.5x boost the ledger recorded <=1500 while the user doc received up
// to 2250, and submissions.score / the returned xpEarned / dailyRemaining all
// understated reality. The fix resolves the boost first, clamps the boosted
// figure, and tells buildXPUpdates not to boost again.
//
// These tests pin (a) the shared boost resolver and (b) the clamp arithmetic
// that the handler now performs, so the two can never drift.
import { describe, it, expect } from 'vitest';
import { activeBoostMultiplier, buildXPUpdates, MAX_DAILY_PASSIVE_XP } from '../lib/core.js';
import { clampPassiveXP } from '../lib/engagement-daily.js';

// Relative to the real clock: buildXPUpdates evaluates expiry against
// Date.now() internally, so a hardcoded date would silently expire the fixture.
const NOW = Date.now();
const inAnHour = new Date(NOW + 60 * 60 * 1000).toISOString();
const anHourAgo = new Date(NOW - 60 * 60 * 1000).toISOString();

/**
 * Mirrors the arithmetic submitEngagement performs inside its transaction:
 * boost first, then clamp the boosted figure.
 */
function resolveAward(earnedToday, xpEarned, boosts, nowMs = NOW) {
  const boost = activeBoostMultiplier(boosts, nowMs);
  const requestedAfterBoost = Math.round(xpEarned * boost);
  const clamp = clampPassiveXP(earnedToday, requestedAfterBoost);
  return {
    boost,
    requestedAfterBoost,
    grantedXP: clamp.grantedXP,
    capped: clamp.capped,
    dailyRemaining: Math.max(0, clamp.remainingBefore - clamp.grantedXP),
  };
}

describe('activeBoostMultiplier', () => {
  it('returns 1 when there are no boosts', () => {
    expect(activeBoostMultiplier(undefined, NOW)).toBe(1);
    expect(activeBoostMultiplier([], NOW)).toBe(1);
  });

  it('returns 1 for an expired boost', () => {
    expect(activeBoostMultiplier([{ expiresAt: anHourAgo, value: 1.5 }], NOW)).toBe(1);
  });

  it('returns 1 for a boost expiring exactly now (expiry is exclusive)', () => {
    const exactlyNow = new Date(NOW).toISOString();
    expect(activeBoostMultiplier([{ expiresAt: exactlyNow, value: 1.5 }], NOW)).toBe(1);
  });

  it('returns the active boost value', () => {
    expect(activeBoostMultiplier([{ expiresAt: inAnHour, value: 1.5 }], NOW)).toBe(1.5);
  });

  it('takes the maximum across multiple active boosts', () => {
    const boosts = [
      { expiresAt: inAnHour, value: 1.5 },
      { expiresAt: inAnHour, value: 2 },
    ];
    expect(activeBoostMultiplier(boosts, NOW)).toBe(2);
  });

  it('ignores a boost whose value is not greater than 1', () => {
    expect(activeBoostMultiplier([{ expiresAt: inAnHour, value: 1 }], NOW)).toBe(1);
    expect(activeBoostMultiplier([{ expiresAt: inAnHour, value: 0.5 }], NOW)).toBe(1);
  });

  it('ignores malformed entries without throwing', () => {
    const boosts = [null, { value: 'x' }, { expiresAt: inAnHour, value: 1.5 }];
    expect(activeBoostMultiplier(boosts, NOW)).toBe(1.5);
  });
});

describe('boost-aware clamp (the regression this fix exists for)', () => {
  it('pays the remaining budget, not the boosted request and not the unboosted request', () => {
    // 1.5x boost, 1400 already earned, 500 requested.
    // Post-boost request = 750. Remaining budget = 100.
    // Correct award: 100. The old code clamped 500 -> 100 and then boosted to 150.
    const award = resolveAward(1400, 500, [{ expiresAt: inAnHour, value: 1.5 }]);
    expect(award.boost).toBe(1.5);
    expect(award.requestedAfterBoost).toBe(750);
    expect(award.grantedXP).toBe(100);
    expect(award.grantedXP).not.toBe(150);
    expect(award.grantedXP).not.toBe(750);
    expect(award.capped).toBe(true);
    expect(award.dailyRemaining).toBe(0);
  });

  it('pays the full boosted request when it fits the budget', () => {
    const award = resolveAward(0, 500, [{ expiresAt: inAnHour, value: 1.5 }]);
    expect(award.requestedAfterBoost).toBe(750);
    expect(award.grantedXP).toBe(750);
    expect(award.capped).toBe(false);
    expect(award.dailyRemaining).toBe(750);
  });

  it('pays the unboosted request when no boost is active', () => {
    const award = resolveAward(0, 500, []);
    expect(award.requestedAfterBoost).toBe(500);
    expect(award.grantedXP).toBe(500);
  });

  it('pays zero once the ceiling is reached, even with a boost active', () => {
    const award = resolveAward(MAX_DAILY_PASSIVE_XP, 500, [{ expiresAt: inAnHour, value: 1.5 }]);
    expect(award.grantedXP).toBe(0);
    expect(award.capped).toBe(true);
  });

  it('never lets the ledger total exceed MAX_DAILY_PASSIVE_XP across a boosted sequence', () => {
    const boosts = [{ expiresAt: inAnHour, value: 1.5 }];
    let earnedToday = 0;
    const grants = [];
    for (let i = 0; i < 6; i += 1) {
      const award = resolveAward(earnedToday, 500, boosts);
      grants.push(award.grantedXP);
      earnedToday += award.grantedXP;
      expect(earnedToday).toBeLessThanOrEqual(MAX_DAILY_PASSIVE_XP);
    }
    expect(earnedToday).toBe(MAX_DAILY_PASSIVE_XP);
    expect(grants).toEqual([750, 750, 0, 0, 0, 0]);
  });
});

describe('buildXPUpdates applyBoosts option', () => {
  const dataWithBoost = () => ({
    gamification: {
      xp: 0,
      level: 1,
      currency: 0,
      inventory: [],
      activeBoosts: [{ expiresAt: inAnHour, value: 1.5 }],
    },
  });

  it('applies the boost by default (existing callers unchanged)', () => {
    const { updates } = buildXPUpdates(dataWithBoost(), 100);
    expect(updates['gamification.xp']).toBe(150);
  });

  it('applies the boost when applyBoosts is explicitly true', () => {
    const { updates } = buildXPUpdates(dataWithBoost(), 100, undefined, undefined, { applyBoosts: true });
    expect(updates['gamification.xp']).toBe(150);
  });

  it('does not apply the boost when applyBoosts is false', () => {
    const { updates } = buildXPUpdates(dataWithBoost(), 100, undefined, undefined, { applyBoosts: false });
    expect(updates['gamification.xp']).toBe(100);
  });

  it('a clamped boosted award is not multiplied a second time', () => {
    // The handler resolves 100 (clamped) and passes applyBoosts:false.
    const { updates } = buildXPUpdates(dataWithBoost(), 100, undefined, undefined, { applyBoosts: false });
    expect(updates['gamification.xp']).toBe(100);
  });
});

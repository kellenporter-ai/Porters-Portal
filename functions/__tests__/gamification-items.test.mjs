// Pure-logic unit tests for functions/src/gamification-items.ts XP-cap semantics
// (audit Phase 2.1, Task F). Cap logic lives inside the awardXP handler behind a
// Firestore transaction, so the policy rules are re-expressed here as pure helpers
// (awardXpCaps) — they must stay identical to awardXP in gamification-items.ts.
//
// NOTE (pending parallel fix task): if a ±50,000 admin sanity cap is added to
// awardXP, add it to awardXpCaps AND extend the admin tests below.
import { describe, it, expect } from 'vitest';
import { awardXpCaps } from '../lib/gamification-items.js';
import { MAX_XP_PER_SUBMISSION } from '../lib/core.js';

describe('awardXpCaps — pure mirror of awardXP cap policy', () => {
  describe('per-submission cap (skipped for admin-targeted adjustments)', () => {
    it('rejects a non-admin self-award above MAX_XP_PER_SUBMISSION', () => {
      const r = awardXpCaps({ xpAmount: MAX_XP_PER_SUBMISSION + 1, isAdminAdjustment: false });
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/Maximum XP per award/);
    });

    it('rejects a non-admin self-deduction whose magnitude exceeds the cap', () => {
      const r = awardXpCaps({ xpAmount: -(MAX_XP_PER_SUBMISSION + 1), isAdminAdjustment: false });
      expect(r.allowed).toBe(false);
    });

    it('allows a non-admin award at exactly the cap', () => {
      expect(awardXpCaps({ xpAmount: MAX_XP_PER_SUBMISSION, isAdminAdjustment: false }).allowed).toBe(true);
      expect(awardXpCaps({ xpAmount: -MAX_XP_PER_SUBMISSION, isAdminAdjustment: false }).allowed).toBe(true);
    });

    it('lets an admin-targeted adjustment bypass the per-submission cap', () => {
      expect(awardXpCaps({ xpAmount: 5000, isAdminAdjustment: true }).allowed).toBe(true);
      expect(awardXpCaps({ xpAmount: -9999, isAdminAdjustment: true }).allowed).toBe(true);
    });
  });

  describe('5-second rate limit + 5000/day cap (skipped for admin adjustments)', () => {
    const rateData = (overrides = {}) => ({
      lastAwardAt: 0,
      dayKey: new Date().toISOString().slice(0, 10),
      dailyTotal: 0,
      now: Date.now(),
      ...overrides,
    });

    it('rejects when the last award was under 5 seconds ago', () => {
      const r = awardXpCaps({ xpAmount: 10, isAdminAdjustment: false, rateLimit: rateData({ lastAwardAt: Date.now() - 1000 }) });
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/rate limited/i);
    });

    it('allows when the 5-second gap has elapsed', () => {
      const r = awardXpCaps({ xpAmount: 10, isAdminAdjustment: false, rateLimit: rateData({ lastAwardAt: Date.now() - 6000 }) });
      expect(r.allowed).toBe(true);
    });

    it('rejects when the award would push the daily total past 5000', () => {
      const r = awardXpCaps({ xpAmount: 100, isAdminAdjustment: false, rateLimit: rateData({ lastAwardAt: 0, dailyTotal: 4950 }) });
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/Daily XP cap/);
    });

    it('allows a partial award that stays within the daily cap', () => {
      const r = awardXpCaps({ xpAmount: 50, isAdminAdjustment: false, rateLimit: rateData({ lastAwardAt: 0, dailyTotal: 4950 }) });
      expect(r.allowed).toBe(true);
    });

    it('resets the daily counter when the stored dayKey is stale', () => {
      const r = awardXpCaps({
        xpAmount: 100,
        isAdminAdjustment: false,
        rateLimit: rateData({ lastAwardAt: 0, dayKey: '2000-01-01', dailyTotal: 5000 }),
      });
      expect(r.allowed).toBe(true);
    });

    it('skips both rate limits for admin-targeted adjustments', () => {
      const r = awardXpCaps({
        xpAmount: 5000,
        isAdminAdjustment: true,
        rateLimit: rateData({ lastAwardAt: Date.now() - 1000, dailyTotal: 5000 }),
      });
      expect(r.allowed).toBe(true);
    });

    it('allows the award when no rate-limit doc exists yet', () => {
      expect(awardXpCaps({ xpAmount: 10, isAdminAdjustment: false, rateLimit: null }).allowed).toBe(true);
    });
  });
});

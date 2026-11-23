// Pure-logic unit tests for the passive-XP daily cap seam in engagement-daily.ts.
// The cap is the fix for unbounded engagement-time XP: submitEngagement paid
// every submission in full, so a student could bank unlimited passive XP in a
// single local day. These tests pin the clamp arithmetic and the aggregate
// invariant (running total never exceeds MAX_DAILY_PASSIVE_XP).
import { describe, it, expect } from 'vitest';
import { clampPassiveXP, localDayKey } from '../lib/engagement-daily.js';
import { MAX_DAILY_PASSIVE_XP } from '../lib/core.js';

describe('MAX_DAILY_PASSIVE_XP', () => {
  it('is exported from core and equals 1500', () => {
    expect(MAX_DAILY_PASSIVE_XP).toBe(1500);
  });
});

describe('clampPassiveXP — under budget', () => {
  it('grants the full request when nothing has been earned today', () => {
    expect(clampPassiveXP(0, 500)).toEqual({ grantedXP: 500, capped: false, remainingBefore: 1500 });
  });

  it('grants the full request when it exactly fits the remaining budget', () => {
    // Boundary: cap is inclusive — 1000 earned + 500 requested == 1500.
    expect(clampPassiveXP(1000, 500)).toEqual({ grantedXP: 500, capped: false, remainingBefore: 500 });
  });

  it('grants the full request when it is under the remaining budget', () => {
    expect(clampPassiveXP(1000, 499)).toEqual({ grantedXP: 499, capped: false, remainingBefore: 500 });
  });
});

describe('clampPassiveXP — over budget', () => {
  it('truncates to the remaining budget and flags the cap', () => {
    expect(clampPassiveXP(1300, 500)).toEqual({ grantedXP: 200, capped: true, remainingBefore: 200 });
  });

  it('grants zero once the ceiling is exactly reached', () => {
    expect(clampPassiveXP(1500, 500)).toEqual({ grantedXP: 0, capped: true, remainingBefore: 0 });
  });

  it('grants zero when already over-earned (never goes negative)', () => {
    const result = clampPassiveXP(5000, 500);
    expect(result.grantedXP).toBe(0);
    expect(result.capped).toBe(true);
    expect(result.remainingBefore).toBe(0);
  });
});

describe('clampPassiveXP — malformed input', () => {
  it('treats NaN already-earned as zero', () => {
    expect(clampPassiveXP(NaN, 500)).toEqual({ grantedXP: 500, capped: false, remainingBefore: 1500 });
  });

  it('treats negative already-earned as zero', () => {
    expect(clampPassiveXP(-50, 500)).toEqual({ grantedXP: 500, capped: false, remainingBefore: 1500 });
  });

  it('treats NaN requested as zero', () => {
    expect(clampPassiveXP(0, NaN)).toEqual({ grantedXP: 0, capped: false, remainingBefore: 1500 });
  });

  it('treats negative requested as zero', () => {
    expect(clampPassiveXP(0, -10)).toEqual({ grantedXP: 0, capped: false, remainingBefore: 1500 });
  });

  it('rounds a fractional request', () => {
    expect(clampPassiveXP(0, 499.6).grantedXP).toBe(500);
  });
});

describe('repeated-award simulation (the bug being fixed)', () => {
  // 10 XP/min × 50 min = 500 XP per submission, the per-submission ceiling.
  const PER_SUBMISSION = 500;
  const SUBMISSIONS = 6;

  it('never lets the running daily total exceed MAX_DAILY_PASSIVE_XP', () => {
    let earnedToday = 0;
    const grants = [];
    for (let i = 0; i < SUBMISSIONS; i += 1) {
      const { grantedXP } = clampPassiveXP(earnedToday, PER_SUBMISSION);
      grants.push(grantedXP);
      earnedToday += grantedXP;
      expect(earnedToday).toBeLessThanOrEqual(MAX_DAILY_PASSIVE_XP);
    }
    expect(earnedToday).toBe(MAX_DAILY_PASSIVE_XP);
    expect(grants).toEqual([500, 500, 500, 0, 0, 0]);
  });

  it('grants zero from submission #4 onward and flags every capped award', () => {
    let earnedToday = 0;
    const cappedFlags = [];
    for (let i = 0; i < SUBMISSIONS; i += 1) {
      const { grantedXP, capped } = clampPassiveXP(earnedToday, PER_SUBMISSION);
      earnedToday += grantedXP;
      cappedFlags.push(capped);
    }
    expect(cappedFlags).toEqual([false, false, false, true, true, true]);
  });

  it('still records the submission when the award is zero (clamp is not a rejection)', () => {
    // The clamp returns a number, never a throw — submitEngagement always writes
    // the completion record. A zero grant is a valid, non-exceptional outcome.
    const { grantedXP, capped } = clampPassiveXP(MAX_DAILY_PASSIVE_XP, PER_SUBMISSION);
    expect(grantedXP).toBe(0);
    expect(capped).toBe(true);
  });
});

describe('localDayKey (unchanged behaviour, guards the cap key)', () => {
  it('renders YYYY-MM-DD in the school timezone', () => {
    expect(localDayKey(new Date('2026-11-23T15:00:00Z'))).toBe('2026-11-23');
  });

  it('rolls to the next local day at the Eastern midnight boundary', () => {
    // 03:30 UTC on 11-24 is 22:30 EST on 11-23.
    expect(localDayKey(new Date('2026-11-24T03:30:00Z'))).toBe('2026-11-23');
    // 05:30 UTC on 11-24 is 00:30 EST on 11-24.
    expect(localDayKey(new Date('2026-11-24T05:30:00Z'))).toBe('2026-11-24');
  });
});

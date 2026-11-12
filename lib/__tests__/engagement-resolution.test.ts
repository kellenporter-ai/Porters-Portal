import { describe, it, expect } from 'vitest';
import {
  resolveEngagement,
  isReportedTimeInconsistent,
  HARD_CAP_SECONDS,
} from '../engagementResolution';

// Regression suite for the 2026-11-12 clock-reset bug.
//
// lib/engagementResolution.ts is a pure mirror of
// functions/src/engagement-resolution.ts (same "keep in sync" arrangement as
// telemetry-integrity.test.ts vs core.ts) so the policy is unit-tested without
// a Firestore harness.
//
// Historical behaviour was `min(client, tokenElapsed + 5)`. Three paths mint a
// fresh token mid-session (submit-retry with forceNew, handleFreshStart,
// idle-stale), resetting that clock to ~0 and collapsing real work into the
// tell-tale 5-7.2s band. Assertions below that describe a healthy resolution
// FAIL under the old formula, as the mutation control proves.

const T0 = 1_700_000_000_000; // fixed epoch for all tests
const secs = (s: number) => T0 + s * 1000;

/** The historical buggy formula, kept to prove these tests catch it. */
function legacyClamp(clientReported: number, tokenElapsedSec: number): number {
  return tokenElapsedSec > 0
    ? Math.min(clientReported, tokenElapsedSec + 5)
    : Math.min(clientReported, HARD_CAP_SECONDS);
}

describe('resolveEngagement — healthy path', () => {
  it('agrees with the client when the token is sound', () => {
    const r = resolveEngagement({
      clientReportedSeconds: 900,
      tokenStartedAtMs: secs(-900),
      nowMs: T0,
    });
    expect(r.engagementTime).toBe(900);
    // Verified is capped AT the claim, never above it: the grace window lets a
    // sound session reach its own claim, it does not manufacture extra seconds.
    expect(r.verifiedSeconds).toBe(900);
    expect(r.xpBasisSeconds).toBe(900);
    expect(r.timeSource).toBe('token');
  });

  it('caps an absurd claim at the 4 hour ceiling', () => {
    const r = resolveEngagement({
      clientReportedSeconds: 999_999,
      tokenStartedAtMs: secs(-999_999),
      nowMs: T0,
    });
    expect(r.engagementTime).toBe(HARD_CAP_SECONDS);
  });
});

describe('resolveEngagement — clock-reset recovery (the bug)', () => {
  const churned = {
    clientReportedSeconds: 4000,
    tokenStartedAtMs: T0 - 2000, // fresh token: 2s old
    anchorStartedAtMs: secs(-4000), // original session: 4000s old
    nowMs: T0,
  };

  it('recovers the original start from the anchor instead of truncating', () => {
    const r = resolveEngagement(churned);
    expect(r.timeSource).toBe('anchor');
    expect(r.engagementTime).toBe(4000);
    expect(r.verifiedSeconds).toBeGreaterThanOrEqual(4000);
    expect(r.xpBasisSeconds).toBeGreaterThanOrEqual(4000);
  });

  it('would have destroyed the session under the legacy formula (mutation control)', () => {
    const legacy = legacyClamp(churned.clientReportedSeconds, 2);
    expect(legacy).toBe(7); // the 5-7.2s band seen in production
    expect(legacy).toBeLessThan(churned.clientReportedSeconds * 0.5);
  });

  it('picks the EARLIEST server start when the token is older than the anchor', () => {
    const r = resolveEngagement({
      clientReportedSeconds: 600,
      tokenStartedAtMs: secs(-600),
      anchorStartedAtMs: secs(-200),
      nowMs: T0,
    });
    expect(r.timeSource).toBe('token');
    expect(r.serverSpanSeconds).toBeCloseTo(600, 5);
  });
});

describe('resolveEngagement — genuinely unverified', () => {
  it('labelled unverified, reports the claim, earns no XP', () => {
    const r = resolveEngagement({
      clientReportedSeconds: 4000,
      tokenStartedAtMs: null,
      anchorStartedAtMs: null,
      nowMs: T0,
    });
    expect(r.timeSource).toBe('unverified');
    expect(r.engagementTime).toBe(4000); // never silently truncated
    expect(r.verifiedSeconds).toBe(0);
    expect(r.xpBasisSeconds).toBe(0); // XP never fails open
  });

  it('does not treat an implausibly short span as corroboration', () => {
    const r = resolveEngagement({
      clientReportedSeconds: 600,
      tokenStartedAtMs: T0 - 2000, // token only 2s old, no anchor
      nowMs: T0,
    });
    expect(r.timeSource).toBe('unverified');
    expect(r.engagementTime).toBe(600);
    expect(r.xpBasisSeconds).toBe(7);
  });
});

describe('resolveEngagement — hostile inputs', () => {
  it('ignores a future-dated start (negative span)', () => {
    const r = resolveEngagement({
      clientReportedSeconds: 300,
      tokenStartedAtMs: T0 + 60_000,
      nowMs: T0,
    });
    expect(r.serverSpanSeconds).toBe(0);
    expect(r.timeSource).toBe('unverified');
    expect(r.verifiedSeconds).toBe(0);
  });

  it('coerces negative and non-finite client values to zero', () => {
    expect(resolveEngagement({ clientReportedSeconds: -50, nowMs: T0 }).engagementTime).toBe(0);
    expect(resolveEngagement({ clientReportedSeconds: NaN, nowMs: T0 }).engagementTime).toBe(0);
  });

  it('treats zero/undefined start times as absent', () => {
    const r = resolveEngagement({
      clientReportedSeconds: 100,
      tokenStartedAtMs: 0,
      anchorStartedAtMs: undefined,
      nowMs: T0,
    });
    expect(r.timeSource).toBe('unverified');
  });
});

describe('isReportedTimeInconsistent — the daily invariant', () => {
  it('flags the 6s-vs-4683s row that started this investigation', () => {
    expect(isReportedTimeInconsistent(6, 4683, 'token')).toBe(true);
  });

  it('passes healthy rows (ratio 1.000)', () => {
    expect(isReportedTimeInconsistent(1315, 1315, 'token')).toBe(false);
  });

  it('ignores labelled-unverified rows, which diverge honestly', () => {
    expect(isReportedTimeInconsistent(7, 4000, 'unverified')).toBe(false);
  });

  it('ignores rows with no usable client report', () => {
    expect(isReportedTimeInconsistent(0, 0, 'token')).toBe(false);
    expect(isReportedTimeInconsistent(100, NaN, 'token')).toBe(false);
  });
});

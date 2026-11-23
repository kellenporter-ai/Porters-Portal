// Tests for the all-or-nothing write contract of submitEngagement
// (functions/src/engagement.ts).
//
// WHAT IS AND IS NOT COVERED
// --------------------------
// The Firestore transaction itself cannot be exercised without the emulator
// (see the same note in assessment-session-staleness.test.mjs and
// boss-turn-wiring.test.mjs). What IS covered here:
//
//   1. buildEngagementSubmission() is pure and produces a complete document
//      body with NO `score` and NO passive-XP provenance fields — those are
//      resolved inside the transaction and spread-overridden there. If the
//      body ever started carrying a stale `score`, the override would be the
//      only thing keeping the record honest.
//   2. The zero-XP capped session still produces a writable submission body.
//      The handler calls transaction.create() unconditionally; only the
//      user-doc update is gated on grantedXP > 0.
//   3. The body is Firestore-safe: no `undefined` values anywhere, which is
//      the exact failure class that killed 181 writes (2026-10-14 -> 11-11).
//
// NOT covered by an automated test: that the transaction actually commits the
// three writes atomically. That requires the emulator or a human running a
// real submission and inspecting Firestore.
import { describe, it, expect } from 'vitest';
import { buildEngagementSubmission } from '../lib/engagement.js';
import { clampPassiveXP } from '../lib/engagement-daily.js';
import { MAX_DAILY_PASSIVE_XP } from '../lib/core.js';

const baseInput = (overrides = {}) => ({
  uid: 'uid_test_1',
  userName: 'Student One',
  assignmentId: 'asg_1',
  assignmentTitle: 'Reading: Chapter 4',
  validatedEngagement: 600,
  xpBasisEngagement: 600,
  resolution: {
    engagementTime: 600,
    xpBasisSeconds: 600,
    timeSource: 'token',
    serverSpanSeconds: 605,
  },
  metrics: { engagementTime: 600, startTime: 1, firstInteractionTime: 2, lastActive: 3 },
  keystrokes: 400,
  pasteCount: 0,
  clickCount: 12,
  tabSwitchCount: 1,
  serverElapsedSec: 605,
  thresholds: {},
  classType: 'Physics',
  userSection: 'A',
  ...overrides,
});

/** Recursively asserts no `undefined` values — Firestore rejects them. */
function assertNoUndefined(value, path = 'root') {
  if (value === undefined) throw new Error(`undefined at ${path}`);
  if (value === null || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assertNoUndefined(v, `${path}.${k}`);
  }
}

describe('buildEngagementSubmission — purity and shape', () => {
  it('produces a complete submission body', () => {
    const { submissionBody, engagementStatus } = buildEngagementSubmission(baseInput());
    expect(submissionBody.userId).toBe('uid_test_1');
    expect(submissionBody.assignmentId).toBe('asg_1');
    expect(submissionBody.classType).toBe('Physics');
    expect(submissionBody.userSection).toBe('A');
    expect(submissionBody.status).toBe(engagementStatus);
    expect(submissionBody.metrics.engagementTime).toBe(600);
    expect(submissionBody.metrics.timeSource).toBe('token');
  });

  it('does NOT set score — the transaction resolves it from the clamp', () => {
    const { submissionBody } = buildEngagementSubmission(baseInput());
    expect(submissionBody.score).toBeUndefined();
  });

  it('does NOT set passive-XP provenance — the transaction resolves it', () => {
    const { submissionBody } = buildEngagementSubmission(baseInput());
    expect(submissionBody.metrics.passiveXpRequested).toBeUndefined();
    expect(submissionBody.metrics.passiveXpDailyCapped).toBeUndefined();
  });

  it('is deterministic apart from submittedAt', () => {
    const a = buildEngagementSubmission(baseInput()).submissionBody;
    const b = buildEngagementSubmission(baseInput()).submissionBody;
    expect(a.metrics).toEqual(b.metrics);
    expect(a.status).toBe(b.status);
  });

  it('omits userSection when the student has none', () => {
    const { submissionBody } = buildEngagementSubmission(baseInput({ userSection: undefined }));
    expect('userSection' in submissionBody).toBe(false);
  });

  it('defaults userName to "Student" when absent', () => {
    const { submissionBody } = buildEngagementSubmission(baseInput({ userName: undefined }));
    expect(submissionBody.userName).toBe('Student');
  });
});

describe('buildEngagementSubmission — Firestore safety', () => {
  it('contains no undefined values on the default path', () => {
    const { submissionBody } = buildEngagementSubmission(baseInput());
    expect(() => assertNoUndefined(submissionBody)).not.toThrow();
  });

  it('contains no undefined values when assistive tech is not self-reported', () => {
    // The 181-failed-writes class: calculateFeedbackServerSide omits
    // assistiveTechOverrides on its default branch.
    const { submissionBody } = buildEngagementSubmission(baseInput());
    expect('assistiveTechOverrides' in submissionBody.metrics).toBe(false);
    expect(() => assertNoUndefined(submissionBody)).not.toThrow();
  });

  it('contains no undefined values when assistive tech IS self-reported', () => {
    const { submissionBody } = buildEngagementSubmission(
      baseInput({ metrics: { engagementTime: 600, assistiveTech: true } }),
    );
    expect(() => assertNoUndefined(submissionBody)).not.toThrow();
  });
});

describe('zero-XP capped session still writes its submission', () => {
  // Mirrors the handler: the clamp runs inside the transaction, the submission
  // is created unconditionally, and only the user-doc update is gated on
  // grantedXP > 0.
  const simulate = (earnedToday, requestedAfterBoost) => {
    const clamp = clampPassiveXP(earnedToday, requestedAfterBoost);
    const { submissionBody } = buildEngagementSubmission(baseInput());
    // The handler's transaction.create() payload.
    const written = {
      ...submissionBody,
      score: clamp.grantedXP,
      metrics: {
        ...submissionBody.metrics,
        passiveXpRequested: requestedAfterBoost,
        passiveXpDailyCapped: clamp.capped,
      },
    };
    return { clamp, written, userDocUpdated: clamp.grantedXP > 0 };
  };

  it('writes a submission with score 0 when the ceiling is already reached', () => {
    const { clamp, written, userDocUpdated } = simulate(MAX_DAILY_PASSIVE_XP, 500);
    expect(clamp.grantedXP).toBe(0);
    expect(clamp.capped).toBe(true);
    expect(userDocUpdated).toBe(false);
    expect(written.score).toBe(0);
    expect(written.metrics.passiveXpDailyCapped).toBe(true);
    expect(written.metrics.passiveXpRequested).toBe(500);
    expect(written.userId).toBe('uid_test_1');
  });

  it('the zero-XP submission body is still Firestore-safe', () => {
    const { written } = simulate(MAX_DAILY_PASSIVE_XP, 500);
    expect(() => assertNoUndefined(written)).not.toThrow();
  });

  it('writes a submission AND updates the user doc when budget remains', () => {
    const { clamp, written, userDocUpdated } = simulate(0, 500);
    expect(clamp.grantedXP).toBe(500);
    expect(userDocUpdated).toBe(true);
    expect(written.score).toBe(500);
    expect(written.metrics.passiveXpDailyCapped).toBe(false);
  });

  it('records the post-boost request, not the raw pre-boost figure', () => {
    // 1.5x boost, 1400 earned, 500 requested -> 750 requested, 100 granted.
    const { clamp, written } = simulate(1400, 750);
    expect(clamp.grantedXP).toBe(100);
    expect(written.score).toBe(100);
    expect(written.metrics.passiveXpRequested).toBe(750);
  });
});

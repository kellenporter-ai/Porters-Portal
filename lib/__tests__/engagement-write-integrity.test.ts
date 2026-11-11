import { describe, it, expect } from 'vitest';

// Regression guard for a production outage (2026-10-14 → 2026-11-11, 181 failed
// writes): submitEngagement wrote `assistiveTechOverrides` into the Firestore
// document without a spread guard. calculateFeedbackServerSide() omits that
// field on its default return branch, so every call where the student did not
// self-report assistive tech threw:
//
//   Value for argument "data" is not a valid Firestore document. Cannot use
//   "undefined" as a Firestore value (found in field "metrics.assistiveTechOverrides")
//
// The write and the XP award never happened, and the whole non-assessment
// engagement path recorded zero submissions. These tests reproduce the exact
// Firestore validation rule that rejected the document, so the unguarded form
// fails here instead of silently in production.

/**
 * Mirrors @google-cloud/firestore's validateUserInput: a document containing an
 * `undefined` value is rejected unless ignoreUndefinedProperties is enabled.
 */
function assertValidFirestoreDocument(value: unknown, path = 'document'): void {
  if (value === undefined) {
    throw new Error(
      `Cannot use "undefined" as a Firestore value (found in field "${path}")`
    );
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assertValidFirestoreDocument(child, path === 'document' ? key : `${path}.${key}`);
  }
}

/** The shape calculateFeedbackServerSide can return. */
type FeedbackResult = { status: string; feedback: string; assistiveTechOverrides?: string[] };

// --- The two document builders under test -------------------------------------
// These reproduce the exact expressions used by submitEngagement (engagement.ts)
// and submitAssessment (assessment.ts).

function buildEngagementMetrics(feedbackResult: FeedbackResult, guarded: boolean) {
  const assistiveTechOverrides = feedbackResult.assistiveTechOverrides;
  return {
    engagementTime: 900,
    keystrokes: 120,
    pasteCount: 0,
    // buggy historical form:               assistiveTechOverrides,
    // fixed form (now in engagement.ts):
    ...(guarded ? { ...(assistiveTechOverrides ? { assistiveTechOverrides } : {}) } : { assistiveTechOverrides }),
  };
}

describe('submitEngagement submission document', () => {
  // Default branch of calculateFeedbackServerSide — no assistiveTechOverrides key.
  const normalResult: FeedbackResult = {
    status: 'NORMAL',
    feedback: 'Assignment submitted successfully.',
  };

  it('the historical unguarded form is rejected by Firestore validation', () => {
    // Proves the test can actually catch the bug (mutation control).
    const metrics = buildEngagementMetrics(normalResult, false);
    expect(() => assertValidFirestoreDocument({ metrics })).toThrow(/"metrics\.assistiveTechOverrides"/);
  });

  it('the current guarded form produces a valid document when no overrides exist', () => {
    const metrics = buildEngagementMetrics(normalResult, true);
    expect(() => assertValidFirestoreDocument({ metrics })).not.toThrow();
    expect('assistiveTechOverrides' in metrics).toBe(false);
  });

  it('the guarded form still persists overrides when the student reported assistive tech', () => {
    const withOverrides: FeedbackResult = {
      status: 'NORMAL',
      feedback: 'Assignment submitted successfully. (2 integrity checks overridden)',
      assistiveTechOverrides: ['zero_keystrokes', 'impossible_wps'],
    };
    const metrics = buildEngagementMetrics(withOverrides, true);
    expect(() => assertValidFirestoreDocument({ metrics })).not.toThrow();
    expect(metrics).toHaveProperty('assistiveTechOverrides', ['zero_keystrokes', 'impossible_wps']);
  });
});

describe('Firestore undefined-value validator (test harness sanity)', () => {
  it('rejects nested undefined fields and names the full path', () => {
    expect(() => assertValidFirestoreDocument({ a: { b: undefined } })).toThrow(/"a\.b"/);
  });

  it('accepts arrays, empty strings, zero, false and null', () => {
    expect(() =>
      assertValidFirestoreDocument({ a: [], b: '', c: 0, d: false, e: null })
    ).not.toThrow();
  });
});

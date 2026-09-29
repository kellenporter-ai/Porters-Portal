// Session-staleness helper unit tests for the 2026-09-29 assessment-limbo fix.
// Covers: partition/claim helpers (expired vs active, grace boundary) and the
// pure predicates behind returnAssessment / submitOnBehalf expiry grace.
// Runs against compiled output (lib/). Emulator-free: the startAssessmentSession
// Firestore transaction path cannot be exercised without the emulator — those
// semantics are covered here at the helper level only.
import { describe, it, expect } from 'vitest';
import {
  SESSION_EXPIRY_GRACE_MS,
  sessionExpiryMillis,
  isSessionEffectivelyExpired,
  partitionSessionsByStaleness,
  claimStaleSessionUpdate,
} from '../lib/assessment.js';

const NOW = 1_757_000_000_000; // arbitrary fixed epoch-ms reference

// Firestore Timestamp-like stub (shape used by sessionExpiryMillis)
const ts = (ms) => ({ toMillis: () => ms });

describe('sessionExpiryMillis', () => {
  it('returns null for undefined / null', () => {
    expect(sessionExpiryMillis(undefined)).toBeNull();
    expect(sessionExpiryMillis(null)).toBeNull();
  });
  it('reads Firestore Timestamp via toMillis()', () => {
    expect(sessionExpiryMillis(ts(NOW))).toBe(NOW);
  });
  it('reads Date-like via getTime()', () => {
    expect(sessionExpiryMillis({ getTime: () => NOW })).toBe(NOW);
  });
  it('accepts epoch-ms numbers and ISO strings', () => {
    expect(sessionExpiryMillis(NOW)).toBe(NOW);
    expect(sessionExpiryMillis(new Date(NOW).toISOString())).toBe(NOW);
  });
  it('returns null for unparseable / non-finite input', () => {
    expect(sessionExpiryMillis('not-a-date')).toBeNull();
    expect(sessionExpiryMillis(NaN)).toBeNull();
    expect(sessionExpiryMillis({})).toBeNull();
  });
});

describe('isSessionEffectivelyExpired — grace boundary', () => {
  const exp = NOW - 1000;
  it('NOT expired at exactly expiresAt + grace (strict >, boundary inclusive-safe)', () => {
    expect(isSessionEffectivelyExpired(ts(exp), exp + SESSION_EXPIRY_GRACE_MS)).toBe(false);
  });
  it('NOT expired within the grace window', () => {
    expect(isSessionEffectivelyExpired(ts(exp), exp + SESSION_EXPIRY_GRACE_MS - 1)).toBe(false);
  });
  it('expired past expiresAt + grace', () => {
    expect(isSessionEffectivelyExpired(ts(exp), exp + SESSION_EXPIRY_GRACE_MS + 1)).toBe(true);
  });
  it('NOT expired before expiresAt', () => {
    expect(isSessionEffectivelyExpired(ts(NOW + 60_000), NOW)).toBe(false);
  });
  it('fail-open: sessions with no expiresAt NEVER expire', () => {
    expect(isSessionEffectivelyExpired(undefined, NOW)).toBe(false);
    expect(isSessionEffectivelyExpired(null, NOW)).toBe(false);
  });
});

describe('partitionSessionsByStaleness — expired vs active', () => {
  it('separates stale (past grace) from active (incl. within-grace)', () => {
    const sessions = [
      { id: 'active-future', expiresAt: ts(NOW + 60_000) },
      { id: 'active-within-grace', expiresAt: ts(NOW - 1000) }, // just expired, inside grace
      { id: 'stale', expiresAt: ts(NOW - SESSION_EXPIRY_GRACE_MS - 60_000) },
      { id: 'no-expiry', expiresAt: undefined }, // fail-open → active
    ];
    const { active, stale } = partitionSessionsByStaleness(sessions, NOW);
    expect(active.map(s => s.id)).toEqual(['active-future', 'active-within-grace', 'no-expiry']);
    expect(stale.map(s => s.id)).toEqual(['stale']);
  });

  it('empty input yields empty partitions', () => {
    expect(partitionSessionsByStaleness([], NOW)).toEqual({ active: [], stale: [] });
  });

  it('returnAssessment proceeds when only expired unused sessions exist', () => {
    // Only stale sessions → active.length === 0 → no failed-precondition throw.
    const onlyStale = [
      { id: 's1', expiresAt: ts(NOW - SESSION_EXPIRY_GRACE_MS - 1000) },
      { id: 's2', expiresAt: ts(NOW - SESSION_EXPIRY_GRACE_MS - 5000) },
    ];
    const { active, stale } = partitionSessionsByStaleness(onlyStale, NOW);
    expect(active).toEqual([]);
    expect(stale).toHaveLength(2);
  });

  it('returnAssessment still blocks when any genuinely active session exists', () => {
    const mixed = [
      { id: 'stale1', expiresAt: ts(NOW - SESSION_EXPIRY_GRACE_MS - 1000) },
      { id: 'live', expiresAt: ts(NOW + 30_000) },
    ];
    const { active, stale } = partitionSessionsByStaleness(mixed, NOW);
    expect(active).toHaveLength(1);
    expect(stale).toHaveLength(1);
  });
});

describe('claimStaleSessionUpdate — submitOnBehalf stale-claim shape', () => {
  it('marks used:true with usedAt = claim time (never deletes)', () => {
    expect(claimStaleSessionUpdate(NOW)).toEqual({ used: true, usedAt: NOW });
  });
  it('claim fields satisfy the used==false query exclusion (data-level repair)', () => {
    // After claiming, the doc no longer matches .where('used', '==', false),
    // so returnAssessment / submitOnBehalf no longer see it as a blocker.
    const claimed = claimStaleSessionUpdate(NOW);
    expect(claimed.used).toBe(true);
  });
});

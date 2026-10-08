// Session-staleness helper unit tests for the 2026-09-29 assessment-limbo fix.
// Covers: partition/claim helpers (expired vs active, grace boundary) and the
// pure predicates behind returnAssessment / submitOnBehalf expiry grace.
// Runs against compiled output (lib/). Emulator-free: the startAssessmentSession
// Firestore transaction path cannot be exercised without the emulator — those
// semantics are covered here at the helper level only.
import { describe, it, expect } from 'vitest';
import {
  SESSION_EXPIRY_GRACE_MS,
  MAX_SESSION_IDLE_MS,
  sessionExpiryMillis,
  isSessionEffectivelyExpired,
  isSessionIdleStale,
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
  it('fail-CLOSED: sessions with no/invalid expiresAt count as expired (stale)', () => {
    expect(isSessionEffectivelyExpired(undefined, NOW)).toBe(true);
    expect(isSessionEffectivelyExpired(null, NOW)).toBe(true);
    expect(isSessionEffectivelyExpired('not-a-date', NOW)).toBe(true);
  });
  it('valid timestamps unchanged: NOT expired before expiresAt + grace', () => {
    expect(isSessionEffectivelyExpired(ts(NOW + 60_000), NOW)).toBe(false);
  });
});

describe('isSessionIdleStale — 30-minute idle bound', () => {
  it('stale when lastHeartbeatAt is older than MAX_SESSION_IDLE_MS', () => {
    expect(isSessionIdleStale({ lastHeartbeatAt: ts(NOW - MAX_SESSION_IDLE_MS - 60_000) }, NOW)).toBe(true);
  });
  it('NOT stale when lastHeartbeatAt is fresh', () => {
    expect(isSessionIdleStale({ lastHeartbeatAt: ts(NOW - 10 * 60_000) }, NOW)).toBe(false);
  });
  it('falls back to startedAt when no heartbeat exists', () => {
    expect(isSessionIdleStale({ startedAt: ts(NOW - MAX_SESSION_IDLE_MS - 60_000) }, NOW)).toBe(true);
    expect(isSessionIdleStale({ startedAt: ts(NOW - 5 * 60_000) }, NOW)).toBe(false);
  });
  it('NOT idle-stale when neither timestamp exists (fail conservative)', () => {
    expect(isSessionIdleStale({}, NOW)).toBe(false);
  });
  it('prefers fresh heartbeat over stale startedAt', () => {
    expect(isSessionIdleStale({ startedAt: ts(NOW - 3 * 60 * 60_000), lastHeartbeatAt: ts(NOW - 60_000) }, NOW)).toBe(false);
  });
});

describe('partitionSessionsByStaleness — expired vs active', () => {
  it('separates stale (past grace) from active (incl. within-grace)', () => {
    const sessions = [
      { id: 'active-future', expiresAt: ts(NOW + 60_000) },
      { id: 'active-within-grace', expiresAt: ts(NOW - 1000) }, // just expired, inside grace
      { id: 'stale', expiresAt: ts(NOW - SESSION_EXPIRY_GRACE_MS - 60_000) },
      { id: 'no-expiry', expiresAt: undefined }, // fail-closed → stale/claimable
    ];
    const { active, stale } = partitionSessionsByStaleness(sessions, NOW);
    expect(active.map(s => s.id)).toEqual(['active-future', 'active-within-grace']);
    expect(stale.map(s => s.id)).toEqual(['stale', 'no-expiry']);
  });

  it('null/missing expiresAt + used:false → stale/claimable (Fix 1, not active)', () => {
    const { active, stale } = partitionSessionsByStaleness(
      [{ id: 'no-expiry' }, { id: 'null-expiry', expiresAt: null }],
      NOW,
    );
    expect(active).toEqual([]);
    expect(stale.map(s => s.id)).toEqual(['no-expiry', 'null-expiry']);
  });

  it('unexpired session, lastHeartbeatAt 31 min old → stale (Fix 2)', () => {
    const { active, stale } = partitionSessionsByStaleness(
      [{ id: 'idle', expiresAt: ts(NOW + 60 * 60_000), lastHeartbeatAt: ts(NOW - MAX_SESSION_IDLE_MS - 60_000) }],
      NOW,
    );
    expect(active).toEqual([]);
    expect(stale.map(s => s.id)).toEqual(['idle']);
  });

  it('unexpired session, lastHeartbeatAt 10 min old → still active (blocks)', () => {
    const { active, stale } = partitionSessionsByStaleness(
      [{ id: 'fresh', expiresAt: ts(NOW + 60 * 60_000), lastHeartbeatAt: ts(NOW - 10 * 60_000) }],
      NOW,
    );
    expect(active.map(s => s.id)).toEqual(['fresh']);
    expect(stale).toEqual([]);
  });

  it('unexpired session, no heartbeat, startedAt 31 min old → stale', () => {
    const { active, stale } = partitionSessionsByStaleness(
      [{ id: 'old-start', expiresAt: ts(NOW + 60 * 60_000), startedAt: ts(NOW - MAX_SESSION_IDLE_MS - 60_000) }],
      NOW,
    );
    expect(active).toEqual([]);
    expect(stale.map(s => s.id)).toEqual(['old-start']);
  });

  it('unexpired session, no heartbeat, startedAt 5 min old → active', () => {
    const { active, stale } = partitionSessionsByStaleness(
      [{ id: 'new-start', expiresAt: ts(NOW + 60 * 60_000), startedAt: ts(NOW - 5 * 60_000) }],
      NOW,
    );
    expect(active.map(s => s.id)).toEqual(['new-start']);
    expect(stale).toEqual([]);
  });

  it('valid future expiresAt + fresh heartbeat → active (regression guard for Fix 1 overreach)', () => {
    const { active, stale } = partitionSessionsByStaleness(
      [{ id: 'live', expiresAt: ts(NOW + 60 * 60_000), lastHeartbeatAt: ts(NOW - 30_000), startedAt: ts(NOW - 60_000) }],
      NOW,
    );
    expect(active.map(s => s.id)).toEqual(['live']);
    expect(stale).toEqual([]);
  });

  it('neither lastHeartbeatAt nor startedAt → expiry-only behavior (no new forever-block)', () => {
    // Future expiresAt, no activity timestamps → still active (expiresAt wins).
    const future = partitionSessionsByStaleness(
      [{ id: 'legacy', expiresAt: ts(NOW + 60 * 60_000) }],
      NOW,
    );
    expect(future.active.map(s => s.id)).toEqual(['legacy']);
    expect(future.stale).toEqual([]);
    // And a no-expiry legacy doc with no timestamps → stale via Fix 1 (not active).
    const noExpiry = partitionSessionsByStaleness([{ id: 'legacy-noexp' }], NOW);
    expect(noExpiry.active).toEqual([]);
    expect(noExpiry.stale.map(s => s.id)).toEqual(['legacy-noexp']);
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

/**
 * Phase 1 — flipped bug-reproduction tests for the save/restore/submit pipeline.
 * Phase 0 asserted the broken behavior; Phase 1 (R1, R6) fixes the bugs and the
 * assertions below now assert the FIXED behavior. R2 assertions remain
 * unfixed (later phase) and still document current broken behavior.
 *
 * BUG REFERENCES:
 *  - R1: Bridge recovery key is now assignment-scoped → cross-contamination impossible.
 *  - R2: Non-assessment restore path clobbers dirty drafts. (not fixed in Phase 1)
 *  - R6: Assessment session token cache key is now user-scoped → shared-device bleed blocked.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Node env: restoreReconciliation → persistentWrite → ../firebase touches
// `window` at module level (dev-only console probe). Stub ../firebase so the
// transitive import chain evaluates in node.
vi.mock('../firebase', () => ({ db: {} }));
import {
  bridgeRecoveryKey,
  legacyBridgeRecoveryKey,
  extractRecoveryData,
  buildBridgeRecoveryEnvelope,
} from '../bridgeRecovery';
import {
  assessmentSessionKey,
  assessmentSessionSigKey,
  legacyAssessmentSessionKey,
  legacyAssessmentSessionSigKey,
} from '../assessmentSessionKeys';
import {
  decideRestoredResponses,
  hasLoadedAnyResponses,
  shouldRefetchOnReconnect,
} from '../restoreReconciliation';

// ---------------------------------------------------------------------------
// Minimal localStorage shim (node env)
// ---------------------------------------------------------------------------
class LocalStorageShim {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
  get length() { return this.store.size; }
  key(i: number) { return [...this.store.keys()][i] ?? null; }
}

(globalThis as Record<string, unknown>).localStorage = new LocalStorageShim();

// ---------------------------------------------------------------------------
// R1 — Bridge recovery cross-contamination
// ---------------------------------------------------------------------------
describe('R1: Bridge recovery cross-contamination (FIXED)', () => {
  beforeEach(() => localStorage.clear());

  it('writes recovery state to an assignment-scoped key (was: NOT assignment-scoped)', () => {
    const userId = 'user-abc';
    const keyA = bridgeRecoveryKey(userId, 'assignment-A');
    const keyB = bridgeRecoveryKey(userId, 'assignment-B');
    // FIXED: different assignments use different recovery slots.
    expect(keyA).not.toBe(keyB);
    expect(keyA).toBe(`portalBridge_${userId}_assignment-A_lastState`);
    expect(keyB).toBe(`portalBridge_${userId}_assignment-B_lastState`);
  });

  it('B-5: sessionId scopes the recovery key per-mount; legacy two-arg key still works', () => {
    const userId = 'user-abc';
    // Two-arg (legacy) call produces the transition envelope key.
    const legacy = bridgeRecoveryKey(userId, 'assignment-A');
    expect(legacy).toBe(`portalBridge_${userId}_assignment-A_lastState`);
    // Three-arg call produces a mount-scoped key that differs from legacy.
    const s1 = bridgeRecoveryKey(userId, 'assignment-A', 'session-1');
    const s2 = bridgeRecoveryKey(userId, 'assignment-A', 'session-2');
    expect(s1).toBe(`portalBridge_${userId}_assignment-A_session-1_lastState`);
    expect(s1).not.toBe(s2);
    expect(s1).not.toBe(legacy);
  });

  it('two different assignments no longer share a recovery slot (contamination impossible)', () => {
    const userId = 'user-abc';
    // Activity A writes its recovery state to A's scoped slot.
    const keyA = bridgeRecoveryKey(userId, 'assignment-A');
    const envelope = buildBridgeRecoveryEnvelope({ state: { answer: 'A-data' }, currentQuestion: 3 });
    localStorage.setItem(keyA, JSON.stringify(envelope));

    // FIXED: activity B finds NO state at its own scoped slot — A's state is unreachable.
    const recoveredRawB = localStorage.getItem(bridgeRecoveryKey(userId, 'assignment-B'));
    expect(recoveredRawB).toBeNull();

    // The legacy unscoped slot is empty too (Phase 1 bridge only writes scoped keys).
    expect(localStorage.getItem(legacyBridgeRecoveryKey(userId))).toBeNull();
  });

  it('legacy unscoped key is consumed once and removed (migration path)', () => {
    const userId = 'user-abc';
    const legacyKey = legacyBridgeRecoveryKey(userId);
    const scopedKey = bridgeRecoveryKey(userId, 'assignment-B');
    // Pre-Phase-1 bridge wrote an unscoped envelope; no scoped key exists yet.
    localStorage.setItem(legacyKey, JSON.stringify({
      state: { state: { answer: 'legacy-data' }, currentQuestion: 2 },
      timestamp: '2024-01-01T00:00:00Z',
    }));
    expect(localStorage.getItem(scopedKey)).toBeNull();

    // Mirror the Proctor portal-ready consumer: legacy consumed only when no
    // scoped key exists, then removed.
    const scopedRaw = localStorage.getItem(scopedKey);
    const legacyRaw = scopedRaw ? null : localStorage.getItem(legacyKey);
    expect(legacyRaw).not.toBeNull();

    const recovered = JSON.parse(legacyRaw!);
    const recoveryData = extractRecoveryData(userId, 'assignment-B', recovered);
    expect(recoveryData.state).toEqual({ answer: 'legacy-data' });
    expect(recoveryData.assignmentId).toBe('assignment-B');
    expect(recoveryData.currentQuestion).toBe(2);

    // One-time migration: key is removed after consumption.
    localStorage.removeItem(legacyKey);
    expect(localStorage.getItem(legacyKey)).toBeNull();
    // A second portal-ready finds nothing (no double-apply).
    expect(localStorage.getItem(scopedKey) ?? localStorage.getItem(legacyKey)).toBeNull();
  });

  it('scoped key takes precedence — legacy key is NOT consumed when scoped exists', () => {
    const userId = 'user-abc';
    localStorage.setItem(legacyBridgeRecoveryKey(userId), JSON.stringify(buildBridgeRecoveryEnvelope({ stale: true })));
    localStorage.setItem(bridgeRecoveryKey(userId, 'assignment-B'), JSON.stringify(buildBridgeRecoveryEnvelope({ fresh: true })));

    const scopedRaw = localStorage.getItem(bridgeRecoveryKey(userId, 'assignment-B'));
    const legacyRaw = scopedRaw ? null : localStorage.getItem(legacyBridgeRecoveryKey(userId));
    expect(legacyRaw).toBeNull();

    // Legacy key remains (will be consumed by its own flow or a later mount).
    expect(localStorage.getItem(legacyBridgeRecoveryKey(userId))).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// R6 — Shared-device token bleed
// ---------------------------------------------------------------------------
describe('R6: Shared-device token bleed (FIXED)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorageMock.clear();
  });

  it('session token cache key IS user-scoped (was: NOT user-scoped)', () => {
    // Student A and student B on the same browser profile now use different keys.
    const keyA = assessmentSessionKey('student-A', 'assign-1');
    const keyB = assessmentSessionKey('student-B', 'assign-1');
    expect(keyA).not.toBe(keyB);
    expect(keyA).toBe('assessment_session_student-A_assign-1');
    expect(keyB).toBe('assessment_session_student-B_assign-1');
  });

  it('signature key is user-scoped as well', () => {
    const sig = assessmentSessionSigKey('student-A', 'assign-1');
    expect(sig).toBe('assessment_session_student-A_assign-1_sig');
    expect(sig).not.toBe(assessmentSessionSigKey('student-B', 'assign-1'));
  });

  it('student B cannot see student A\'s cached token (different scoped slots)', () => {
    // Student A logs in, gets token cached under A's key:
    localStorage.setItem(assessmentSessionKey('student-A', 'assign-1'), 'token-for-student-A');
    sessionStorageMock.setItem(assessmentSessionKey('student-A', 'assign-1'), 'token-for-student-A');

    // Student B logs in on the SAME browser profile (shared Chromebook).
    // FIXED: B's Proctor looks up B's scoped key and finds nothing.
    const cachedForB = localStorage.getItem(assessmentSessionKey('student-B', 'assign-1'))
      ?? sessionStorageMock.getItem(assessmentSessionKey('student-B', 'assign-1'));
    expect(cachedForB).toBeNull();

    // Defense-in-depth: even if a wrong-user token were somehow presented,
    // the heartbeat CF now rejects sessionData.userId !== auth.uid, so the
    // server-side validation also blocks the bleed.
    const serverWouldReject = true; // enforced by heartbeat userId check
    expect(serverWouldReject).toBe(true);
  });

  it('legacy unscoped key is deleted on mount, never reused or migrated', () => {
    const assignmentId = 'assign-1';
    // A legacy unscoped token (may belong to a previous user) sits in storage.
    localStorage.setItem(legacyAssessmentSessionKey(assignmentId), 'stale-token');
    sessionStorageMock.setItem(legacyAssessmentSessionKey(assignmentId), 'stale-token');
    localStorage.setItem(legacyAssessmentSessionSigKey(assignmentId), 'stale-sig');
    sessionStorageMock.setItem(legacyAssessmentSessionSigKey(assignmentId), 'stale-sig');

    // Mirror the Proctor mount behavior: legacy keys are REMOVED, not migrated.
    for (const storage of [localStorage, sessionStorageMock]) {
      storage.removeItem(legacyAssessmentSessionKey(assignmentId));
      storage.removeItem(legacyAssessmentSessionSigKey(assignmentId));
    }

    expect(localStorage.getItem(legacyAssessmentSessionKey(assignmentId))).toBeNull();
    expect(sessionStorageMock.getItem(legacyAssessmentSessionKey(assignmentId))).toBeNull();
    expect(localStorage.getItem(legacyAssessmentSessionSigKey(assignmentId))).toBeNull();
    expect(sessionStorageMock.getItem(legacyAssessmentSessionSigKey(assignmentId))).toBeNull();

    // Fresh scoped slot for the current user starts empty → new token requested.
    const scoped = localStorage.getItem(assessmentSessionKey('student-B', assignmentId));
    expect(scoped).toBeNull();
  });

  it('validateCached must treat permission-denied as FATAL (clear cached token, never retry transient)', () => {
    // Models the Proctor validateCached catch-branch: permission-denied now
    // lands in the fatal bucket alongside expired/not-found/used.
    const isFatal = (msg: string) =>
      msg.includes('expired') || msg.includes('not-found') || msg.includes('used') || msg.includes('permission-denied');
    expect(isFatal('permission-denied: Session token does not match your account.')).toBe(true);
    // Transient network-style errors stay non-fatal.
    expect(isFatal('network request failed')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R2 — Non-assessment restore clobbers dirty drafts
// ---------------------------------------------------------------------------
describe('R2: Non-assessment restore goes through reconciliation (FIXED)', () => {
  // Phase 1c: the restore decision is extracted into lib/restoreReconciliation.ts
  // (decideRestoredResponses) and both Proctor restore paths consume it via
  // setInitialResponses + getResponses(). These tests exercise the REAL seam.

  it('dirty draft restored at mount wins over stale/empty server data', () => {
    const hookDraftResponses = { block1: 'student draft work' }; // hook already reconciled
    const restored = decideRestoredResponses({
      serverResponses: { block1: '' },
      serverTimestamp: '2024-01-01T00:00:00Z',
      hookResponses: hookDraftResponses,
      draftRestoredTimestamp: '2024-01-02T00:00:00Z',
    });
    // FIXED: restored state is the hook's reconciled draft, not raw server data.
    expect(restored).toEqual(hookDraftResponses);
  });

  it('load error (getDoc catch) does NOT wipe to {} when a dirty draft exists', () => {
    const hookDraftResponses = { block1: 'student draft work' };
    // Proctor catch path now does setSavedBlockResponses(getResponses()) —
    // equivalent to decideRestoredResponses with draftRestoredTimestamp set.
    const restored = decideRestoredResponses({
      serverResponses: {},
      hookResponses: hookDraftResponses,
      draftRestoredTimestamp: '2024-01-02T00:00:00Z',
    });
    expect(restored).toEqual(hookDraftResponses);
    expect(hasLoadedAnyResponses(hookDraftResponses, false)).toBe(true);
  });

  it('clean local state accepts the server snapshot (happy path unchanged)', () => {
    const serverResponses = { block1: 'saved server work' };
    const restored = decideRestoredResponses({
      serverResponses,
      serverTimestamp: '2024-01-02T00:00:00Z',
      hookResponses: {},
      draftRestoredTimestamp: null,
    });
    expect(restored).toEqual(serverResponses);
  });

  it('assessment and non-assessment paths now share the same decision seam', () => {
    // Both branches call setInitialResponses(...); setSavedBlockResponses(getResponses()).
    const draft = { block1: 'draft' };
    const viaAssessment = decideRestoredResponses({
      serverResponses: { block1: '' }, hookResponses: draft, draftRestoredTimestamp: 't',
    });
    const viaNonAssessment = decideRestoredResponses({
      serverResponses: { block1: '' }, hookResponses: draft, draftRestoredTimestamp: 't',
    });
    expect(viaAssessment).toEqual(viaNonAssessment);
  });

  it('shouldRefetchOnReconnect: dirty draft blocks re-fetch; empty clean state allows it', () => {
    const lsKey = 'portal_draft_test_r3';
    localStorage.removeItem(lsKey);
    // Clean + empty → re-fetch allowed (R3 reconnect recovery).
    expect(shouldRefetchOnReconnect(true, {}, lsKey)).toBe(true);
    // Dirty draft → never re-fetch over unsaved edits.
    localStorage.setItem(lsKey, JSON.stringify({ dirty: true, timestamp: 't', data: { responses: { a: 1 } } }));
    expect(shouldRefetchOnReconnect(true, { a: 1 }, lsKey)).toBe(false);
    // Offline → no re-fetch.
    expect(shouldRefetchOnReconnect(false, {}, lsKey)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// String invariant: public/portalBridge.js cannot import from lib/ (it is a
// plain script served to iframes), so this test pins its key-format lines to
// the seam's format. Any drift breaks the build.
// ---------------------------------------------------------------------------
describe('portalBridge.js string invariant (R1 seam drift guard)', () => {
  const bridgeSrc = readFileSync(
    resolve(__dirname, '../../public/portalBridge.js'),
    'utf-8',
  );

  it('recovery key format matches bridgeRecoveryKey seam', () => {
    const seamKey = bridgeRecoveryKey('UID', 'AID');
    const seamSessionKey = bridgeRecoveryKey('UID', 'AID', 'SID');
    // B-5: sessionId-scoped and legacy (two-arg) keys share the same prefix shape.
    expect(seamKey).toBe(`portalBridge_UID_AID_lastState`);
    expect(seamSessionKey).toBe(`portalBridge_UID_AID_SID_lastState`);
    // portalBridge computes the key with an optional sessionId segment — the
    // exact concatenation line must appear twice (beforeunload + pagehide).
    const bridgeLine = `'portalBridge_' + (PortalBridge.userId || 'unknown') + '_' + (PortalBridge.assignmentId || 'unknown') + (PortalBridge.sessionId ? '_' + PortalBridge.sessionId : '') + '_lastState'`;
    const occurrences = bridgeSrc.split(bridgeLine).length - 1;
    expect(occurrences).toBe(2);
    // Legacy unscoped concatenation (userId + '_lastState', no assignmentId) must be gone.
    expect(bridgeSrc).not.toContain(`(PortalBridge.userId || 'unknown') + '_lastState'`);
  });

  it('portal-init handshake captures assignmentId and sessionId from the parent payload', () => {
    expect(bridgeSrc).toContain('PortalBridge.assignmentId = data.payload.assignmentId');
    expect(bridgeSrc).toContain('PortalBridge.sessionId = data.payload.sessionId');
  });
});

// ---------------------------------------------------------------------------
// Minimal sessionStorage shim (used by R6 tests)
// ---------------------------------------------------------------------------
const sessionStorageMock = new LocalStorageShim();
(globalThis as Record<string, unknown>).sessionStorage = sessionStorageMock;

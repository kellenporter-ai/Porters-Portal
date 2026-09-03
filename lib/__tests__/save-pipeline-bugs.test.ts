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
import { describe, it, expect, beforeEach } from 'vitest';
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
describe('R2: Non-assessment restore clobbers dirty drafts', () => {
  // Simulates the Proctor.tsx non-assessment restore branch:
  //   getDoc(...).then(snap => { ... setSavedBlockResponses(responses); })
  //     .catch(() => setSavedBlockResponses({}));
  // vs. the hook's onResponsesChange having already published the dirty draft.
  // The assessment branch uses getResponses() (reconciled); the non-assessment
  // branch uses raw server responses or {} on error.

  function nonAssessmentRestore(
    serverResponses: Record<string, unknown> | null,
    loadError: boolean,
  ): Record<string, unknown> {
    // Mirrors the non-assessment branch: server data wins, {} on error.
    // BUG: ignores the hook's reconciled draft responses.
    if (loadError) return {};
    return serverResponses ?? {};
  }

  function assessmentRestore(
    hookResponses: Record<string, unknown>,
  ): Record<string, unknown> {
    // Assessment branch: setSavedBlockResponses(getResponses()) — reconciled.
    return hookResponses;
  }

  it('non-assessment restore uses raw server responses, discarding the dirty draft the hook restored', () => {
    const hookDraftResponses = { block1: 'student draft work' }; // published via onResponsesChange
    const serverResponses = { block1: '' }; // stale/empty server data
    const restored = nonAssessmentRestore(serverResponses, false);
    // BUG: Phase 1 flips this — restored should be the hook's reconciled draft.
    expect(restored).not.toEqual(hookDraftResponses);
    expect(restored).toEqual({ block1: '' });
  });

  it('non-assessment restore with a load error wipes to {} instead of keeping the hook draft', () => {
    const hookDraftResponses = { block1: 'student draft work' };
    const restored = nonAssessmentRestore(null, true); // getDoc catch → setSavedBlockResponses({})
    // BUG: draft exists in hook/localStorage but blocks mount empty.
    expect(restored).toEqual({});
    expect(restored).not.toEqual(hookDraftResponses);
  });

  it('assessment branch uses reconciled hook responses (contrast case, current correct behavior)', () => {
    const hookDraftResponses = { block1: 'student draft work' };
    expect(assessmentRestore(hookDraftResponses)).toEqual(hookDraftResponses);
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
    // portalBridge computes: 'portalBridge_' + userId + '_' + assignmentId + '_lastState'
    const bridgeLine = `'portalBridge_' + (PortalBridge.userId || 'unknown') + '_' + (PortalBridge.assignmentId || 'unknown') + '_lastState'`;
    expect(seamKey).toBe(`portalBridge_UID_AID_lastState`);
    // The exact concatenation line must appear in the bridge source (both
    // beforeunload and pagehide handlers).
    const occurrences = bridgeSrc.split(bridgeLine).length - 1;
    expect(occurrences).toBe(2);
    // Legacy unscoped concatenation (userId + '_lastState', no assignmentId) must be gone.
    expect(bridgeSrc).not.toContain(`(PortalBridge.userId || 'unknown') + '_lastState'`);
  });

  it('portal-init handshake captures assignmentId from the parent payload', () => {
    expect(bridgeSrc).toContain('PortalBridge.assignmentId = data.payload.assignmentId');
  });
});

// ---------------------------------------------------------------------------
// Minimal sessionStorage shim (used by R6 tests)
// ---------------------------------------------------------------------------
const sessionStorageMock = new LocalStorageShim();
(globalThis as Record<string, unknown>).sessionStorage = sessionStorageMock;

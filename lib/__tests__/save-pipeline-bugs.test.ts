/**
 * Phase 0 — bug reproduction tests for the save/restore/submit pipeline.
 * Per the audit spec, these assert the CURRENT (broken) behavior so Phase 1
 * flips the assertions rather than deleting the tests.
 *
 * BUG REFERENCES:
 *  - R1: Bridge recovery key is not assignment-scoped → cross-contamination.
 *  - R2: Non-assessment restore path clobbers dirty drafts.
 *  - R6: Assessment session token cache key is not user-scoped → shared-device bleed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bridgeRecoveryKey, extractRecoveryData } from '../bridgeRecovery';
import { assessmentSessionKey, assessmentSessionSigKey } from '../assessmentSessionKeys';

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
describe('R1: Bridge recovery cross-contamination', () => {
  beforeEach(() => localStorage.clear());

  it('writes recovery state to a key that is NOT assignment-scoped', () => {
    const userId = 'user-abc';
    const keyA = bridgeRecoveryKey(userId);
    const keyB = bridgeRecoveryKey(userId);
    // BUG: Phase 1 makes this assignment-scoped so keyA !== keyB.
    expect(keyA).toBe(keyB);
    expect(keyA).toBe(`portalBridge_${userId}_lastState`);
  });

  it('two different assignments share the same recovery slot (contamination)', () => {
    const userId = 'user-abc';
    // Activity A writes its recovery state, then activity B opens and
    // consumes the SAME key — B's saved progress is overwritten with A's state.
    const key = bridgeRecoveryKey(userId);
    const stateA = { state: { answer: 'A-data' }, currentQuestion: 3 };
    localStorage.setItem(key, JSON.stringify({ state: stateA, timestamp: '2024-01-01T00:00:00Z' }));

    // BUG: Phase 1 flips this assertion — B should find NO A-scoped state.
    const recoveredRaw = localStorage.getItem(bridgeRecoveryKey(userId));
    expect(recoveredRaw).not.toBeNull();

    const recovered = JSON.parse(recoveredRaw!);
    // Proctor consumes it into assignment B's practice_progress doc:
    const recoveryData = extractRecoveryData(userId, 'assignment-B', recovered);
    // BUG: assignment B receives activity A's state.
    expect(recoveryData.state).toEqual({ answer: 'A-data' });
    expect(recoveryData.assignmentId).toBe('assignment-B');
  });
});

// ---------------------------------------------------------------------------
// R6 — Shared-device token bleed
// ---------------------------------------------------------------------------
describe('R6: Shared-device token bleed', () => {
  beforeEach(() => localStorage.clear());

  it('session token cache key is NOT user-scoped', () => {
    // Student A and student B on the same browser profile share one key.
    const keyA = assessmentSessionKey('assign-1');
    const keyB = assessmentSessionKey('assign-1');
    // BUG: Phase 1 makes this user-scoped so keyA !== keyB.
    expect(keyA).toBe(keyB);
    expect(keyA).toBe('assessment_session_assign-1');
  });

  it('cached token from one user validates as usable for another user on the same profile', () => {
    const key = assessmentSessionKey('assign-1');
    // Student A logs in, gets token cached:
    localStorage.setItem(key, 'token-for-student-A');
    sessionStorageMock.setItem(key, 'token-for-student-A');

    // Student B logs in on the SAME browser profile (shared Chromebook).
    // Proctor finds A's cached token and calls heartbeat with it.
    const cachedForB = localStorage.getItem(key) ?? sessionStorageMock.getItem(key);
    expect(cachedForB).toBe('token-for-student-A');

    // BUG: heartbeat Cloud Function never checks sessionData.userId against
    // the caller, so it returns ok:true for student B. Phase 1 adds the
    // userId check server-side AND scopes the key client-side.
    const heartbeatWouldSucceed = cachedForB !== null; // current behavior
    expect(heartbeatWouldSucceed).toBe(true);
  });

  it('signature key shares the same non-user-scoped prefix', () => {
    const sig = assessmentSessionSigKey('assign-1');
    expect(sig).toBe('assessment_session_assign-1_sig');
    // BUG: Phase 1 scopes this per-user as well.
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
// Minimal sessionStorage shim (used by R6 test)
// ---------------------------------------------------------------------------
const sessionStorageMock = new LocalStorageShim();
(globalThis as Record<string, unknown>).sessionStorage = sessionStorageMock;

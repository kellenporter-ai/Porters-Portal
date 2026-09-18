/**
 * Regression: resubmit-gate error surfacing in Proctor.requestToken.
 *
 * `failed-precondition` is overloaded on the server:
 *  - PLAIN-STRING message  → permanent, actionable gate (e.g. prior attempt
 *    still being graded). Must NOT retry; server text must reach the student.
 *  - JSON-string envelope   → transient session-expiry shape ({message,
 *    hasUnsavedWork, hint}). Must keep the existing retry behavior.
 *
 * Classifier contract (encoded in components/Proctor.tsx):
 *   code === 'failed-precondition' AND payload (message after stripping any
 *   "functions/..." prefix) does NOT parse as a {…} JSON envelope
 *     → surface via proctor.session.tokenBlocked, return immediately (0 retries).
 *   Otherwise (JSON envelope, or any other transient code)
 *     → existing retry loop (MAX_RETRIES = 3 with 1s/2s/4s backoff).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// localStorage / sessionStorage shims (node env — happy-dom storage is
// unavailable in this runner; same shim pattern as persistent-save tests)
// ---------------------------------------------------------------------------
class StorageShim {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
  get length() { return this.store.size; }
  key(i: number) { return [...this.store.keys()][i] ?? null; }
}
const g = globalThis as Record<string, unknown>;
if (typeof g.localStorage === 'undefined') g.localStorage = new StorageShim();
if (typeof g.sessionStorage === 'undefined') g.sessionStorage = new StorageShim();

// ---------------------------------------------------------------------------
// Module mocks — firebase boundary
// ---------------------------------------------------------------------------
const callStartAssessmentSessionMock = vi.fn();
const callHeartbeatMock = vi.fn();
const callStartResourceSessionMock = vi.fn();
const callAwardQuestionXPMock = vi.fn();

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({})), onAuthStateChanged: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  collection: vi.fn(() => ({})), addDoc: vi.fn(async () => ({ id: 'x' })),
  query: vi.fn(() => ({})), where: vi.fn(() => ({})), orderBy: vi.fn(() => ({})), limit: vi.fn(() => ({})), getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  onSnapshot: vi.fn(() => () => {}),
}));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn() }));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(() => ({})), ref: vi.fn(() => ({})), getDownloadURL: vi.fn(async () => '') }));
vi.mock('firebase/analytics', () => ({ getAnalytics: vi.fn(() => ({})), logEvent: vi.fn() }));

vi.mock('../firebase', () => ({
  db: {},
  callStartAssessmentSession: (...args: unknown[]) => callStartAssessmentSessionMock(...args),
  callHeartbeat: (...args: unknown[]) => callHeartbeatMock(...args),
  callStartResourceSession: (...args: unknown[]) => callStartResourceSessionMock(...args),
  callAwardQuestionXP: (...args: unknown[]) => callAwardQuestionXPMock(...args),
}));

vi.mock('../errorReporting', () => ({ reportError: vi.fn(), extractFirebaseErrorCode: (err: unknown) => {
  if (err && typeof err === 'object') {
    const code = (err as Record<string, unknown>).code;
    if (typeof code === 'string') return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
  }
  return 'unknown';
} }));

// ProctorTTS uses SpeechSynthesis — stub it out entirely.
vi.mock('../../components/ProctorTTS', () => ({ default: () => null }));

import Proctor from '../../components/Proctor';
import { ToastProvider } from '../../components/ToastProvider';
import { LocaleProvider } from '../i18n';

/** Minimal required props for an assessment Proctor mount. */
function proctorProps(overrides: Record<string, unknown> = {}) {
  return {
    onComplete: vi.fn(),
    isAssessment: true,
    assignmentId: 'a1',
    userId: 'u1',
    lessonBlocks: [],
    onSessionToken: vi.fn(),
    ...overrides,
  };
}

/** Render Proctor (wrapped in ToastProvider + LocaleProvider) and wait for the token-request effect to settle. */
async function mountAndSettle(overrides: Record<string, unknown> = {}) {
  const utils = render(
    React.createElement(LocaleProvider, null,
      React.createElement(ToastProvider, null,
        React.createElement(Proctor, proctorProps(overrides))))
  );
  // Let the fire-and-forget requestToken effect run its first attempt.
  await waitFor(() => expect(callStartAssessmentSessionMock).toHaveBeenCalled());
  return utils;
}

describe('Proctor.requestToken — failed-precondition payload-shape classifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('plain-string failed-precondition: no retry, server message surfaced verbatim', async () => {
    const serverMsg = 'Your previous attempt is still being graded. Wait for your teacher to return it, then start a new attempt.';
    callStartAssessmentSessionMock.mockRejectedValue({
      code: 'functions/failed-precondition',
      message: `functions/failed-precondition: ${serverMsg}`,
    });

    const { findByText } = await mountAndSettle();

    // Exactly ONE call — the classifier must short-circuit the retry loop.
    expect(callStartAssessmentSessionMock).toHaveBeenCalledTimes(1);

    // Server text reaches the student via the existing sessionTokenError banner.
    const banner = await findByText(new RegExp(serverMsg.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(banner).toBeTruthy();
  });

  it('JSON-envelope failed-precondition (session expiry): retries then shows generic tokenError', async () => {
    const envelope = JSON.stringify({
      message: 'Your session has expired, but your answers are still saved. Refresh the page to start a new attempt and your work will be restored.',
      hasUnsavedWork: true,
    });
    callStartAssessmentSessionMock.mockRejectedValue({
      code: 'functions/failed-precondition',
      message: `functions/failed-precondition: ${envelope}`,
    });

    // Mount with FAKE timers already active: the fire-and-forget requestToken
    // effect runs its first attempt synchronously on mount, so mountAndSettle's
    // waitFor sees call #1 fire inside the same tick.
    vi.useFakeTimers();
    const { findByText, unmount } = render(
      React.createElement(LocaleProvider, null,
        React.createElement(ToastProvider, null,
          React.createElement(Proctor, proctorProps())))
    );
    // Flush the mount effects + first attempt microtasks under fake time.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(callStartAssessmentSessionMock).toHaveBeenCalledTimes(1);

    // Fast-forward the 1s + 2s + 4s backoff sleeps between attempts 2 and 3.
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    vi.useRealTimers();

    // All 3 attempts consumed — JSON envelope stays on the retry path.
    expect(callStartAssessmentSessionMock).toHaveBeenCalledTimes(3);

    // Generic transient-failure message (not the resubmit-gate wrapper).
    const generic = await findByText(/check your internet connection|revisa tu conexión/i);
    expect(generic).toBeTruthy();
    unmount();
  });

  it('other transient codes (e.g. unavailable): still retry', async () => {
    callStartAssessmentSessionMock.mockRejectedValue({ code: 'functions/unavailable', message: 'functions/unavailable: backend down' });

    vi.useFakeTimers();
    const { unmount } = render(
      React.createElement(LocaleProvider, null,
        React.createElement(ToastProvider, null,
          React.createElement(Proctor, proctorProps())))
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(callStartAssessmentSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    vi.useRealTimers();
    expect(callStartAssessmentSessionMock).toHaveBeenCalledTimes(3);
    unmount();
  });
});

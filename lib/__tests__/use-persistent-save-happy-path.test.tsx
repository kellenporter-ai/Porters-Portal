// @vitest-environment happy-dom
/**
 * Phase 0 — happy-path coverage for lib/usePersistentSave.ts.
 * Debounced save → Firestore → draft rewritten dirty:false; offline failure
 * retains dirty draft; reconnect triggers dirty sync.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import Storage from 'happy-dom/lib/storage/Storage.js';

// Node 22's experimental localStorage (undefined without --localstorage-file)
// shadows happy-dom's global. Restore it explicitly.
(globalThis as Record<string, unknown>).localStorage = new Storage();

const updateDocMock = vi.fn();
const setDocMock = vi.fn();
const getDocMock = vi.fn();
const docMock = vi.fn((...args: unknown[]) => ({ collection: args[1] as string, id: args[2] as string }));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../errorReporting', () => ({ reportError: vi.fn() }));

import { usePersistentSave } from '../usePersistentSave';

const DEBOUNCE_MS = 1500;

function setup(onResponsesChange = vi.fn()) {
  return renderHook(() =>
    usePersistentSave({
      userId: 'u1',
      assignmentId: 'a1',
      sessionToken: 'tok-123',
      onResponsesChange,
    }),
  );
}

describe('usePersistentSave happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces saves and marks the draft clean after Firestore success', async () => {
    updateDocMock.mockResolvedValue(undefined);

    const { result } = setup();
    act(() => result.current.updateResponse('b1', 'answer'));

    // Draft is written synchronously with dirty:true
    const rawBefore = localStorage.getItem('draft_u1_a1');
    expect(rawBefore).not.toBeNull();
    expect(JSON.parse(rawBefore!).dirty).toBe(true);

    // No Firestore write before the debounce elapses
    expect(updateDocMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe('saved');

    const rawAfter = localStorage.getItem('draft_u1_a1');
    expect(JSON.parse(rawAfter!).dirty).toBe(false);
  });

  it('retains a dirty draft when the Firestore write fails (offline)', async () => {
    const err = Object.assign(new Error('network error'), { code: 'unavailable' });
    updateDocMock.mockRejectedValue(err);
    setDocMock.mockRejectedValue(err);

    // Stable callback identity — an inline vi.fn() recreated per render would
    // re-trigger the mount-recovery effect on every status change, spawning
    // overlapping persistentWrite pipelines that keep overwriting 'error'
    // with 'retrying' forever.
    const onResponsesChange = vi.fn();
    const { result } = setup(onResponsesChange);
    act(() => result.current.updateResponse('b1', 'offline answer'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    // Flush bounded retry/backoff windows (MAX_RETRIES × exponential delays)
    // without racing the 30s background interval — runAllTimersAsync would
    // loop forever against the interval. 30s steps clear the 10s
    // WRITE_TIMEOUT_MS race per attempt plus the 2s/4s/8s backoff ladder.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
    }

    expect(result.current.saveStatus).toBe('error');
    const draft = JSON.parse(localStorage.getItem('draft_u1_a1')!);
    expect(draft.dirty).toBe(true);
    expect(draft.data.responses.b1).toBe('offline answer');
  });

  it('syncs a dirty draft on mount (reconnect scenario)', async () => {
    // Pre-seed a dirty draft from a previous offline session
    const draftData = {
      userId: 'u1',
      assignmentId: 'a1',
      responses: { b1: 'restored work' },
      lastUpdated: 't0',
      sessionToken: 'tok-123',
    };
    localStorage.setItem('draft_u1_a1', JSON.stringify({ data: draftData, timestamp: 't0', dirty: true }));

    getDocMock.mockResolvedValue({ exists: () => false });
    updateDocMock.mockResolvedValue(undefined);

    const { result } = setup();

    // Mount recovery fires immediately
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Draft responses are published to the parent
    expect(result.current.getResponses()).toEqual({ b1: 'restored work' });

    // Flush mount-recovery sync + bounded retry windows without racing the
    // 30s background interval.
    for (let i = 0; i < 25; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    const draft = JSON.parse(localStorage.getItem('draft_u1_a1')!);
    expect(draft.dirty).toBe(false);
  });

  it('flushNow bypasses the debounce', async () => {
    updateDocMock.mockResolvedValue(undefined);

    const { result } = setup();
    act(() => result.current.updateResponse('b1', 'x'));

    let status: string | undefined;
    await act(async () => {
      status = await result.current.flushNow();
    });

    expect(status).toBe('saved');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });
});

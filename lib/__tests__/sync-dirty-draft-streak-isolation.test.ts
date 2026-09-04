/**
 * F3 — per-lsKey permission-denied streak isolation for syncDirtyDraft (R4).
 * Denials counted against draft-A must NOT trip the session-invalid threshold
 * for an unrelated draft-B key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Node-environment shim: persistentWrite dispatches events on `window`.
class WindowShim {
  private listeners = new Map<string, Set<EventListener>>();
  addEventListener(type: string, cb: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: EventListener) {
    this.listeners.get(type)?.delete(cb);
  }
  dispatchEvent(e: Event) {
    this.listeners.get(e.type)?.forEach((cb) => cb(e));
    return true;
  }
}
(globalThis as Record<string, unknown>).window = new WindowShim();

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

import { syncDirtyDraft, __resetSyncErrorTracking, MAX_CONSECUTIVE_PERM_DENIES } from '../persistentWrite';

const PERM_DENIED = Object.assign(new Error('permission-denied'), { code: 'permission-denied' });

function seedDirtyDraft(lsKey: string) {
  localStorage.setItem(lsKey, JSON.stringify({
    data: { userId: 'u1', assignmentId: 'a1', responses: { b1: 'x' }, lastUpdated: 't0' },
    timestamp: 't0',
    dirty: true,
  }));
}

describe('syncDirtyDraft per-lsKey permission-denied streak isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    __resetSyncErrorTracking();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not trip draft B\'s threshold from draft A\'s denials', async () => {
    const events: string[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail?.lsKey ?? 'none');
    window.addEventListener('portal-assessment-session-invalid', listener);

    // Draft A denied MAX times (server doc exists but older → write attempted).
    // Both updateDoc and the setDoc fallback must reject — persistentWrite
    // falls back to setDoc when updateDoc fails.
    getDocMock.mockResolvedValue({ exists: () => false });
    updateDocMock.mockRejectedValue(PERM_DENIED);
    setDocMock.mockRejectedValue(PERM_DENIED);

    for (let i = 0; i < MAX_CONSECUTIVE_PERM_DENIES; i++) {
      seedDirtyDraft('draft_u1_a1');
      const p = syncDirtyDraft('draft_u1_a1', 'lesson_block_responses', 'u1_a1_blocks');
      await vi.runAllTimersAsync();
      await p;
    }
    expect(events).toEqual(['draft_u1_a1']);

    // Draft B: first denial — must NOT fire (its own streak is only 1)
    events.length = 0;
    seedDirtyDraft('draft_u2_a2');
    const pB = syncDirtyDraft('draft_u2_a2', 'lesson_block_responses', 'u2_a2_blocks');
    await vi.runAllTimersAsync();
    await pB;
    expect(events).toEqual([]);

    // Draft B second denial — now its own threshold fires for B only
    seedDirtyDraft('draft_u2_a2');
    const pB2 = syncDirtyDraft('draft_u2_a2', 'lesson_block_responses', 'u2_a2_blocks');
    await vi.runAllTimersAsync();
    await pB2;
    expect(events).toEqual(['draft_u2_a2']);

    window.removeEventListener('portal-assessment-session-invalid', listener);
  });

  it('a saved sync resets the streak for that key', async () => {
    const events: string[] = [];
    window.addEventListener('portal-assessment-session-invalid', () => events.push('fired'));

    getDocMock.mockResolvedValue({ exists: () => false });
    updateDocMock.mockRejectedValueOnce(PERM_DENIED).mockResolvedValueOnce(undefined);

    seedDirtyDraft('draft_u1_a1');
    const p1 = syncDirtyDraft('draft_u1_a1', 'lesson_block_responses', 'u1_a1_blocks');
    await vi.runAllTimersAsync();
    await p1;

    // Streak = 1. Next attempt succeeds → streak reset.
    seedDirtyDraft('draft_u1_a1');
    const p2 = syncDirtyDraft('draft_u1_a1', 'lesson_block_responses', 'u1_a1_blocks');
    await vi.runAllTimersAsync();
    await p2;
    expect(events).toEqual([]);

    // Two more denials needed to re-fire (streak started over).
    // Reset both mocks — the mockRejectedValueOnce queue is exhausted and would
    // otherwise resolve (saved sync resets the streak again mid-loop).
    updateDocMock.mockReset().mockRejectedValue(PERM_DENIED);
    setDocMock.mockReset().mockRejectedValue(PERM_DENIED);
    for (let i = 0; i < MAX_CONSECUTIVE_PERM_DENIES; i++) {
      seedDirtyDraft('draft_u1_a1');
      const p = syncDirtyDraft('draft_u1_a1', 'lesson_block_responses', 'u1_a1_blocks');
      await vi.runAllTimersAsync();
      await p;
    }
    // The threshold fires on EVERY denial at/above the streak — both iterations fire.
    expect(events).toEqual(['fired', 'fired']);
    window.removeEventListener('portal-assessment-session-invalid', () => {});
  });
});

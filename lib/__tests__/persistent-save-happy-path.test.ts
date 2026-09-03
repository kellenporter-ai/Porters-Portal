/**
 * Phase 0 — happy-path coverage for lib/persistentWrite.ts.
 * Protects the debounced-save pipeline against Phase 1 regressions.
 * Firestore is mocked at the firebase/firestore module boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage shim (node env)
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
// Mock firebase/firestore at the module boundary
// ---------------------------------------------------------------------------
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

// Silence reportError
vi.mock('../errorReporting', () => ({ reportError: vi.fn() }));

import { persistentWrite, syncDirtyDraft, readDraft, draftKey } from '../persistentWrite';

describe('persistentWrite happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses dot-notation updateDoc for response fields on success', async () => {
    updateDocMock.mockResolvedValueOnce(undefined);

    const status = await persistentWrite(
      'lesson_block_responses',
      'u1_a1_blocks',
      { userId: 'u1', assignmentId: 'a1', responses: { b1: 'x', b2: 'y' }, lastUpdated: 't' },
      'draft_u1_a1',
    );

    expect(status).toBe('saved');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const dotNotation = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(dotNotation['responses.b1']).toBe('x');
    expect(dotNotation['responses.b2']).toBe('y');
    expect(dotNotation['userId']).toBe('u1');
    expect(dotNotation['responses']).toBeUndefined();
  });

  it('marks the localStorage draft clean after a successful save', async () => {
    updateDocMock.mockResolvedValueOnce(undefined);

    await persistentWrite(
      'lesson_block_responses',
      'u1_a1_blocks',
      { userId: 'u1', assignmentId: 'a1', responses: { b1: 'x' }, lastUpdated: 't' },
      'draft_u1_a1',
    );

    const draft = readDraft('draft_u1_a1');
    expect(draft?.dirty).toBe(false);
  });

  it('falls back to setDoc when updateDoc fails because the doc does not exist', async () => {
    updateDocMock.mockRejectedValueOnce(new Error('No document to update'));
    setDocMock.mockResolvedValueOnce(undefined);

    const data = { userId: 'u1', assignmentId: 'a1', responses: { b1: 'x' }, lastUpdated: 't' };
    const status = await persistentWrite('lesson_block_responses', 'u1_a1_blocks', data, 'draft_u1_a1');

    expect(status).toBe('saved');
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0][2]).toEqual({ merge: true });
  });

  it('keeps the draft dirty after all retries are exhausted (offline failure)', async () => {
    const err = Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    updateDocMock.mockRejectedValue(err);
    setDocMock.mockRejectedValue(err);

    const data = { userId: 'u1', assignmentId: 'a1', responses: { b1: 'x' }, lastUpdated: 't' };
    const promise = persistentWrite('lesson_block_responses', 'u1_a1_blocks', data, 'draft_u1_a1');

    // Flush the retry backoff timers (2s, 4s, 8s)
    await vi.runAllTimersAsync();
    const status = await promise;

    expect(status).toBe('error');
    const draft = readDraft('draft_u1_a1');
    expect(draft?.dirty).toBe(true);
    expect(draft?.data).toEqual(data);
  });
});

describe('syncDirtyDraft happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs a dirty draft to Firestore on reconnect (offline → online)', async () => {
    // Seed a dirty draft (simulates a write that failed while offline)
    const draftData = { userId: 'u1', assignmentId: 'a1', responses: { b1: 'offline work' }, lastUpdated: 't0' };
    localStorage.setItem('draft_u1_a1', JSON.stringify({ data: draftData, timestamp: 't0', dirty: true }));

    // Server doc does not exist → sync writes it
    getDocMock.mockResolvedValueOnce({ exists: () => false });
    updateDocMock.mockResolvedValueOnce(undefined);

    const synced = await syncDirtyDraft('draft_u1_a1', 'lesson_block_responses', 'u1_a1_blocks');

    expect(synced).toBe(true);
    const draft = readDraft('draft_u1_a1');
    expect(draft?.dirty).toBe(false);
  });

  it('discards a dirty draft when the server copy is newer and has data', async () => {
    const draftData = { userId: 'u1', assignmentId: 'a1', responses: { b1: 'old' }, lastUpdated: 't0' };
    localStorage.setItem('draft_u1_a1', JSON.stringify({ data: draftData, timestamp: 't0', dirty: true }));

    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ lastUpdated: 't9', responses: { b1: 'server-newer' } }),
    });

    const synced = await syncDirtyDraft('draft_u1_a1', 'lesson_block_responses', 'u1_a1_blocks');

    expect(synced).toBe(false);
    // Draft marked clean (server is authoritative) but NOT written to Firestore
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(readDraft('draft_u1_a1')?.dirty).toBe(false);
  });

  it('returns false when there is no dirty draft', async () => {
    const synced = await syncDirtyDraft('draft_u1_a1', 'lesson_block_responses', 'u1_a1_blocks');
    expect(synced).toBe(false);
    expect(getDocMock).not.toHaveBeenCalled();
  });
});

describe('draftKey', () => {
  it('builds the expected scoped key', () => {
    expect(draftKey('draft', 'u1', 'a1')).toBe('draft_u1_a1');
  });
});

/**
 * Phase 1d — flipped bug-reproduction tests for R7, R9, R10.
 *
 *  - R7:  Save & Exit raced flushNow() against a flat 10s timeout even though
 *         persistentWrite's worst case is 3 retries × (10s attempt + backoff)
 *         ≈ 44s — the "save failed" modal could appear while the save was
 *         still retrying and would later succeed. (Component-level constant;
 *         asserted here as a source invariant.)
 *  - R9:  evictOldestDrafts evicted the oldest draft_/practice_ entries on
 *         quota pressure — including dirty:true entries (unsynced work that
 *         never reached Firestore). FIXED: dirty entries are never evicted;
 *         clean-first ordering; a portal-storage-full warning is dispatched
 *         when only dirty entries remain.
 *  - R10: persistentWrite only merged responses.{blockId} — a response removed
 *         client-side lingered server-side forever, and a blockId containing
 *         '.' corrupted the Firestore field path. FIXED: removals are
 *         tombstoned and written as FieldValue.delete(); dotted blockIds are
 *         rejected with an error report.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Minimal window stub for CustomEvent dispatch (node env)
(globalThis as Record<string, unknown>).window = {
  dispatchEvent: vi.fn(),
};

const updateDocMock = vi.fn();
const setDocMock = vi.fn();
const getDocMock = vi.fn();
const docMock = vi.fn((...args: unknown[]) => ({ collection: args[1] as string, id: args[2] as string }));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  deleteField: () => ({ _deleteFieldSentinel: true }),
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../errorReporting', () => ({ reportError: vi.fn() }));

import {
  persistentWrite,
  writeDraft,
  readDraft,
  isResponseTombstone,
} from '../persistentWrite';
import { reportError } from '../errorReporting';

const flushLocalStorage = () => {
  (window.dispatchEvent as ReturnType<typeof vi.fn>).mockClear();
};

// ---------------------------------------------------------------------------
// R10 — dot-notation merge never deletes + blockId validation
// ---------------------------------------------------------------------------
describe('R10: dot-notation merge never deletes (FIXED)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    flushLocalStorage();
  });

  it('tombstoned responses are written as deleteField(), not merged', async () => {
    updateDocMock.mockResolvedValueOnce(undefined);

    const status = await persistentWrite(
      'lesson_block_responses',
      'u1_a1_blocks',
      {
        userId: 'u1',
        assignmentId: 'a1',
        responses: {
          b1: 'kept',
          b2: { __delete__: true, blockId: 'b2' },
        },
        lastUpdated: 't',
      },
      'draft_u1_a1',
    );

    expect(status).toBe('saved');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const dotNotation = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(dotNotation['responses.b1']).toBe('kept');
    expect(dotNotation['responses.b2']).toEqual({ _deleteFieldSentinel: true });
  });

  it('setDoc fallback strips tombstones (a new doc has no stale keys to delete)', async () => {
    updateDocMock.mockRejectedValueOnce(new Error('No document to update'));
    setDocMock.mockResolvedValueOnce(undefined);

    const status = await persistentWrite(
      'lesson_block_responses',
      'u1_a1_blocks',
      {
        userId: 'u1',
        assignmentId: 'a1',
        responses: {
          b1: 'kept',
          b2: { __delete__: true, blockId: 'b2' },
        },
        lastUpdated: 't',
      },
      'draft_u1_a1',
    );

    expect(status).toBe('saved');
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const fallbackData = setDocMock.mock.calls[0][1] as { responses: Record<string, unknown> };
    expect(fallbackData.responses.b1).toBe('kept');
    expect(fallbackData.responses.b2).toBeUndefined();
    // The tombstone sentinel must NOT leak into the setDoc payload.
    expect(JSON.stringify(fallbackData.responses)).not.toContain('__delete__');
  });

  it('clean localStorage draft strips tombstones after a successful save', async () => {
    updateDocMock.mockResolvedValueOnce(undefined);

    await persistentWrite(
      'lesson_block_responses',
      'u1_a1_blocks',
      {
        userId: 'u1',
        assignmentId: 'a1',
        responses: {
          b1: 'kept',
          b2: { __delete__: true, blockId: 'b2' },
        },
        lastUpdated: 't',
      },
      'draft_u1_a1',
    );

    const draft = readDraft<{ responses: Record<string, unknown> }>('draft_u1_a1');
    expect(draft?.dirty).toBe(false);
    expect(Object.keys(draft?.data.responses ?? {})).toEqual(['b1']);
  });

  it('a blockId containing "." is rejected — never written, error reported', async () => {
    updateDocMock.mockResolvedValueOnce(undefined);

    const status = await persistentWrite(
      'lesson_block_responses',
      'u1_a1_blocks',
      {
        userId: 'u1',
        assignmentId: 'a1',
        responses: {
          'bad.id': 'would corrupt the field path',
          good: 'kept',
        },
        lastUpdated: 't',
      },
      'draft_u1_a1',
    );

    expect(status).toBe('saved');
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ method: 'persistentWrite', blockId: 'bad.id' }),
    );
    const dotNotation = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(dotNotation['responses.bad.id']).toBeUndefined();
    expect(dotNotation['responses.good']).toBe('kept');
  });

  it('isResponseTombstone narrows correctly', () => {
    expect(isResponseTombstone({ __delete__: true, blockId: 'b1' })).toBe(true);
    expect(isResponseTombstone({ __delete__: false, blockId: 'b1' })).toBe(false);
    expect(isResponseTombstone({ __delete__: true })).toBe(false);
    expect(isResponseTombstone('plain')).toBe(false);
    expect(isResponseTombstone(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R9 — localStorage eviction never deletes dirty drafts
// ---------------------------------------------------------------------------
describe('R9: eviction never deletes unsynced (dirty) drafts (FIXED)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    flushLocalStorage();
  });

  // writeDraft is the public path that triggers eviction on quota pressure;
  // we simulate the quota error by pre-filling localStorage to capacity via
  // a stubbed setItem that throws once, then succeeds after eviction.

  it('clean entries are evicted oldest-first; dirty entries are never evicted', () => {
    // Seed drafts: 4 clean (different timestamps) + 2 dirty.
    const mk = (ts: string, dirty: boolean, key: string) =>
      localStorage.setItem(key, JSON.stringify({ data: {}, timestamp: ts, dirty }));

    mk('2024-01-01T00:00:00Z', false, 'draft_u_old_clean');
    mk('2024-01-02T00:00:00Z', false, 'draft_u_mid_clean');
    mk('2024-01-03T00:00:00Z', true, 'draft_u_dirty_a');
    mk('2024-01-04T00:00:00Z', false, 'draft_u_new_clean');
    mk('2024-01-05T00:00:00Z', true, 'practice_u_dirty_b');
    mk('2024-01-06T00:00:00Z', false, 'draft_u_newest_clean');

    // Simulate quota eviction by calling the internal path through writeDraft:
    // monkey-patch setItem to throw QuotaExceededError exactly once.
    const originalSetItem = localStorage.setItem.bind(localStorage);
    let throws = true;
    localStorage.setItem = ((k: string, v: string) => {
      if (throws) {
        throws = false;
        const err = new DOMException('quota', 'QuotaExceededError');
        throw err;
      }
      originalSetItem(k, v);
    }) as typeof localStorage.setItem;

    writeDraft('draft_u_protected', { responses: {} }, true);

    // Oldest 3 CLEAN entries evicted (up to 3 per eviction pass).
    expect(localStorage.getItem('draft_u_old_clean')).toBeNull();
    expect(localStorage.getItem('draft_u_mid_clean')).toBeNull();
    expect(localStorage.getItem('draft_u_new_clean')).toBeNull();

    // Dirty entries and the newest clean entry survive.
    expect(localStorage.getItem('draft_u_dirty_a')).not.toBeNull();
    expect(localStorage.getItem('practice_u_dirty_b')).not.toBeNull();
    expect(localStorage.getItem('draft_u_newest_clean')).not.toBeNull();

    // The write itself succeeded after eviction.
    expect(readDraft('draft_u_protected')).not.toBeNull();
  });

  it('dispatches portal-storage-full when only dirty entries remain (evicts nothing)', () => {
    localStorage.setItem('draft_u_dirty_a', JSON.stringify({ data: {}, timestamp: 't1', dirty: true }));
    localStorage.setItem('practice_u_dirty_b', JSON.stringify({ data: {}, timestamp: 't2', dirty: true }));

    const originalSetItem = localStorage.setItem.bind(localStorage);
    let throws = true;
    localStorage.setItem = ((k: string, v: string) => {
      if (throws) {
        throws = false;
        throw new DOMException('quota', 'QuotaExceededError');
      }
      originalSetItem(k, v);
    }) as typeof localStorage.setItem;

    writeDraft('draft_u_protected', { responses: {} }, true);

    // Nothing evictable → both dirty entries survive.
    expect(localStorage.getItem('draft_u_dirty_a')).not.toBeNull();
    expect(localStorage.getItem('practice_u_dirty_b')).not.toBeNull();

    // A warning was dispatched so the student knows to free space.
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'portal-storage-full' }),
    );
  });
});

// ---------------------------------------------------------------------------
// R7 — Save & Exit timeout covers persistentWrite's true worst case
// ---------------------------------------------------------------------------
describe('R7: Save & Exit timeout covers the true flush worst case (FIXED)', () => {
  it('ResourceViewer no longer uses a flat 10s flush timeout', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/ResourceViewer.tsx'),
      'utf-8',
    );
    // The race must cover MAX_RETRIES × (WRITE_TIMEOUT_MS + backoff) + margin.
    expect(src).toContain('FLUSH_TIMEOUT_MS');
    expect(src).not.toContain("setTimeout(() => res('timeout'), 10000)");
    // The authoritative result is the flush promise, not the timeout.
    expect(src).toContain("flushPromise ?? Promise.resolve('saved')");
  });

  it('the save-failed modal copy states work is preserved and will sync', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/ResourceViewer.tsx'),
      'utf-8',
    );
    expect(src).toContain('rv.saveFailed.body');
    // The modal copy now lives in the i18n dictionary (Phase 4b3) — assert the
    // EN dictionary keeps the Phase 1d promises verbatim.
    const en = readFileSync(resolve(__dirname, '../i18n/en.ts'), 'utf-8');
    expect(en).toContain('will sync to the server the next time you open this assignment');
    expect(en).toContain('nothing is lost');
  });
});

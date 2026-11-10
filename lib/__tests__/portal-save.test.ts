// @vitest-environment happy-dom
/**
 * portal-save.js — the storage layer for standalone activities.
 *
 * Loaded via vm sandbox against the shipped source, same as origin-guard, so the
 * tests exercise what actually deploys rather than a reimplementation.
 *
 * Priority: the reconciliation table. The failure that matters is a stale-but-
 * dirty draft winning by default and silently destroying newer work from another
 * device, so every branch of that table has a test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const SRC = readFileSync(resolve(__dirname, '../../public/portal-save.js'), 'utf8');

function load() {
  const store = new Map<string, string>();
  const localStorage = {
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  const sandbox = {
    window: { localStorage } as unknown,
    localStorage,
    console,
    TextEncoder,
    setTimeout,
    clearTimeout,
    fetch: async () => { throw new Error('no network in unit tests'); },
  };
  runInNewContext(SRC, sandbox);
  const api = (sandbox.window as { PortalSave: unknown }).PortalSave as {
    _internals: Record<string, any>;
  };
  return { api, store, internals: api._internals, localStorage };
}

const { api: _api, store: _store, internals, localStorage: sandboxStorage } = load();
const { reconcile, validatePayload, findRasterBlob, writeDraft, readDraft, clearDraft, draftKey } = internals;

const SERVER = (rev: number, payload = '{"n":1}', updateTime = 'ut-1') => ({ exists: true, rev, payload, updateTime });
const DRAFT = (dirty: boolean, baseRev = 0, payload = '{"n":2}', baseUpdateTime: string | null = 'ut-1') =>
  ({ dirty, baseRev, payload, baseUpdateTime, timestamp: 't' });

describe('reconcile — the table that prevents silent overwrite', () => {
  it('nothing on either side is a no-op', () => {
    expect(reconcile(null, { exists: false, rev: 0, payload: null }).action).toBe('nothing');
  });

  it('adopts the server copy when there is no local draft', () => {
    const r = reconcile(null, SERVER(3));
    expect(r.action).toBe('adopt');
    expect(r.rev).toBe(3);
  });

  it('adopts the server copy when the local draft is pristine', () => {
    // A clean draft is just a cache; it must never beat the server.
    expect(reconcile(DRAFT(false), SERVER(3)).action).toBe('adopt');
  });

  it('DISCARDS a clean cache when the server copy was deleted', () => {
    // Regression: a clean draft + no server doc used to fall into the dirty
    // branch and resurrect deleted work (an admin reset), spending a write.
    const r = reconcile(DRAFT(false), { exists: false, rev: 0, payload: null });
    expect(r.action).toBe('discard-cache');
  });

  it('ACKS when the server already holds exactly this payload', () => {
    // Resolves "did my timed-out write commit?" without a spurious conflict.
    const r = reconcile(DRAFT(true, 4, '{"n":5}'), SERVER(5, '{"n":5}'));
    expect(r.action).toBe('ack');
    expect(r.rev).toBe(5);
  });

  it('pushes a dirty draft when the server has nothing, as a create', () => {
    const r = reconcile(DRAFT(true), { exists: false, rev: 0, payload: null });
    expect(r).toMatchObject({ action: 'push', rev: 1, reason: 'first-save' });
    expect(r.expected).toEqual({ exists: false });
  });

  it('tags a push over a deleted doc so telemetry can see it', () => {
    const r = reconcile(DRAFT(true, 4), { exists: false, rev: 0, payload: null });
    expect(r.reason).toBe('server-deleted');
  });

  it('pushes a dirty draft when the server is still at the draft baseRev', () => {
    const r = reconcile(DRAFT(true, 4), SERVER(4));
    expect(r).toMatchObject({ action: 'push', rev: 5 });
    expect(r.expected).toEqual({ updateTime: 'ut-1' });
  });

  it('CONFLICTS when the server moved ahead of the draft baseRev', () => {
    // The case that silently destroys work if handled as "dirty wins".
    const r = reconcile(DRAFT(true, 4), SERVER(8));
    expect(r.action).toBe('conflict');
    expect(r.reason).toBe('server-ahead');
    expect(r.server.rev).toBe(8);
  });

  it('CONFLICTS when the rev matches but updateTime differs (ABA after delete+recreate)', () => {
    // rev is a counter and repeats after a delete; updateTime never does.
    const r = reconcile(DRAFT(true, 4, '{"n":2}', 'ut-old'), SERVER(4, '{"n":1}', 'ut-NEW'));
    expect(r.action).toBe('conflict');
  });

  it('CONFLICTS when the server rev went backwards (never trust either side)', () => {
    const r = reconcile(DRAFT(true, 9), SERVER(2));
    expect(r.action).toBe('conflict');
    expect(r.reason).toBe('rev-regressed');
  });

  it('a dirty draft with an unknown baseRev conflicts rather than pushing', () => {
    // baseRev missing (e.g. a legacy bridged draft) must not auto-win.
    expect(reconcile({ dirty: true, payload: '{}', timestamp: 't' }, SERVER(5)).action).toBe('conflict');
  });
});

describe('payload guards', () => {
  it('accepts ordinary activity state', () => {
    expect(validatePayload(JSON.stringify({ answers: [1, 2, 3], notes: 'hi' }))).toBeNull();
  });

  it('accepts vector drawing state (the Portal DRAWING block format)', () => {
    // Drawings are DrawingElement[] JSON, not images — they must sync.
    const drawing = JSON.stringify({
      elements: [
        { type: 'line', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], color: '#000' },
        { type: 'text', position: { x: 10, y: 10 }, text: 'F = ma', fontSize: 16 },
      ],
      submitted: true,
    });
    expect(validatePayload(drawing)).toBeNull();
  });

  it('rejects a large pasted raster image and says NOTHING is saved', () => {
    const png = 'data:image/png;base64,' + 'A'.repeat(5000);
    const r = validatePayload(JSON.stringify({ img: png }));
    // Honesty: rejecting the payload means nothing saves, not "images don't save".
    expect(r).toMatch(/NOT being saved/);
  });

  it('rejects an oversized payload with a size-bearing message', () => {
    const big = JSON.stringify({ blob: 'x'.repeat(250000) });
    const r = validatePayload(big);
    expect(r).toMatch(/too large to save/);
  });

  it('rejects a non-string payload', () => {
    expect(validatePayload({ not: 'a string' } as unknown as string)).toMatch(/JSON string/);
  });

  it('does not flag a short data:image reference (e.g. a legend sprite)', () => {
    expect(findRasterBlob('{"icon":"data:image/png;base64,AAAA"}')).toBe(false);
  });
});

describe('draft store', () => {
  it('keys drafts by uid + activity so accounts never cross-load', () => {
    expect(draftKey('act1', 'uidA')).not.toBe(draftKey('act1', 'uidB'));
    expect(draftKey('act1', 'uidA')).toBe(draftKey('act1', 'uidA'));
  });

  it('REFUSES an anonymous draft (shared Chromebooks would hand it to the next student)', () => {
    expect(() => draftKey('act1', '')).toThrow(/requires a uid/);
    expect(writeDraft('act1', '', '{"a":1}', true, 1)).toBe(false);
    expect(readDraft('act1', '')).toBeNull();
  });

  it('uses a single shared prefix so quota handling can find them', () => {
    expect(draftKey('act1', 'uidA').startsWith('pp:v1:')).toBe(true);
  });

  it('round-trips a draft including dirty, baseRev and baseUpdateTime', () => {
    writeDraft('act1', 'uidA', '{"a":1}', true, 3, 'ut-9');
    const d = readDraft('act1', 'uidA');
    expect(d).toMatchObject({ payload: '{"a":1}', dirty: true, baseRev: 3, baseUpdateTime: 'ut-9' });
  });

  it('clears a draft after the server acknowledges it', () => {
    writeDraft('act1', 'uidA', '{"a":1}', true, 3);
    clearDraft('act1', 'uidA');
    expect(readDraft('act1', 'uidA')).toBeNull();
  });

  it('returns null on corrupt JSON rather than throwing', () => {
    sandboxStorage.setItem(draftKey('act1', 'uidA'), '{not json');
    expect(readDraft('act1', 'uidA')).toBeNull();
  });

  it('reports a failed write instead of swallowing quota errors', () => {
    const original = sandboxStorage.setItem;
    sandboxStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    const ok = writeDraft('act1', 'uidA', '{"a":1}', true, 1);
    sandboxStorage.setItem = original;
    expect(ok).toBe(false);
  });
});

describe('write wire format (the blocker Opus caught)', () => {
  it('rejects a malformed activityId before it reaches the network', async () => {
    const api = load().api as unknown as { serverCommit: (...a: any[]) => Promise<any> };
    const r = await api.serverCommit('tok', 'uidA', '../evil', '{}', 1, 1, { exists: false });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalid activityId/);
  });

  it('never puts updatedAt in the update mask and always sends a REQUEST_TIME transform', () => {
    // A client timestamp can NEVER equal request.time, so a PATCH carrying one is
    // denied 100% of the time. The mask + transform pair is the actual fix, and it
    // is asserted here against the shipped source because the emulator is absent.
    const src = readFileSync(resolve(__dirname, '../../public/portal-save.js'), 'utf8');
    expect(src).toMatch(/setToServerValue:\s*'REQUEST_TIME'/);
    expect(src).toMatch(/updateMask:\s*\{\s*fieldPaths:\s*\['payload',\s*'rev',\s*'schemaVersion'\]\s*\}/);
    // No client-generated timestamp may be written into the doc.
    expect(src).not.toMatch(/updatedAt:\s*\{\s*timestampValue/);
    // Writes go through :commit, which supports transforms + preconditions together.
    expect(src).toMatch(/documents:commit/);
  });

  it('sends an exists:false precondition for creates and updateTime for updates', () => {
    const src = readFileSync(resolve(__dirname, '../../public/portal-save.js'), 'utf8');
    expect(src).toMatch(/currentDocument = \{ exists: false \}/);
    expect(src).toMatch(/currentDocument = \{ updateTime: expected\.updateTime \}/);
  });
});

describe('cost invariant', () => {
  it('enforces a hard 30s floor on writes', () => {
    expect(internals.HARD_FLOOR_MS).toBe(30000);
  });

  it('debounces well inside the floor', () => {
    expect(internals.DEBOUNCE_MS).toBeLessThan(internals.HARD_FLOOR_MS);
  });

  it('caps payloads to match the firestore.rules limit', () => {
    expect(internals.MAX_PAYLOAD_BYTES).toBe(200000);
  });

  it('the floor is a real scheduler gate, not just a constant', () => {
    // A constant assertion passes even if nothing enforces it. This drives the
    // scheduler's decision function directly.
    const { decideSchedule } = internals;

    // First write of a session is debounced off the edit, well under the floor.
    const first = decideSchedule(1000, null, 1000);
    expect(first.fireAt).toBe(1000 + internals.DEBOUNCE_MS);

    // A second write immediately after one lands must wait out the full floor.
    const soon = decideSchedule(31000, 30000, 31000);
    expect(soon.fireAt).toBe(30000 + internals.HARD_FLOOR_MS);
    expect(soon.reason).toBe('floor');

    // Once past the floor, the debounce is what governs.
    const later = decideSchedule(60000, 30000, 60000);
    expect(later.fireAt).toBe(60000 + internals.DEBOUNCE_MS);
    expect(later.reason).toBe('debounce');

    // The floor can never be violated regardless of how recent the edit is.
    for (const now of [30001, 31000, 59000]) {
      const s = decideSchedule(now, 30000, now);
      expect(s.fireAt).toBeGreaterThanOrEqual(30000 + internals.HARD_FLOOR_MS);
    }
  });
});

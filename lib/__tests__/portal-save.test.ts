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

const SERVER = (rev: number, payload = '{"n":1}') => ({ exists: true, rev, payload });
const DRAFT = (dirty: boolean, baseRev = 0, payload = '{"n":2}') => ({ dirty, baseRev, payload, timestamp: 't' });

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

  it('pushes a dirty draft when the server has nothing', () => {
    expect(reconcile(DRAFT(true), { exists: false, rev: 0, payload: null })).toEqual({ action: 'push', rev: 1 });
  });

  it('pushes a dirty draft when the server is still at the draft baseRev', () => {
    expect(reconcile(DRAFT(true, 4), SERVER(4))).toEqual({ action: 'push', rev: 5 });
  });

  it('CONFLICTS when the server moved ahead of the draft baseRev', () => {
    // This is the case that silently destroys work if handled as "dirty wins".
    const r = reconcile(DRAFT(true, 4), SERVER(8));
    expect(r.action).toBe('conflict');
    expect(r.server.rev).toBe(8);
  });

  it('CONFLICTS when the server rev went backwards (never trust either side)', () => {
    expect(reconcile(DRAFT(true, 9), SERVER(2)).action).toBe('conflict');
  });

  it('a dirty draft with an unknown baseRev conflicts rather than pushing', () => {
    // baseRev missing/undefined (e.g. an anonymous draft adopted at sign-in).
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

  it('rejects a large pasted raster image', () => {
    const png = 'data:image/png;base64,' + 'A'.repeat(5000);
    const r = validatePayload(JSON.stringify({ img: png }));
    expect(r).toMatch(/Images pasted/);
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

  it('uses a single shared prefix so quota handling can find them', () => {
    expect(draftKey('act1', 'uidA').startsWith('pp:v1:')).toBe(true);
  });

  it('round-trips a draft including dirty and baseRev', () => {
    writeDraft('act1', 'uidA', '{"a":1}', true, 3);
    const d = readDraft('act1', 'uidA');
    expect(d).toMatchObject({ payload: '{"a":1}', dirty: true, baseRev: 3 });
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
});

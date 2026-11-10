// @vitest-environment happy-dom
/**
 * origin-guard.js — one-way migration off the legacy Firebase hostname.
 *
 * The guard is a plain browser script (not a module), so each case loads the
 * real file into a fresh sandbox with a stubbed window/localStorage. That keeps
 * the test honest: it exercises the shipped source, not a reimplementation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const SRC = readFileSync(resolve(__dirname, '../../public/origin-guard.js'), 'utf8');

const LEGACY = 'porters-portal.firebaseapp.com';
const CANONICAL = 'porters-portal.web.app';

interface RunOpts {
  hostname?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  keys?: string[];
  /** Keys present in storage but holding an empty string. */
  emptyKeys?: string[];
  /** Keys with specific values (e.g. a raw pp:v1: draft JSON string). */
  values?: Record<string, string>;
  framed?: boolean;
  storageThrows?: boolean;
}

function runGuard(opts: RunOpts = {}) {
  const {
    hostname = LEGACY,
    pathname = '/',
    search = '',
    hash = '',
    keys = [],
    emptyKeys = [],
    values = {},
    framed = false,
    storageThrows = false,
  } = opts;

  const store = new Map<string, string>();
  for (const k of keys) store.set(k, '{"some":"work"}');
  for (const k of emptyKeys) store.set(k, '');
  for (const [k, v] of Object.entries(values)) store.set(k, v);

  const localStorage = {
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => {
      if (storageThrows) throw new Error('SecurityError');
      return store.has(k) ? store.get(k)! : null;
    },
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };

  const redirected: string[] = [];
  const listeners: Record<string, Array<() => void>> = {};

  const fakeDoc = {
    body: null as unknown,
    getElementById: () => null,
    createElement: () => ({
      id: '', style: { cssText: '' }, setAttribute: () => {}, attachShadow: () => ({ appendChild: () => {} }), appendChild: () => {},
    }),
    addEventListener: (evt: string, fn: () => void) => { (listeners[evt] ||= []).push(fn); },
  };

  const fakeWindow: Record<string, unknown> = {
    location: {
      hostname,
      pathname,
      search,
      hash,
      replace: (url: string) => { redirected.push(url); },
    },
    localStorage,
    document: fakeDoc,
  };
  // Same-window case: window.top === window.
  if (framed) {
    fakeWindow.top = {} as unknown;
  } else {
    fakeWindow.top = fakeWindow;
  }

  const sandbox = { window: fakeWindow, localStorage, document: fakeDoc, console };
  runInNewContext(SRC, sandbox);

  return { redirected, window: fakeWindow, store, listeners };
}

describe('origin-guard.js', () => {
  it('redirects to canonical when the legacy origin holds no work', () => {
    const { redirected } = runGuard({});
    expect(redirected).toHaveLength(1);
    expect(redirected[0]).toBe(`https://${CANONICAL}/`);
  });

  it('preserves path, query, and hash on redirect', () => {
    const { redirected } = runGuard({ pathname: '/some/route', search: '?x=1', hash: '#y' });
    expect(redirected[0]).toBe(`https://${CANONICAL}/some/route?x=1#y`);
  });

  it('holds when a known work key is present', () => {
    const { redirected, window } = runGuard({ keys: ['cart04:state'] });
    expect(redirected).toHaveLength(0);
    expect(window.__originHold).toEqual(['cart04:state']);
  });

  it('holds on prefix-style activity keys', () => {
    const { redirected, window } = runGuard({ keys: ['rbGuide:station3'] });
    expect(redirected).toHaveLength(0);
    expect(window.__originHold).toEqual(['rbGuide:station3']);
  });

  it('HOLDS on a dirty portal-save draft (unacknowledged work)', () => {
    // Once an activity is converted, its unsynced work lives in a dirty pp:v1:
    // draft. Redirecting past that would strand it.
    const { redirected, window } = runGuard({
      values: { 'pp:v1:uidA:cart-04': JSON.stringify({ payload: '{}', dirty: true, baseRev: 2 }) },
    });
    expect(redirected).toHaveLength(0);
    expect(window.__originHold).toEqual(['pp:v1:uidA:cart-04']);
  });

  it('redirects past a CLEAN portal-save draft (it is only a cache)', () => {
    const { redirected } = runGuard({
      values: { 'pp:v1:uidA:cart-04': JSON.stringify({ payload: '{}', dirty: false, baseRev: 2 }) },
    });
    expect(redirected).toHaveLength(1);
  });

  it('redirects past a corrupt portal-save draft rather than throwing', () => {
    const { redirected } = runGuard({ values: { 'pp:v1:uidA:cart-04': '{not json' } });
    expect(redirected).toHaveLength(1);
  });

  it('holds on a real in-flight assessment session key', () => {
    // Shape verified against lib/assessmentSessionKeys.ts.
    const { redirected } = runGuard({ keys: ['assessment_session_uid123_assign456'] });
    expect(redirected).toHaveLength(0);
  });

  it('holds on a real portalBridge recovery key', () => {
    // Shape verified against lib/bridgeRecovery.ts: portalBridge_<uid>_<assign>_lastState
    const { redirected } = runGuard({ keys: ['portalBridge_uid123_assign456_lastState'] });
    expect(redirected).toHaveLength(0);
  });

  it('redirects when only language-preference keys exist', () => {
    // A lost language toggle is not a lost artifact; holding on it would trap
    // every student on the legacy origin forever.
    const { redirected } = runGuard({ keys: ['rb-lang', 'l4bd_lang', 'courseRecapLang'] });
    expect(redirected).toHaveLength(1);
  });

  it('ignores empty-valued work keys', () => {
    // A cleared-but-present key must not hold a student on the legacy origin.
    const { redirected } = runGuard({ emptyKeys: ['cart04:state'] });
    expect(redirected).toHaveLength(1);
  });

  it('does nothing on the canonical host', () => {
    const { redirected } = runGuard({ hostname: CANONICAL, keys: ['cart04:state'] });
    expect(redirected).toHaveLength(0);
  });

  it('does nothing when framed', () => {
    const { redirected } = runGuard({ framed: true, keys: [] });
    expect(redirected).toHaveLength(0);
  });

  it('does nothing on reserved Firebase paths', () => {
    const { redirected } = runGuard({ pathname: '/__/auth/handler', keys: [] });
    expect(redirected).toHaveLength(0);
  });

  it('redirects when localStorage throws', () => {
    const { redirected } = runGuard({ storageThrows: true });
    expect(redirected).toHaveLength(1);
  });

  it('exposes the work-key list for audit cross-checking', () => {
    const { window } = runGuard({});
    const keys = (window.__originGuard as { WORK_KEYS: string[] }).WORK_KEYS;
    expect(Array.isArray(keys)).toBe(true);
    // The audit found 13 activities carrying student work.
    expect(keys.length).toBeGreaterThanOrEqual(13);
    expect(keys).toContain('cart04:state');
    expect(keys).toContain('electroscope-assessment-state');
    expect(keys.some((k) => /lang$/i.test(k))).toBe(false);
  });
});

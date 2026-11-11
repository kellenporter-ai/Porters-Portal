/**
 * portal-auth.js — identity binding for standalone activities.
 *
 * Two suites:
 *  1. Structural — the module has no syntax errors, exports what activities need,
 *     and the vendored SDK version matches package.json (drift silently nulls
 *     currentUser, which is what Opus warned about).
 *  2. Behavioural — the hard-reload-on-uid-change rule and the "no sign-in inside
 *     a frame" rule, exercised against a fake firebase global.
 *
 * These are jsdom-free: the module is written against `window` but we drive it
 * with a stub global so the identity logic is testable without a browser.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const PORTAL = resolve(__dirname, '../..');
const SRC = readFileSync(resolve(PORTAL, 'public/portal-auth.js'), 'utf8');

const require_ = createRequire(import.meta.url);

interface AuthStub {
  cb: ((u: { uid: string; displayName?: string; email?: string } | null) => void) | null;
  currentUser: { uid: string; getIdToken(): Promise<string> } | null;
  onAuthStateChanged(cb: (u: unknown) => void): void;
  signInWithPopup(): Promise<unknown>;
}

/**
 * Load portal-auth.js into a stubbed global. The module is an IIFE that attaches
 * to `globalPortalAuth`, so we give it a sandbox object with the minimum surface:
 * document (for script injection, pre-marked loaded) and a reload spy.
 */
function loadPortalAuth(opts: { framed?: boolean } = {}) {
  const reloads: number[] = [];
  const user = {
    uid: 'studentA',
    displayName: 'Student A',
    email: 'a@school.org',
    getIdToken: async () => 'token-abc',
  };

  const auth: AuthStub = {
    cb: null,
    currentUser: user,
    onAuthStateChanged(cb: (u: unknown) => void) {
      this.cb = cb as AuthStub['cb'];
    },
    signInWithPopup: async () => ({ user }),
  };

  const sandbox: Record<string, unknown> = {
    location: { reload: () => reloads.push(Date.now()), hostname: 'porters-portal.web.app' },
    __PORTAL_FIREBASE_CONFIG__: {
      apiKey: 'test-key',
      projectId: 'porters-portal',
      authDomain: 'porters-portal.web.app',
    },
  };
  sandbox.top = opts.framed ? { unrelated: true } : sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const firebase = {
    SDK_VERSION: '10.14.1',
    apps: [{ name: '[DEFAULT]' }],
    app: () => ({ name: '[DEFAULT]' }),
    initializeApp: () => ({ name: '[DEFAULT]' }),
    auth: () => auth,
    auth_gp: {},
  };
  (firebase as unknown as { auth: unknown }).auth = Object.assign(() => auth, {
    GoogleAuthProvider: function GoogleAuthProvider() {},
  });
  sandbox.firebase = firebase;

  // The module calls document.querySelector/createElement/head.appendChild to
  // load the SDK. Pre-satisfy it: the scripts are "already loaded".
  const head = { appendChild: () => {} };
  sandbox.document = {
    head,
    querySelector: () => ({ dataset: { loaded: '1' } }),
    createElement: () => ({ dataset: {} }),
  };

  const vm = require_('node:vm') as typeof import('node:vm');
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);

  return {
    api: sandbox.PortalAuth as {
      bind(): Promise<{ uid: string | null; getToken(): Promise<string> }>;
      onChange(fn: (s: unknown) => void): () => void;
      isFramed(): boolean;
      canSignInHere(): boolean;
      _internals: { reloadForIdentityChange(): void; readConfig(): unknown };
    },
    auth,
    reloads,
    sandbox,
  };
}

describe('portal-auth.js — structural', () => {
  it('is loadable and exposes the API activities need', () => {
    const { api } = loadPortalAuth();
    expect(typeof api.bind).toBe('function');
    expect(typeof api.onChange).toBe('function');
    expect(typeof api.isFramed).toBe('function');
    expect(typeof api.canSignInHere).toBe('function');
  });

  it('declares the same SDK version the app depends on', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(PORTAL, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const declared = pkg.dependencies.firebase.replace(/^[\^~]/, '');
    const inSrc = SRC.match(/SDK_VERSION\s*=\s*'([\d.]+)'/);
    expect(inSrc).not.toBeNull();
    // Version drift here is silent: currentUser comes back null and looks
    // exactly like "signed out".
    expect(inSrc![1]).toBe(declared);
  });

  it('vendors the SDK at the declared version (no CDN dependency)', () => {
    const vendored = readFileSync(resolve(PORTAL, 'public/firebase-app-compat.js'), 'utf8');
    expect(vendored).toContain('10.14.1');
    expect(SRC).not.toMatch(/gstatic\.com/);
  });

  it('refuses to run without a config', () => {
    const { api, sandbox } = loadPortalAuth();
    delete sandbox.__PORTAL_FIREBASE_CONFIG__;
    // readConfig throws rather than silently producing an unauthenticated page.
    expect(() => api._internals.readConfig()).toThrow(/__PORTAL_FIREBASE_CONFIG__/);
  });
});

describe('portal-auth.js — identity behaviour', () => {
  let ctx: ReturnType<typeof loadPortalAuth>;

  beforeEach(() => {
    ctx = loadPortalAuth();
  });

  /**
   * bind() is async and only resolves AFTER the auth callback fires, so we must
   * wait for the callback to be REGISTERED, not for bind() to settle. Poll for it.
   */
  async function waitForCallback(): Promise<void> {
    for (let i = 0; i < 200 && !ctx.auth.cb; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    if (!ctx.auth.cb) throw new Error('auth callback was never registered');
  }

  it('resolves with the signed-in uid and a per-request token', async () => {
    const p = ctx.api.bind();
    await waitForCallback();
    ctx.auth.cb!({ uid: 'studentA', displayName: 'Student A', email: 'a@school.org' });
    const id = await p;
    expect(id.uid).toBe('studentA');
    expect(await id.getToken()).toBe('token-abc');
  });

  it('resolves with uid=null when nobody is signed in (not an error)', async () => {
    const p = ctx.api.bind();
    await waitForCallback();
    ctx.auth.cb!(null);
    const id = await p;
    expect(id.uid).toBeNull();
  });

  it('HARD RELOADS when the uid changes — A must never save into B', async () => {
    const p = ctx.api.bind();
    await waitForCallback();
    ctx.auth.cb!({ uid: 'studentA' });
    await p;
    expect(ctx.reloads.length).toBe(0);

    // Another tab signs student A out and student B in.
    ctx.auth.cb!({ uid: 'studentB' });
    expect(ctx.reloads.length).toBe(1);
  });

  it('does NOT reload on a same-uid re-emit', async () => {
    const p = ctx.api.bind();
    await waitForCallback();
    ctx.auth.cb!({ uid: 'studentA' });
    await p;
    ctx.auth.cb!({ uid: 'studentA' });
    ctx.auth.cb!({ uid: 'studentA' });
    expect(ctx.reloads.length).toBe(0);
  });

  it('does not reload for the FIRST identity after a null start', async () => {
    // Page loads signed out, student signs in: that is normal, not a takeover.
    const p = ctx.api.bind();
    await waitForCallback();
    ctx.auth.cb!(null);
    await p;
    ctx.auth.cb!({ uid: 'studentA' });
    expect(ctx.reloads.length).toBe(0);
  });

  it('never offers sign-in inside a frame (parent owns it)', () => {
    const framed = loadPortalAuth({ framed: true });
    expect(framed.api.isFramed()).toBe(true);
    expect(framed.api.canSignInHere()).toBe(false);
  });

  it('offers sign-in for a direct open', () => {
    expect(ctx.api.isFramed()).toBe(false);
    expect(ctx.api.canSignInHere()).toBe(true);
  });
});

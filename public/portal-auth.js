/**
 * portal-auth.js — identity for standalone Portal activities.
 *
 * THE PROBLEM THIS SOLVES
 * public/*.html activities have no way to obtain a Firebase identity. The parent
 * Portal app holds an Auth session (lib/firebase.ts → getAuth(app)), but an
 * activity cannot "read" that session — Firebase's IndexedDB layout is internal.
 * What it CAN do is load the same SDK, with the same config, under the same
 * default app name, on the same origin. The SDK then reads its own persistence
 * store and returns the SAME user. That is the whole trick: no postMessage, no
 * second sign-in, no new identifier.
 *
 * SAME ORIGIN IS LOAD-BEARING
 * Firebase Auth persistence is per-origin. This is why the project consolidates
 * on porters-portal.web.app: an activity served from firebaseapp.com would get a
 * separate, empty session. Under an allow-same-origin iframe the session is
 * shared; under an opaque-origin frame (no allow-same-origin) localStorage
 * throws and there is no session at all.
 *
 * THE HARD-RELOAD RULE (the real cross-student leak)
 * On a shared Chromebook, student A can sign out in another tab while student B
 * signs in. If the activity kept running, A's on-screen state would be written
 * into B's document. So a uid change AFTER the first identity is established
 * cancels pending work and hard-reloads the page. Dropping in-memory state is
 * the only safe response; there is no "merge" that is correct.
 *
 * FERPA
 * Draft keys are uid-scoped and anonymous drafts do not exist (portal-save.js
 * throws without a uid). This module never invents an identity.
 */

(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var SDK_VERSION = '10.14.1'; // MUST match package.json `firebase`. Drift here
                               // silently returns a null currentUser.

  var app = null;
  var auth = null;
  var sdkLoading = null;
  var boundUid = null;        // the uid currently bound (null = signed out)
  var hadIdentity = false;    // whether a real uid has EVER been bound
  var ready = false;
  var listeners = [];

  // ─── Config ───────────────────────────────────────────────────────────────
  // Injected by the page (see the <script> usage note below). portal-save.js
  // reads the same three globals, so there is exactly ONE config source.
  function readConfig() {
    var cfg = global.__PORTAL_FIREBASE_CONFIG__;
    if (!cfg || !cfg.apiKey || !cfg.projectId) {
      throw new Error(
        'portal-auth: __PORTAL_FIREBASE_CONFIG__ is missing apiKey/projectId. ' +
        'The activity must set it before loading this script.',
      );
    }
    return cfg;
  }

  // ─── SDK loading ──────────────────────────────────────────────────────────
  // Same-origin compat bundles, vendored into public/ from node_modules at the
  // SAME version as the app. A CDN copy (gstatic) is avoided deliberately:
  // school networks filter it, and a silently missing SDK looks identical to
  // "signed out".
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-portal-sdk="' + src + '"]');
      if (existing && existing.dataset.loaded === '1') return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.dataset.portalSdk = src;
      s.onload = function () {
        s.dataset.loaded = '1';
        resolve();
      };
      s.onerror = function () {
        reject(new Error('portal-auth: failed to load ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function loadSdk() {
    if (sdkLoading) return sdkLoading;
    sdkLoading = loadScript('/firebase-app-compat.js')
      .then(function () { return loadScript('/firebase-auth-compat.js'); })
      .then(function () {
        if (!global.firebase || !global.firebase.auth) {
          throw new Error('portal-auth: firebase compat global missing after load');
        }
        if (global.firebase.SDK_VERSION && global.firebase.SDK_VERSION !== SDK_VERSION) {
          throw new Error(
            'portal-auth: SDK version mismatch — expected ' + SDK_VERSION +
            ', loaded ' + global.firebase.SDK_VERSION,
          );
        }
      });
    return sdkLoading;
  }

  // ─── Identity ─────────────────────────────────────────────────────────────
  function initApp() {
    var cfg = readConfig();
    // Reuse the existing default app if the page (or a prior include) made one.
    app = (global.firebase.apps && global.firebase.apps.length)
      ? global.firebase.app()
      : global.firebase.initializeApp(cfg);
    auth = global.firebase.auth(app);
    // Keep portal-save.js's config globals in lockstep.
    global.__PORTAL_API_KEY__ = cfg.apiKey;
    global.__PORTAL_PROJECT_ID__ = cfg.projectId;
    return auth;
  }

  function reloadForIdentityChange() {
    try {
      global.location.reload();
    } catch (e) {
      /* if reload is impossible the page is already going away */
    }
  }

  /**
   * Start watching auth state.
   * @returns {Promise<{uid: string|null, getToken: function}>}
   *
   * Resolves with uid=null when nobody is signed in — that is NOT an error.
   * The caller decides whether to show a sign-in affordance; portal-save.js
   * refuses to write without a uid.
   */
  function bind() {
    return loadSdk()
      .then(function () { return initApp(); })
      .then(function (a) {
        return new Promise(function (resolve) {
          var settled = false;

          a.onAuthStateChanged(function (user) {
            var uid = user ? user.uid : null;

            if (!settled) {
              settled = true;
              ready = true;
              boundUid = uid;
              hadIdentity = !!uid;
              resolve({
                uid: uid,
                displayName: user ? user.displayName : null,
                email: user ? user.email : null,
                // Per-request token: ID tokens expire in ~1h and tabs stay open
                // across periods. Caching a token here is how saves start
                // failing halfway through third block.
                getToken: function () {
                  var current = a.currentUser;
                  if (!current) return Promise.reject(new Error('portal-auth: not signed in'));
                  return current.getIdToken();
                },
              });
              notify();
              return;
            }

            // A uid CHANGE while a student is already bound means a different
            // student is now on this browser. Never carry the old state over.
            //
            // Signing in from a genuinely signed-out page is NOT a change: there
            // was no prior identity to leak, and reloading would discard work the
            // student typed before signing in.
            var wasSignedIn = hadIdentity && boundUid !== null;
            if (wasSignedIn && uid !== boundUid) {
              boundUid = uid;
              hadIdentity = !!uid;
              notify();
              reloadForIdentityChange();
            } else {
              boundUid = uid;
              if (uid) hadIdentity = true;
              notify();
            }
          });
        });
      });
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snapshot());
      } catch (e) {
        /* a listener must never break identity handling */
      }
    }
  }

  function snapshot() {
    var u = auth && auth.currentUser;
    return {
      ready: ready,
      uid: u ? u.uid : null,
      displayName: u ? u.displayName : null,
      email: u ? u.email : null,
    };
  }

  /** Subscribe to identity changes. Returns an unsubscribe function. */
  function onChange(fn) {
    if (typeof fn !== 'function') throw new Error('portal-auth: onChange needs a function');
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /** Google sign-in. Intended for DIRECT (non-framed) opens only. */
  function signIn() {
    if (!auth) return Promise.reject(new Error('portal-auth: bind() first'));
    var provider = new global.firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider);
  }

  /** True when this document is inside a frame. */
  function isFramed() {
    try {
      return global.top !== global;
    } catch (e) {
      return true; // cross-origin access threw → we are definitely framed
    }
  }

  /**
   * Whether THIS document should offer its own sign-in.
   * Inside a frame it must not: popups need allow-popups and redirects break in
   * frames. The parent owns sign-in there.
   */
  function canSignInHere() {
    return !isFramed();
  }

  global.PortalAuth = {
    VERSION: VERSION,
    SDK_VERSION: SDK_VERSION,
    bind: bind,
    onChange: onChange,
    signIn: signIn,
    isFramed: isFramed,
    canSignInHere: canSignInHere,
    snapshot: snapshot,
    // Test seam
    _internals: {
      readConfig: readConfig,
      reloadForIdentityChange: reloadForIdentityChange,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

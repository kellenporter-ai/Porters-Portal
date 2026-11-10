/**
 * portal-save.js — durable student-work persistence for standalone Portal resources.
 *
 * THE PROBLEM
 * The 12+ activities in public/*.html each persist student work to localStorage.
 * Managed-Chromebook policy pushes periodically clear that storage, silently
 * destroying work the student had no hand in losing. An activity that was only
 * ever local cannot survive that by definition.
 *
 * THE DESIGN
 * A standalone script every activity loads with one <script> tag. It carries no
 * build step of its own (activities stay buildless) and reuses the Portal's
 * SAME-ORIGIN Firebase Auth session to identify the student, so there are no new
 * identifiers, no class codes, and no FERPA exposure.
 *
 * Storage is one Firestore doc per student per activity:
 *     resource_saves/{uid}/items/{activityId}
 * with the activity state held as an OPAQUE JSON string (never a native map —
 * activity state routinely contains nested arrays, dotted keys, and undefined,
 * all of which a Firestore map mangles or rejects).
 *
 * THE HONESTY CONTRACT (the whole point)
 * "Saved" means exactly one thing: the server acknowledged a write whose payload
 * matches what is currently on screen. A localStorage write NEVER shows green.
 * A student must never believe their work is safe when it is not.
 *
 * THREE INVARIANTS THAT MAKE A SPLIT STATE SAFE
 * (an old tab, a second device, or the legacy hostname holding a different draft)
 *   1. baseRev on every draft — a stale draft can never silently overwrite newer
 *      server state; the rules-enforced rev check rejects it and we surface it.
 *   2. Blocking when there is no auth — never a writable page behind a non-green
 *      indicator.
 *   3. Surfaced rev rejections — a rejected write becomes visible, not swallowed.
 *
 * COST INVARIANT
 * Saves are debounced with a HARD 30s floor per activity. This is not tunable per
 * activity: an activity that writes per keystroke is what actually runs a bill up,
 * and on Spark a blown daily write quota makes writes fail for the rest of the day.
 */

(function (global) {
  'use strict';

  // ─── Configuration ────────────────────────────────────────────────────────
  var FIREBASE_CONFIG = global.__PORTAL_FIREBASE_CONFIG__ || null;
  var API_KEY = global.__PORTAL_API_KEY__ || null;
  var PROJECT_ID = global.__PORTAL_PROJECT_ID__ || null;

  var DEBOUNCE_MS = 5000;
  var HARD_FLOOR_MS = 30000;      // cost invariant
  var MAX_PAYLOAD_BYTES = 200000; // matches the firestore.rules cap
  var FETCH_TIMEOUT_MS = 8000;
  var DRAFT_PREFIX = 'pp:v1:';    // single prefix for all resource drafts

  // ─── Local draft store ────────────────────────────────────────────────────
  // Draft is the local mirror. `dirty` means the server has NOT acknowledged this
  // payload. `baseRev` is the server rev this draft was edited from (0 = new).
  function draftKey(activityId, uid) {
    return DRAFT_PREFIX + (uid || 'anon') + ':' + activityId;
  }

  function readDraft(activityId, uid) {
    try {
      var raw = localStorage.getItem(draftKey(activityId, uid));
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  function writeDraft(activityId, uid, payload, dirty, baseRev) {
    try {
      localStorage.setItem(draftKey(activityId, uid), JSON.stringify({
        payload: payload,
        dirty: !!dirty,
        baseRev: baseRev || 0,
        timestamp: new Date().toISOString()
      }));
      return true;
    } catch (e) {
      // QuotaExceeded or private mode. Never swallow: the caller surfaces it.
      return false;
    }
  }

  function clearDraft(activityId, uid) {
    try { localStorage.removeItem(draftKey(activityId, uid)); } catch (e) { /* best effort */ }
  }

  // ─── Payload guard ────────────────────────────────────────────────────────
  // Raster images are excluded from auto-sync. Vector drawing state (the Portal's
  // DrawingElement[]) is plain JSON and passes; only real image data trips this.
  function findRasterBlob(payload) {
    if (typeof payload !== 'string') return false;
    if (payload.indexOf('data:image/') === -1) return false;
    // Language/SVG data URIs are tiny; only flag when a real image payload exists.
    return /data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]{2000,}/.test(payload);
  }

  function byteLength(str) {
    try { return new TextEncoder().encode(str).length; } catch (e) { return str.length; }
  }

  // ─── Firestore REST (Lite) ────────────────────────────────────────────────
  // Plain HTTPS calls keep the network surface minimal on filtered school
  // networks and avoid the full SDK's offline machinery (which hides pending
  // writes behind "success").
  function docUrl(uid, activityId) {
    return 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents/resource_saves/' + encodeURIComponent(uid) +
      '/items/' + encodeURIComponent(activityId);
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms);
      })
    ]);
  }

  function authHeaders(token) {
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  }

  async function serverFetch(token, uid, activityId) {
    var res = await withTimeout(fetch(docUrl(uid, activityId), {
      method: 'GET', headers: authHeaders(token)
    }), FETCH_TIMEOUT_MS);
    if (res.status === 404) return { exists: false, rev: 0, payload: null };
    if (!res.ok) throw new Error('read ' + res.status);
    var body = await res.json();
    var f = body.fields || {};
    return {
      exists: true,
      rev: f.rev ? Number(f.rev.integerValue || 0) : 0,
      payload: f.payload && f.payload.stringValue !== undefined ? f.payload.stringValue : null,
      schemaVersion: f.schemaVersion ? Number(f.schemaVersion.integerValue || 0) : 0
    };
  }

  async function serverWrite(token, uid, activityId, payload, rev, schemaVersion) {
    var url = docUrl(uid, activityId) +
      '?updateMask.fieldPaths=payload&updateMask.fieldPaths=rev' +
      '&updateMask.fieldPaths=schemaVersion&updateMask.fieldPaths=updatedAt';
    var body = {
      fields: {
        payload: { stringValue: payload },
        rev: { integerValue: String(rev) },
        schemaVersion: { integerValue: String(schemaVersion || 1) },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };
    var res = await withTimeout(fetch(url, {
      method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body)
    }), FETCH_TIMEOUT_MS);
    return res;
  }

  // ─── Reconciliation (pure) ────────────────────────────────────────────────
  // Decides what to do given a local draft and the server copy. Kept pure and
  // exported so every branch is unit-testable without a network or a browser.
  //
  // Returns one of:
  //   {action:'push',        rev}         local is newer; write it
  //   {action:'adopt',       ...server}    take the server copy (Restored toast)
  //   {action:'conflict',    server}       both diverged; ASK, never auto-pick
  //   {action:'nothing'}                   nothing on either side
  //
  // The dangerous case is a stale-but-dirty draft that "wins" by default. That is
  // silently destroying newer work on another device, so it MUST surface as
  // 'conflict'.
  function reconcile(draft, server) {
    var hasDraft = !!draft;
    var hasServer = !!(server && server.exists);
    var dirty = !!(draft && draft.dirty);

    if (!hasDraft && !hasServer) return { action: 'nothing' };
    if (!hasDraft && hasServer) return { action: 'adopt', payload: server.payload, rev: server.rev };

    // A pristine (non-dirty) local draft is just a cache: the server always wins.
    if (!dirty && hasServer) return { action: 'adopt', payload: server.payload, rev: server.rev };

    // Dirty local draft:
    if (!hasServer) {
      // Nothing on the server yet — safe to push.
      return { action: 'push', rev: 1 };
    }
    var baseRev = (draft && typeof draft.baseRev === 'number') ? draft.baseRev : 0;
    if (server.rev === baseRev) {
      // Server hasn't moved since we last synced — safe to push over it.
      return { action: 'push', rev: server.rev + 1 };
    }
    if (server.rev > baseRev) {
      // Someone (another device / tab / origin) wrote newer work.
      return { action: 'conflict', server: server, draft: draft };
    }
    // Server rev went backwards — treat as conflict rather than trusting either.
    return { action: 'conflict', server: server, draft: draft };
  }

  // ─── Payload validation (pure) ────────────────────────────────────────────
  // Returns null when acceptable, or a reason string the UI can show.
  function validatePayload(payload) {
    if (typeof payload !== 'string') return 'Payload must be a JSON string.';
    var size = byteLength(payload);
    if (size > MAX_PAYLOAD_BYTES) {
      return 'This activity\'s work is too large to save (' + Math.round(size / 1024) + ' KB). Remove pasted images.';
    }
    if (findRasterBlob(payload)) {
      return 'Images pasted into this activity aren\'t saved to your account.';
    }
    return null;
  }

  global.PortalSave = {
    // Exposed for tests and for activities that want to inspect state.
    _internals: {
      draftKey: draftKey,
      readDraft: readDraft,
      writeDraft: writeDraft,
      clearDraft: clearDraft,
      findRasterBlob: findRasterBlob,
      byteLength: byteLength,
      reconcile: reconcile,
      validatePayload: validatePayload,
      DEBOUNCE_MS: DEBOUNCE_MS,
      HARD_FLOOR_MS: HARD_FLOOR_MS,
      MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,
      DRAFT_PREFIX: DRAFT_PREFIX
    },
    serverFetch: serverFetch,
    serverWrite: serverWrite
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.PortalSave;
  }
})(typeof window !== 'undefined' ? window : globalThis);

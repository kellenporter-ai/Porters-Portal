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
  // payload. `baseRev`/`baseUpdateTime` are the server state the draft was edited
  // from (rev 0 / null = never synced).
  //
  // There is deliberately NO 'anon' fallback. Invariant #2 says a page with no
  // auth is not writable, so an anonymous draft should not exist; if one did, a
  // shared Chromebook would hand it to whichever student signed in next.
  function draftKey(activityId, uid) {
    if (!uid) throw new Error('draftKey requires a uid — anonymous drafts are not allowed');
    return DRAFT_PREFIX + uid + ':' + activityId;
  }

  function readDraft(activityId, uid) {
    try {
      var raw = localStorage.getItem(draftKey(activityId, uid));
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      return d;
    } catch (e) {
      // No uid (throw from draftKey) or corrupt JSON — both mean "no draft".
      return null;
    }
  }

  function writeDraft(activityId, uid, payload, dirty, baseRev, baseUpdateTime) {
    var key;
    try {
      key = draftKey(activityId, uid); // throws without a uid — surfaced as false
    } catch (e) {
      return false;
    }
    try {
      localStorage.setItem(key, JSON.stringify({
        payload: payload,
        dirty: !!dirty,
        baseRev: baseRev || 0,
        baseUpdateTime: baseUpdateTime || null,
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
  //
  // Writes go through documents:commit rather than documents:patch because the
  // rules require `updatedAt == request.time`, and a server timestamp transform
  // (REQUEST_TIME) is the ONLY way to satisfy that. A client-generated
  // new Date().toISOString() can never equal the server commit time, so a PATCH
  // with a client timestamp is denied 100% of the time.
  //
  // :commit also carries preconditions in the same call, which turns a stale
  // write into a FAILED_PRECONDITION instead of an indistinguishable 403.
  var API_BASE = 'https://firestore.googleapis.com';
  var ACTIVITY_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

  function docPath(uid, activityId) {
    return 'projects/' + PROJECT_ID + '/databases/(default)/documents/resource_saves/' +
      encodeURIComponent(uid) + '/items/' + encodeURIComponent(activityId);
  }

  function docUrl(uid, activityId) {
    return API_BASE + '/v1/' + docPath(uid, activityId);
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

  // Minimal fetch with a real abort. A Promise.race "timeout" leaves the request
  // in flight, which can commit server-side AFTER the client decided it failed —
  // producing a false conflict on the retry. Aborting is not a guarantee the
  // server did not commit, so callers must treat failures as UNKNOWN, not failed.
  async function fetchAbort(url, opts, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    try {
      return await fetch(url, Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function serverFetch(token, uid, activityId) {
    var res = await fetchAbort(docUrl(uid, activityId), {
      method: 'GET', headers: authHeaders(token)
    }, FETCH_TIMEOUT_MS);
    if (res.status === 404) return { exists: false, rev: 0, payload: null, updateTime: null };
    if (!res.ok) {
      var e = new Error('read ' + res.status);
      e.status = res.status;
      throw e;
    }
    var body = await res.json();
    var f = body.fields || {};
    return {
      exists: true,
      rev: f.rev ? Number(f.rev.integerValue || 0) : 0,
      payload: f.payload && f.payload.stringValue !== undefined ? f.payload.stringValue : null,
      schemaVersion: f.schemaVersion ? Number(f.schemaVersion.integerValue || 0) : 0,
      // updateTime is the doc identity for optimistic concurrency: unlike rev,
      // it never repeats (a deleted-and-recreated doc gets a fresh one).
      updateTime: body.updateTime || null
    };
  }

  /**
   * Commits a save. `expected` is the concurrency token:
   *   { exists: false }          -> must be a create
   *   { updateTime: <string> }   -> must match the doc we read
   * Returns { ok, status, updateTime, error }.
   */
  async function serverCommit(token, uid, activityId, payload, rev, schemaVersion, expected) {
    if (!ACTIVITY_ID_RE.test(activityId)) {
      return { ok: false, status: 400, error: 'invalid activityId' };
    }
    var write = {
      update: {
        name: docPath(uid, activityId),
        fields: {
          payload: { stringValue: payload },
          rev: { integerValue: String(rev) },
          schemaVersion: { integerValue: String(schemaVersion || 1) }
        }
      },
      updateMask: { fieldPaths: ['payload', 'rev', 'schemaVersion'] },
      // updatedAt is NOT in the mask: the rules require it to equal request.time,
      // and only a server-time transform can satisfy that.
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
    };
    if (expected && typeof expected.updateTime === 'string') {
      write.currentDocument = { updateTime: expected.updateTime };
    } else if (expected && expected.exists === false) {
      write.currentDocument = { exists: false };
    }

    var res = await fetchAbort(API_BASE + '/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents:commit', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ writes: [write] })
    }, FETCH_TIMEOUT_MS);

    var body = null;
    try { body = await res.json(); } catch (e) { body = null; }

    if (res.ok) {
      var ut = body && body.writeResults && body.writeResults[0]
        ? body.writeResults[0].updateTime : null;
      return { ok: true, status: res.status, updateTime: ut || null };
    }
    return {
      ok: false,
      status: res.status,
      error: (body && body.error && body.error.status) || ('http ' + res.status),
      // FAILED_PRECONDITION => the doc moved under us (stale write), which is a
      // conflict, not a bug. PERMISSION_DENIED is ambiguous and needs a re-read.
      precondition: res.status === 400 || res.status === 409 ||
        (body && body.error && body.error.status === 'FAILED_PRECONDITION')
    };
  }

  // ─── Reconciliation (pure) ────────────────────────────────────────────────
  // Decides what to do given a local draft and the server copy. Kept pure and
  // exported so every branch is unit-testable without a network or a browser.
  //
  // Returns one of:
  //   {action:'push',      rev, expected, reason}  local is newer; write it
  //   {action:'adopt',     payload, rev, updateTime} take the server copy
  //   {action:'ack',       rev, updateTime}           our write already landed
  //   {action:'discard-cache'}                        server copy was deleted
  //   {action:'conflict',  server, draft, reason}      ASK, never auto-pick
  //   {action:'nothing'}
  //
  // The dangerous case is a stale-but-dirty draft that "wins" by default. That
  // silently destroys newer work on another device, so it MUST surface as
  // 'conflict'.
  function reconcile(draft, server) {
    var hasDraft = !!draft;
    var hasServer = !!(server && server.exists);
    var dirty = !!(draft && draft.dirty);

    // ── Clean (non-dirty) local draft: it is only ever a cache. ──
    if (!dirty) {
      if (hasServer) {
        return { action: 'adopt', payload: server.payload, rev: server.rev, updateTime: server.updateTime };
      }
      // Server copy is GONE (e.g. an admin reset). A clean draft means the server
      // already acknowledged it, so a cached copy must not resurrect it and spend
      // a write doing so. Discard the cache and respect the deletion.
      return hasDraft ? { action: 'discard-cache' } : { action: 'nothing' };
    }

    // ── Dirty local draft from here down. ──

    // If the server already holds exactly this payload, our write landed (or an
    // identical one did). Treat as acked — this also resolves the ambiguous
    // "did my timed-out write commit?" case without a spurious conflict.
    if (hasServer && server.payload === draft.payload) {
      return { action: 'ack', rev: server.rev, updateTime: server.updateTime };
    }

    if (!hasServer) {
      // Nothing on the server. baseRev > 0 means we HAD a copy that was since
      // deleted; still push (preserving student work beats respecting a delete
      // we cannot distinguish from data loss), but tag it for telemetry.
      return {
        action: 'push',
        rev: 1,
        expected: { exists: false },
        reason: draft.baseRev > 0 ? 'server-deleted' : 'first-save'
      };
    }

    var baseRev = (typeof draft.baseRev === 'number') ? draft.baseRev : null;
    var baseTimeOk = !draft.baseUpdateTime || draft.baseUpdateTime === server.updateTime;

    if (baseRev !== null && server.rev === baseRev && baseTimeOk) {
      return {
        action: 'push',
        rev: server.rev + 1,
        expected: { updateTime: server.updateTime },
        reason: 'in-order'
      };
    }

    // Either the server moved ahead, or the rev regressed (which should be
    // impossible outside delete-and-recreate and is therefore a bug signal).
    return {
      action: 'conflict',
      server: server,
      draft: draft,
      reason: (baseRev !== null && server.rev > baseRev) ? 'server-ahead' : 'rev-regressed'
    };
  }

  // ─── Schedule (pure) ──────────────────────────────────────────────────────
  // Decides when the next write may fire. Kept pure so the cost invariant is
  // tested as BEHAVIOUR, not as a constant nobody enforces.
  //
  // Rules:
  //   - never sooner than HARD_FLOOR_MS after the previous write
  //   - while inside the floor, the next write waits for the remainder
  //   - a flush (tab hiding / pagehide) bypasses the debounce but NOT the floor,
  //     except for an explicit forced flush on pagehide where losing the write
  //     is certain and a duplicate is harmless (the reconcile ack branch absorbs it)
  function decideSchedule(now, lastWriteAt, pendingSince) {
    if (lastWriteAt === null) {
      // First write of the session: honour the debounce off the edit time.
      return { fireAt: (pendingSince || now) + DEBOUNCE_MS, reason: 'debounce' };
    }
    var floorAt = lastWriteAt + HARD_FLOOR_MS;
    var debounceAt = (pendingSince || now) + DEBOUNCE_MS;
    var fireAt = Math.max(floorAt, debounceAt);
    return {
      fireAt: fireAt,
      waitMs: Math.max(0, fireAt - now),
      reason: fireAt === floorAt ? 'floor' : 'debounce'
    };
  }

  // ─── Payload validation (pure) ────────────────────────────────────────────
  // Returns null when acceptable, or a reason string the UI can show.
  //
  // The raster message must be HONEST: rejecting the whole payload means NOTHING
  // is saved, not "images aren't saved." Saying the latter teaches a student that
  // the rest of their work is safe when it is not.
  function validatePayload(payload) {
    if (typeof payload !== 'string') return 'Payload must be a JSON string.';
    var size = byteLength(payload);
    if (size > MAX_PAYLOAD_BYTES) {
      return 'Your work is too large to save (' + Math.round(size / 1024) + ' KB). Remove pasted images.';
    }
    if (findRasterBlob(payload)) {
      return 'Your work is NOT being saved while a pasted image is in it. Remove the image to turn saving back on.';
    }
    return null;
  }

  // ─── Save controller (orchestration) ──────────────────────────────────────
  // Everything above is a tested primitive. This drives them as one save loop:
  // edit -> local draft (always) -> debounced server write -> reconcile -> status.
  //
  // THE CONTRACT THE STUDENT SEES
  //   'saved'    ONLY when the server acknowledged the exact on-screen payload.
  //   'saving'   a write is in flight.
  //   'pending'  dirty work exists that the server has not acknowledged.
  //   'blocked'  no identity, or a conflict, or a payload we refuse to send.
  // A localStorage write NEVER produces 'saved'. That is the whole point.
  //
  // CONFLICTS NEVER AUTO-RESOLVE. reconcile() returning 'conflict' stops here and
  // asks. Refetching a rev and re-pushing would silently destroy the other
  // device's newer work, which is the exact loss this exists to prevent.
  function createController(options) {
    var opts = options || {};
    var activityId = opts.activityId;
    var uid = opts.uid || null;
    var getToken = opts.getToken || null;
    var onStatus = opts.onStatus || function () {};
    var onConflict = opts.onConflict || null;
    var schemaVersion = opts.schemaVersion || 1;

    if (!activityId || !ACTIVITY_ID_RE.test(activityId)) {
      throw new Error('createController: invalid activityId');
    }

    var status = 'idle';
    var lastWriteAt = null;
    var pendingSince = null;
    var timer = null;
    var inFlight = false;
    var lastAckedPayload = null;
    var lastAckedRev = 0;
    var lastAckedUpdateTime = null;
    var lastError = null;

    function setStatus(next, detail) {
      if (status === next && !detail) return;
      status = next;
      try {
        onStatus(next, detail || null);
      } catch (e) {
        /* a status renderer must never break saving */
      }
    }

    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    /** Identity changing mid-session is fatal to correctness — stop everything. */
    function setUid(nextUid, nextGetToken) {
      if (nextUid !== uid) {
        clearTimer();
        lastAckedPayload = null;
        lastAckedRev = 0;
        lastAckedUpdateTime = null;
      }
      uid = nextUid || null;
      if (nextGetToken) getToken = nextGetToken;
      if (!uid) setStatus('blocked', 'no-identity');
    }

    /**
     * Record an edit. ALWAYS writes the local draft first, before any auth
     * check — a local write gated on the network turns a re-login into a loss.
     */
    function markDirty(payloadString) {
      var bad = validatePayload(payloadString);
      if (bad) {
        setStatus('blocked', bad);
        return { ok: false, reason: bad };
      }
      if (!uid) {
        // Keep the work locally, but say plainly it is not saved.
        try {
          localStorage.setItem(
            'pp:v1:pending-anon:' + activityId,
            payloadString,
          );
        } catch (e) { /* private mode: nothing more we can do */ }
        setStatus('blocked', 'no-identity');
        return { ok: false, reason: 'no-identity' };
      }

      writeDraft(activityId, uid, payloadString, true, lastAckedRev, lastAckedUpdateTime);
      pendingSince = pendingSince || Date.now();
      setStatus('pending');
      schedule();
      return { ok: true };
    }

    function schedule() {
      if (inFlight) return; // the in-flight completion re-schedules
      clearTimer();
      var now = Date.now();
      var s = decideSchedule(now, lastWriteAt, pendingSince);
      var wait = Math.max(0, (s.fireAt || now) - now);
      timer = setTimeout(function () {
        timer = null;
        flush();
      }, wait);
    }

    /**
     * Push the local draft to the server now.
     * @param {{force?: boolean}} o force bypasses the debounce (NOT the floor
     *        reasoning) — used for pagehide/visibilitychange.
     */
    function flush(o) {
      var force = !!(o && o.force);
      clearTimer();
      if (inFlight) return Promise.resolve({ ok: false, reason: 'in-flight' });
      if (!uid) {
        setStatus('blocked', 'no-identity');
        return Promise.resolve({ ok: false, reason: 'no-identity' });
      }

      var draft = readDraft(activityId, uid);
      if (!draft || !draft.dirty) {
        // Nothing unacknowledged. Do not spend a write.
        return Promise.resolve({ ok: true, reason: 'clean' });
      }

      var bad = validatePayload(draft.payload);
      if (bad) {
        setStatus('blocked', bad);
        return Promise.resolve({ ok: false, reason: bad });
      }

      if (typeof getToken !== 'function') {
        setStatus('blocked', 'no-token-source');
        return Promise.resolve({ ok: false, reason: 'no-token-source' });
      }

      inFlight = true;
      setStatus('saving');

      return Promise.resolve()
        .then(function () {
          // Per-request token: ID tokens expire in ~1h and tabs stay open across
          // periods, so a cached token fails mid-class.
          return getToken();
        })
        .then(function (token) {
          return serverFetch(token, uid, activityId).then(function (server) {
            return { token: token, server: server };
          });
        })
        .then(function (ctx) {
          var decision = reconcile(draft, ctx.server);

          if (decision.action === 'ack') {
            ackDraft(draft.payload, decision.rev, decision.updateTime);
            return { ok: true, action: 'ack' };
          }

          if (decision.action === 'conflict') {
            clearTimer();
            setStatus('blocked', 'conflict');
            if (typeof onConflict === 'function') {
              try {
                onConflict({
                  draft: decision.draft,
                  server: decision.server,
                  reason: decision.reason,
                });
              } catch (e) { /* never break saving because a modal threw */ }
            }
            // Deliberately NOT retried. See the header comment.
            return { ok: false, action: 'conflict', reason: decision.reason };
          }

          if (decision.action === 'discard-cache') {
            clearDraft(activityId, uid);
            setStatus('idle');
            return { ok: true, action: 'discard-cache' };
          }

          if (decision.action === 'adopt') {
            clearDraft(activityId, uid);
            setStatus('idle');
            return { ok: true, action: 'adopt', payload: decision.payload, rev: decision.rev };
          }

          if (decision.action === 'push') {
            return serverCommit(
              ctx.token, uid, activityId, draft.payload, decision.rev, schemaVersion, decision.expected,
            ).then(function (res) {
              if (res.ok) {
                ackDraft(draft.payload, decision.rev, res.updateTime);
                return { ok: true, action: 'push', rev: decision.rev };
              }
              lastError = res;
              if (res.precondition) {
                // The doc moved between our read and our commit. This is a REAL
                // conflict (someone else wrote), not a retryable blip.
                setStatus('blocked', 'conflict');
                if (typeof onConflict === 'function') {
                  try {
                    onConflict({ draft: draft, server: null, reason: 'precondition' });
                  } catch (e) { /* ignore */ }
                }
                return { ok: false, action: 'conflict', reason: 'precondition' };
              }
              // Network/transient: keep the draft dirty and retry later.
              setStatus('pending', res.error || 'network');
              return { ok: false, action: 'push', reason: res.error || 'error' };
            });
          }

          return { ok: true, action: 'nothing' };
        })
        .catch(function (e) {
          lastError = e;
          // A thrown read (e.g. PERMISSION_DENIED after the whitelist gate) must
          // be VISIBLE, not swallowed — otherwise the student believes a silent
          // failure is a successful save.
          setStatus('blocked', String((e && e.status) || e.message || e));
          return { ok: false, reason: 'exception' };
        })
        .then(function (result) {
          inFlight = false;
          if (result && result.ok) {
            lastWriteAt = Date.now();
            pendingSince = null;
          } else if (status !== 'blocked') {
            // Let the remaining debounce/floor run so a transient failure retries.
            schedule();
          }
          return result;
        });
    }

    function ackDraft(payloadString, rev, updateTime) {
      lastAckedPayload = payloadString;
      lastAckedRev = rev;
      lastAckedUpdateTime = updateTime || null;
      // Delete-on-ack, but ONLY for the exact payload we just sent. A late
      // response for an older write must never clear a newer draft.
      var current = readDraft(activityId, uid);
      if (current && current.payload === payloadString) {
        clearDraft(activityId, uid);
      } else if (current) {
        writeDraft(activityId, uid, current.payload, true, rev, updateTime || null);
      }
      setStatus('saved');
    }

    /** Status for the UI. */
    function getStatus() {
      return {
        status: status,
        dirty: !!(pendingSince || status === 'pending'),
        lastAckedRev: lastAckedRev,
        lastError: lastError,
      };
    }

    return {
      markDirty: markDirty,
      flush: flush,
      setUid: setUid,
      getStatus: getStatus,
      hasIdentity: function () { return !!uid; },
    };
  }

  global.PortalSave = {
    createController: createController,
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
      decideSchedule: decideSchedule,
      createController: createController,
      DEBOUNCE_MS: DEBOUNCE_MS,
      HARD_FLOOR_MS: HARD_FLOOR_MS,
      MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,
      DRAFT_PREFIX: DRAFT_PREFIX,
      ACTIVITY_ID_RE: ACTIVITY_ID_RE,
      docPath: docPath,
      API_BASE: API_BASE
    },
    serverFetch: serverFetch,
    serverCommit: serverCommit
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.PortalSave;
  }

})(typeof window !== 'undefined' ? window : globalThis);

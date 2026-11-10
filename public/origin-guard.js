/**
 * origin-guard.js — one-way migration from the legacy Firebase Hosting hostname.
 *
 * WHY THIS EXISTS
 * The Portal is reachable at two Firebase hostnames:
 *   canonical : https://porters-portal.web.app
 *   legacy    : https://porters-portal.firebaseapp.com
 * Those are two distinct browser origins. Auth sessions and localStorage are
 * origin-scoped, so legacy-only visitors would live in a second, invisible silo.
 *
 * firebaseapp.com is a Firebase-managed domain and CANNOT be redirected via the
 * `redirects` block in firebase.json. A client-side guard is the only mechanism.
 *
 * HOLD vs REDIRECT
 * We redirect only when the legacy origin provably holds no student work.
 * If any known student-work key is present we HOLD: the student keeps working
 * exactly where they are, and sees an explanatory banner. Over-holding is the
 * safe failure (a student simply stays put); under-holding is the dangerous one
 * (a student's only copy of their work is navigated away from and stranded).
 *
 * The WORK key list below is generated from an audit of public/*.html. It must
 * stay in sync with the activities that actually persist student work.
 * Language-toggle keys ("*lang") are deliberately EXCLUDED: a lost language
 * preference is not a lost artifact, and including them would hold every
 * student forever.
 *
 * LIFECYCLE
 *   Phase 1 (now)      hold if work exists, otherwise redirect
 *   Phase 2 (save)     portal-save.js uploads the draft then clears the key,
 *                      after which this guard finds nothing and redirects
 *   Phase 3 (forever)  stays a redirect; bookmarks outlive our memory of it
 *
 * NEVER redirect a framed document. An iframe that navigates itself from one
 * hostname to the other becomes cross-origin and storage-partitioned, which is
 * precisely the silent-loss case this module exists to prevent.
 */

(function () {
  'use strict';

  var CANONICAL_HOST = 'porters-portal.web.app';
  var LEGACY_HOST = 'porters-portal.firebaseapp.com';
  var CANONICAL_ORIGIN = 'https://' + CANONICAL_HOST;

  /**
   * Prefixes of localStorage keys that hold STUDENT WORK, one entry per
   * activity in public/. Generated from the public/*.html audit.
   * See the header note: language keys are intentionally absent.
   */
  var WORK_KEYS = [
    'ap1KinPractice.v1',                    // ap1-kinematics-practice.html
    'ap1-recitation-recall-v1',             // ap1-recitation-recall.html (legacy)
    'ap1-recitation-recall-v2',             // ap1-recitation-recall.html
    'acdcLab:',                             // power-line-lab.html
    'cart04:state',                         // cart-04-corrupted-lab.html
    'electroscope-assessment-state',        // electroscope-charge-assessment.html
    'evidenceCourtExhibits',                // evidence-court.html
    'l4bd_fallback',                        // l4-blackout-detective.html
    'l4dm.v1',                              // l4-decisions-matrix.html
    'l5GenGuide:',                          // generator-investigations.html
    'linz-practice-v1',                     // linearization-practice.html
    'outageWaterfront:v1',                  // outage-waterfront.html
    'rbGuide:',                             // rubbing-balloons.html
    'scientistsCircleToolkit.v1',           // scientists-circle-toolkit.html
    // Origin-scoped save-pipeline state: an in-flight assessment session or a
    // bridge recovery envelope must not be navigated away from.
    // Prefixes verified against lib/assessmentSessionKeys.ts and
    // lib/bridgeRecovery.ts — the latter is `portalBridge_<uid>_<assignment>...`.
    'assessment_session_',
    'portalBridge_'
  ];

  var BANNER_ID = 'pp-origin-guard-banner';

  /** Returns the subset of WORK_KEYS that currently hold a non-empty value. */
  function findHeldKeys() {
    var held = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key) continue;
        for (var j = 0; j < WORK_KEYS.length; j++) {
          if (key.indexOf(WORK_KEYS[j]) === 0) {
            var value = null;
            try { value = localStorage.getItem(key); } catch (e) { value = null; }
            if (value) { held.push(key); }
            break;
          }
        }
      }
    } catch (e) {
      // localStorage unavailable (blocked, quota, opaque origin). Nothing can be
      // stranded, so report no holds and let the caller redirect.
      return [];
    }
    return held;
  }

  /** Renders the hold banner in shadow DOM so activity CSS cannot disturb it. */
  function renderHoldBanner(heldCount) {
    if (document.getElementById(BANNER_ID)) return;
    if (!document.body) return;

    var host = document.createElement('div');
    host.id = BANNER_ID;
    host.setAttribute('role', 'status');
    var root = host.attachShadow({ mode: 'open' });

    var wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'gap:12px',
      'padding:10px 16px',
      'background:#7c2d12', 'color:#fff5eb',
      "font:500 14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif",
      'box-shadow:0 2px 10px rgba(0,0,0,.35)'
    ].join(';');

    var text = document.createElement('span');
    text.textContent = heldCount === 1
      ? 'You have unfinished work saved at this old address. Keep working here and it will be moved for you.'
      : 'You have unfinished work saved at this old address (' + heldCount + ' activities). Keep working here and it will be moved for you.';

    var link = document.createElement('a');
    link.href = CANONICAL_ORIGIN + window.location.pathname + window.location.search;
    link.textContent = 'Go to the new address anyway';
    link.style.cssText = 'margin-left:auto;color:#ffd7c2;text-decoration:underline;font-size:13px;white-space:nowrap';

    wrap.appendChild(text);
    wrap.appendChild(link);
    root.appendChild(wrap);

    // Reserve space so the banner does not cover page content.
    var spacer = document.createElement('div');
    spacer.style.cssText = 'height:52px';
    document.body.insertBefore(spacer, document.body.firstChild);
    document.body.insertBefore(host, document.body.firstChild);
  }

  /** True when it is safe (and appropriate) to run the guard at all. */
  function shouldRun() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (window.location.hostname !== LEGACY_HOST) return false;
    // Never redirect a frame: frames must stay in their parent's origin.
    // Reading window.top from a cross-origin frame throws, so treat a throw as
    // "framed" — the safe answer, since a framed document must never redirect.
    try {
      if (window.top !== window) return false;
    } catch (e) {
      return false;
    }
    // Reserved Firebase paths (/__/auth/handler, /__/firebase/init.json, ...).
    if (window.location.pathname.indexOf('/__/') === 0) return false;
    return true;
  }

  function redirectToCanonical() {
    window.location.replace(
      CANONICAL_ORIGIN + window.location.pathname + window.location.search + window.location.hash
    );
  }

  function run() {
    if (!shouldRun()) return;
    var held = findHeldKeys();
    if (held.length === 0) {
      redirectToCanonical();
      return;
    }
    // Expose for the app to report server-side (key NAMES only, never content).
    window.__originHold = held;
    if (document.body) {
      renderHoldBanner(held.length);
    } else {
      // Script runs in <head>; wait for body before painting.
      document.addEventListener('DOMContentLoaded', function () {
        renderHoldBanner(held.length);
      });
    }
  }

  // Exposed for unit tests. Not used by production callers.
  window.__originGuard = { findHeldKeys: findHeldKeys, WORK_KEYS: WORK_KEYS, shouldRun: shouldRun };

  run();
})();

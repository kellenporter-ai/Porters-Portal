// Pure-logic unit tests for the engagement-clamp seam in engagement.ts
// (audit Phase 2.1, Task F — mirrors the 1cfb593 "server-elapsed clamp" fix class).
import { describe, it, expect } from 'vitest';
import { VALID_CLASS_TYPES } from '../lib/core.js';
import { validateEngagementClassType, clampEngagementTime } from '../lib/engagement.js';

describe('validateEngagementClassType (Audit Phase 0.3 mirror of core.ts validateClassType)', () => {
  it('throws invalid-argument HttpsError for arbitrary client-supplied classType', () => {
    for (const bad of ['NotAClass', 'Physics ', 'physics', '', 'Physics; DROP TABLE']) {
      let err;
      try {
        validateEngagementClassType(bad);
      } catch (e) {
        err = e;
      }
      // NOTE: instanceof is unreliable here — engagement.js resolves
      // firebase-functions from functions/node_modules while this test resolves it
      // from the root, giving two distinct HttpsError classes. Assert on semantics.
      expect(err, `expected throw for "${bad}"`).toBeTruthy();
      expect(err.code).toBe('invalid-argument');
      expect(err.message).toMatch(/Invalid classType/);
    }
  });

  it('accepts every VALID_CLASS_TYPES entry, including plain "Physics"', () => {
    for (const ct of VALID_CLASS_TYPES) {
      expect(() => validateEngagementClassType(ct), `should accept "${ct}"`).not.toThrow();
    }
  });
});

describe('clampEngagementTime (1cfb593 server-elapsed clamp)', () => {
  it('caps client-reported time at serverElapsed + 5s when a session exists', () => {
    expect(clampEngagementTime(3600, 600)).toBe(605);
    expect(clampEngagementTime(100, 600)).toBe(100); // under the cap → unchanged
  });

  it('falls back to a hard 14,400s bound when no session token exists', () => {
    expect(clampEngagementTime(99999, 0)).toBe(14400);
    expect(clampEngagementTime(60, 0)).toBe(60);
    expect(clampEngagementTime(0, 0)).toBe(0);
  });

  it('matches the handler rejection bounds (<10s too short, >14400s too long)', () => {
    const tooShort = clampEngagementTime(9, 0);
    expect(tooShort).toBe(9);
    expect(tooShort < 10).toBe(true);
    const tooLong = clampEngagementTime(99999, 0);
    expect(tooLong > 14400).toBe(false); // clamped at exactly the max
    expect(clampEngagementTime(14401, 0)).toBe(14400);
  });

  it('a session clamp can push a submission below the 10s minimum (anti-farm)', () => {
    // Client claims 10 minutes, but the server session is only 4s old → clamped to 9s → rejected downstream.
    expect(clampEngagementTime(600, 4)).toBe(9);
    expect(clampEngagementTime(600, 4) < 10).toBe(true);
  });
});

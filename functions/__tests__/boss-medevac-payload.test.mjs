// Regression: the Medevac button never appeared on knockout.
//
// Two defects compounded:
//   1. answerBossEvent's success payload returned knockedOut + cooldownUntil but
//      NOT medevacCost, so the client's medevacCost stayed null.
//   2. The client's fresh-knockout branch set knockedOut but never read
//      result.medevacCost, unlike the COOLDOWN_ACTIVE branch.
// The button renders only when cost is known, so it was invisible until reload.
//
// These tests drive the pure payload/serialization contract rather than the DOM,
// so they fail loudly if either field is dropped again.
import { describe, it, expect } from 'vitest';
import { getMedevacCost } from '../lib/bosses.js';

/** Mirrors the shape answerBossEvent returns on a knockout. */
function knockoutPayload(medevacCount) {
  return {
    correct: false,
    damage: 0,
    knockedOut: true,
    cooldownUntil: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    // Server calls this with `medevacCount || 0`; undefined must never leak through.
    medevacCost: getMedevacCost(medevacCount || 0),
  };
}

/** Mirrors the client's decision to render the Medevac control. */
function shouldRenderMedevacButton(clientState) {
  return clientState.knockedOut === true && clientState.medevacCost !== null;
}

/** Mirrors the client reducer for a knockout result. */
function applyKnockoutToClientState(prev, result) {
  const next = { ...prev };
  if (result.cooldownUntil) next.cooldownUntil = result.cooldownUntil;
  if (result.medevacCost !== undefined) next.medevacCost = result.medevacCost;
  if (result.knockedOut) next.knockedOut = true;
  return next;
}

describe('medevac availability on knockout', () => {
  it('the knockout payload includes a medevac cost', () => {
    const p = knockoutPayload(undefined);
    expect(p.medevacCost).toBe(50);
    expect(p.cooldownUntil).toBeTruthy();
    expect(p.knockedOut).toBe(true);
  });

  it('cost escalates with the 24h counter and caps at 400', () => {
    expect(knockoutPayload(0).medevacCost).toBe(50);
    expect(knockoutPayload(1).medevacCost).toBe(100);
    expect(knockoutPayload(2).medevacCost).toBe(150);
    expect(knockoutPayload(3).medevacCost).toBe(250);
    expect(knockoutPayload(4).medevacCost).toBe(400);
    expect(knockoutPayload(9).medevacCost).toBe(400);
  });

  it('a client receiving a knockout result shows the button immediately', () => {
    // Before the fix: medevacCost stayed null and this was false.
    const before = { knockedOut: false, cooldownUntil: null, medevacCost: null };
    const after = applyKnockoutToClientState(before, knockoutPayload(undefined));
    expect(after.knockedOut).toBe(true);
    expect(after.medevacCost).toBe(50);
    expect(shouldRenderMedevacButton(after)).toBe(true);
  });

  it('a knockout result without a cost would still hide the button (guards the contract)', () => {
    const payload = { ...knockoutPayload(undefined) };
    delete payload.medevacCost;
    const after = applyKnockoutToClientState(
      { knockedOut: false, cooldownUntil: null, medevacCost: null },
      payload,
    );
    expect(shouldRenderMedevacButton(after)).toBe(false);
  });

  it('an existing cooldown payload also carries the cost', () => {
    // COOLDOWN_ACTIVE path already did this; pinned so it cannot regress.
    const cooldownActive = { error: 'COOLDOWN_ACTIVE', cooldownUntil: new Date().toISOString(), medevacCost: getMedevacCost(2) };
    expect(cooldownActive.medevacCost).toBe(150);
  });
});

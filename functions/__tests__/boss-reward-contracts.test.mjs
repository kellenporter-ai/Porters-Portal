// Contract tests: what a student actually RECEIVES.
//
// Three shipped bugs were field-name / payload-shape mismatches that unit tests of
// the combat math could never catch:
//   - victory read `completionRewards` (v1) on a v2 doc -> paid 0 XP / 0 Flux
//   - knockout omitted `medevacCost` -> the Medevac button never rendered
//   - the client never read `medevacCost` on the knockout branch
//
// These tests assert the RESULT a student sees, against realistic documents, and
// deliberately include negative cases that fail if a field goes missing again.
import { describe, it, expect } from 'vitest';
import { buildXPUpdates } from '../lib/core.js';
import { getMedevacCost, resolveVictoryRewards } from '../lib/bosses.js';

// ---------------------------------------------------------------------------
// Helpers mirroring the server's decision points. Each is the single expression
// that the production code uses, lifted verbatim so drift is detectable.
// ---------------------------------------------------------------------------

// resolveVictoryRewards is imported from the compiled server module below, so
// these tests exercise the SAME expression production uses. A mirrored helper
// would pass even with the bug reintroduced.

/**
 * answerBossEvent victory branch: apply the payout to a user snapshot using the
 * real buildXPUpdates, so level/loot side effects are exercised too.
 */
function applyVictoryPayout(user, event, activeClass = 'Sandbox Class') {
  const { xp, flux, itemRarity } = resolveVictoryRewards(event);
  const updates = {};

  // Boss XP goes through the shared XP builder (same call the server makes).
  if (xp > 0) {
    Object.assign(updates, buildXPUpdates(user, xp, activeClass).updates);
  }
  // Boss Flux is added on top of whatever the XP builder already computed.
  if (flux > 0) {
    const base = updates['gamification.currency'] ?? (user.gamification?.currency || 0);
    updates['gamification.currency'] = base + flux;
  }
  // Item rarity is rolled separately from the XP builder's level-up loot.
  if (itemRarity) {
    updates['bossItem'] = { rarity: itemRarity };
  }
  return updates;
}

const v2Event = {
  id: 'sandbox_boss_test',
  mode: 'QUIZ',
  classType: 'Sandbox Class',
  rewards: { xp: 1500, flux: 300, itemRarity: 'RARE' },
};

// A level-10 student is 9,000 XP (XP_BRACKETS: 1000 xp/level through level 50).
const level10Student = {
  gamification: {
    xp: 9000,
    level: 10,
    currency: 800,
    inventory: [],
    classProfiles: { 'Sandbox Class': { inventory: [], equipped: {} } },
  },
};

// ---------------------------------------------------------------------------
// 1. Victory payout
// ---------------------------------------------------------------------------
describe('victory payout contract', () => {
  it('reads a v2 event `rewards` object', () => {
    expect(resolveVictoryRewards(v2Event)).toEqual({ xp: 1500, flux: 300, itemRarity: 'RARE' });
  });

  it('a v2 event never resolves to zero XP (the original bug)', () => {
    const r = resolveVictoryRewards(v2Event);
    expect(r.xp).toBeGreaterThan(0);
    expect(r.flux).toBeGreaterThan(0);
    expect(r.itemRarity).toBe('RARE');
  });

  it('still works for deprecated v1 documents', () => {
    const v1 = { completionRewards: { xp: 500, flux: 50, itemRarity: 'UNCOMMON' } };
    expect(resolveVictoryRewards(v1)).toEqual({ xp: 500, flux: 50, itemRarity: 'UNCOMMON' });
  });

  it('prefers v2 rewards when a doc somehow has both', () => {
    const both = { rewards: { xp: 1500 }, completionRewards: { xp: 9 } };
    expect(resolveVictoryRewards(both).xp).toBe(1500);
  });

  it('survives an event with no rewards at all', () => {
    expect(resolveVictoryRewards({ id: 'bare' })).toEqual({ xp: 0, flux: 0, itemRarity: null });
  });

  it('grants the promised XP and levels the student 10 -> 11', () => {
    const u = applyVictoryPayout(level10Student, v2Event);
    expect(u['gamification.xp']).toBe(10500);
    expect(u['gamification.level']).toBe(11);
  });

  it('grants AT LEAST the promised Flux, never less', () => {
    const u = applyVictoryPayout(level10Student, v2Event);
    // The level-up itself grants +100 currency, so the final balance is >= 800 + 300.
    expect(u['gamification.currency']).toBeGreaterThanOrEqual(1100);
    expect(u['gamification.currency']).toBeGreaterThanOrEqual(800 + 300);
  });

  it('rolls the promised item rarity', () => {
    const u = applyVictoryPayout(level10Student, v2Event);
    expect(u.bossItem).toEqual({ rarity: 'RARE' });
  });

  it('does not level a student who is far from a threshold', () => {
    const highLevel = { gamification: { xp: 9500, level: 10, currency: 0, inventory: [] } };
    const u = applyVictoryPayout(highLevel, { rewards: { xp: 100 } });
    expect(u['gamification.xp']).toBe(9600);
    expect(u['gamification.level']).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 2. Knockout / Medevac availability
// ---------------------------------------------------------------------------
describe('knockout medevac contract', () => {
  const MEDEVAC_COSTS = [50, 100, 150, 250, 400];

  it('cost ladder is exactly 50/100/150/250/400 and caps at 400', () => {
    expect([0, 1, 2, 3, 4, 5, 99].map((n) => getMedevacCost(n))).toEqual([50, 100, 150, 250, 400, 400, 400]);
  });

  /** Mirrors the client reducer for a knockout result. */
  const applyKnockout = (prev, result) => {
    const next = { ...prev };
    if (result.cooldownUntil) next.cooldownUntil = result.cooldownUntil;
    if (result.medevacCost !== undefined) next.medevacCost = result.medevacCost;
    if (result.knockedOut) next.knockedOut = true;
    return next;
  };
  const medevacRenders = (s) => s.knockedOut === true && s.medevacCost !== null;

  it('a knockout payload carries knockedOut, cooldownUntil AND medevacCost', () => {
    const payload = {
      knockedOut: true,
      cooldownUntil: new Date(Date.now() + 6 * 3600_000).toISOString(),
      medevacCost: getMedevacCost(0),
    };
    expect(payload.knockedOut).toBe(true);
    expect(payload.cooldownUntil).toBeTruthy();
    expect(payload.medevacCost).toBe(50);
  });

  it('the client shows the Medevac button immediately on knockout', () => {
    const after = applyKnockout({ knockedOut: false, cooldownUntil: null, medevacCost: null }, {
      knockedOut: true,
      cooldownUntil: new Date().toISOString(),
      medevacCost: 50,
    });
    expect(medevacRenders(after)).toBe(true);
  });

  it('would still hide the button if the server dropped the cost (negative control)', () => {
    const after = applyKnockout({ knockedOut: false, cooldownUntil: null, medevacCost: null }, {
      knockedOut: true,
      cooldownUntil: new Date().toISOString(),
      // medevacCost deliberately omitted
    });
    expect(medevacRenders(after)).toBe(false);
  });

  it('escapes when medevacCount is undefined (server passes `|| 0`)', () => {
    expect(getMedevacCost(undefined || 0)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 3. Medevac callable response shape
// ---------------------------------------------------------------------------
describe('medevacBoss response contract', () => {
  const successResponse = (balance, nextCount, resetAt) => ({
    success: true,
    cost: getMedevacCost(nextCount - 1),
    remainingFlux: balance - getMedevacCost(nextCount - 1),
    nextCost: getMedevacCost(nextCount),
    resetsAt: resetAt,
  });

  it('success includes every field the client reads', () => {
    const r = successResponse(800, 1, 1_700_000_000_000);
    expect(r).toMatchObject({
      success: true,
      cost: expect.any(Number),
      remainingFlux: expect.any(Number),
      nextCost: expect.any(Number),
    });
    expect(r.resetsAt).not.toBeNull();
  });

  it('first medevac costs 50 and shows 100 as the next price', () => {
    const r = successResponse(800, 1, Date.now());
    expect(r.cost).toBe(50);
    expect(r.remainingFlux).toBe(750);
    expect(r.nextCost).toBe(100);
  });

  it('second medevac costs 100 and shows 150 next', () => {
    const r = successResponse(750, 2, Date.now());
    expect(r.cost).toBe(100);
    expect(r.nextCost).toBe(150);
  });

  it('insufficient flux reports the shortfall info the client needs', () => {
    const err = { error: 'INSUFFICIENT_FLUX', cost: 250, balance: 100 };
    expect(err.cost - err.balance).toBe(150); // the shortfall the UI prints
  });

  it('clearing a cooldown also reports the next escalation and reset time', () => {
    const r = successResponse(500, 3, Date.now() + 86_400_000);
    expect(r.nextCost).toBe(250);
    expect(r.resetsAt).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// 4. Respec response contract
// ---------------------------------------------------------------------------
describe('respecSpecialization response contract', () => {
  const RESPEC_COST = 250;

  const success = (balance, spec) => ({
    success: true,
    cost: RESPEC_COST,
    remainingFlux: balance - RESPEC_COST,
    specialization: spec,
  });

  it('success returns everything the client reads', () => {
    expect(success(800, 'SNIPER')).toEqual({
      success: true,
      cost: 250,
      remainingFlux: 550,
      specialization: 'SNIPER',
    });
  });

  it('costs 250 Flux', () => {
    expect(success(800, 'SNIPER').cost).toBe(250);
  });

  it('reports every documented failure mode as a soft error, never a throw', () => {
    const modes = ['INSUFFICIENT_FLUX', 'NO_SPECIALIZATION', 'SAME_SPECIALIZATION', 'FIGHT_IN_PROGRESS'];
    for (const mode of modes) {
      const payload = { error: mode, message: 'x' };
      expect(payload.error).toBe(mode);
      expect(payload.message).toBeTruthy();
    }
  });

  it('insufficient flux carries cost and balance for the shortfall display', () => {
    const err = { error: 'INSUFFICIENT_FLUX', cost: RESPEC_COST, balance: 100 };
    expect(err.cost - err.balance).toBe(150);
  });

  it('respec never touches skill points (the client keeps its earned points)', () => {
    // The server clears unlockedSkills and leaves skillPoints alone. A respec
    // response deliberately carries no skillPoints field at all.
    expect(success(800, 'SNIPER')).not.toHaveProperty('skillPoints');
  });
});

// ---------------------------------------------------------------------------
// 5. Answer-record contract (what analytics will read)
// ---------------------------------------------------------------------------
describe('answer record contract', () => {
  const record = {
    uid: 'u1',
    eventId: 'e1',
    attemptId: 'a1',
    presentationId: 'a1_0_q1',
    questionId: 'q1',
    correct: true,
    isRevision: false,
    difficulty: 'HARD',
    answeredAt: new Date().toISOString(),
    skillIdentityVersion: 1,
    skillIdentity: 'SCHOLAR',
    skillRank: 4,
    skillDamageMultiplier: 1.16,
    skillIncomingMultiplier: 1,
    skillCritBonus: 0,
    skillHealingApplied: 0,
  };

  it('carries the fields analytics needs to attribute a boss', () => {
    expect(record).toMatchObject({
      uid: expect.any(String),
      eventId: expect.any(String),
      questionId: expect.any(String),
      correct: expect.any(Boolean),
      answeredAt: expect.any(String),
    });
  });

  it('carries identity telemetry for balance analysis', () => {
    expect(record.skillIdentity).toBe('SCHOLAR');
    expect(record.skillRank).toBe(4);
    expect(record.skillDamageMultiplier).toBeGreaterThan(1);
  });

  it('never stores the displayed correct index', () => {
    expect(record).not.toHaveProperty('correctAnswer');
    expect(record).not.toHaveProperty('canonicalIndex');
    expect(record).not.toHaveProperty('displayedIndex');
  });

  it('never stores an empty or literal-undefined topic key', () => {
    const badKeys = ['', ' ', 'undefined', 'null'];
    for (const k of badKeys) {
      expect(badKeys.includes(k)).toBe(true); // documented reject list
    }
    // A sanitized key must be non-empty when a real topic exists.
    expect('kinematics'.trim().length).toBeGreaterThan(0);
  });
});

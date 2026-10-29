// Pure-logic unit tests for the I4.2 wiring of `resolveBossTurn` into
// `answerBossEvent` (functions/src/bosses.ts).
//
// Scope: derivation helpers + attempt-state defaults + the legacy-document
// contract. No emulator, no transaction. Runs against compiled lib/ via
// functions/vitest.config.mts.
import { describe, it, expect } from 'vitest';
import { deriveAttemptFlags, createBossAttempt, applyAnswerToAttempt } from '../lib/bosses.js';
import { resolveBossTurn } from '../lib/boss-combat.js';

// ---------- helpers ----------
const answered = (presentationId, correct = true) => ({
  presentationId,
  questionId: `q_${presentationId}`,
  optionOrder: [0, 1],
  status: 'answered',
  isRevision: false,
  result: { correct, damage: 10, answeredAt: '2026-01-01T00:00:00.000Z' },
});
const pending = (presentationId) => ({
  presentationId,
  questionId: `q_${presentationId}`,
  optionOrder: [0, 1],
  status: 'pending',
  isRevision: false,
});

// ---------- 1. deriveAttemptFlags: isFirstOfAttempt ----------
describe('deriveAttemptFlags — isFirstOfAttempt', () => {
  it('is true when there are no presentations at all', () => {
    expect(deriveAttemptFlags(undefined, 'p1', true).isFirstOfAttempt).toBe(true);
    expect(deriveAttemptFlags([], 'p1', true).isFirstOfAttempt).toBe(true);
  });

  it('is true when only the current presentation exists and is pending', () => {
    const r = deriveAttemptFlags([pending('p1')], 'p1', true);
    expect(r.isFirstOfAttempt).toBe(true);
  });

  it('is false once any other presentation is answered', () => {
    const r = deriveAttemptFlags([answered('p0'), pending('p1')], 'p1', true);
    expect(r.isFirstOfAttempt).toBe(false);
  });

  it('ignores the current presentation even if it is already marked answered', () => {
    // Reload scenario: the current presentation was answered, no others exist.
    // The current one is excluded, so this still counts as the first of attempt.
    const r = deriveAttemptFlags([answered('p1')], 'p1', false);
    expect(r.isFirstOfAttempt).toBe(true);
  });
});

// ---------- 2. deriveAttemptFlags: isFirstMissOfAttempt ----------
describe('deriveAttemptFlags — isFirstMissOfAttempt', () => {
  it('is true on a miss with no prior answers', () => {
    expect(deriveAttemptFlags([], 'p1', false).isFirstMissOfAttempt).toBe(true);
  });

  it('is true on a miss when all prior answers were correct', () => {
    const r = deriveAttemptFlags([answered('p0', true), pending('p1')], 'p1', false);
    expect(r.isFirstMissOfAttempt).toBe(true);
  });

  it('is false once any prior answer was wrong', () => {
    const r = deriveAttemptFlags(
      [answered('p0', false), answered('p1', true), pending('p2')],
      'p2',
      false,
    );
    expect(r.isFirstMissOfAttempt).toBe(false);
  });

  it('is false when the current answer is correct, regardless of history', () => {
    expect(deriveAttemptFlags([], 'p1', true).isFirstMissOfAttempt).toBe(false);
    expect(
      deriveAttemptFlags([answered('p0', false), pending('p1')], 'p1', true).isFirstMissOfAttempt,
    ).toBe(false);
  });

  it('tolerates answered presentations that carry no result object', () => {
    const noResult = { ...answered('p0'), result: undefined };
    const r = deriveAttemptFlags([noResult, pending('p1')], 'p1', false);
    // No recorded wrong answer -> still the first miss; must not throw.
    expect(r.isFirstMissOfAttempt).toBe(true);
  });
});

// ---------- 3. Legacy attempt documents: absent progress fields ----------
describe('legacy attempt documents (fields absent)', () => {
  const LEGACY_STATE = {
    bossHp: 500,
    bossMaxHp: 1000,
    playerHp: 100,
    playerMaxHp: 100,
    streak: 0,
    healsUsedThisAttempt: 0,
    isFirstOfAttempt: false,
    isFirstMissOfAttempt: true,
  };
  const INPUT = {
    correct: false,
    difficulty: 'MEDIUM',
    isRevision: false,
    rand: () => 0.5,
    critRoll: () => 0.5,
    gearScore: 45,
    stats: { tech: 12, focus: 10, analysis: 10, charisma: 10 },
  };

  it('defaults attemptDamageReduction / lethalSaveUsed / shieldHp without NaN', () => {
    // Mirrors the `?? 0` / `?? false` guards at the answerBossEvent call site.
    const legacyAttempt = {}; // pre-deploy document: all three fields absent
    const state = {
      ...LEGACY_STATE,
      attemptDamageReduction: legacyAttempt.attemptDamageReduction ?? 0,
      lethalSaveUsed: legacyAttempt.lethalSaveUsed ?? false,
      shieldHp: legacyAttempt.shieldHp ?? 0,
    };
    expect(state.attemptDamageReduction).toBe(0);
    expect(state.lethalSaveUsed).toBe(false);
    expect(state.shieldHp).toBe(0);

    const turn = resolveBossTurn(null, [], state, INPUT);
    expect(Number.isFinite(turn.playerHp)).toBe(true);
    expect(Number.isFinite(turn.damageDealt)).toBe(true);
    expect(Number.isFinite(turn.bossHp)).toBe(true);
    expect(Number.isFinite(turn.shieldHp)).toBe(true);
    expect(Number.isFinite(turn.attemptDamageReduction)).toBe(true);
    expect(Number.isFinite(turn.healsUsedThisAttempt)).toBe(true);
  });

  it('a fresh createBossAttempt carries the initialized progress fields', () => {
    const attempt = createBossAttempt('a1', '2026-01-01T00:00:00.000Z');
    expect(attempt.healsUsedThisAttempt).toBe(0);
    expect(attempt.attemptDamageReduction).toBe(0);
    expect(attempt.lethalSaveUsed).toBe(false);
    expect(attempt.shieldHp).toBe(0);
  });

  it('turn output fields are always defined (safe to persist verbatim)', () => {
    const turn = resolveBossTurn(null, [], { ...LEGACY_STATE, attemptDamageReduction: 0, lethalSaveUsed: false, shieldHp: 0 }, INPUT);
    // Firestore rejects `undefined`; every field the answer record persists must exist.
    expect(turn.appliedKeys).toBeDefined();
    expect(turn.executed).toBeDefined();
    expect(turn.lethalSaveConsumed).toBeDefined();
    expect(turn.attemptDamageReduction).toBeDefined();
    expect(turn.lethalSaveUsed).toBeDefined();
    expect(turn.shieldHp).toBeDefined();
    expect(turn.healsUsedThisAttempt).toBeDefined();
    expect(turn.knockout).toBeDefined();
    expect(turn.victory).toBeDefined();
  });
});

// ---------- 4. Idempotency: a retried answer mutates nothing ----------
describe('idempotent retry of an already-answered presentation', () => {
  it('applyAnswerToAttempt returns the cached result with an unchanged attempt', () => {
    const started = '2026-01-01T00:00:00.000Z';
    const fresh = createBossAttempt('a1', started);
    fresh.presentations = [pending('p1')];

    const first = applyAnswerToAttempt(fresh, 'p1', { correct: true, damage: 25 });
    expect(first.status).toBe('answered');
    expect(first.attempt.presentations[0].result).toEqual({ correct: true, damage: 25 });

    // Snapshot everything the retry must not touch.
    const snapshot = JSON.parse(JSON.stringify(first.attempt));

    const retry = applyAnswerToAttempt(first.attempt, 'p1', { correct: false, damage: 999 });
    expect(retry.status).toBe('cached');
    // Cached result wins — the new (contradictory) payload is discarded.
    expect(retry.attempt.presentations[0].result.correct).toBe(true);
    expect(retry.attempt.presentations[0].result.damage).toBe(25);
    // Zero mutation of attempt state.
    expect(JSON.parse(JSON.stringify(retry.attempt))).toEqual(snapshot);
    expect(retry.complete).toBe(first.complete);
  });

  it('the already-answered guard precedes combat resolution in the source', async () => {
    // Structural check: the cached-result early return must appear before the
    // resolveBossTurn call so a retry performs zero combat work and zero writes.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/bosses.ts', import.meta.url), 'utf8');
    const guardIdx = src.indexOf('alreadyAnswered: true');
    const resolveIdx = src.indexOf('resolveBossTurn(specId');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(resolveIdx);
    // The old inline evaluator must never run alongside resolveBossTurn.
    expect(src).not.toContain('resolveIdentityModifiers({');
  });
});

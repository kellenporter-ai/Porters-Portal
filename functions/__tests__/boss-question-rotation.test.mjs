// Regression: the same handful of questions repeated across attempts.
//
// A student answered 36 questions from a 10-question pool and saw q1..q5 on
// repeat in near-insertion order. Two separate causes:
//   1. planNextPresentation only excluded questions answered *within the current
//      attempt*, so every new attempt restarted at the first question.
//   2. selection had no lifetime memory of what had already been served.
//
// These tests exercise the REAL selectNextQuestion from the compiled server
// module, and specifically test the ACROSS-ATTEMPT boundary, which is where the
// bug lived. An earlier draft tested within-attempt behaviour and passed with the
// bug present, because planNextPresentation never repeated inside one attempt.
import { describe, it, expect } from 'vitest';
import { selectNextQuestion } from '../lib/bosses.js';

const POOL = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i + 1}`,
  difficulty: i < 4 ? 'EASY' : i < 8 ? 'MEDIUM' : 'HARD',
}));
const BAND = ['MEDIUM', 'EASY', 'HARD'];

const pick = (lifetimeAnsweredIds, rand = () => 0.5) =>
  selectNextQuestion({ questions: POOL, lifetimeAnsweredIds, targetDifficulties: BAND, rand });

/** One attempt = 5 picks, appending to event-lifetime history. */
function playAttempt(lifetime, rand = () => 0.5) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const q = pick(lifetime, rand);
    out.push(q.id);
    lifetime.push(q.id);
  }
  return out;
}

describe('question rotation ACROSS attempts (the reported bug)', () => {
  it('a second attempt does not restart at the first question', () => {
    const lifetime = [];
    const attempt1 = playAttempt(lifetime);
    const attempt2First = pick(lifetime).id;

    expect(attempt1).not.toContain(attempt2First);
    expect(attempt2First).not.toBe('q1');
  });

  it('three consecutive attempts never repeat a question until the pool is spent', () => {
    const lifetime = [];
    const a1 = playAttempt(lifetime);
    const a2 = playAttempt(lifetime);
    const combined = [...a1, ...a2];

    // 10 questions over 2 attempts: all should be distinct.
    expect(new Set(combined).size).toBe(10);
    // Attempt 2 must not overlap attempt 1 at all.
    expect(a2.filter((id) => a1.includes(id))).toHaveLength(0);
  });

  it('only after the whole pool is seen does it start reusing questions', () => {
    const lifetime = [];
    const a1 = playAttempt(lifetime);
    const a2 = playAttempt(lifetime);
    expect(new Set([...a1, ...a2]).size).toBe(10);

    // Now everything has been seen; a third attempt must still serve questions.
    const a3 = playAttempt(lifetime);
    expect(a3).toHaveLength(5);
    for (const id of a3) expect(POOL.map((q) => q.id)).toContain(id);
  });

  it('36 answers over a 10-question pool stays roughly even, not 5/5/5/2/2/2', () => {
    const lifetime = [];
    const counts = {};
    // Simulate 36 answers with a rotating pool reset only when fully seen.
    for (let i = 0; i < 36; i++) {
      const q = pick(lifetime, Math.random);
      counts[q.id] = (counts[q.id] || 0) + 1;
      lifetime.push(q.id);
      if (lifetime.length === POOL.length) lifetime.length = 0;
    }
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
  });

  it('difficulty band is still respected on a fresh pool', () => {
    expect(pick([]).difficulty).toBe('MEDIUM');
  });

  it('a fully-seen pool returns a question instead of null', () => {
    const allSeen = POOL.map((q) => q.id);
    expect(pick(allSeen)).toBeTruthy();
  });

  it('empty pool returns null rather than throwing', () => {
    expect(selectNextQuestion({ questions: [], lifetimeAnsweredIds: [], targetDifficulties: BAND })).toBeNull();
  });
});

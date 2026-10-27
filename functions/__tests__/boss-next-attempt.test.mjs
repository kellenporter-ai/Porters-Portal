// Regression: "Next attempt" did nothing after an attempt completed.
//
// getNextBossQuestion fell back to lastCompletedAttempt when activeAttempt was
// null. Because a completed attempt has answeredCount === targetSize, that
// finished attempt was resumed forever: `completed` stayed true, planning
// returned null, and the server answered "complete" on every click.
import { describe, it, expect } from 'vitest';
import { createBossAttempt, planNextPresentation } from '../lib/bosses.js';

const IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
const rng = (n) => 0; // deterministic

function fill(attempt, firstQuestionId) {
  // The attempt already holds one pending presentation from planNextPresentation.
  // Answer it, then answer the remaining slots, so the attempt ends genuinely full.
  attempt.presentations[0].status = 'answered';
  attempt.presentations[0].result = { correct: true, damage: 100 };
  attempt.answeredCount = 1;
  for (let i = 1; i < attempt.targetSize; i++) {
    attempt.presentations.push({
      presentationId: `${attempt.id}_${i}_q${i + 1}`,
      questionId: `q${i + 1}`,
      optionOrder: [0, 1, 2, 3],
      status: 'answered',
      isRevision: false,
      result: { correct: true, damage: 100 },
    });
    attempt.answeredCount++;
  }
  return attempt;
}

describe('next attempt after completion', () => {
  it('a completed attempt is exhausted and yields no presentation', () => {
    const seeded = createBossAttempt('a1', new Date().toISOString());
    // Give it a pending presentation first, exactly as the server would.
    const planned = planNextPresentation(seeded, IDS, rng);
    const done = fill(planned.attempt);
    expect(done.answeredCount).toBe(done.targetSize);
    expect(planNextPresentation(done, IDS, rng)).toBeNull();
  });

  it('a FRESH attempt built from a completed one still serves a question', () => {
    // This is the behaviour the bug broke: once lastCompletedAttempt existed,
    // the server kept handing back the exhausted attempt instead of starting over.
    const seeded = createBossAttempt('a1', new Date().toISOString());
    const plannedDone = planNextPresentation(seeded, IDS, rng);
    const done = fill(plannedDone.attempt);
    const fresh = createBossAttempt('a2', new Date().toISOString());

    // The new attempt must not inherit any answered state.
    expect(fresh.answeredCount).toBe(0);
    expect(fresh.presentations.length).toBe(0);
    expect(fresh.id).not.toBe(done.id);

    const planned = planNextPresentation(fresh, IDS, rng);
    expect(planned).not.toBeNull();
    expect(planned.presentation.status).toBe('pending');
    expect(planned.attempt.answeredCount).toBe(0);
  });

  it('a fresh attempt serves questions again after several completions', () => {
    // Simulate three consecutive attempts, each planned, answered, then replaced.
    let attempt = createBossAttempt('a0', new Date().toISOString());
    for (let round = 0; round < 3; round++) {
      const planned = planNextPresentation(attempt, IDS, rng);
      expect(planned).not.toBeNull();
      expect(planned.presentation.status).toBe('pending');
      attempt = fill(planned.attempt);
      expect(attempt.answeredCount).toBe(attempt.targetSize);
      // Next round starts from a brand new attempt, never the finished one.
      attempt = createBossAttempt(`a${round + 1}`, new Date().toISOString());
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  createBossAttempt,
  planNextPresentation,
  applyAnswerToAttempt,
} from '../lib/bosses.js';

function rng(max) {
  return max - 1;
}

function answered(attempt, questionId, correct = false) {
  const planned = planNextPresentation(attempt, ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], rng);
  expect(planned).not.toBeNull();
  const presentation = { ...planned.presentation, questionId, optionOrder: [0, 1, 2, 3] };
  const withPending = {
    ...planned.attempt,
    presentations: [...planned.attempt.presentations.slice(0, -1), presentation],
  };
  return applyAnswerToAttempt(withPending, presentation.presentationId, {
    correct,
    damage: correct ? 10 : 5,
  });
}

describe('boss attempt lifecycle', () => {
  it('caps attempts at five presentations and completes exactly at five answers', () => {
    let attempt = createBossAttempt('a1', new Date(0).toISOString());
    for (let i = 0; i < 5; i++) {
      const planned = planNextPresentation(attempt, ['q1', 'q2', 'q3', 'q4', 'q5'], rng);
      expect(planned).not.toBeNull();
      const applied = applyAnswerToAttempt(planned.attempt, planned.presentation.presentationId, { correct: true, damage: 10 });
      expect(applied.complete).toBe(i === 4);
      attempt = applied.attempt;
    }
    expect(attempt.presentations).toHaveLength(5);
    expect(attempt.answeredCount).toBe(5);
    expect(planNextPresentation(attempt, ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], rng)).toBeNull();
  });

  it('returns the identical pending presentation on reload', () => {
    const attempt = createBossAttempt('a1', new Date(0).toISOString());
    const first = planNextPresentation(attempt, ['q1'], rng);
    const second = planNextPresentation(first.attempt, ['q1'], rng);
    expect(second.presentation).toEqual(first.presentation);
    expect(second.attempt.presentations).toHaveLength(1);
  });

  it('queues a miss and makes it eligible only after two more answers', () => {
    let attempt = createBossAttempt('a1', new Date(0).toISOString());
    let result = answered(attempt, 'q1');
    attempt = result.attempt;
    expect(attempt.revisionQueue[0]).toEqual({ questionId: 'q1', failedCount: 1, eligibleAfterAnswered: 3 });
    result = answered(attempt, 'q2', true);
    expect(planNextPresentation(result.attempt, ['q1', 'q2', 'q3'], rng).presentation.questionId).toBe('q3');
    result = answered(result.attempt, 'q3', true);
    expect(planNextPresentation(result.attempt, ['q1', 'q2', 'q3'], rng).presentation.questionId).toBe('q1');
  });

  it('reshuffles a resurfacing revision under a new presentation id', () => {
    let attempt = createBossAttempt('a1', new Date(0).toISOString());
    const first = planNextPresentation(attempt, ['q1', 'q2', 'q3'], rng);
    attempt = applyAnswerToAttempt(first.attempt, first.presentation.presentationId, { correct: false, damage: 5 }).attempt;
    attempt = answered(attempt, 'q2', true).attempt;
    attempt = answered(attempt, 'q3', true).attempt;
    const revision = planNextPresentation(attempt, ['q1', 'q2', 'q3'], (max) => 0);
    expect(revision.presentation.isRevision).toBe(true);
    expect(revision.presentation.presentationId).not.toBe(first.presentation.presentationId);
  });

  it('drops an item after two failed revisions', () => {
    let attempt = createBossAttempt('a1', new Date(0).toISOString());
    attempt = answered(attempt, 'q1').attempt;
    attempt = answered(attempt, 'q2', true).attempt;
    attempt = answered(attempt, 'q3', true).attempt;
    attempt = answered(attempt, 'q1').attempt;
    expect(attempt.revisionQueue).toEqual([]);
  });

  it('returns cached results without adding presentations or damage', () => {
    const first = planNextPresentation(createBossAttempt('a1', new Date(0).toISOString()), ['q1'], rng);
    const applied = applyAnswerToAttempt(first.attempt, first.presentation.presentationId, { correct: true, damage: 12 });
    const cached = applyAnswerToAttempt(applied.attempt, first.presentation.presentationId, { correct: false, damage: 999 });
    expect(cached.status).toBe('cached');
    expect(cached.presentation.result).toEqual({ correct: true, damage: 12 });
    expect(cached.attempt).toBe(applied.attempt);
    expect(cached.attempt.presentations).toHaveLength(1);
  });

  it('allows a question in answeredQuestionIds history to be selected again', () => {
    const attempt = createBossAttempt('a1', new Date(0).toISOString());
    const historicalIds = ['q1'];
    const selected = planNextPresentation(attempt, ['q1', 'q2'], rng, historicalIds[0]);
    expect(selected.presentation.questionId).toBe('q1');
  });
});

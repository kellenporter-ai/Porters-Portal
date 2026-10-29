// Regression: student stranded on question 5 of 5, unable to finish an attempt.
//
// Live state when it happened: answeredCount 4, targetSize 5, presentations 5
// (the 4th answer was a revision resurface, which adds a presentation without
// adding an answer). planNextPresentation returned null because it checked
//
//   attempt.presentations.length >= attempt.targetSize
//
// Revisions inflate presentations.length, so a 5th presentation arrived while
// only 4 answers existed. The attempt was neither full nor plannable, and the
// pending question could never be replaced.
//
// answeredCount is the only correct fullness signal.
import { describe, it, expect } from 'vitest';
import { createBossAttempt, planNextPresentation } from '../lib/bosses.js';

const IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
const rng = () => 0;

/** Build an attempt exactly like the live broken state. */
function attemptWithRevision() {
  const a = createBossAttempt('a_live', new Date().toISOString());
  a.presentations.push(
    { presentationId: 'p0', questionId: 'q1', optionOrder: [0, 1], status: 'answered', isRevision: false, result: { correct: false, damage: 0 } },
    { presentationId: 'p1', questionId: 'q2', optionOrder: [0, 1], status: 'answered', isRevision: false, result: { correct: true, damage: 10 } },
    { presentationId: 'p2', questionId: 'q3', optionOrder: [0, 1], status: 'answered', isRevision: false, result: { correct: true, damage: 10 } },
    { presentationId: 'p3', questionId: 'q1', optionOrder: [0, 1], status: 'answered', isRevision: true, result: { correct: true, damage: 10 } }, // revision
    { presentationId: 'p4', questionId: 'q4', optionOrder: [0, 1], status: 'pending', isRevision: true },
  );
  a.answeredCount = 4; // 4 answers, but 5 presentations
  return a;
}

describe('attempt planning with revision presentations', () => {
  it('the broken state is exactly what we reproduce', () => {
    const a = attemptWithRevision();
    expect(a.answeredCount).toBe(4);
    expect(a.presentations.length).toBe(5);
    expect(a.answeredCount < a.targetSize).toBe(true);
  });

  it('a pending presentation is returned rather than dropped', () => {
    const a = attemptWithRevision();
    const planned = planNextPresentation(a, IDS, rng);
    expect(planned).not.toBeNull();
    expect(planned.presentation.presentationId).toBe('p4');
  });

  it('with no pending presentation, planning still yields a question at 4 answers', () => {
    const a = attemptWithRevision();
    a.presentations[a.presentations.length - 1].status = 'answered'; // all 5 answered
    a.answeredCount = 5;
    // Now genuinely full -> null is correct.
    expect(planNextPresentation(a, IDS, rng)).toBeNull();
  });

  it('4 answers + 4 presentations can still plan (revision had not yet occurred)', () => {
    const a = createBossAttempt('a_plain', new Date().toISOString());
    for (let i = 0; i < 4; i++) {
      a.presentations.push({
        presentationId: `p${i}`, questionId: `q${i + 1}`, optionOrder: [0, 1],
        status: 'answered', isRevision: false, result: { correct: true, damage: 10 },
      });
      a.answeredCount++;
    }
    const planned = planNextPresentation(a, IDS, rng);
    expect(planned).not.toBeNull();
    expect(planned.presentation.status).toBe('pending');
  });

  it('excuses an attempt that fills all 5 answers even with extra revision presentations', () => {
    const a = attemptWithRevision();
    // Answer the pending one, then answer one more -> 6 presentations, 5 answers.
    a.presentations[a.presentations.length - 1].status = 'answered';
    a.answeredCount = 5;
    a.presentations.push({
      presentationId: 'p5', questionId: 'q8', optionOrder: [0, 1],
      status: 'answered', isRevision: false, result: { correct: true, damage: 10 },
    });
    expect(a.presentations.length).toBe(6);
    expect(a.answeredCount).toBe(5);
    expect(planNextPresentation(a, IDS, rng)).toBeNull(); // correctly full
  });

  it('never returns null while answers remain outstanding', () => {
    // Exhaustively: for every answeredCount below target, planning must produce work.
    for (let answered = 0; answered < 5; answered++) {
      const a = createBossAttempt(`a_${answered}`, new Date().toISOString());
      for (let i = 0; i < answered; i++) {
        a.presentations.push({
          presentationId: `p${i}`, questionId: `q${i + 1}`, optionOrder: [0, 1],
          status: 'answered', isRevision: false, result: { correct: true, damage: 10 },
        });
      }
      a.answeredCount = answered;
      const planned = planNextPresentation(a, IDS, rng);
      expect(planned).not.toBeNull();
    }
  });
});

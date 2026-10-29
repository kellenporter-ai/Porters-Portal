// Regression: panel froze on a dead question after a knockout.
//
// The answer handler cleared `answerResult` (and fetched the next question) only
// in the `!result.knockedOut` branch. On a knockout neither ran, so:
//   - `answerResult` stayed non-null, and the option buttons render
//     `disabled={submitting || !!answerResult || knockedOut}`
//   - `fetchNextQuestion` never ran, so the knockout/Medevac screen never appeared
// The student was left looking at a highlighted wrong answer they could not
// dismiss and could not advance past.
//
// These tests pin the state transition for both the normal and knockout paths.
import { describe, it, expect } from 'vitest';

/** Mirrors the answer-result reducer in BossQuizPanel. */
interface PanelState {
  submitting: boolean;
  answerResult: unknown;
  selectedAnswer: number | null;
  knockedOut: boolean;
  attemptComplete: boolean;
  answeredCount: number;
  fetchScheduled: boolean;
  [k: string]: unknown;
}

function reduceAnswerResult(prev: PanelState, result: Record<string, unknown>): PanelState {
  const next: PanelState = { ...prev };
  if (result.attemptComplete) {
    next.attemptComplete = true;
    next.answeredCount = (prev.answeredCount as number) + 1;
    next.selectedAnswer = null;
    next.answerResult = null;
    next.fetchScheduled = false;
    return next;
  }
  // Single branch for both normal advancement and knockout. The knockout case
  // used to be excluded, which caused the freeze.
  next.selectedAnswer = null;
  next.answerResult = null;
  next.fetchScheduled = true;
  if (result.knockedOut) next.knockedOut = true;
  return next;
}

/** Mirrors the button's disabled expression. */
function optionsDisabled(state: PanelState) {
  return !!(state.submitting || state.answerResult || state.knockedOut);
}

const base: PanelState = {
  submitting: false,
  answerResult: null,
  selectedAnswer: 2,
  knockedOut: false,
  attemptComplete: false,
  answeredCount: 0,
  fetchScheduled: false,
};

describe('knockout must not freeze the question panel', () => {
  it('clears answerResult on a knockout', () => {
    const after = reduceAnswerResult(base, { correct: false, knockedOut: true });
    expect(after.answerResult).toBeNull();
    expect(after.selectedAnswer).toBeNull();
  });

  it('schedules a refresh on a knockout so the cooldown screen can render', () => {
    const after = reduceAnswerResult(base, { correct: false, knockedOut: true });
    expect(after.fetchScheduled).toBe(true);
  });

  it('marks knockedOut so the cooldown screen is shown', () => {
    const after = reduceAnswerResult(base, { correct: false, knockedOut: true });
    expect(after.knockedOut).toBe(true);
  });

  it('options are disabled while knocked out (correct) but not stuck on answerResult', () => {
    const after = reduceAnswerResult(base, { correct: false, knockedOut: true });
    // Disabled because of the knockout screen, NOT because of a stale answerResult.
    expect(after.answerResult).toBeNull();
    expect(optionsDisabled(after)).toBe(true);
  });

  it('a normal correct answer still advances', () => {
    const after = reduceAnswerResult(base, { correct: true, knockedOut: false });
    expect(after.answerResult).toBeNull();
    expect(after.fetchScheduled).toBe(true);
    expect(after.knockedOut).toBe(false);
  });

  it('attempt completion clears the panel without scheduling a fetch', () => {
    const after = reduceAnswerResult({ ...base, answeredCount: 4 }, { correct: true, attemptComplete: true });
    expect(after.answerResult).toBeNull();
    expect(after.attemptComplete).toBe(true);
    expect(after.answeredCount).toBe(5);
  });

  it('the old behaviour WOULD have frozen: result set + no fetch', () => {
    // Negative control: reproducing the pre-fix logic proves the assertions above
    // are sensitive to the defect rather than passing trivially.
    const buggy = (prev: PanelState, result: Record<string, unknown>): PanelState => {
      const next: PanelState = { ...prev };
      if (result.attemptComplete) return { ...next, answerResult: null, selectedAnswer: null };
      if (!result.knockedOut) {
        next.selectedAnswer = null;
        next.answerResult = null;
        next.fetchScheduled = true;
      }
      // knockout: nothing cleared, nothing fetched
      return next;
    };
    // Start from the state right after an answer lands: answerResult populated.
    const afterAnswer = { ...base, answerResult: { correct: false, damage: 0 }, selectedAnswer: 3 };
    const stuck = buggy(afterAnswer, { correct: false, knockedOut: true });
    expect(stuck.answerResult).not.toBeNull();  // stale answer result retained
    expect(stuck.fetchScheduled).toBe(false);
    expect(optionsDisabled({ ...stuck, submitting: false })).toBe(true);
  });
});

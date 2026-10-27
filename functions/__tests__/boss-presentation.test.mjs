// Pure option-presentation tests for async boss increments I2.1/I2.2.
// Runs against compiled functions/lib output; keep this file plain JavaScript.
import { describe, it, expect } from 'vitest';
import {
  BOSS_ATTEMPT_SIZE,
  MAX_REVISIONS_PER_ATTEMPT,
  REVISION_COOLDOWN_ANSWERS,
  shuffleOptions,
  toDisplayedOptions,
  gradeByDisplayedIndex,
  isValidPermutation,
} from '../lib/boss-presentation.js';

function seededRng(seed = 0x12345678) {
  let state = seed >>> 0;
  return (maxExclusive) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % maxExclusive;
  };
}

describe('shuffleOptions', () => {
  it('returns valid permutations over 1000 draws and varies their order', () => {
    const rng = seededRng();
    const orders = new Set();
    for (let draw = 0; draw < 1000; draw++) {
      const optionOrder = shuffleOptions(4, rng);
      expect(isValidPermutation(optionOrder, 4)).toBe(true);
      orders.add(optionOrder.join(','));
    }
    expect(orders.size).toBeGreaterThanOrEqual(2);
  });

  it('has no duplicates or omissions for sizes 2 through 8', () => {
    const rng = seededRng(0xabcdef01);
    for (let size = 2; size <= 8; size++) {
      for (let draw = 0; draw < 100; draw++) {
        const optionOrder = shuffleOptions(size, rng);
        expect(isValidPermutation(optionOrder, size)).toBe(true);
        expect([...optionOrder].sort((a, b) => a - b)).toEqual(
          Array.from({ length: size }, (_, index) => index),
        );
      }
    }
  });

  it('throws when optionCount is zero', () => {
    expect(() => shuffleOptions(0, seededRng())).toThrow();
  });
});

describe('gradeByDisplayedIndex', () => {
  it('round-trips every displayed position through its canonical index', () => {
    const rng = seededRng(0x98765432);
    for (const correctAnswer of [0, 1, 2, 3]) {
      const question = {
        options: ['alpha', 'beta', 'gamma', 'delta'],
        correctAnswer,
      };
      for (let draw = 0; draw < 100; draw++) {
        const optionOrder = shuffleOptions(4, rng);
        for (let displayedIndex = 0; displayedIndex < 4; displayedIndex++) {
          const grade = gradeByDisplayedIndex(question, optionOrder, displayedIndex);
          expect(grade.valid).toBe(true);
          expect(grade.canonicalIndex).toBe(optionOrder[displayedIndex]);
          expect(grade.correct).toBe(optionOrder[displayedIndex] === correctAnswer);
        }
      }
    }
  });

  it('rejects invalid displayed indices and malformed permutations without throwing', () => {
    const question = { options: ['alpha', 'beta', 'gamma', 'delta'], correctAnswer: 1 };
    const invalid = { valid: false, correct: false, canonicalIndex: -1 };
    const cases = [
      [[0, 1, 2, 3], -1],
      [[0, 1, 2, 3], 4],
      [[0, 1, 2, 3], Number.NaN],
      [[0, 1, 2, 3], 1.5],
      [[0, 1, 2], 1],
      [[0, 1, 1, 3], 1],
      [[0, 1, 2, 4], 1],
      [[0, 1, 2, 1.5], 1],
    ];
    for (const [optionOrder, displayedIndex] of cases) {
      expect(() => gradeByDisplayedIndex(question, optionOrder, displayedIndex)).not.toThrow();
      expect(gradeByDisplayedIndex(question, optionOrder, displayedIndex)).toEqual(invalid);
    }
  });
});

describe('toDisplayedOptions', () => {
  it('maps option text into display order', () => {
    expect(toDisplayedOptions(['alpha', 'beta', 'gamma', 'delta'], [2, 0, 3, 1])).toEqual([
      'gamma',
      'alpha',
      'delta',
      'beta',
    ]);
  });

  it('returns an empty array for an invalid permutation', () => {
    const invalidPermutations = [
      [0, 1, 1, 3],
      [0, 1, 2],
      [0, 1, 2, 4],
      [0, 1, 2, -1],
      [0, 1, 2, Number.NaN],
    ];
    for (const optionOrder of invalidPermutations) {
      expect(toDisplayedOptions(['alpha', 'beta', 'gamma', 'delta'], optionOrder)).toEqual([]);
    }
  });

  it('does not leak answer-key or grading fields in serialized client-facing output', () => {
    const question = { options: ['alpha', 'beta', 'gamma', 'delta'], correctAnswer: 2 };
    const optionOrder = [2, 0, 3, 1];
    const presentationView = {
      presentationId: 'attempt-1:question-1',
      stem: 'Choose an option',
      options: toDisplayedOptions(question.options, optionOrder),
      difficulty: 'MEDIUM',
      isRevision: false,
      attemptAnsweredCount: 0,
      attemptSize: BOSS_ATTEMPT_SIZE,
    };
    const serialized = JSON.stringify(presentationView);
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('canonicalIndex');
    expect(serialized).not.toContain('"correct"');
    expect(Object.keys(presentationView)).toEqual([
      'presentationId',
      'stem',
      'options',
      'difficulty',
      'isRevision',
      'attemptAnsweredCount',
      'attemptSize',
    ]);
  });
});

describe('attempt constants', () => {
  it('match the attempt and revision contract', () => {
    expect(BOSS_ATTEMPT_SIZE).toBe(5);
    expect(MAX_REVISIONS_PER_ATTEMPT).toBe(2);
    expect(REVISION_COOLDOWN_ANSWERS).toBe(2);
  });
});

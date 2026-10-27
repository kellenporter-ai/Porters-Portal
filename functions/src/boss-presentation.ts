// Pure attempt/presentation contracts and option-permutation helpers.
// Randomness is injected so production callers can use crypto.randomInt while
// tests remain deterministic. This module must not import Firestore or crypto.

export const BOSS_ATTEMPT_SIZE = 5;
export const MAX_REVISIONS_PER_ATTEMPT = 2;
export const REVISION_COOLDOWN_ANSWERS = 2;

export type PresentationStatus = 'pending' | 'answered';

export interface BossPresentation {
  presentationId: string;
  questionId: string;
  optionOrder: number[];
  status: PresentationStatus;
  isRevision: boolean;
  result?: { correct: boolean; damage: number } | null;
}

export interface BossAttempt {
  id: string;
  startedAt: string;
  targetSize: number;
  answeredCount: number;
  presentations: BossPresentation[];
  revisionQueue: {
    questionId: string;
    failedCount: number;
    eligibleAfterAnswered: number;
  }[];
}

export type Rng = (maxExclusive: number) => number;

/** True when optionOrder contains every canonical index exactly once. */
export function isValidPermutation(optionOrder: number[], optionCount: number): boolean {
  if (
    !Array.isArray(optionOrder) ||
    !Number.isInteger(optionCount) ||
    optionCount < 0 ||
    optionOrder.length !== optionCount
  ) {
    return false;
  }

  const seen = new Set<number>();
  for (const canonicalIndex of optionOrder) {
    if (
      !Number.isInteger(canonicalIndex) ||
      canonicalIndex < 0 ||
      canonicalIndex >= optionCount ||
      seen.has(canonicalIndex)
    ) {
      return false;
    }
    seen.add(canonicalIndex);
  }
  return true;
}

/** Fisher-Yates over 0..optionCount-1. No duplicates, no omissions. */
export function shuffleOptions(optionCount: number, rng: Rng): number[] {
  if (!Number.isInteger(optionCount) || optionCount < 1) {
    throw new Error('shuffleOptions: optionCount must be a positive integer');
  }

  const optionOrder = Array.from({ length: optionCount }, (_, index) => index);
  for (let displayedIndex = optionCount - 1; displayedIndex > 0; displayedIndex--) {
    const swapIndex = rng(displayedIndex + 1);
    [optionOrder[displayedIndex], optionOrder[swapIndex]] = [
      optionOrder[swapIndex],
      optionOrder[displayedIndex],
    ];
  }
  return optionOrder;
}

/** Option text in display order. Never reveals which displayed slot is correct. */
export function toDisplayedOptions(options: string[], optionOrder: number[]): string[] {
  if (!Array.isArray(options) || !isValidPermutation(optionOrder, options.length)) {
    return [];
  }
  return optionOrder.map((canonicalIndex) => options[canonicalIndex]);
}

/** Map a displayed index back to the canonical index and grade it. */
export function gradeByDisplayedIndex(
  question: { options: string[]; correctAnswer: number },
  optionOrder: number[],
  displayedIndex: number,
): { valid: boolean; correct: boolean; canonicalIndex: number } {
  const invalid = { valid: false, correct: false, canonicalIndex: -1 };
  if (
    !question ||
    !Array.isArray(question.options) ||
    !Number.isInteger(question.correctAnswer) ||
    question.correctAnswer < 0 ||
    question.correctAnswer >= question.options.length ||
    !isValidPermutation(optionOrder, question.options.length) ||
    !Number.isInteger(displayedIndex) ||
    displayedIndex < 0 ||
    displayedIndex >= optionOrder.length
  ) {
    return invalid;
  }

  const canonicalIndex = optionOrder[displayedIndex];
  return {
    valid: true,
    correct: canonicalIndex === question.correctAnswer,
    canonicalIndex,
  };
}

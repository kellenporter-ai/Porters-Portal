// Pure-logic unit tests for functions/src/assessment.ts fixes
// (audit run C / run D: C-1 XP dedupe + resubmit gate, soft late flag,
// D-10 key-aware needsReview). Runs against compiled output (lib/).
import { describe, it, expect } from 'vitest';
import {
  hasAnswerKeyForManualBlock,
  gradeKeyedManualBlock,
  computeSubmittedLate,
  XP_AWARDED_FIELD,
} from '../lib/assessment.js';

// ---------------------------------------------------------------------------
// D-10 — key-aware needsReview helpers
// ---------------------------------------------------------------------------
describe('hasAnswerKeyForManualBlock', () => {
  it('CHECKLIST: true when items + matching boolean correctStates exist', () => {
    expect(hasAnswerKeyForManualBlock({
      id: 'c1', type: 'CHECKLIST',
      items: ['a', 'b', 'c'],
      correctStates: [true, false, true],
    })).toBe(true);
  });

  it('CHECKLIST: false when correctStates missing, mismatched, or non-boolean', () => {
    expect(hasAnswerKeyForManualBlock({ id: 'c1', type: 'CHECKLIST', items: ['a'] })).toBe(false);
    expect(hasAnswerKeyForManualBlock({
      id: 'c1', type: 'CHECKLIST', items: ['a', 'b'], correctStates: [true],
    })).toBe(false);
    expect(hasAnswerKeyForManualBlock({
      id: 'c1', type: 'CHECKLIST', items: ['a'], correctStates: ['yes'],
    })).toBe(false);
    expect(hasAnswerKeyForManualBlock({
      id: 'c1', type: 'CHECKLIST', items: [], correctStates: [],
    })).toBe(false);
  });

  it('manual types without a defined comparator never report a key', () => {
    for (const type of ['DRAWING', 'MATH_RESPONSE', 'BAR_CHART', 'DATA_TABLE']) {
      expect(hasAnswerKeyForManualBlock({
        id: 'x', type,
        // Plausible-looking key material must NOT unlock auto-grading.
        correctAnswer: 'foo', correctStates: [true], expected: [1, 2],
      })).toBe(false);
    }
  });
});

describe('gradeKeyedManualBlock', () => {
  const key = { id: 'c1', type: 'CHECKLIST', items: ['a', 'b', 'c'], correctStates: [true, false, true] };

  it('exact match on every required state => true', () => {
    expect(gradeKeyedManualBlock(key, { checked: [true, false, true] })).toBe(true);
  });

  it('any deviation => false', () => {
    expect(gradeKeyedManualBlock(key, { checked: [true, true, true] })).toBe(false);
    expect(gradeKeyedManualBlock(key, { checked: [false, false, true] })).toBe(false);
    expect(gradeKeyedManualBlock(key, { checked: [true, false] })).toBe(false); // missing check
    expect(gradeKeyedManualBlock(key, null)).toBe(false);
    expect(gradeKeyedManualBlock(key, {})).toBe(false);
  });

  it('non-boolean checked entries count as unchecked', () => {
    expect(gradeKeyedManualBlock({ ...key, correctStates: [false] }, { checked: [null] })).toBe(true);
    expect(gradeKeyedManualBlock({ ...key, correctStates: [false] }, { checked: [true] })).toBe(false);
  });

  it('returns null (stay manual) for types without a comparator', () => {
    expect(gradeKeyedManualBlock({ id: 'd1', type: 'DRAWING' }, {})).toBe(null);
    expect(gradeKeyedManualBlock({ id: 'b1', type: 'BAR_CHART' }, {})).toBe(null);
    expect(gradeKeyedManualBlock({ id: 't1', type: 'DATA_TABLE' }, {})).toBe(null);
    expect(gradeKeyedManualBlock({ id: 'm1', type: 'MATH_RESPONSE' }, {})).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Soft late flag
// ---------------------------------------------------------------------------
describe('computeSubmittedLate', () => {
  const NOW = 1_800_000_000_000;

  it('no dueDate => false', () => {
    expect(computeSubmittedLate(undefined, NOW)).toBe(false);
    expect(computeSubmittedLate(null, NOW)).toBe(false);
  });

  it('now <= dueDate => false; now > dueDate => true', () => {
    expect(computeSubmittedLate(NOW - 1, NOW)).toBe(true);
    expect(computeSubmittedLate(NOW, NOW)).toBe(false);      // exactly on time
    expect(computeSubmittedLate(NOW + 1, NOW)).toBe(false);
  });

  it('accepts ISO strings and Firestore Timestamps', () => {
    expect(computeSubmittedLate(new Date(NOW - 1000).toISOString(), NOW)).toBe(true);
    expect(computeSubmittedLate(new Date(NOW + 1000).toISOString(), NOW)).toBe(false);
    expect(computeSubmittedLate({ toMillis: () => NOW - 1000 }, NOW)).toBe(true);
  });

  it('garbage dueDate values => false (fail-open, flag only)', () => {
    expect(computeSubmittedLate('not-a-date', NOW)).toBe(false);
    expect(computeSubmittedLate(NaN, NOW)).toBe(false);
    expect(computeSubmittedLate({}, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C-1 — resubmit gate predicate (mirrors startAssessmentSession check)
// ---------------------------------------------------------------------------
function resubmitGateBlockReason(latest) {
  // Mirrors the gate in startAssessmentSession: block when the latest
  // submission is graded and not RETURNED. Returns a reason string or null.
  if (!latest) return null;
  if (latest.rubricGrade && latest.status !== 'RETURNED') {
    return 'graded-not-returned';
  }
  return null;
}

describe('C-1 resubmit gate', () => {
  it('no prior submission => allowed', () => {
    expect(resubmitGateBlockReason(null)).toBe(null);
  });

  it('latest graded but RETURNED => allowed (feedback-then-retry loop)', () => {
    expect(resubmitGateBlockReason({ status: 'RETURNED', rubricGrade: { score: 80 } })).toBe(null);
  });

  it('latest never graded => allowed', () => {
    expect(resubmitGateBlockReason({ status: 'CLEAN' })).toBe(null);
    expect(resubmitGateBlockReason({ status: 'FLAGGED', feedback: 'x' })).toBe(null);
  });

  it('latest graded and not RETURNED => blocked', () => {
    expect(resubmitGateBlockReason({ status: 'GRADED', rubricGrade: { score: 80 } }))
      .toBe('graded-not-returned');
    expect(resubmitGateBlockReason({ status: 'CLEAN', rubricGrade: { score: 0 } }))
      .toBe('graded-not-returned');
  });
});

// ---------------------------------------------------------------------------
// C-1 — XP dedupe predicate (mirrors submitAssessment eligibility check)
// ---------------------------------------------------------------------------
function xpEligible(priorSubmissions) {
  // Mirrors submitAssessment: ineligible if ANY prior submission for this
  // assessment carries the xpAwarded marker.
  return !priorSubmissions.some((s) => s[XP_AWARDED_FIELD] === true);
}

describe('C-1 XP dedupe', () => {
  it('first submission (no prior marker) => eligible', () => {
    expect(xpEligible([])).toBe(true);
    expect(xpEligible([{ status: 'CLEAN' }])).toBe(true);
  });

  it('any prior XP-awarded submission => never re-award', () => {
    expect(xpEligible([{ [XP_AWARDED_FIELD]: true }])).toBe(false);
    expect(xpEligible([{ status: 'CLEAN' }, { [XP_AWARDED_FIELD]: true }])).toBe(false);
  });

  it('prior RETURNED submission still blocks XP re-award', () => {
    expect(xpEligible([{ status: 'RETURNED', [XP_AWARDED_FIELD]: true }])).toBe(false);
  });
});

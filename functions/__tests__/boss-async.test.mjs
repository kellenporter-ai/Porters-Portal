// Pure-logic unit tests for Piece 2 (async boss backend) helpers in
// functions/src/bosses.ts. Runs against compiled output (lib/) via
// functions/vitest.config.mts — run `tsc` first.
import { describe, it, expect } from 'vitest';
import {
  MEDEVAC_COSTS,
  getMedevacCost,
  computeMedevacState,
  toStudentQuestion,
  stripBossEventForClient,
} from '../lib/bosses.js';
import { stripBossEventForClient as stripClient } from '../../lib/bossRedaction.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

describe('getMedevacCost ladder', () => {
  it('returns 50,100,150,250,400 for counts 0..4 and caps at 400', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(getMedevacCost)).toEqual([50, 100, 150, 250, 400, 400, 400]);
  });
  it('ladder constant matches the locked design', () => {
    expect(MEDEVAC_COSTS).toEqual([50, 100, 150, 250, 400]);
  });
});

describe('computeMedevacState (global 24h anchor)', () => {
  const now = 1_700_000_000_000;

  it('fresh user: anchors the window, count 1, cost 50', () => {
    const s = computeMedevacState({ now });
    expect(s).toEqual({ nextCount: 1, cost: 50, resetAt: now + DAY });
  });

  it('fresh user with missing resetAt but prior count: re-anchors', () => {
    const s = computeMedevacState({ now, medevacCount: 3, medevacResetAt: null });
    expect(s).toEqual({ nextCount: 1, cost: 50, resetAt: now + DAY });
  });

  it('mid-window purchase: increments count, does NOT extend the window', () => {
    const resetAt = now + 10 * HOUR;
    const s = computeMedevacState({ now, medevacCount: 2, medevacResetAt: resetAt });
    expect(s).toEqual({ nextCount: 3, cost: 150, resetAt });
  });

  it('mid-window at cap: cost stays 400, window unchanged', () => {
    const resetAt = now + 5 * HOUR;
    const s = computeMedevacState({ now, medevacCount: 7, medevacResetAt: resetAt });
    expect(s).toEqual({ nextCount: 8, cost: 400, resetAt });
  });

  it('window expired: re-anchors at count 1, cost 50', () => {
    const s = computeMedevacState({ now, medevacCount: 4, medevacResetAt: now - HOUR });
    expect(s).toEqual({ nextCount: 1, cost: 50, resetAt: now + DAY });
  });

  it('accepts ISO-string resetAt', () => {
    const resetAt = new Date(now + 2 * HOUR).toISOString();
    const s = computeMedevacState({ now, medevacCount: 0, medevacResetAt: resetAt });
    expect(s).toEqual({ nextCount: 1, cost: 50, resetAt: now + 2 * HOUR });
  });
});

describe('toStudentQuestion redaction', () => {
  const q = {
    id: 'q1',
    stem: 'What is 2+2?',
    options: ['3', '4', '5', '6'],
    correctAnswer: 1,
    explanation: 'Because arithmetic.',
    difficulty: 'EASY',
    topicId: 'arith',
    damageBonus: 5,
  };

  it('strips exactly correctAnswer and explanation', () => {
    const out = toStudentQuestion(q);
    expect(out).not.toBeNull();
    expect(out).not.toHaveProperty('correctAnswer');
    expect(out).not.toHaveProperty('explanation');
  });

  it('preserves id, stem, options, difficulty (and other safe fields)', () => {
    const out = toStudentQuestion(q);
    expect(out.id).toBe('q1');
    expect(out.stem).toBe('What is 2+2?');
    expect(out.options).toEqual(['3', '4', '5', '6']);
    expect(out.difficulty).toBe('EASY');
    expect(out.topicId).toBe('arith');
    expect(out.damageBonus).toBe(5);
  });

  it('handles null/undefined safely', () => {
    expect(toStudentQuestion(undefined)).toBeNull();
    expect(toStudentQuestion(null)).toBeNull();
  });
});

describe('stripBossEventForClient', () => {
  const event = {
    id: 'ev1',
    title: 'Algebra Boss',
    isActive: true,
    classType: 'ALGEBRA_1',
    participantCount: 3,
    questions: [
      { id: 'q1', stem: 'Solve x', options: ['1', '2'], correctAnswer: 0, explanation: 'x=1', difficulty: 'MEDIUM', topicId: 't1' },
      { id: 'q2', stem: 'Solve y', options: ['3', '4'], correctAnswer: 1, explanation: 'y=4', difficulty: 'HARD', topicId: 't2' },
    ],
  };

  it('removes correctAnswer and explanation from every question', () => {
    const out = stripBossEventForClient(event);
    for (const q of out.questions) {
      expect(q).not.toHaveProperty('correctAnswer');
      expect(q).not.toHaveProperty('explanation');
    }
  });

  it('leaves the rest of the event byte-identical', () => {
    const out = stripBossEventForClient(event);
    expect(out.id).toBe(event.id);
    expect(out.title).toBe(event.title);
    expect(out.isActive).toBe(event.isActive);
    expect(out.classType).toBe(event.classType);
    expect(out.participantCount).toBe(event.participantCount);
    const qs = out.questions;
    expect(qs[0].id).toBe('q1');
    expect(qs[0].stem).toBe('Solve x');
    expect(qs[0].options).toEqual(['1', '2']);
    expect(qs[0].difficulty).toBe('MEDIUM');
    expect(qs[1].id).toBe('q2');
  });

  it('handles events without questions and null input', () => {
    expect(stripBossEventForClient({ id: 'x' })).toEqual({ id: 'x' });
    expect(stripBossEventForClient(null)).toBeNull();
  });

  it('frontend lib copy matches server behavior', () => {
    expect(stripClient(event)).toEqual(stripBossEventForClient(event));
  });
});

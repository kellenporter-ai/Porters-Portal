import { describe, it, expect, vi } from 'vitest';

// lib/boards.ts imports lib/firebase.ts for `db`, which touches `window` and
// import.meta.env. Mock it out; pure helpers under test do not need Firestore.
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../../services/resilientSnapshot', () => ({ resilientSnapshot: vi.fn() }));

import {
  deriveInitials,
  isValidQuestionText,
  groupQuestionsByCategory,
  countEndorsements,
  UNCATEGORIZED_LABEL,
} from '../boards';
import type { BoardQuestion, BoardCategory, BoardEndorsement } from '../../types';

function makeQuestion(overrides: Partial<BoardQuestion>): BoardQuestion {
  return {
    id: 'q1',
    boardId: 'b1',
    text: 'Why does the light turn on when I flip the switch?',
    initials: 'AB',
    authorId: 'u1',
    categoryId: null,
    status: 'live',
    createdAt: {} as never,
    ...overrides,
  };
}

function makeCategory(id: string, name: string): BoardCategory {
  return { id, boardId: 'b1', name, createdBy: 't1', createdAt: {} as never };
}

// ─── deriveInitials ───
describe('deriveInitials', () => {
  it('takes first and last letters of a two-part name', () => {
    expect(deriveInitials('Ada Lovelace')).toBe('AL');
  });

  it('takes three letters of a three-part name', () => {
    expect(deriveInitials('mary jane watson')).toBe('MJW');
  });

  it('takes up to three letters of a single-part name', () => {
    expect(deriveInitials('Cher')).toBe('CHE');
    expect(deriveInitials('abcd')).toBe('ABC');
  });

  it('handles extra whitespace', () => {
    expect(deriveInitials('  Ada   Lovelace  ')).toBe('AL');
  });

  it('returns empty string for empty input', () => {
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials('   ')).toBe('');
  });

  it('produces 2-3 characters for realistic names', () => {
    const names = ['Kellen Porter', 'Jane Doe', 'X Æ A-12 Musk', 'Bo', 'Madonna'];
    for (const name of names) {
      const initials = deriveInitials(name);
      expect(initials.length).toBeGreaterThanOrEqual(2);
      expect(initials.length).toBeLessThanOrEqual(3);
    }
  });
});

// ─── isValidQuestionText ───
describe('isValidQuestionText', () => {
  it('accepts text within 10..280 chars', () => {
    expect(isValidQuestionText('Why is the sky blue?')).toBe(true);
  });

  it('rejects text shorter than 10 chars', () => {
    expect(isValidQuestionText('Why?')).toBe(false);
    expect(isValidQuestionText('123456789')).toBe(false);
  });

  it('rejects text longer than 280 chars', () => {
    expect(isValidQuestionText('a'.repeat(281))).toBe(false);
  });

  it('trims whitespace before measuring', () => {
    expect(isValidQuestionText('   Why is it?   ')).toBe(true);
    expect(isValidQuestionText('      short     ')).toBe(false);
  });

  it('accepts exactly 10 and exactly 280 chars', () => {
    expect(isValidQuestionText('a'.repeat(10))).toBe(true);
    expect(isValidQuestionText('a'.repeat(280))).toBe(true);
  });
});

// ─── groupQuestionsByCategory ───
describe('groupQuestionsByCategory', () => {
  const categories = [
    makeCategory('c1', 'Energy'),
    makeCategory('c2', 'Circuits'),
  ];

  it('groups live questions under their category', () => {
    const questions = [
      makeQuestion({ id: 'q1', categoryId: 'c1' }),
      makeQuestion({ id: 'q2', categoryId: 'c2' }),
    ];
    const groups = groupQuestionsByCategory(questions, categories, ['live']);
    expect(groups.find(g => g.categoryId === 'c1')?.questions.map(q => q.id)).toEqual(['q1']);
    expect(groups.find(g => g.categoryId === 'c2')?.questions.map(q => q.id)).toEqual(['q2']);
  });

  it('buckets null or dangling categoryId into Uncategorized, placed last', () => {
    const questions = [
      makeQuestion({ id: 'q1', categoryId: null }),
      makeQuestion({ id: 'q2', categoryId: 'c-deleted' }),
    ];
    const groups = groupQuestionsByCategory(questions, categories, ['live']);
    const last = groups[groups.length - 1];
    expect(last.categoryName).toBe(UNCATEGORIZED_LABEL);
    expect(last.categoryId).toBe(null);
    expect(last.questions.map(q => q.id)).toEqual(['q1', 'q2']);
  });

  it('omits the Uncategorized bucket when it is empty', () => {
    const questions = [makeQuestion({ id: 'q1', categoryId: 'c1' })];
    const groups = groupQuestionsByCategory(questions, categories, ['live']);
    expect(groups.some(g => g.categoryId === null)).toBe(false);
  });

  it('keeps empty categories visible so students can file notes into them', () => {
    const groups = groupQuestionsByCategory([], categories, ['live']);
    expect(groups.map(g => g.categoryId)).toEqual(['c1', 'c2']);
  });

  it('filters out pending and answered questions for the student view', () => {
    const questions = [
      makeQuestion({ id: 'q1', status: 'live' }),
      makeQuestion({ id: 'q2', status: 'pending' }),
      makeQuestion({ id: 'q3', status: 'answered' }),
    ];
    const groups = groupQuestionsByCategory(questions, [], ['live', 'answered']);
    const all = groups.flatMap(g => g.questions).map(q => q.id);
    expect(all).toEqual(['q1', 'q3']);
  });
});

// ─── countEndorsements ───
describe('countEndorsements', () => {
  it('counts endorsements per question', () => {
    const mk = (questionId: string, userId: string): BoardEndorsement => ({
      id: `${questionId}_${userId}`,
      questionId,
      boardId: 'b1',
      userId,
      createdAt: {} as never,
    });
    const counts = countEndorsements([mk('q1', 'u1'), mk('q1', 'u2'), mk('q2', 'u3')]);
    expect(counts.get('q1')).toBe(2);
    expect(counts.get('q2')).toBe(1);
    expect(counts.get('q3')).toBeUndefined();
  });
});

/**
 * getAssessmentAttempts — one-shot student-facing attempt history fetch.
 *
 * Firestore is mocked at the firebase/firestore module boundary. Asserts the
 * client-side filter (drops other assignments + non-assessment docs) and
 * preserves the server-side newest-first order from the userId+submittedAt
 * query (no composite index needed — firestore.indexes.json:46-58).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDocsMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({ path: args[1] as string })),
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  where: vi.fn(() => ({ __where: true })),
  orderBy: vi.fn(() => ({ __orderBy: true })),
  limit: vi.fn(() => ({ __limit: true })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../errorReporting', () => ({ reportError: vi.fn() }));

import { dataService } from '../../services/dataService';

const doc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

/** assessmentScore has the real object shape ({correct, total, percentage, perBlock}). */
const assessmentScore = (percentage: number) => ({
  correct: percentage,
  total: 100,
  percentage,
  perBlock: {},
});

const attemptsSnapshot = [
  doc('sub-3', {
    userId: 'u1', assignmentId: 'a1', isAssessment: true,
    attemptNumber: 3, submittedAt: '2026-03-01T00:00:00Z',
    assessmentScore: assessmentScore(88),
  }),
  // Non-assessment doc for a different assignment — must be dropped
  doc('sub-lesson', {
    userId: 'u1', assignmentId: 'a2', isAssessment: false,
    submittedAt: '2026-02-28T00:00:00Z',
  }),
  doc('sub-2', {
    userId: 'u1', assignmentId: 'a1', isAssessment: true,
    attemptNumber: 2, submittedAt: '2026-02-20T00:00:00Z',
    assessmentScore: assessmentScore(71),
  }),
  // Assessment doc for a DIFFERENT assignment — must be dropped
  doc('sub-other', {
    userId: 'u1', assignmentId: 'a9', isAssessment: true,
    attemptNumber: 1, submittedAt: '2026-02-10T00:00:00Z',
  }),
  doc('sub-1', {
    userId: 'u1', assignmentId: 'a1', isAssessment: true,
    attemptNumber: 1, submittedAt: '2026-02-01T00:00:00Z',
    assessmentScore: assessmentScore(55),
  }),
];

describe('getAssessmentAttempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters to the assignment + assessment docs and keeps newest-first order', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: attemptsSnapshot });

    const result = await dataService.getAssessmentAttempts('u1', 'a1');

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.id)).toEqual(['sub-3', 'sub-2', 'sub-1']);
    expect(result.every((s) => s.assignmentId === 'a1' && s.isAssessment === true)).toBe(true);
  });

  it('maps rubricGrade and assessmentScore onto the Submission shape', async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [
        doc('sub-graded', {
          userId: 'u1', assignmentId: 'a1', isAssessment: true,
          attemptNumber: 1, submittedAt: '2026-03-01T00:00:00Z',
          assessmentScore: assessmentScore(90),
          rubricGrade: {
            grades: {}, overallPercentage: 82, gradedAt: '2026-03-02T00:00:00Z', gradedBy: 'teacher',
          },
        }),
      ],
    });

    const result = await dataService.getAssessmentAttempts('u1', 'a1');
    expect(result).toHaveLength(1);
    expect(result[0].rubricGrade?.overallPercentage).toBe(82);
    // assessmentScore round-trips as the real object shape, not a raw number
    expect(result[0].assessmentScore).toEqual({
      correct: 90,
      total: 100,
      percentage: 90,
      perBlock: {},
    });
  });

  it('returns an empty array when nothing matches', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: attemptsSnapshot });
    const result = await dataService.getAssessmentAttempts('u1', 'no-such-assignment');
    expect(result).toEqual([]);
  });

  it('rethrows after reporting so callers can surface a toast', async () => {
    getDocsMock.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(dataService.getAssessmentAttempts('u1', 'a1')).rejects.toThrow('permission-denied');
  });
});

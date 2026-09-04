/**
 * Unit tests for the client wrapper dataService.getAssessmentStatsBatch.
 *
 * Covers:
 *  - Batching: all requested assignmentIds reach the callable in a single
 *    request, and every id gets a stats entry back (server-truth ids, plus
 *    zeroed stats for any id the server omitted).
 *  - Error resilience: a thrown callable produces zeroed stats for every id
 *    and never propagates (the UI shows zeros rather than crashing).
 *
 * The callable itself is mocked — this tests the wrapper contract, not the
 * Cloud Function.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const callGetAssessmentStatsBatch = vi.fn();

vi.mock('../firebase', () => ({
  db: {},
  callGetAssessmentStatsBatch: (...args: unknown[]) => callGetAssessmentStatsBatch(...args),
}));

// dataService pulls many other callables off lib/firebase; only the batch
// callable is exercised here, so the rest are undefined but never called.
// reportError must exist since the wrapper calls it on the error path.
vi.mock('../errorReporting', () => ({
  reportError: vi.fn(),
}));

import { dataService } from '../../services/dataService';

const ZEROED = { submitted: 0, graded: 0, flagged: 0, aiFlagged: 0, draft: 0, notStarted: 0 };

describe('dataService.getAssessmentStatsBatch', () => {
  beforeEach(() => {
    callGetAssessmentStatsBatch.mockReset();
  });

  it('returns an empty object for an empty id list without calling the CF', async () => {
    const result = await dataService.getAssessmentStatsBatch([]);
    expect(result).toEqual({});
    expect(callGetAssessmentStatsBatch).not.toHaveBeenCalled();
  });

  it('passes all assignmentIds in one callable invocation and maps server stats', async () => {
    callGetAssessmentStatsBatch.mockResolvedValue({
      data: {
        stats: {
          a1: { submitted: 3, graded: 2, flagged: 0, aiFlagged: 1, draft: 1, notStarted: 4 },
        },
      },
    });

    const result = await dataService.getAssessmentStatsBatch(['a1', 'a2']);

    expect(callGetAssessmentStatsBatch).toHaveBeenCalledTimes(1);
    expect(callGetAssessmentStatsBatch).toHaveBeenCalledWith({
      assignmentIds: ['a1', 'a2'],
      enrolledStudentIdsByAssignment: {},
    });
    expect(result.a1).toEqual({ submitted: 3, graded: 2, flagged: 0, aiFlagged: 1, draft: 1, notStarted: 4 });
    // Server omitted a2 — the wrapper must zero-fill so callers never see undefined.
    expect(result.a2).toEqual(ZEROED);
  });

  it('omits enrolledStudentIdsByAssignment when not provided', async () => {
    callGetAssessmentStatsBatch.mockResolvedValue({ data: { stats: {} } });

    await dataService.getAssessmentStatsBatch(['a1']);

    expect(callGetAssessmentStatsBatch).toHaveBeenCalledWith({
      assignmentIds: ['a1'],
      enrolledStudentIdsByAssignment: {},
    });
  });

  it('maps enrolled students to id lists per assignment', async () => {
    callGetAssessmentStatsBatch.mockResolvedValue({ data: { stats: {} } });

    await dataService.getAssessmentStatsBatch(['a1'], {
      a1: [{ id: 'u1' }, { id: 'u2' }] as never[],
    });

    expect(callGetAssessmentStatsBatch).toHaveBeenCalledWith({
      assignmentIds: ['a1'],
      enrolledStudentIdsByAssignment: { a1: ['u1', 'u2'] },
    });
  });

  it('returns zeroed stats for every id when the callable rejects', async () => {
    callGetAssessmentStatsBatch.mockRejectedValue(new Error('functions/unavailable'));

    const result = await dataService.getAssessmentStatsBatch(['a1', 'a2', 'a3']);

    expect(result).toEqual({ a1: ZEROED, a2: ZEROED, a3: ZEROED });
  });

  it('zero-fills when the CF returns a payload missing the stats key', async () => {
    callGetAssessmentStatsBatch.mockResolvedValue({ data: {} });

    const result = await dataService.getAssessmentStatsBatch(['a1']);

    expect(result.a1).toEqual(ZEROED);
  });
});

import { describe, it, expect } from 'vitest';
import { computeUnitProgress } from '../unitProgress';

type Item = Parameters<typeof computeUnitProgress>[0][number];
type Sub = Parameters<typeof computeUnitProgress>[2][number];

const res = (over: Partial<Item>): Item => ({
  id: 'r1',
  isAssessment: false,
  lessonBlocks: undefined,
  blockCount: undefined,
  ...over,
});

const sub = (over: Partial<Sub>): Sub => ({
  assignmentId: 'a1',
  isAssessment: true,
  status: 'SUCCESS',
  ...over,
});

describe('computeUnitProgress completable filtering', () => {
  it('counts assessments and block-bearing resources; ignores pure reading resources', () => {
    const items = [
      res({ id: 'reading1' }),                                    // pure reading, no blocks
      res({ id: 'blocks1', lessonBlocks: [{} as never, {} as never] }), // 2 blocks, not completed
      res({ id: 'assess1', isAssessment: true }),                 // assessment, not submitted
    ];
    const progress = computeUnitProgress(items, {}, []);
    expect(progress.total).toBe(2);
    expect(progress.completed).toBe(0);
    expect(progress.pct).toBe(0);
  });

  it('mixed unit (blocks + reading) with practice completion reports correctly', () => {
    const items = [
      res({ id: 'reading1' }),
      res({ id: 'blocks1', lessonBlocks: [{} as never] }),
      res({ id: 'assess1', isAssessment: true }),
    ];
    const practiceCompletion = {
      blocks1: { completed: true, totalCompletions: 1, bestScore: null, completedAt: '2026-01-01T00:00:00Z' },
    };
    const submissions = [sub({ assignmentId: 'assess1', status: 'RETURNED' })];
    const progress = computeUnitProgress(items, practiceCompletion, submissions);
    expect(progress.total).toBe(2);
    expect(progress.completed).toBe(2);
    expect(progress.pct).toBe(100);
  });

  it('assessment-only unit with a STARTED submission is not complete', () => {
    const items = [res({ id: 'a1', isAssessment: true }), res({ id: 'a2', isAssessment: true })];
    const submissions = [sub({ assignmentId: 'a1', status: 'STARTED' }), sub({ assignmentId: 'a2', status: 'FLAGGED' })];
    const progress = computeUnitProgress(items, {}, submissions);
    expect(progress.total).toBe(2);
    expect(progress.completed).toBe(1);
    expect(progress.pct).toBe(50);
  });

  it('reading-only unit reports total 0 (renders "Reading" tag instead of a bar)', () => {
    const items = [res({ id: 'r1' }), res({ id: 'r2', blockCount: 0 })];
    const progress = computeUnitProgress(items, {}, []);
    expect(progress.total).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.pct).toBe(0);
  });

  it('falls back to blockCount when lessonBlocks is absent', () => {
    const items = [res({ id: 'r1', blockCount: 3 })];
    expect(computeUnitProgress(items, {}, []).total).toBe(1);
  });
});

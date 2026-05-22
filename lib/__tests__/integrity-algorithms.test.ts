import { describe, it, expect } from 'vitest';
import { textSimilarity, analyzeIntegrity } from '../integrityAnalysis';
import { detectCollusionRings } from '../collusionGraph';
import type { Submission, LessonBlock } from '../../types';

// ─── Helpers ───

function makeSubmission(overrides: Partial<Submission> & { userId: string; userName: string }): Submission {
  const { userId, userName, metrics: metricsOverride, ...rest } = overrides;
  return {
    id: `sub-${userId}`,
    userId,
    userName,
    assignmentId: 'test-assignment',
    assignmentTitle: 'Test',
    metrics: {
      pasteCount: 0,
      engagementTime: 600,
      keystrokes: 200,
      clickCount: 50,
      startTime: Date.now() - 600_000,
      lastActive: Date.now(),
      ...metricsOverride,
    },
    status: 'NORMAL',
    score: 0,
    privateComments: [],
    blockResponses: {},
    ...rest,
  } as Submission;
}

const MC_BLOCK: LessonBlock = {
  id: 'q1',
  type: 'MC',
  content: 'What is 2+2?',
  options: ['3', '4', '5'],
  correctAnswer: 1,
};

const SA_BLOCK: LessonBlock = {
  id: 'q2',
  type: 'SHORT_ANSWER',
  content: 'Explain Newton\'s first law.',
};

// ─── textSimilarity ───

describe('textSimilarity', () => {
  it('returns 1 for identical text', () => {
    expect(textSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely different text', () => {
    expect(textSimilarity('abc def ghi', 'xyz uvw rst')).toBe(0);
  });

  it('returns 1 for short identical text (< 15 chars)', () => {
    expect(textSimilarity('hi', 'hi')).toBe(1);
  });

  it('returns 0 for short different text (< 15 chars)', () => {
    expect(textSimilarity('hi', 'ho')).toBe(0);
  });

  it('detects near-identical text with high similarity', () => {
    const a = 'The quick brown fox jumps over the lazy dog near the river';
    const b = 'The quick brown fox jumps over the lazy dog near the river';
    // Without IDF corpus, max similarity is 0.6 (trigram + word Jaccard only)
    expect(textSimilarity(a, b)).toBeCloseTo(0.6, 5);
  });

  it('detects paraphrased text with moderate similarity', () => {
    const a = 'The quick brown fox jumps over the lazy dog near the river';
    const b = 'A fast brown fox leaped over a sleepy dog by the water';
    const sim = textSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.15);
    expect(sim).toBeLessThan(0.9);
  });

  it('uses TF-IDF when IDF corpus is provided', () => {
    const idf = new Map([['quick', 1.5], ['brown', 1.2], ['fox', 1.0]]);
    const a = 'The quick brown fox jumps over the lazy dog';
    const b = 'The quick brown fox jumps over the lazy dog';
    expect(textSimilarity(a, b, idf)).toBe(1);
  });
});

// ─── analyzeIntegrity ───

describe('analyzeIntegrity', () => {
  it('returns empty flaggedPairs for independent responses', () => {
    const subs = [
      makeSubmission({
        userId: 'u1', userName: 'Alice',
        blockResponses: { q2: { answer: 'Newton said objects stay moving unless stopped.' } },
        assessmentScore: { correct: 1, total: 2, percentage: 50, perBlock: { q1: { correct: true, answer: 1 } } },
      }),
      makeSubmission({
        userId: 'u2', userName: 'Bob',
        blockResponses: { q2: { answer: 'Objects in motion remain in motion forever in space.' } },
        assessmentScore: { correct: 1, total: 2, percentage: 50, perBlock: { q1: { correct: true, answer: 1 } } },
      }),
    ];
    const report = analyzeIntegrity(subs, [MC_BLOCK, SA_BLOCK], 0.7);
    expect(report.totalStudents).toBe(2);
    expect(report.pairsAnalyzed).toBe(1);
    expect(report.flaggedPairs).toHaveLength(0);
    expect(report.cliques).toHaveLength(0);
  });

  it('flags suspiciously similar short answers', () => {
    const subs = [
      makeSubmission({
        userId: 'u1', userName: 'Alice',
        blockResponses: { q2: { answer: 'An object at rest stays at rest and an object in motion stays in motion unless acted upon by an unbalanced force.' } },
        assessmentScore: { correct: 1, total: 2, percentage: 50, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
      makeSubmission({
        userId: 'u2', userName: 'Bob',
        blockResponses: { q2: { answer: 'An object at rest stays at rest and an object in motion stays in motion unless acted upon by an unbalanced force.' } },
        assessmentScore: { correct: 1, total: 2, percentage: 50, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
    ];
    const report = analyzeIntegrity(subs, [MC_BLOCK, SA_BLOCK], 0.7);
    expect(report.flaggedPairs.length).toBeGreaterThan(0);
    expect(report.flaggedPairs[0].overallSimilarity).toBe(100);
  });

  it('flags shared wrong MC answers', () => {
    const mc1: LessonBlock = { id: 'mc1', type: 'MC', content: 'Q1', options: ['A','B','C'], correctAnswer: 2 };
    const mc2: LessonBlock = { id: 'mc2', type: 'MC', content: 'Q2', options: ['A','B','C'], correctAnswer: 2 };
    const mc3: LessonBlock = { id: 'mc3', type: 'MC', content: 'Q3', options: ['A','B','C'], correctAnswer: 2 };
    const subs = [
      makeSubmission({
        userId: 'u1', userName: 'Alice',
        blockResponses: { mc1: { selected: 0 }, mc2: { selected: 0 }, mc3: { selected: 0 } },
        assessmentScore: { correct: 0, total: 3, percentage: 0, perBlock: { mc1: { correct: false, answer: 0 }, mc2: { correct: false, answer: 0 }, mc3: { correct: false, answer: 0 } } },
      }),
      makeSubmission({
        userId: 'u2', userName: 'Bob',
        blockResponses: { mc1: { selected: 0 }, mc2: { selected: 0 }, mc3: { selected: 0 } },
        assessmentScore: { correct: 0, total: 3, percentage: 0, perBlock: { mc1: { correct: false, answer: 0 }, mc2: { correct: false, answer: 0 }, mc3: { correct: false, answer: 0 } } },
      }),
    ];
    const report = analyzeIntegrity(subs, [mc1, mc2, mc3], 0.7);
    // Both got all 3 MC wrong with same answer (0) — should be flagged for MC pattern
    const pair = report.flaggedPairs.find(p => p.mcMatchCount > 0);
    expect(pair).toBeDefined();
    expect(pair!.mcMatchCount).toBe(3);
    expect(pair!.mcTotalWrong).toBe(3);
  });

  it('boosts confidence when both have high paste counts', () => {
    const subs = [
      makeSubmission({
        userId: 'u1', userName: 'Alice',
        metrics: { pasteCount: 5, engagementTime: 600, keystrokes: 200, clickCount: 50, startTime: Date.now() - 600_000, lastActive: Date.now() },
        blockResponses: { q2: { answer: 'The physics concept of inertia means objects resist changes to their motion state in the universe.' } },
        assessmentScore: { correct: 0, total: 2, percentage: 0, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
      makeSubmission({
        userId: 'u2', userName: 'Bob',
        metrics: { pasteCount: 5, engagementTime: 600, keystrokes: 200, clickCount: 50, startTime: Date.now() - 600_000, lastActive: Date.now() },
        blockResponses: { q2: { answer: 'The physics concept of inertia means objects resist changes to their motion state in the universe.' } },
        assessmentScore: { correct: 0, total: 2, percentage: 0, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
    ];
    const report = analyzeIntegrity(subs, [MC_BLOCK, SA_BLOCK], 0.7);
    expect(report.flaggedPairs.length).toBeGreaterThan(0);
    const pair = report.flaggedPairs[0];
    // Similarity is 100 (identical), confidence is capped at 100, so they're equal
    expect(pair.confidenceScore).toBeGreaterThanOrEqual(pair.overallSimilarity);
    expect(pair.confidenceFactors.some(f => f.includes('paste'))).toBe(true);
  });

  it('adds temporal score for submissions within 30 seconds', () => {
    const now = new Date().toISOString();
    const subs = [
      makeSubmission({
        userId: 'u1', userName: 'Alice',
        submittedAt: now,
        blockResponses: { q2: { answer: 'An object at rest stays at rest and an object in motion stays in motion unless acted upon by an unbalanced force.' } },
        assessmentScore: { correct: 0, total: 2, percentage: 0, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
      makeSubmission({
        userId: 'u2', userName: 'Bob',
        submittedAt: now,
        blockResponses: { q2: { answer: 'An object at rest stays at rest and an object in motion stays in motion unless acted upon by an unbalanced force.' } },
        assessmentScore: { correct: 0, total: 2, percentage: 0, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
    ];
    const report = analyzeIntegrity(subs, [MC_BLOCK, SA_BLOCK], 0.7);
    expect(report.flaggedPairs[0].temporalScore).toBe(50);
  });

  it('only uses latest attempt per student', () => {
    const subs = [
      makeSubmission({
        userId: 'u1', userName: 'Alice', attemptNumber: 1,
        blockResponses: { q2: { answer: 'First attempt answer' } },
        assessmentScore: { correct: 0, total: 2, percentage: 0, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
      makeSubmission({
        userId: 'u1', userName: 'Alice', attemptNumber: 2,
        blockResponses: { q2: { answer: 'Second attempt answer that matches Bob' } },
        assessmentScore: { correct: 0, total: 2, percentage: 0, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
      makeSubmission({
        userId: 'u2', userName: 'Bob', attemptNumber: 1,
        blockResponses: { q2: { answer: 'Second attempt answer that matches Bob' } },
        assessmentScore: { correct: 0, total: 2, percentage: 0, perBlock: { q1: { correct: false, answer: 0 } } },
      }),
    ];
    const report = analyzeIntegrity(subs, [MC_BLOCK, SA_BLOCK], 0.7);
    expect(report.totalStudents).toBe(2);
    expect(report.flaggedPairs.length).toBeGreaterThan(0);
  });
});

// ─── detectCollusionRings ───

describe('detectCollusionRings', () => {
  it('returns empty for no pairs', () => {
    expect(detectCollusionRings([], 60, 3)).toEqual([]);
  });

  it('detects a triangle collusion ring', () => {
    const pairs = [
      { studentA: { userId: 'a', userName: 'A' }, studentB: { userId: 'b', userName: 'B' }, overallSimilarity: 95, confidenceScore: 95, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
      { studentA: { userId: 'b', userName: 'B' }, studentB: { userId: 'c', userName: 'C' }, overallSimilarity: 92, confidenceScore: 92, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
      { studentA: { userId: 'a', userName: 'A' }, studentB: { userId: 'c', userName: 'C' }, overallSimilarity: 90, confidenceScore: 90, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
    ];
    const rings = detectCollusionRings(pairs, 60, 3);
    expect(rings).toHaveLength(1);
    expect(rings[0].size).toBe(3);
    expect(rings[0].members).toContain('a');
    expect(rings[0].members).toContain('b');
    expect(rings[0].members).toContain('c');
  });

  it('ignores pairs below minConfidence', () => {
    const pairs = [
      { studentA: { userId: 'a', userName: 'A' }, studentB: { userId: 'b', userName: 'B' }, overallSimilarity: 95, confidenceScore: 50, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
      { studentA: { userId: 'b', userName: 'B' }, studentB: { userId: 'c', userName: 'C' }, overallSimilarity: 92, confidenceScore: 50, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
      { studentA: { userId: 'a', userName: 'A' }, studentB: { userId: 'c', userName: 'C' }, overallSimilarity: 90, confidenceScore: 50, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
    ];
    const rings = detectCollusionRings(pairs, 60, 3);
    expect(rings).toHaveLength(0);
  });

  it('ignores cliques smaller than minSize', () => {
    const pairs = [
      { studentA: { userId: 'a', userName: 'A' }, studentB: { userId: 'b', userName: 'B' }, overallSimilarity: 95, confidenceScore: 95, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
    ];
    const rings = detectCollusionRings(pairs, 60, 3);
    expect(rings).toHaveLength(0);
  });

  it('computes avg and max confidence correctly', () => {
    const pairs = [
      { studentA: { userId: 'a', userName: 'A' }, studentB: { userId: 'b', userName: 'B' }, overallSimilarity: 80, confidenceScore: 80, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
      { studentA: { userId: 'b', userName: 'B' }, studentB: { userId: 'c', userName: 'C' }, overallSimilarity: 90, confidenceScore: 90, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
      { studentA: { userId: 'a', userName: 'A' }, studentB: { userId: 'c', userName: 'C' }, overallSimilarity: 100, confidenceScore: 100, confidenceFactors: [], temporalScore: 0, flaggedBlocks: [], mcMatchCount: 0, mcTotalWrong: 0 },
    ];
    const rings = detectCollusionRings(pairs, 60, 3);
    expect(rings[0].avgConfidence).toBe(90); // (80+90+100)/3
    expect(rings[0].maxConfidence).toBe(100);
  });
});

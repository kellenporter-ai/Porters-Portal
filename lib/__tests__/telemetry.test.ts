import { describe, it, expect } from 'vitest';
import {
  calculateFeedback,
  generateTeacherSummary,
  createInitialMetrics,
  classifyStudentBucket,
  getBucketRecommendation,
  DEFAULT_THRESHOLDS,
  BUCKET_META,
  type AggregatedStudentMetrics,
} from '../telemetry';
import type { TelemetryMetrics, TelemetryBucket } from '../../types';

// ─── Helpers ───
function makeMetrics(overrides: Partial<TelemetryMetrics> = {}): TelemetryMetrics {
  return {
    pasteCount: 0,
    engagementTime: 600,
    keystrokes: 200,
    clickCount: 50,
    startTime: Date.now() - 600_000,
    lastActive: Date.now(),
    ...overrides,
  };
}

function makeAggregated(overrides: Partial<AggregatedStudentMetrics> = {}): AggregatedStudentMetrics {
  return {
    totalTime: 3600,
    submissionCount: 5,
    totalClicks: 100,
    totalPastes: 2,
    totalKeystrokes: 500,
    totalXP: 200,
    activityDays: 4,
    ...overrides,
  };
}

// ─── calculateFeedback ───
describe('calculateFeedback', () => {
  it('returns FLAGGED for high paste + low engagement', () => {
    const metrics = makeMetrics({ pasteCount: 10, engagementTime: 100, keystrokes: 50 });
    const result = calculateFeedback(metrics);
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('AI Usage');
  });

  it('returns SUPPORT_NEEDED for high keystrokes + long engagement', () => {
    const metrics = makeMetrics({ keystrokes: 600, engagementTime: 2000, pasteCount: 0 });
    const result = calculateFeedback(metrics);
    expect(result.status).toBe('SUPPORT_NEEDED');
  });

  it('returns SUCCESS for zero pastes + sufficient keystrokes', () => {
    const metrics = makeMetrics({ pasteCount: 0, keystrokes: 200, engagementTime: 600 });
    const result = calculateFeedback(metrics);
    expect(result.status).toBe('SUCCESS');
  });

  it('returns NORMAL as fallback', () => {
    const metrics = makeMetrics({ pasteCount: 2, keystrokes: 50, engagementTime: 600 });
    const result = calculateFeedback(metrics);
    expect(result.status).toBe('NORMAL');
  });

  it('FLAGGED takes priority over SUPPORT_NEEDED', () => {
    // Both conditions met: high paste + low engagement AND high keystrokes + long engagement
    // FLAGGED check comes first
    const metrics = makeMetrics({ pasteCount: 10, engagementTime: 100, keystrokes: 600 });
    const result = calculateFeedback(metrics);
    expect(result.status).toBe('FLAGGED');
  });

  it('respects custom thresholds', () => {
    const metrics = makeMetrics({ pasteCount: 3, engagementTime: 200 });
    // With default thresholds, pasteCount 3 < 5 threshold → not flagged
    const defaultResult = calculateFeedback(metrics);
    expect(defaultResult.status).not.toBe('FLAGGED');

    // With lowered threshold, pasteCount 3 > 2 → flagged
    const customResult = calculateFeedback(metrics, { ...DEFAULT_THRESHOLDS, flagPasteCount: 2 });
    expect(customResult.status).toBe('FLAGGED');
  });

  it('boundary: pasteCount exactly at threshold is not flagged', () => {
    const metrics = makeMetrics({
      pasteCount: DEFAULT_THRESHOLDS.flagPasteCount,
      engagementTime: 100,
    });
    const result = calculateFeedback(metrics);
    // pasteCount must be > threshold, not >=
    expect(result.status).not.toBe('FLAGGED');
  });

  it('returns FLAGGED for chunked pastes (>15)', () => {
    const metrics = makeMetrics({ pasteCount: 16, keystrokes: 200, engagementTime: 600 });
    const result = calculateFeedback(metrics);
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('assembling an answer');
  });

  it('returns FLAGGED for high paste density', () => {
    const metrics = makeMetrics({ pasteCount: 5, wordCount: 30, keystrokes: 200, engagementTime: 600 });
    const result = calculateFeedback(metrics);
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('paste density');
  });

  it('returns FLAGGED for heavy auto-insert with low engagement', () => {
    const metrics = makeMetrics({ autoInsertCount: 6, engagementTime: 200, keystrokes: 50 });
    const result = calculateFeedback(metrics);
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('dictation');
  });

  it('does not flag low paste density', () => {
    const metrics = makeMetrics({ pasteCount: 2, wordCount: 100, keystrokes: 200, engagementTime: 600 });
    const result = calculateFeedback(metrics);
    expect(result.status).not.toBe('FLAGGED');
  });
});

// ─── generateTeacherSummary ───
describe('generateTeacherSummary', () => {
  it('includes engagement time in minutes', () => {
    const summary = generateTeacherSummary(makeMetrics({ engagementTime: 300 }));
    expect(summary).toContain('5 min');
  });

  it('includes keystroke and click counts', () => {
    const summary = generateTeacherSummary(makeMetrics({ keystrokes: 150, clickCount: 30 }));
    expect(summary).toContain('150 keystrokes');
    expect(summary).toContain('30 clicks');
  });

  it('includes paste count when > 0', () => {
    const summary = generateTeacherSummary(makeMetrics({ pasteCount: 3 }));
    expect(summary).toContain('3 paste events');
  });

  it('does not mention pastes when count is 0', () => {
    const summary = generateTeacherSummary(makeMetrics({ pasteCount: 0 }));
    expect(summary).not.toContain('paste');
  });

  it('flags high paste + low engagement', () => {
    const summary = generateTeacherSummary(makeMetrics({ pasteCount: 5, engagementTime: 120 }));
    expect(summary).toContain('review recommended');
  });

  it('notes strong independent work', () => {
    const summary = generateTeacherSummary(makeMetrics({ pasteCount: 0, keystrokes: 100, engagementTime: 300 }));
    expect(summary).toContain('independent work');
  });

  it('notes extended working sessions', () => {
    const summary = generateTeacherSummary(makeMetrics({ engagementTime: 3000, keystrokes: 500 }));
    expect(summary).toContain('Extended working session');
  });
});

// ─── createInitialMetrics ───
describe('createInitialMetrics', () => {
  it('returns zeroed counters', () => {
    const metrics = createInitialMetrics();
    expect(metrics.pasteCount).toBe(0);
    expect(metrics.engagementTime).toBe(0);
    expect(metrics.keystrokes).toBe(0);
    expect(metrics.clickCount).toBe(0);
  });

  it('sets startTime and lastActive to current time', () => {
    const before = Date.now();
    const metrics = createInitialMetrics();
    const after = Date.now();
    expect(metrics.startTime).toBeGreaterThanOrEqual(before);
    expect(metrics.startTime).toBeLessThanOrEqual(after);
    expect(metrics.lastActive).toBeGreaterThanOrEqual(before);
    expect(metrics.lastActive).toBeLessThanOrEqual(after);
  });
});

// ─── classifyStudentBucket ───
describe('classifyStudentBucket', () => {
  const classMean = 50;
  const classStdDev = 15;

  it('returns INACTIVE for zero activity', () => {
    const metrics = makeAggregated({ submissionCount: 0, totalTime: 30 });
    expect(classifyStudentBucket(metrics, 0, classMean, classStdDev)).toBe('INACTIVE');
  });

  it('returns COPYING for high paste ratio', () => {
    const metrics = makeAggregated({
      totalPastes: 50,
      totalKeystrokes: 30,
      submissionCount: 3,
    });
    // pasteRatio = 50/(30+50) = 0.625 > 0.4, subs >= 2, pastes > 8
    expect(classifyStudentBucket(metrics, 40, classMean, classStdDev)).toBe('COPYING');
  });

  it('returns STRUGGLING for high effort + low XP', () => {
    const metrics = makeAggregated({
      totalTime: 3600,
      submissionCount: 3,
      totalXP: 20,
      totalPastes: 1,
      totalKeystrokes: 500,
    });
    expect(classifyStudentBucket(metrics, 30, classMean, classStdDev)).toBe('STRUGGLING');
  });

  it('returns DISENGAGING for low ES + sparse activity', () => {
    const metrics = makeAggregated({
      activityDays: 1,
      submissionCount: 2,
      totalTime: 600,
      totalXP: 100,
      totalPastes: 0,
      totalKeystrokes: 200,
    });
    // zScore < -0.5, activityDays <= 2, submissionCount 1-3
    const lowES = classMean - classStdDev; // z = -1
    expect(classifyStudentBucket(metrics, lowES, classMean, classStdDev)).toBe('DISENGAGING');
  });

  it('returns SPRINTING for concentrated high activity', () => {
    const metrics = makeAggregated({
      totalTime: 3600,
      activityDays: 1,
      submissionCount: 5,
      totalPastes: 0,
      totalKeystrokes: 500,
      totalXP: 300,
    });
    expect(classifyStudentBucket(metrics, 60, classMean, classStdDev)).toBe('SPRINTING');
  });

  it('returns COASTING for below-average ES', () => {
    const metrics = makeAggregated({
      totalTime: 1200,
      activityDays: 3,
      submissionCount: 4,
      totalPastes: 0,
      totalKeystrokes: 200,
      totalXP: 150,
    });
    // zScore between -0.5 and -1.5
    const lowES = classMean - classStdDev * 0.8; // z = -0.8
    expect(classifyStudentBucket(metrics, lowES, classMean, classStdDev)).toBe('COASTING');
  });

  it('returns THRIVING for high-performing student', () => {
    const metrics = makeAggregated({
      totalTime: 5000,
      activityDays: 5,
      submissionCount: 8,
      totalPastes: 1,
      totalKeystrokes: 800,
      totalXP: 500,
    });
    // zScore > 0.75, subs >= 4, pasteRatio < 0.15, activityDays >= 3
    const highES = classMean + classStdDev * 1.5; // z = 1.5
    expect(classifyStudentBucket(metrics, highES, classMean, classStdDev)).toBe('THRIVING');
  });

  it('returns ON_TRACK as default', () => {
    const metrics = makeAggregated({
      totalTime: 2400,
      activityDays: 3,
      submissionCount: 4,
      totalPastes: 2,
      totalKeystrokes: 400,
      totalXP: 200,
    });
    // Average ES, doesn't trigger any specific bucket
    expect(classifyStudentBucket(metrics, classMean, classMean, classStdDev)).toBe('ON_TRACK');
  });

  it('handles zero stdDev gracefully', () => {
    const metrics = makeAggregated();
    const result = classifyStudentBucket(metrics, 50, 50, 0);
    // zScore = 0 when stdDev is 0, should return ON_TRACK or similar
    expect(result).toBeDefined();
  });

  it('INACTIVE takes priority over COPYING', () => {
    // Zero submissions but high paste ratio shouldn't matter
    const metrics = makeAggregated({
      submissionCount: 0,
      totalTime: 30,
      totalPastes: 100,
      totalKeystrokes: 10,
    });
    expect(classifyStudentBucket(metrics, 0, classMean, classStdDev)).toBe('INACTIVE');
  });
});

// ─── BUCKET_META ───
describe('BUCKET_META', () => {
  it('has metadata for all 8 buckets', () => {
    const buckets: TelemetryBucket[] = [
      'THRIVING', 'ON_TRACK', 'COASTING', 'SPRINTING',
      'STRUGGLING', 'DISENGAGING', 'INACTIVE', 'COPYING',
    ];
    for (const bucket of buckets) {
      expect(BUCKET_META[bucket]).toBeDefined();
      expect(BUCKET_META[bucket].label).toBeTruthy();
      expect(BUCKET_META[bucket].description).toBeTruthy();
      expect(BUCKET_META[bucket].color).toBeTruthy();
      expect(BUCKET_META[bucket].bgColor).toBeTruthy();
      expect(BUCKET_META[bucket].borderColor).toBeTruthy();
    }
  });
});

// ─── getBucketRecommendation ───
describe('getBucketRecommendation', () => {
  it('returns recommendations for all bucket types', () => {
    const buckets: TelemetryBucket[] = [
      'THRIVING', 'ON_TRACK', 'COASTING', 'SPRINTING',
      'STRUGGLING', 'DISENGAGING', 'INACTIVE', 'COPYING',
    ];
    for (const bucket of buckets) {
      const rec = getBucketRecommendation(bucket);
      expect(rec.categories.length).toBeGreaterThan(0);
      expect(rec.action).toBeTruthy();
      expect(rec.studentTip).toBeTruthy();
    }
  });

  it('recommends advanced resources for THRIVING students', () => {
    const rec = getBucketRecommendation('THRIVING');
    expect(rec.categories).toContain('Simulation');
    expect(rec.categories).toContain('Supplemental');
  });

  it('recommends low-barrier resources for INACTIVE students', () => {
    const rec = getBucketRecommendation('INACTIVE');
    expect(rec.categories).toContain('Lesson');
    expect(rec.action).toContain('outreach');
  });

  it('recommends original-work resources for COPYING students', () => {
    const rec = getBucketRecommendation('COPYING');
    expect(rec.categories).toContain('Practice');
    expect(rec.action).toContain('integrity');
  });
});

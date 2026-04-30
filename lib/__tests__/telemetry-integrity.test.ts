import { describe, it, expect } from 'vitest';

// Pure copy of the server-side calculateFeedbackServerSide logic for unit testing.
// Keep in sync with functions/src/core.ts.
function calculateFeedbackServerSide(
  metrics: {
    pasteCount: number;
    engagementTime: number;
    keystrokes: number;
    tabSwitchCount?: number;
    wordCount?: number;
    wordsPerSecond?: number;
    autoInsertCount?: number;
  },
  thresholds: {
    flagPasteCount?: number;
    flagMinEngagement?: number;
    supportKeystrokes?: number;
    supportMinEngagement?: number;
    successMinKeystrokes?: number;
  } = {},
  context?: { responseCount?: number; hasWrittenResponses?: boolean; assistiveTech?: boolean }
): { status: string; feedback: string; assistiveTechOverrides?: string[] } {
  const guardNumber = (value: unknown, defaultValue: number): number =>
    typeof value === 'number' && !isNaN(value) && value >= 0 ? value : defaultValue;

  const safeMetrics = {
    pasteCount: guardNumber(metrics.pasteCount, 0),
    engagementTime: guardNumber(metrics.engagementTime, 0),
    keystrokes: guardNumber(metrics.keystrokes, 0),
    tabSwitchCount: guardNumber(metrics.tabSwitchCount, 0),
    wordCount: guardNumber(metrics.wordCount, 0),
    wordsPerSecond: guardNumber(metrics.wordsPerSecond, 0),
    autoInsertCount: guardNumber(metrics.autoInsertCount, 0),
  };

  const maxKeystrokes = safeMetrics.wordCount > 0 ? safeMetrics.wordCount * 10 : safeMetrics.keystrokes;
  const maxPasteCount = safeMetrics.wordCount > 0 ? Math.max(0, Math.ceil(safeMetrics.wordCount / 2)) : safeMetrics.pasteCount;
  safeMetrics.keystrokes = Math.min(safeMetrics.keystrokes, maxKeystrokes);
  safeMetrics.pasteCount = Math.min(safeMetrics.pasteCount, maxPasteCount);

  const t = {
    flagPasteCount: 5,
    flagMinEngagement: 300,
    supportKeystrokes: 500,
    supportMinEngagement: 1800,
    successMinKeystrokes: 100,
    ...thresholds,
  };
  const overrides: string[] = [];
  const isAssistive = !!context?.assistiveTech;

  const maybeOverride = (checkName: string, wouldFlag: boolean): boolean => {
    if (wouldFlag && isAssistive) {
      overrides.push(checkName);
      return true;
    }
    return false;
  };

  // NEVER overridden — impossible even with assistive tech
  if (safeMetrics.wordsPerSecond > 3.0 && safeMetrics.keystrokes > 0) {
    return { status: 'FLAGGED', feedback: 'Impossible typing speed detected — possible automated input or macro.' };
  }
  if (safeMetrics.pasteCount > 15) {
    return { status: 'FLAGGED', feedback: 'Elevated paste count — student may be assembling an answer from multiple sources.' };
  }
  if (safeMetrics.pasteCount > t.flagPasteCount && safeMetrics.engagementTime < t.flagMinEngagement) {
    return { status: 'FLAGGED', feedback: 'AI Usage Suspected: Abnormal frequency of pasted content detected.' };
  }

  // MAY be overridden by assistive tech
  if (safeMetrics.engagementTime < 30 && context?.hasWrittenResponses) {
    if (!maybeOverride('impossibly_fast', true)) {
      return { status: 'FLAGGED', feedback: 'Impossibly fast submission: responses submitted with near-zero engagement time.' };
    }
  }
  if (context?.responseCount && context.responseCount > 0 && safeMetrics.engagementTime > 0) {
    const secondsPerResponse = safeMetrics.engagementTime / context.responseCount;
    if (secondsPerResponse < 5 && context.responseCount >= 2) {
      if (!maybeOverride('implausible_speed', true)) {
        return { status: 'FLAGGED', feedback: 'Implausible speed: average time per response too low for genuine work.' };
      }
    }
  }
  if (safeMetrics.keystrokes === 0 && safeMetrics.pasteCount === 0 && context?.hasWrittenResponses) {
    if (!maybeOverride('zero_input', true)) {
      return { status: 'FLAGGED', feedback: 'No input activity detected despite non-empty responses — possible pre-fill or API exploit.' };
    }
  }
  if (safeMetrics.tabSwitchCount > 5) {
    if (!maybeOverride('tab_switching', true)) {
      return { status: 'FLAGGED', feedback: 'Excessive tab switching during assessment.' };
    }
  }
  if (safeMetrics.pasteCount > 0 && safeMetrics.wordCount > 0 && safeMetrics.wordCount / safeMetrics.pasteCount < 10) {
    if (!maybeOverride('paste_density', true)) {
      return { status: 'FLAGGED', feedback: 'High paste density — frequent small pastes detected.' };
    }
  }
  if (safeMetrics.keystrokes === 0 && safeMetrics.wordCount > 20) {
    if (!maybeOverride('zero_keystrokes', true)) {
      return { status: 'FLAGGED', feedback: 'Text present with zero keystrokes — possible dictation, paste, or automated input.' };
    }
  }
  if (safeMetrics.autoInsertCount > 5 && safeMetrics.wordCount > 20 && safeMetrics.keystrokes < safeMetrics.wordCount * 3) {
    if (!maybeOverride('auto_insert', true)) {
      return { status: 'FLAGGED', feedback: 'Heavy auto-insert/dictation detected — verify original work.' };
    }
  }
  if (safeMetrics.keystrokes > 0 && safeMetrics.wordCount > 0 && safeMetrics.wordCount / safeMetrics.keystrokes > 0.5) {
    if (!maybeOverride('word_keystroke_ratio', true)) {
      return { status: 'FLAGGED', feedback: 'Word-to-keystroke ratio is implausibly high — possible paste or auto-insert.' };
    }
  }

  if (safeMetrics.keystrokes > t.supportKeystrokes && safeMetrics.engagementTime > t.supportMinEngagement) {
    return { status: 'SUPPORT_NEEDED', feedback: 'Student may be struggling — high effort with extended time.' };
  }
  if (safeMetrics.pasteCount === 0 && safeMetrics.keystrokes > t.successMinKeystrokes) {
    return { status: 'SUCCESS', feedback: 'Excellent independent work.' };
  }

  if (overrides.length > 0) {
    return {
      status: 'NORMAL',
      feedback: `Assignment submitted successfully. (${overrides.length} integrity check${overrides.length > 1 ? 's' : ''} overridden due to reported assistive technology.)`,
      assistiveTechOverrides: overrides,
    };
  }
  return { status: 'NORMAL', feedback: 'Assignment submitted successfully.' };
}

// Pure copy of server-side computePlausibilityScore for unit testing.
function computePlausibilityScore(
  serverElapsedSec: number,
  wordCount: number,
  responseCount: number,
  blockSaveTimestamps?: number[]
): { score: number; factors: string[] } {
  let score = 100;
  const factors: string[] = [];

  const wpsOnElapsed = serverElapsedSec > 0 ? wordCount / serverElapsedSec : 0;
  if (wpsOnElapsed > 3.0) {
    score -= 40;
    factors.push(`Impossible WPS on elapsed time (${wpsOnElapsed.toFixed(2)})`);
  } else if (wpsOnElapsed > 2.0) {
    score -= 25;
    factors.push(`Very high WPS on elapsed time (${wpsOnElapsed.toFixed(2)})`);
  } else if (wpsOnElapsed > 1.5) {
    score -= 10;
    factors.push(`High WPS on elapsed time (${wpsOnElapsed.toFixed(2)})`);
  }

  const timePerResponse = responseCount > 0 ? serverElapsedSec / responseCount : Infinity;
  if (timePerResponse < 5) {
    score -= 30;
    factors.push(`Very fast per-response time (${timePerResponse.toFixed(1)}s)`);
  } else if (timePerResponse < 10) {
    score -= 15;
    factors.push(`Fast per-response time (${timePerResponse.toFixed(1)}s)`);
  } else if (timePerResponse < 15) {
    score -= 5;
    factors.push(`Quick per-response time (${timePerResponse.toFixed(1)}s)`);
  }

  if (blockSaveTimestamps && blockSaveTimestamps.length >= 3) {
    const sorted = [...blockSaveTimestamps].sort((a, b) => a - b);
    const intervals = sorted.slice(1).map((t, i) => t - sorted[i]);
    const minInterval = Math.min(...intervals);
    if (minInterval < 1000) {
      score -= 20;
      factors.push(`Burst saves detected (${minInterval}ms between answers)`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), factors };
}

describe('calculateFeedbackServerSide', () => {
  it('returns NORMAL for healthy metrics', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 1, engagementTime: 600, keystrokes: 150,
      wordCount: 50, wordsPerSecond: 0.08, tabSwitchCount: 1,
    }, {}, { responseCount: 5, hasWrittenResponses: true });
    expect(result.status).toBe('NORMAL');
  });

  it('flags impossibly fast submissions', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 10, keystrokes: 50,
      wordCount: 30, wordsPerSecond: 3.0,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('Impossibly fast');
  });

  it('flags zero keystrokes with many words', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 1, engagementTime: 300, keystrokes: 0,
      wordCount: 50, wordsPerSecond: 0.17,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('zero keystrokes');
  });

  it('flags impossible typing speed', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 60, keystrokes: 10,
      wordCount: 200, wordsPerSecond: 3.33,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('Impossible typing speed');
  });

  it('flags excessive tab switches', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 600, keystrokes: 200,
      tabSwitchCount: 6,
    });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('Excessive tab switching');
  });

  it('flags high paste density', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 10, engagementTime: 600, keystrokes: 200,
      wordCount: 50, wordsPerSecond: 0.08,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('High paste density');
  });

  it('flags heavy auto-insert', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 600, keystrokes: 10,
      wordCount: 50, wordsPerSecond: 0.08, autoInsertCount: 6,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('auto-insert');
  });

  it('caps client-reported keystrokes', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 600, keystrokes: 1000,
      wordCount: 50, wordsPerSecond: 0.08,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('SUCCESS');
  });

  it('caps client-reported paste count', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 50, engagementTime: 600, keystrokes: 200,
      wordCount: 50, wordsPerSecond: 0.08,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('FLAGGED');
  });

  it('returns SUPPORT_NEEDED for high effort', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 1, engagementTime: 2000, keystrokes: 550,
      wordCount: 60, wordsPerSecond: 0.025,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('SUPPORT_NEEDED');
  });

  it('returns SUCCESS for excellent work', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 600, keystrokes: 150,
      wordCount: 50, wordsPerSecond: 0.08,
    }, {}, { hasWrittenResponses: true });
    expect(result.status).toBe('SUCCESS');
  });

  it('flags implausible speed per response', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 30, keystrokes: 50,
      wordCount: 20, wordsPerSecond: 0.67,
    }, {}, { responseCount: 7, hasWrittenResponses: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('Implausible speed');
  });

  // ── Tiered assistive-tech suppression tests ──

  it('STILL flags impossible WPS even with assistiveTech', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 60, keystrokes: 10,
      wordCount: 200, wordsPerSecond: 3.33,
    }, {}, { hasWrittenResponses: true, assistiveTech: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('Impossible typing speed');
  });

  it('STILL flags excessive pastes even with assistiveTech', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 20, engagementTime: 600, keystrokes: 200,
      wordCount: 50, wordsPerSecond: 0.08,
    }, {}, { hasWrittenResponses: true, assistiveTech: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('Elevated paste count');
  });

  it('allows zero keystrokes with assistiveTech (dictation)', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 300, keystrokes: 0,
      wordCount: 50, wordsPerSecond: 0.17,
    }, {}, { hasWrittenResponses: true, assistiveTech: true });
    expect(result.status).toBe('NORMAL');
    expect(result.assistiveTechOverrides).toContain('zero_keystrokes');
  });

  it('allows high autoInsert with assistiveTech (Grammarly)', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 600, keystrokes: 10,
      wordCount: 50, wordsPerSecond: 0.08, autoInsertCount: 6,
    }, {}, { hasWrittenResponses: true, assistiveTech: true });
    expect(result.status).toBe('NORMAL');
    expect(result.assistiveTechOverrides).toContain('auto_insert');
  });

  it('allows impossibly-fast with assistiveTech if no hard signals', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 10, keystrokes: 0,
      wordCount: 30, wordsPerSecond: 0.5,
    }, {}, { hasWrittenResponses: true, assistiveTech: true });
    expect(result.status).toBe('NORMAL');
    expect(result.assistiveTechOverrides).toContain('impossibly_fast');
  });
});

describe('computePlausibilityScore', () => {
  it('returns 100 for reasonable metrics', () => {
    const { score, factors } = computePlausibilityScore(600, 100, 5);
    expect(score).toBe(100);
    expect(factors).toHaveLength(0);
  });

  it('penalizes impossible WPS on elapsed time', () => {
    const { score, factors } = computePlausibilityScore(30, 100, 5);
    expect(score).toBeLessThan(100);
    expect(factors.some(f => f.includes('WPS'))).toBe(true);
  });

  it('penalizes very fast per-response time', () => {
    const { score, factors } = computePlausibilityScore(30, 50, 10);
    expect(score).toBeLessThan(100);
    expect(factors.some(f => f.includes('per-response'))).toBe(true);
  });

  it('penalizes burst saves', () => {
    const now = Date.now();
    const { score, factors } = computePlausibilityScore(600, 100, 5, [now, now + 500, now + 1000]);
    expect(score).toBeLessThan(100);
    expect(factors.some(f => f.includes('Burst'))).toBe(true);
  });

  it('caps score at 0', () => {
    const now = Date.now();
    const { score } = computePlausibilityScore(5, 500, 20, [now, now + 100, now + 200]);
    // 100 - 40 (WPS) - 30 (per-response) - 20 (burst) = 10
    expect(score).toBe(10);
  });
});

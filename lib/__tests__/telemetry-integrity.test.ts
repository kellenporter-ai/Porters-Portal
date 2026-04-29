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
): { status: string; feedback: string } {
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

  if (context?.assistiveTech) {
    return { status: 'NORMAL', feedback: 'Assignment submitted successfully. (Assistive technology used — integrity flags suppressed.)' };
  }

  const t = {
    flagPasteCount: 5,
    flagMinEngagement: 300,
    supportKeystrokes: 500,
    supportMinEngagement: 1800,
    successMinKeystrokes: 100,
    ...thresholds,
  };

  if (safeMetrics.engagementTime < 30 && context?.hasWrittenResponses) {
    return { status: 'FLAGGED', feedback: 'Impossibly fast submission: responses submitted with near-zero engagement time.' };
  }
  if (context?.responseCount && context.responseCount > 0 && safeMetrics.engagementTime > 0) {
    const secondsPerResponse = safeMetrics.engagementTime / context.responseCount;
    if (secondsPerResponse < 5 && context.responseCount >= 2) {
      return { status: 'FLAGGED', feedback: 'Implausible speed: average time per response too low for genuine work.' };
    }
  }
  if (safeMetrics.keystrokes === 0 && safeMetrics.pasteCount === 0 && context?.hasWrittenResponses) {
    return { status: 'FLAGGED', feedback: 'No input activity detected despite non-empty responses — possible pre-fill or API exploit.' };
  }
  if (safeMetrics.tabSwitchCount > 5) {
    return { status: 'FLAGGED', feedback: 'Excessive tab switching during assessment.' };
  }
  if (safeMetrics.pasteCount > 15) {
    return { status: 'FLAGGED', feedback: 'Elevated paste count — student may be assembling an answer from multiple sources.' };
  }
  if (safeMetrics.pasteCount > 0 && safeMetrics.wordCount > 0 && safeMetrics.wordCount / safeMetrics.pasteCount < 10) {
    return { status: 'FLAGGED', feedback: 'High paste density — frequent small pastes detected.' };
  }
  if (safeMetrics.wordsPerSecond > 3.0 && safeMetrics.keystrokes > 0) {
    return { status: 'FLAGGED', feedback: 'Impossible typing speed detected — possible automated input or macro.' };
  }
  if (safeMetrics.keystrokes === 0 && safeMetrics.wordCount > 20) {
    return { status: 'FLAGGED', feedback: 'Text present with zero keystrokes — possible dictation, paste, or automated input.' };
  }
  if (safeMetrics.autoInsertCount > 5 && safeMetrics.wordCount > 20 && safeMetrics.keystrokes < safeMetrics.wordCount * 3) {
    return { status: 'FLAGGED', feedback: 'Heavy auto-insert/dictation detected — verify original work.' };
  }
  if (safeMetrics.keystrokes > 0 && safeMetrics.wordCount > 0 && safeMetrics.wordCount / safeMetrics.keystrokes > 0.5) {
    return { status: 'FLAGGED', feedback: 'Word-to-keystroke ratio is implausibly high — possible paste or auto-insert.' };
  }
  if (safeMetrics.pasteCount > t.flagPasteCount && safeMetrics.engagementTime < t.flagMinEngagement) {
    return { status: 'FLAGGED', feedback: 'AI Usage Suspected: Abnormal frequency of pasted content detected.' };
  }
  if (safeMetrics.keystrokes > t.supportKeystrokes && safeMetrics.engagementTime > t.supportMinEngagement) {
    return { status: 'SUPPORT_NEEDED', feedback: 'Student may be struggling — high effort with extended time.' };
  }
  if (safeMetrics.pasteCount === 0 && safeMetrics.keystrokes > t.successMinKeystrokes) {
    return { status: 'SUCCESS', feedback: 'Excellent independent work.' };
  }
  return { status: 'NORMAL', feedback: 'Assignment submitted successfully.' };
}

describe('calculateFeedbackServerSide', () => {
  it('returns NORMAL for healthy metrics', () => {
    // Use pasteCount > 0 and enough keystrokes to keep ratio < 0.5
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
    // Must have some pastes to skip the "zero input" check and reach the "zero keystrokes + words" check
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
    // 1000 keystrokes for 50 words should be capped to 500
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 600, keystrokes: 1000,
      wordCount: 50, wordsPerSecond: 0.08,
    }, {}, { hasWrittenResponses: true });
    // With capped keystrokes (500), ratio is 50/500 = 0.1 which is < 0.5
    // pasteCount is 0 and keystrokes > 100, so SUCCESS (not NORMAL)
    expect(result.status).toBe('SUCCESS');
  });

  it('caps client-reported paste count', () => {
    // 50 pastes for 50 words should be capped to 25
    const result = calculateFeedbackServerSide({
      pasteCount: 50, engagementTime: 600, keystrokes: 200,
      wordCount: 50, wordsPerSecond: 0.08,
    }, {}, { hasWrittenResponses: true });
    // Capped to 25 pastes, density = 50/25 = 2 which is < 10, so FLAGGED
    expect(result.status).toBe('FLAGGED');
  });

  it('suppresses flags when assistiveTech is reported', () => {
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 10, keystrokes: 0,
      wordCount: 100, wordsPerSecond: 10,
    }, {}, { hasWrittenResponses: true, assistiveTech: true });
    expect(result.status).toBe('NORMAL');
    expect(result.feedback).toContain('Assistive technology');
  });

  it('returns SUPPORT_NEEDED for high effort', () => {
    // Must have some pastes to avoid SUCCESS, and high keystrokes + long time
    // wordCount*10 must exceed supportKeystrokes (500) so capping doesn't clip
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
    // engagementTime must be >= 30 to avoid the earlier impossibly-fast check
    // 30/7 = 4.28s per response which is < 5s threshold
    const result = calculateFeedbackServerSide({
      pasteCount: 0, engagementTime: 30, keystrokes: 50,
      wordCount: 20, wordsPerSecond: 0.67,
    }, {}, { responseCount: 7, hasWrittenResponses: true });
    expect(result.status).toBe('FLAGGED');
    expect(result.feedback).toContain('Implausible speed');
  });
});

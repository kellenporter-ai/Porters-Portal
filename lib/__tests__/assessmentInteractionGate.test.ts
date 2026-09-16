import { describe, it, expect } from 'vitest';
import { hasAssessmentInteraction } from '../assessmentInteractionGate';

describe('hasAssessmentInteraction (assessment submit gate)', () => {
  it('blocks a fully idle student (all counters zero)', () => {
    expect(hasAssessmentInteraction({ keystrokes: 0, pasteCount: 0, autoInsertCount: 0, clickCount: 0 })).toBe(false);
  });

  it('blocks when counters are missing/undefined (fresh session)', () => {
    expect(hasAssessmentInteraction({ keystrokes: 0, pasteCount: 0 } as Parameters<typeof hasAssessmentInteraction>[0])).toBe(false);
  });

  it('passes a typing student (keystrokes > 0)', () => {
    expect(hasAssessmentInteraction({ keystrokes: 12, pasteCount: 0, autoInsertCount: 0, clickCount: 0 })).toBe(true);
  });

  it('passes a paste-only student (pasteCount > 0)', () => {
    expect(hasAssessmentInteraction({ keystrokes: 0, pasteCount: 1, autoInsertCount: 0, clickCount: 0 })).toBe(true);
  });

  it('passes an MCQ-only student who only clicked answer choices (clickCount > 0)', () => {
    expect(hasAssessmentInteraction({ keystrokes: 0, pasteCount: 0, autoInsertCount: 0, clickCount: 3 })).toBe(true);
  });

  it('passes a dictation / auto-insert student (autoInsertCount > 0, no keystrokes)', () => {
    expect(hasAssessmentInteraction({ keystrokes: 0, pasteCount: 0, autoInsertCount: 5, clickCount: 0 })).toBe(true);
  });

  it('passes a mixed-interaction student', () => {
    expect(hasAssessmentInteraction({ keystrokes: 40, pasteCount: 2, autoInsertCount: 1, clickCount: 7 })).toBe(true);
  });
});

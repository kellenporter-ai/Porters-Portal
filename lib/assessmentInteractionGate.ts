import type { TelemetryMetrics } from '../types';

/**
 * Interaction-aware anti-rush gate for the ASSESSMENT SUBMIT path only.
 *
 * Background: after the 2026-05-15 engagement-timer fix, visible tab time is
 * credited even without input (reading inside iframes / nested scrollers must
 * not be penalized). That means an idle student can now sit on a visible
 * assessment tab for 30s and pass the engagement floor with literal inactivity.
 * This helper adds an *additional* interaction requirement on top of the
 * existing MIN_ASSESSMENT_ENGAGEMENT_SEC floor (which stays unchanged).
 *
 * Design constraint (Kellen, non-negotiable): reading-only resources must NOT
 * be penalized — this gate is applied ONLY by the assessment submit handler,
 * never by submitEngagement or any non-assessment completion path.
 *
 * What counts as genuine interaction (all cumulative counters in TelemetryMetrics):
 *  - keystrokes        — typed answers (Proctor handleKeyDown)
 *  - pasteCount        — paste / insertFromPaste / insertFromDrop (Proctor handlePaste + handleBeforeInput)
 *  - autoInsertCount   — dictation, Grammarly rewrites, mobile auto-suggest, IME composition
 *                        (Proctor handleBeforeInput: insertReplacementText / insertFromComposition).
 *                        Must NOT falsely block dictation students.
 *  - clickCount        — every window click (Proctor handleClick), which covers
 *                        MCQ-only students who only click answer choices.
 *
 * Returns true when the student has shown at least one genuine interaction.
 */
export function hasAssessmentInteraction(metrics: Pick<TelemetryMetrics, 'keystrokes' | 'pasteCount' | 'autoInsertCount' | 'clickCount'>): boolean {
  return (
    (metrics.keystrokes || 0) +
      (metrics.pasteCount || 0) +
      (metrics.autoInsertCount || 0) +
      (metrics.clickCount || 0) >
    0
  );
}


import { TelemetryMetrics, Submission } from '../types';

// Default thresholds — can be overridden by admin via class config
export interface TelemetryThresholds {
  flagPasteCount: number;      // Paste count above this triggers flag
  flagMinEngagement: number;   // Engagement below this (seconds) + high paste = flag
  supportKeystrokes: number;   // Keystrokes above this + long engagement = support needed
  supportMinEngagement: number; // Engagement above this (seconds) + high keystrokes = support
  successMinKeystrokes: number; // Min keystrokes for "excellent" status
}

export const DEFAULT_THRESHOLDS: TelemetryThresholds = {
  flagPasteCount: 5,
  flagMinEngagement: 300,
  supportKeystrokes: 500,
  supportMinEngagement: 1800,
  successMinKeystrokes: 100,
};

export const calculateFeedback = (
  metrics: TelemetryMetrics,
  thresholds: TelemetryThresholds = DEFAULT_THRESHOLDS
): { status: Submission['status'], feedback: string } => {
  const { pasteCount, engagementTime, keystrokes } = metrics;
  
  // AI Usage Suspicion: High pastes, very low engagement time
  if (pasteCount > thresholds.flagPasteCount && engagementTime < thresholds.flagMinEngagement) {
    return {
      status: 'FLAGGED',
      feedback: "AI Usage Suspected: Abnormal frequency of pasted content detected relative to active working time."
    };
  }

  // Support Needed: High keystrokes, very long engagement (potentially struggling)
  if (keystrokes > thresholds.supportKeystrokes && engagementTime > thresholds.supportMinEngagement) {
    return {
      status: 'SUPPORT_NEEDED',
      feedback: "You're working hard! Don't hesitate to ask Mr. Porter for help if you're feeling stuck on this topic."
    };
  }

  // Success: No pastes, steady progress
  if (pasteCount === 0 && keystrokes > thresholds.successMinKeystrokes) {
    return {
      status: 'SUCCESS',
      feedback: "Excellent independent work. Your metrics show steady, original progress throughout the assignment."
    };
  }

  return {
    status: 'NORMAL',
    feedback: "Assignment submitted successfully. Great job keeping up with your coursework."
  };
};

/**
 * Generate a human-readable interpretive summary for the teacher
 * instead of just a status code.
 */
export const generateTeacherSummary = (metrics: TelemetryMetrics): string => {
    const { pasteCount, engagementTime, keystrokes, clickCount } = metrics;
    const minutes = Math.round(engagementTime / 60);
    const parts: string[] = [];

    parts.push(`${minutes} min active engagement, ${keystrokes} keystrokes, ${clickCount} clicks`);

    if (pasteCount > 0) {
        parts.push(`${pasteCount} paste event${pasteCount > 1 ? 's' : ''}`);
    }

    // Behavioral observations
    if (pasteCount > 3 && engagementTime < 180) {
        parts.push('⚠️ High paste frequency with very low engagement — review recommended');
    } else if (pasteCount > 3) {
        parts.push('⚡ Elevated paste count — may be using external resources or notes');
    }

    if (engagementTime > 2400 && keystrokes > 400) {
        parts.push('📘 Extended working session — student may need additional support');
    }

    if (pasteCount === 0 && keystrokes > 80 && engagementTime > 120) {
        parts.push('✅ Strong independent work indicators');
    }

    return parts.join(' · ');
};

export const createInitialMetrics = (): TelemetryMetrics => ({
  pasteCount: 0,
  engagementTime: 0,
  keystrokes: 0,
  clickCount: 0,
  startTime: Date.now(),
  lastActive: Date.now(),
});


import { TelemetryMetrics, Submission, TelemetryBucket, BucketRecommendation } from '../types';

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
  const { pasteCount, engagementTime, keystrokes, autoInsertCount } = metrics;

  // Chunked pastes: student copying in tiny fragments to avoid detection
  if (pasteCount > 15) {
    return {
      status: 'FLAGGED',
      feedback: "Elevated paste count — student may be assembling an answer from multiple sources."
    };
  }

  // High paste density: more than one paste per 10 words
  const wordCount = metrics.wordCount || 0;
  if (pasteCount > 0 && wordCount > 0 && wordCount / pasteCount < 10) {
    return {
      status: 'FLAGGED',
      feedback: "High paste density — frequent small pastes detected."
    };
  }

  // Auto-insert suspicion: Grammarly, dictation, mobile auto-suggest used heavily with low engagement
  if ((autoInsertCount || 0) > 5 && engagementTime < 300) {
    return {
      status: 'FLAGGED',
      feedback: "Heavy auto-insert/dictation detected with low engagement — verify original work."
    };
  }

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
  autoInsertCount: 0,
  startTime: Date.now(),
  lastActive: Date.now(),
  tabSwitchCount: 0,
  perBlockTiming: {},
  typingCadence: { avgIntervalMs: 0, burstCount: 0 },
});

// ========================================
// TELEMETRY BUCKETING ENGINE
// ========================================

/** Aggregated metrics for a student over the analysis window */
export interface AggregatedStudentMetrics {
  totalTime: number;           // Total engagement seconds
  submissionCount: number;     // Number of submissions
  totalClicks: number;         // Total click events
  totalPastes: number;         // Total paste events
  totalKeystrokes: number;     // Total keystroke events
  totalXP: number;             // XP earned in window
  activityDays: number;        // Number of distinct days with submissions (0-7)
  schoolActivityDays?: number; // Distinct school days with activity (optional — from Cloud Function)
  schoolDaysInWindow7?: number; // School days in the 7-day analysis window (optional)
}

/**
 * Classify a student into a behavioral bucket based on aggregated telemetry.
 *
 * The classifier uses a priority-ordered decision tree:
 * 1. INACTIVE  — Near-zero signals
 * 2. COPYING   — Disproportionate paste-to-keystroke ratio
 * 3. STRUGGLING — High effort, low returns
 * 4. DISENGAGING — Below-average ES with sparse activity days
 * 5. SPRINTING — High total engagement but concentrated in few days
 * 6. COASTING  — Below-average but not concerning
 * 7. THRIVING  — Above-average engagement and output
 * 8. ON_TRACK  — Default: meeting expectations
 */
export function classifyStudentBucket(
  metrics: AggregatedStudentMetrics,
  engagementScore: number,
  classMean: number,
  classStdDev: number,
): TelemetryBucket {
  const {
    totalTime, submissionCount, totalPastes, totalKeystrokes, totalXP, activityDays,
    schoolActivityDays, schoolDaysInWindow7,
  } = metrics;
  const zScore = classStdDev > 0 ? (engagementScore - classMean) / classStdDev : 0;
  const pasteRatio = (totalKeystrokes + totalPastes) > 0
    ? totalPastes / (totalKeystrokes + totalPastes)
    : 0;
  // Use school-day-aware counts when available; fall back to calendar counts
  const effectiveSchoolDays = schoolDaysInWindow7 ?? 7;
  const effectiveSchoolActivityDays = schoolActivityDays ?? activityDays;

  // 1. INACTIVE: Zero or near-zero activity, only flagged when school was actually in session
  if (submissionCount === 0 && totalTime < 60 && effectiveSchoolDays >= 3) {
    return 'INACTIVE';
  }

  // 2. COPYING: High paste ratio with meaningful submission count
  //    Paste events represent >40% of all input events AND at least 3 subs
  if (pasteRatio > 0.4 && submissionCount >= 2 && totalPastes > 8) {
    return 'COPYING';
  }

  // 3. STRUGGLING: High effort (time + keystrokes) but low XP yield
  //    30+ min engagement, at least 2 subs, but XP below 50
  if (totalTime > 1800 && submissionCount >= 2 && totalXP < 50) {
    return 'STRUGGLING';
  }

  // 4. DISENGAGING: Below-average ES AND activity concentrated in ≤1 school day
  //    (suggests they were active earlier but trailing off)
  if (zScore < -0.5 && effectiveSchoolActivityDays <= 1 && submissionCount >= 1 && submissionCount <= 3) {
    return 'DISENGAGING';
  }

  // 5. SPRINTING: Above-average total time but concentrated in few days
  //    High engagement squeezed into 1-2 days out of 7
  if (totalTime > 1800 && activityDays <= 2 && submissionCount >= 3) {
    return 'SPRINTING';
  }

  // 6. COASTING: Below-average ES but still some activity
  if (zScore < -0.5 && zScore >= -1.5) {
    return 'COASTING';
  }

  // 7. THRIVING: Well above average (>0.75 stddev), good submission count,
  //    low paste ratio, and spread-out activity
  if (zScore > 0.75 && submissionCount >= 4 && pasteRatio < 0.15 && activityDays >= 3) {
    return 'THRIVING';
  }

  // 8. ON_TRACK: Default — meeting expectations
  return 'ON_TRACK';
}

/** Bucket display metadata for UI rendering */
export const BUCKET_META: Record<TelemetryBucket, {
  label: string;
  description: string;
  color: string;        // Tailwind text color class
  bgColor: string;      // Tailwind bg color class
  borderColor: string;  // Tailwind border color class
  icon: string;         // Descriptive icon hint for the UI
}> = {
  THRIVING: {
    label: 'Thriving',
    description: 'Consistently high engagement with strong original work.',
    color: 'text-emerald-700 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/15',
    borderColor: 'border-emerald-500/30',
    icon: 'star',
  },
  ON_TRACK: {
    label: 'On Track',
    description: 'Meeting expectations with steady engagement.',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
    icon: 'check',
  },
  COASTING: {
    label: 'Coasting',
    description: 'Below-average engagement — doing the minimum.',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-500/15',
    borderColor: 'border-yellow-500/30',
    icon: 'minus',
  },
  SPRINTING: {
    label: 'Sprinting',
    description: 'Inconsistent: high bursts of activity with gaps between.',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/15',
    borderColor: 'border-orange-500/30',
    icon: 'zap',
  },
  STRUGGLING: {
    label: 'Struggling',
    description: 'Putting in effort but achieving low results — may need support.',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/15',
    borderColor: 'border-purple-500/30',
    icon: 'help',
  },
  DISENGAGING: {
    label: 'Disengaging',
    description: 'Activity is declining — was active but now trailing off.',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/15',
    borderColor: 'border-red-500/30',
    icon: 'trending-down',
  },
  INACTIVE: {
    label: 'Inactive',
    description: 'No meaningful activity detected in the analysis window.',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/15',
    borderColor: 'border-gray-500/30',
    icon: 'x',
  },
  COPYING: {
    label: 'Copying',
    description: 'High paste-to-keystroke ratio — may indicate copy-paste behavior.',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-500/15',
    borderColor: 'border-rose-500/30',
    icon: 'clipboard',
  },
};

// ========================================
// RESOURCE RECOMMENDATION ENGINE
// ========================================

/**
 * Generate resource category recommendations based on a student's bucket.
 * Returns the recommended resource categories, teacher action, and student tip.
 */
export function getBucketRecommendation(bucket: TelemetryBucket): BucketRecommendation {
  switch (bucket) {
    case 'THRIVING':
      return {
        categories: ['Simulation', 'Supplemental', 'Lesson'],
        action: 'Challenge with advanced or supplemental material. Consider peer-tutoring role.',
        studentTip: 'You\'re crushing it! Try the simulations and supplemental resources to push further.',
      };
    case 'ON_TRACK':
      return {
        categories: ['Practice', 'Lesson'],
        action: 'Continue current approach. Provide enrichment if interest is shown.',
        studentTip: 'Solid work — keep the momentum going with practice sets and readings.',
      };
    case 'COASTING':
      return {
        categories: ['Practice', 'Simulation', 'Lesson'],
        action: 'Increase engagement with interactive resources. Check in on motivation.',
        studentTip: 'Try a simulation or practice set to boost your skills — small steps add up!',
      };
    case 'SPRINTING':
      return {
        categories: ['Lesson', 'Practice'],
        action: 'Encourage consistent daily engagement instead of cramming. Set micro-goals.',
        studentTip: 'Spreading your study across the week helps retention — try a bit each day.',
      };
    case 'STRUGGLING':
      return {
        categories: ['Lesson', 'Lab', 'Practice'],
        action: 'Offer direct support. Recommend foundational resources and check understanding.',
        studentTip: 'Your effort shows! Try video lessons for a fresh perspective on tricky topics.',
      };
    case 'DISENGAGING':
      return {
        categories: ['Lesson', 'Simulation'],
        action: 'Reach out personally. Low-friction resources to re-establish habit.',
        studentTip: 'We miss seeing you active — a quick video or sim is a great way to jump back in.',
      };
    case 'INACTIVE':
      return {
        categories: ['Lesson'],
        action: 'Immediate outreach required. Check for external factors. Lowest-barrier resources.',
        studentTip: 'Start small — even watching one video lesson counts. We\'re here to help!',
      };
    case 'COPYING':
      return {
        categories: ['Practice', 'Lesson', 'Lab'],
        action: 'Discuss academic integrity. Redirect to original-work resources.',
        studentTip: 'Working through problems yourself builds the strongest understanding — give it a try!',
      };
  }
}

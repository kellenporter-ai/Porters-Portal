import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, MessageSquare, User as UserIcon, Eye } from 'lucide-react';
import { User, StudentAlert, StudentBucketProfile, TelemetryBucket } from '../../types';
import { BUCKET_META } from '../../lib/telemetry';

// ─── Threshold defaults (used when ClassConfig.telemetryThresholds is absent) ───

/** Minimum minutes of total engagement per week to avoid a "low engagement" flag */
const DEFAULT_MIN_ENGAGEMENT_MINUTES = 15;

/** Maximum daily-challenge consecutive misses before flagging */
const DEFAULT_MAX_MISSED_CHALLENGES = 2;

/** TelemetryBuckets that are considered at-risk for the panel */
const AT_RISK_BUCKETS: ReadonlySet<TelemetryBucket> = new Set<TelemetryBucket>([
  'STRUGGLING',
  'DISENGAGING',
  'INACTIVE',
  'COPYING',
]);

// ─── Types ───

export type WarningSignalKind =
  | 'LOW_ENGAGEMENT'
  | 'HIGH_PASTE_COUNT'
  | 'MISSED_CHALLENGES'
  | 'AT_RISK_BUCKET'
  | 'EWS_ALERT';

export type WarningSeverity = 'watch' | 'intervene';

export interface WarningSignal {
  kind: WarningSignalKind;
  label: string;
  severity: WarningSeverity;
}

export interface FlaggedStudent {
  student: User;
  signals: WarningSignal[];
  /** Highest severity across all signals */
  topSeverity: WarningSeverity;
}

export interface EarlyWarningPanelProps {
  /** All students for the class (role === 'STUDENT') */
  students: User[];
  /** Server-side EWS alerts from Firestore (subscribed externally) */
  alerts: StudentAlert[];
  /** Bucket profiles from Firestore (subscribed externally) */
  bucketProfiles: StudentBucketProfile[];
  /**
   * Override thresholds from ClassConfig.telemetryThresholds.
   * If absent, built-in defaults are used.
   */
  thresholds?: {
    flagMinEngagement?: number;   // seconds below which engagement is flagged
    flagPasteCount?: number;      // paste count above which is flagged
  };
  /** Called when teacher clicks "Message" on a student card */
  onMessage?: (student: User) => void;
  /** Called when teacher clicks "View Profile" on a student card */
  onViewProfile?: (student: User) => void;
}

// ─── Helpers ───

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ─── Sub-components ───

const SeverityPip: React.FC<{ severity: WarningSeverity }> = ({ severity }) =>
  severity === 'intervene' ? (
    <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" aria-label="Intervene" title="Intervene now" />
  ) : (
    <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 shrink-0" aria-label="Watch" title="Monitor" />
  );

const SignalChip: React.FC<{ signal: WarningSignal }> = ({ signal }) => {
  const colorClass =
    signal.severity === 'intervene'
      ? 'bg-red-500/15 text-red-400 border-red-500/30'
      : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${colorClass}`}>
      {signal.label}
    </span>
  );
};

interface StudentCardProps {
  flagged: FlaggedStudent;
  onMessage?: (student: User) => void;
  onViewProfile?: (student: User) => void;
}

const StudentCard: React.FC<StudentCardProps> = ({ flagged, onMessage, onViewProfile }) => {
  const { student, signals, topSeverity } = flagged;
  const cardBorder =
    topSeverity === 'intervene'
      ? 'border-red-500/30 bg-red-900/10'
      : 'border-yellow-500/20 bg-yellow-900/10';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${cardBorder}`}>
      {/* Avatar */}
      <div className="shrink-0">
        {student.avatarUrl ? (
          <img
            src={student.avatarUrl}
            alt={`${student.name} avatar`}
            className="w-9 h-9 rounded-full object-cover border border-[var(--border)]"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full bg-[var(--surface-glass)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--text-secondary)]"
            aria-hidden="true"
          >
            {getInitials(student.name)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <SeverityPip severity={topSeverity} />
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">{student.name}</span>
          {student.classType && (
            <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">{student.classType}</span>
          )}
        </div>

        {/* Warning signal chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          {signals.map((sig) => (
            <SignalChip key={sig.kind} signal={sig} />
          ))}
        </div>

        {/* Quick-action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onMessage?.(student)}
            className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-400 rounded-lg text-[11px] font-bold transition"
            aria-label={`Message ${student.name}`}
          >
            <MessageSquare className="w-3 h-3" aria-hidden="true" />
            Message
          </button>
          <button
            type="button"
            onClick={() => onViewProfile?.(student)}
            className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg text-[11px] font-bold transition"
            aria-label={`View profile for ${student.name}`}
          >
            <Eye className="w-3 h-3" aria-hidden="true" />
            View Profile
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───

const EarlyWarningPanel: React.FC<EarlyWarningPanelProps> = ({
  students,
  alerts,
  bucketProfiles,
  thresholds,
  onMessage,
  onViewProfile,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Resolve effective thresholds
  const minEngagementSeconds =
    thresholds?.flagMinEngagement ?? DEFAULT_MIN_ENGAGEMENT_MINUTES * 60;

  // Pre-build fast lookups — O(n) before render, not in render loop
  const alertsByStudentId = useMemo(() => {
    const map = new Map<string, StudentAlert>();
    for (const alert of alerts) {
      const existing = map.get(alert.studentId);
      const severity: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
      if (!existing || (severity[alert.riskLevel] ?? 0) > (severity[existing.riskLevel] ?? 0)) {
        map.set(alert.studentId, alert);
      }
    }
    return map;
  }, [alerts]);

  const bucketByStudentId = useMemo(() => {
    const map = new Map<string, StudentBucketProfile>();
    for (const bp of bucketProfiles) {
      if (!map.has(bp.studentId)) map.set(bp.studentId, bp);
    }
    return map;
  }, [bucketProfiles]);

  // Build list of flagged students — pure derivation from props, no side-effects
  const flaggedStudents = useMemo((): FlaggedStudent[] => {
    const results: FlaggedStudent[] = [];

    for (const student of students) {
      const signals: WarningSignal[] = [];

      // ── Signal 1: Low engagement time (from User.stats.totalTime, in seconds) ──
      const totalTimeSecs = student.stats?.totalTime ?? 0;
      if (totalTimeSecs > 0 && totalTimeSecs < minEngagementSeconds) {
        const totalTimeMins = Math.round(totalTimeSecs / 60);
        signals.push({
          kind: 'LOW_ENGAGEMENT',
          label: `Low engagement: ${totalTimeMins}min avg`,
          severity: totalTimeSecs < 300 ? 'intervene' : 'watch',
        });
      }

      // ── Signal 2: At-risk telemetry bucket ──
      const bucketProfile = bucketByStudentId.get(student.id);
      if (bucketProfile && AT_RISK_BUCKETS.has(bucketProfile.bucket)) {
        const meta = BUCKET_META[bucketProfile.bucket];
        const isInterventionBucket: TelemetryBucket[] = ['INACTIVE', 'DISENGAGING'];
        signals.push({
          kind: 'AT_RISK_BUCKET',
          label: meta.label,
          severity: isInterventionBucket.includes(bucketProfile.bucket) ? 'intervene' : 'watch',
        });

        // ── Signal 2b: High paste count (derived from bucket metrics) ──
        const pasteThreshold = thresholds?.flagPasteCount ?? 5;
        if (
          bucketProfile.bucket === 'COPYING' &&
          bucketProfile.metrics.totalPastes > pasteThreshold
        ) {
          signals.push({
            kind: 'HIGH_PASTE_COUNT',
            label: `High paste rate: ${bucketProfile.metrics.totalPastes} pastes`,
            severity: 'intervene',
          });
        }
      }

      // ── Signal 3: Server-side EWS alert ──
      const ewsAlert = alertsByStudentId.get(student.id);
      if (ewsAlert && !ewsAlert.isDismissed) {
        const isCritical = ewsAlert.riskLevel === 'CRITICAL' || ewsAlert.riskLevel === 'HIGH';
        signals.push({
          kind: 'EWS_ALERT',
          label: ewsAlert.riskLevel.charAt(0) + ewsAlert.riskLevel.slice(1).toLowerCase(),
          severity: isCritical ? 'intervene' : 'watch',
        });
      }

      // ── Signal 4: Incomplete daily challenges ──
      const challenges = student.gamification?.activeDailyChallenges ?? [];
      const missedCount = challenges.filter((c) => !c.completed).length;
      if (missedCount >= DEFAULT_MAX_MISSED_CHALLENGES) {
        signals.push({
          kind: 'MISSED_CHALLENGES',
          label: `${missedCount} incomplete challenges`,
          severity: missedCount >= 3 ? 'intervene' : 'watch',
        });
      }

      if (signals.length > 0) {
        const topSeverity: WarningSeverity = signals.some((s) => s.severity === 'intervene')
          ? 'intervene'
          : 'watch';
        results.push({ student, signals, topSeverity });
      }
    }

    // Sort: intervene first, then watch; alphabetical within each group
    results.sort((a, b) => {
      if (a.topSeverity !== b.topSeverity) {
        return a.topSeverity === 'intervene' ? -1 : 1;
      }
      return a.student.name.localeCompare(b.student.name);
    });

    return results;
  }, [students, alertsByStudentId, bucketByStudentId, minEngagementSeconds, thresholds]);

  const interveneCount = flaggedStudents.filter((f) => f.topSeverity === 'intervene').length;
  const watchCount = flaggedStudents.filter((f) => f.topSeverity === 'watch').length;
  const totalCount = flaggedStudents.length;

  // Panel is always rendered (even at 0 flags) so teachers know the system is active
  const panelBorderClass =
    interveneCount > 0
      ? 'border-red-500/30 bg-red-900/10'
      : totalCount > 0
      ? 'border-amber-500/30 bg-amber-900/10'
      : 'border-[var(--border)] bg-[var(--surface-glass)]';

  const headerTextClass =
    interveneCount > 0
      ? 'text-red-400'
      : totalCount > 0
      ? 'text-amber-400'
      : 'text-[var(--text-tertiary)]';

  return (
    <div className={`rounded-3xl border backdrop-blur-md transition-colors ${panelBorderClass}`}>
      {/* ── Collapsible Header ── */}
      <button
        type="button"
        className="w-full flex items-center justify-between p-6 text-left"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-controls="early-warning-body"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle
            className={`w-5 h-5 ${interveneCount > 0 ? 'text-red-400' : totalCount > 0 ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}
            aria-hidden="true"
          />
          <h3 className={`text-xl font-bold ${headerTextClass}`}>Early Warning</h3>

          {/* Count badges */}
          {totalCount > 0 ? (
            <div className="flex items-center gap-1.5">
              {interveneCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">
                  {interveneCount} intervene
                </span>
              )}
              {watchCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500/80 text-black">
                  {watchCount} watch
                </span>
              )}
            </div>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400">
              All clear
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          {totalCount > 0 && !isExpanded && (
            <span className="text-xs text-[var(--text-tertiary)]">
              {totalCount} student{totalCount !== 1 ? 's' : ''} flagged
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* ── Expanded Body ── */}
      {isExpanded && (
        <div id="early-warning-body" className="px-6 pb-6">
          {totalCount === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)] italic">
              <UserIcon className="w-10 h-10 mx-auto mb-2 opacity-20" aria-hidden="true" />
              No students flagged. Engagement looks healthy.
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 text-xs text-[var(--text-tertiary)]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  Intervene — needs immediate attention
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                  Watch — monitor closely
                </span>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                {flaggedStudents.map((flagged) => (
                  <StudentCard
                    key={flagged.student.id}
                    flagged={flagged}
                    onMessage={onMessage}
                    onViewProfile={onViewProfile}
                  />
                ))}
              </div>

              {/* Bucket breakdown note */}
              <p className="mt-3 text-[10px] text-[var(--text-muted)] italic">
                Signals combine server-side EWS alerts with local engagement thresholds and
                telemetry bucket data. Dismissing a server alert removes it from this panel.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EarlyWarningPanel;

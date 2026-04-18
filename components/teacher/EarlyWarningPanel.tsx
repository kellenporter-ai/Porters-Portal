import React, { useMemo, useState } from 'react';
import { AlertTriangle, MessageSquare, User as UserIcon, Eye, X, XCircle, Loader2, EyeOff } from 'lucide-react';
import { User, StudentAlert, StudentBucketProfile, TelemetryBucket } from '../../types';
import { BUCKET_META } from '../../lib/telemetry';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';

// ─── Threshold defaults (used when ClassConfig.telemetryThresholds is absent) ───

/** Minimum minutes of total engagement per week to avoid a "low engagement" flag */
const DEFAULT_MIN_ENGAGEMENT_MINUTES = 15;

/** Maximum daily-challenge consecutive misses before flagging */
const DEFAULT_MAX_MISSED_CHALLENGES = 2;

/** Alert age in days after which it is considered stale */
const STALE_DAYS = 7;

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

export type FilterTab = 'all' | 'intervene' | 'watch';

export interface WarningSignal {
  kind: WarningSignalKind;
  label: string;
  severity: WarningSeverity;
  /** For EWS_ALERT signals: the originating alert id (used for dismiss) */
  alertId?: string;
  /** ISO timestamp of the alert's creation (for staleness display) */
  createdAt?: string;
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

/** Returns the number of whole days since a given ISO timestamp, or null if unparseable. */
function alertAgeDays(createdAt: string): number | null {
  const created = Date.parse(createdAt);
  if (isNaN(created)) return null;
  return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
}

/** Short human-readable label for a signal kind (no redundant context). */
function shortSignalLabel(signal: WarningSignal): string {
  switch (signal.kind) {
    case 'LOW_ENGAGEMENT':    return 'Low engagement';
    case 'HIGH_PASTE_COUNT':  return 'High paste rate';
    case 'MISSED_CHALLENGES': return 'Missed challenges';
    case 'AT_RISK_BUCKET':    return signal.label;          // already short (e.g. "Inactive")
    case 'EWS_ALERT':         return signal.label;          // e.g. "Critical"
    default:                  return signal.label;
  }
}

// ─── Sub-components ───

const SeverityPip: React.FC<{ severity: WarningSeverity }> = ({ severity }) =>
  severity === 'intervene' ? (
    <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" aria-label="Intervene" title="Intervene now" />
  ) : (
    <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 shrink-0" aria-label="Watch" title="Monitor" />
  );

const SignalChip: React.FC<{ signal: WarningSignal; compact?: boolean }> = ({ signal, compact }) => {
  const colorClass =
    signal.severity === 'intervene'
      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
      : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';

  const ageDays = signal.createdAt ? alertAgeDays(signal.createdAt) : null;
  const isStale = ageDays !== null && ageDays >= STALE_DAYS;
  const label = compact ? shortSignalLabel(signal) : signal.label;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11.5px] font-semibold border ${colorClass} ${isStale ? 'opacity-60' : ''}`}>
      {label}
      {ageDays !== null && (
        <span className="text-[11.5px] opacity-70">{ageDays}d</span>
      )}
      {isStale && !compact && (
        <span className="ml-0.5 px-1 rounded bg-[var(--surface-glass)] text-[var(--text-muted)] border border-[var(--border)] text-[11.5px]">
          Stale
        </span>
      )}
      {isStale && compact && (
        <span className="text-[11.5px] opacity-60" title="Stale alert">·S</span>
      )}
    </span>
  );
};

interface CompactStudentCardProps {
  flagged: FlaggedStudent;
  onMessage?: (student: User) => void;
  onViewProfile?: (student: User) => void;
  onDismiss: (alertId: string) => void;
  onHide: (studentId: string) => void;
}

const CompactStudentCard: React.FC<CompactStudentCardProps> = ({
  flagged,
  onMessage,
  onViewProfile,
  onDismiss,
  onHide,
}) => {
  const { student, signals, topSeverity } = flagged;
  const cardBorder =
    topSeverity === 'intervene'
      ? 'border-red-500/30 bg-red-500/10'
      : 'border-amber-500/20 bg-amber-500/10';

  const ewsSignal = signals.find((s) => s.kind === 'EWS_ALERT' && s.alertId);
  const visibleSignals = signals.slice(0, 2);
  const extraCount = signals.length - visibleSignals.length;

  return (
    <div
      className={`group flex flex-col gap-1.5 p-2.5 rounded-xl border ${cardBorder} contain-layout`}
      style={{ contain: 'layout style' }}
    >
      {/* Row 1: Avatar + name + severity pip */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="shrink-0">
          {student.avatarUrl ? (
            <img
              src={student.avatarUrl}
              alt={`${student.name} avatar`}
              className="w-8 h-8 rounded-full object-cover border border-[var(--border)]"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-[var(--surface-glass)] border border-[var(--border)] flex items-center justify-center text-[11.5px] font-bold text-[var(--text-secondary)]"
              aria-hidden="true"
            >
              {getInitials(student.name)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <SeverityPip severity={topSeverity} />
          <span className="text-sm font-bold text-[var(--text)] truncate">{student.name}</span>
        </div>
      </div>

      {/* Row 2: Class name */}
      {student.classType && (
        <span className="text-[11.5px] text-[var(--text-muted)] truncate leading-none pl-0.5">
          {student.classType}
        </span>
      )}

      {/* Row 3: Signal chips (first 2 + overflow badge) */}
      <div className="flex flex-wrap gap-1">
        {visibleSignals.map((sig) => (
          <SignalChip key={sig.kind} signal={sig} compact />
        ))}
        {extraCount > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11.5px] font-semibold bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-muted)]">
            +{extraCount}
          </span>
        )}
      </div>

      {/* Row 4: Action buttons — icon-only, shown on hover (always on touch) */}
      <div className="flex items-center gap-1 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onMessage?.(student)}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-600 dark:text-purple-400 transition"
          aria-label={`Message ${student.name}`}
          title="Message"
        >
          <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onViewProfile?.(student)}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition"
          aria-label={`View profile for ${student.name}`}
          title="View Profile"
        >
          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        {ewsSignal?.alertId ? (
          <button
            type="button"
            onClick={() => onDismiss(ewsSignal.alertId!)}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--surface-glass)] hover:bg-red-500/10 border border-[var(--border)] hover:border-red-500/30 text-[var(--text-muted)] hover:text-red-400 transition"
            aria-label={`Dismiss alert for ${student.name}`}
            title="Dismiss server alert"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onHide(student.id)}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition"
            aria-label={`Hide ${student.name} from view`}
            title="Hide from view"
          >
            <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

/** Section header spanning full grid width when in "All" tab */
const SectionHeader: React.FC<{ severity: WarningSeverity; count: number }> = ({ severity, count }) => {
  const isIntervene = severity === 'intervene';
  return (
    <h3
      className={`col-span-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
        isIntervene
          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${isIntervene ? 'bg-red-500' : 'bg-yellow-400'}`} />
      {isIntervene ? 'Intervene' : 'Watch'}
      <span className="ml-auto opacity-60">{count}</span>
    </h3>
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
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [isDismissing, setIsDismissing] = useState(false);
  const [hiddenStudentIds, setHiddenStudentIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const toast = useToast();

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
          alertId: ewsAlert.id,
          createdAt: ewsAlert.createdAt,
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

  // Derive unique class sections for the class filter dropdown
  const classSections = useMemo(() => {
    const sections = new Set<string>();
    for (const { student } of flaggedStudents) {
      if (student.classType) sections.add(student.classType);
    }
    return Array.from(sections).sort();
  }, [flaggedStudents]);

  // Apply tab + class filters + hidden set
  const visibleStudents = useMemo(() => {
    return flaggedStudents.filter((f) => {
      if (activeTab !== 'all' && f.topSeverity !== activeTab) return false;
      if (classFilter !== 'all' && f.student.classType !== classFilter) return false;
      if (!showHidden && hiddenStudentIds.has(f.student.id)) return false;
      return true;
    });
  }, [flaggedStudents, activeTab, classFilter, hiddenStudentIds, showHidden]);

  const interveneStudents = visibleStudents.filter((f) => f.topSeverity === 'intervene');
  const watchStudents = visibleStudents.filter((f) => f.topSeverity === 'watch');

  const interveneCount = flaggedStudents.filter((f) => f.topSeverity === 'intervene').length;
  const watchCount = flaggedStudents.filter((f) => f.topSeverity === 'watch').length;
  const totalCount = flaggedStudents.length;

  // Collect all dismissable EWS alert IDs currently visible
  const allVisibleAlertIds = useMemo(() => {
    const ids: string[] = [];
    for (const { signals } of visibleStudents) {
      for (const sig of signals) {
        if (sig.kind === 'EWS_ALERT' && sig.alertId) ids.push(sig.alertId);
      }
    }
    return ids;
  }, [visibleStudents]);

  // Count of locally-flagged students (no alertId) that are not yet hidden
  const locallyFlaggedVisible = useMemo(() => {
    return visibleStudents.filter(
      (f) => !f.signals.some((s) => s.kind === 'EWS_ALERT' && s.alertId)
    ).length;
  }, [visibleStudents]);

  const hiddenCount = useMemo(() => {
    return flaggedStudents.filter((f) => hiddenStudentIds.has(f.student.id)).length;
  }, [flaggedStudents, hiddenStudentIds]);

  const handleHide = (studentId: string) => {
    setHiddenStudentIds((prev) => new Set(prev).add(studentId));
  };

  const handleDismiss = async (alertId: string) => {
    try {
      await dataService.dismissAlert(alertId);
    } catch {
      toast.error('Failed to dismiss alert');
    }
  };

  const handleDismissAll = async () => {
    if (allVisibleAlertIds.length === 0) return;
    setIsDismissing(true);
    try {
      await dataService.dismissAlertsBatch(allVisibleAlertIds);
    } catch {
      toast.error('Failed to dismiss alerts');
    } finally {
      setIsDismissing(false);
    }
  };

  // Panel is always rendered (even at 0 flags) so teachers know the system is active
  const panelBorderClass =
    interveneCount > 0
      ? 'border-red-500/30 bg-red-900/10'
      : totalCount > 0
      ? 'border-amber-500/30 bg-amber-900/10'
      : 'border-[var(--border)] bg-[var(--surface-glass)]';

  const headerTextClass =
    interveneCount > 0
      ? 'text-red-600 dark:text-red-400'
      : totalCount > 0
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-[var(--text-tertiary)]';

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'intervene', label: 'Intervene', count: interveneCount },
    { id: 'watch', label: 'Watch', count: watchCount },
  ];

  // Total dismissable = EWS alerts + locally-flagged visible (can be hidden)
  const totalDismissableCount = allVisibleAlertIds.length + locallyFlaggedVisible;

  return (
    <div className={`rounded-3xl border backdrop-blur-md transition-colors ${panelBorderClass}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between p-6 pb-3">
        <div className="flex items-center gap-3">
          <AlertTriangle
            className={`w-5 h-5 ${interveneCount > 0 ? 'text-red-600 dark:text-red-400' : totalCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-muted)]'}`}
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
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-600 dark:text-green-400">
              All clear
            </span>
          )}
        </div>

        {/* Header actions: Show Hidden toggle + Dismiss All */}
        <div className="flex items-center gap-2">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] rounded-lg text-[11px] font-bold transition"
              aria-pressed={showHidden}
              aria-label={showHidden ? 'Hide hidden students' : `Show ${hiddenCount} hidden students`}
            >
              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              {showHidden ? 'Hide hidden' : `Show Hidden (${hiddenCount})`}
            </button>
          )}
          {totalDismissableCount > 0 && (
            <button
              type="button"
              onClick={handleDismissAll}
              disabled={isDismissing || allVisibleAlertIds.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-glass)] hover:bg-red-500/10 border border-[var(--border)] hover:border-red-500/30 text-[var(--text-muted)] hover:text-red-400 rounded-lg text-[11px] font-bold transition disabled:opacity-50 disabled:pointer-events-none"
              aria-label={`Dismiss all ${allVisibleAlertIds.length} server alerts`}
              title={allVisibleAlertIds.length === 0 ? 'No server-side alerts to dismiss (use Hide on local signals)' : undefined}
            >
              {isDismissing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {allVisibleAlertIds.length > 0
                ? `Dismiss All (${allVisibleAlertIds.length})`
                : 'Dismiss All'}
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Tabs + Class Dropdown ── */}
      <div className="flex items-center gap-3 px-6 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                activeTab === tab.id
                  ? tab.id === 'intervene'
                    ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/40'
                    : tab.id === 'watch'
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40'
                    : 'bg-[var(--surface-glass-heavy)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
              }`}
              aria-pressed={activeTab === tab.id}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 opacity-70">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {classSections.length > 1 && (
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="ml-auto text-xs bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-secondary)] rounded-lg px-2 py-1 focus:outline-none focus:border-[var(--border)]"
            aria-label="Filter by class section"
          >
            <option value="all">All classes</option>
            {classSections.map((section) => (
              <option key={section} value={section}>{section}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Body ── */}
      <div id="early-warning-body" className="px-6 pb-6 pt-4">
        {totalCount === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)] italic">
            <UserIcon className="w-10 h-10 mx-auto mb-2 opacity-20" aria-hidden="true" />
            No students flagged. Engagement looks healthy.
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="text-center py-6 text-[var(--text-muted)] italic text-sm">
            No students match the current filter.
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

            {/* Compact responsive grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar pr-1">
              {activeTab === 'all' ? (
                <>
                  {interveneStudents.length > 0 && (
                    <>
                      <SectionHeader severity="intervene" count={interveneStudents.length} />
                      {interveneStudents.map((flagged) => (
                        <CompactStudentCard
                          key={flagged.student.id}
                          flagged={flagged}
                          onMessage={onMessage}
                          onViewProfile={onViewProfile}
                          onDismiss={handleDismiss}
                          onHide={handleHide}
                        />
                      ))}
                    </>
                  )}
                  {watchStudents.length > 0 && (
                    <>
                      <SectionHeader severity="watch" count={watchStudents.length} />
                      {watchStudents.map((flagged) => (
                        <CompactStudentCard
                          key={flagged.student.id}
                          flagged={flagged}
                          onMessage={onMessage}
                          onViewProfile={onViewProfile}
                          onDismiss={handleDismiss}
                          onHide={handleHide}
                        />
                      ))}
                    </>
                  )}
                </>
              ) : (
                visibleStudents.map((flagged) => (
                  <CompactStudentCard
                    key={flagged.student.id}
                    flagged={flagged}
                    onMessage={onMessage}
                    onViewProfile={onViewProfile}
                    onDismiss={handleDismiss}
                    onHide={handleHide}
                  />
                ))
              )}
            </div>

            {/* Bucket breakdown note */}
            <p className="mt-3 text-[11.5px] text-[var(--text-muted)] italic">
              Signals combine server-side EWS alerts with local engagement thresholds and
              telemetry bucket data. Dismiss removes a server alert; Hide clears a local signal from view.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default EarlyWarningPanel;

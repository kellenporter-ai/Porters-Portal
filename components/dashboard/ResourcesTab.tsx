import React, { useState, useMemo, useCallback } from 'react';
import { Assignment, ClassConfig, Submission, migrateResourceCategory } from '../../types';
import {
  ChevronRight,
  Play,
  FlaskConical,
  Target,
  Layers,
  CheckCircle2,
  Clock,
  GraduationCap,
  Search,
  X,
  ArrowUpDown,
  MessageSquare,
  AlertTriangle,
  Circle,
} from 'lucide-react';
import { sortUnitKeys } from '../../lib/sortUnitKeys';

/*
 * ResourcesTab — Variation D ("Anchored") rebuild.
 * Matches the Claude Design prototype at
 *   /home/kp/.cache/ea-agent/design-resources/porter-s-portal/project/Resources Redesign.html
 * Shipped ONLY Variation D — no tweak panel, no A/B/C markup.
 *
 * Design system (shared with HomeTab Anchored rebuild):
 *   - Unit "zones" — tinted surfaces with a giant anchor numeral top-right
 *   - Size hierarchy: active unit largest, next unit medium, past/future smallest
 *   - Opacity scaling on past/complete units (0.85 → 0.70 → 0.65)
 *   - Quiet assessment indicator (▲ ASSESSMENT + score pill + retake affordance)
 *   - Accent bar on the first in-progress item of the active unit
 *   - All colors via CSS custom properties in style.css (no hex literals, no
 *     bare `text-*-400`, no dynamic Tailwind class fragments)
 *
 * Public API (ResourcesTabProps) and the controlled `expandedUnits` +
 * `onToggleUnit` contract are preserved unchanged — the parent
 * (`components/StudentDashboard.tsx`) owns expand state.
 */

// ─── Helpers ─────────────────────────────────

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Simple fuzzy match: checks if all query tokens appear somewhere in the text (in any order). */
function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every(token => lower.includes(token));
}

/** Urgency tone for due-date badges — matches HomeTab `badgeClassFor` palette. */
type Tone = 'danger' | 'warn' | 'info' | 'muted' | 'success';

function dueBadgeClass(tone: Tone): string {
  switch (tone) {
    case 'danger':
      return 'text-red-700 dark:text-red-300 bg-red-500/15 dark:bg-red-500/20';
    case 'warn':
      return 'text-amber-800 dark:text-amber-100 bg-amber-500/20 dark:bg-amber-500/30';
    case 'success':
      return 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 dark:bg-emerald-500/20';
    case 'info':
      return 'text-[var(--accent-text)] bg-[var(--accent-muted)]';
    default:
      return 'text-[var(--text-tertiary)] bg-[var(--surface-glass-heavy)]';
  }
}

function dueTone(daysUntilDue: number): Tone {
  if (daysUntilDue <= 0) return 'danger';
  if (daysUntilDue <= 2) return 'warn';
  if (daysUntilDue <= 7) return 'info';
  return 'muted';
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Lesson': <GraduationCap className="w-5 h-5" />,
  'Lab': <FlaskConical className="w-5 h-5" />,
  'Simulation': <Play className="w-5 h-5 fill-current" />,
  'Practice': <Target className="w-5 h-5" />,
  'Supplemental': <Layers className="w-5 h-5" />,
};

type EnrichedAssignment = Assignment & { lastEngagement: string | null; engagementTime: number };
type UnitStatus = 'active' | 'next' | 'past' | 'future';

interface ResourcesTabProps {
  unitGroups: Record<string, EnrichedAssignment[]>;
  expandedUnits: Set<string>;
  onToggleUnit: (unit: string) => void;
  practiceCompletion: Record<string, { completed: boolean; totalCompletions: number; bestScore: number | null; completedAt: string | null }>;
  onStartAssignment?: (id: string) => void;
  classConfigs?: ClassConfig[];
  activeClass: string;
  submissions?: Submission[];
}

// ─── Main component ──────────────────────────

const ResourcesTab: React.FC<ResourcesTabProps> = ({
  unitGroups,
  expandedUnits,
  onToggleUnit,
  practiceCompletion,
  onStartAssignment,
  classConfigs,
  activeClass,
  submissions = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'newest' | 'oldest' | 'alpha' | 'type'>('default');

  const getResourceOrder = useCallback((unit: string): string[] | undefined => {
    if (!activeClass) return undefined;
    return classConfigs?.find(c => c.className === activeClass)?.resourceOrder?.[unit];
  }, [activeClass, classConfigs]);

  const sortItems = useCallback((items: EnrichedAssignment[], unit: string): EnrichedAssignment[] => {
    const sorted = [...items];
    if (sortBy === 'default') {
      const order = getResourceOrder(unit);
      if (order && order.length > 0) {
        return sorted.sort((a, b) => {
          const ai = order.indexOf(a.id);
          const bi = order.indexOf(b.id);
          if (ai === -1 && bi === -1) return a.title.localeCompare(b.title);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      }
      return sorted.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    }
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
      case 'oldest':
        return sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
          return dateA - dateB;
        });
      case 'alpha':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'type':
        return sorted.sort((a, b) =>
          (migrateResourceCategory(a.category) || '').localeCompare(migrateResourceCategory(b.category) || '') ||
          a.title.localeCompare(b.title));
      default:
        return sorted;
    }
  }, [sortBy, getResourceOrder]);

  const filteredUnitGroups = useMemo(() => {
    if (!searchQuery.trim()) return unitGroups;
    const q = searchQuery.trim();
    const filtered: Record<string, EnrichedAssignment[]> = {};
    for (const [unit, items] of Object.entries(unitGroups)) {
      if (fuzzyMatch(unit, q)) {
        filtered[unit] = items;
        continue;
      }
      const matches = items.filter(r => {
        const searchable = [r.title, r.description || '', r.category || '', unit].join(' ');
        return fuzzyMatch(searchable, q);
      });
      if (matches.length > 0) filtered[unit] = matches;
    }
    return filtered;
  }, [unitGroups, searchQuery]);

  // Sorted unit keys using class unitOrder config (same contract as before)
  const sortedUnitKeys = useMemo(() => {
    const unitOrder = classConfigs?.find(c => c.className === activeClass)?.unitOrder;
    return sortUnitKeys(Object.keys(filteredUnitGroups), unitOrder);
  }, [filteredUnitGroups, classConfigs, activeClass]);

  // All unit keys (unfiltered) — used for stable active-unit detection so the
  // "active" zone doesn't jump when the student narrows via search.
  const allSortedUnitKeys = useMemo(() => {
    const unitOrder = classConfigs?.find(c => c.className === activeClass)?.unitOrder;
    return sortUnitKeys(Object.keys(unitGroups), unitOrder);
  }, [unitGroups, classConfigs, activeClass]);

  /** Determine the "active" unit: first unit (in sort order) with at least one
   *  not-completed item. A resource counts as complete if it has a practice
   *  completion OR (for assessments) a submitted assessment submission. */
  const activeUnitKey = useMemo(() => {
    const isItemComplete = (r: EnrichedAssignment): boolean => {
      if (practiceCompletion[r.id]?.completed) return true;
      if (r.isAssessment) {
        const sub = submissions.find(s => s.assignmentId === r.id && s.isAssessment);
        if (sub && sub.status !== 'STARTED') return true;
      }
      return false;
    };
    for (const key of allSortedUnitKeys) {
      const items = unitGroups[key] || [];
      if (items.length === 0) continue;
      const anyIncomplete = items.some(r => !isItemComplete(r));
      if (anyIncomplete) return key;
    }
    return allSortedUnitKeys[allSortedUnitKeys.length - 1] ?? null;
  }, [allSortedUnitKeys, unitGroups, practiceCompletion, submissions]);

  /** Compute unit status relative to the active unit.
   *  Sort order is DESCENDING (newest unit first), so indices ABOVE the
   *  active unit are higher-numbered (not yet reached = 'future' / UPCOMING)
   *  and indices BELOW the active unit are earlier-in-time ('past'). */
  const unitStatus = useCallback((unitKey: string): UnitStatus => {
    if (!activeUnitKey) return 'past';
    const activeIdx = allSortedUnitKeys.indexOf(activeUnitKey);
    const thisIdx = allSortedUnitKeys.indexOf(unitKey);
    if (thisIdx === activeIdx) return 'active';
    if (thisIdx < activeIdx) return 'future';
    return 'past';
  }, [activeUnitKey, allSortedUnitKeys]);

  /** Compute unit progress: {completed, total, pct}. */
  const unitProgress = useCallback((items: EnrichedAssignment[]) => {
    let completed = 0;
    for (const r of items) {
      if (practiceCompletion[r.id]?.completed) { completed += 1; continue; }
      if (r.isAssessment) {
        const sub = submissions.find(s => s.assignmentId === r.id && s.isAssessment);
        if (sub && sub.status !== 'STARTED') { completed += 1; continue; }
      }
    }
    const total = items.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, pct };
  }, [practiceCompletion, submissions]);

  // Summary meta for page header
  const summary = useMemo(() => {
    const totalResources = Object.values(unitGroups).reduce((a, b) => a + b.length, 0);
    const totalUnits = Object.keys(unitGroups).length;
    // "Unread" = assessments with unread teacher feedback
    let unread = 0;
    for (const items of Object.values(unitGroups)) {
      for (const r of items) {
        if (!r.isAssessment) continue;
        const latest = submissions
          .filter(s => s.assignmentId === r.id && s.isAssessment)
          .sort((a, b) => (b.attemptNumber || 0) - (a.attemptNumber || 0))[0];
        if (latest?.rubricGrade?.teacherFeedback && !latest.feedbackReadAt) unread += 1;
      }
    }
    return { totalResources, totalUnits, unread };
  }, [unitGroups, submissions]);

  // ─── Resource row renderer ───────────────────

  /** Renders a single resource row inside a unit zone. `emphasis` scales the
   *  type and accent bar for the active unit's first in-progress item. */
  const renderResourceRow = (
    resource: EnrichedAssignment,
    opts: { emphasis: 'primary' | 'standard' | 'muted'; showAccentBar: boolean },
  ) => {
    const { emphasis, showAccentBar } = opts;
    const hasDue = !!resource.dueDate;
    const dueDate = resource.dueDate ? new Date(resource.dueDate) : null;
    const now = new Date();
    const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000) : Infinity;
    const engMin = Math.floor(resource.engagementTime / 60);
    const isSubstantial = engMin >= 5;
    const completion = practiceCompletion[resource.id];
    const isModuleCompleted = !!completion?.completed;
    const hasLessonBlocks = !!resource.lessonBlocks && resource.lessonBlocks.length > 0;
    const isLessonOnly = hasLessonBlocks && !resource.contentUrl;

    // Assessment submission lookup — preserved from previous implementation
    const assessmentSubs = resource.isAssessment
      ? submissions
          .filter(s => s.assignmentId === resource.id && s.isAssessment)
          .sort((a, b) => (b.attemptNumber || 0) - (a.attemptNumber || 0))
      : [];
    const latestSub = assessmentSubs[0] || null;
    const hasUnreadFeedback = !!latestSub?.rubricGrade?.teacherFeedback && !latestSub?.feedbackReadAt;
    const assessmentConfig = resource.assessmentConfig || {};
    const maxAttempts = typeof assessmentConfig.maxAttempts === 'number' ? assessmentConfig.maxAttempts : (parseInt(String(assessmentConfig.maxAttempts), 10) || 0);
    const isUnlimitedAttempts = maxAttempts === 0;
    const canStillRetake = !!(latestSub && assessmentConfig.allowResubmission !== false &&
      (isUnlimitedAttempts || (latestSub.attemptNumber || 1) < maxAttempts));

    // Derived "status" for the row — drives icon tile color + label
    const inProgress = !isModuleCompleted && (!!resource.lastEngagement || isSubstantial);
    const notStarted = !isModuleCompleted && !resource.lastEngagement && !isSubstantial;

    // Icon tile palette — neutral / accent / green / red depending on state
    let tileClass =
      'bg-[var(--surface-sunken)] text-[var(--text-tertiary)]';
    if (isModuleCompleted) {
      tileClass = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    } else if (resource.isAssessment && notStarted) {
      tileClass = 'bg-red-500/15 text-red-700 dark:text-red-300';
    } else if (inProgress) {
      tileClass = 'bg-[var(--accent-muted)] text-[var(--accent-text)]';
    } else if (isLessonOnly) {
      tileClass = 'bg-[var(--surface-glass-heavy)] text-[var(--text-tertiary)]';
    }

    // Effective score for assessment pill
    const effectiveScore = latestSub
      ? (latestSub.rubricGrade?.overallPercentage ?? latestSub.assessmentScore?.percentage ?? latestSub.score ?? 0)
      : 0;
    const hasScore = !!latestSub && !!(latestSub.rubricGrade || latestSub.assessmentScore);

    const scorePillClass =
      effectiveScore >= 80
        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15'
        : effectiveScore >= 60
          ? 'text-amber-800 dark:text-amber-100 bg-amber-500/20'
          : 'text-red-700 dark:text-red-300 bg-red-500/15';

    // Size tokens per emphasis
    const titleSize = emphasis === 'primary' ? 'text-[17px]' : emphasis === 'standard' ? 'text-[14px]' : 'text-[14px]';
    const titleWeight = emphasis === 'primary' ? 'font-bold' : 'font-semibold';
    const rowPadding = emphasis === 'primary' ? 'py-3.5 px-3' : 'py-3 px-3';
    const iconSize = emphasis === 'primary' ? 'w-11 h-11' : 'w-10 h-10';
    const mutedTitleTone = emphasis === 'muted' ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]';

    const badgeLabel = isLessonOnly ? 'Lesson' : (migrateResourceCategory(resource.category) ?? 'Supplemental');

    // Accent bar for the primary in-progress row of the active unit — inline
    // style so we can use the CSS custom property without a hex literal.
    const accentBarStyle = showAccentBar
      ? { boxShadow: 'inset 3px 0 0 var(--accent)' }
      : undefined;

    return (
      <button
        key={resource.id}
        type="button"
        onClick={() => onStartAssignment?.(resource.id)}
        className={`group w-full flex items-center gap-4 rounded-xl text-left transition cursor-pointer hover:bg-[var(--surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${rowPadding}`}
        style={accentBarStyle}
      >
        <div className={`${iconSize} rounded-xl shrink-0 flex items-center justify-center ${tileClass}`}>
          {isModuleCompleted ? (
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          ) : resource.isAssessment && notStarted ? (
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          ) : isLessonOnly ? (
            <GraduationCap className="w-5 h-5" aria-hidden="true" />
          ) : (
            CATEGORY_ICONS[badgeLabel] ?? <Circle className="w-5 h-5" aria-hidden="true" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Metadata line: type badge + assessment label + completed pill */}
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded whitespace-nowrap bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
              {badgeLabel}
            </span>
            {resource.isAssessment && (
              <span className="font-black text-[10px] uppercase tracking-[0.2em] text-red-700 dark:text-red-300">
                ▲ Assessment
              </span>
            )}
            {inProgress && !resource.isAssessment && (
              <span className="font-black text-[10px] uppercase tracking-[0.2em] text-[var(--accent-text)]">
                ● In progress
              </span>
            )}
            {isModuleCompleted && (completion?.totalCompletions || 0) > 1 && (
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {completion?.totalCompletions}x
              </span>
            )}
            {hasLessonBlocks && emphasis !== 'primary' && !isModuleCompleted && (
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {resource.lessonBlocks!.length} blocks
              </span>
            )}
          </div>

          {/* Title */}
          <div className={`${titleSize} ${titleWeight} leading-tight truncate ${mutedTitleTone}`}>
            {resource.title}
          </div>

          {/* Description / secondary line */}
          {resource.description && (
            <div className="text-xs mt-1 text-[var(--text-tertiary)] truncate">
              {resource.description}
            </div>
          )}

          {/* Assessment submission detail row */}
          {resource.isAssessment && latestSub && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {hasScore && assessmentConfig.showScoreOnSubmit !== false && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${scorePillClass}`}>
                  {effectiveScore}% best score
                </span>
              )}
              <span className="text-[11px] text-[var(--text-muted)] font-mono">
                {isUnlimitedAttempts
                  ? `Attempt ${latestSub.attemptNumber || 1}`
                  : `Attempt ${latestSub.attemptNumber || 1} of ${maxAttempts}`}
              </span>
              {canStillRetake && (
                <span className="text-[11px] text-[var(--accent-text)] font-mono flex items-center gap-0.5">
                  <Play className="w-2.5 h-2.5 fill-current" aria-hidden="true" /> Retake available
                </span>
              )}
              {!canStillRetake && (
                <span className="text-[11px] text-[var(--text-muted)] font-mono">
                  {assessmentConfig.allowResubmission === false ? 'No retakes allowed' : 'No retakes left'}
                </span>
              )}
              {latestSub.flaggedAsAI && (
                <span className="text-[11px] text-[var(--text-tertiary)] font-mono">Flagged</span>
              )}
            </div>
          )}

          {/* Metadata tail: posted date / engagement / blocks / best score */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {resource.createdAt && (
              <span
                className="text-[11px] text-[var(--text-muted)] font-mono"
                title={`Posted ${new Date(resource.createdAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
              >
                Posted {formatRelativeDate(resource.createdAt)}
              </span>
            )}
            {resource.lastEngagement && engMin > 0 && (
              <span className="text-[11px] text-[var(--text-tertiary)] font-mono">{engMin}m engaged</span>
            )}
            {isModuleCompleted && completion?.bestScore != null && completion.bestScore > 0 && !resource.isAssessment && (
              <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
                Best: {completion.bestScore}%
              </span>
            )}
            {emphasis === 'primary' && hasLessonBlocks && (
              <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
                {resource.lessonBlocks!.length} blocks
              </span>
            )}
          </div>
        </div>

        {/* Trailing column: due-date badge / completion score / feedback dot */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {hasUnreadFeedback && (
            <span
              title="New teacher feedback"
              role="status"
              aria-label="New teacher feedback available"
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-muted)] border border-[var(--border)]"
            >
              <MessageSquare className="w-3 h-3 text-[var(--accent-text)]" aria-hidden="true" />
            </span>
          )}
          {hasDue && !isModuleCompleted && (
            <span
              className={`text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${dueBadgeClass(dueTone(daysUntilDue))}`}
              title={dueDate!.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            >
              {daysUntilDue <= 0
                ? `OVERDUE`
                : daysUntilDue === 1
                  ? 'DUE TOMORROW'
                  : daysUntilDue <= 7
                    ? `Due ${dueDate!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : `Due ${dueDate!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </span>
          )}
          {resource.isAssessment && !latestSub && !hasDue && (
            <span className="text-[11px] font-bold text-red-700 dark:text-red-300 flex items-center gap-0.5">
              <Target className="w-2.5 h-2.5" aria-hidden="true" /> Not yet submitted
            </span>
          )}
          {isModuleCompleted && !resource.isAssessment && completion?.bestScore != null && completion.bestScore > 0 ? (
            <span className="text-sm font-black font-mono text-emerald-700 dark:text-emerald-300">
              {completion.bestScore}%
            </span>
          ) : isModuleCompleted ? (
            <span className="text-[11px] font-mono text-[var(--text-tertiary)]">Completed</span>
          ) : hasDue ? null : (
            <span className="text-[11px] font-bold whitespace-nowrap text-[var(--text-tertiary)]">
              {resource.isAssessment ? 'Not submitted' : notStarted ? 'Not started' : 'In progress'}
            </span>
          )}
          {hasDue && isModuleCompleted && (
            <Clock className="w-3 h-3 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          )}
        </div>
      </button>
    );
  };

  // ─── Zone renderer ───────────────────────────

  const renderZone = (unitKey: string, items: EnrichedAssignment[], _sortedIndex: number) => {
    const status = unitStatus(unitKey);
    const progress = unitProgress(items);
    // Teacher-controlled display label. null/empty/missing = no watermark + no "Unit X · " prefix.
    const meta = classConfigs?.find(c => c.className === activeClass)?.unitMeta?.[unitKey];
    const rawDisplayNumber = meta?.displayNumber;
    const displayNumber =
      typeof rawDisplayNumber === 'string' && rawDisplayNumber.trim().length > 0
        ? rawDisplayNumber.trim()
        : null;
    const isOpen = expandedUnits.has(unitKey);

    // Size + opacity per status
    const zoneOpacity =
      status === 'active' ? 'opacity-100'
      : status === 'past' ? 'opacity-[0.85]'
      : 'opacity-[0.100]';
    const zonePadding = status === 'active' ? 'px-6 sm:px-9 py-7' : status === 'past' ? 'px-6 sm:px-9 py-6' : 'px-6 sm:px-9 py-7';
    const numeralSize = status === 'active' ? 'text-[72px]' : status === 'past' ? 'text-[64px]' : 'text-[68px]';
    const numeralOpacity =
      status === 'active' ? 'opacity-[0.07]'
      : status === 'past' ? 'opacity-[0.05]'
      : 'opacity-[0.06]';
    const numeralColor = status === 'active' ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]';
    const titleSize = status === 'active' ? 'text-[22px]' : status === 'past' ? 'text-[18px]' : 'text-[20px]';
    const titleTone = status === 'active' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]';
    const eyebrowTone = status === 'active' ? 'text-[var(--accent-text)]' : status === 'past' ? 'text-[var(--text-muted)]' : 'text-[var(--text-tertiary)]';
    const chevTone = status === 'active' ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]';

    const statusLabel =
      status === 'active' ? 'Current'
      : status === 'past' ? (progress.pct === 100 ? 'Complete' : 'Past')
      : 'Upcoming';

    const sortedItems = sortItems(items, unitKey);

    // For the active unit, find the first in-progress item for the accent bar
    const firstInProgressIdx = status === 'active'
      ? sortedItems.findIndex(r => {
          if (practiceCompletion[r.id]?.completed) return false;
          if (r.isAssessment) {
            const sub = submissions.find(s => s.assignmentId === r.id && s.isAssessment);
            if (sub && sub.status !== 'STARTED') return false;
          }
          return !!r.lastEngagement || r.engagementTime > 0 || r.isAssessment;
        })
      : -1;

    // By-type subheader rendering
    const renderItems = (): React.ReactNode[] => {
      if (sortBy !== 'type') {
        return sortedItems.map((r, idx) => {
          const isPrimary = status === 'active' && idx === 0;
          const isMuted = status === 'past' || status === 'future';
          const emphasis: 'primary' | 'standard' | 'muted' = isPrimary ? 'primary' : isMuted ? 'muted' : 'standard';
          const showAccentBar = status === 'active' && idx === firstInProgressIdx;
          return renderResourceRow(r, { emphasis, showAccentBar });
        });
      }
      const out: React.ReactNode[] = [];
      let lastCategory: string | null = null;
      sortedItems.forEach((r, idx) => {
        const isLessonOnly = !!(r.lessonBlocks && r.lessonBlocks.length > 0 && !r.contentUrl);
        const category = isLessonOnly ? 'Lesson' : (migrateResourceCategory(r.category) || 'Supplemental');
        if (category !== lastCategory) {
          out.push(
            <div key={`subheader-${unitKey}-${category}`} className="flex items-center gap-2 py-1.5 px-2">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">{category}</span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>,
          );
          lastCategory = category;
        }
        const isPrimary = status === 'active' && idx === 0;
        const isMuted = status === 'past' || status === 'future';
        const emphasis: 'primary' | 'standard' | 'muted' = isPrimary ? 'primary' : isMuted ? 'muted' : 'standard';
        const showAccentBar = status === 'active' && idx === firstInProgressIdx;
        out.push(renderResourceRow(r, { emphasis, showAccentBar }));
      });
      return out;
    };

    return (
      <section
        key={unitKey}
        className={`relative rounded-[28px] mb-5 overflow-hidden border border-[var(--border)] bg-[var(--surface-glass)] ${zonePadding} ${zoneOpacity}`}
        aria-labelledby={`unit-zone-${unitKey}`}
      >
        {/* Anchor numeral — absolute top-right, behind content.
            Only rendered when the teacher has set a display label for this unit. */}
        {displayNumber !== null && (
          <div
            className={`absolute right-4 top-0 font-black leading-none select-none pointer-events-none tracking-tighter z-0 ${numeralSize} ${numeralOpacity} ${numeralColor}`}
            style={{ transform: 'translateY(-14%)' }}
            aria-hidden="true"
          >
            {displayNumber}
          </div>
        )}

        {/* Header row — click toggles expand, delegates to parent controlled state */}
        <button
          type="button"
          onClick={() => onToggleUnit(unitKey)}
          aria-expanded={isOpen}
          className="relative z-10 w-full flex items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-xl"
        >
          <ChevronRight
            className={`w-4 h-4 shrink-0 transition-transform ${chevTone} ${isOpen ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div
              id={`unit-zone-${unitKey}`}
              className={`text-[10px] font-black tracking-[0.3em] uppercase whitespace-nowrap ${eyebrowTone}`}
            >
              {displayNumber !== null ? `Unit ${displayNumber} · ${statusLabel}` : statusLabel}
            </div>
            <div className={`font-black tracking-tight leading-tight mt-0.5 ${titleSize} ${titleTone}`}>
              {unitKey}
            </div>
          </div>
          <div className="flex-1" />
          <div className="text-right shrink-0">
            <div className="text-[11px] font-mono text-[var(--text-tertiary)]">
              {progress.completed} of {progress.total} done
              {progress.total > 0 && <span className="ml-1">· {progress.pct}%</span>}
            </div>
            {(status === 'active' || (status === 'past' && progress.pct === 100)) && progress.total > 0 && (
              <div
                className="w-24 h-1 rounded-full overflow-hidden mt-1 ml-auto bg-[var(--surface-sunken)]"
                role="progressbar"
                aria-valuenow={progress.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${unitKey} progress: ${progress.pct}%`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress.pct}%`,
                    background: progress.pct === 100 ? 'var(--accent)' : 'var(--accent)',
                  }}
                />
              </div>
            )}
          </div>
        </button>

        {/* Zone body — only when expanded */}
        {isOpen && items.length > 0 && (
          <div className="relative z-10 mt-5 -mx-3 space-y-0.5">
            {renderItems()}
          </div>
        )}
      </section>
    );
  };

  // ─── Render ──────────────────────────────────

  return (
    <div
      key="resources"
      className="max-w-5xl mx-auto"
      style={{ animation: 'tabEnter 0.3s ease-out both' }}
    >
      {/* Page header */}
      <header className="mb-8">
        <div className="text-[10px] font-black tracking-[0.32em] uppercase text-[var(--accent-text)] mb-2">
          {activeClass || 'Class'}
        </div>
        <h2 className="text-[32px] sm:text-[40px] font-black leading-[1.05] tracking-tight text-[var(--text-primary)]">
          Resources
        </h2>
        <div className="mt-2 text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
          {summary.totalResources} resource{summary.totalResources === 1 ? '' : 's'}
          {' · '}
          {summary.totalUnits} unit{summary.totalUnits === 1 ? '' : 's'}
          {summary.unread > 0 && (
            <span className="text-[var(--accent-text)]">
              {' · '}
              {summary.unread} unread
            </span>
          )}
        </div>
      </header>

      {/* Search + sort row — bare canvas, no card */}
      <div className="mb-8 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search resources by title, description, or unit..."
            aria-label="Search resources"
            className="w-full rounded-xl pl-10 pr-20 py-3 text-sm font-medium text-[var(--text-primary)] placeholder-[var(--text-muted)] bg-[var(--surface-glass)] border border-transparent focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-muted)] transition"
          />
          {searchQuery && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)] font-mono">
                {Object.values(filteredUnitGroups).reduce((a, b) => a + b.length, 0)} results
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <ArrowUpDown size={12} className="text-[var(--text-muted)] mr-1" aria-hidden="true" />
          <span className="sr-only">Sort by</span>
          {(['default', 'newest', 'oldest', 'alpha', 'type'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setSortBy(option)}
              aria-pressed={sortBy === option}
              className={`px-3 py-1.5 rounded-full font-bold text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                sortBy === option
                  ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-glass)]'
              }`}
            >
              {option === 'default'
                ? 'Default'
                : option === 'newest'
                  ? 'Newest'
                  : option === 'oldest'
                    ? 'Oldest'
                    : option === 'alpha'
                      ? 'A–Z'
                      : 'By type'}
            </button>
          ))}
        </div>
      </div>

      {/* Unit zones */}
      {sortedUnitKeys.length === 0 ? (
        <div className="text-center py-20 text-[var(--text-muted)] italic">
          {searchQuery ? `No resources matching "${searchQuery}".` : 'No resources have been posted yet. Check back soon!'}
        </div>
      ) : (
        <div>
          {sortedUnitKeys.map((unit, idx) => renderZone(unit, filteredUnitGroups[unit], idx))}
        </div>
      )}
    </div>
  );
};

export default ResourcesTab;

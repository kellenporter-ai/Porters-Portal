import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Assignment, Submission, XPEvent } from '../../types';
import {
  ArrowRight,
  Check,
  ChevronRight,
  MessageSquare,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import AnimatedIcon from '../AnimatedIcon';
import CortisolCheckIn from './CortisolCheckIn';
import { dataService } from '../../services/dataService';

/*
 * HomeTab — Variation D ("Anchored") rebuild.
 * Matches the Claude Design prototype at
 *   /home/kp/.cache/ea-agent/design-bundle/porter-s-portal/project/Home Redesign.html
 * Shipped ONLY Variation D — no tweak panel, no A/B/C markup.
 *
 * Four zones:
 *   01  Hero        — "Now" — current-unit up-next + progress + primary CTA
 *   02  Metric Trio — "This week" (upcoming list) + "This unit" (hero metric + supporting)
 *   03  Go to       — asymmetric quick-nav grid
 *   04  Preservation — recent activity + teacher feedback banner + active XP event
 *
 * All colors go through the Portal CSS custom properties defined in style.css
 * (same tokens as the prototype: --accent, --accent-muted, --surface-*,
 *  --text-*, --border, --panel-bg, --glass-glow). No hardcoded hex values.
 */

// ─── Onboarding banner constants ─────────────
const ONBOARDING_BANNER_DISMISS_KEY = 'onboarding-anim-banner-dismissed-v1';

function readBannerDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(ONBOARDING_BANNER_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

interface HomeTabProps {
  assignments: Assignment[];
  submissions: Submission[];
  activeClass: string;
  practiceCompletion: Record<string, { completed: boolean; totalCompletions: number; bestScore: number | null; completedAt: string | null }>;
  activeEvent: XPEvent | null;
  onNavigate: (tab: string) => void;
  onStartAssignment?: (id: string) => void;
  userSection?: string;
  userClassSections?: Record<string, string>;
  performanceMode?: boolean;
  onTogglePerformanceMode?: (enabled: boolean) => void | Promise<void>;
  teacherName?: string;
  userName?: string;
  userCodename?: string | null;
  userLevel?: number | null;
  loginStreak?: number;
  userId?: string;
}

// ─── Helpers ─────────────────────────────────

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function shortRelative(iso: string): string {
  const diffDays = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function urgencyLabel(iso: string): { text: string; tone: 'danger' | 'warn' | 'info' | 'muted' } {
  const diffDays = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: 'OVERDUE', tone: 'danger' };
  if (diffDays === 0) return { text: 'TODAY', tone: 'warn' };
  if (diffDays === 1) return { text: 'TOMORROW', tone: 'warn' };
  if (diffDays <= 3) return { text: `${diffDays}d`, tone: 'info' };
  return { text: `${diffDays}d`, tone: 'muted' };
}

function badgeClassFor(tone: 'danger' | 'warn' | 'info' | 'muted'): string {
  // All badges use solid-low-saturation light + translucent dark to stay
  // WCAG-legible in both themes. No bare `text-*-400`.
  switch (tone) {
    case 'danger':
      return 'text-red-700 dark:text-red-300 bg-red-500/15 dark:bg-red-500/20';
    case 'warn':
      return 'text-amber-800 dark:text-amber-100 bg-amber-500/20 dark:bg-amber-500/30';
    case 'info':
      return 'text-[var(--accent-text)] bg-[var(--accent-muted)]';
    default:
      return 'text-[var(--text-tertiary)] bg-[var(--surface-glass-heavy)]';
  }
}

// ─── Main component ──────────────────────────

const HomeTab: React.FC<HomeTabProps> = ({
  assignments,
  submissions,
  activeClass,
  practiceCompletion,
  activeEvent,
  onNavigate,
  onStartAssignment,
  userSection,
  userClassSections,
  performanceMode = false,
  onTogglePerformanceMode,
  teacherName,
  userName,
  userCodename,
  userLevel,
  loginStreak = 0,
  userId,
}) => {
  const navigate = useNavigate();

  // ── Onboarding "Reduce animations" banner ──
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(readBannerDismissed);
  const bannerPerfMode = !!performanceMode;

  const dismissBanner = useCallback(() => {
    try { window.localStorage.setItem(ONBOARDING_BANNER_DISMISS_KEY, '1'); } catch { /* noop */ }
    setBannerDismissed(true);
  }, []);

  const togglePerfPreview = useCallback(async () => {
    if (!onTogglePerformanceMode) return;
    try {
      await onTogglePerformanceMode(!bannerPerfMode);
    } catch {
      /* surfaced upstream */
    }
  }, [onTogglePerformanceMode, bannerPerfMode]);

  // ── Data derivations (mirror current HomeTab logic) ──
  const classAssignments = useMemo(() =>
    assignments.filter(a => {
      if (a.classType !== activeClass) return false;
      if (a.status === 'DRAFT' || a.status === 'ARCHIVED') return false;
      if (a.scheduledAt && new Date(a.scheduledAt) > new Date()) return false;
      if (a.targetSections?.length) {
        const sec = userClassSections?.[activeClass] || userSection || '';
        if (!a.targetSections.includes(sec)) return false;
      }
      return true;
    }),
    [assignments, activeClass, userClassSections, userSection],
  );

  const upcomingDue = useMemo(() => {
    return classAssignments
      .filter(a => a.dueDate)
      .map(a => {
        const sub = submissions.find(s => s.assignmentId === a.id);
        const isCompleted = !!(sub && sub.status !== 'STARTED');
        return { ...a, isCompleted };
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      // Overdue items are ALWAYS surfaced regardless of how old (students must not
      // lose visibility on long-overdue work). Future items are not age-capped; the
      // final slice(0, 5) below bounds the rendered list.
      .slice(0, 5);
  }, [classAssignments, submissions]);

  const upNextAssignment = useMemo(
    () => upcomingDue.find(a => !a.isCompleted) || null,
    [upcomingDue],
  );

  // "Current unit" inferred from the most urgent incomplete work, fallback to
  // most recent assignment with a unit tag. Keeps Zone 01 contextual.
  const currentUnit = useMemo(() => {
    if (upNextAssignment?.unit) return upNextAssignment.unit;
    const withUnit = [...classAssignments.filter(a => a.unit)].sort((a, b) => {
      const aKey = a.dueDate
        ? new Date(a.dueDate).getTime()
        : (a as { createdAt?: string | number | Date }).createdAt
          ? new Date((a as { createdAt: string | number | Date }).createdAt).getTime()
          : 0;
      const bKey = b.dueDate
        ? new Date(b.dueDate).getTime()
        : (b as { createdAt?: string | number | Date }).createdAt
          ? new Date((b as { createdAt: string | number | Date }).createdAt).getTime()
          : 0;
      return bKey - aKey;
    })[0];
    return withUnit?.unit;
  }, [upNextAssignment, classAssignments]);

  // Block-level progress on the up-next assignment (how many lesson blocks
  // the student has completed in the in-flight submission, if any).
  const upNextProgress = useMemo(() => {
    if (!upNextAssignment) return null;
    const totalBlocks = upNextAssignment.lessonBlocks?.length ?? 0;
    if (!totalBlocks) return null;
    const sub = submissions.find(s => s.assignmentId === upNextAssignment.id);
    const answered = sub?.blockResponses ? Object.keys(sub.blockResponses).length : 0;
    const pct = Math.max(0, Math.min(100, Math.round((answered / totalBlocks) * 100)));
    return { pct, answered, total: totalBlocks, blocksLeft: Math.max(0, totalBlocks - answered) };
  }, [upNextAssignment, submissions]);

  // Recent activity (last 4 submitted) — same shape as previous implementation
  const recentActivity = useMemo(() => {
    return submissions
      .filter(s => classAssignments.some(a => a.id === s.assignmentId) && s.submittedAt)
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
      .slice(0, 4)
      .map(s => {
        const assignment = classAssignments.find(a => a.id === s.assignmentId);
        return { ...s, assignmentTitle: assignment?.title || s.assignmentTitle, unit: assignment?.unit };
      });
  }, [submissions, classAssignments]);

  // Unit/overview stats
  const stats = useMemo(() => {
    const unitAssignments = currentUnit
      ? classAssignments.filter(a => a.unit === currentUnit)
      : classAssignments;
    const total = unitAssignments.length;
    const completedIds = new Set(
      submissions
        .filter(s => unitAssignments.some(a => a.id === s.assignmentId) && s.status !== 'STARTED')
        .map(s => s.assignmentId),
    );
    const completed = completedIds.size;
    const totalTime = submissions
      .filter(s => unitAssignments.some(a => a.id === s.assignmentId))
      .reduce((sum, s) => sum + (s.metrics?.engagementTime || 0), 0);
    const practicesMastered = classAssignments.filter(a => practiceCompletion[a.id]?.completed).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, totalTime, practicesMastered, pct };
  }, [classAssignments, submissions, practiceCompletion, currentUnit]);

  const unreadFeedbackItems = useMemo(() => {
    return submissions
      .filter(s => {
        const assignment = classAssignments.find(a => a.id === s.assignmentId);
        if (!assignment) return false;
        return s.rubricGrade?.teacherFeedback && !s.feedbackReadAt;
      })
      .map(s => {
        const assignment = classAssignments.find(a => a.id === s.assignmentId);
        return {
          submission: s,
          assignmentId: s.assignmentId,
          assignmentTitle: assignment?.title || s.assignmentTitle,
          gradedBy: s.rubricGrade?.gradedBy || teacherName || 'Your teacher',
        };
      });
  }, [submissions, classAssignments, teacherName]);

  const section = userClassSections?.[activeClass] || userSection;
  const greeting = timeOfDayGreeting();
  const upNextBadge = upNextAssignment ? urgencyLabel(upNextAssignment.dueDate!) : null;

  // Format study-time for the small metric in Zone 02
  const studyTime = useMemo(() => {
    const s = stats.totalTime;
    if (s >= 3600) return { value: (s / 3600).toFixed(1), suffix: 'h' };
    if (s >= 60) return { value: String(Math.round(s / 60)), suffix: 'm' };
    return { value: '0', suffix: 'm' };
  }, [stats.totalTime]);

  // ── Render ──

  return (
    <div
      key="home"
      className="max-w-5xl mx-auto space-y-6"
      style={{ animation: 'tabEnter 0.3s ease-out both' }}
    >
      <h2 className="sr-only">Home</h2>

      {/* Onboarding tip — Reduce animations (preserved from v1) */}
      {!bannerDismissed && (
        <div
          role="region"
          aria-label="Welcome tip: reduce interface animations"
          className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl"
        >
          <Sparkles className="w-5 h-5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[var(--text-primary)]">Welcome!</div>
            <div className="text-xs text-[var(--text-tertiary)]">
              Want a calmer interface? Toggle to reduce animations across the app.
            </div>
          </div>
          <button
            type="button"
            onClick={togglePerfPreview}
            role="switch"
            aria-checked={bannerPerfMode}
            aria-label={`Reduce animations: currently ${bannerPerfMode ? 'on' : 'off'}`}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
              bannerPerfMode
                ? 'bg-[var(--accent-muted)] border-[var(--border-strong)]'
                : 'bg-[var(--surface-glass-heavy)] border-[var(--border)]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                bannerPerfMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Dismiss onboarding tip"
            className="shrink-0 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══════════ ZONE 01 — HERO / "Now" ═══════════ */}
      <section
        className="relative rounded-[28px] px-6 sm:px-10 py-8 overflow-hidden border border-[var(--border)]"
        style={{
          background:
            'linear-gradient(135deg, var(--accent-muted), var(--surface-glass))',
        }}
        aria-labelledby="home-zone-01-label"
      >
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              id="home-zone-01-label"
              className="text-[10px] font-black tracking-[0.32em] uppercase text-[var(--accent-text)]"
            >
              {userName ? `${greeting}, ${userName}` : greeting}
            </span>
            {loginStreak > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-[var(--accent-text)] bg-[var(--accent-muted)] border border-[var(--border)]"
                aria-label={`${loginStreak} day login streak`}
              >
                <span aria-hidden="true">🔥</span>
                {loginStreak} Day streak
              </span>
            )}
            {userCodename && userLevel != null && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-[var(--text-muted)] bg-[var(--surface-glass-heavy)] border border-[var(--border)]"
                aria-label={`Operative ${userCodename}, level ${userLevel}`}
              >
                {userCodename} · Lv {userLevel}
              </span>
            )}
            <span className="flex-1 h-px bg-[var(--border)]" />
            {upNextBadge && (
              <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${badgeClassFor(upNextBadge.tone)}`}>
                ● {upNextBadge.text}
              </span>
            )}
          </div>

          {upNextAssignment ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
              <div className="lg:col-span-2">
                <div className="text-xs font-bold uppercase tracking-widest mb-2 text-[var(--text-muted)]">
                  {activeClass}
                  {section ? <span> · {section}</span> : null}
                  {currentUnit ? <span> · {currentUnit}</span> : null}
                </div>
                <h2 className="text-[28px] lg:text-[42px] font-black leading-[1.05] tracking-tight text-[var(--text-primary)]">
                  {upNextAssignment.title}
                </h2>
                {upNextProgress && (
                  <div className="mt-4 flex items-center gap-3">
                    <div
                      className="flex-1 max-w-sm h-1.5 rounded-full overflow-hidden bg-[var(--surface-sunken)]"
                      role="progressbar"
                      aria-valuenow={upNextProgress.pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Assignment progress: ${upNextProgress.pct}% complete`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${upNextProgress.pct}%`, background: 'var(--accent)' }}
                      />
                    </div>
                    <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">
                      {upNextProgress.pct}% · {upNextProgress.blocksLeft} blocks left
                    </span>
                  </div>
                )}
              </div>
              <div className="flex lg:justify-end">
                <button
                  type="button"
                  onClick={() => onStartAssignment?.(upNextAssignment.id)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white shadow-lg whitespace-nowrap bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)] motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
                >
                  {upNextProgress && upNextProgress.answered > 0 ? 'Continue' : 'Start'}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
              <div className="lg:col-span-2">
                <div className="text-xs font-bold uppercase tracking-widest mb-2 text-[var(--text-muted)]">
                  {activeClass}
                  {section ? <span> · {section}</span> : null}
                  {currentUnit ? <span> · {currentUnit}</span> : null}
                </div>
                <h2 className="text-[28px] lg:text-[42px] font-black leading-[1.05] tracking-tight text-[var(--text-primary)]">
                  You're all caught up
                </h2>
                <div className="mt-4 text-sm text-[var(--text-tertiary)]">
                  No assignments due in the next week. Explore resources or review past work.
                </div>
              </div>
              <div className="flex lg:justify-end">
                <button
                  type="button"
                  onClick={() => onNavigate('Resources')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white shadow-lg whitespace-nowrap bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
                >
                  Browse resources
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════ ZONE 01.5 — Wellness check-in ═══════════ */}
      <CortisolCheckIn
        onSubmit={async (level) => {
          await dataService.submitWellnessCheckin(
            userId || '',
            userName || '',
            level,
            activeClass,
            userClassSections?.[activeClass] || userSection
          );
        }}
        onClear={async () => {
          await dataService.clearWellnessCheckin(userId || '');
        }}
      />

      {/* ═══════════ ZONE 02 — Metric trio (This week + This unit) ═══════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* This week — 3/5 */}
        <div className="lg:col-span-3 relative rounded-[24px] p-6 sm:p-7 bg-[var(--surface-glass)] border border-[var(--border)]">
          <div className="relative flex items-center gap-3 mb-5">
            <span className="text-[10px] font-black tracking-[0.32em] uppercase text-[var(--text-tertiary)]">This week</span>
            <span className="flex-1 h-px bg-[var(--border)]" />
            <button
              type="button"
              onClick={() => onNavigate('Calendar')}
              className="text-[11px] font-bold text-[var(--accent-text)] hover:opacity-70 transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
            >
              Calendar <ChevronRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>

          {upcomingDue.length === 0 ? (
            <div className="relative text-sm text-[var(--text-muted)] italic py-6 text-center bg-[var(--surface-sunken)] rounded-xl border border-dashed border-[var(--border)]">
              No upcoming due dates
            </div>
          ) : (
            <ul className="relative space-y-1">
              {upcomingDue.map((a, idx) => {
                const due = new Date(a.dueDate!);
                const dayNum = due.getDate();
                const monthAbbrev = due.toLocaleDateString('en-US', { month: 'short' });
                const weekdayAbbrev = due.toLocaleDateString('en-US', { weekday: 'short' });
                const badge = urgencyLabel(a.dueDate!);
                const isDominant = idx === 0 && !a.isCompleted;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onStartAssignment?.(a.id)}
                      className={`group w-full flex items-center gap-4 p-3 -mx-3 rounded-xl text-left transition hover:bg-[var(--surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                        a.isCompleted ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="w-16 text-right shrink-0">
                        <div
                          className={`${isDominant ? 'text-[22px]' : 'text-base'} font-black leading-none text-[var(--text-primary)] ${a.isCompleted ? 'line-through' : ''}`}
                        >
                          {dayNum}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest mt-1 text-[var(--text-muted)]">
                          {monthAbbrev} · {weekdayAbbrev}
                        </div>
                      </div>
                      <div className="w-px self-stretch bg-[var(--border)]" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`${isDominant ? 'text-[17px]' : 'text-sm'} ${isDominant ? 'font-bold' : 'font-semibold'} leading-tight truncate text-[var(--text-primary)] ${a.isCompleted ? 'line-through' : ''}`}
                        >
                          {a.title}
                        </div>
                        <div className="text-xs mt-0.5 text-[var(--text-tertiary)]">
                          {a.unit ? `${a.unit} · ` : ''}
                          {a.isCompleted ? 'Completed' : shortRelative(a.dueDate!)}
                        </div>
                      </div>
                      {a.isCompleted ? (
                        <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-label="Completed" />
                      ) : (
                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap ${badgeClassFor(badge.tone)}`}
                        >
                          {badge.text}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* This unit — 2/5 — hero metric + supporting */}
        <div className="lg:col-span-2 relative rounded-[24px] p-6 sm:p-7 bg-[var(--surface-glass)] border border-[var(--border)]">
          <div className="relative flex items-center gap-3 mb-5">
            <span className="text-[10px] font-black tracking-[0.32em] uppercase whitespace-nowrap text-[var(--text-tertiary)]">
              This unit
            </span>
            <span className="flex-1 h-px bg-[var(--border)]" />
            <button
              type="button"
              onClick={() => onNavigate('Progress')}
              className="text-[11px] font-bold text-[var(--accent-text)] hover:opacity-70 transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
            >
              Details <ChevronRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>

          <div className="relative">
            <div className="flex items-baseline gap-2">
              <span className="text-[64px] leading-none font-black tracking-tighter text-[var(--text-primary)]">
                {stats.pct}
              </span>
              <span className="text-2xl font-black text-[var(--accent-text)]">%</span>
            </div>
            <div className="text-[11px] font-bold uppercase tracking-widest mt-2 text-[var(--text-tertiary)]">
              {currentUnit ? `${currentUnit} · ` : ''}
              {stats.completed} of {stats.total} complete
            </div>
            <div
              className="mt-3 h-1 rounded-full overflow-hidden bg-[var(--surface-sunken)]"
              role="progressbar"
              aria-valuenow={stats.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Unit completion: ${stats.pct} percent`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${stats.pct}%`,
                  background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
                }}
              />
            </div>
          </div>

          <div className="my-5 h-px bg-[var(--border)]" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-lg font-black leading-none text-[var(--text-primary)]">
                {studyTime.value}
                <span className="text-xs font-medium text-[var(--text-muted)]">{studyTime.suffix}</span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-1.5 text-[var(--text-tertiary)]">
                Study
              </div>
            </div>
            <div>
              <div className="text-lg font-black leading-none text-[var(--text-primary)]">
                {stats.practicesMastered}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-1.5 text-[var(--text-tertiary)]">
                Mastered
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ ZONE 03 — Quick nav / "Go to" ═══════════ */}
      <section className="px-1">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] font-black tracking-[0.32em] uppercase whitespace-nowrap text-[var(--text-tertiary)]">
            Go to
          </span>
          <span className="flex-1 h-px bg-[var(--border)]" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {/* Hero tile — Resources */}
          <button
            type="button"
            onClick={() => onNavigate('Resources')}
            aria-label="Go to Resources"
            className="md:col-span-2 md:row-span-2 relative flex flex-col justify-between p-5 rounded-2xl text-left overflow-hidden border border-[var(--border)] transition motion-safe:hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{
              background: 'linear-gradient(135deg, var(--accent-muted), var(--surface-glass))',
              minHeight: '140px',
            }}
          >
            <AnimatedIcon
              src="/assets/icons/icon-resources.png"
              alt=""
              size={64}
              disableAnimation={performanceMode}
            />
            <div>
              <div className="text-[10px] font-black tracking-[0.22em] uppercase mb-1 text-[var(--accent-text)]">
                ● Most visited
              </div>
              <div className="text-xl font-black text-[var(--text-primary)]">Resources</div>
              <div className="text-[11px] mt-1 text-[var(--text-tertiary)]">
                {stats.total} assignment{stats.total === 1 ? '' : 's'}
                {unreadFeedbackItems.length > 0 && ` · ${unreadFeedbackItems.length} feedback`}
              </div>
            </div>
          </button>

          {/* Secondary tiles */}
          {[
            { label: 'Loadout', nav: 'Loadout', icon: '/assets/icons/icon-agent-loadout.png' },
            { label: 'Progress', nav: 'Progress', icon: '/assets/icons/icon-progress.png' },
            { label: 'Badges', nav: 'Badges', icon: '/assets/icons/icon-badges.png' },
            { label: 'Calendar', nav: 'Calendar', icon: '/assets/icons/icon-calendar.png' },
            { label: 'Leaders', nav: 'Leaderboard', icon: '/assets/icons/icon-leaderboard.png' },
          ].map(tile => (
            <button
              key={tile.label}
              type="button"
              onClick={() => onNavigate(tile.nav)}
              aria-label={`Go to ${tile.label}`}
              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-[88px]"
            >
              <AnimatedIcon src={tile.icon} alt="" size={40} disableAnimation={performanceMode} />
              <span className="text-[11px] font-bold text-[var(--text-secondary)]">{tile.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ═══════════ ZONE 04 — Preservation (feedback + activity + XP event) ═══════════
          This zone explicitly preserves functionality-floor items that Variation D
          doesn't surface in its visible zones: teacher feedback banner, recent
          activity, and active XP event. Announcements are rendered by the
          StudentDashboard container above this tab, so they stay preserved
          without being duplicated here. */}
      <section className="px-1 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] font-black tracking-[0.32em] uppercase whitespace-nowrap text-[var(--text-tertiary)]">
            Latest
          </span>
          <span className="flex-1 h-px bg-[var(--border)]" />
          <button
            type="button"
            onClick={() => onNavigate('Resources')}
            className="text-[11px] font-bold text-[var(--accent-text)] hover:opacity-70 transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
          >
            All resources <ChevronRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>

        {/* Teacher feedback banner (preserved) */}
        {unreadFeedbackItems.length > 0 && (
          <button
            type="button"
            onClick={() => navigate('/feedback')}
            aria-label={`View ${unreadFeedbackItems.length} unread teacher feedback item${unreadFeedbackItems.length === 1 ? '' : 's'}`}
            className="w-full flex items-center gap-3 px-4 py-3 mb-3 rounded-xl border border-[var(--border)] bg-[var(--accent-muted)] hover:bg-[var(--surface-glass-heavy)] transition text-left focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <MessageSquare className="w-5 h-5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[var(--text-primary)]">
                New feedback from {unreadFeedbackItems[0].gradedBy}
              </div>
              <div className="text-xs text-[var(--text-tertiary)] truncate">
                {unreadFeedbackItems.length} unread item{unreadFeedbackItems.length === 1 ? '' : 's'}
                {unreadFeedbackItems[0]?.assignmentTitle
                  ? ` · starting with "${unreadFeedbackItems[0].assignmentTitle}"`
                  : ''}
              </div>
            </div>
            <span
              className="px-2 py-0.5 text-xs font-bold rounded-full shrink-0 text-[var(--accent-text)] bg-[var(--surface-raised)] border border-[var(--border)]"
              role="status"
              aria-label={`${unreadFeedbackItems.length} unread`}
            >
              {unreadFeedbackItems.length}
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
          </button>
        )}

        {/* Active XP event (preserved) */}
        {activeEvent && (
          <div
            className="flex items-center gap-3 p-3 mb-3 rounded-xl border border-[var(--border)] bg-[var(--accent-muted)]"
            role="status"
          >
            <Zap className="w-5 h-5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
            <span className="text-sm font-bold flex-1 text-[var(--text-primary)]">
              {activeEvent.title} — {activeEvent.multiplier}x XP active
            </span>
          </div>
        )}

        {/* Recent activity list */}
        {recentActivity.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)] italic py-6 text-center bg-[var(--surface-sunken)] rounded-xl border border-dashed border-[var(--border)]">
            No recent activity yet
          </div>
        ) : (
          <ul className="space-y-0.5">
            {recentActivity.map(s => {
              const submittedDate = s.submittedAt ? new Date(s.submittedAt) : null;
              const dayNum = submittedDate?.getDate();
              const monthAbbrev = submittedDate?.toLocaleDateString('en-US', { month: 'short' });
              const scoreTone =
                typeof s.score === 'number' && s.score >= 85
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : typeof s.score === 'number' && s.score >= 60
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-[var(--text-tertiary)]';
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onStartAssignment?.(s.assignmentId)}
                    className="group w-full flex items-center gap-5 py-3 px-3 -mx-3 rounded-xl text-left transition hover:bg-[var(--surface-glass)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    <div className="w-14 shrink-0 text-right">
                      {submittedDate ? (
                        <>
                          <div className="text-[22px] font-black leading-none text-[var(--text-primary)]">
                            {dayNum}
                          </div>
                          <div className="text-[9px] font-bold uppercase tracking-widest mt-1 text-[var(--text-muted)]">
                            {monthAbbrev}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-[var(--text-muted)]">—</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold truncate text-[var(--text-primary)]">
                        {s.assignmentTitle}
                      </div>
                      <div className="text-xs mt-0.5 text-[var(--text-tertiary)] truncate">
                        {s.unit ? `${s.unit} · ` : ''}
                        {s.status === 'SUCCESS' ? 'Submitted' : s.status === 'FLAGGED' ? 'Flagged' : 'In progress'}
                      </div>
                    </div>
                    {typeof s.score === 'number' && s.score > 0 ? (
                      <span className={`text-sm font-black font-mono ${scoreTone}`}>
                        {s.score}%
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-[var(--text-tertiary)]">Read</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default HomeTab;

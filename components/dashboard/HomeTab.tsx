
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Assignment, Submission, XPEvent } from '../../types';
import {
  Clock, Target, Zap, ChevronRight, CheckCircle2, BookOpen, TrendingUp, MessageSquare,
} from 'lucide-react';
import AnimatedIcon from '../AnimatedIcon';

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
  /** Teacher name or display string, used in feedback attribution. */
  teacherName?: string;
}

// ─── Helpers ─────────────────────────────────

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function urgencyColor(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (diffDays <= 1) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (diffDays <= 3) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-[var(--text-tertiary)] bg-[var(--surface-glass)] border-[var(--border)]';
}

// ─── Section wrapper ─────────────────────────

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}> = ({ title, icon, actionLabel, onAction, children }) => (
  <div>
    <div className="flex items-center justify-between mb-3">
      <h3 className="flex items-center gap-2 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
        {icon}
        {title}
      </h3>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="text-xs font-bold text-[var(--accent-text)] hover:text-[var(--accent-text)] flex items-center gap-1 transition py-1.5 px-2 -my-1.5 -mx-2 rounded-lg focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          {actionLabel} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
    {children}
  </div>
);

// ─── Quick-nav card ──────────────────────────

const QuickNavCard: React.FC<{
  label: string;
  icon: React.ReactNode;
  color: string;
  badge?: string | number;
  onClick: () => void;
}> = ({ label, icon, color, badge, onClick }) => (
  <button
    onClick={onClick}
    aria-label={badge ? `${label}, ${badge} new` : label}
    className={`group flex-1 flex flex-col items-center gap-3 px-6 py-4 rounded-2xl border transition-all motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-purple-500 ${color}`}
  >
    <div className="relative">
      {icon}
      {badge !== undefined && badge !== 0 && (
        <span className="absolute -top-1.5 -right-2.5 bg-purple-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
          {badge}
        </span>
      )}
    </div>
    <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
  </button>
);

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
  teacherName,
}) => {
  const navigate = useNavigate();

  // Filter to active class, visible assignments only
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

  // Upcoming due dates (sorted soonest first)
  const upcomingDue = useMemo(() => {
    const now = new Date();
    return classAssignments
      .filter(a => a.dueDate)
      .map(a => {
        const sub = submissions.find(s => s.assignmentId === a.id);
        const isCompleted = sub && sub.status !== 'STARTED';
        return { ...a, isCompleted: !!isCompleted };
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .filter(a => {
        // Show overdue (up to 7 days back) + upcoming
        const diff = new Date(a.dueDate!).getTime() - now.getTime();
        return diff > -7 * 24 * 60 * 60 * 1000;
      })
      .slice(0, 5);
  }, [classAssignments, submissions]);

  // Recent activity — assignments the student has engaged with recently
  const recentActivity = useMemo(() => {
    return submissions
      .filter(s => classAssignments.some(a => a.id === s.assignmentId) && s.submittedAt)
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
      .slice(0, 4)
      .map(s => {
        const assignment = classAssignments.find(a => a.id === s.assignmentId);
        return { ...s, assignmentTitle: assignment?.title || s.assignmentTitle };
      });
  }, [submissions, classAssignments]);

  // Completion stats
  const stats = useMemo(() => {
    const total = classAssignments.length;
    // Deduplicate: count each assignment at most once (retakes shouldn't inflate count)
    const completedIds = new Set(
      submissions
        .filter(s => classAssignments.some(a => a.id === s.assignmentId) && s.status !== 'STARTED')
        .map(s => s.assignmentId),
    );
    const completed = completedIds.size;
    const totalTime = submissions
      .filter(s => classAssignments.some(a => a.id === s.assignmentId))
      .reduce((sum, s) => sum + (s.metrics?.engagementTime || 0), 0);
    const practicesMastered = classAssignments.filter(a => practiceCompletion[a.id]?.completed).length;

    return { total, completed, totalTime, practicesMastered };
  }, [classAssignments, submissions, practiceCompletion]);

  // Unread teacher feedback — submissions with rubricGrade.teacherFeedback but no feedbackReadAt
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
          feedbackPreview: (s.rubricGrade!.teacherFeedback || '').slice(0, 80) + ((s.rubricGrade!.teacherFeedback || '').length > 80 ? '…' : ''),
          gradedBy: s.rubricGrade?.gradedBy || teacherName || 'Your teacher',
        };
      });
  }, [submissions, classAssignments, teacherName]);

  // "Up Next" — the single most urgent incomplete assignment
  const upNextAssignment = useMemo(() => {
    return upcomingDue.find(a => !a.isCompleted) || null;
  }, [upcomingDue]);

  return (
    <div key="home" className="space-y-6" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      <h2 className="sr-only">Home</h2>

      {/* New Feedback — compact banner linking to /feedback */}
      {unreadFeedbackItems.length > 0 && (
        <button
          onClick={() => navigate('/feedback')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl hover:bg-amber-500/15 transition text-left"
        >
          <MessageSquare className="w-5 h-5 text-amber-500 shrink-0" />
          <span className="text-sm font-medium text-[var(--text-primary)] flex-1">
            You have {unreadFeedbackItems.length} unread feedback item{unreadFeedbackItems.length !== 1 ? 's' : ''}
          </span>
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full shrink-0" role="status" aria-label={`${unreadFeedbackItems.length} unread feedback item${unreadFeedbackItems.length !== 1 ? 's' : ''}`}>
            {unreadFeedbackItems.length}
          </span>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        </button>
      )}

      {/* Up Next — most urgent incomplete assignment */}
      {upNextAssignment && (
        <button
          onClick={() => onStartAssignment?.(upNextAssignment.id)}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-purple-600/15 to-blue-600/15 border border-purple-500/30 hover:border-purple-500/50 transition-all motion-safe:hover:scale-[1.005] motion-safe:active:scale-[0.995] text-left group focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
            <Target className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-[var(--accent-text)] uppercase tracking-widest mb-0.5">Up Next</div>
            <div className="text-base font-bold text-[var(--text-primary)] truncate">{upNextAssignment.title}</div>
            <div className={`text-xs font-bold mt-0.5 ${
              new Date(upNextAssignment.dueDate!).getTime() - Date.now() < 0 ? 'text-red-400' :
              new Date(upNextAssignment.dueDate!).getTime() - Date.now() < 86400000 ? 'text-amber-400' :
              'text-[var(--text-tertiary)]'
            }`}>
              {relativeDate(upNextAssignment.dueDate!)}
              {upNextAssignment.unit && <span className="text-[var(--text-muted)] ml-2 font-normal">{upNextAssignment.unit}</span>}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--accent-text)] shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Active XP Event (compact inline) */}
      {activeEvent && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/30">
          <Zap className="w-5 h-5 text-blue-400 shrink-0" />
          <span className="text-sm text-blue-300 font-bold flex-1">{activeEvent.title} — {activeEvent.multiplier}x XP active</span>
        </div>
      )}

      {/* Quick Navigation */}
      <div className="flex items-center gap-2 bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
        <QuickNavCard
          label="Resources"
          icon={<AnimatedIcon src="/assets/icons/icon-resources.png" alt="Resources" size={56} disableAnimation={performanceMode} />}
          color="bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20"
          onClick={() => onNavigate('Resources')}
        />
        <QuickNavCard
          label="Loadout"
          icon={<AnimatedIcon src="/assets/icons/icon-agent-loadout.png" alt="Loadout" size={56} disableAnimation={performanceMode} />}
          color="bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
          onClick={() => onNavigate('Agent Loadout')}
        />
        <QuickNavCard
          label="Progress"
          icon={<AnimatedIcon src="/assets/icons/icon-progress.png" alt="Progress" size={56} disableAnimation={performanceMode} />}
          color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
          onClick={() => onNavigate('Progress')}
        />
        <QuickNavCard
          label="Badges"
          icon={<AnimatedIcon src="/assets/icons/icon-badges.png" alt="Badges" size={56} disableAnimation={performanceMode} />}
          color="bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20"
          onClick={() => onNavigate('Badges')}
        />
        <QuickNavCard
          label="Calendar"
          icon={<AnimatedIcon src="/assets/icons/icon-calendar.png" alt="Calendar" size={56} disableAnimation={performanceMode} />}
          color="bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20"
          onClick={() => onNavigate('Calendar')}
        />
      </div>

      {/* Two-column layout for due dates + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Upcoming Due Dates */}
        <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
          <Section
            title="Upcoming"
            icon={<Clock className="w-3.5 h-3.5" />}
            actionLabel="Calendar"
            onAction={() => onNavigate('Calendar')}
          >
            {upcomingDue.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)] italic py-6 text-center bg-black/10 rounded-xl border border-dashed border-[var(--border)]">
                No upcoming due dates
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingDue.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onStartAssignment?.(a.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all hover:bg-[var(--surface-glass)] text-left focus-visible:ring-2 focus-visible:ring-purple-500 ${urgencyColor(a.dueDate!)}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)] truncate">{a.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-bold">{relativeDate(a.dueDate!)}</span>
                        {a.unit && <span className="text-xs text-[var(--text-tertiary)]">{a.unit}</span>}
                      </div>
                    </div>
                    {a.isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 opacity-40 shrink-0" />
                    )}
                    <span className="sr-only">{a.isCompleted ? 'Completed' : 'Not yet completed'}</span>
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* At-a-Glance Stats */}
        <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4">
          <Section
            title="Overview"
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            actionLabel="Details"
            onAction={() => onNavigate('Progress')}
          >
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-black/10 border border-[var(--border)] rounded-xl p-3 text-center">
                <div className="text-xl font-black text-[var(--text-primary)]">{stats.completed}</div>
                <div className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider mt-1">Completed</div>
                <div className="text-xs text-[var(--text-tertiary)]">of {stats.total}</div>
              </div>
              <div className="bg-black/10 border border-[var(--border)] rounded-xl p-3 text-center">
                <div className="text-xl font-black text-[var(--text-primary)]">
                  {stats.totalTime >= 3600
                    ? `${(stats.totalTime / 3600).toFixed(1)}h`
                    : `${Math.round(stats.totalTime / 60)}m`}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider mt-1">Study Time</div>
              </div>
              <div className="bg-black/10 border border-[var(--border)] rounded-xl p-3 text-center">
                <div className="text-xl font-black text-[var(--text-primary)]">{stats.practicesMastered}</div>
                <div className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider mt-1">Mastered</div>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <Section
          title="Recent Activity"
          icon={<BookOpen className="w-3.5 h-3.5" />}
          actionLabel="All Resources"
          onAction={() => onNavigate('Resources')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentActivity.map(s => (
              <button
                key={s.id}
                onClick={() => onStartAssignment?.(s.assignmentId)}
                className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-white/[0.02] hover:bg-[var(--surface-glass)] transition text-left focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  s.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' :
                  s.status === 'FLAGGED' ? 'bg-red-500/20 text-red-400' :
                  'bg-[var(--surface-glass-heavy)] text-[var(--text-tertiary)]'
                }`}>
                  <BookOpen className="w-4 h-4" />
                </div>
                <span className="sr-only">{s.status === 'SUCCESS' ? 'Completed' : s.status === 'FLAGGED' ? 'Flagged' : 'In progress'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-medium truncate">{s.assignmentTitle}</div>
                  <div className="text-xs text-[var(--text-tertiary)]">
                    {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    {s.score > 0 && <span className="ml-2 text-yellow-400">{s.score}%</span>}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

export default HomeTab;

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Submission } from '../../types';
import { useAssignments } from '../../lib/AppDataContext';
import { dataService } from '../../services/dataService';
import { MessageSquare, ChevronRight, ArrowLeft, ArrowUpDown, Inbox, Eye, CheckCheck } from 'lucide-react';

interface FeedbackPageProps {
  user: User;
  submissions: Submission[];
}

type FeedbackTab = 'new' | 'read' | 'reviewed';
type SortKey = 'date-desc' | 'date-asc' | 'score-desc' | 'score-asc';

function gradeColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-400';
  if (pct >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function gradeBgColor(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500/10';
  if (pct >= 60) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

/** Color-coded badge for class type. Physics = blue tones, Forensic = purple, default = gray. */
function classBadgeClasses(classType: string): string {
  const lower = classType.toLowerCase();
  if (lower.includes('physics')) {
    return 'bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300 dark:bg-blue-500/20';
  }
  if (lower.includes('forensic')) {
    return 'bg-purple-500/15 text-purple-700 border-purple-500/30 dark:text-purple-300 dark:bg-purple-500/20';
  }
  return 'bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-300 dark:bg-gray-500/20';
}

/** Left border accent color for cards, matching class type. */
function classBorderAccent(classType: string): string {
  const lower = classType.toLowerCase();
  if (lower.includes('physics')) return 'border-l-blue-500';
  if (lower.includes('forensic')) return 'border-l-purple-500';
  return 'border-l-gray-400';
}

/** Class filter pill styling. */
function classFilterClasses(classType: string, active: boolean): string {
  const lower = classType.toLowerCase();
  if (!active) return 'bg-[var(--panel-bg)] text-[var(--text-tertiary)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]';
  if (lower.includes('physics')) return 'bg-blue-500/20 text-blue-700 border-blue-500/40 dark:text-blue-300';
  if (lower.includes('forensic')) return 'bg-purple-500/20 text-purple-700 border-purple-500/40 dark:text-purple-300';
  return 'bg-gray-500/20 text-gray-600 border-gray-500/40 dark:text-gray-300';
}

/** Group submissions by classType, preserving order of first appearance. */
function groupByClass(items: Submission[], classLookup: Map<string, string>): { classType: string; items: Submission[] }[] {
  const groups = new Map<string, Submission[]>();
  for (const s of items) {
    const ct = classLookup.get(s.assignmentId) || s.classType || 'Unknown';
    if (!groups.has(ct)) groups.set(ct, []);
    groups.get(ct)!.push(s);
  }
  return Array.from(groups.entries()).map(([classType, items]) => ({ classType, items }));
}

/** Sort submissions by the given key. */
function sortSubmissions(items: Submission[], sortKey: SortKey): Submission[] {
  const sorted = [...items];
  switch (sortKey) {
    case 'date-desc':
      return sorted.sort((a, b) => {
        const dateA = a.rubricGrade?.gradedAt ? new Date(a.rubricGrade.gradedAt).getTime() : 0;
        const dateB = b.rubricGrade?.gradedAt ? new Date(b.rubricGrade.gradedAt).getTime() : 0;
        return dateB - dateA;
      });
    case 'date-asc':
      return sorted.sort((a, b) => {
        const dateA = a.rubricGrade?.gradedAt ? new Date(a.rubricGrade.gradedAt).getTime() : 0;
        const dateB = b.rubricGrade?.gradedAt ? new Date(b.rubricGrade.gradedAt).getTime() : 0;
        return dateA - dateB;
      });
    case 'score-desc':
      return sorted.sort((a, b) => (b.rubricGrade?.overallPercentage ?? -1) - (a.rubricGrade?.overallPercentage ?? -1));
    case 'score-asc':
      return sorted.sort((a, b) => (a.rubricGrade?.overallPercentage ?? 101) - (b.rubricGrade?.overallPercentage ?? 101));
    default:
      return sorted;
  }
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date-desc', label: 'Date (newest)' },
  { key: 'date-asc', label: 'Date (oldest)' },
  { key: 'score-desc', label: 'Score (high\u2192low)' },
  { key: 'score-asc', label: 'Score (low\u2192high)' },
];

const TAB_CONFIG: { key: FeedbackTab; label: string; icon: React.ReactNode }[] = [
  { key: 'new', label: 'New', icon: <Inbox className="w-3.5 h-3.5" /> },
  { key: 'read', label: 'Read', icon: <Eye className="w-3.5 h-3.5" /> },
  { key: 'reviewed', label: 'Reviewed', icon: <CheckCheck className="w-3.5 h-3.5" /> },
];

const FeedbackPage: React.FC<FeedbackPageProps> = ({ submissions }) => {
  const navigate = useNavigate();
  const { assignments } = useAssignments();
  const [sortKey, setSortKey] = useState<SortKey>('date-desc');
  const [classFilter, setClassFilter] = useState<string>('All');

  // Build assignmentId -> classType lookup
  const classLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      map.set(a.id, a.classType || 'Unknown');
    }
    return map;
  }, [assignments]);

  // Split submissions with teacher feedback into unread / read / reviewed
  const { unread, read, reviewed } = useMemo(() => {
    const withFeedback = submissions.filter(s => s.rubricGrade?.teacherFeedback);
    return {
      reviewed: withFeedback.filter(s => s.feedbackReviewedAt),
      unread: withFeedback.filter(s => !s.feedbackReadAt && !s.feedbackReviewedAt),
      read: withFeedback.filter(s => s.feedbackReadAt && !s.feedbackReviewedAt),
    };
  }, [submissions]);

  // Default tab: 'new' if items exist, else 'read', else 'reviewed'
  const defaultTab: FeedbackTab = unread.length > 0 ? 'new' : read.length > 0 ? 'read' : 'reviewed';
  const [activeTab, setActiveTab] = useState<FeedbackTab>(defaultTab);

  const handleMarkReviewed = useCallback(async (submissionId: string) => {
    await dataService.markFeedbackReviewed(submissionId);
  }, []);

  // All unique class types present across all feedback
  const availableClasses = useMemo(() => {
    const allFeedback = [...unread, ...read, ...reviewed];
    const classSet = new Set<string>();
    for (const s of allFeedback) {
      classSet.add(classLookup.get(s.assignmentId) || s.classType || 'Unknown');
    }
    return Array.from(classSet).sort();
  }, [unread, read, reviewed, classLookup]);

  // Get items for the active tab, then apply filter + sort
  const activeItems = useMemo(() => {
    let items: Submission[];
    switch (activeTab) {
      case 'new': items = unread; break;
      case 'read': items = read; break;
      case 'reviewed': items = reviewed; break;
    }
    // Apply class filter
    if (classFilter !== 'All') {
      items = items.filter(s => (classLookup.get(s.assignmentId) || s.classType || 'Unknown') === classFilter);
    }
    // Apply sort
    return sortSubmissions(items, sortKey);
  }, [activeTab, unread, read, reviewed, classFilter, classLookup, sortKey]);

  const tabCounts: Record<FeedbackTab, number> = {
    new: unread.length,
    read: read.length,
    reviewed: reviewed.length,
  };

  const totalUnread = unread.length + read.length;

  const renderCard = (s: Submission, dimmed: boolean = false) => {
    const grade = s.rubricGrade;
    if (!grade) return null;
    const classType = classLookup.get(s.assignmentId) || s.classType || 'Unknown';
    const gradedDate = grade.gradedAt ? new Date(grade.gradedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

    return (
      <button
        key={s.id}
        onClick={() => navigate(`/resources/${s.assignmentId}`)}
        className={`w-full text-left bg-[var(--panel-bg)] border border-[var(--border)] border-l-[3px] ${classBorderAccent(classType)} rounded-xl p-5 transition-all focus-visible:ring-2 focus-visible:ring-purple-500 ${
          dimmed
            ? 'opacity-50'
            : 'hover:border-[var(--border-strong)] hover:bg-[var(--surface-glass)]'
        }`}
      >
        {/* Row 1 — Identity */}
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border shrink-0 ${classBadgeClasses(classType)}`}>
            {classType}
          </span>
          <span className="text-base font-bold text-[var(--text-primary)] truncate">{s.assignmentTitle}</span>
          {grade.overallPercentage != null && (
            <span className={`ml-auto text-base font-bold shrink-0 ${gradeColor(grade.overallPercentage)} ${gradeBgColor(grade.overallPercentage)} px-2 py-0.5 rounded`}>
              {grade.overallPercentage}%
            </span>
          )}
        </div>

        {/* Row 2 — Feedback preview */}
        {grade.teacherFeedback && (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-3 line-clamp-3">
            {grade.teacherFeedback}
          </p>
        )}

        {/* Row 3 — Footer */}
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-[var(--text-muted)]">
            {grade.gradedBy || 'Your teacher'} · {gradedDate}
            {s.attemptNumber && s.attemptNumber > 1 && ` · Attempt ${s.attemptNumber}`}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!s.feedbackReviewedAt && (
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleMarkReviewed(s.id); }}
                className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition shadow-sm"
              >
                Mark Reviewed
              </button>
            )}
            <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
          </div>
        </div>
      </button>
    );
  };

  /** Render a list of cards, grouped by class if multiple classes present. */
  const renderSection = (items: Submission[], dimmed: boolean = false) => {
    const groups = groupByClass(items, classLookup);
    if (groups.length <= 1) {
      return <div className="space-y-2">{items.map(s => renderCard(s, dimmed))}</div>;
    }
    return (
      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.classType}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 pl-1">
              {g.classType}
            </div>
            <div className="space-y-2">
              {g.items.map(s => renderCard(s, dimmed))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const totalWithFeedback = unread.length + read.length + reviewed.length;

  const emptyMessages: Record<FeedbackTab, { icon: React.ReactNode; text: string }> = {
    new: { icon: <Inbox className="w-8 h-8 text-[var(--text-muted)] opacity-40" />, text: "No new feedback \u2014 you're all caught up!" },
    read: { icon: <Eye className="w-8 h-8 text-[var(--text-muted)] opacity-40" />, text: 'No read feedback yet' },
    reviewed: { icon: <CheckCheck className="w-8 h-8 text-[var(--text-muted)] opacity-40" />, text: 'No reviewed feedback yet' },
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Glass container */}
      <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-6 backdrop-blur-md">
        {/* Header with back button */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] hover:bg-[var(--surface-glass)] hover:border-[var(--border-strong)] transition"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
          </button>
          <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-500" />
            Teacher Feedback
          </h1>
          {totalUnread > 0 && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full">
              {totalUnread} unread
            </span>
          )}
        </div>

        {totalWithFeedback === 0 ? (
          /* Global empty state */
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--panel-bg)] border border-[var(--border)] flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-[var(--text-muted)] opacity-40" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">No feedback yet — keep submitting work!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tab navigation */}
            <div className="flex items-center gap-1 bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-1">
              {TAB_CONFIG.map(({ key, label, icon }) => {
                const isActive = activeTab === key;
                const count = tabCounts[key];
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                      isActive
                        ? 'bg-purple-500/20 text-[var(--text-primary)]'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {key === 'new' && count > 0 && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    )}
                    {icon}
                    <span>{label}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                      isActive
                        ? 'bg-purple-500/30 text-[var(--text-primary)]'
                        : 'bg-[var(--surface-glass)] text-[var(--text-muted)]'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sort + Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Sort dropdown */}
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="text-xs font-bold bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Class filter pills */}
              {availableClasses.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setClassFilter('All')}
                    className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border transition ${
                      classFilter === 'All'
                        ? 'bg-[var(--surface-glass)] text-[var(--text-primary)] border-[var(--border-strong)]'
                        : 'bg-[var(--panel-bg)] text-[var(--text-tertiary)] border-[var(--border)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    All
                  </button>
                  {availableClasses.map(cls => (
                    <button
                      key={cls}
                      onClick={() => setClassFilter(cls)}
                      className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-lg border transition ${classFilterClasses(cls, classFilter === cls)}`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Card list or empty state */}
            {activeItems.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[var(--panel-bg)] border border-[var(--border)] flex items-center justify-center">
                  {emptyMessages[activeTab].icon}
                </div>
                <p className="text-sm text-[var(--text-muted)]">{emptyMessages[activeTab].text}</p>
              </div>
            ) : (
              renderSection(activeItems, activeTab === 'reviewed')
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackPage;

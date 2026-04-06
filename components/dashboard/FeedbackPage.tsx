import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Submission } from '../../types';
import { useAssignments } from '../../lib/AppDataContext';
import { dataService } from '../../services/dataService';
import { MessageSquare, ChevronRight, ChevronDown, ArrowLeft } from 'lucide-react';

interface FeedbackPageProps {
  user: User;
  submissions: Submission[];
}

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

/** Group submissions by classType, preserving order of first appearance. */
function groupByClass(items: Submission[], classLookup: Map<string, string>): { classType: string; items: Submission[] }[] {
  const groups = new Map<string, Submission[]>();
  for (const s of items) {
    const ct = classLookup.get(s.assignmentId) || 'Unknown';
    if (!groups.has(ct)) groups.set(ct, []);
    groups.get(ct)!.push(s);
  }
  return Array.from(groups.entries()).map(([classType, items]) => ({ classType, items }));
}

const FeedbackPage: React.FC<FeedbackPageProps> = ({ submissions }) => {
  const navigate = useNavigate();
  const [showReviewed, setShowReviewed] = useState(false);
  const { assignments } = useAssignments();

  // Build assignmentId → classType lookup
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

  const handleMarkReviewed = useCallback(async (submissionId: string) => {
    await dataService.markFeedbackReviewed(submissionId);
  }, []);

  const renderCard = (s: Submission, dimmed: boolean = false) => {
    const grade = s.rubricGrade;
    if (!grade) return null;
    const classType = classLookup.get(s.assignmentId) || 'Unknown';
    const gradedDate = grade.gradedAt ? new Date(grade.gradedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

    return (
      <button
        key={s.id}
        onClick={() => navigate(`/resources/${s.assignmentId}`)}
        className={`w-full text-left bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-4 transition-all focus-visible:ring-2 focus-visible:ring-purple-500 ${
          dimmed
            ? 'opacity-50'
            : 'hover:border-[var(--border-strong)] hover:bg-[var(--surface-glass)]'
        }`}
      >
        {/* Row 1 — Identity */}
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded border shrink-0 ${classBadgeClasses(classType)}`}>
            {classType}
          </span>
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">{s.assignmentTitle}</span>
          {grade.overallPercentage != null && (
            <span className={`ml-auto text-base font-bold shrink-0 ${gradeColor(grade.overallPercentage)} ${gradeBgColor(grade.overallPercentage)} px-2 py-0.5 rounded`}>
              {grade.overallPercentage}%
            </span>
          )}
        </div>

        {/* Row 2 — Feedback preview */}
        {grade.teacherFeedback && (
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-2 line-clamp-2">
            {grade.teacherFeedback}
          </p>
        )}

        {/* Row 3 — Footer */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-[var(--text-muted)]">
            {grade.gradedBy || 'Your teacher'} · {gradedDate}
            {s.attemptNumber && s.attemptNumber > 1 && ` · Attempt ${s.attemptNumber}`}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!s.feedbackReviewedAt && (
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleMarkReviewed(s.id); }}
                className="px-3 py-1.5 text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/30 hover:bg-amber-500/30 transition"
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
      // Single class or empty — no sub-headers needed
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
          {unread.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full">
              {unread.length} new
            </span>
          )}
        </div>

        {totalWithFeedback === 0 ? (
          /* Empty state */
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--panel-bg)] border border-[var(--border)] flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-[var(--text-muted)] opacity-40" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">No feedback yet — keep submitting work!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unread feedback */}
            {unread.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  New ({unread.length})
                </h2>
                {renderSection(unread)}
              </section>
            )}

            {/* Read but not reviewed */}
            {read.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
                  Read ({read.length})
                </h2>
                {renderSection(read)}
              </section>
            )}

            {/* Reviewed — collapsed by default */}
            {reviewed.length > 0 && (
              <section>
                <button
                  onClick={() => setShowReviewed(!showReviewed)}
                  className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 px-2 py-1.5 -mx-2 rounded-lg hover:bg-[var(--surface-glass)] hover:text-[var(--text-secondary)] transition"
                >
                  {showReviewed ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Reviewed ({reviewed.length})
                </button>
                {showReviewed && renderSection(reviewed, true)}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackPage;

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Submission } from '../../types';
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

const FeedbackPage: React.FC<FeedbackPageProps> = ({ submissions }) => {
  const navigate = useNavigate();
  const [showReviewed, setShowReviewed] = useState(false);

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
    const feedbackPreview = grade.teacherFeedback?.slice(0, 100) + (grade.teacherFeedback && grade.teacherFeedback.length > 100 ? '...' : '');
    const gradedDate = grade.gradedAt ? new Date(grade.gradedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

    return (
      <button
        key={s.id}
        onClick={() => navigate(`/resources/${s.assignmentId}`)}
        className={`w-full text-left bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-4 flex items-start gap-3 transition-all focus-visible:ring-2 focus-visible:ring-purple-500 ${
          dimmed
            ? 'opacity-50'
            : 'hover:border-[var(--border-strong)] hover:bg-[var(--surface-glass)]'
        }`}
      >
        <MessageSquare className={`w-5 h-5 mt-0.5 shrink-0 ${dimmed ? 'text-[var(--text-muted)]' : 'text-amber-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)] truncate">{s.assignmentTitle}</span>
            {grade.overallPercentage != null && (
              <span className={`text-xs font-bold shrink-0 ${gradeColor(grade.overallPercentage)}`}>
                {grade.overallPercentage}%
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{feedbackPreview}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[10px] text-[var(--text-muted)]">{grade.gradedBy || 'Your teacher'} · {gradedDate}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!s.feedbackReviewedAt && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleMarkReviewed(s.id); }}
              className="px-3 py-1.5 text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/30 hover:bg-amber-500/30 transition"
            >
              Mark Reviewed
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]" />
        </div>
      </button>
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
                <div className="space-y-2">
                  {unread.map(s => renderCard(s))}
                </div>
              </section>
            )}

            {/* Read but not reviewed */}
            {read.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
                  Read ({read.length})
                </h2>
                <div className="space-y-2">
                  {read.map(s => renderCard(s))}
                </div>
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
                {showReviewed && (
                  <div className="space-y-2">
                    {reviewed.map(s => renderCard(s, true))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackPage;

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Submission } from '../../types';
import { dataService } from '../../services/dataService';
import { MessageSquare, ChevronRight, ChevronDown } from 'lucide-react';

interface FeedbackPageProps {
  user: User;
  submissions: Submission[];
}

const FeedbackPage: React.FC<FeedbackPageProps> = ({ submissions }) => {
  const navigate = useNavigate();
  const [showReviewed, setShowReviewed] = useState(false);

  // Split submissions with teacher feedback into unread / read / reviewed
  const { unread, read, reviewed } = useMemo(() => {
    const withFeedback = submissions.filter(s => s.rubricGrade?.teacherFeedback);
    return {
      unread: withFeedback.filter(s => !s.feedbackReadAt),
      read: withFeedback.filter(s => s.feedbackReadAt && !s.feedbackReviewedAt),
      reviewed: withFeedback.filter(s => s.feedbackReviewedAt),
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
      <div
        key={s.id}
        className={`border border-[var(--border)] rounded-xl p-3 flex items-start gap-3 transition ${dimmed ? 'opacity-50' : 'hover:bg-[var(--surface-glass)]'}`}
      >
        <MessageSquare className={`w-4 h-4 mt-0.5 shrink-0 ${dimmed ? 'text-[var(--text-muted)]' : 'text-amber-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)] truncate">{s.assignmentTitle}</span>
            {grade.overallPercentage != null && (
              <span className="text-xs font-bold text-[var(--text-muted)] shrink-0">{grade.overallPercentage}%</span>
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
              onClick={(e) => { e.stopPropagation(); handleMarkReviewed(s.id); }}
              className="px-2 py-1 text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-500/20 transition"
            >
              Mark Reviewed
            </button>
          )}
          <button
            onClick={() => navigate(`/resources/${s.assignmentId}`)}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
            aria-label={`View ${s.assignmentTitle}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const totalWithFeedback = unread.length + read.length + reviewed.length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5 text-amber-500" />
        Teacher Feedback
        {unread.length > 0 && (
          <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full">
            {unread.length} new
          </span>
        )}
      </h1>

      {totalWithFeedback === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No feedback yet — keep submitting work!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Unread feedback */}
          {unread.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-3">
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
              <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
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
                className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 hover:text-[var(--text-secondary)] transition"
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
  );
};

export default FeedbackPage;

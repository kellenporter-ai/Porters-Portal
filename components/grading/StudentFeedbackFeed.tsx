import { useEffect, useState, useCallback } from 'react';
import { X, MessageSquare, BookOpen } from 'lucide-react';
import { dataService } from '../../services/dataService';

interface StudentFeedbackFeedProps {
  studentName: string;
  studentUid: string;
  assignmentId: string;
  assignmentTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

interface FeedbackEntry {
  assignmentTitle: string;
  teacherFeedback: string;
  score: number;
  gradedAt: string;
  feedbackReadAt?: string;
  feedbackReviewedAt?: string;
}

const formatDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

const getReadStatus = (feedbackReadAt?: string, feedbackReviewedAt?: string): 'Unread' | 'Read' | 'Reviewed' => {
  if (feedbackReviewedAt) return 'Reviewed';
  if (feedbackReadAt) return 'Read';
  return 'Unread';
};

export const StudentFeedbackFeed: React.FC<StudentFeedbackFeedProps> = ({
  studentName,
  studentUid,
  assignmentId,
  assignmentTitle,
  isOpen,
  onClose,
}) => {
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load feedback history when isOpen becomes true and studentUid changes
  const loadFeedbackHistory = useCallback(async () => {
    if (!isOpen || !studentUid) {
      setFeedbackHistory([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const history = await dataService.getStudentFeedbackHistory(studentUid, assignmentId);
      setFeedbackHistory(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback history');
      setFeedbackHistory([]);
    } finally {
      setLoading(false);
    }
  }, [isOpen, studentUid]);

  useEffect(() => {
    loadFeedbackHistory();
  }, [isOpen, studentUid, loadFeedbackHistory]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="w-full lg:w-[380px] lg:min-w-[380px] border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col bg-[var(--panel-bg)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
          <div>
            <h5 className="text-xs font-bold text-[var(--text-primary)] truncate">{studentName}</h5>
            <p className="text-[10px] text-[var(--text-muted)] truncate">{assignmentTitle}</p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-1.5 rounded-lg hover:bg-[var(--surface-glass-heavy)] transition text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
          aria-label="Close feedback panel"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto custom-scrollbar flex-1 p-3">
        {/* Loading state */}
        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-[var(--surface-glass)] rounded-lg p-3 animate-pulse"
                role="status"
                aria-label="Loading feedback entry"
              >
                <div className="h-3.5 bg-[var(--surface-glass-heavy)] rounded mb-2" style={{ width: '80%' }} />
                <div className="h-2.5 bg-[var(--surface-glass-heavy)] rounded mb-1" style={{ width: '60%' }} />
                <div className="h-2.5 bg-[var(--surface-glass-heavy)] rounded" style={{ width: '70%' }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        ) : feedbackHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-12 h-12 text-[var(--text-muted)]/30 mb-3" aria-hidden="true" />
            <p className="text-sm font-bold text-[var(--text-muted)]">No feedback yet</p>
            <p className="text-xs text-[var(--text-muted)]/70 mt-1">
              Feedback will appear here when graded.
            </p>
          </div>
        ) : (
          <>
            {/* Feedback entries */}
            <div className="space-y-3">
              {feedbackHistory.map((entry, index) => {
                const readStatus = getReadStatus(entry.feedbackReadAt, entry.feedbackReviewedAt);
                const isUnread = readStatus === 'Unread';

                return (
                  <div
                    key={index}
                    className={`bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg p-3 transition ${
                      isUnread ? 'ring-2 ring-purple-500/20' : ''
                    }`}
                    role="article"
                    aria-label={`Feedback for ${entry.assignmentTitle}`}
                  >
                    {/* Assignment title */}
                    <h6 className="text-xs font-bold text-[var(--text-primary)] mb-2">
                      {entry.assignmentTitle}
                    </h6>

                    {/* Score */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {entry.score}%
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        graded {formatDate(entry.gradedAt)}
                      </span>
                    </div>

                    {/* Teacher feedback */}
                    <div className="mb-2.5">
                      <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                        {entry.teacherFeedback}
                      </p>
                    </div>

                    {/* Read status badge */}
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${
                        isUnread ? 'text-purple-400' : 'text-[var(--text-muted)]'
                      }`} aria-hidden="true" />
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        readStatus === 'Unread'
                          ? 'bg-purple-500/20 text-purple-300'
                          : readStatus === 'Read'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-green-500/20 text-green-300'
                      }`}>
                        {readStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer indicator */}
            <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span>{feedbackHistory.length} feedback entry{feedbackHistory.length !== 1 ? 'ies' : ''}</span>
              <span>Sorted: newest first</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentFeedbackFeed;

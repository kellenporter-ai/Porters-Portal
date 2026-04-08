import React, { Suspense, useState } from 'react';
import {
  BookOpen, Save, Undo2, ChevronRight, RefreshCw, Sparkles, Bot, X, Eye, Users, FileText,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import SnippetsPopover from './SnippetsPopover';
import StudentFeedbackFeed from './StudentFeedbackFeed';
import type { Submission, Assignment } from '../../types';
import type { StudentGroup } from './gradingHelpers';
import { calculateRubricPercentage } from '../../lib/rubricParser';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
import type { RubricSkillGrade } from '../../types';

const RubricViewer = lazyWithRetry(() => import('../RubricViewer'));

interface RubricGradingPanelProps {
  selectedGroup: StudentGroup | null;
  sub: Submission | null;
  selectedAssessment: Assignment | null;
  rubricDraft: Record<string, Record<string, RubricSkillGrade>>;
  feedbackDraft: string;
  isSavingRubric: boolean;
  viewingDraftUserId: string | null;
  draftUserIds: Set<string>;
  unifiedList: Array<{ type: string; group?: { userId: string; needsGrading: boolean } | null }>;
  gradingStudentId: string | null;
  onFeedbackChange: (v: string) => void;
  onGradeChange: (questionId: string, skillId: string, tierIndex: number) => void;
  onAcceptAllAI: () => void;
  onDismissAISuggestion: () => void;
  onSaveRubric: () => void;
  onReturnToStudent: () => void;
  onSelectStudent: (userId: string) => void;
}

const RubricGradingPanel: React.FC<RubricGradingPanelProps> = ({
  selectedGroup,
  sub,
  selectedAssessment,
  rubricDraft,
  feedbackDraft,
  isSavingRubric,
  viewingDraftUserId,
  draftUserIds,
  unifiedList,
  gradingStudentId,
  onFeedbackChange,
  onGradeChange,
  onAcceptAllAI,
  onDismissAISuggestion,
  onSaveRubric,
  onReturnToStudent,
  onSelectStudent,
}) => {
  const [isFeedbackHistoryOpen, setIsFeedbackHistoryOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [feedbackFeedOpen, setFeedbackFeedOpen] = useState(false);

  const formatDate = (dateString: string) => {
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

  const feedbackHistory = sub?.rubricGrade?.feedbackHistory;
  const hasFeedbackHistory = feedbackHistory && feedbackHistory.length > 0;
  const feedbackReadAt = sub?.feedbackReadAt;
  const feedbackReviewedAt = sub?.feedbackReviewedAt;
  const showReadReceipt = feedbackReadAt && !feedbackReviewedAt;
  const showReviewedReceipt = feedbackReviewedAt && !feedbackReadAt;
  const showBothReceipts = feedbackReadAt && feedbackReviewedAt;
  const readReceiptDate = showBothReceipts ? feedbackReadAt : feedbackReviewedAt || feedbackReadAt;
  const readReceiptText = showBothReceipts
    ? `Student read on ${formatDate(feedbackReadAt)} • reviewed on ${formatDate(feedbackReviewedAt)}`
    : `Student ${showReviewedReceipt ? 'reviewed' : 'read'} on ${formatDate(readReceiptDate || '')}`;
  // Draft/not-started right panel
  if (viewingDraftUserId && !selectedGroup) {
    const isNotStartedRight = !draftUserIds.has(viewingDraftUserId);
    return (
      <div className="w-full lg:w-[380px] lg:min-w-[380px] border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)]">
          <h5 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${isNotStartedRight ? 'text-orange-400' : 'text-cyan-400'}`}>
            {isNotStartedRight
              ? <><Users className="w-3.5 h-3.5" aria-hidden="true" /> Not Started</>
              : <><Eye className="w-3.5 h-3.5" aria-hidden="true" /> Draft Preview</>}
          </h5>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <FileText className={`w-12 h-12 mx-auto mb-3 ${isNotStartedRight ? 'text-orange-500/20' : 'text-cyan-500/20'}`} aria-hidden="true" />
            {isNotStartedRight ? (
              <>
                <p className="text-orange-400 text-sm font-bold mb-1">Not yet started</p>
                <p className="text-[var(--text-muted)] text-xs leading-relaxed max-w-[250px]">
                  This student hasn&apos;t opened the assessment. Use Nudge to send them a reminder.
                </p>
              </>
            ) : (
              <>
                <p className="text-cyan-400 text-sm font-bold mb-1">Draft &mdash; not yet submitted</p>
                <p className="text-[var(--text-muted)] text-xs leading-relaxed max-w-[250px]">
                  This student&apos;s work is still in progress. You can nudge them to submit, or submit on their behalf using the header buttons.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // No rubric or no student selected
  if (!selectedAssessment?.rubric || !selectedGroup || !sub) return null;

  const currentGrades = { ...(sub.rubricGrade?.grades || {}), ...rubricDraft };
  const rubricPct = calculateRubricPercentage(currentGrades, selectedAssessment.rubric);
  const isAlreadyGraded = !!sub.rubricGrade;
  const isReturnedAttempt = sub.status === 'RETURNED';

  // "Grade Next" logic
  type SubmittedEntry = { type: string; group?: { userId: string; needsGrading: boolean } | null };
  const submittedEntries = unifiedList.filter((e): e is SubmittedEntry => e.type === 'submitted' && !!e.group);
  const currentSubmittedIdx = submittedEntries.findIndex(e => e.group?.userId === gradingStudentId);
  const nextUngraded = submittedEntries.slice(currentSubmittedIdx + 1).find(e => e.group?.needsGrading)
    || submittedEntries.slice(0, currentSubmittedIdx).find(e => e.group?.needsGrading);

  return (
    <div className="w-full lg:w-[380px] lg:min-w-[380px] border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)]">
        <h5 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> Rubric Grading
          {isAlreadyGraded && (
            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full ml-1">Graded</span>
          )}
        </h5>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0 p-3">
        {/* AI flagged notice */}
        {sub.flaggedAsAI && (
          <div className="mb-3 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-400 shrink-0" aria-hidden="true" />
            <span className="text-[11px] text-purple-300">AI-flagged. Saving a grade will clear the flag.</span>
          </div>
        )}

        {/* AI suggested notice */}
        {sub.aiSuggestedGrade?.status === 'pending_review' && !sub.rubricGrade && (
          <div className="mb-3 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="text-[11px] font-bold text-amber-300">AI Suggested &mdash; Needs Review</span>
              <span className="text-[9px] text-amber-400/60 ml-auto">{sub.aiSuggestedGrade.model}</span>
            </div>
            <p className="text-[10px] text-amber-400/70 leading-relaxed">
              Suggested {sub.aiSuggestedGrade.overallPercentage}% by local LLM. Tiers are pre-filled below &mdash; review and adjust before saving.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={onDismissAISuggestion}
                className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-lg hover:bg-[var(--surface-glass-heavy)] transition"
                aria-label="Dismiss AI suggestion"
              >
                <X className="w-3 h-3" aria-hidden="true" /> Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Returned notice */}
        {isReturnedAttempt && (
          <div className="mx-3 mt-3 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
            <Undo2 className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span className="text-[11px] text-amber-300">This attempt was returned. Grades shown are from the prior review.</span>
          </div>
        )}

        {/* Rubric viewer */}
        <Suspense fallback={<div className="text-xs text-[var(--text-tertiary)]">Loading rubric...</div>}>
          <RubricViewer
            rubric={selectedAssessment.rubric}
            mode="grade"
            compact
            rubricGrade={{
              grades: currentGrades,
              overallPercentage: rubricPct,
              gradedAt: sub.rubricGrade?.gradedAt || '',
              gradedBy: sub.rubricGrade?.gradedBy || '',
            }}
            aiSuggestedGrade={sub.aiSuggestedGrade?.status === 'pending_review' && !sub.rubricGrade ? sub.aiSuggestedGrade : undefined}
            onGradeChange={isReturnedAttempt ? undefined : onGradeChange}
            onAcceptAllAI={sub.aiSuggestedGrade?.status === 'pending_review' && !sub.rubricGrade ? onAcceptAllAI : undefined}
          />
        </Suspense>
      </div>

      {/* Teacher feedback + save bar */}
      {!isReturnedAttempt && (
        <>
          <div className="px-4 py-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                Teacher Feedback
              </label>
              <div className="relative">
                <button
                  onClick={() => setSnippetsOpen(!snippetsOpen)}
                  className="flex items-center gap-1 text-[10px] font-medium text-purple-400 hover:text-purple-300 transition"
                  aria-label="Open feedback snippets"
                >
                  <FileText className="w-3 h-3" aria-hidden="true" />
                  Snippets
                </button>
                <SnippetsPopover
                  isOpen={snippetsOpen}
                  onClose={() => setSnippetsOpen(false)}
                  teacherUid="admin"
                  onInsert={(text) => {
                    onFeedbackChange(feedbackDraft + (feedbackDraft ? '\n' : '') + text);
                    setSnippetsOpen(false);
                  }}
                />
              </div>
            </div>
            <textarea
              value={feedbackDraft}
              onChange={e => onFeedbackChange(e.target.value)}
              placeholder="Optional feedback for the student..."
              rows={2}
              className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition resize-none"
            />

            {/* Feedback History Accordion */}
            {hasFeedbackHistory && (
              <div className="mt-2">
                <button
                  onClick={() => setIsFeedbackHistoryOpen(!isFeedbackHistoryOpen)}
                  className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 transition w-full"
                  aria-expanded={isFeedbackHistoryOpen}
                  aria-label={isFeedbackHistoryOpen ? 'Collapse previous feedback history' : 'Expand previous feedback history'}
                >
                  {isFeedbackHistoryOpen ? (
                    <ChevronUp className="w-3 h-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
                  )}
                  <span>Previous feedback ({feedbackHistory.length})</span>
                </button>

                {isFeedbackHistoryOpen && (
                  <div className="mt-1.5 space-y-2">
                    {feedbackHistory.map((entry, index) => (
                      <div
                        key={index}
                        className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg p-2.5"
                      >
                        <div className="text-xs text-[var(--text-primary)] leading-relaxed">
                          {entry.feedback}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                          <span>Graded by {entry.gradedBy}</span>
                          <span>{formatDate(entry.timestamp)}</span>
                        </div>
                        {index < feedbackHistory.length - 1 && (
                          <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]" aria-hidden="true" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Read Receipt Indicator */}
            {showReadReceipt || showReviewedReceipt || showBothReceipts ? (
              <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                {readReceiptText}
              </div>
            ) : null}

            {/* View all feedback for student */}
            {selectedGroup && (
              <button
                onClick={() => setFeedbackFeedOpen(true)}
                className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-purple-400 hover:text-purple-300 transition"
                aria-label={`View all feedback for ${selectedGroup.userName}`}
              >
                <BookOpen className="w-3 h-3" aria-hidden="true" />
                View all feedback for {selectedGroup.userName} on this assignment
              </button>
            )}
          </div>

          {/* Student Feedback Feed overlay */}
          {feedbackFeedOpen && selectedGroup && selectedAssessment && (
            <StudentFeedbackFeed
              isOpen={feedbackFeedOpen}
              onClose={() => setFeedbackFeedOpen(false)}
              studentName={selectedGroup.userName}
              studentUid={selectedGroup.userId}
              assignmentId={selectedAssessment.id}
              assignmentTitle={selectedAssessment.title}
            />
          )}

          <div className="border-t border-[var(--border)] p-3 bg-[var(--surface-glass)]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-[var(--text-tertiary)]">
                Rubric Score: <span className="font-bold text-[var(--text-primary)] text-sm">{rubricPct}%</span>
              </div>

              {/* Return to Student */}
              {sub.status !== 'RETURNED' && sub.status !== 'STARTED' && (
                <button
                  onClick={onReturnToStudent}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 px-3 py-2 rounded-lg transition"
                  aria-label={`Return assessment to ${selectedGroup.userName}`}
                >
                  <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Return to Student
                </button>
              )}

              {/* Save Grade */}
              <button
                onClick={onSaveRubric}
                disabled={isSavingRubric}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-50"
                aria-label={isAlreadyGraded ? 'Update grade' : 'Save grade'}
              >
                {isSavingRubric ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {isSavingRubric ? 'Saving...' : isAlreadyGraded ? 'Update Grade' : 'Save Grade'}
              </button>

              {/* Grade Next */}
              {nextUngraded?.group && (
                <button
                  onClick={() => onSelectStudent(nextUngraded.group!.userId)}
                  className="flex items-center gap-1.5 text-xs font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 px-3 py-2 rounded-lg transition"
                  aria-label="Grade next ungraded student"
                >
                  Grade Next <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {isAlreadyGraded && sub.rubricGrade && (
              <div className="text-xs text-[var(--text-muted)] mt-1.5">
                Last graded by {sub.rubricGrade.gradedBy} on {new Date(sub.rubricGrade.gradedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RubricGradingPanel;

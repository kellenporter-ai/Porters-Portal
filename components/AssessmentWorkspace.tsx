import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Assignment, Submission, LessonBlock, RUBRIC_TIER_COLORS, RubricTierLabel } from '../types';
import { X, RotateCcw, MessageSquare, FileText, Trophy, Check, XCircle, Clock, Shield, Send, LogOut, BookOpen } from 'lucide-react';
import { dataService } from '../services/dataService';

interface AssessmentWorkspaceProps {
  // Mode
  mode: 'taking' | 'results';

  // Assignment data
  activeAssignment: Assignment;

  // Results data (required in results mode, ignored in taking mode)
  assessmentResult?: {
    correct: number;
    total: number;
    percentage: number;
    perBlock: Record<string, { correct: boolean; answer: unknown; needsReview?: boolean }>;
    attemptNumber: number;
    status: string;
    xpEarned: number;
  } | null;

  // Submission data
  existingSubmission: Submission | null;

  // Config (results mode)
  showScore?: boolean;
  canRetake?: boolean;
  attemptsRemaining?: number | null;
  isUnlimited?: boolean;

  // State
  isRetaking?: boolean;

  // Children (taking mode — Proctor renders here)
  children?: React.ReactNode;

  // Taking mode props
  onScrollToBlock?: (blockId: string) => void;
  onSubmit?: () => void;
  blockResponses?: Record<string, unknown>;
  lessonBlocks?: LessonBlock[];

  // Callbacks
  onRetake?: () => void;
  onExit: () => void;
  onReviewWork?: () => void;
}

type SidebarSelection =
  | { type: 'skill'; questionId: string }
  | { type: 'feedback' }
  | { type: 'mywork' };

const AssessmentWorkspace: React.FC<AssessmentWorkspaceProps> = ({
  mode,
  activeAssignment,
  assessmentResult,
  existingSubmission,
  showScore,
  canRetake,
  attemptsRemaining,
  isUnlimited,
  isRetaking,
  children,
  onScrollToBlock: _onScrollToBlock,
  onSubmit,
  blockResponses: _blockResponses,
  lessonBlocks: _lessonBlocksProp,
  onRetake,
  onExit,
  onReviewWork,
}) => {
  // ---- Taking mode ----
  if (mode === 'taking') {
    const takingQuestions = activeAssignment.rubric?.questions ?? [];
    const [takingSelectedSkill, setTakingSelectedSkill] = useState<string | null>(null);

    const selectedTakingQuestion = takingQuestions.find((q) => q.id === takingSelectedSkill);

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface-base)]">
        {/* Top Bar */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--border)] bg-red-900/20 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-red-400 shrink-0" />
            <h1 className="text-base font-bold text-[var(--text-primary)] truncate">
              {activeAssignment.title}
            </h1>
          </div>

          <div className="flex items-center gap-3 ml-auto shrink-0">
            {/* Timer area — Proctor HUD provides its own timer in the content area */}
            <span className="text-[11px] bg-red-600/60 text-red-200 px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">
              Assessment in Progress
            </span>
          </div>
        </div>

        {/* Body: Sidebar + Content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar — rubric skills */}
          <div className="w-[200px] shrink-0 bg-[var(--surface-glass)] border-r border-[var(--border)] flex flex-col p-3 gap-1 overflow-y-auto">
            <p className="text-[11.5px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-1 px-1">
              Rubric
            </p>
            {takingQuestions.map((question) => (
              <button
                key={question.id}
                type="button"
                onClick={() => setTakingSelectedSkill(
                  takingSelectedSkill === question.id ? null : question.id
                )}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-[14px] transition-all border ${
                  takingSelectedSkill === question.id
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] hover:text-[var(--text-primary)] border-transparent'
                }`}
              >
                <div className="font-medium truncate">{question.questionLabel}</div>
              </button>
            ))}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Divider */}
            <div className="my-2 border-t border-[var(--border)]" />

            {/* Save & Exit */}
            <button
              type="button"
              onClick={onExit}
              className="w-full text-left px-3 py-2.5 rounded-lg text-[15px] text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2 border border-transparent"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              Save & Exit
            </button>

            {/* Submit */}
            <button
              type="button"
              onClick={() => onSubmit?.()}
              className="w-full text-left px-3 py-2.5 rounded-lg text-[15px] font-bold bg-green-600 hover:bg-green-500 text-white transition-all flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              Submit
            </button>
          </div>

          {/* Main Content — children (Proctor) */}
          <div className="flex-1 overflow-y-auto relative">
            {children}

            {/* Rubric overlay panel */}
            {selectedTakingQuestion && (
              <div
                className="absolute inset-0 z-10 flex"
                onClick={() => setTakingSelectedSkill(null)}
              >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/50" />

                {/* Panel */}
                <div
                  className="relative z-20 w-full max-w-2xl mx-auto my-6 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl overflow-y-auto shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Panel header */}
                  <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--surface-base)]">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-purple-400 shrink-0" />
                      <h2 className="text-base font-bold text-[var(--text-primary)]">
                        {selectedTakingQuestion.questionLabel}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTakingSelectedSkill(null)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface-glass)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-medium transition-all flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Back to Assessment
                    </button>
                  </div>

                  {/* Rubric tiers */}
                  <div className="p-5 space-y-5">
                    {selectedTakingQuestion.skills.map((skill) => (
                      <div key={skill.id} className="space-y-2">
                        <p className="text-sm text-[var(--text-secondary)] italic leading-relaxed">
                          {skill.skillText}
                        </p>

                        <div className="space-y-1.5">
                          {skill.tiers.map((tier) => {
                            const tierLabel = tier.label as RubricTierLabel;
                            const colors = RUBRIC_TIER_COLORS[tierLabel];

                            if (!colors) {
                              return (
                                <div key={tier.label} className="rounded-lg px-4 py-3 border border-[var(--border)] text-[15px] text-[var(--text-secondary)] leading-relaxed">
                                  <span className="font-bold text-[var(--text-tertiary)]">
                                    {tier.label} ({tier.percentage}%):
                                  </span>{' '}
                                  {tier.descriptor}
                                </div>
                              );
                            }

                            return (
                              <div
                                key={tier.label}
                                className={`rounded-lg px-4 py-3 border text-[15px] leading-relaxed ${colors.bg} ${colors.border}`}
                              >
                                <span className={`font-bold ${colors.text}`}>
                                  {tier.label} ({tier.percentage}%):
                                </span>{' '}
                                <span className="text-[var(--text-secondary)]">{tier.descriptor}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Results mode ----
  const rubric = activeAssignment.rubric;
  const questions = rubric?.questions ?? [];
  const rubricGrade = existingSubmission?.rubricGrade;
  const hasFeedback = !!rubricGrade?.teacherFeedback;
  const hasBlockResponses =
    existingSubmission?.blockResponses &&
    Object.keys(existingSubmission.blockResponses).length > 0;

  // Default selection: first rubric question, or feedback, or mywork
  const defaultSelection: SidebarSelection = questions.length > 0
    ? { type: 'skill', questionId: questions[0].id }
    : hasFeedback
      ? { type: 'feedback' }
      : { type: 'mywork' };

  const [selected, setSelected] = useState<SidebarSelection>(defaultSelection);

  // Grade color
  const gradeColor =
    (assessmentResult?.percentage ?? 0) >= 80
      ? 'text-green-400'
      : (assessmentResult?.percentage ?? 0) >= 60
        ? 'text-yellow-400'
        : 'text-red-400';

  // Helper: get the tier label for a question (lowest selected tier across skills)
  const getQuestionTierLabel = (questionId: string): RubricTierLabel | null => {
    if (!rubricGrade?.grades?.[questionId]) return null;
    const question = questions.find((q) => q.id === questionId);
    if (!question) return null;

    const selectedTiers = question.skills
      .map((s) => rubricGrade.grades[questionId]?.[s.id]?.selectedTier)
      .filter((t): t is number => t !== null);

    if (selectedTiers.length === 0) return null;
    const representative = Math.min(...selectedTiers);
    return question.skills[0]?.tiers[representative]?.label ?? null;
  };

  const isSelected = (sel: SidebarSelection) => {
    if (sel.type !== selected.type) return false;
    if (sel.type === 'skill' && selected.type === 'skill') {
      return sel.questionId === selected.questionId;
    }
    return true;
  };

  const sidebarButtonClass = (sel: SidebarSelection) =>
    `w-full text-left px-3 py-2.5 rounded-lg text-[15px] transition-all ${
      isSelected(sel)
        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-glass)] hover:text-[var(--text-primary)] border border-transparent'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface-base)]">
      {/* Top Bar */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--border)] bg-[var(--panel-bg)] shrink-0">
        <h1 className="text-base font-bold text-[var(--text-primary)] truncate">
          {activeAssignment.title}
        </h1>

        <div className="flex items-center gap-4 ml-auto shrink-0">
          {showScore && assessmentResult && (
            <span className={`text-base font-bold ${gradeColor}`}>
              {Math.round(assessmentResult.percentage)}%
            </span>
          )}
          {assessmentResult && (
            <span className="text-sm text-[var(--text-muted)]">
              Attempt {assessmentResult.attemptNumber}
            </span>
          )}
          {assessmentResult && assessmentResult.xpEarned > 0 && (
            <span className="flex items-center gap-1 text-sm text-amber-400 font-semibold">
              <Trophy className="w-3.5 h-3.5" />
              {assessmentResult.xpEarned} XP
            </span>
          )}
        </div>
      </div>

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-[200px] shrink-0 bg-[var(--surface-glass)] border-r border-[var(--border)] flex flex-col p-3 gap-1 overflow-y-auto">
          {/* Skill buttons */}
          {questions.map((question) => {
            const tierLabel = getQuestionTierLabel(question.id);
            const tierColors = tierLabel ? RUBRIC_TIER_COLORS[tierLabel] : null;

            return (
              <button
                key={question.id}
                type="button"
                onClick={() => setSelected({ type: 'skill', questionId: question.id })}
                className={sidebarButtonClass({ type: 'skill', questionId: question.id })}
              >
                <div className="font-medium truncate">{question.questionLabel}</div>
                {tierLabel && tierColors && (
                  <span
                    className={`inline-block mt-1 text-xs font-bold px-1.5 py-0.5 rounded ${tierColors.bg} ${tierColors.text}`}
                  >
                    {tierLabel}
                  </span>
                )}
              </button>
            );
          })}

          {/* Divider */}
          {questions.length > 0 && (hasFeedback || hasBlockResponses) && (
            <div className="my-2 border-t border-[var(--border)]" />
          )}

          {/* Teacher Feedback */}
          {hasFeedback && (
            <button
              type="button"
              onClick={() => setSelected({ type: 'feedback' })}
              className={sidebarButtonClass({ type: 'feedback' })}
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                Teacher Feedback
              </span>
            </button>
          )}

          {/* My Work */}
          {hasBlockResponses && (
            <button
              type="button"
              onClick={() => setSelected({ type: 'mywork' })}
              className={sidebarButtonClass({ type: 'mywork' })}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                My Work
              </span>
            </button>
          )}

          {/* Divider */}
          <div className="my-2 border-t border-[var(--border)]" />

          {/* Retake */}
          {canRetake && onRetake && (
            <button
              type="button"
              onClick={onRetake}
              className="w-full text-left px-3 py-2.5 rounded-lg text-[15px] text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-300 transition-all flex items-center gap-2 border border-transparent"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              Retake
              {attemptsRemaining !== null && !isUnlimited && (
                <span className="text-xs text-[var(--text-muted)] ml-auto">
                  {attemptsRemaining} left
                </span>
              )}
              {isUnlimited && (
                <span className="text-xs text-[var(--text-muted)] ml-auto">∞</span>
              )}
            </button>
          )}

          {/* Exit */}
          <button
            type="button"
            onClick={onExit}
            className="w-full text-left px-3 py-2.5 rounded-lg text-[15px] text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-400 transition-all flex items-center gap-2 border border-transparent"
          >
            <X className="w-3.5 h-3.5 shrink-0" />
            Exit
          </button>

          {/* Spacer to push content up */}
          <div className="flex-1" />
        </div>

        {/* Dynamic Content Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selected.type === 'skill' && <SkillPanel questionId={selected.questionId} questions={questions} rubricGrade={rubricGrade ?? null} />}
          {selected.type === 'feedback' && <FeedbackPanel rubricGrade={rubricGrade ?? null} />}
          {selected.type === 'mywork' && assessmentResult && onReviewWork && (
            <MyWorkPanel
              existingSubmission={existingSubmission}
              lessonBlocks={activeAssignment.lessonBlocks ?? []}
              assessmentResult={assessmentResult}
              isRetaking={isRetaking}
              onReviewWork={onReviewWork}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Skill Panel ----------

const SkillPanel: React.FC<{
  questionId: string;
  questions: Array<{ id: string; questionLabel: string; skills: Array<{ id: string; skillText: string; tiers: Array<{ label: string; percentage: number; descriptor: string }> }> }>;
  rubricGrade: Submission['rubricGrade'] | null;
}> = ({ questionId, questions, rubricGrade }) => {
  const question = questions.find((q) => q.id === questionId);
  if (!question) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">
        {question.questionLabel}
      </h2>

      {question.skills.map((skill) => {
        const selectedTier = rubricGrade?.grades?.[questionId]?.[skill.id]?.selectedTier ?? null;

        return (
          <div key={skill.id} className="space-y-2">
            <p className="text-sm text-[var(--text-secondary)] italic leading-relaxed">
              {skill.skillText}
            </p>

            <div className="space-y-1.5">
              {skill.tiers.map((tier, tierIdx) => {
                const tierLabel = tier.label as RubricTierLabel;
                const colors = RUBRIC_TIER_COLORS[tierLabel];
                const isGradedTier = selectedTier === tierIdx;

                if (!colors) {
                  // Fallback for unknown tier labels
                  return (
                    <div key={tier.label} className="rounded-lg px-4 py-3 border border-[var(--border)] text-[15px] text-[var(--text-secondary)] leading-relaxed">
                      <span className="font-bold text-[var(--text-tertiary)]">
                        {tier.label} ({tier.percentage}%):
                      </span>{' '}
                      {tier.descriptor}
                    </div>
                  );
                }

                return (
                  <div
                    key={tier.label}
                    className={`rounded-lg px-4 py-3 border text-[15px] leading-relaxed transition-all ${
                      isGradedTier
                        ? `${colors.bg} ${colors.border} ${colors.text} ring-2 ring-[var(--border)]`
                        : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <span
                      className={`font-bold ${isGradedTier ? colors.text : 'text-[var(--text-tertiary)]'}`}
                    >
                      {tier.label} ({tier.percentage}%):
                    </span>{' '}
                    {tier.descriptor}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------- Feedback Panel ----------

const FeedbackPanel: React.FC<{ rubricGrade: Submission['rubricGrade'] | null }> = ({
  rubricGrade,
}) => {
  if (!rubricGrade?.teacherFeedback) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Teacher Feedback</h2>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] p-5">
        <p className="text-base text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
          {rubricGrade.teacherFeedback}
        </p>
      </div>

      <div className="flex items-center gap-3 text-[13px] text-[var(--text-muted)]">
        {rubricGrade.gradedBy && <span>Graded by {rubricGrade.gradedBy}</span>}
        {rubricGrade.gradedAt && (
          <span>
            {new Date(rubricGrade.gradedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )}
      </div>

      {/* Feedback history */}
      {rubricGrade.feedbackHistory && rubricGrade.feedbackHistory.length > 1 && (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Previous Feedback
          </h3>
          {rubricGrade.feedbackHistory.slice(1).map((entry, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-glass)] p-4"
            >
              <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {entry.feedback}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                <span>{entry.gradedBy}</span>
                <span>
                  {new Date(entry.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------- My Work Panel ----------

interface MyWorkPanelProps {
  existingSubmission: Submission | null;
  lessonBlocks: LessonBlock[];
  assessmentResult: NonNullable<AssessmentWorkspaceProps['assessmentResult']>;
  isRetaking?: boolean;
  onReviewWork: () => void;
}

/** Which block types are interactive (have student responses). */
const INTERACTIVE_BLOCK_TYPES = new Set([
  'MC', 'SHORT_ANSWER', 'FILL_IN', 'CHECKLIST', 'SORTING', 'RANKING',
  'DATA_TABLE', 'BAR_CHART', 'DRAWING', 'MATH_RESPONSE',
]);

const MyWorkPanel: React.FC<MyWorkPanelProps> = ({
  existingSubmission,
  lessonBlocks,
  assessmentResult,
  isRetaking,
  onReviewWork,
}) => {
  const blockResponses = existingSubmission?.blockResponses;
  const submissionId = existingSubmission?.id;

  // Notes state
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedIndicators, setSavedIndicators] = useState<Record<string, boolean>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const notesInitialized = useRef(false);

  // Load existing notes ONCE on mount (or when submissionId changes)
  useEffect(() => {
    notesInitialized.current = false;
    if (!submissionId) return;
    if (existingSubmission?.studentNotes) {
      setNotes(existingSubmission.studentNotes);
      notesInitialized.current = true;
    } else {
      dataService.getStudentNotes(submissionId).then((fetched) => {
        // Only populate if we haven't already started editing
        if (!notesInitialized.current) {
          setNotes(fetched);
          notesInitialized.current = true;
        }
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  const saveNote = useCallback(
    (blockId: string, value: string) => {
      if (!submissionId) return;
      dataService
        .saveStudentNote(submissionId, blockId, value)
        .then(() => {
          setSavedIndicators((prev) => ({ ...prev, [blockId]: true }));
          setTimeout(() => setSavedIndicators((prev) => ({ ...prev, [blockId]: false })), 1500);
        })
        .catch(() => {});
    },
    [submissionId],
  );

  const handleNoteChange = useCallback(
    (blockId: string, value: string) => {
      setNotes((prev) => ({ ...prev, [blockId]: value }));
      // Debounce save
      if (debounceTimers.current[blockId]) clearTimeout(debounceTimers.current[blockId]);
      debounceTimers.current[blockId] = setTimeout(() => saveNote(blockId, value), 1000);
    },
    [saveNote],
  );

  const handleNoteBlur = useCallback(
    (blockId: string) => {
      // Flush any pending debounce and save immediately
      if (debounceTimers.current[blockId]) {
        clearTimeout(debounceTimers.current[blockId]);
        delete debounceTimers.current[blockId];
      }
      if (notes[blockId] !== undefined) {
        saveNote(blockId, notes[blockId]);
      }
    },
    [notes, saveNote],
  );

  if (!blockResponses || Object.keys(blockResponses).length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">My Work</h2>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] p-8 text-center">
          <p className="text-base text-[var(--text-muted)]">No responses submitted yet.</p>
        </div>
      </div>
    );
  }

  // Build ordered list of interactive blocks that have responses
  const interactiveBlocks = lessonBlocks.filter(
    (b) => INTERACTIVE_BLOCK_TYPES.has(b.type) && blockResponses[b.id] !== undefined,
  );

  // Fallback: if lessonBlocks don't cover all response keys, include orphans at the end
  const coveredIds = new Set(interactiveBlocks.map((b) => b.id));
  const orphanIds = Object.keys(blockResponses).filter((id) => !coveredIds.has(id));

  const formatResponse = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map((v) => formatResponse(v)).join(', ');
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('answer' in obj) return formatResponse(obj.answer);
      if ('value' in obj) return formatResponse(obj.value);
      if ('text' in obj) return formatResponse(obj.text);
      try {
        return JSON.stringify(obj, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const renderStatusBadge = (blockId: string) => {
    const perBlock = assessmentResult.perBlock[blockId];
    if (!perBlock) return null;

    if (perBlock.needsReview) {
      return (
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
          <Clock className="w-3 h-3" /> Pending Review
        </span>
      );
    }
    if (perBlock.correct) {
      return (
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">
          <Check className="w-3 h-3" /> Correct
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">
        <XCircle className="w-3 h-3" /> Incorrect
      </span>
    );
  };

  const renderNoteSection = (blockId: string) => {
    if (!submissionId) return null;
    const noteValue = notes[blockId] ?? '';

    // During retake: show read-only notes (skip if empty)
    if (isRetaking) {
      if (!noteValue) return null;
      return (
        <div className="mt-3 rounded-lg bg-[var(--surface-glass)] p-3 select-none" style={{ pointerEvents: 'none' }}>
          <p className="text-[13px] font-medium text-[var(--text-muted)] mb-1">Study Notes</p>
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{noteValue}</p>
        </div>
      );
    }

    // Normal: editable textarea
    return (
      <div className="mt-3 relative">
        <textarea
          value={noteValue}
          onChange={(e) => handleNoteChange(blockId, e.target.value)}
          onBlur={() => handleNoteBlur(blockId)}
          placeholder="Add study notes..."
          rows={2}
          className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-glass)] p-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-purple-500/40 resize-y"
        />
        {savedIndicators[blockId] && (
          <span className="absolute top-2 right-2 text-xs text-green-400 font-medium animate-pulse">
            Saved
          </span>
        )}
      </div>
    );
  };

  const renderCard = (blockId: string, label: string, questionText: string | null) => {
    const response = blockResponses[blockId];
    return (
      <div key={blockId} className="rounded-xl border border-[var(--border)] bg-[var(--panel-bg)] p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{label}</h3>
          {renderStatusBadge(blockId)}
        </div>

        {questionText && (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{questionText}</p>
        )}

        <div className="rounded-lg bg-[var(--surface-glass)] px-3 py-2">
          <p className="text-[15px] text-[var(--text-primary)] whitespace-pre-wrap break-words">
            {formatResponse(response)}
          </p>
        </div>

        {renderNoteSection(blockId)}
      </div>
    );
  };

  let questionIndex = 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">My Work</h2>
        <button
          type="button"
          onClick={onReviewWork}
          className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-sm font-medium hover:bg-purple-500/30 transition-all"
        >
          Full Review
        </button>
      </div>

      {interactiveBlocks.map((block) => {
        questionIndex++;
        const label = block.title || `Question ${questionIndex}`;
        const questionText = block.content || null;
        return renderCard(block.id, label, questionText);
      })}

      {orphanIds.map((id) => {
        questionIndex++;
        return renderCard(id, `Question ${questionIndex}`, null);
      })}
    </div>
  );
};

export default AssessmentWorkspace;

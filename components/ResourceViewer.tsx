import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, UserRole, TelemetryMetrics, Submission } from '../types';
import { useAssignments } from '../lib/AppDataContext';
import { useChat } from '../lib/ChatContext';
import { dataService } from '../services/dataService';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, limit, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from './ToastProvider';
import { reportError } from '../lib/errorReporting';
import { draftKey, clearDraft, WriteStatus } from '../lib/persistentWrite';
import { ArrowLeft, Brain, BookOpen as BookOpenIcon, Settings as SettingsIcon, Users, Loader2, Shield, Send, RotateCcw, CheckCircle2, XCircle, AlertTriangle, X, BookOpen, Clock, Bot, Home, Eye, LogOut } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { BlockResponseMap } from './LessonBlocks';
import { sfx } from '../lib/sfx';
import { useTheme } from '../lib/ThemeContext';
import { lazyWithRetry } from '../lib/lazyWithRetry';

const Proctor = lazyWithRetry(() => import('./Proctor'));
const ReviewQuestions = lazyWithRetry(() => import('./ReviewQuestions'));
const RubricViewer = lazyWithRetry(() => import('./RubricViewer'));
const StudyMaterial = lazyWithRetry(() => import('./StudyMaterial'));
const LessonBlocks = lazyWithRetry(() => import('./LessonBlocks').then(m => ({ default: m.default })));

const LazyFallback = () => (
  <div className="flex items-center justify-center h-64 text-[var(--text-muted)]">
    <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading module...
  </div>
);

interface ResourceViewerProps {
  user: User;
}

const ResourceViewer: React.FC<ResourceViewerProps> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { assignments, loading: appDataLoading } = useAssignments();
  const { setIsCommOpen } = useChat();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const toast = useToast();
  const { confirm } = useConfirm();

  const [assignViewMode, setAssignViewMode] = useState<'WORK' | 'REVIEW' | 'STUDY'>('WORK');
  const [adminViewMode, setAdminViewMode] = useState<'STUDENT' | 'ADMIN'>('STUDENT');
  const [hasQuestionBank, setHasQuestionBank] = useState(false);
  const [hasStudyMaterial, setHasStudyMaterial] = useState(false);
  const [liveCount, setLiveCount] = useState(0);

  // Block progress for header progress bar (0–1) and sticky banner counts
  const [, setBlockProgress] = useState(0);
  const [answeredBlocks, setAnsweredBlocks] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);

  // Save & Exit state
  const [isSavingExit, setIsSavingExit] = useState(false);
  const [showSaveFailedModal, setShowSaveFailedModal] = useState(false);
  const flushRef = useRef<(() => Promise<WriteStatus> | undefined) | null>(null);

  // Assessment state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(() => {
    return id ? sessionStorage.getItem(`submit_failed_${id}`) === '1' : false;
  });
  const [assessmentResult, setAssessmentResult] = useState<{
    correct: number;
    total: number;
    percentage: number;
    perBlock: Record<string, { correct: boolean; answer: unknown; needsReview?: boolean }>;
    attemptNumber: number;
    status: string;
    xpEarned: number;
  } | null>(null);
  const [showBlockerModal, setShowBlockerModal] = useState(false);
  const [showRubric, setShowRubric] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState<Submission | null>(null);
  const [reviewMode, setReviewMode] = useState(false);

  // Ref for getting Proctor metrics + responses on demand
  const getMetricsAndResponsesRef = useRef<(() => { metrics: TelemetryMetrics; responses: BlockResponseMap }) | null>(null);
  // Session token for assessment security (issued by startAssessmentSession Cloud Function)
  const sessionTokenRef = useRef<string | null>(null);
  // Suppress auto-recovery during retake flow (so clearing assessmentResult doesn't instantly re-populate)
  const isRetakingRef = useRef(false);

  const activeAssignment = assignments.find(a => a.id === id) || null;
  const isPreview = user.role === UserRole.ADMIN;
  const isAssessment = activeAssignment?.isAssessment === true;
  const isLiveAssessment = isAssessment && !isPreview;
  const config = activeAssignment?.assessmentConfig || { allowResubmission: true, maxAttempts: 0, showScoreOnSubmit: true, lockNavigation: true };

  // Fetch student's existing submission for rubric grade display
  useEffect(() => {
    if (!id || isPreview || !activeAssignment?.isAssessment) return;
    const q = query(
      collection(db, 'submissions'),
      where('userId', '==', user.id),
      where('assignmentId', '==', id),
      where('isAssessment', '==', true),
      orderBy('submittedAt', 'desc'),
      limit(1)
    );
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setExistingSubmission({ id: snap.docs[0].id, ...data } as Submission);
      } else {
        setExistingSubmission(null);
      }
    }, err => reportError(err, { context: 'fetch student assessment submission' }));
    return () => unsub();
  }, [id, user.id, user.role, activeAssignment?.isAssessment]);

  // Auto-recover: if server has a submission but client never showed the score modal
  // (handles network errors during submit response, page refresh after submit, etc.)
  useEffect(() => {
    if (existingSubmission && existingSubmission.status !== 'RETURNED' && !assessmentResult && isLiveAssessment && !isRetakingRef.current) {
      setAssessmentResult({
        correct: existingSubmission.assessmentScore?.correct ?? 0,
        total: existingSubmission.assessmentScore?.total ?? 0,
        percentage: existingSubmission.assessmentScore?.percentage ?? 0,
        perBlock: existingSubmission.assessmentScore?.perBlock ?? {},
        attemptNumber: existingSubmission.attemptNumber ?? 1,
        status: existingSubmission.status ?? 'NORMAL',
        xpEarned: 0,
      });
      // Clear submit-failed flag since auto-recovery succeeded
      if (id) sessionStorage.removeItem(`submit_failed_${id}`);
      setSubmitFailed(false);
    }
  }, [existingSubmission, assessmentResult, isLiveAssessment]);

  // Probe supplemental tabs
  // Play lesson-open sound when resource loads
  useEffect(() => {
    if (id && activeAssignment) sfx.lessonOpen();
  }, [id, activeAssignment]);

  useEffect(() => {
    setHasQuestionBank(false);
    setHasStudyMaterial(false);
    if (!id) return;
    let cancelled = false;
    getDoc(doc(db, 'question_banks', id)).then(snap => {
      if (!cancelled && snap.exists() && (snap.data().questions || []).length > 0) setHasQuestionBank(true);
    }).catch(err => {
      if (!cancelled) reportError(err, { context: 'probe question bank', assignmentId: id });
    });
    getDoc(doc(db, 'reading_materials', id)).then(snap => {
      if (!cancelled && snap.exists()) setHasStudyMaterial(true);
    }).catch(err => {
      if (!cancelled) reportError(err, { context: 'probe reading materials', assignmentId: id });
    });
    return () => { cancelled = true; };
  }, [id, toast]);

  // Admin: subscribe to submissions for engagement count (scoped to this assignment)
  useEffect(() => {
    if (user.role !== UserRole.ADMIN || !id) return;
    const unsub = dataService.subscribeToSubmissions((subs: Submission[]) => {
      setLiveCount(subs.filter(s => s.assignmentId === id && !s.isArchived).length);
    });
    return () => unsub();
  }, [user.role, id]);

  // Engagement tracking
  const activeAssignmentRef = useRef(activeAssignment);
  const userRef = useRef(user);
  useEffect(() => { activeAssignmentRef.current = activeAssignment; }, [activeAssignment]);
  useEffect(() => { userRef.current = user; }, [user]);

  const handleEngagementComplete = useCallback(async (metrics: TelemetryMetrics) => {
    const u = userRef.current;
    const a = activeAssignmentRef.current;
    if (!u || !a || u.role === UserRole.ADMIN) return;
    // Don't auto-submit engagement for assessments — they use the dedicated submit flow
    if (a.isAssessment) return;
    if (metrics.engagementTime < 10) return;
    try {
      await dataService.submitEngagement(u.id, u.name, a.id, a.title, metrics, a.classType);
    } catch (err) {
      reportError(err, { method: 'submitEngagement', assignmentId: a.id });
    }
  }, []);

  // Assessment submission handler
  // Minimum engagement time (seconds) before assessment submission is allowed.
  // Prevents instant-submit exploits. Server also validates independently.
  const MIN_ASSESSMENT_ENGAGEMENT_SEC = 30;

  const handleAssessmentSubmit = useCallback(async () => {
    if (!activeAssignment || !getMetricsAndResponsesRef.current) return;
    isRetakingRef.current = false; // Allow recovery effect if this submission errors
    const { metrics, responses } = getMetricsAndResponsesRef.current();

    // Client-side guard: require minimum engagement time
    if (metrics.engagementTime < MIN_ASSESSMENT_ENGAGEMENT_SEC) {
      toast.error(`Please spend at least ${MIN_ASSESSMENT_ENGAGEMENT_SEC} seconds reviewing the assessment before submitting.`);
      return;
    }

    setIsSubmitting(true);
    const MAX_SUBMIT_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_SUBMIT_RETRIES; attempt++) {
      try {
        const result = await dataService.submitAssessment(
          user.name,
          activeAssignment.id,
          responses,
          metrics,
          activeAssignment.classType,
          sessionTokenRef.current || undefined
        );
        setAssessmentResult({
          correct: result.assessmentScore.correct,
          total: result.assessmentScore.total,
          percentage: result.assessmentScore.percentage,
          perBlock: result.assessmentScore.perBlock,
          attemptNumber: result.attemptNumber,
          status: result.status,
          xpEarned: result.xpEarned,
        });
        // Clear cached session token so retakes get a fresh one
        if (activeAssignment.id) {
          const key = `assessment_session_${activeAssignment.id}`;
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
          sessionTokenRef.current = null;
          // Clear localStorage draft — work is safely submitted (use user.id to match hook's key)
          clearDraft(draftKey('draft', user.id, activeAssignment.id));
          // Also clear Firestore draft (belt-and-suspenders — server also deletes on submit)
          try {
            const draftDocId = `${user.id}_${activeAssignment.id}_blocks`;
            deleteDoc(doc(db, 'lesson_block_responses', draftDocId)).catch(() => {});
          } catch { /* ignore */ }
        }
        toast.success(`Assessment submitted! Score: ${result.assessmentScore.percentage}%`);
        setIsSubmitting(false);
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('already-exists')) {
          toast.success('Your assessment was already submitted successfully!');
          setSubmitFailed(true); if (id) sessionStorage.setItem(`submit_failed_${id}`, '1');
          setIsSubmitting(false);
          return;
        }
        if (attempt < MAX_SUBMIT_RETRIES) {
          toast.info('Submission taking longer than expected. Retrying...');
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        reportError(err, { method: 'submitAssessment', assignmentId: activeAssignment.id });

        // Parse failed-precondition errors for hasUnsavedWork hint
        let toastMsg = 'Something went wrong submitting. Your work is saved — check with your teacher if your submission went through.';
        if (errMsg.includes('failed-precondition')) {
          try {
            const parsed = JSON.parse(errMsg.replace(/^.*?(\{)/, '$1'));
            if (parsed.hasUnsavedWork) {
              toastMsg = 'Session expired, but your draft is saved. Start a new attempt to continue where you left off.';
            } else {
              toastMsg = 'Session expired. Please start a new assessment attempt.';
            }
          } catch {
            // Couldn't parse — use default message
          }
        }
        toast.error(toastMsg);
        setSubmitFailed(true); if (id) sessionStorage.setItem(`submit_failed_${id}`, '1');
      }
    }
    setIsSubmitting(false);
  }, [activeAssignment, user.name, toast]);

  // Assessment retake handler — confirm, then clear saved working responses so Proctor starts fresh
  // Uses setDoc (not deleteDoc) because students only have create/update permission
  const handleRetake = useCallback(async () => {
    if (!activeAssignment) return;
    const cfg = activeAssignment.assessmentConfig || {};
    const isUnlim = cfg.maxAttempts === 0 || !cfg.maxAttempts;
    const attLeft = isUnlim ? null : (cfg.maxAttempts! - (assessmentResult?.attemptNumber || 1));
    const afterThis = attLeft != null ? attLeft - 1 : null;
    const confirmed = await confirm({
      title: 'Retake Assessment',
      message: `Your previous answers will be loaded so you can review and edit them before resubmitting.${afterThis != null ? (afterThis === 0 ? ' This will be your last attempt.' : ` You will have ${afterThis} attempt${afterThis !== 1 ? 's' : ''} remaining after this.`) : ''} Are you sure you want to retake?`,
      confirmLabel: 'Start Retake',
      cancelLabel: 'Go Back',
      variant: 'info',
    });
    if (!confirmed) return;
    isRetakingRef.current = true; // Suppress recovery effect while retaking
    const docId = `${user.id}_${activeAssignment.id}_blocks`;
    try {
      await setDoc(doc(db, 'lesson_block_responses', docId), {
        userId: user.id,
        assignmentId: activeAssignment.id,
        responses: existingSubmission?.blockResponses ?? {},
        lastUpdated: new Date().toISOString(),
        retakePreFilled: true,
      });
    } catch { /* ignore if doc doesn't exist yet */ }
    // Clear cached session token so retake gets a fresh one
    const retakeKey = `assessment_session_${activeAssignment.id}`;
    localStorage.removeItem(retakeKey);
    sessionStorage.removeItem(retakeKey);
    sessionTokenRef.current = null;
    setAssessmentResult(null);
  }, [activeAssignment, user.id, assessmentResult, confirm]);

  const handleExit = () => {
    if (id) sessionStorage.removeItem(`submit_failed_${id}`);
    setAssignViewMode('WORK');
    // Admin preview opens in a new tab — close it to return to the editor
    if (isPreview && window.opener) {
      window.close();
      return;
    }
    // The navigation guard pushed an extra history entry; skip past it
    if (guardHistoryPushedRef.current) {
      guardHistoryPushedRef.current = false;
      navigate(-2);
    } else {
      navigate(-1);
    }
  };

  const handleSaveAndExit = async () => {
    setIsSavingExit(true);
    blockerProceedRef.current = true;
    try {
      const flushPromise = flushRef.current?.();
      const timeoutPromise = new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), 3000));
      const result = await Promise.race([flushPromise ?? Promise.resolve('timeout'), timeoutPromise]);
      if (result === 'saved') {
        setIsSavingExit(false);
        handleExit();
      } else {
        setIsSavingExit(false);
        blockerProceedRef.current = false;
        setShowSaveFailedModal(true);
      }
    } catch {
      setIsSavingExit(false);
      blockerProceedRef.current = false;
      setShowSaveFailedModal(true);
    }
  };

  // Navigation guard for assessments — prevent leaving during active assessment
  // Uses popstate + history.pushState since useBlocker requires a data router
  const blockerProceedRef = useRef(false);
  const guardHistoryPushedRef = useRef(false);

  useEffect(() => {
    if (!isLiveAssessment || assessmentResult || submitFailed) return;

    // Push a duplicate state so back button can be intercepted
    window.history.pushState(null, '', window.location.href);
    guardHistoryPushedRef.current = true;

    const handlePopState = () => {
      if (blockerProceedRef.current) return;
      // Re-push state to prevent navigation, then show modal
      window.history.pushState(null, '', window.location.href);
      setShowBlockerModal(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (guardHistoryPushedRef.current) {
        window.history.go(-1);
        guardHistoryPushedRef.current = false;
      }
    };
  }, [isLiveAssessment, assessmentResult, submitFailed]);

  if (!activeAssignment) {
    // Still loading app data — show skeleton instead of "not found"
    if (appDataLoading) {
      return <div className="flex items-center justify-center h-64 text-[var(--text-muted)]"><p>Loading...</p></div>;
    }
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-muted)]">
        <p>Resource not found.</p>
        <button onClick={() => navigate(-1)} className="ml-4 text-[var(--accent-text)] hover:text-purple-300">Go back</button>
      </div>
    );
  }

  // Review mode — read-only view of submitted answers
  if (reviewMode && existingSubmission?.blockResponses && activeAssignment?.lessonBlocks) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--surface-base)] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--panel-bg)] shrink-0">
          <button
            onClick={() => setReviewMode(false)}
            className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Results
          </button>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Your Submission</h2>
          <span className="text-[10px] text-[var(--text-muted)]">
            {existingSubmission.submittedAt
              ? new Date(existingSubmission.submittedAt).toLocaleDateString()
              : ''}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <Suspense fallback={<LazyFallback />}>
            <LessonBlocks
              blocks={activeAssignment.lessonBlocks}
              savedResponses={existingSubmission.blockResponses as BlockResponseMap}
              readOnly={true}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // Assessment score results modal
  if (assessmentResult) {
    const canRetake = config.allowResubmission !== false &&
      (config.maxAttempts === 0 || !config.maxAttempts || assessmentResult.attemptNumber < config.maxAttempts);
    const isUnlimited = config.maxAttempts === 0 || !config.maxAttempts;
    const attemptsRemaining = isUnlimited ? Infinity : (config.maxAttempts! - assessmentResult.attemptNumber);
    const showScore = config.showScoreOnSubmit !== false;
    const blockEntries = Object.entries(assessmentResult.perBlock);
    const incorrectCount = blockEntries.filter(([, r]) => !r.correct && !r.needsReview).length;
    const pendingCount = blockEntries.filter(([, r]) => r.needsReview).length;

    // Performance-based feedback message
    const feedbackMessage = !showScore ? null
      : assessmentResult.status === 'FLAGGED' ? null
      : assessmentResult.percentage >= 90 ? 'Excellent work! You demonstrated strong understanding.'
      : assessmentResult.percentage >= 80 ? 'Great job! You have a solid grasp of this material.'
      : assessmentResult.percentage >= 70 ? 'Good effort! Review the questions you missed and consider retaking.'
      : assessmentResult.percentage >= 50 ? 'You\'re getting there. Focus on the incorrect questions and try again.'
      : 'This material needs more review. Study the content and retake when ready.';

    return (
      <div className={`${isAssessment ? 'fixed inset-0 z-50 bg-[var(--surface-base)]' : ''} flex items-center justify-center h-full`}>
        <div className={`bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-8 w-full mx-4 backdrop-blur-md ${activeAssignment.rubric ? 'max-w-2xl' : 'max-w-lg'}`}>
          {/* Header */}
          <div className="text-center mb-6">
            {showScore ? (
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
                assessmentResult.percentage >= 80 ? 'bg-green-500/20 text-green-400' :
                assessmentResult.percentage >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                <span className="text-3xl font-bold">{assessmentResult.percentage}%</span>
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 bg-purple-500/20 text-[var(--accent-text)]">
                <CheckCircle2 className="w-10 h-10" />
              </div>
            )}
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
              {showScore ? 'Assessment Complete' : 'Assessment Submitted'}
            </h2>
            {/* Attempt tracker with remaining info */}
            <p className="text-sm text-[var(--text-tertiary)]">
              {isUnlimited
                ? `Attempt ${assessmentResult.attemptNumber}`
                : `Attempt ${assessmentResult.attemptNumber} of ${config.maxAttempts}`
              }
            </p>
            {canRetake && !isUnlimited && (
              <p className="text-xs text-[var(--accent-text)] mt-1">
                {attemptsRemaining === 1 ? '1 attempt remaining' : `${attemptsRemaining} attempts remaining`}
              </p>
            )}
            {!canRetake && config.allowResubmission !== false && (
              <p className="text-xs text-[var(--text-muted)] mt-1">No attempts remaining</p>
            )}
          </div>

          {/* Performance feedback */}
          {feedbackMessage && (
            <div className={`rounded-lg px-4 py-3 mb-5 text-center text-sm ${
              assessmentResult.percentage >= 80 ? 'bg-green-500/10 text-green-300 border border-green-500/20'
              : assessmentResult.percentage >= 60 ? 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20'
              : 'bg-red-500/10 text-red-300 border border-red-500/20'
            }`}>
              {feedbackMessage}
            </div>
          )}

          {/* FLAGGED banner — shown regardless of showScore setting */}
          {assessmentResult.status === 'FLAGGED' && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-0.5">Submission flagged for review</p>
                <p className="text-amber-300/80">Your teacher will follow up. You may retake the assessment if attempts are available.</p>
              </div>
            </div>
          )}

          {showScore && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-[var(--panel-bg)] rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{assessmentResult.correct}</div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Correct</div>
                </div>
                <div className="bg-[var(--panel-bg)] rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-[var(--text-secondary)]">{assessmentResult.total}</div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Total</div>
                </div>
                <div className="bg-[var(--panel-bg)] rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-amber-400">+{assessmentResult.xpEarned}</div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">XP Earned</div>
                </div>
              </div>

              {/* Per-question results with proper numbering */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto mb-6 custom-scrollbar">
                {blockEntries.map(([blockId, result], index) => {
                  const isPending = result.needsReview;
                  return (
                    <div key={blockId} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                      isPending ? 'bg-amber-500/10 text-amber-300'
                        : result.correct ? 'bg-green-500/10 text-green-300'
                        : 'bg-red-500/10 text-red-300'
                    }`}>
                      {isPending ? <Clock className="w-3.5 h-3.5 shrink-0" />
                        : result.correct ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">Question {index + 1}</span>
                      <span className="ml-auto font-bold">
                        {isPending ? 'Pending Review' : result.correct ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Score hidden message */}
          {!showScore && (
            <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg p-4 mb-6 text-center">
              <p className="text-sm text-[var(--text-secondary)]">Your responses have been recorded.</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Your teacher will review your submission and share results.</p>
            </div>
          )}

          {/* Rubric section in results */}
          {activeAssignment.rubric && (
            <div className="mb-6">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Assessment Rubric
              </h4>
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                <Suspense fallback={<LazyFallback />}>
                  <RubricViewer
                    rubric={activeAssignment.rubric}
                    mode={existingSubmission?.rubricGrade ? 'results' : 'view'}
                    rubricGrade={existingSubmission?.rubricGrade}
                  />
                </Suspense>
              </div>
              {existingSubmission?.rubricGrade ? (
                <div className="mt-3 bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg p-3 text-center">
                  <span className="text-sm font-bold text-[var(--text-primary)]">{existingSubmission.rubricGrade.overallPercentage}%</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-2">Rubric Score</span>
                  {existingSubmission.rubricGrade.teacherFeedback && (
                    <div className="mt-3 bg-purple-500/5 border border-purple-500/15 rounded-lg p-3 text-left">
                      <div className="text-[10px] font-bold text-[var(--accent-text)] uppercase tracking-widest mb-1">Teacher Feedback</div>
                      <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{existingSubmission.rubricGrade.teacherFeedback}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center italic">
                  Your teacher will grade rubric-assessed questions. Check back for results.
                </p>
              )}
            </div>
          )}

          {/* Retake info panel */}
          {canRetake && showScore && incorrectCount > 0 && (
            <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg p-3 mb-4">
              <p className="text-xs text-purple-300 font-medium mb-1">Ready to try again?</p>
              <p className="text-[11px] text-purple-300/70">
                You missed {incorrectCount} question{incorrectCount !== 1 ? 's' : ''}{pendingCount > 0 ? ` and ${pendingCount} ${pendingCount === 1 ? 'is' : 'are'} pending review` : ''}.
                Retaking will load your previous answers so you can edit and resubmit.
                {!isUnlimited && ` You have ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} left.`}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            {canRetake && (
              <button
                onClick={handleRetake}
                className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retake{!isUnlimited ? ` (${attemptsRemaining} left)` : ''}</span>
              </button>
            )}
            {config.showReviewAfterSubmit !== false && existingSubmission?.blockResponses && Object.keys(existingSubmission.blockResponses).length > 0 && (
              <button
                onClick={() => setReviewMode(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 font-bold py-3 rounded-xl transition text-sm"
              >
                <Eye className="w-4 h-4" /> Review My Work
              </button>
            )}
            <button
              onClick={handleExit}
              className="flex-1 flex items-center justify-center gap-2 bg-[var(--surface-glass-heavy)] hover:bg-[var(--surface-glass-heavy)] text-[var(--text-primary)] font-bold py-3 rounded-xl transition text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> {canRetake ? 'Review Later' : 'Exit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isAssessment ? 'fixed inset-0 z-50 bg-[var(--surface-base)] flex flex-col' : 'gap-1 h-full flex flex-col'}`}>
      {/* Navigation blocker modal */}
      {showBlockerModal && (
        <div className="fixed inset-0 z-[60] bg-[var(--backdrop)] flex items-center justify-center">
          <div className="bg-[var(--surface-raised)] border border-red-500/30 rounded-2xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-2 text-red-400 mb-3">
              <Shield className="w-5 h-5" />
              <h3 className="font-bold text-sm">Pause Assessment?</h3>
            </div>
            <p className="text-[var(--text-secondary)] text-xs mb-1">
              Your progress is automatically saved. You can return to finish this assessment anytime before the due date.
            </p>
            <p className="text-[var(--text-tertiary)] text-[10px] mb-4">
              Ready to pause?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowBlockerModal(false); }}
                className="flex-1 bg-purple-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-purple-500 transition"
              >
                Keep Working
              </button>
              <button
                onClick={() => { setShowBlockerModal(false); handleSaveAndExit(); }}
                className="flex-1 bg-[var(--surface-glass-heavy)] text-[var(--text-secondary)] text-xs font-bold py-2 rounded-lg border border-[var(--border)] hover:text-[var(--text-primary)] transition"
              >
                Save & Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Failed modal */}
      {showSaveFailedModal && (
        <div className="fixed inset-0 z-[60] bg-[var(--backdrop)] flex items-center justify-center">
          <div className="bg-[#1a0a2e] border border-amber-500/30 rounded-2xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-2 text-amber-400 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm">Couldn't Sync to Server</h3>
            </div>
            <p className="text-[var(--text-secondary)] text-xs mb-4">
              Your answers are backed up on this device. You can keep working, or exit now and resume later on this same device.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowSaveFailedModal(false); blockerProceedRef.current = false; }}
                className="flex-1 bg-purple-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-purple-500 transition"
              >
                Keep Working
              </button>
              <button
                onClick={() => { setShowSaveFailedModal(false); handleExit(); }}
                className="flex-1 bg-amber-600/20 text-amber-300 text-xs font-bold py-2 rounded-lg border border-amber-500/30 hover:bg-amber-600/30 transition"
              >
                Exit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escape hatch — submission failed or already submitted but no results to show */}
      {submitFailed && !assessmentResult && isLiveAssessment && (
        <div className="fixed top-0 left-0 right-0 z-[55] bg-amber-600/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-white text-xs font-medium">
            Your work has been saved. Check with your teacher if your submission went through.
          </p>
          <button
            onClick={handleExit}
            className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
          >
            <Home className="w-3.5 h-3.5" /> Return to Dashboard
          </button>
        </div>
      )}

      {/* Rubric modal */}
      {showRubric && activeAssignment?.rubric && (
        <div className="fixed inset-0 z-[55] bg-[var(--backdrop)] flex items-center justify-center p-4">
          <div className="bg-[var(--surface-base)]/95 backdrop-blur-xl border border-[var(--border)] rounded-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-[var(--border)] shrink-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" /> {activeAssignment.rubric.title || 'Assessment Rubric'}
              </h3>
              <button onClick={() => setShowRubric(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 custom-scrollbar">
              <Suspense fallback={<LazyFallback />}>
                <RubricViewer
                  rubric={activeAssignment.rubric}
                  mode={existingSubmission?.rubricGrade ? 'results' : 'view'}
                  rubricGrade={existingSubmission?.rubricGrade}
                />
              </Suspense>
              {existingSubmission?.rubricGrade && (
                <div className="mt-4 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">{existingSubmission.rubricGrade.overallPercentage}%</div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mt-1">Rubric Score</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">Graded by {existingSubmission.rubricGrade.gradedBy}</div>
                  {existingSubmission.rubricGrade.teacherFeedback && (
                    <div className="mt-3 bg-purple-500/5 border border-purple-500/15 rounded-lg p-3 text-left">
                      <div className="text-[10px] font-bold text-[var(--accent-text)] uppercase tracking-widest mb-1">Teacher Feedback</div>
                      <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{existingSubmission.rubricGrade.teacherFeedback}</p>
                    </div>
                  )}
                </div>
              )}
              {!existingSubmission?.rubricGrade && existingSubmission && (
                <p className="text-[10px] text-[var(--text-muted)] mt-3 text-center italic">Your teacher will grade rubric-assessed questions and your results will appear here.</p>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Header bar */}
      <div className={`relative flex items-center justify-between text-[var(--text-primary)] ${isAssessment ? 'bg-red-900/20 border-red-500/20' : 'bg-[var(--surface-base)] border-[var(--border)]'} px-4 py-1.5 ${isAssessment ? '' : 'rounded-xl'} border overflow-hidden`}>
        <div className="flex items-center gap-4 min-w-0">
          <h2 className="text-sm font-bold truncate flex items-center gap-2">
            {isAssessment && <Shield className="w-4 h-4 text-red-400 shrink-0" />}
            {activeAssignment.title}
            {isAssessment && (
              <span className="text-[9px] bg-red-600/80 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">Assessment</span>
            )}
            {user.role === UserRole.ADMIN && (
              <span className="text-[9px] bg-purple-600 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">Admin</span>
            )}
          </h2>
          {/* Hide tab switchers during assessment */}
          {!isAssessment && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setAssignViewMode('WORK')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition ${assignViewMode === 'WORK' ? 'bg-purple-500/20 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>Resource</button>
              {hasQuestionBank && (
                <button onClick={() => setAssignViewMode('REVIEW')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${assignViewMode === 'REVIEW' ? 'bg-purple-500/20 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}><Brain className="w-3 h-3" /> Review</button>
              )}
              {hasStudyMaterial && (
                <button onClick={() => setAssignViewMode('STUDY')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${assignViewMode === 'STUDY' ? 'bg-purple-500/20 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}><BookOpenIcon className="w-3 h-3" /> Study</button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user.role === 'ADMIN' && (
            <div className="flex bg-[var(--panel-bg)] rounded-lg p-0.5 border border-[var(--border)] text-[9px] font-bold">
              <button onClick={() => setAdminViewMode('STUDENT')} className={`px-2 py-1 rounded transition ${adminViewMode === 'STUDENT' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>Student</button>
              <button onClick={() => setAdminViewMode('ADMIN')} className={`px-2 py-1 rounded transition ${adminViewMode === 'ADMIN' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>Admin</button>
            </div>
          )}
          {/* Rubric button — visible during assessment and after for students who have a rubric */}
          {activeAssignment?.rubric && (activeAssignment.isAssessment || existingSubmission?.rubricGrade) && (
            <button
              onClick={() => setShowRubric(prev => !prev)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition ${isLight ? 'text-amber-700 hover:text-amber-800 bg-amber-100 border border-amber-300' : 'text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20'}`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Rubric
            </button>
          )}
          {/* Assessment: Save & Exit + Submit buttons */}
          {isAssessment && !isPreview ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAndExit}
                disabled={isSavingExit || isSubmitting}
                className="flex items-center gap-1.5 text-xs font-bold bg-[var(--surface-glass-heavy)] hover:bg-[var(--surface-glass)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingExit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                {isSavingExit ? 'Saving...' : 'Save & Exit'}
              </button>
              <button
                onClick={handleAssessmentSubmit}
                disabled={isSubmitting || isSavingExit}
                className="flex items-center gap-1.5 text-xs font-bold bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {isSubmitting ? 'Submitting...' : 'Submit Assessment'}
              </button>
            </div>
          ) : isAssessment && isPreview ? (
            <span className={`flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-lg border ${isLight ? 'text-amber-700 bg-amber-100 border-amber-300' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'}`}>
              <Eye className="w-3.5 h-3.5" /> Submit (Preview)
            </span>
          ) : (
            <button onClick={() => navigate(activeAssignment.unit ? '/resources' : '/home')} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition flex items-center gap-1 text-xs bg-[var(--surface-glass)] px-3 py-1.5 rounded-lg border border-[var(--border)]" title={activeAssignment.unit || 'Resources'}>
              <ArrowLeft className="w-3.5 h-3.5" /> {activeAssignment.unit || 'Back'}
            </button>
          )}
        </div>
      </div>

      {/* AI Flag Banner — shown to students whose submission was flagged for AI */}
      {existingSubmission?.flaggedAsAI && user.role !== UserRole.ADMIN && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg mx-1 mt-2 p-3 flex items-start gap-3 text-xs text-purple-200 animate-in fade-in duration-300">
          <Bot className="w-5 h-5 text-[var(--accent-text)] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-purple-300 mb-1">Your submission has been flagged for suspected AI usage.</p>
            <p className="text-purple-300/80">Your score is currently recorded as <span className="font-bold text-[var(--text-primary)]">0%</span> until you either resubmit the assessment using your own work or provide a written defense to your teacher.</p>
          </div>
        </div>
      )}

      {existingSubmission?.status === 'RETURNED' && (
        <div className="mx-4 mt-4 mb-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-amber-300">Assessment Returned</p>
            <p className="text-xs text-amber-400/70">Your teacher returned this assessment for revision. Review your answers and submit when ready.</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        <Suspense fallback={<LazyFallback />}>
          {assignViewMode === 'WORK' && (
            <div className="h-full flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Proctor
                  flushRef={flushRef}
                  onComplete={handleEngagementComplete}
                  onBlockProgress={(completed) => {
                    const INTERACTIVE = ['MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED', 'DRAWING', 'MATH_RESPONSE'];
                    const total = (activeAssignment.lessonBlocks || []).filter(b => INTERACTIVE.includes(b.type)).length;
                    setBlockProgress(total > 0 ? completed / total : 0);
                    setAnsweredBlocks(completed);
                    setTotalBlocks(total);
                  }}
                  contentUrl={activeAssignment.contentUrl}
                  htmlContent={activeAssignment.htmlContent}
                  userId={user.id}
                  assignmentId={activeAssignment.id}
                  classType={activeAssignment.classType}
                  lessonBlocks={activeAssignment.lessonBlocks}
                  isAssessment={isAssessment}
                  onGetMetricsAndResponses={getMetricsAndResponsesRef}
                  onSessionToken={(token) => { sessionTokenRef.current = token; }}
                  previewMode={isPreview}
                  hasSidebar={!!(activeAssignment.lessonBlocks && activeAssignment.lessonBlocks.length >= 3)}
                />
              </div>
              {adminViewMode === 'ADMIN' && user.role === UserRole.ADMIN && (
                <div className="w-full md:w-72 bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-6 backdrop-blur-md animate-in slide-in-from-right duration-300 overflow-y-auto">
                  <h3 className="font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2"><SettingsIcon className="w-4 h-4 text-[var(--accent-text)]" /> Admin Controls</h3>
                  <div className="space-y-6">
                    <div className="bg-[var(--panel-bg)] p-4 rounded-xl border border-[var(--border)]">
                      <label className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest block mb-2">Active Engagement</label>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center text-[var(--accent-text)]">
                          <Users className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-[var(--text-primary)]">{liveCount}</div>
                          <div className="text-[10px] text-[var(--text-muted)]">Live Operatives</div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[var(--panel-bg)] p-4 rounded-xl border border-[var(--border)]">
                      <label className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest block mb-2">Collaboration</label>
                      <button
                        onClick={() => setIsCommOpen(true)}
                        className="w-full bg-indigo-600 border border-indigo-500 py-2 rounded-lg text-xs font-bold text-white hover:bg-indigo-500 transition"
                      >
                        Open Class Chat
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {assignViewMode === 'REVIEW' && !isAssessment && (
            <div className="h-full bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl overflow-hidden backdrop-blur-md" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
              <ReviewQuestions assignment={activeAssignment} />
            </div>
          )}
          {assignViewMode === 'STUDY' && !isAssessment && (
            <div className="h-full bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl overflow-hidden backdrop-blur-md" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
              <StudyMaterial assignment={activeAssignment} onComplete={handleEngagementComplete} />
            </div>
          )}
        </Suspense>
      </div>

      {/* Sticky bottom banner for assessments — always-visible submit CTA (hidden in admin preview) */}
      {isLiveAssessment && !assessmentResult && (!existingSubmission || isRetakingRef.current) && !reviewMode && assignViewMode === 'WORK' && (
        <div className="sticky bottom-0 z-30 bg-gradient-to-t from-[#0a0118] via-[#0a0118]/95 to-transparent pt-4 pb-3 px-4">
          <div className="flex items-center justify-between bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3 text-sm">
              <div className={`flex items-center gap-1.5 font-bold ${answeredBlocks === totalBlocks && totalBlocks > 0 ? 'text-green-400' : 'text-amber-400'}`}>
                {answeredBlocks === totalBlocks && totalBlocks > 0
                  ? <CheckCircle2 className="w-4 h-4" />
                  : <AlertTriangle className="w-4 h-4" />
                }
                {totalBlocks > 0
                  ? `${answeredBlocks} of ${totalBlocks} questions answered`
                  : 'Answer questions above'
                }
              </div>
              {answeredBlocks < totalBlocks && totalBlocks > 0 && (
                <span className="text-xs text-[var(--text-tertiary)]">
                  — you must click the green button to submit your assessment
                </span>
              )}
            </div>
            <button
              onClick={handleAssessmentSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 text-sm font-bold bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed animate-pulse hover:animate-none"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSubmitting ? 'Submitting...' : 'Submit Assessment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceViewer;

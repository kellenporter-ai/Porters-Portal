import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, UserRole, TelemetryMetrics, Submission } from '../types';
import { useAppData } from '../lib/AppDataContext';
import { useChat } from '../lib/ChatContext';
import { dataService } from '../services/dataService';
import { doc, getDoc, setDoc, collection, query, where, limit, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from './ToastProvider';
import { reportError } from '../lib/errorReporting';
import { ArrowLeft, Brain, BookOpen as BookOpenIcon, Settings as SettingsIcon, Users, Loader2, Shield, Send, RotateCcw, CheckCircle2, XCircle, AlertTriangle, X, BookOpen, Clock, Bot, Home, ChevronRight } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { BlockResponseMap } from './LessonBlocks';
import { sfx } from '../lib/sfx';

const Proctor = lazy(() => import('./Proctor'));
const ReviewQuestions = lazy(() => import('./ReviewQuestions'));
const RubricViewer = lazy(() => import('./RubricViewer'));
const StudyMaterial = lazy(() => import('./StudyMaterial'));

const LazyFallback = () => (
  <div className="flex items-center justify-center h-64 text-gray-500">
    <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading module...
  </div>
);

interface ResourceViewerProps {
  user: User;
}

const ResourceViewer: React.FC<ResourceViewerProps> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { assignments } = useAppData();
  const { setIsCommOpen } = useChat();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [assignViewMode, setAssignViewMode] = useState<'WORK' | 'REVIEW' | 'STUDY'>('WORK');
  const [adminViewMode, setAdminViewMode] = useState<'STUDENT' | 'ADMIN'>('STUDENT');
  const [hasQuestionBank, setHasQuestionBank] = useState(false);
  const [hasStudyMaterial, setHasStudyMaterial] = useState(false);
  const [liveCount, setLiveCount] = useState(0);

  // Block progress for header progress bar (0–1)
  const [blockProgress, setBlockProgress] = useState(0);

  // Assessment state
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Ref for getting Proctor metrics + responses on demand
  const getMetricsAndResponsesRef = useRef<(() => { metrics: TelemetryMetrics; responses: BlockResponseMap }) | null>(null);
  // Session token for assessment security (issued by startAssessmentSession Cloud Function)
  const sessionTokenRef = useRef<string | null>(null);

  const activeAssignment = assignments.find(a => a.id === id) || null;
  const isAssessment = activeAssignment?.isAssessment === true && user.role !== UserRole.ADMIN;
  const config = activeAssignment?.assessmentConfig || { allowResubmission: true, maxAttempts: 0, showScoreOnSubmit: true, lockNavigation: true };

  // Fetch student's existing submission for rubric grade display
  useEffect(() => {
    if (!id || user.role === UserRole.ADMIN || !activeAssignment?.isAssessment) return;
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

  // Probe supplemental tabs
  // Play lesson-open sound when resource loads
  useEffect(() => {
    if (id && activeAssignment) sfx.lessonOpen();
  }, [id, activeAssignment]);

  useEffect(() => {
    setHasQuestionBank(false);
    setHasStudyMaterial(false);
    if (!id) return;
    getDoc(doc(db, 'question_banks', id)).then(snap => {
      if (snap.exists() && (snap.data().questions || []).length > 0) setHasQuestionBank(true);
    }).catch(err => {
      reportError(err, { context: 'probe question bank', assignmentId: id });
      toast.error('Failed to load question bank');
    });
    getDoc(doc(db, 'reading_materials', id)).then(snap => {
      if (snap.exists()) setHasStudyMaterial(true);
    }).catch(err => {
      reportError(err, { context: 'probe reading materials', assignmentId: id });
      toast.error('Failed to load study materials');
    });
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
    const { metrics, responses } = getMetricsAndResponsesRef.current();

    // Client-side guard: require minimum engagement time
    if (metrics.engagementTime < MIN_ASSESSMENT_ENGAGEMENT_SEC) {
      toast.error(`Please spend at least ${MIN_ASSESSMENT_ENGAGEMENT_SEC} seconds reviewing the assessment before submitting.`);
      return;
    }

    setIsSubmitting(true);
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
        sessionStorage.removeItem(`assessment_session_${activeAssignment.id}`);
        sessionTokenRef.current = null;
      }
      toast.success(`Assessment submitted! Score: ${result.assessmentScore.percentage}%`);
    } catch (err) {
      reportError(err, { method: 'submitAssessment', assignmentId: activeAssignment.id });
      toast.error('Failed to submit assessment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
      message: `Your previous answers will be cleared and you'll start fresh.${afterThis != null ? (afterThis === 0 ? ' This will be your last attempt.' : ` You will have ${afterThis} attempt${afterThis !== 1 ? 's' : ''} remaining after this.`) : ''} Are you sure you want to retake?`,
      confirmLabel: 'Start Retake',
      cancelLabel: 'Go Back',
      variant: 'info',
    });
    if (!confirmed) return;
    const docId = `${user.id}_${activeAssignment.id}_blocks`;
    try {
      await setDoc(doc(db, 'lesson_block_responses', docId), {
        userId: user.id,
        assignmentId: activeAssignment.id,
        responses: {},
        lastUpdated: new Date().toISOString(),
      });
    } catch { /* ignore if doc doesn't exist yet */ }
    // Clear cached session token so retake gets a fresh one
    sessionStorage.removeItem(`assessment_session_${activeAssignment.id}`);
    sessionTokenRef.current = null;
    setAssessmentResult(null);
  }, [activeAssignment, user.id, assessmentResult, confirm]);

  const handleExit = () => {
    setAssignViewMode('WORK');
    // The navigation guard pushed an extra history entry; skip past it
    if (guardHistoryPushedRef.current) {
      guardHistoryPushedRef.current = false;
      navigate(-2);
    } else {
      navigate(-1);
    }
  };

  // Navigation guard for assessments — prevent leaving during active assessment
  // Uses popstate + history.pushState since useBlocker requires a data router
  const blockerProceedRef = useRef(false);
  const guardHistoryPushedRef = useRef(false);

  useEffect(() => {
    if (!isAssessment || assessmentResult) return;

    // Push a duplicate state so back button can be intercepted
    window.history.pushState(null, '', window.location.href);
    guardHistoryPushedRef.current = true;

    const handlePopState = () => {
      if (blockerProceedRef.current) return;
      // Re-push state to prevent navigation, then show modal
      window.history.pushState(null, '', window.location.href);
      setShowBlockerModal(true);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAssessment, assessmentResult]);

  if (!activeAssignment) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>Resource not found.</p>
        <button onClick={() => navigate(-1)} className="ml-4 text-purple-400 hover:text-purple-300">Go back</button>
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
      <div className={`${isAssessment ? 'fixed inset-0 z-50 bg-[#0a0416]' : ''} flex items-center justify-center h-full`}>
        <div className={`bg-white/5 border border-white/10 rounded-2xl p-8 w-full mx-4 backdrop-blur-md ${activeAssignment.rubric ? 'max-w-2xl' : 'max-w-lg'}`}>
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
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 bg-purple-500/20 text-purple-400">
                <CheckCircle2 className="w-10 h-10" />
              </div>
            )}
            <h2 className="text-xl font-bold text-white mb-1">
              {showScore ? 'Assessment Complete' : 'Assessment Submitted'}
            </h2>
            {/* Attempt tracker with remaining info */}
            <p className="text-sm text-gray-400">
              {isUnlimited
                ? `Attempt ${assessmentResult.attemptNumber}`
                : `Attempt ${assessmentResult.attemptNumber} of ${config.maxAttempts}`
              }
            </p>
            {canRetake && !isUnlimited && (
              <p className="text-xs text-purple-400 mt-1">
                {attemptsRemaining === 1 ? '1 attempt remaining' : `${attemptsRemaining} attempts remaining`}
              </p>
            )}
            {!canRetake && config.allowResubmission !== false && (
              <p className="text-xs text-gray-500 mt-1">No attempts remaining</p>
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
                <div className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{assessmentResult.correct}</div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">Correct</div>
                </div>
                <div className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-gray-300">{assessmentResult.total}</div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">Total</div>
                </div>
                <div className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-amber-400">+{assessmentResult.xpEarned}</div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">XP Earned</div>
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
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6 text-center">
              <p className="text-sm text-gray-300">Your responses have been recorded.</p>
              <p className="text-xs text-gray-500 mt-1">Your teacher will review your submission and share results.</p>
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
                <div className="mt-3 bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                  <span className="text-sm font-bold text-white">{existingSubmission.rubricGrade.overallPercentage}%</span>
                  <span className="text-[10px] text-gray-500 ml-2">Rubric Score</span>
                </div>
              ) : (
                <p className="text-[10px] text-gray-500 mt-2 text-center italic">
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
                Retaking will clear your answers and let you start fresh.
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
            <button
              onClick={handleExit}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> {canRetake ? 'Review Later' : 'Exit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isAssessment ? 'fixed inset-0 z-50 bg-[#0a0416] flex flex-col' : 'space-y-2 h-full flex flex-col'}`}>
      {/* Navigation blocker modal */}
      {showBlockerModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center">
          <div className="bg-[#1a0a2e] border border-red-500/30 rounded-2xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-2 text-red-400 mb-3">
              <Shield className="w-5 h-5" />
              <h3 className="font-bold text-sm">Assessment Active</h3>
            </div>
            <p className="text-gray-300 text-xs mb-4">
              You are in an active assessment. Leaving will be recorded and may affect your score. Are you sure you want to leave?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowBlockerModal(false); }}
                className="flex-1 bg-purple-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-purple-500 transition"
              >
                Stay
              </button>
              <button
                onClick={() => { setShowBlockerModal(false); blockerProceedRef.current = true; navigate(-1); }}
                className="flex-1 bg-red-600/20 text-red-300 text-xs font-bold py-2 rounded-lg border border-red-500/30 hover:bg-red-600/30 transition"
              >
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rubric modal */}
      {showRubric && activeAssignment?.rubric && (
        <div className="fixed inset-0 z-[55] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#0f0720]/95 backdrop-blur-xl border border-white/10 rounded-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-white/10 shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" /> {activeAssignment.rubric.title || 'Assessment Rubric'}
              </h3>
              <button onClick={() => setShowRubric(false)} className="text-gray-400 hover:text-white transition">
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
                <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-white">{existingSubmission.rubricGrade.overallPercentage}%</div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">Rubric Score</div>
                  <div className="text-[10px] text-gray-600 mt-1">Graded by {existingSubmission.rubricGrade.gradedBy}</div>
                </div>
              )}
              {!existingSubmission?.rubricGrade && existingSubmission && (
                <p className="text-[10px] text-gray-500 mt-3 text-center italic">Your teacher will grade rubric-assessed questions and your results will appear here.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumbs — hidden during assessment lockdown */}
      {!isAssessment && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] text-gray-500 px-1 py-1.5">
          <button onClick={() => navigate('/home')} className="hover:text-gray-300 transition flex items-center gap-1">
            <Home className="w-3 h-3" /> Home
          </button>
          <ChevronRight className="w-3 h-3 text-gray-600" />
          <button onClick={() => navigate('/resources')} className="hover:text-gray-300 transition">
            Resources
          </button>
          {activeAssignment.unit && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-600" />
              <span className="text-gray-400">{activeAssignment.unit}</span>
            </>
          )}
          <ChevronRight className="w-3 h-3 text-gray-600" />
          <span className="text-gray-300 truncate max-w-[200px]">{activeAssignment.title}</span>
        </nav>
      )}

      {/* Header bar */}
      <div className={`relative flex items-center justify-between text-white ${isAssessment ? 'bg-red-900/20 border-red-500/20' : 'bg-white/5 border-white/10'} px-4 py-2 ${isAssessment ? '' : 'rounded-xl'} border backdrop-blur-md overflow-hidden`}>
        {/* Progress bar — thin gradient at bottom of header */}
        {activeAssignment.lessonBlocks && activeAssignment.lessonBlocks.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5">
            <div
              className="h-full transition-all duration-500 ease-out rounded-r-full"
              style={{
                width: `${blockProgress * 100}%`,
                background: `linear-gradient(90deg, #9333ea ${Math.max(0, 100 - blockProgress * 100)}%, #22c55e 100%)`,
              }}
            />
          </div>
        )}
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
              <button onClick={() => setAssignViewMode('WORK')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition ${assignViewMode === 'WORK' ? 'bg-purple-500/20 text-white' : 'text-gray-400 hover:text-white'}`}>Resource</button>
              {hasQuestionBank && (
                <button onClick={() => setAssignViewMode('REVIEW')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${assignViewMode === 'REVIEW' ? 'bg-purple-500/20 text-white' : 'text-gray-400 hover:text-white'}`}><Brain className="w-3 h-3" /> Review</button>
              )}
              {hasStudyMaterial && (
                <button onClick={() => setAssignViewMode('STUDY')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${assignViewMode === 'STUDY' ? 'bg-purple-500/20 text-white' : 'text-gray-400 hover:text-white'}`}><BookOpenIcon className="w-3 h-3" /> Study</button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user.role === 'ADMIN' && (
            <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10 text-[9px] font-bold">
              <button onClick={() => setAdminViewMode('STUDENT')} className={`px-2 py-1 rounded transition ${adminViewMode === 'STUDENT' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>Student</button>
              <button onClick={() => setAdminViewMode('ADMIN')} className={`px-2 py-1 rounded transition ${adminViewMode === 'ADMIN' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>Admin</button>
            </div>
          )}
          {/* Rubric button — visible during assessment and after for students who have a rubric */}
          {activeAssignment?.rubric && (activeAssignment.isAssessment || existingSubmission?.rubricGrade) && (
            <button
              onClick={() => setShowRubric(prev => !prev)}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg transition"
            >
              <BookOpen className="w-3.5 h-3.5" /> Rubric
            </button>
          )}
          {/* Assessment: Submit button instead of Exit */}
          {isAssessment ? (
            <button
              onClick={handleAssessmentSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 text-xs font-bold bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {isSubmitting ? 'Submitting...' : 'Submit Assessment'}
            </button>
          ) : (
            <button onClick={handleExit} className="text-gray-400 hover:text-white transition flex items-center gap-1 text-xs bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
              <ArrowLeft className="w-3.5 h-3.5" /> Exit
            </button>
          )}
        </div>
      </div>

      {/* AI Flag Banner — shown to students whose submission was flagged for AI */}
      {existingSubmission?.flaggedAsAI && user.role !== UserRole.ADMIN && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg mx-1 mt-2 p-3 flex items-start gap-3 text-xs text-purple-200 animate-in fade-in duration-300">
          <Bot className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-purple-300 mb-1">Your submission has been flagged for suspected AI usage.</p>
            <p className="text-purple-300/80">Your score is currently recorded as <span className="font-bold text-white">0%</span> until you either resubmit the assessment using your own work or provide a written defense to your teacher.</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        <Suspense fallback={<LazyFallback />}>
          {assignViewMode === 'WORK' && (
            <div className="h-full flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Proctor
                  onComplete={handleEngagementComplete}
                  onBlockProgress={(completed) => {
                    const INTERACTIVE = ['MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED', 'DRAWING', 'MATH_RESPONSE'];
                    const total = (activeAssignment.lessonBlocks || []).filter(b => INTERACTIVE.includes(b.type)).length;
                    setBlockProgress(total > 0 ? completed / total : 0);
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
                />
              </div>
              {adminViewMode === 'ADMIN' && user.role === UserRole.ADMIN && (
                <div className="w-full md:w-72 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md animate-in slide-in-from-right duration-300 overflow-y-auto">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2"><SettingsIcon className="w-4 h-4 text-purple-400" /> Admin Controls</h3>
                  <div className="space-y-6">
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-2">Active Engagement</label>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center text-purple-400">
                          <Users className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-white">{liveCount}</div>
                          <div className="text-[10px] text-gray-500">Live Operatives</div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-2">Collaboration</label>
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
            <div className="h-full bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
              <ReviewQuestions assignment={activeAssignment} />
            </div>
          )}
          {assignViewMode === 'STUDY' && !isAssessment && (
            <div className="h-full bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
              <StudyMaterial assignment={activeAssignment} onComplete={handleEngagementComplete} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default ResourceViewer;

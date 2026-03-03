import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { User, UserRole, TelemetryMetrics, Submission } from '../types';
import { useAppData } from '../lib/AppDataContext';
import { useChat } from '../lib/ChatContext';
import { dataService } from '../services/dataService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from './ToastProvider';
import { reportError } from '../lib/errorReporting';
import { ArrowLeft, Brain, BookOpen as BookOpenIcon, Settings as SettingsIcon, Users, Loader2, Shield, Send, RotateCcw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { BlockResponseMap } from './LessonBlocks';

const Proctor = lazy(() => import('./Proctor'));
const ReviewQuestions = lazy(() => import('./ReviewQuestions'));
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

  const [assignViewMode, setAssignViewMode] = useState<'WORK' | 'REVIEW' | 'STUDY'>('WORK');
  const [adminViewMode, setAdminViewMode] = useState<'STUDENT' | 'ADMIN'>('STUDENT');
  const [hasQuestionBank, setHasQuestionBank] = useState(false);
  const [hasStudyMaterial, setHasStudyMaterial] = useState(false);
  const [liveCount, setLiveCount] = useState(0);

  // Assessment state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<{
    correct: number;
    total: number;
    percentage: number;
    perBlock: Record<string, { correct: boolean; answer: unknown }>;
    attemptNumber: number;
    status: string;
    xpEarned: number;
  } | null>(null);
  const [showBlockerModal, setShowBlockerModal] = useState(false);

  // Ref for getting Proctor metrics + responses on demand
  const getMetricsAndResponsesRef = useRef<(() => { metrics: TelemetryMetrics; responses: BlockResponseMap }) | null>(null);

  const activeAssignment = assignments.find(a => a.id === id) || null;
  const isAssessment = activeAssignment?.isAssessment === true && user.role !== UserRole.ADMIN;
  const config = activeAssignment?.assessmentConfig || { allowResubmission: true, maxAttempts: 0, showScoreOnSubmit: true, lockNavigation: true };

  // Probe supplemental tabs
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
  const handleAssessmentSubmit = useCallback(async () => {
    if (!activeAssignment || !getMetricsAndResponsesRef.current) return;
    setIsSubmitting(true);
    try {
      const { metrics, responses } = getMetricsAndResponsesRef.current();
      const result = await dataService.submitAssessment(
        user.name,
        activeAssignment.id,
        responses,
        metrics,
        activeAssignment.classType
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
      toast.success(`Assessment submitted! Score: ${result.assessmentScore.percentage}%`);
    } catch (err) {
      reportError(err, { method: 'submitAssessment', assignmentId: activeAssignment.id });
      toast.error('Failed to submit assessment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [activeAssignment, user.name, toast]);

  // Assessment retake handler
  const handleRetake = useCallback(() => {
    setAssessmentResult(null);
  }, []);

  const handleExit = () => {
    setAssignViewMode('WORK');
    navigate(-1);
  };

  // Navigation guard for assessments — prevent leaving during active assessment
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isAssessment && !assessmentResult && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowBlockerModal(true);
    }
  }, [blocker.state]);

  // Prevent browser close/refresh during assessment
  useEffect(() => {
    if (!isAssessment || assessmentResult) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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

    return (
      <div className={`${isAssessment ? 'fixed inset-0 z-50 bg-[#0a0416]' : ''} flex items-center justify-center h-full`}>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-lg w-full mx-4 backdrop-blur-md">
          <div className="text-center mb-6">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
              assessmentResult.percentage >= 80 ? 'bg-green-500/20 text-green-400' :
              assessmentResult.percentage >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              <span className="text-3xl font-bold">{assessmentResult.percentage}%</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Assessment {config.showScoreOnSubmit !== false ? 'Complete' : 'Submitted'}</h2>
            <p className="text-sm text-gray-400">Attempt #{assessmentResult.attemptNumber}</p>
          </div>

          {config.showScoreOnSubmit !== false && (
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

              {assessmentResult.status === 'FLAGGED' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 flex items-center gap-2 text-xs text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Your submission has been flagged for review. Your teacher will follow up.
                </div>
              )}

              {/* Per-question results */}
              <div className="space-y-2 max-h-48 overflow-y-auto mb-6 custom-scrollbar">
                {Object.entries(assessmentResult.perBlock).map(([blockId, result]) => (
                  <div key={blockId} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                    result.correct ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'
                  }`}>
                    {result.correct ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">Question {blockId.slice(0, 8)}...</span>
                    <span className="ml-auto font-bold">{result.correct ? 'Correct' : 'Incorrect'}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-3">
            {canRetake && (
              <button
                onClick={handleRetake}
                className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition text-sm"
              >
                <RotateCcw className="w-4 h-4" /> Retake Assessment
              </button>
            )}
            <button
              onClick={handleExit}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isAssessment ? 'fixed inset-0 z-50 bg-[#0a0416] flex flex-col' : 'space-y-2 h-full flex flex-col'}`}>
      {/* Navigation blocker modal */}
      {showBlockerModal && blocker.state === 'blocked' && (
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
                onClick={() => { setShowBlockerModal(false); blocker.reset?.(); }}
                className="flex-1 bg-purple-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-purple-500 transition"
              >
                Stay
              </button>
              <button
                onClick={() => { setShowBlockerModal(false); blocker.proceed?.(); }}
                className="flex-1 bg-red-600/20 text-red-300 text-xs font-bold py-2 rounded-lg border border-red-500/30 hover:bg-red-600/30 transition"
              >
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className={`flex items-center justify-between text-white ${isAssessment ? 'bg-red-900/20 border-red-500/20' : 'bg-white/5 border-white/10'} px-4 py-2 ${isAssessment ? '' : 'rounded-xl'} border backdrop-blur-md`}>
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

      <div className="flex-1 overflow-hidden relative">
        <Suspense fallback={<LazyFallback />}>
          {assignViewMode === 'WORK' && (
            <div className="h-full flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Proctor
                  onComplete={handleEngagementComplete}
                  contentUrl={activeAssignment.contentUrl}
                  htmlContent={activeAssignment.htmlContent}
                  userId={user.id}
                  assignmentId={activeAssignment.id}
                  classType={activeAssignment.classType}
                  lessonBlocks={activeAssignment.lessonBlocks}
                  isAssessment={isAssessment}
                  onGetMetricsAndResponses={getMetricsAndResponsesRef}
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

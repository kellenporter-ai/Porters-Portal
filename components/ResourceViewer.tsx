import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, UserRole, TelemetryMetrics, Submission } from '../types';
import { useAppData } from '../lib/AppDataContext';
import { useChat } from '../lib/ChatContext';
import { dataService } from '../services/dataService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from './ToastProvider';
import { reportError } from '../lib/errorReporting';
import { ArrowLeft, Brain, BookOpen as BookOpenIcon, Settings as SettingsIcon, Users, Loader2, CheckCircle2 } from 'lucide-react';

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

const INTERACTIVE_BLOCK_TYPES = ['MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED', 'VOCAB_LIST', 'ACTIVITY', 'BAR_CHART', 'DATA_TABLE'];

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
  const [blocksCompleted, setBlocksCompleted] = useState(0);

  const activeAssignment = assignments.find(a => a.id === id) || null;

  const totalInteractiveBlocks = useMemo(() => {
    if (!activeAssignment?.lessonBlocks) return 0;
    return activeAssignment.lessonBlocks.filter(b => INTERACTIVE_BLOCK_TYPES.includes(b.type)).length;
  }, [activeAssignment?.lessonBlocks]);

  const handleBlockProgress = useCallback((completed: number) => {
    setBlocksCompleted(completed);
  }, []);

  // Probe supplemental tabs
  useEffect(() => {
    setHasQuestionBank(false);
    setHasStudyMaterial(false);
    setBlocksCompleted(0);
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
    if (metrics.engagementTime < 10) return;
    try {
      await dataService.submitEngagement(u.id, u.name, a.id, a.title, metrics, a.classType);
    } catch (err) {
      reportError(err, { method: 'submitEngagement', assignmentId: a.id });
    }
  }, []);

  const handleExit = () => {
    setAssignViewMode('WORK');
    navigate(-1);
  };

  if (!activeAssignment) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>Resource not found.</p>
        <button onClick={() => navigate(-1)} className="ml-4 text-purple-400 hover:text-purple-300">Go back</button>
      </div>
    );
  }

  return (
    <div className="space-y-2 h-full flex flex-col">
      <div className="flex items-center justify-between text-white bg-white/5 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-4 min-w-0">
          <h2 className="text-sm font-bold truncate flex items-center gap-2">
            {activeAssignment.title}
            {user.role === UserRole.ADMIN && (
              <span className="text-[9px] bg-purple-600 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">Admin</span>
            )}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setAssignViewMode('WORK')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition ${assignViewMode === 'WORK' ? 'bg-purple-500/20 text-white' : 'text-gray-400 hover:text-white'}`}>Resource</button>
            {hasQuestionBank && (
              <button onClick={() => setAssignViewMode('REVIEW')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${assignViewMode === 'REVIEW' ? 'bg-purple-500/20 text-white' : 'text-gray-400 hover:text-white'}`}><Brain className="w-3 h-3" /> Review</button>
            )}
            {hasStudyMaterial && (
              <button onClick={() => setAssignViewMode('STUDY')} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${assignViewMode === 'STUDY' ? 'bg-purple-500/20 text-white' : 'text-gray-400 hover:text-white'}`}><BookOpenIcon className="w-3 h-3" /> Study</button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user.role === 'ADMIN' && (
            <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10 text-[9px] font-bold">
              <button onClick={() => setAdminViewMode('STUDENT')} className={`px-2 py-1 rounded transition ${adminViewMode === 'STUDENT' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>Student</button>
              <button onClick={() => setAdminViewMode('ADMIN')} className={`px-2 py-1 rounded transition ${adminViewMode === 'ADMIN' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>Admin</button>
            </div>
          )}
          <button onClick={handleExit} className="text-gray-400 hover:text-white transition flex items-center gap-1 text-xs bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
            <ArrowLeft className="w-3.5 h-3.5" /> Exit
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* Floating progress bar for lesson blocks */}
        {totalInteractiveBlocks > 0 && assignViewMode === 'WORK' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/80 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 flex items-center gap-3 shadow-lg">
            <CheckCircle2 className={`w-4 h-4 ${blocksCompleted === totalInteractiveBlocks ? 'text-green-400' : 'text-purple-400'}`} />
            <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${blocksCompleted === totalInteractiveBlocks ? 'bg-green-500' : 'bg-purple-500'}`}
                style={{ width: `${(blocksCompleted / totalInteractiveBlocks) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-300">{blocksCompleted}/{totalInteractiveBlocks}</span>
          </div>
        )}

        <Suspense fallback={<LazyFallback />}>
          {assignViewMode === 'WORK' && (
            <div className="h-full flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Proctor
                  onComplete={handleEngagementComplete}
                  onBlockProgress={handleBlockProgress}
                  contentUrl={activeAssignment.contentUrl}
                  htmlContent={activeAssignment.htmlContent}
                  userId={user.id}
                  assignmentId={activeAssignment.id}
                  classType={activeAssignment.classType}
                  lessonBlocks={activeAssignment.lessonBlocks}
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
          {assignViewMode === 'REVIEW' && (
            <div className="h-full bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
              <ReviewQuestions assignment={activeAssignment} />
            </div>
          )}
          {assignViewMode === 'STUDY' && (
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

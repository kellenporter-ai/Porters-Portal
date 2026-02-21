
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TelemetryMetrics } from '../types';
import { createInitialMetrics } from '../lib/telemetry';
import { db, callAwardQuestionXP } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { PlayCircle, Eye, Clock, AlertTriangle, Maximize2, Minimize2, Zap, CheckCircle2, XCircle, RotateCcw, Trophy } from 'lucide-react';
import ProctorTTS from './ProctorTTS';
import AnnotationOverlay from './AnnotationOverlay';
import LessonBlocks, { LessonBlock } from './LessonBlocks';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { sfx } from '../lib/sfx';

interface ProctorProps {
  onComplete: (metrics: TelemetryMetrics) => void;
  contentUrl?: string | null;
  htmlContent?: string;
  userId?: string;
  assignmentId?: string;
  classType?: string;
  lessonBlocks?: LessonBlock[];
}

// ============================================================
// PROCTOR BRIDGE PROTOCOL
// ============================================================
// HTML practice sets communicate with the parent app via postMessage.
//
// IFRAME → PARENT messages:
//   { type: 'portal-ready' }
//     Sent when the HTML file has loaded and wants to receive saved state.
//
//   { type: 'portal-save', payload: { state: {...}, currentQuestion: number } }
//     Sent when the HTML file wants to save progress.
//
//   { type: 'portal-answer', payload: { questionId: string, correct: boolean, attempts: number } }
//     Sent after the student submits an answer. Triggers XP award if correct + first attempt.
//
//   { type: 'portal-complete', payload: { score: number, totalQuestions: number, correctAnswers: number } }
//     Sent when the student finishes/completes the entire module. Creates a permanent completion snapshot.
//
//   { type: 'portal-replay' }
//     Sent when the student wants to replay a completed module. Resets active state but preserves completion records.
//
// PARENT → IFRAME messages:
//   { type: 'portal-init', payload: { userId: string, savedState: {...} | null, completionInfo: {...} | null } }
//     Sent in response to 'portal-ready'. Provides saved state and any completion records.
//
//   { type: 'portal-xp-result', payload: { questionId: string, awarded: boolean, xp: number } }
//     Sent after XP award attempt. Lets the HTML file show a toast or badge.
//
//   { type: 'portal-reset-ok' }
//     Sent after a replay request is processed. Active state is cleared; completions preserved.
//
// To integrate, HTML files replace their Firebase SDK with the bridge snippet.
// See public/portalBridge.js for the drop-in replacement.
// ============================================================

interface CompletionSnapshot {
  completedAt: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  answeredQuestions: string[];
}

interface PracticeProgressDoc {
  userId: string;
  assignmentId: string;
  state: Record<string, unknown> | null;
  currentQuestion: number;
  answeredQuestions: string[];
  lastUpdated: string;
  // Completion tracking
  completed: boolean;
  completedAt: string | null;
  bestScore: number | null;
  totalCompletions: number;
  completionHistory: CompletionSnapshot[];
}

const Proctor: React.FC<ProctorProps> = ({ onComplete, contentUrl, htmlContent, userId, assignmentId, classType, lessonBlocks }) => {
  const metricsRef = useRef<TelemetryMetrics>(createInitialMetrics());
  const lastInteractionRef = useRef<number>(Date.now());
  const onCompleteRef = useRef(onComplete);
  const [isActive, setIsActive] = useState(true);
  const [displayTime, setDisplayTime] = useState(0);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [xpToast, setXpToast] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [xpEarnedSession, setXpEarnedSession] = useState(0);
  const [moduleCompleted, setModuleCompleted] = useState(false);
  const [completionCount, setCompletionCount] = useState(0);
  const [showReplayPrompt, setShowReplayPrompt] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const iframeWrapperRef = useRef<HTMLDivElement>(null);
  const awardedQuestionsRef = useRef<Set<string>>(new Set());
  const progressDocRef = useRef<PracticeProgressDoc | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ttsText, setTtsText] = useState('');

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const handleInteraction = useCallback(() => {
      lastInteractionRef.current = Date.now();
      if (!isActive) setIsActive(true);
  }, [isActive]);

  // Session Timer
  useEffect(() => {
      const interval = setInterval(() => {
          const now = Date.now();
          if (now - lastInteractionRef.current < 60000) {
              metricsRef.current.engagementTime += 1;
              setDisplayTime(metricsRef.current.engagementTime);
              if (!isActive) setIsActive(true);
          } else {
              if (isActive) setIsActive(false);
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [isActive]);

  // Global Listeners for AFK detection
  useEffect(() => {
      const events = ['mousemove', 'keydown', 'scroll', 'click'];
      events.forEach(ev => window.addEventListener(ev, handleInteraction));
      return () => events.forEach(ev => window.removeEventListener(ev, handleInteraction));
  }, [handleInteraction]);

  // ONE-TIME Submission on Unmount
  useEffect(() => {
      return () => { onCompleteRef.current(metricsRef.current); };
  }, []);

  // ============================================================
  // BRIDGE: Listen for postMessage from iframe
  // ============================================================
  useEffect(() => {
    if (!userId || !assignmentId) return;

    const handleMessage = async (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      // Only accept messages from the iframe's own origin or our app origin
      const iframeSrc = iframe.src ? new URL(iframe.src).origin : '';
      if (event.origin !== window.location.origin && event.origin !== iframeSrc) return;

      const targetOrigin = event.origin;
      const data = event.data;
      if (!data || typeof data !== 'object' || !data.type?.startsWith('portal-')) return;

      handleInteraction();

      switch (data.type) {
        case 'portal-ready': {
          setBridgeConnected(true);
          try {
            const progressDoc = await getDoc(doc(db, 'practice_progress', `${userId}_${assignmentId}`));
            const docData = progressDoc.exists() ? progressDoc.data() as PracticeProgressDoc : null;

            // Restore awarded questions set
            const answeredQuestions: string[] = docData?.answeredQuestions || [];
            answeredQuestions.forEach((qId: string) => awardedQuestionsRef.current.add(qId));
            setQuestionsAnswered(answeredQuestions.length);

            // Track completion state
            if (docData) {
              progressDocRef.current = docData;
              if (docData.completed) {
                setModuleCompleted(true);
                setCompletionCount(docData.totalCompletions || 1);
              }
            }

            // Build saved state (always send the last active state)
            const savedState = docData ? { state: docData.state || null, currentQuestion: docData.currentQuestion ?? 0 } : null;

            // Build completion info for the iframe
            const completionInfo = docData?.completed ? {
              completed: true,
              completedAt: docData.completedAt,
              bestScore: docData.bestScore,
              totalCompletions: docData.totalCompletions || 0,
              lastCompletion: docData.completionHistory?.length > 0
                ? docData.completionHistory[docData.completionHistory.length - 1]
                : null,
            } : null;

            iframe.contentWindow?.postMessage({
              type: 'portal-init',
              payload: { userId, savedState, completionInfo }
            }, targetOrigin);
          } catch (err) {
            console.error('Bridge: Failed to load saved state', err);
            iframe.contentWindow?.postMessage({
              type: 'portal-init',
              payload: { userId, savedState: null, completionInfo: null }
            }, targetOrigin);
          }
          break;
        }

        case 'portal-save': {
          const { state, currentQuestion } = data.payload || {};
          if (!state) break;
          try {
            // Preserve existing completion data when saving
            const existingDoc = progressDocRef.current;
            const saveData: Record<string, unknown> = {
              userId,
              assignmentId,
              state,
              currentQuestion: currentQuestion ?? 0,
              answeredQuestions: Array.from(awardedQuestionsRef.current),
              lastUpdated: new Date().toISOString(),
            };
            // Always preserve completion fields if they exist
            if (existingDoc?.completed) {
              saveData.completed = existingDoc.completed;
              saveData.completedAt = existingDoc.completedAt;
              saveData.bestScore = existingDoc.bestScore;
              saveData.totalCompletions = existingDoc.totalCompletions;
              saveData.completionHistory = existingDoc.completionHistory;
            }

            await setDoc(doc(db, 'practice_progress', `${userId}_${assignmentId}`), saveData, { merge: true });

            // Update local ref
            progressDocRef.current = { ...progressDocRef.current, ...saveData } as PracticeProgressDoc;

            iframe.contentWindow?.postMessage({ type: 'portal-save-ok' }, targetOrigin);
          } catch (err) {
            console.error('Bridge: Save failed', err);
            iframe.contentWindow?.postMessage({ type: 'portal-save-error' }, targetOrigin);
          }
          break;
        }

        case 'portal-complete': {
          // Module completed — create a permanent completion snapshot
          const { score, totalQuestions, correctAnswers } = data.payload || {};
          try {
            const existingDoc = progressDocRef.current;
            const now = new Date().toISOString();
            const snapshot: CompletionSnapshot = {
              completedAt: now,
              score: score ?? 0,
              totalQuestions: totalQuestions ?? 0,
              correctAnswers: correctAnswers ?? 0,
              answeredQuestions: Array.from(awardedQuestionsRef.current),
            };

            const completionHistory = [...(existingDoc?.completionHistory || []), snapshot];
            const bestScore = Math.max(existingDoc?.bestScore || 0, score || 0);
            const totalCompletions = (existingDoc?.totalCompletions || 0) + 1;

            const saveData: Record<string, unknown> = {
              userId,
              assignmentId,
              completed: true,
              completedAt: existingDoc?.completedAt || now, // Preserve first completion date
              bestScore,
              totalCompletions,
              completionHistory,
              answeredQuestions: Array.from(awardedQuestionsRef.current),
              lastUpdated: now,
            };
            // Preserve current active state too
            if (existingDoc?.state) {
              saveData.state = existingDoc.state;
              saveData.currentQuestion = existingDoc.currentQuestion;
            }

            await setDoc(doc(db, 'practice_progress', `${userId}_${assignmentId}`), saveData, { merge: true });

            progressDocRef.current = { ...progressDocRef.current, ...saveData } as PracticeProgressDoc;
            setModuleCompleted(true);
            setCompletionCount(totalCompletions);

            sfx.xpGain();
            setXpToast({ text: 'Module Complete!', type: 'success' });
            setTimeout(() => setXpToast(null), 3000);

            iframe.contentWindow?.postMessage({ type: 'portal-complete-ok', payload: { totalCompletions, bestScore } }, targetOrigin);
          } catch (err) {
            console.error('Bridge: Completion save failed', err);
            iframe.contentWindow?.postMessage({ type: 'portal-complete-error' }, targetOrigin);
          }
          break;
        }

        case 'portal-replay': {
          // Student wants to replay — reset active state but PRESERVE completion records
          try {
            const existingDoc = progressDocRef.current;
            const saveData: Record<string, unknown> = {
              userId,
              assignmentId,
              state: null,
              currentQuestion: 0,
              // Keep answered questions for XP tracking (they won't get double-awarded)
              answeredQuestions: Array.from(awardedQuestionsRef.current),
              lastUpdated: new Date().toISOString(),
              // Preserve ALL completion data
              completed: existingDoc?.completed || false,
              completedAt: existingDoc?.completedAt || null,
              bestScore: existingDoc?.bestScore || null,
              totalCompletions: existingDoc?.totalCompletions || 0,
              completionHistory: existingDoc?.completionHistory || [],
            };

            await setDoc(doc(db, 'practice_progress', `${userId}_${assignmentId}`), saveData, { merge: true });
            progressDocRef.current = saveData as unknown as PracticeProgressDoc;
            setShowReplayPrompt(false);

            iframe.contentWindow?.postMessage({ type: 'portal-reset-ok' }, targetOrigin);
          } catch (err) {
            console.error('Bridge: Replay reset failed', err);
          }
          break;
        }

        case 'portal-answer': {
          const { questionId, correct, attempts } = data.payload || {};
          if (!questionId) break;

          if (correct && !awardedQuestionsRef.current.has(questionId)) {
            awardedQuestionsRef.current.add(questionId);
            setQuestionsAnswered(prev => prev + 1);

            const xpAmount = attempts === 1 ? 15 : 10;

            try {
              const result = await callAwardQuestionXP({
                assignmentId,
                questionId,
                xpAmount,
                classType: classType || 'Uncategorized'
              });
              const resultData = result.data as { awarded: boolean; serverXP?: number };

              if (resultData.awarded) {
                const earnedXP = resultData.serverXP || xpAmount;
                setXpEarnedSession(prev => prev + earnedXP);
                setXpToast({ text: `+${earnedXP} XP`, type: 'success' });
                sfx.xpGain();
                setTimeout(() => setXpToast(null), 2000);
              }

              iframe.contentWindow?.postMessage({
                type: 'portal-xp-result',
                payload: { questionId, awarded: resultData.awarded, xp: resultData.serverXP || xpAmount }
              }, targetOrigin);
            } catch (err) {
              console.error('Bridge: XP award failed', err);
              iframe.contentWindow?.postMessage({
                type: 'portal-xp-result',
                payload: { questionId, awarded: false, xp: 0 }
              }, targetOrigin);
            }
          } else if (correct) {
            iframe.contentWindow?.postMessage({
              type: 'portal-xp-result',
              payload: { questionId, awarded: false, xp: 0 }
            }, targetOrigin);
          }
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [userId, assignmentId, classType, handleInteraction]);

  // Handle replay button click (parent-initiated replay)
  const handleReplayClick = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !userId || !assignmentId) return;

    // Send replay message to iframe
    const iframeSrc = iframe.src ? new URL(iframe.src).origin : '';
    const targetOrigin = iframeSrc || window.location.origin;

    // Reset active state server-side
    (async () => {
      try {
        const existingDoc = progressDocRef.current;
        const saveData: Record<string, unknown> = {
          userId,
          assignmentId,
          state: null,
          currentQuestion: 0,
          answeredQuestions: Array.from(awardedQuestionsRef.current),
          lastUpdated: new Date().toISOString(),
          completed: existingDoc?.completed || false,
          completedAt: existingDoc?.completedAt || null,
          bestScore: existingDoc?.bestScore || null,
          totalCompletions: existingDoc?.totalCompletions || 0,
          completionHistory: existingDoc?.completionHistory || [],
        };
        await setDoc(doc(db, 'practice_progress', `${userId}_${assignmentId}`), saveData, { merge: true });
        progressDocRef.current = saveData as unknown as PracticeProgressDoc;
        setShowReplayPrompt(false);

        iframe.contentWindow?.postMessage({ type: 'portal-reset-ok' }, targetOrigin);
      } catch (err) {
        console.error('Replay reset failed', err);
      }
    })();
  }, [userId, assignmentId]);

  // Fullscreen toggle for iframe
  const toggleFullscreen = useCallback(() => {
    const wrapper = iframeWrapperRef.current;
    if (!wrapper) return;
    if (!document.fullscreenElement) {
      wrapper.requestFullscreen().catch(() => {
        // Fullscreen API not available — fall back to CSS-only expand
        setIsFullscreen(prev => !prev);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Sync state when exiting fullscreen via Escape key
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // LaTeX Rendering + TTS text extraction
  useEffect(() => {
    if (contentRef.current && htmlContent) {
        const renderedHtml = htmlContent.replace(/\$(.*?)\$/g, (_, tex) => {
            try { return katex.renderToString(tex, { throwOnError: false }); }
            catch { return tex; }
        });
        contentRef.current.innerHTML = DOMPurify.sanitize(renderedHtml, {
            ADD_TAGS: ['annotation', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac', 'mtext', 'math'],
            ADD_ATTR: ['xmlns', 'encoding']
        });
        // Extract plain text for TTS
        setTtsText(contentRef.current.textContent || '');
    }
  }, [htmlContent]);

  return (
    <div className="flex flex-col h-full bg-black/20 border border-white/10 rounded-2xl overflow-hidden relative">
        {/* HUD */}
        <div className="bg-black/40 backdrop-blur-md px-4 py-2 flex justify-between items-center border-b border-white/5 z-20">
            <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 text-sm font-bold ${isActive ? 'text-green-400' : 'text-yellow-500'}`}>
                    {isActive ? <PlayCircle className="w-4 h-4" /> : <Clock className="w-4 h-4 animate-pulse" />}
                    {isActive ? 'Active Session' : 'Away (Paused)'}
                </div>
                <div className="text-xs text-gray-400 font-mono bg-black/40 px-2 py-1 rounded">
                    TIME: {Math.floor(displayTime / 60)}m {displayTime % 60}s
                </div>
                {bridgeConnected && questionsAnswered > 0 && (
                    <div className="flex items-center gap-2 text-xs font-bold text-purple-300 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                        <CheckCircle2 className="w-3 h-3" /> {questionsAnswered} answered
                    </div>
                )}
                {bridgeConnected && xpEarnedSession > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                        <Zap className="w-3 h-3" /> {xpEarnedSession} XP
                    </div>
                )}
                {/* Completion badge */}
                {moduleCompleted && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-green-300 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                        <Trophy className="w-3 h-3" />
                        Completed{completionCount > 1 ? ` (${completionCount}x)` : ''}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-3">
                {/* TTS — Screen Reader */}
                {(htmlContent || ttsText) && (
                    <ProctorTTS textContent={ttsText} compact />
                )}

                {/* Annotation toggle — rendered from AnnotationOverlay in content area */}

                {/* Replay button for completed modules */}
                {moduleCompleted && bridgeConnected && (
                    showReplayPrompt ? (
                        <div className="flex items-center gap-2 bg-black/60 rounded-lg px-3 py-1 border border-white/10">
                            <span className="text-[10px] text-gray-400">Replay from start?</span>
                            <button onClick={handleReplayClick} className="text-[10px] font-bold text-green-400 hover:text-green-300 px-2 py-0.5 bg-green-500/10 rounded transition">Yes</button>
                            <button onClick={() => setShowReplayPrompt(false)} className="text-[10px] font-bold text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded transition">Cancel</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowReplayPrompt(true)}
                            className="flex items-center gap-1.5 text-[10px] text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-full border border-blue-500/20 uppercase font-bold tracking-widest transition-colors cursor-pointer"
                            title="Replay this module from the start (your completion record is preserved)"
                        >
                            <RotateCcw className="w-3 h-3" /> Replay
                        </button>
                    )
                )}
                {contentUrl && (
                    <button
                        onClick={toggleFullscreen}
                        className="flex items-center gap-1.5 text-[10px] text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2.5 py-1 rounded-full border border-purple-500/20 uppercase font-bold tracking-widest transition-colors cursor-pointer"
                        title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
                    >
                        {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                        {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
                    </button>
                )}
                {bridgeConnected && (
                    <div className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20 uppercase font-bold tracking-widest">
                        <Zap className="w-3 h-3" /> XP Linked
                    </div>
                )}
                {!isActive && (
                    <div className="flex items-center gap-2 text-[10px] text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full border border-yellow-500/20 uppercase font-bold tracking-widest">
                        <AlertTriangle className="w-3 h-3" /> Resume movement for XP
                    </div>
                )}
            </div>
        </div>

        {/* XP Toast */}
        {xpToast && (
            <div className="absolute top-14 right-4 z-30 animate-in slide-in-from-right fade-in duration-300">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg font-bold text-sm ${
                    xpToast.type === 'success'
                        ? 'bg-green-600/90 text-white border border-green-400/30'
                        : 'bg-blue-600/90 text-white border border-blue-400/30'
                }`}>
                    {xpToast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {xpToast.text}
                </div>
            </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
            {contentUrl ? (
                <div ref={iframeWrapperRef} className="flex-1 flex flex-col bg-white relative">
                    <iframe
                        ref={iframeRef}
                        src={contentUrl}
                        className="w-full flex-1 border-none bg-white"
                        title="Resource Viewer"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        onLoad={handleInteraction}
                    />
                    {/* Annotation drawing overlay on top of iframe */}
                    <AnnotationOverlay containerRef={iframeWrapperRef} />
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-600 italic">
                    <div className="text-center">
                        <Eye className="w-12 h-12 mx-auto mb-2 opacity-10" />
                        <p className="font-mono text-sm uppercase">No interactive link found.</p>
                    </div>
                </div>
            )}

            {htmlContent && (
                <div className="h-1/3 bg-[#0f0720]/95 border-t border-white/10 overflow-y-auto p-6 text-gray-300 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] z-10 custom-scrollbar">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                            <Maximize2 className="w-4 h-4 text-purple-400" /> Operational Context
                        </h3>
                        {ttsText && <ProctorTTS textContent={ttsText} />}
                    </div>
                    <div ref={contentRef} className="proctor-content text-sm leading-relaxed" />
                </div>
            )}

            {/* Lesson Blocks — interactive block-based content */}
            {lessonBlocks && lessonBlocks.length > 0 && (
                <div className="h-2/5 bg-[#0f0720]/95 border-t border-white/10 overflow-y-auto p-6 text-gray-300 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] z-10 custom-scrollbar">
                    <h3 className="text-white font-bold mb-4 text-xs uppercase tracking-widest flex items-center gap-2">
                        <Maximize2 className="w-4 h-4 text-purple-400" /> Interactive Lesson
                    </h3>
                    <LessonBlocks blocks={lessonBlocks} showSidebar engagementTime={displayTime} xpEarned={xpEarnedSession} />
                </div>
            )}
        </div>
    </div>
  );
};

export default Proctor;

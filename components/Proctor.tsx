
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TelemetryMetrics } from '../types';
import { createInitialMetrics } from '../lib/telemetry';
import { db, callAwardQuestionXP } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { PlayCircle, Eye, Clock, AlertTriangle, Maximize2, Minimize2, Zap, CheckCircle2, XCircle } from 'lucide-react';
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
// PARENT → IFRAME messages:
//   { type: 'portal-init', payload: { userId: string, savedState: {...} | null } }
//     Sent in response to 'portal-ready'. Provides the user ID and any saved state.
//
//   { type: 'portal-xp-result', payload: { questionId: string, awarded: boolean, xp: number } }
//     Sent after XP award attempt. Lets the HTML file show a toast or badge.
//
// To integrate, HTML files replace their Firebase SDK with the bridge snippet.
// See public/portalBridge.js for the drop-in replacement.
// ============================================================

const Proctor: React.FC<ProctorProps> = ({ onComplete, contentUrl, htmlContent, userId, assignmentId, classType }) => {
  const metricsRef = useRef<TelemetryMetrics>(createInitialMetrics());
  const lastInteractionRef = useRef<number>(Date.now());
  const onCompleteRef = useRef(onComplete);
  const [isActive, setIsActive] = useState(true);
  const [displayTime, setDisplayTime] = useState(0); 
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [xpToast, setXpToast] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [xpEarnedSession, setXpEarnedSession] = useState(0);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const iframeWrapperRef = useRef<HTMLDivElement>(null);
  const awardedQuestionsRef = useRef<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);

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
            const docData = progressDoc.exists() ? progressDoc.data() : null;
            const savedState = docData ? { state: docData.state || null, currentQuestion: docData.currentQuestion ?? 0 } : null;
            const answeredQuestions: string[] = docData?.answeredQuestions || [];
            answeredQuestions.forEach((qId: string) => awardedQuestionsRef.current.add(qId));
            setQuestionsAnswered(answeredQuestions.length);

            iframe.contentWindow?.postMessage({
              type: 'portal-init',
              payload: { userId, savedState }
            }, targetOrigin);
          } catch (err) {
            console.error('Bridge: Failed to load saved state', err);
            iframe.contentWindow?.postMessage({
              type: 'portal-init',
              payload: { userId, savedState: null }
            }, targetOrigin);
          }
          break;
        }

        case 'portal-save': {
          const { state, currentQuestion } = data.payload || {};
          if (!state) break;
          try {
            await setDoc(doc(db, 'practice_progress', `${userId}_${assignmentId}`), {
              userId,
              assignmentId,
              state,
              currentQuestion: currentQuestion ?? 0,
              answeredQuestions: Array.from(awardedQuestionsRef.current),
              lastUpdated: new Date().toISOString()
            }, { merge: true });
            iframe.contentWindow?.postMessage({ type: 'portal-save-ok' }, targetOrigin);
          } catch (err) {
            console.error('Bridge: Save failed', err);
            iframe.contentWindow?.postMessage({ type: 'portal-save-error' }, targetOrigin);
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

  // LaTeX Rendering
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
            </div>
            <div className="flex items-center gap-3">
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
                <div ref={iframeWrapperRef} className="flex-1 flex flex-col bg-white">
                    <iframe
                        ref={iframeRef}
                        src={contentUrl}
                        className="w-full flex-1 border-none bg-white"
                        title="Resource Viewer"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        onLoad={handleInteraction}
                    />
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
                    <h3 className="text-white font-bold mb-3 text-xs uppercase tracking-widest flex items-center gap-2">
                        <Maximize2 className="w-4 h-4 text-purple-400" /> Operational Context
                    </h3>
                    <div ref={contentRef} className="proctor-content text-sm leading-relaxed" />
                </div>
            )}
        </div>
    </div>
  );
};

export default Proctor;

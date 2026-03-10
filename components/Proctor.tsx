
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TelemetryMetrics } from '../types';
import { createInitialMetrics } from '../lib/telemetry';
import { db, callAwardQuestionXP, callStartAssessmentSession, callArchiveAndClearResponses } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { PlayCircle, Eye, Clock, AlertTriangle, Maximize2, Minimize2, Zap, CheckCircle2, XCircle, RotateCcw, Trophy, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import ProctorTTS from './ProctorTTS';
import AnnotationOverlay from './AnnotationOverlay';
import LessonBlocks, { LessonBlock, BlockResponseMap } from './LessonBlocks';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { sfx } from '../lib/sfx';
import { reportError } from '../lib/errorReporting';

const escapeHtml = (str: string): string =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Convert Google Drive share/view links to embeddable preview URLs. */
const toGoogleDrivePreview = (url: string): string => {
  const fileIdMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
  const openIdMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch) return `https://drive.google.com/file/d/${openIdMatch[1]}/preview`;
  return url;
};

interface ProctorProps {
  onComplete: (metrics: TelemetryMetrics) => void;
  onBlockProgress?: (completed: number) => void;
  contentUrl?: string | null;
  htmlContent?: string;
  userId?: string;
  assignmentId?: string;
  classType?: string;
  lessonBlocks?: LessonBlock[];
  isAssessment?: boolean;
  onGetMetricsAndResponses?: React.MutableRefObject<(() => { metrics: TelemetryMetrics; responses: BlockResponseMap }) | null>;
  onSessionToken?: (token: string | null) => void;
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

const Proctor: React.FC<ProctorProps> = ({ onComplete, onBlockProgress, contentUrl, htmlContent, userId, assignmentId, classType, lessonBlocks, isAssessment, onGetMetricsAndResponses, onSessionToken }) => {
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
  const [focusMode, setFocusMode] = useState<'balanced' | 'simulation' | 'lessons'>('balanced');
  const [ttsText, setTtsText] = useState('');
  const [lessonBlocksAnswered, setLessonBlocksAnswered] = useState(0);
  const awardedBlocksRef = useRef<Set<string>>(new Set());

  // Track component mount state for async handlers (e.g. message event getDoc calls)
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Lesson block response persistence
  const [savedBlockResponses, setSavedBlockResponses] = useState<BlockResponseMap | undefined>(undefined);
  const blockResponsesRef = useRef<BlockResponseMap>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blockResetKey, setBlockResetKey] = useState(0);

  // Assessment telemetry
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const currentBlockRef = useRef<string | null>(null);
  const blockTimingStartRef = useRef<number>(Date.now());
  const blockTimingRef = useRef<Record<string, number>>({});
  const keystrokeTimesRef = useRef<number[]>([]);
  const [sessionTokenError, setSessionTokenError] = useState<string | null>(null);

  // Start assessment session and obtain server-issued token
  useEffect(() => {
    if (!isAssessment || !assignmentId) return;

    // Check for existing session token (localStorage survives tab close; sessionStorage is backup)
    const storageKey = `assessment_session_${assignmentId}`;
    const cached = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
    if (cached) {
      // Keep both in sync
      localStorage.setItem(storageKey, cached);
      sessionStorage.setItem(storageKey, cached);
      onSessionToken?.(cached);
      return;
    }

    let cancelled = false;
    const requestToken = async () => {
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const result = await callStartAssessmentSession({ assignmentId });
          const data = result.data as { sessionToken: string; startedAt: number };
          if (cancelled) return;
          localStorage.setItem(storageKey, data.sessionToken);
          sessionStorage.setItem(storageKey, data.sessionToken);
          onSessionToken?.(data.sessionToken);
          setSessionTokenError(null);
          return;
        } catch (err: unknown) {
          if (cancelled) return;
          const errMsg = err instanceof Error ? err.message : String(err);
          // If it's a definitive error (not transient), don't retry
          if (errMsg.includes('resource-exhausted') || errMsg.includes('permission-denied')) {
            setSessionTokenError(errMsg);
            onSessionToken?.(null);
            return;
          }
          if (attempt < MAX_RETRIES - 1) {
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        }
      }
      // All retries failed
      if (!cancelled) {
        setSessionTokenError('Unable to start assessment session. Please check your internet connection and refresh the page.');
        onSessionToken?.(null);
      }
    };
    requestToken();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAssessment, assignmentId]);

  // Load saved lesson block responses on mount
  // For ASSESSMENTS: always start fresh — clear any pre-existing saved responses to prevent
  // the exploit where students pre-fill answers via DevTools/Firestore before the timer starts.
  // For non-assessments: load saved responses as before (resume where they left off).
  useEffect(() => {
    if (!userId || !assignmentId || !lessonBlocks || lessonBlocks.length === 0) return;
    let cancelled = false;
    const docId = `${userId}_${assignmentId}_blocks`;
    if (isAssessment) {
      // Check if student already has an active session (e.g. page refresh or tab re-open).
      // If so, restore their in-progress work instead of wiping it.
      // localStorage survives tab closure; sessionStorage is same-tab only.
      const storageKey = `assessment_session_${assignmentId}`;
      const hasActiveSession = !!(localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey));

      if (hasActiveSession) {
        // Mid-assessment refresh — restore saved responses
        getDoc(doc(db, 'lesson_block_responses', docId)).then(snap => {
          if (cancelled) return;
          if (snap.exists()) {
            const data = snap.data();
            const responses = data.responses || {};
            blockResponsesRef.current = responses;
            setSavedBlockResponses(responses);
          } else {
            setSavedBlockResponses({});
          }
        }).catch(err => {
          if (cancelled) return;
          reportError(err, { component: 'Proctor', context: 'Failed to load assessment block responses after refresh' });
          setSavedBlockResponses({});
        });
      } else {
        // Check if this is a retake with pre-filled responses from the prior submission
        const docId = `${userId}_${assignmentId}_blocks`;
        const handleFreshStart = async () => {
          const snap = await getDoc(doc(db, 'lesson_block_responses', docId));
          if (snap.exists() && snap.data().retakePreFilled) {
            // Retake: load pre-filled responses, clear the flag
            const data = snap.data();
            const responses = data.responses || {};
            await updateDoc(doc(db, 'lesson_block_responses', docId), { retakePreFilled: false });
            return responses;
          }
          // Fresh assessment start — archive & clear via atomic Cloud Function
          try {
            await callArchiveAndClearResponses({ assignmentId });
          } catch (err) {
            reportError(err, { component: 'Proctor', context: 'Failed to archive and clear assessment responses' });
            await setDoc(doc(db, 'lesson_block_responses', docId), {
              userId,
              assignmentId,
              responses: {},
              lastUpdated: new Date().toISOString(),
            });
          }
          return {};
        };
        handleFreshStart().then((responses) => {
          if (cancelled) return;
          blockResponsesRef.current = responses;
          setSavedBlockResponses(responses);
        }).catch(err => {
          if (cancelled) return;
          reportError(err, { component: 'Proctor', context: 'Failed to handle assessment fresh start' });
          blockResponsesRef.current = {};
          setSavedBlockResponses({});
        });
      }
    } else {
      getDoc(doc(db, 'lesson_block_responses', docId)).then(snap => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          const responses = data.responses || {};
          blockResponsesRef.current = responses;
          setSavedBlockResponses(responses);
        } else {
          setSavedBlockResponses({});
        }
      }).catch(err => {
        if (cancelled) return;
        reportError(err, { component: 'Proctor', context: 'Failed to load lesson block responses' });
        setSavedBlockResponses({});
      });
    }
    return () => { cancelled = true; };
  }, [userId, assignmentId, lessonBlocks, isAssessment]);

  // Debounced save of lesson block responses to Firestore
  const handleBlockResponseChange = useCallback((blockId: string, response: unknown) => {
    // Track per-block timing
    const now = Date.now();
    if (currentBlockRef.current && currentBlockRef.current !== blockId) {
      const elapsed = (now - blockTimingStartRef.current) / 1000;
      blockTimingRef.current[currentBlockRef.current] = (blockTimingRef.current[currentBlockRef.current] || 0) + elapsed;
    }
    if (currentBlockRef.current !== blockId) {
      currentBlockRef.current = blockId;
      blockTimingStartRef.current = now;
    }
    // Update per-block timing in metrics
    metricsRef.current.perBlockTiming = { ...blockTimingRef.current };

    blockResponsesRef.current = { ...blockResponsesRef.current, [blockId]: response };
    if (!userId || !assignmentId) return;
    // Debounce: save 1.5s after last change
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const docId = `${userId}_${assignmentId}_blocks`;
      setDoc(doc(db, 'lesson_block_responses', docId), {
        userId,
        assignmentId,
        responses: blockResponsesRef.current,
        lastUpdated: new Date().toISOString(),
      }, { merge: true }).catch(err => reportError(err, { method: 'saveBlockResponses', assignmentId }));
    }, 1500);
  }, [userId, assignmentId]);

  // Flush pending saves immediately (shared by unmount, beforeunload, and visibilitychange)
  const flushPendingSaves = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (userId && assignmentId && Object.keys(blockResponsesRef.current).length > 0) {
      const docId = `${userId}_${assignmentId}_blocks`;
      setDoc(doc(db, 'lesson_block_responses', docId), {
        userId,
        assignmentId,
        responses: blockResponsesRef.current,
        lastUpdated: new Date().toISOString(),
      }, { merge: true }).catch(err => reportError(err, { method: 'flushBlockResponses', assignmentId }));
    }
  }, [userId, assignmentId]);

  // Flush pending saves on unmount
  useEffect(() => {
    return () => flushPendingSaves();
  }, [flushPendingSaves]);

  // Flush pending saves when tab is hidden or page is closing
  useEffect(() => {
    const handleVisibilityFlush = () => {
      if (document.visibilityState === 'hidden') flushPendingSaves();
    };
    const handleBeforeUnload = () => flushPendingSaves();
    document.addEventListener('visibilitychange', handleVisibilityFlush);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityFlush);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushPendingSaves]);

  // Clear saved lesson block responses (Firestore + local state)
  const handleClearBlockResponses = useCallback(async () => {
    if (!userId || !assignmentId) return;
    // Cancel any pending save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const docId = `${userId}_${assignmentId}_blocks`;
    try {
      await deleteDoc(doc(db, 'lesson_block_responses', docId));
    } catch { /* doc may not exist */ }
    blockResponsesRef.current = {};
    setSavedBlockResponses({});
    setBlockResetKey(prev => prev + 1); // Force remount of LessonBlocks
  }, [userId, assignmentId]);

  // Export lesson block progress to PDF
  const handleExportBlocksPdf = useCallback(() => {
    if (!lessonBlocks || lessonBlocks.length === 0) return;
    const responses = blockResponsesRef.current;

    // Build HTML for each block with student responses
    const blockHtmlSections = lessonBlocks.map(block => {
      const resp = responses[block.id];
      let questionHtml = '';
      let answerHtml = '';

      switch (block.type) {
        case 'TEXT':
          questionHtml = `<div style="white-space:pre-line">${escapeHtml(block.content)}</div>`;
          break;
        case 'SECTION_HEADER':
          questionHtml = `<h2 style="margin:0;font-size:18px">${escapeHtml(block.title || block.content)}</h2>${block.subtitle ? `<p style="color:#666;margin:4px 0 0">${escapeHtml(block.subtitle)}</p>` : ''}`;
          break;
        case 'MC':
          questionHtml = `<p><strong>Multiple Choice:</strong> ${escapeHtml(block.content)}</p><ul style="list-style:none;padding:0">${(block.options || []).map((opt, i) => {
            const isSelected = resp?.selected === i;
            const isCorrect = i === block.correctAnswer;
            const marker = isSelected ? (isCorrect ? '&#10003;' : '&#10007;') : '&bull;';
            const style = isSelected ? (isCorrect ? 'color:green;font-weight:bold' : 'color:red;font-weight:bold') : '';
            return `<li style="${style}">${marker} ${escapeHtml(opt)}</li>`;
          }).join('')}</ul>`;
          answerHtml = resp?.answered ? `<p>Your answer: <strong>${escapeHtml((block.options || [])[resp.selected] || 'N/A')}</strong></p>` : '<p style="color:#999"><em>Not answered</em></p>';
          break;
        case 'SHORT_ANSWER':
          questionHtml = `<p><strong>Short Answer:</strong> ${escapeHtml(block.content)}</p>`;
          answerHtml = resp?.answered ? `<p>Your answer: <strong>${escapeHtml(resp.answer || '')}</strong> ${resp.isCorrect ? '<span style="color:green">&#10003;</span>' : '<span style="color:red">&#10007;</span>'}</p>` : '<p style="color:#999"><em>Not answered</em></p>';
          break;
        case 'CHECKLIST':
          questionHtml = `<p><strong>Checklist:</strong> ${escapeHtml(block.content)}</p><ul style="list-style:none;padding:0">${(block.items || []).map((item, i) => {
            const isChecked = resp?.checked?.includes(i);
            return `<li>${isChecked ? '&#9745;' : '&#9744;'} ${escapeHtml(item)}</li>`;
          }).join('')}</ul>`;
          break;
        case 'SORTING': {
          const sortItems = block.sortItems || [];
          questionHtml = `<p><strong>Sorting:</strong> ${escapeHtml(block.content)}</p>`;
          if (resp?.submitted) {
            const left = Object.entries(resp.placements || {}).filter(([, v]) => v === 'left').map(([k]) => sortItems[parseInt(k)]?.text || '');
            const right = Object.entries(resp.placements || {}).filter(([, v]) => v === 'right').map(([k]) => sortItems[parseInt(k)]?.text || '');
            answerHtml = `<table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #ddd;padding:6px;text-align:left">${escapeHtml(block.leftLabel || 'Left')}</th><th style="border:1px solid #ddd;padding:6px;text-align:left">${escapeHtml(block.rightLabel || 'Right')}</th></tr><tr><td style="border:1px solid #ddd;padding:6px;vertical-align:top">${left.map(t => escapeHtml(t)).join('<br>')}</td><td style="border:1px solid #ddd;padding:6px;vertical-align:top">${right.map(t => escapeHtml(t)).join('<br>')}</td></tr></table>`;
          } else {
            answerHtml = '<p style="color:#999"><em>Not submitted</em></p>';
          }
          break;
        }
        case 'RANKING':
          questionHtml = `<p><strong>Ranking:</strong> ${escapeHtml(block.content)}</p>`;
          if (resp?.submitted && resp.order) {
            answerHtml = `<ol>${resp.order.map((o: { item: string }) => `<li>${escapeHtml(o.item)}</li>`).join('')}</ol>`;
          } else {
            answerHtml = '<p style="color:#999"><em>Not submitted</em></p>';
          }
          break;
        case 'LINKED':
          questionHtml = `<p><strong>Question:</strong> ${escapeHtml(block.content)}</p>`;
          answerHtml = resp?.answered ? `<p>Your answer: <strong>${escapeHtml(resp.answer || '')}</strong></p>` : '<p style="color:#999"><em>Not answered</em></p>';
          break;
        case 'DATA_TABLE':
          questionHtml = `<p><strong>Data Table:</strong> ${escapeHtml(block.content)}</p>`;
          if (resp?.data) {
            const cols = block.columns || [];
            answerHtml = `<table style="width:100%;border-collapse:collapse"><tr>${cols.map(c => `<th style="border:1px solid #ddd;padding:6px;text-align:left">${escapeHtml(c.label)}${c.unit ? ` (${escapeHtml(c.unit)})` : ''}</th>`).join('')}</tr>${(resp.data as Record<string, string>[]).map((row: Record<string, string>) => `<tr>${cols.map(c => `<td style="border:1px solid #ddd;padding:6px">${escapeHtml(row[c.key] || '')}</td>`).join('')}</tr>`).join('')}</table>`;
          } else {
            answerHtml = '<p style="color:#999"><em>No data entered</em></p>';
          }
          break;
        case 'BAR_CHART':
          questionHtml = `<p><strong>Bar Chart:</strong> ${escapeHtml(block.title || block.content || '')}</p>`;
          if (resp?.initial || resp?.delta || resp?.final) {
            const sections = ['initial', 'delta', 'final'];
            const sectionBars = sections.map(s => {
              const bars = (resp as Record<string, Array<{value: number; labelHTML: string}>>)[s];
              if (!bars?.length) return '';
              return `<div><strong>${s}:</strong> ${bars.map(b => `${b.labelHTML || '?'}=${b.value}`).join(', ')}</div>`;
            }).filter(Boolean).join('');
            answerHtml = sectionBars || '<p style="color:#999"><em>No data entered</em></p>';
          } else {
            answerHtml = '<p style="color:#999"><em>No data entered</em></p>';
          }
          break;
        case 'OBJECTIVES':
          questionHtml = `<p><strong>Objectives:</strong></p><ul>${(block.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
          break;
        case 'INFO_BOX':
          questionHtml = `<div style="background:#f0f0f0;padding:12px;border-radius:8px;border-left:4px solid ${block.variant === 'warning' ? '#f59e0b' : block.variant === 'tip' ? '#22c55e' : '#3b82f6'}"><strong>${block.variant === 'warning' ? 'Warning' : block.variant === 'tip' ? 'Tip' : 'Note'}:</strong> ${escapeHtml(block.content)}</div>`;
          break;
        case 'VOCABULARY':
          questionHtml = `<p><strong>${escapeHtml(block.term || '')}</strong>: ${escapeHtml(block.definition || '')}</p>`;
          break;
        case 'VOCAB_LIST':
          questionHtml = `<p><strong>Vocabulary List:</strong></p><dl>${(block.terms || []).map(t => `<dt style="font-weight:bold">${escapeHtml(t.term)}</dt><dd style="margin:0 0 8px 16px">${escapeHtml(t.definition)}</dd>`).join('')}</dl>`;
          break;
        case 'DIVIDER':
          questionHtml = '<hr style="border:none;border-top:1px solid #ddd;margin:8px 0">';
          break;
        default:
          if (block.content) questionHtml = `<div>${escapeHtml(block.content)}</div>`;
          break;
      }

      if (!questionHtml && !answerHtml) return '';
      return `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee">${questionHtml}${answerHtml}</div>`;
    }).filter(Boolean);

    const title = 'Lesson Progress Export';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:800px;margin:0 auto;padding:32px;color:#222;font-size:14px}h1{font-size:22px;border-bottom:2px solid #7c3aed;padding-bottom:8px;color:#7c3aed}table{margin:8px 0}@media print{body{padding:16px}}</style></head><body><h1>${title}</h1><p style="color:#666;font-size:12px">Exported on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>${blockHtmlSections.join('')}</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        win.print();
        // Revoke after a delay to ensure print dialog has the content
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      });
    }
  }, [lessonBlocks]);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const handleInteraction = useCallback(() => {
      lastInteractionRef.current = Date.now();
      if (!isActive) setIsActive(true);
  }, [isActive]);

  // Throttled version for high-frequency events (mousemove)
  const lastInteractionTimeRef = useRef(0);
  const throttledInteraction = useCallback(() => {
    const now = Date.now();
    if (now - lastInteractionTimeRef.current < 500) return;
    lastInteractionTimeRef.current = now;
    handleInteraction();
  }, [handleInteraction]);

  // Specific telemetry handlers
  const handleKeyDown = useCallback(() => {
    metricsRef.current.keystrokes++;
    // Typing cadence tracking
    const now = Date.now();
    keystrokeTimesRef.current.push(now);
    // Keep only last 50 timestamps for rolling window
    if (keystrokeTimesRef.current.length > 50) {
      keystrokeTimesRef.current.shift();
    }
    // Detect burst: 5+ keystrokes within 100ms each = likely paste
    const times = keystrokeTimesRef.current;
    if (times.length >= 5) {
      const last5 = times.slice(-5);
      const intervals = last5.slice(1).map((t, i) => t - last5[i]);
      if (intervals.every(iv => iv < 30)) {
        metricsRef.current.typingCadence = metricsRef.current.typingCadence || { avgIntervalMs: 0, burstCount: 0 };
        metricsRef.current.typingCadence.burstCount = (metricsRef.current.typingCadence.burstCount || 0) + 1;
      }
    }
    // Update average interval
    if (times.length >= 2) {
      const intervals = times.slice(1).map((t, i) => t - times[i]);
      metricsRef.current.typingCadence = metricsRef.current.typingCadence || { avgIntervalMs: 0, burstCount: 0 };
      metricsRef.current.typingCadence.avgIntervalMs = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
    }
    handleInteraction();
  }, [handleInteraction]);

  const handlePaste = useCallback(() => {
    metricsRef.current.pasteCount++;
    metricsRef.current.typingCadence = metricsRef.current.typingCadence || { avgIntervalMs: 0, burstCount: 0 };
    metricsRef.current.typingCadence.burstCount = (metricsRef.current.typingCadence.burstCount || 0) + 1;
    handleInteraction();
  }, [handleInteraction]);

  const handleClick = useCallback(() => {
    metricsRef.current.clickCount++;
    handleInteraction();
  }, [handleInteraction]);

  // Award XP when a lesson block is completed
  const handleBlockComplete = useCallback(async (blockId: string, correct: boolean) => {
    if (!correct || !userId || !assignmentId || awardedBlocksRef.current.has(blockId)) return;
    awardedBlocksRef.current.add(blockId);
    setLessonBlocksAnswered(prev => {
      const next = prev + 1;
      onBlockProgress?.(next);
      return next;
    });
    handleInteraction();
    const xpAmount = 15;
    try {
      const result = await callAwardQuestionXP({
        assignmentId,
        questionId: `block_${blockId}`,
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
    } catch (err) {
      reportError(err, { component: 'Proctor', context: 'Lesson block XP award failed' });
    }
  }, [userId, assignmentId, classType, handleInteraction]);

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

  // Global Listeners — specific handlers for telemetry, generic for AFK
  useEffect(() => {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('paste', handlePaste);
      window.addEventListener('click', handleClick);
      window.addEventListener('mousemove', throttledInteraction);
      window.addEventListener('scroll', handleInteraction);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('paste', handlePaste);
          window.removeEventListener('click', handleClick);
          window.removeEventListener('mousemove', throttledInteraction);
          window.removeEventListener('scroll', handleInteraction);
      };
  }, [handleKeyDown, handlePaste, handleClick, handleInteraction, throttledInteraction]);

  // Assessment: Track tab switches (visibilitychange only — blur fires on iframe focus)
  useEffect(() => {
    if (!isAssessment) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        metricsRef.current.tabSwitchCount = (metricsRef.current.tabSwitchCount || 0) + 1;
        setTabSwitchCount(metricsRef.current.tabSwitchCount);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAssessment]);

  // Expose metrics + responses getter for parent (assessment submission)
  useEffect(() => {
    if (onGetMetricsAndResponses) {
      onGetMetricsAndResponses.current = () => {
        // Flush current block timing
        if (currentBlockRef.current) {
          const elapsed = (Date.now() - blockTimingStartRef.current) / 1000;
          blockTimingRef.current[currentBlockRef.current] = (blockTimingRef.current[currentBlockRef.current] || 0) + elapsed;
          metricsRef.current.perBlockTiming = { ...blockTimingRef.current };
        }
        return {
          metrics: { ...metricsRef.current },
          responses: { ...blockResponsesRef.current },
        };
      };
    }
    return () => {
      if (onGetMetricsAndResponses) onGetMetricsAndResponses.current = null;
    };
  }, [onGetMetricsAndResponses]);

  // ONE-TIME Submission on Unmount
  useEffect(() => {
      return () => {
        onCompleteRef.current(metricsRef.current);
        blockTimingRef.current = {};
        keystrokeTimesRef.current = [];
      };
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
            if (!mountedRef.current) return;
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
            reportError(err, { component: 'Proctor', context: 'Bridge: Failed to load saved state' });
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
            reportError(err, { component: 'Proctor', context: 'Bridge: Save failed' });
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
            reportError(err, { component: 'Proctor', context: 'Bridge: Completion save failed' });
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
            reportError(err, { component: 'Proctor', context: 'Bridge: Replay reset failed' });
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
              reportError(err, { component: 'Proctor', context: 'Bridge: XP award failed' });
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
        reportError(err, { component: 'Proctor', context: 'Replay reset failed' });
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

  // Compute flex proportions based on focus mode
  const iframeFlex = focusMode === 'simulation' ? 'flex-1' : 'flex-[3]';
  const lessonFlex = focusMode === 'lessons' ? 'flex-1' : 'flex-[2]';

  // Transform Google Drive URLs for the main iframe
  const resolvedContentUrl = contentUrl ? toGoogleDrivePreview(contentUrl) : contentUrl;

  // Block assessment if session token request failed
  if (isAssessment && sessionTokenError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black/20 border border-white/10 rounded-2xl p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">Cannot Start Assessment</h3>
        <p className="text-gray-300 text-sm max-w-md mb-4">{sessionTokenError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm transition-colors"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black/20 border border-white/10 rounded-2xl overflow-hidden relative">
        {/* HUD */}
        <div className="bg-black/40 backdrop-blur-md px-4 py-2 flex flex-wrap justify-between items-center gap-y-1 border-b border-white/5 z-20">
            <div className="flex items-center gap-4 flex-wrap">
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
                {!bridgeConnected && lessonBlocksAnswered > 0 && (
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                        <CheckCircle2 className="w-3 h-3" /> {lessonBlocksAnswered} blocks completed
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
            <div className="flex items-center gap-3 flex-wrap">
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
                {isAssessment && tabSwitchCount > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 uppercase font-bold tracking-widest">
                        <AlertTriangle className="w-3 h-3" /> Tab Switch Detected ({tabSwitchCount})
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
                <>
                    <div ref={iframeWrapperRef} className={`flex flex-col bg-white relative min-h-0 transition-all duration-300 ${
                        isFullscreen && !document.fullscreenElement
                            ? 'fixed inset-0 z-50'
                            : lessonBlocks && lessonBlocks.length > 0 ? iframeFlex : 'flex-1'
                    }`} style={focusMode === 'lessons' ? { display: 'none' } : undefined}>
                        <iframe
                            ref={iframeRef}
                            src={resolvedContentUrl || ''}
                            className="w-full flex-1 border-none bg-white"
                            title="Resource Viewer"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
                            allow="fullscreen"
                            allowFullScreen
                            onLoad={handleInteraction}
                        />
                        {/* Annotation drawing overlay on top of iframe */}
                        <AnnotationOverlay containerRef={iframeWrapperRef} assignmentId={assignmentId} />
                    </div>
                    {/* Focus mode toggle bar */}
                    {lessonBlocks && lessonBlocks.length > 0 && (
                        <div className="flex items-center justify-center gap-2 bg-black/60 py-1.5 px-3 z-10 shrink-0 border-y border-white/5">
                            <button
                                onClick={() => setFocusMode(prev => prev === 'simulation' ? 'balanced' : 'simulation')}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${focusMode === 'simulation' ? 'text-purple-300 bg-purple-500/20 border border-purple-500/30' : 'text-gray-400 bg-white/5 border border-white/10 hover:text-gray-200 hover:bg-white/10'}`}
                                title="Expand simulation"
                            >
                                <ChevronUp className="w-3.5 h-3.5" /> Simulation
                            </button>
                            <div className="w-6 h-0.5 bg-white/20 rounded-full" />
                            <button
                                onClick={() => setFocusMode(prev => prev === 'lessons' ? 'balanced' : 'lessons')}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${focusMode === 'lessons' ? 'text-purple-300 bg-purple-500/20 border border-purple-500/30' : 'text-gray-400 bg-white/5 border border-white/10 hover:text-gray-200 hover:bg-white/10'}`}
                                title="Expand lessons"
                            >
                                <ChevronDown className="w-3.5 h-3.5" /> Lessons
                            </button>
                        </div>
                    )}
                    {/* Lesson Blocks as bottom panel alongside iframe */}
                    {lessonBlocks && lessonBlocks.length > 0 && (
                        <div className={`${lessonFlex} min-h-0 bg-[#0f0720]/95 border-t border-white/10 overflow-y-auto p-6 text-gray-300 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] z-10 custom-scrollbar transition-all duration-300`} style={focusMode === 'simulation' ? { display: 'none' } : undefined}>
                            {savedBlockResponses === undefined ? (
                                <div className="flex items-center justify-center h-32 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading progress...</div>
                            ) : (
                                <LessonBlocks key={blockResetKey} blocks={lessonBlocks} onBlockComplete={handleBlockComplete} showSidebar engagementTime={displayTime} xpEarned={xpEarnedSession} savedResponses={savedBlockResponses} onResponseChange={handleBlockResponseChange} onExportPdf={handleExportBlocksPdf} onClearResponses={handleClearBlockResponses} />
                            )}
                        </div>
                    )}
                </>
            ) : lessonBlocks && lessonBlocks.length > 0 ? (
                /* Lesson-only mode: blocks fill the entire content area */
                <div className="flex-1 bg-[#0f0720]/95 overflow-y-auto p-6 text-gray-300 custom-scrollbar">
                    {savedBlockResponses === undefined ? (
                        <div className="flex items-center justify-center h-32 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading progress...</div>
                    ) : (
                        <LessonBlocks key={blockResetKey} blocks={lessonBlocks} onBlockComplete={handleBlockComplete} showSidebar engagementTime={displayTime} xpEarned={xpEarnedSession} savedResponses={savedBlockResponses} onResponseChange={handleBlockResponseChange} onExportPdf={handleExportBlocksPdf} onClearResponses={handleClearBlockResponses} />
                    )}
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
        </div>
    </div>
  );
};

export default Proctor;

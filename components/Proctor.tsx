
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TelemetryMetrics } from '../types';
import { createInitialMetrics } from '../lib/telemetry';
import { db, callAwardQuestionXP, callStartAssessmentSession, callStartResourceSession, callArchiveAndClearResponses } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { PlayCircle, Eye, Clock, AlertTriangle, Maximize2, Minimize2, Zap, CheckCircle2, XCircle, RotateCcw, Trophy, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import ProctorTTS from './ProctorTTS';
import SaveStatusIndicator from './SaveStatusIndicator';
import LessonBlocks, { LessonBlock, BlockResponseMap } from './LessonBlocks';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { sfx } from '../lib/sfx';
import { reportError } from '../lib/errorReporting';
import { usePersistentSave } from '../lib/usePersistentSave';
import { persistentWrite, draftKey, clearDraft, syncDirtyDraft, WriteStatus } from '../lib/persistentWrite';

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
  /** Admin preview mode — disables all Firestore writes, XP awards, and telemetry persistence. */
  previewMode?: boolean;
  /** Whether LessonProgressSidebar is visible — hides redundant HUD badges */
  hasSidebar?: boolean;
  /** Ref exposed upward so ResourceViewer can call flushNow() for Save & Exit flow. */
  flushRef?: React.MutableRefObject<(() => Promise<WriteStatus> | undefined) | null>;
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
//   { type: 'portal-activity' }
//     Heartbeat sent periodically (~30s) while the student is interacting.
//     Resets the Proctor's inactivity timer so engagement time is tracked accurately.
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

const Proctor: React.FC<ProctorProps> = ({ onComplete, onBlockProgress, contentUrl, htmlContent, userId, assignmentId, classType, lessonBlocks, isAssessment, onGetMetricsAndResponses, onSessionToken, previewMode, hasSidebar, flushRef }) => {
  const metricsRef = useRef<TelemetryMetrics>(createInitialMetrics());
  const metricsFailCountRef = useRef(0);
  const lastInteractionRef = useRef<number>(Date.now());
  const onCompleteRef = useRef(onComplete);
  const [isActive, setIsActive] = useState(true);
  const isActiveRef = useRef(true);
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
  const [blockResetKey, setBlockResetKey] = useState(0);

  // Persistent save hook — replaces inline debounce + flush logic
  const {
    saveStatus,
    updateResponse: hookUpdateResponse,
    flushNow,
    getResponses,
    clearAll: clearSavedResponses,
    isOnline,
    errorSince,
    setInitialResponses,
  } = usePersistentSave({
    userId,
    assignmentId,
    collection: 'lesson_block_responses',
    disabled: previewMode,
  });

  // Expose flushNow upward so ResourceViewer can call it for Save & Exit flow
  useEffect(() => {
    if (flushRef) flushRef.current = flushNow;
    return () => { if (flushRef) flushRef.current = null; };
  }, [flushRef, flushNow]);

  // Sync dirty practice drafts from localStorage on mount and online recovery
  useEffect(() => {
    if (previewMode || !userId || !assignmentId || !isOnline) return;
    const practiceLsKey = draftKey('practice', userId, assignmentId);
    syncDirtyDraft(practiceLsKey, 'practice_progress', `${userId}_${assignmentId}`);
  }, [userId, assignmentId, isOnline]);

  // Assessment telemetry
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [blurCount, setBlurCount] = useState(0);
  const currentBlockRef = useRef<string | null>(null);
  const blockTimingStartRef = useRef<number>(Date.now());
  const blockTimingRef = useRef<Record<string, number>>({});
  const keystrokeTimesRef = useRef<number[]>([]);
  const [sessionTokenError, setSessionTokenError] = useState<string | null>(null);
  const [assistiveTech, setAssistiveTech] = useState(false);
  const assistiveTechRef = useRef(false);
  const firstInteractionRef = useRef<number | null>(null);

  // Start assessment session and obtain server-issued token
  useEffect(() => {
    if (previewMode || !isAssessment || !assignmentId) return;

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

  // Start resource session for non-assessments (server-observed elapsed time)
  useEffect(() => {
    if (previewMode || isAssessment || !assignmentId) return;

    let cancelled = false;
    const requestResourceSession = async () => {
      try {
        const result = await callStartResourceSession({ assignmentId });
        const data = result.data as { sessionToken: string; startedAt: number };
        if (cancelled) return;
        metricsRef.current.sessionToken = data.sessionToken;
      } catch (err: unknown) {
        if (cancelled) return;
        // Non-blocking: submission will fall back to hard bounds
        reportError(err, { component: 'Proctor', context: 'Failed to start resource session' });
      }
    };
    requestResourceSession();
    return () => { cancelled = true; };
  }, [isAssessment, assignmentId, previewMode]);

  // Load saved lesson block responses on mount
  // For ASSESSMENTS: always start fresh — clear any pre-existing saved responses to prevent
  // the exploit where students pre-fill answers via DevTools/Firestore before the timer starts.
  // For non-assessments: load saved responses as before (resume where they left off).
  useEffect(() => {
    if (!userId || !assignmentId || !lessonBlocks || lessonBlocks.length === 0) return;
    // Preview mode — start with empty responses, no Firestore reads
    if (previewMode) {
      setSavedBlockResponses({});
      return;
    }
    // Restore telemetry metrics from sessionStorage on refresh (assessments only)
    if (isAssessment) {
      const metricsKey = `assessment_metrics_${assignmentId}`;
      const savedMetrics = sessionStorage.getItem(metricsKey);
      if (savedMetrics) {
        try {
          const parsed = JSON.parse(savedMetrics);
          if (parsed && typeof parsed === 'object') {
            metricsRef.current = {
              ...createInitialMetrics(),
              ...parsed.metrics,
              // Preserve original startTime so server elapsed is accurate
              startTime: parsed.metrics?.startTime || metricsRef.current.startTime,
            };
            setDisplayTime(metricsRef.current.engagementTime);
            setTabSwitchCount(metricsRef.current.tabSwitchCount || 0);
            setBlurCount(metricsRef.current.blurCount || 0);
            if (parsed.assistiveTech) {
              setAssistiveTech(true);
              assistiveTechRef.current = true;
            }
          }
        } catch {
          // Ignore corrupt sessionStorage
        }
      }
    }
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
            setInitialResponses(responses, data.lastUpdated);
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
        const handleFreshStart = async (): Promise<{ responses: Record<string, unknown>; lastUpdated: string }> => {
          const snap = await getDoc(doc(db, 'lesson_block_responses', docId));
          if (snap.exists() && snap.data().retakePreFilled) {
            // Retake: load pre-filled responses, clear the flag
            const data = snap.data();
            const responses = data.responses || {};
            await updateDoc(doc(db, 'lesson_block_responses', docId), { retakePreFilled: false });
            return { responses, lastUpdated: data.lastUpdated || new Date().toISOString() };
          }
          // Session recovery: if server has responses, the student has work in progress.
          // Always restore — students can take unlimited time on assessments.
          if (snap.exists()) {
            const data = snap.data();
            const responses = data.responses || {};
            if (Object.keys(responses).length > 0) {
              // Session recovery — always restore existing draft responses
              const storageKey = `assessment_session_${assignmentId}`;
              try {
                const result = await callStartAssessmentSession({ assignmentId });
                const tokenData = result.data as { sessionToken: string };
                localStorage.setItem(storageKey, tokenData.sessionToken);
                sessionStorage.setItem(storageKey, tokenData.sessionToken);
                onSessionToken?.(tokenData.sessionToken);
              } catch {
                // If token request fails, still restore work — don't lose data
              }
              return { responses, lastUpdated: data.lastUpdated || new Date().toISOString() };
            }
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
          return { responses: {}, lastUpdated: new Date().toISOString() };
        };
        handleFreshStart().then(({ responses, lastUpdated }) => {
          if (cancelled) return;
          setInitialResponses(responses, lastUpdated);
          setSavedBlockResponses(responses);
        }).catch(err => {
          if (cancelled) return;
          reportError(err, { component: 'Proctor', context: 'Failed to handle assessment fresh start' });
          setInitialResponses({});
          setSavedBlockResponses(getResponses());
        });
      }
    } else {
      getDoc(doc(db, 'lesson_block_responses', docId)).then(snap => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          const responses = data.responses || {};
          setInitialResponses(responses, data.lastUpdated);
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

  // Block response change handler — tracks per-block timing, delegates save to hook
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

    // Delegate to persistent save hook (handles debounce, retry, localStorage mirror)
    hookUpdateResponse(blockId, response);
  }, [hookUpdateResponse]);

  // Clear saved lesson block responses (Firestore + localStorage + local state)
  const handleClearBlockResponses = useCallback(async () => {
    if (!userId || !assignmentId) return;
    clearSavedResponses(); // Cancels pending saves + clears localStorage draft
    if (!previewMode) {
      const docId = `${userId}_${assignmentId}_blocks`;
      try {
        await deleteDoc(doc(db, 'lesson_block_responses', docId));
      } catch { /* doc may not exist */ }
    }
    setSavedBlockResponses({});
    setBlockResetKey(prev => prev + 1); // Force remount of LessonBlocks
  }, [userId, assignmentId, clearSavedResponses, previewMode]);

  // Export lesson block progress to PDF
  const handleExportBlocksPdf = useCallback(() => {
    if (!lessonBlocks || lessonBlocks.length === 0) return;
    const responses = getResponses() as BlockResponseMap;

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
      if (!firstInteractionRef.current) {
        firstInteractionRef.current = Date.now();
        metricsRef.current.firstInteractionTime = Date.now();
      }
      if (!isActiveRef.current) {
        isActiveRef.current = true;
        setIsActive(true);
      }
  }, []);

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

  const handleBeforeInput = useCallback((e: InputEvent) => {
    const inputType = e.inputType;
    if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
      // Catches programmatic paste and drag-and-drop that bypass native paste event
      metricsRef.current.pasteCount++;
      handleInteraction();
    } else if (inputType === 'insertReplacementText' || inputType === 'insertFromComposition') {
      // Catches Grammarly rewrites, mobile auto-suggest, dictation, IME composition
      metricsRef.current.autoInsertCount = (metricsRef.current.autoInsertCount || 0) + 1;
      handleInteraction();
    }
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
    if (previewMode) return; // Skip XP award in preview mode
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
  }, [userId, assignmentId, classType, handleInteraction, previewMode]);

  // Session Timer — pauses when tab is hidden to avoid inflating engagement during tab-away
  useEffect(() => {
      const interval = setInterval(() => {
          if (document.hidden) return;
          const now = Date.now();
          if (now - lastInteractionRef.current < 60000) {
              metricsRef.current.engagementTime += 1;
              setDisplayTime(metricsRef.current.engagementTime);
              if (!isActiveRef.current) {
                isActiveRef.current = true;
                setIsActive(true);
              }
          } else {
              if (isActiveRef.current) {
                isActiveRef.current = false;
                setIsActive(false);
              }
          }
      }, 1000);

      const handleVisibility = () => {
        if (!document.hidden) {
          // Reset interaction baseline on return so timer resumes immediately
          lastInteractionRef.current = Date.now();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
  }, []);

  // Large text insertion detection (catches paste bypasses that skip paste/beforeinput)
  const handleInput = useCallback((e: InputEvent) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (!target || !('value' in target)) return;
    // If a single input event adds >20 chars, it's likely a paste or auto-fill
    if (e.data && e.data.length > 20) {
      metricsRef.current.pasteCount++;
      handleInteraction();
    }
  }, [handleInteraction]);

  // Global Listeners — specific handlers for telemetry, generic for AFK
  useEffect(() => {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('paste', handlePaste);
      window.addEventListener('drop', handlePaste); // Treat drag-and-drop as paste
      window.addEventListener('beforeinput', handleBeforeInput as EventListener);
      window.addEventListener('input', handleInput as EventListener);
      window.addEventListener('click', handleClick);
      window.addEventListener('mousemove', throttledInteraction);
      window.addEventListener('scroll', throttledInteraction);
      window.addEventListener('pointerdown', throttledInteraction);
      window.addEventListener('pointermove', throttledInteraction);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('paste', handlePaste);
          window.removeEventListener('drop', handlePaste);
          window.removeEventListener('beforeinput', handleBeforeInput as EventListener);
          window.removeEventListener('input', handleInput as EventListener);
          window.removeEventListener('click', handleClick);
          window.removeEventListener('mousemove', throttledInteraction);
          window.removeEventListener('scroll', throttledInteraction);
          window.removeEventListener('pointerdown', throttledInteraction);
          window.removeEventListener('pointermove', throttledInteraction);
      };
  }, [handleKeyDown, handlePaste, handleBeforeInput, handleInput, handleClick, handleInteraction, throttledInteraction]);

  // Assessment: Track tab switches / away events (visibilitychange + blur)
  useEffect(() => {
    if (!isAssessment) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        metricsRef.current.tabSwitchCount = (metricsRef.current.tabSwitchCount || 0) + 1;
        setTabSwitchCount(metricsRef.current.tabSwitchCount);
      }
    };
    const handleBlur = () => {
      // blur on window means focus left the browser entirely (not just an iframe)
      metricsRef.current.blurCount = (metricsRef.current.blurCount || 0) + 1;
      setBlurCount(metricsRef.current.blurCount);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isAssessment]);

  // Persist metrics snapshot to draft doc (for submitOnBehalf to read)
  useEffect(() => {
    if (previewMode || !isAssessment || !userId || !assignmentId) return;
    const metricsDocId = `${userId}_${assignmentId}_blocks`;

    const saveMetricsSnapshot = () => {
      const m = metricsRef.current;
      // Fire-and-forget — don't block the UI
      updateDoc(doc(db, 'lesson_block_responses', metricsDocId), {
        metricsSnapshot: {
          engagementTime: m.engagementTime,
          keystrokes: m.keystrokes,
          pasteCount: m.pasteCount,
          clickCount: m.clickCount,
          autoInsertCount: m.autoInsertCount || 0,
          blurCount: m.blurCount || 0,
          tabSwitchCount: m.tabSwitchCount || 0,
          startTime: m.startTime,
          lastActive: Date.now(),
          perBlockTiming: m.perBlockTiming || {},
          typingCadence: m.typingCadence || {},
          wordCount: m.wordCount || 0,
          wordsPerSecond: m.wordsPerSecond || 0,
          assistiveTech: assistiveTechRef.current,
        },
      }).then(() => {
        metricsFailCountRef.current = 0;
      }).catch(() => {
        metricsFailCountRef.current += 1;
        if (metricsFailCountRef.current === 3) {
          window.dispatchEvent(new CustomEvent('portal-connectivity-degraded'));
        }
      });
    };

    // Save on visibility change (student leaves tab)
    const handleVis = () => {
      if (document.visibilityState === 'hidden') {
        saveMetricsSnapshot();
        // Also persist to sessionStorage for crash/refresh recovery
        const metricsKey = `assessment_metrics_${assignmentId}`;
        try {
          sessionStorage.setItem(metricsKey, JSON.stringify({
            metrics: metricsRef.current,
            assistiveTech: assistiveTechRef.current,
          }));
        } catch {
          // sessionStorage may be full — non-critical
        }
      }
    };
    document.addEventListener('visibilitychange', handleVis);

    // Periodic snapshot every 30s
    const interval = setInterval(saveMetricsSnapshot, 30000);

    // Before unload: emergency sessionStorage persistence
    const handleBeforeUnload = () => {
      const metricsKey = `assessment_metrics_${assignmentId}`;
      try {
        sessionStorage.setItem(metricsKey, JSON.stringify({
          metrics: metricsRef.current,
          assistiveTech: assistiveTechRef.current,
        }));
      } catch {
        // Ignore
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(interval);
      // Final snapshot on unmount
      saveMetricsSnapshot();
    };
  }, [isAssessment, userId, assignmentId]);

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
        // Flush pending save before reading responses
        flushNow();
        return {
          metrics: { ...metricsRef.current, assistiveTech: assistiveTechRef.current },
          responses: { ...getResponses() },
        };
      };
    }
    return () => {
      if (onGetMetricsAndResponses) onGetMetricsAndResponses.current = null;
    };
  }, [onGetMetricsAndResponses, flushNow, getResponses]);

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

            // Check for bridge localStorage recovery data (from beforeunload/pagehide)
            const bridgeKey = `portalBridge_${userId}_lastState`;
            try {
              const recoveredRaw = localStorage.getItem(bridgeKey);
              if (recoveredRaw) {
                const recovered = JSON.parse(recoveredRaw);
                if (recovered?.state) {
                  // Save recovered bridge state to Firestore via the normal practice_progress path
                  if (!previewMode) {
                    const practiceDocId = `${userId}_${assignmentId}`;
                    const practiceLsKey = draftKey('practice', userId!, assignmentId!);
                    const recoveryData: Record<string, unknown> = {
                      userId,
                      assignmentId,
                      state: recovered.state.state || recovered.state,
                      currentQuestion: recovered.state.currentQuestion ?? 0,
                      lastUpdated: recovered.timestamp || new Date().toISOString(),
                    };
                    persistentWrite('practice_progress', practiceDocId, recoveryData, practiceLsKey).catch(() => {});
                  }
                }
                localStorage.removeItem(bridgeKey);
              }
            } catch { /* ignore recovery errors */ }
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

          // Update local ref
          progressDocRef.current = { ...progressDocRef.current, ...saveData } as PracticeProgressDoc;

          if (previewMode) {
            iframe.contentWindow?.postMessage({ type: 'portal-save-ok' }, targetOrigin);
            break;
          }
          const practiceLsKey = draftKey('practice', userId!, assignmentId!);
          const practiceDocId = `${userId}_${assignmentId}`;
          const result = await persistentWrite('practice_progress', practiceDocId, saveData, practiceLsKey);

          if (result === 'saved') {
            iframe.contentWindow?.postMessage({ type: 'portal-save-ok' }, targetOrigin);
          } else {
            iframe.contentWindow?.postMessage({ type: 'portal-save-error' }, targetOrigin);
          }
          break;
        }

        case 'portal-complete': {
          // Module completed — create a permanent completion snapshot
          const { score, totalQuestions, correctAnswers } = data.payload || {};
          const existingDocC = progressDocRef.current;
          const now = new Date().toISOString();
          const snapshot: CompletionSnapshot = {
            completedAt: now,
            score: score ?? 0,
            totalQuestions: totalQuestions ?? 0,
            correctAnswers: correctAnswers ?? 0,
            answeredQuestions: Array.from(awardedQuestionsRef.current),
          };

          const completionHistory = [...(existingDocC?.completionHistory || []), snapshot];
          const bestScore = Math.max(existingDocC?.bestScore || 0, score || 0);
          const totalCompletions = (existingDocC?.totalCompletions || 0) + 1;

          const completeSaveData: Record<string, unknown> = {
            userId,
            assignmentId,
            completed: true,
            completedAt: existingDocC?.completedAt || now,
            bestScore,
            totalCompletions,
            completionHistory,
            answeredQuestions: Array.from(awardedQuestionsRef.current),
            lastUpdated: now,
          };
          if (existingDocC?.state) {
            completeSaveData.state = existingDocC.state;
            completeSaveData.currentQuestion = existingDocC.currentQuestion;
          }

          progressDocRef.current = { ...progressDocRef.current, ...completeSaveData } as PracticeProgressDoc;
          setModuleCompleted(true);
          setCompletionCount(totalCompletions);

          sfx.xpGain();
          setXpToast({ text: 'Module Complete!', type: 'success' });
          setTimeout(() => setXpToast(null), 3000);

          if (previewMode) {
            iframe.contentWindow?.postMessage({ type: 'portal-complete-ok', payload: { totalCompletions, bestScore } }, targetOrigin);
            break;
          }
          const completeLsKey = draftKey('practice', userId!, assignmentId!);
          const completeDocId = `${userId}_${assignmentId}`;
          const completeResult = await persistentWrite('practice_progress', completeDocId, completeSaveData, completeLsKey);

          if (completeResult === 'saved') {
            iframe.contentWindow?.postMessage({ type: 'portal-complete-ok', payload: { totalCompletions, bestScore } }, targetOrigin);
          } else {
            iframe.contentWindow?.postMessage({ type: 'portal-complete-error' }, targetOrigin);
          }
          break;
        }

        case 'portal-replay': {
          // Student wants to replay — reset active state but PRESERVE completion records
          const existingDocR = progressDocRef.current;
          const replaySaveData: Record<string, unknown> = {
            userId,
            assignmentId,
            state: null,
            currentQuestion: 0,
            answeredQuestions: Array.from(awardedQuestionsRef.current),
            lastUpdated: new Date().toISOString(),
            completed: existingDocR?.completed || false,
            completedAt: existingDocR?.completedAt || null,
            bestScore: existingDocR?.bestScore || null,
            totalCompletions: existingDocR?.totalCompletions || 0,
            completionHistory: existingDocR?.completionHistory || [],
          };

          progressDocRef.current = replaySaveData as unknown as PracticeProgressDoc;
          setShowReplayPrompt(false);

          if (!previewMode) {
            const replayLsKey = draftKey('practice', userId!, assignmentId!);
            const replayDocId = `${userId}_${assignmentId}`;
            clearDraft(replayLsKey);
            await persistentWrite('practice_progress', replayDocId, replaySaveData, replayLsKey);
          }

          iframe.contentWindow?.postMessage({ type: 'portal-reset-ok' }, targetOrigin);
          break;
        }

        case 'portal-answer': {
          const { questionId, correct, attempts } = data.payload || {};
          if (!questionId) break;

          if (correct && !awardedQuestionsRef.current.has(questionId)) {
            awardedQuestionsRef.current.add(questionId);
            setQuestionsAnswered(prev => prev + 1);

            if (previewMode) {
              iframe.contentWindow?.postMessage({
                type: 'portal-xp-result',
                payload: { questionId, awarded: false, xp: 0 }
              }, targetOrigin);
              break;
            }

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

    const iframeSrc = iframe.src ? new URL(iframe.src).origin : '';
    const targetOrigin = iframeSrc || window.location.origin;

    (async () => {
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
      if (!previewMode) {
        const replayLsKey = draftKey('practice', userId, assignmentId);
        clearDraft(replayLsKey);
        await persistentWrite('practice_progress', `${userId}_${assignmentId}`, saveData, replayLsKey);
      }
      if (!mountedRef.current) return;
      progressDocRef.current = saveData as unknown as PracticeProgressDoc;
      setShowReplayPrompt(false);

      iframe.contentWindow?.postMessage({ type: 'portal-reset-ok' }, targetOrigin);
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

  // Block assessment if session token request failed (skip in preview mode)
  if (isAssessment && sessionTokenError && !previewMode) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400 mb-4" />
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Cannot Start Assessment</h3>
        <p className="text-[var(--text-secondary)] text-sm max-w-md mb-4">{sessionTokenError}</p>
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
    <div className="flex flex-col h-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl overflow-hidden relative">
        {/* Preview Mode Banner */}
        {previewMode && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-center text-[11.5px] font-bold text-amber-300 tracking-widest uppercase z-20">
            <Eye className="w-3 h-3 inline mr-1.5 -mt-0.5" />
            Admin Preview — No data will be saved
          </div>
        )}
        {/* HUD */}
        <div className={`bg-[var(--surface-base)] px-4 ${hasSidebar ? 'py-1' : 'py-2'} flex flex-wrap justify-between items-center gap-y-1 border-b border-[var(--border)] z-20 shrink-0`}>
            <div className="flex items-center gap-4 flex-wrap">
                <div className={`flex items-center gap-2 ${hasSidebar ? 'text-xs' : 'text-sm'} font-bold ${isActive ? 'text-green-600 dark:text-green-400' : 'text-yellow-500'}`}>
                    {isActive ? <PlayCircle className={hasSidebar ? 'w-3 h-3' : 'w-4 h-4'} /> : <Clock className={`${hasSidebar ? 'w-3 h-3' : 'w-4 h-4'} animate-pulse`} />}
                    {hasSidebar ? (isActive ? 'Active' : 'Paused') : (isActive ? 'Active Session' : 'Away (Paused)')}
                </div>
                {!hasSidebar && (
                  <div className="text-xs text-[var(--text-tertiary)] font-mono bg-[var(--panel-bg)] px-2 py-1 rounded" translate="no">
                      TIME: {Math.floor(displayTime / 60)}m {displayTime % 60}s
                  </div>
                )}
                {!hasSidebar && bridgeConnected && questionsAnswered > 0 && (
                    <div className="flex items-center gap-2 text-xs font-bold text-purple-300 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                        <CheckCircle2 className="w-3 h-3" /> {questionsAnswered} answered
                    </div>
                )}
                {!hasSidebar && !bridgeConnected && lessonBlocksAnswered > 0 && (
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                        <CheckCircle2 className="w-3 h-3" /> {lessonBlocksAnswered} blocks completed
                    </div>
                )}
                {!hasSidebar && bridgeConnected && xpEarnedSession > 0 && (
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
                {/* Save status indicator */}
                <SaveStatusIndicator status={saveStatus} isOnline={isOnline} isAssessment={isAssessment} errorSince={errorSince} />
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
                        <div className="flex items-center gap-2 bg-[var(--backdrop)] rounded-lg px-3 py-1 border border-[var(--border)]">
                            <span className="text-[11.5px] text-[var(--text-tertiary)]">Replay from start?</span>
                            <button onClick={handleReplayClick} className="text-[11.5px] font-bold text-green-600 dark:text-green-400 hover:text-green-300 px-2 py-0.5 bg-green-500/10 rounded transition">Yes</button>
                            <button onClick={() => setShowReplayPrompt(false)} className="text-[11.5px] font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] px-2 py-0.5 rounded transition">Cancel</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowReplayPrompt(true)}
                            className="flex items-center gap-1.5 text-[11.5px] text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-full border border-blue-500/20 uppercase font-bold tracking-widest transition-colors cursor-pointer"
                            title="Replay this module from the start (your completion record is preserved)"
                        >
                            <RotateCcw className="w-3 h-3" /> Replay
                        </button>
                    )
                )}
                {contentUrl && focusMode !== 'lessons' && (
                    <button
                        onClick={toggleFullscreen}
                        className="flex items-center gap-1.5 text-[11.5px] text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2.5 py-1 rounded-full border border-purple-500/20 uppercase font-bold tracking-widest transition-colors cursor-pointer"
                        title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
                    >
                        {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                        {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
                    </button>
                )}
                {!hasSidebar && bridgeConnected && (
                    <div className="flex items-center gap-1.5 text-[11.5px] text-green-600 dark:text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20 uppercase font-bold tracking-widest">
                        <Zap className="w-3 h-3" /> XP Linked
                    </div>
                )}
                {!hasSidebar && !isActive && (
                    <div className="flex items-center gap-2 text-[11.5px] text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full border border-yellow-500/20 uppercase font-bold tracking-widest">
                        <AlertTriangle className="w-3 h-3" /> Resume movement for XP
                    </div>
                )}
                {isAssessment && (tabSwitchCount > 0 || blurCount > 0) && (
                    <div className="flex items-center gap-2 text-[11.5px] text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 uppercase font-bold tracking-widest">
                        <AlertTriangle className="w-3 h-3" /> Away ({tabSwitchCount + blurCount})
                    </div>
                )}
                {isAssessment && (
                    <div className="flex items-center gap-1.5">
                        <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-tertiary)] bg-[var(--surface-glass)] px-2.5 py-1 rounded-full border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-glass-heavy)] transition">
                            <input
                                type="checkbox"
                                checked={assistiveTech}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setAssistiveTech(checked);
                                  assistiveTechRef.current = checked;
                                }}
                                className="w-4 h-4 accent-purple-600"
                                aria-describedby="assistive-tech-helper"
                            />
                            <span>Assistive Technology</span>
                        </label>
                        <span id="assistive-tech-helper" className="sr-only">
                            Check this box if you used dictation, voice typing, screen reader, or other assistive technology.
                            This prevents false integrity flags on your submission.
                        </span>
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
                    <div ref={iframeWrapperRef} className={`flex flex-col bg-white relative min-h-0 overflow-hidden transition-all duration-300 ${
                        isFullscreen && !document.fullscreenElement
                            ? 'fixed inset-0 z-50'
                            : lessonBlocks && lessonBlocks.length > 0 ? iframeFlex : 'flex-1'
                    }`} style={focusMode === 'lessons' ? { display: 'none' } : undefined}>
                        <iframe
                            ref={iframeRef}
                            src={resolvedContentUrl || ''}
                            className="w-full h-full min-h-0 border-none bg-white"
                            title="Resource Viewer"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
                            allow="fullscreen"
                            allowFullScreen
                            onLoad={handleInteraction}
                        />
                    </div>
                    {/* Focus mode toggle bar */}
                    {lessonBlocks && lessonBlocks.length > 0 && (
                        <div className="flex items-center justify-center gap-1.5 bg-[var(--surface-base)] py-0.5 px-2 z-10 shrink-0 border-y border-[var(--border)]">
                            <button
                                onClick={() => setFocusMode(prev => prev === 'simulation' ? 'balanced' : 'simulation')}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${focusMode === 'simulation' ? 'text-purple-300 bg-purple-500/20 border border-purple-500/30' : 'text-[var(--text-tertiary)] bg-[var(--surface-glass)] border border-[var(--border)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)]'}`}
                                title="Expand simulation"
                            >
                                <ChevronUp className="w-3.5 h-3.5" /> Simulation
                            </button>
                            <div className="w-6 h-0.5 bg-[var(--surface-glass-heavy)] rounded-full" />
                            <button
                                onClick={() => setFocusMode(prev => prev === 'lessons' ? 'balanced' : 'lessons')}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${focusMode === 'lessons' ? 'text-purple-300 bg-purple-500/20 border border-purple-500/30' : 'text-[var(--text-tertiary)] bg-[var(--surface-glass)] border border-[var(--border)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)]'}`}
                                title="Expand lessons"
                            >
                                <ChevronDown className="w-3.5 h-3.5" /> Lessons
                            </button>
                        </div>
                    )}
                    {/* Lesson Blocks as bottom panel alongside iframe */}
                    {lessonBlocks && lessonBlocks.length > 0 && (
                        <div className={`${lessonFlex} min-h-0 bg-[var(--surface-base)]/95 border-t border-[var(--border)] overflow-y-auto p-6 text-[var(--text-secondary)] shadow-[0_-10px_30px_rgba(0,0,0,0.8)] z-10 custom-scrollbar transition-all duration-300`} style={focusMode === 'simulation' ? { display: 'none' } : undefined}>
                            {savedBlockResponses === undefined ? (
                                <div className="flex items-center justify-center h-32 text-[var(--text-muted)]"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading progress...</div>
                            ) : (
                                <LessonBlocks key={blockResetKey} blocks={lessonBlocks} onBlockComplete={handleBlockComplete} showSidebar engagementTime={displayTime} xpEarned={xpEarnedSession} savedResponses={savedBlockResponses} onResponseChange={handleBlockResponseChange} onExportPdf={handleExportBlocksPdf} onClearResponses={handleClearBlockResponses} />
                            )}
                        </div>
                    )}
                </>
            ) : lessonBlocks && lessonBlocks.length > 0 ? (
                /* Lesson-only mode: blocks fill the entire content area */
                <div className="flex-1 bg-[var(--surface-base)]/95 overflow-y-auto p-6 text-[var(--text-secondary)] custom-scrollbar">
                    {savedBlockResponses === undefined ? (
                        <div className="flex items-center justify-center h-32 text-[var(--text-muted)]"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading progress...</div>
                    ) : (
                        <LessonBlocks key={blockResetKey} blocks={lessonBlocks} onBlockComplete={handleBlockComplete} showSidebar engagementTime={displayTime} xpEarned={xpEarnedSession} savedResponses={savedBlockResponses} onResponseChange={handleBlockResponseChange} onExportPdf={handleExportBlocksPdf} onClearResponses={handleClearBlockResponses} />
                    )}
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] italic">
                    <div className="text-center">
                        <Eye className="w-12 h-12 mx-auto mb-2 opacity-10" />
                        <p className="font-mono text-sm uppercase">No interactive link found.</p>
                    </div>
                </div>
            )}

            {htmlContent && (
                <div className="h-1/3 bg-[var(--surface-base)]/95 border-t border-[var(--border)] overflow-y-auto p-6 text-[var(--text-secondary)] shadow-[0_-10px_30px_rgba(0,0,0,0.8)] z-10 custom-scrollbar">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                            <Maximize2 className="w-4 h-4 text-[var(--accent-text)]" /> Operational Context
                        </h3>
                        {ttsText && <ProctorTTS textContent={ttsText} />}
                    </div>
                    <div ref={contentRef} className="proctor-content text-sm leading-relaxed" translate="no" />
                </div>
            )}
        </div>
    </div>
  );
};

export default Proctor;

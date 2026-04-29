import React from 'react';
import {
  FileText, ChevronLeft, ChevronRight, Clock, CheckCircle, AlertTriangle,
  Bot, Undo2, Eye, Users, Send,
} from 'lucide-react';
import katex from 'katex';
import type { Submission, Assignment, LessonBlock } from '../../types';
import type { StudentGroup } from './gradingHelpers';
import { getAwayEventColor, computeTotalTime, formatEngagementTime } from './gradingHelpers';
import { dataService } from '../../services/dataService';
import { reportError } from '../../lib/errorReporting';
import { callSubmitOnBehalf } from '../../lib/firebase';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

interface StudentResponsePanelProps {
  selectedGroup: StudentGroup | null;
  sub: Submission | null;
  selectedAssessment: Assignment | null;
  selectedAssessmentId: string | null;
  viewingDraftUserId: string | null;
  draftUserIds: Set<string>;
  draftResponses: Record<string, unknown> | null;
  draftLoading: boolean;
  currentUnifiedIndex: number;
  totalUnified: number;
  gradingAttemptId: string | null;
  onNavigate: (delta: number) => void;
  onFlagAsAI: () => void;
  onUnflagAI: () => void;
  onAttemptChange: (attemptId: string) => void;
  users: { id: string; name: string }[];
}

const INTERACTIVE_BLOCK_TYPES = ['MC', 'SHORT_ANSWER', 'RANKING', 'SORTING', 'LINKED', 'DRAWING', 'MATH_RESPONSE', 'BAR_CHART'];

function renderBlockQuestion(content: string): React.ReactNode {
  if (content.length <= 200) return content;
  return (
    <details className="inline">
      <summary className="cursor-pointer list-none">
        {content.slice(0, 200)}
        <span className="text-purple-600 dark:text-purple-400 ml-1">... (show full question)</span>
      </summary>
      <span className="block mt-1 text-[var(--text-secondary)]">{content.slice(200)}</span>
    </details>
  );
}

function renderMathSteps(steps: Array<{ label: string; latex: string; input?: string }>): React.ReactNode {
  return (
    <div className="mt-1 space-y-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2 bg-[var(--surface-glass)] rounded px-2 py-1">
          <span className="text-xs text-[var(--text-tertiary)] font-bold shrink-0 mt-0.5">{step.label}</span>
          {step.latex ? (
            <span
              className="text-xs text-[var(--text-secondary)]"
              dangerouslySetInnerHTML={{
                __html: (() => { try { return katex.renderToString(step.latex, { throwOnError: false }); } catch { return step.input || step.latex; } })(),
              }}
            />
          ) : (
            <span className="text-xs text-[var(--text-secondary)]">{step.input || '\u2014'}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function renderBarChart(chartData: { initial?: Array<{ value: number; labelHTML: string }>; delta?: Array<{ value: number; labelHTML: string }>; final?: Array<{ value: number; labelHTML: string }> }): React.ReactNode {
  const sections = ['initial', 'delta', 'final'] as const;
  return (
    <div className="mt-1 space-y-1">
      {sections.map(section => {
        const bars = chartData[section];
        if (!bars || bars.every(b => b.value === 0)) return null;
        return (
          <div key={section} className="bg-[var(--surface-glass)] rounded px-2 py-1">
            <span className="text-xs text-[var(--text-tertiary)] font-bold uppercase">{section}</span>
            <div className="flex gap-2 mt-0.5">
              {bars.map((bar, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="text-[11.5px] text-[var(--text-secondary)] font-mono">{bar.value}</div>
                  <div
                    className="w-6 rounded-t"
                    style={{
                      height: Math.max(4, Math.abs(bar.value) * 3),
                      backgroundColor: bar.value >= 0 ? '#22c55e' : '#ef4444',
                      opacity: 0.7,
                    }}
                  />
                  <div
                    className="text-xs text-[var(--text-tertiary)] truncate max-w-[40px]"
                    dangerouslySetInnerHTML={{ __html: bar.labelHTML || `${i + 1}` }}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderDrawingSVG(elements: Array<Record<string, unknown>>, blockId: string, canvasHeight?: number): React.ReactNode {
  let maxX = 800, maxY = canvasHeight ?? 400;
  for (const el of elements) {
    const pts: { x: number; y: number }[] = [];
    if (el.type === 'stroke' && Array.isArray(el.points)) pts.push(...(el.points as { x: number; y: number }[]));
    if (el.type === 'arrow' || el.type === 'shape') {
      if (el.start) pts.push(el.start as { x: number; y: number });
      if (el.end) pts.push(el.end as { x: number; y: number });
    }
    if (el.type === 'text' && el.position) {
      const pos = el.position as { x: number; y: number };
      const fontSize = Number(el.fontSize || 14);
      const textLen = String(el.text || '').length;
      const estWidth = textLen * fontSize * 0.6;
      pts.push(pos);
      pts.push({ x: pos.x + estWidth, y: pos.y + fontSize });
    }
    for (const p of pts) {
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const vbW = Math.ceil(maxX + 20);
  const vbH = Math.ceil(maxY + 20);

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full max-w-2xl h-auto bg-white rounded mt-1 border border-[var(--border)]">
      {elements.map((el, i) => {
        if (el.type === 'arrow') {
          const sx = el.start as { x: number; y: number }, ex = el.end as { x: number; y: number };
          const markerId = `ah-${blockId}-${i}`;
          return (
            <g key={i}>
              <defs>
                <marker id={markerId} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill={String(el.color || '#000')} />
                </marker>
              </defs>
              <line x1={sx.x} y1={sx.y} x2={ex.x} y2={ex.y} stroke={String(el.color || '#000')} strokeWidth="3" markerEnd={`url(#${markerId})`} />
              {el.label1 ? <text x={(sx.x + ex.x) / 2} y={(sx.y + ex.y) / 2 - 8} textAnchor="middle" fill={String(el.color || '#000')} fontSize="12" fontWeight="bold">{String(el.label1)}</text> : null}
            </g>
          );
        }
        if (el.type === 'stroke') {
          const pts = el.points as { x: number; y: number }[];
          if (!pts || pts.length < 2) return null;
          const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
          return <path key={i} d={d} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill="none" strokeLinecap="round" />;
        }
        if (el.type === 'shape') {
          const s = el.start as { x: number; y: number }, e = el.end as { x: number; y: number };
          if (el.shape === 'circle') {
            const rx = Math.abs(e.x - s.x) / 2, ry = Math.abs(e.y - s.y) / 2;
            return <ellipse key={i} cx={s.x + rx} cy={s.y + ry} rx={rx} ry={ry} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill={String(el.fill || 'none')} fillOpacity={Number(el.fillOpacity || 0)} />;
          }
          if (el.shape === 'rectangle') return <rect key={i} x={Math.min(s.x, e.x)} y={Math.min(s.y, e.y)} width={Math.abs(e.x - s.x)} height={Math.abs(e.y - s.y)} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill={String(el.fill || 'none')} fillOpacity={Number(el.fillOpacity || 0)} />;
          if (el.shape === 'line') return <line key={i} x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} />;
        }
        if (el.type === 'text') {
          const pos = el.position as { x: number; y: number };
          return <text key={i} x={pos.x} y={pos.y} fill={String(el.color || '#000')} fontSize={Number(el.fontSize || 14)}>{String(el.text || '')}</text>;
        }
        return null;
      })}
    </svg>
  );
}

interface BlockAnswerResult {
  displayAnswer: string;
  richRenderer: React.ReactNode | null;
}

function resolveBlockAnswer(block: LessonBlock, rawAnswer: Record<string, unknown> | undefined): BlockAnswerResult {
  if (rawAnswer == null) return { displayAnswer: 'No answer', richRenderer: null };

  if (block.type === 'SHORT_ANSWER') {
    return { displayAnswer: String((rawAnswer as { answer?: string }).answer || 'No answer'), richRenderer: null };
  }
  if (block.type === 'MC') {
    const selected = (rawAnswer as { selected?: number }).selected;
    return { displayAnswer: selected != null && block.options ? String(block.options[selected]) : 'No selection', richRenderer: null };
  }
  if (block.type === 'RANKING') {
    const order = (rawAnswer as { order?: { item: string }[] }).order || [];
    return { displayAnswer: order.map(o => o.item).join(' \u2192 ') || 'No answer', richRenderer: null };
  }
  if (block.type === 'SORTING') {
    const placements = (rawAnswer as { placements?: Record<string, string> }).placements || {};
    return { displayAnswer: Object.values(placements).join(', ') || 'No answer', richRenderer: null };
  }
  if (block.type === 'DRAWING') {
    const elements = (rawAnswer as { elements?: Array<Record<string, unknown>> }).elements || [];
    if (elements.length > 0) {
      return {
        displayAnswer: `Drawing (${elements.length} element${elements.length !== 1 ? 's' : ''})`,
        richRenderer: renderDrawingSVG(elements, block.id, block.canvasHeight),
      };
    }
    return { displayAnswer: 'No drawing yet', richRenderer: null };
  }
  if (block.type === 'MATH_RESPONSE') {
    const steps = (rawAnswer as { steps?: Array<{ label: string; latex: string; input?: string }> }).steps || [];
    if (steps.length > 0) {
      return {
        displayAnswer: `Math (${steps.length} step${steps.length !== 1 ? 's' : ''})`,
        richRenderer: renderMathSteps(steps),
      };
    }
    return { displayAnswer: 'No steps', richRenderer: null };
  }
  if (block.type === 'BAR_CHART') {
    const chartData = rawAnswer as { initial?: Array<{ value: number; labelHTML: string }>; delta?: Array<{ value: number; labelHTML: string }>; final?: Array<{ value: number; labelHTML: string }> };
    if (chartData.initial) {
      const sections = ['initial', 'delta', 'final'] as const;
      const nonEmpty = sections.filter(s => chartData[s]?.some(b => b.value !== 0));
      return {
        displayAnswer: `Bar Chart (${nonEmpty.length > 0 ? nonEmpty.join(', ') : 'empty'})`,
        richRenderer: renderBarChart(chartData),
      };
    }
  }
  return {
    displayAnswer: typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer),
    richRenderer: null,
  };
}

const StudentResponsePanel: React.FC<StudentResponsePanelProps> = ({
  selectedGroup,
  sub,
  selectedAssessment,
  selectedAssessmentId,
  viewingDraftUserId,
  draftUserIds,
  draftResponses,
  draftLoading,
  currentUnifiedIndex,
  totalUnified,
  gradingAttemptId,
  onNavigate,
  onFlagAsAI,
  onUnflagAI,
  onAttemptChange,
  users,
}) => {
  const { confirm } = useConfirm();
  const toast = useToast();

  const NavButtons = () => (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onNavigate(-1)}
        disabled={currentUnifiedIndex <= 0}
        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[var(--surface-glass-heavy)] transition disabled:opacity-20 disabled:cursor-not-allowed"
        aria-label="Previous student"
      >
        <ChevronLeft className="w-4 h-4 text-[var(--text-tertiary)]" aria-hidden="true" />
      </button>
      <span className="text-xs text-[var(--text-muted)] tabular-nums">{currentUnifiedIndex + 1}/{totalUnified}</span>
      <button
        onClick={() => onNavigate(1)}
        disabled={currentUnifiedIndex >= totalUnified - 1}
        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[var(--surface-glass-heavy)] transition disabled:opacity-20 disabled:cursor-not-allowed"
        aria-label="Next student"
      >
        <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" aria-hidden="true" />
      </button>
    </div>
  );

  // Draft / not-started view
  if (viewingDraftUserId && !selectedGroup) {
    const draftStudent = users.find(u => u.id === viewingDraftUserId);
    const draftStudentName = draftStudent?.name || 'Student';
    const isNotStarted = !draftUserIds.has(viewingDraftUserId);

    const handleNudge = async () => {
      try {
        await dataService.createAnnouncement({
          title: 'Assessment Reminder',
          content: isNotStarted
            ? `Reminder: "${selectedAssessment!.title}" is waiting for you. Please complete it soon.`
            : `Reminder: You started "${selectedAssessment!.title}" but haven't submitted yet. Please finish and submit your work.`,
          classType: selectedAssessment!.classType,
          priority: 'INFO',
          createdAt: new Date().toISOString(),
          createdBy: 'Admin',
          targetStudentIds: [viewingDraftUserId],
        });
        toast.success(`Reminder sent to ${draftStudentName}`);
      } catch {
        toast.error('Could not send reminder. Check your connection.');
      }
    };

    const handleSubmitOnBehalf = async () => {
      const ok = await confirm({
        title: 'Submit on Behalf',
        message: `This will submit ${draftStudentName}'s current draft work as their assessment attempt. Auto-gradable questions will be scored.`,
        confirmLabel: 'Submit Their Work',
        variant: 'warning',
      });
      if (!ok) return;
      try {
        await callSubmitOnBehalf({ userId: viewingDraftUserId, assignmentId: selectedAssessmentId! });
        toast.success(`Submitted ${draftStudentName}'s assessment`);
      } catch (err) {
        const msg = (err as any)?.message || (err as any)?.details || 'Unknown error during submit on behalf';
        reportError(err, { method: 'callSubmitOnBehalf' });
        toast.error('Submit on behalf failed: ' + msg);
      }
    };

    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className={`px-4 py-3 border-b border-[var(--border)] flex items-center gap-3 ${isNotStarted ? 'bg-orange-500/[0.03]' : 'bg-cyan-500/[0.03]'}`}>
          <NavButtons />
          {isNotStarted ? <Users className="w-4 h-4 text-orange-600 dark:text-orange-400" aria-hidden="true" /> : <Eye className="w-4 h-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />}
          <h4 className="text-sm font-bold text-[var(--text-primary)]">{draftStudentName}</h4>
          <span className={`text-[11.5px] font-bold px-2 py-0.5 rounded ${isNotStarted ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400' : 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'}`}>
            {isNotStarted ? 'NOT STARTED' : 'DRAFT'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!isNotStarted && (
              <button
                onClick={handleSubmitOnBehalf}
                className="text-[11.5px] text-green-600 dark:text-green-400 hover:text-green-300 font-bold px-2 py-1 rounded bg-green-500/10 hover:bg-green-500/20 transition flex items-center gap-0.5"
              >
                <Send className="w-3 h-3" aria-hidden="true" /> Submit
              </button>
            )}
            <button
              onClick={handleNudge}
              className={`text-[11.5px] font-bold px-2 py-1 rounded transition ${isNotStarted ? 'text-orange-600 dark:text-orange-400 hover:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20' : 'text-cyan-600 dark:text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20'}`}
            >
              Nudge
            </button>
          </div>
        </div>

        <div className="overflow-y-auto custom-scrollbar p-4 flex-1 min-h-0">
          {draftLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-[var(--text-muted)] text-sm">Loading draft...</div>
            </div>
          ) : !draftResponses ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)] opacity-30" aria-hidden="true" />
                {isNotStarted ? (
                  <>
                    <p className="text-orange-600 dark:text-orange-400/80 text-sm font-bold">Not Started</p>
                    <p className="text-[var(--text-muted)] text-xs mt-1">This student hasn&apos;t opened the assessment yet.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[var(--text-muted)] text-sm">No draft responses found</p>
                    <p className="text-[var(--text-muted)] text-xs mt-1">The student opened the assessment but may not have answered any questions yet.</p>
                  </>
                )}
              </div>
            </div>
          ) : selectedAssessment?.lessonBlocks ? (
            <div className="space-y-2">
              {selectedAssessment.lessonBlocks
                .filter((block: LessonBlock) => INTERACTIVE_BLOCK_TYPES.includes(block.type))
                .map((block: LessonBlock, qi: number) => {
                  const rawAnswer = draftResponses[block.id] as Record<string, unknown> | undefined;
                  const hasAnswer = rawAnswer != null;
                  let displayAnswer = 'No answer yet';
                  let richRenderer: React.ReactNode | null = null;
                  if (hasAnswer) {
                    const result = resolveBlockAnswer(block, rawAnswer);
                    displayAnswer = result.displayAnswer;
                    richRenderer = result.richRenderer;
                  }
                  return (
                    <div key={block.id} className={`flex items-start gap-3 p-3 rounded-lg border ${hasAnswer ? 'bg-cyan-900/10 border-cyan-500/20' : 'bg-[var(--surface-glass)] border-[var(--border)]'}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${hasAnswer ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400' : 'bg-gray-500/20 text-[var(--text-muted)]'}`}>
                        {qi + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--text-secondary)] mb-1">
                          <span className="font-bold text-[var(--text-tertiary)]">Q{qi + 1}:</span>{' '}
                          {renderBlockQuestion(block.content)}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          <span className="font-bold">Draft Answer:</span>{' '}
                          <span className={hasAnswer ? 'text-cyan-600 dark:text-cyan-400' : 'text-[var(--text-muted)] italic'}>{displayAnswer}</span>
                        </div>
                        {richRenderer}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(draftResponses).map(([blockId, answer]) => {
                const ansObj = answer as Record<string, unknown> | null;
                const answerText = ansObj != null
                  ? (typeof ansObj === 'string' ? ansObj : (ansObj.answer as string) || (ansObj.selected != null ? `Option ${ansObj.selected}` : JSON.stringify(ansObj)))
                  : 'No answer';
                return (
                  <div key={blockId} className="flex items-center gap-3 p-2 rounded-lg border bg-cyan-900/10 border-cyan-500/20">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[11.5px] font-bold bg-cyan-500/20 text-cyan-600 dark:text-cyan-400">?</div>
                    <span className="text-xs text-[var(--text-tertiary)] font-mono truncate">{blockId.slice(0, 12)}...</span>
                    <span className="text-xs text-cyan-300 truncate flex-1">{answerText}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Empty state
  if (!selectedGroup || !sub) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 min-h-0">
        <div className="text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-30" aria-hidden="true" />
          <p className="text-[var(--text-muted)] text-sm font-bold">Select a student to begin grading</p>
          <p className="text-[var(--text-muted)] text-xs mt-1">Use the list on the left or arrow keys to navigate</p>
        </div>
      </div>
    );
  }

  const awayEvents = (sub.metrics?.tabSwitchCount || 0) + (sub.metrics?.blurCount || 0);
  const activeTime = sub.metrics?.engagementTime || 0;
  const totalTime = computeTotalTime(sub);
  const serverElapsed = sub.metrics?.serverElapsedSec || totalTime;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Center panel header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-glass)] flex items-center gap-3 flex-wrap">
        <NavButtons />

        <h4 className="text-sm font-bold text-[var(--text-primary)]">{selectedGroup.userName}</h4>
        {selectedGroup.userSection && (
          <span className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-glass)] px-2 py-0.5 rounded">{selectedGroup.userSection}</span>
        )}

        {/* Attempt selector */}
        {selectedGroup.submissions.length > 1 && (
          <select
            aria-label="Select attempt"
            value={gradingAttemptId || ''}
            onChange={e => onAttemptChange(e.target.value)}
            className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50 transition"
          >
            {selectedGroup.submissions.map(s => (
              <option key={s.id} value={s.id}>
                Attempt {s.attemptNumber || 1}{s.status === 'RETURNED' ? ' (Returned)' : ''}{s.id === selectedGroup.best.id ? ' (Best)' : ''}{s.rubricGrade ? ` - ${s.rubricGrade.overallPercentage}%` : ''}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Metrics badges */}
          <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span className={getAwayEventColor(awayEvents)}>{awayEvents} away</span>
            <span className="text-green-600 dark:text-green-400">{formatEngagementTime(activeTime)} active</span>
            <span className="text-[var(--text-muted)]">{formatEngagementTime(serverElapsed)} elapsed</span>
            <span>{sub.metrics?.pasteCount || 0} pastes</span>
            {(sub.metrics?.autoInsertCount != null && sub.metrics.autoInsertCount > 0) && (
              <span className="text-amber-600 dark:text-amber-400" title="Auto-inserts include dictation, Grammarly, mobile auto-suggest">
                {sub.metrics.autoInsertCount} auto
              </span>
            )}
            {(sub.metrics?.wordCount != null && sub.metrics.wordCount > 0) && (
              <span className="text-blue-600 dark:text-blue-400">{sub.metrics.wordCount} words</span>
            )}
            {(sub.metrics?.wordsPerSecond != null && sub.metrics.wordsPerSecond > 0) && (
              <span className={sub.metrics.wordsPerSecond > 1.5 ? 'text-red-600 dark:text-red-400' : sub.metrics.wordsPerSecond > 0.8 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}>{sub.metrics.wordsPerSecond.toFixed(2)} w/s</span>
            )}
            {sub.metrics?.assistiveTech && (
              <span className="text-purple-600 dark:text-purple-400" title="Student self-reported assistive technology use">
                ♿ Assistive Tech
              </span>
            )}
          </div>

          {/* AI Flag button */}
          {sub.flaggedAsAI ? (
            <button
              onClick={onUnflagAI}
              className="flex items-center gap-1 bg-gray-600 hover:bg-gray-500 text-white text-[11.5px] font-bold px-2.5 py-1 rounded-lg transition"
              aria-label="Remove AI flag"
            >
              <Undo2 className="w-3 h-3" aria-hidden="true" />
              Remove AI Flag
            </button>
          ) : (
            <button
              onClick={onFlagAsAI}
              className="flex items-center gap-1 bg-red-600/80 hover:bg-red-500 text-white text-[11.5px] font-bold px-2.5 py-1 rounded-lg transition"
              aria-label="Flag as AI suspected"
            >
              <Bot className="w-3 h-3" aria-hidden="true" />
              Flag AI
            </button>
          )}
        </div>
      </div>

      {/* Center panel body */}
      <div className="overflow-y-auto custom-scrollbar p-4 flex-1 min-h-0">
        {/* Integrity flag banner */}
        {sub.status === 'FLAGGED' && (
          <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-600 dark:text-red-400">
                  ⚠️ Server Integrity Flag
                </p>
                {sub.feedback && (
                  <p className="text-xs text-red-500/90 dark:text-red-400/90 mt-0.5">
                    {sub.feedback}
                  </p>
                )}
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  {sub.metrics?.keystrokes || 0} keystrokes · {sub.metrics?.pasteCount || 0} pastes · {sub.metrics?.wordCount || 0} words in {formatEngagementTime(sub.metrics?.engagementTime || 0)}
                </p>
              </div>
            </div>
          </div>
        )}
        {sub.assessmentScore?.perBlock && selectedAssessment?.lessonBlocks ? (
          <div className="space-y-2">
            {selectedAssessment.lessonBlocks
              .filter((block: LessonBlock) => INTERACTIVE_BLOCK_TYPES.includes(block.type))
              .map((block: LessonBlock, qi: number) => {
                const blockResult = sub.assessmentScore?.perBlock?.[block.id];
                const rawAnswer = sub.blockResponses?.[block.id] as Record<string, unknown> | undefined;
                const isPending = blockResult?.needsReview;
                const { displayAnswer, richRenderer } = resolveBlockAnswer(block, rawAnswer);

                const borderClass = isPending ? 'bg-amber-900/10 border-amber-500/20'
                  : blockResult?.correct ? 'bg-green-900/10 border-green-500/20'
                  : 'bg-red-900/10 border-red-500/20';
                const iconClass = isPending ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  : blockResult?.correct ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                  : 'bg-red-500/20 text-red-600 dark:text-red-400';
                const answerColor = isPending ? 'text-amber-600 dark:text-amber-400'
                  : blockResult?.correct ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400';

                return (
                  <div key={block.id} className={`flex items-start gap-3 p-3 rounded-lg border ${borderClass}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${iconClass}`}>
                      {isPending ? <Clock className="w-3.5 h-3.5" aria-hidden="true" /> : blockResult?.correct ? <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> : <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[var(--text-secondary)] mb-1">
                        <span className="font-bold text-[var(--text-tertiary)]">Q{qi + 1}:</span>{' '}
                        {renderBlockQuestion(block.content)}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {isPending ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold">Pending Review</span>
                        ) : (
                          <>
                            <span className="font-bold">Answer:</span>{' '}
                            <span className={answerColor}>{displayAnswer}</span>
                            {!blockResult?.correct && block.type === 'MC' && block.correctAnswer !== undefined && block.options && (
                              <span className="ml-2 text-green-600 dark:text-green-400/60">
                                (Correct: {block.options[block.correctAnswer]})
                              </span>
                            )}
                          </>
                        )}
                        {isPending && displayAnswer !== 'No answer' && !richRenderer && (
                          <div className="mt-1 text-[var(--text-secondary)] bg-[var(--surface-glass)] rounded px-2 py-1.5 whitespace-pre-wrap">{displayAnswer}</div>
                        )}
                        {richRenderer}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : sub.blockResponses ? (
          <div className="space-y-2">
            {Object.entries(sub.blockResponses).map(([blockId, answer]) => {
              const blockResult = sub.assessmentScore?.perBlock?.[blockId];
              const isPending = blockResult?.needsReview;
              const ansObj = answer as Record<string, unknown> | null;
              const answerText = ansObj != null
                ? (typeof ansObj === 'string' ? ansObj : (ansObj.answer as string) || (ansObj.selected != null ? `Option ${ansObj.selected}` : JSON.stringify(ansObj)))
                : 'No answer';
              const borderClass = isPending ? 'bg-amber-900/10 border-amber-500/20'
                : blockResult?.correct ? 'bg-green-900/10 border-green-500/20'
                : blockResult ? 'bg-red-900/10 border-red-500/20'
                : 'bg-[var(--surface-glass)] border-white/5';
              const iconClass = isPending ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : blockResult?.correct ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                : blockResult ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                : 'bg-gray-500/20 text-[var(--text-tertiary)]';
              return (
                <div key={blockId} className={`flex items-center gap-3 p-2 rounded-lg border ${borderClass}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11.5px] font-bold ${iconClass}`}>
                    {isPending ? <Clock className="w-3 h-3" aria-hidden="true" /> : blockResult?.correct ? <CheckCircle className="w-3 h-3" aria-hidden="true" /> : blockResult ? <AlertTriangle className="w-3 h-3" aria-hidden="true" /> : '?'}
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)] font-mono truncate">{blockId.slice(0, 12)}...</span>
                  <span className="text-xs text-[var(--text-secondary)] truncate flex-1">{answerText}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-[var(--text-muted)] italic">No per-question data available for this submission.</div>
        )}
      </div>
    </div>
  );
};

export default StudentResponsePanel;

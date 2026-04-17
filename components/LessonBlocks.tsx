
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  CheckCircle2, XCircle, ChevronRight, BookOpen, MessageSquare, HelpCircle, ListChecks,
  ExternalLink, GripVertical, GripHorizontal, Target, Link, Play, FileDown, Trash2, MoreVertical, Pencil
} from 'lucide-react';
import { LessonBlock } from '../types';
import LessonProgressSidebar from './LessonProgressSidebar';
import { useTheme } from '../lib/ThemeContext';
import { FeatureErrorBoundary } from './ErrorBoundary';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { BlockText } from '../lib/blockText';
const DrawingBlock = lazyWithRetry(() => import('./blocks/DrawingBlock'));
const MathResponseBlock = lazyWithRetry(() => import('./blocks/MathResponseBlock'));

export type { LessonBlock } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockResponseMap = Record<string, any>;

interface LessonBlocksProps {
  blocks: LessonBlock[];
  onBlockComplete?: (blockId: string, correct: boolean) => void;
  onAllComplete?: () => void;
  showSidebar?: boolean;
  engagementTime?: number;
  xpEarned?: number;
  savedResponses?: BlockResponseMap;
  onResponseChange?: (blockId: string, response: unknown) => void;
  onExportPdf?: () => void;
  onClearResponses?: () => void;
  readOnly?: boolean;
}

// ──────────────────────────────────────────────
// Interactive block types (require completion)
// ──────────────────────────────────────────────
const INTERACTIVE_TYPES = ['MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED', 'DRAWING', 'MATH_RESPONSE'];

// Reject javascript: and data: URIs to prevent XSS via href injection
function safeUrl(url: string | undefined): string {
  if (!url) return '#';
  return /^https?:\/\//i.test(url) ? url : '#';
}

// ──────────────────────────────────────────────
// Original block renderers
// ──────────────────────────────────────────────

const TextBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => (
  <BlockText text={block.content} tag="div" className="text-base text-[var(--text-secondary)] leading-relaxed" />
));

const InfoBoxBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => {
  const variantStyles = {
    tip: 'border-green-500/30 bg-green-500/5 text-green-400',
    warning: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    note: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
  };
  const style = variantStyles[block.variant || 'note'];
  return (
    <div className={`border rounded-xl p-4 text-base ${style}`}>
      <div className="font-bold text-xs uppercase tracking-widest mb-1">
        {block.variant === 'tip' ? 'Tip' : block.variant === 'warning' ? 'Warning' : 'Note'}
      </div>
      <BlockText text={block.content} tag="div" className="text-[var(--text-secondary)]" />
    </div>
  );
});

const MCBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void; savedResponse?: { selected: number; answered: boolean }; onResponseChange?: (response: unknown) => void; readOnly?: boolean }> = React.memo(({ block, onComplete, savedResponse, onResponseChange, readOnly }) => {
  const [selected, setSelected] = useState<number | null>(savedResponse?.selected ?? null);
  const [answered, setAnswered] = useState(savedResponse?.answered ?? false);
  const isCorrect = selected === block.correctAnswer;

  const handleSelect = (idx: number) => {
    if (answered) return;
    setSelected(idx);
    onResponseChange?.({ selected: idx, answered: false });
  };

  const handleSubmit = () => {
    if (selected === null) return;
    setAnswered(true);
    onResponseChange?.({ selected, answered: true });
    onComplete(selected === block.correctAnswer);
  };

  return (
    <div className="space-y-3">
      <div className="text-base text-[var(--text-primary)] font-medium flex items-center gap-2" translate="no">
        <HelpCircle className="w-4 h-4 text-purple-400 shrink-0" />
        <BlockText text={block.content} />
      </div>
      <div className="space-y-2" role="radiogroup" aria-label={block.content} translate="no">
        {(block.options || []).map((opt, idx) => (
          <button
            key={idx}
            role="radio"
            aria-checked={selected === idx}
            onClick={() => handleSelect(idx)}
            disabled={answered || readOnly}
            className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
              readOnly
                ? selected === idx
                  ? 'border-purple-500/30 bg-purple-500/10 text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--surface-glass)] text-[var(--text-secondary)]'
                : answered && idx === block.correctAnswer
                ? 'border-green-500/50 bg-green-500/10 text-green-400'
                : answered && idx === selected && !isCorrect
                ? 'border-red-500/50 bg-red-500/10 text-red-400'
                : selected === idx
                ? 'border-purple-500/30 bg-purple-500/10 text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] text-[var(--text-secondary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[var(--text-muted)] w-5">{String.fromCharCode(65 + idx)}.</span>
              <BlockText text={opt} />
              {!readOnly && answered && idx === block.correctAnswer && <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />}
              {!readOnly && answered && idx === selected && !isCorrect && <XCircle className="w-4 h-4 text-red-400 ml-auto" />}
            </div>
          </button>
        ))}
      </div>
      {!readOnly && !answered && (
        <button onClick={handleSubmit} disabled={selected === null} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition">
          Check Answer
        </button>
      )}
      {!readOnly && answered && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className={`text-xs font-bold ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
              {isCorrect ? 'Correct!' : 'Incorrect — review the material above.'}
            </div>
            <button
              onClick={() => {
                setAnswered(false);
                setSelected(null);
                onResponseChange?.({ selected: null, answered: false });
              }}
              className="flex items-center gap-1 text-[11.5px] text-[var(--text-tertiary)] hover:text-purple-400 transition"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
          {block.explanation && (
            <BlockText text={block.explanation} tag="div" className="text-sm text-[var(--text-secondary)] bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg px-3 py-2" />
          )}
        </div>
      )}
    </div>
  );
});

const ShortAnswerBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void; savedResponse?: { answer: string; answered: boolean; isCorrect: boolean }; onResponseChange?: (response: unknown) => void; readOnly?: boolean }> = React.memo(({ block, onComplete, savedResponse, onResponseChange, readOnly }) => {
  const [answer, setAnswer] = useState(savedResponse?.answer ?? '');
  const [answered, setAnswered] = useState(savedResponse?.answered ?? false);
  const [isCorrect, setIsCorrect] = useState(savedResponse?.isCorrect ?? false);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    const accepted = (block.acceptedAnswers || []).map(a => a.toLowerCase().trim());
    const correct = accepted.length === 0 || accepted.includes(answer.toLowerCase().trim());
    setIsCorrect(correct);
    setAnswered(true);
    onResponseChange?.({ answer, answered: true, isCorrect: correct });
    onComplete(correct);
  };

  return (
    <div className="space-y-3">
      <div className="text-base text-[var(--text-primary)] font-medium flex items-center gap-2" translate="no">
        <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" />
        <BlockText text={block.content} />
      </div>
      <div className="flex gap-2 items-end">
        <textarea
          value={answer}
          onChange={e => {
            const val = e.target.value;
            setAnswer(val);
            onResponseChange?.({ answer: val, answered: false, isCorrect: false });
          }}
          disabled={answered || readOnly}
          placeholder="Type your answer... (Ctrl+Enter to lock in)"
          aria-label={block.content || 'Short answer'}
          className="flex-1 bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 focus-visible:ring-2 focus-visible:ring-purple-400 transition resize-y min-h-[38px]"
          rows={2}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        {!readOnly && !answered && (
          <button onClick={handleSubmit} disabled={!answer.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shrink-0">
            Lock In
          </button>
        )}
      </div>
      {!readOnly && answered && (
        <div className="flex items-center gap-3">
          <div className={`text-xs font-bold flex items-center gap-1 ${isCorrect ? 'text-green-400' : 'text-amber-400'}`}>
            {isCorrect ? <><CheckCircle2 className="w-3 h-3" /> {(block.acceptedAnswers || []).length > 0 ? 'Correct!' : 'Response recorded'}</> : <><XCircle className="w-3 h-3" /> Not quite — review the material above.</>}
          </div>
          <button
            onClick={() => {
              setAnswered(false);
              onResponseChange?.({ answer, answered: false, isCorrect: false });
            }}
            className="flex items-center gap-1 text-[11.5px] text-[var(--text-tertiary)] hover:text-purple-400 transition"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
      )}
    </div>
  );
});

const VocabularyBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      onClick={() => setFlipped(!flipped)}
      className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] transition cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <BlockText text={block.term} tag="div" className="text-sm font-bold text-[var(--text-primary)]" />
          {flipped ? (
            <BlockText text={block.definition} tag="div" className="text-base text-[var(--text-secondary)] mt-1 animate-in fade-in duration-200" />
          ) : (
            <div className="text-xs text-[var(--text-muted)] mt-1">Tap to reveal definition</div>
          )}
        </div>
      </div>
    </button>
  );
});

const ChecklistBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void; savedResponse?: { checked: number[] }; onResponseChange?: (response: unknown) => void; readOnly?: boolean }> = React.memo(({ block, onComplete, savedResponse, onResponseChange, readOnly }) => {
  const [checked, setChecked] = useState<Set<number>>(new Set(savedResponse?.checked ?? []));
  const wasCompleteRef = useRef(checked.size === (block.items || []).length && checked.size > 0);
  const allChecked = (block.items || []).length > 0 && checked.size === (block.items || []).length;

  const toggle = (idx: number) => {
    const next = new Set(checked);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setChecked(next);
    onResponseChange?.({ checked: Array.from(next) });
    const nowComplete = next.size === (block.items || []).length;
    if (nowComplete && !wasCompleteRef.current) {
      onComplete(true);
    }
    wasCompleteRef.current = nowComplete;
  };

  return (
    <div className="space-y-3">
      <div className="text-base text-[var(--text-primary)] font-medium flex items-center gap-2" translate="no">
        <ListChecks className="w-4 h-4 text-green-400 shrink-0" />
        <BlockText text={block.content} />
      </div>
      <div className="space-y-2" role="group" aria-label={block.content || 'Checklist'} translate="no">
        {(block.items || []).map((item, idx) => (
          <button
            key={idx}
            role="checkbox"
            aria-checked={checked.has(idx)}
            aria-disabled={readOnly}
            onClick={() => !readOnly && toggle(idx)}
            className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border text-sm transition ${
              readOnly
                ? checked.has(idx)
                  ? 'border-purple-500/30 bg-purple-500/5 text-purple-400 line-through cursor-default'
                  : 'border-[var(--border)] bg-[var(--surface-glass)] text-[var(--text-secondary)] cursor-default'
                : checked.has(idx)
                ? 'border-green-500/30 bg-green-500/5 text-green-400 line-through'
                : 'border-[var(--border)] bg-[var(--surface-glass)] text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)]'
            }`}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${
              readOnly
                ? checked.has(idx) ? 'border-purple-500 bg-purple-500' : 'border-gray-600'
                : checked.has(idx) ? 'border-green-500 bg-green-500' : 'border-gray-600'
            }`}>
              {checked.has(idx) && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <BlockText text={item} />
          </button>
        ))}
      </div>
      {!readOnly && allChecked && (
        <div className="text-xs font-bold text-green-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> All items completed!
        </div>
      )}
    </div>
  );
});

// ──────────────────────────────────────────────
// NEW block renderers
// ──────────────────────────────────────────────

const SectionHeaderBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => (
  <div className="text-center py-2">
    {block.icon && <div className="text-3xl mb-2">{block.icon}</div>}
    <BlockText text={block.title || block.content} tag="div" className="text-xl font-black text-[var(--text-primary)] tracking-tight" />
    {block.subtitle && <BlockText text={block.subtitle} tag="p" className="text-sm text-[var(--text-tertiary)] mt-1" />}
  </div>
));

const ImageBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => {
  const driveUrl = (block.url || '').replace(/\/file\/d\/([^/]+)\/.*/, '/uc?export=view&id=$1');
  const [imgError, setImgError] = useState(false);
  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--panel-bg)]">
        {imgError ? (
          <div className="w-full h-[200px] flex items-center justify-center text-sm text-[var(--text-muted)]">Image failed to load</div>
        ) : (
          <img
            src={driveUrl !== block.url ? driveUrl : block.url}
            alt={block.alt || block.caption || 'Lesson image'}
            className="w-full max-h-[500px] object-contain"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      {block.caption && <BlockText text={block.caption} tag="p" className="text-xs text-[var(--text-muted)] text-center italic" />}
    </div>
  );
});

const VideoBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => {
  const getEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : '';
  };
  const embedUrl = getEmbedUrl(block.url || '');

  if (!embedUrl) return <div className="text-sm text-[var(--text-muted)] italic">Invalid video URL</div>;

  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-[var(--border)] aspect-video bg-black">
        <iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title={block.caption || 'Video'} />
      </div>
      {block.caption && <div className="text-xs text-[var(--text-muted)] text-center italic flex items-center justify-center gap-1"><Play className="w-3 h-3" /> <BlockText text={block.caption} /></div>}
    </div>
  );
});

const ObjectivesBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => (
  <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-4 space-y-2">
    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
      <Target className="w-4 h-4" />
      {block.title || block.content || 'Learning Objectives'}
    </div>
    <ul className="space-y-1">
      {(block.items || []).map((item, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
          <BlockText text={item} />
        </li>
      ))}
    </ul>
  </div>
));

const DividerBlock: React.FC = React.memo(() => (
  <div className="lesson-divider" />
));

const ExternalLinkBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => (
  <a
    href={safeUrl(block.url)}
    target={block.openInNewTab !== false ? '_blank' : '_self'}
    rel="noopener noreferrer"
    className="block p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition group"
  >
    <div className="flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <BlockText text={block.title || block.url} tag="div" className="text-sm font-bold text-purple-300 group-hover:text-purple-200 transition" />
        {block.content && <BlockText text={block.content} tag="div" className="text-xs text-[var(--text-tertiary)] mt-0.5" />}
      </div>
      <div className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-lg shrink-0 ml-3">
        {block.buttonLabel || 'Open'} <ExternalLink className="w-3 h-3" />
      </div>
    </div>
  </a>
));

const getGoogleDriveEmbedUrl = (url: string): string => {
  // Convert Google Drive share/view links to embeddable preview URLs
  // Handles: /file/d/ID/view, /file/d/ID/edit, /open?id=ID, /file/d/ID/view?usp=sharing
  const fileIdMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
  const openIdMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch) return `https://drive.google.com/file/d/${openIdMatch[1]}/preview`;
  return url;
};

const EmbedBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => {
  const embedUrl = getGoogleDriveEmbedUrl(block.url || '');
  const isGoogleDrive = embedUrl !== block.url;
  const [embedError, setEmbedError] = useState(false);
  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--panel-bg)]" style={{ height: block.height || 500 }}>
        {embedError ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-[var(--text-muted)]">Embed failed to load</div>
        ) : (
          <iframe
            src={embedUrl}
            className="w-full h-full border-0"
            title={block.caption || 'Embedded content'}
            sandbox={isGoogleDrive ? `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox` : `allow-scripts allow-forms allow-popups`}
            allow={isGoogleDrive ? 'autoplay' : undefined}
            onError={() => setEmbedError(true)}
          />
        )}
      </div>
      {block.caption && <BlockText text={block.caption} tag="p" className="text-xs text-[var(--text-muted)] text-center italic" />}
    </div>
  );
});

const VocabListBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  return (
    <div className="space-y-2">
      {(block.terms || []).map((t, idx) => (
        <button
          key={idx}
          onClick={() => setRevealed(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; })}
          className="w-full text-left p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] transition cursor-pointer"
        >
          <div className="flex items-start gap-3">
            <BookOpen className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <BlockText text={t.term} tag="div" className="text-sm font-bold text-[var(--text-primary)]" />
              {revealed.has(idx) ? (
                <BlockText text={t.definition} tag="div" className="text-sm text-[var(--text-secondary)] mt-1 animate-in fade-in duration-200" />
              ) : (
                <div className="text-xs text-[var(--text-muted)] mt-1">Tap to reveal</div>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
});

const ActivityBlock: React.FC<{ block: LessonBlock }> = React.memo(({ block }) => (
  <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-2">
    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
      {block.icon && <span className="text-lg">{block.icon}</span>}
      <BlockText text={block.title || 'Activity'} />
    </div>
    <BlockText text={block.instructions || block.content} tag="div" className="text-sm text-[var(--text-secondary)]" />
    {block.url && (
      <a href={safeUrl(block.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition mt-1">
        {block.buttonLabel || 'Open Activity'} <span aria-hidden="true">↗</span>
      </a>
    )}
  </div>
));

const SortingBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void; savedResponse?: { placements: Record<number, 'left' | 'right'>; submitted: boolean }; onResponseChange?: (response: unknown) => void; readOnly?: boolean }> = React.memo(({ block, onComplete, savedResponse, onResponseChange, readOnly }) => {
  const items = block.sortItems || [];
  const [placements, setPlacements] = useState<Record<number, 'left' | 'right'>>(savedResponse?.placements ?? {});
  const [submitted, setSubmitted] = useState(savedResponse?.submitted ?? false);

  const unplaced = items.map((_, i) => i).filter(i => !(i in placements));
  const leftItems = Object.entries(placements).filter(([, v]) => v === 'left').map(([k]) => parseInt(k));
  const rightItems = Object.entries(placements).filter(([, v]) => v === 'right').map(([k]) => parseInt(k));

  const placeItem = (itemIdx: number, side: 'left' | 'right') => {
    if (submitted) return;
    setPlacements(prev => {
      const next = { ...prev, [itemIdx]: side };
      onResponseChange?.({ placements: next, submitted: false });
      return next;
    });
  };

  const removeItem = (itemIdx: number) => {
    if (submitted) return;
    setPlacements(prev => {
      const next = { ...prev };
      delete next[itemIdx];
      onResponseChange?.({ placements: next, submitted: false });
      return next;
    });
  };

  const handleSubmit = () => {
    if (unplaced.length > 0) return;
    setSubmitted(true);
    const allCorrect = items.every((item, idx) => placements[idx] === item.correct);
    onResponseChange?.({ placements, submitted: true });
    onComplete(allCorrect);
  };

  const correctCount = items.filter((item, idx) => placements[idx] === item.correct).length;

  return (
    <div className="space-y-3" role="region" aria-label={block.title || block.content || 'Sorting activity'}>
      {block.title && <BlockText text={block.title} tag="p" className="text-base text-[var(--text-primary)] font-medium" />}
      {block.instructions && <BlockText text={block.instructions} tag="p" className="text-xs text-[var(--text-tertiary)]" />}

      {/* Unplaced items */}
      {!readOnly && unplaced.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Sort these items</div>
          <div className="flex flex-wrap gap-2" role="listbox" aria-label="Items to sort" translate="no">
            {unplaced.map(idx => (
              <div key={idx} role="option" className="flex items-center gap-1 bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)]">
                <BlockText text={items[idx].text} />
                <button onClick={() => placeItem(idx, 'left')} aria-label={`Place ${items[idx].text} in ${block.leftLabel || 'Category A'}`} className="ml-1 text-[11.5px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-500/30 transition">{block.leftLabel || 'L'}</button>
                <button onClick={() => placeItem(idx, 'right')} aria-label={`Place ${items[idx].text} in ${block.rightLabel || 'Category B'}`} className="text-[11.5px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded hover:bg-orange-500/30 transition">{block.rightLabel || 'R'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category columns */}
      <div className="grid grid-cols-2 gap-3" translate="no">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 min-h-[80px]">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">{block.leftLabel || 'Category A'}</div>
          <div className="space-y-1">
            {leftItems.map(idx => (
              <div key={idx} className={`flex items-center justify-between px-2 py-1 rounded text-sm ${readOnly ? 'text-[var(--text-secondary)] bg-[var(--panel-bg)]' : submitted ? (items[idx].correct === 'left' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10') : 'text-[var(--text-secondary)] bg-[var(--panel-bg)]'}`}>
                <BlockText text={items[idx].text} />
                {!readOnly && !submitted && <button onClick={() => removeItem(idx)} aria-label={`Remove ${items[idx].text}`} className="text-[var(--text-muted)] hover:text-red-400 text-xs">×</button>}
                {!readOnly && submitted && items[idx].correct === 'left' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                {!readOnly && submitted && items[idx].correct !== 'left' && <XCircle className="w-3 h-3 text-red-400" />}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 min-h-[80px]">
          <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">{block.rightLabel || 'Category B'}</div>
          <div className="space-y-1">
            {rightItems.map(idx => (
              <div key={idx} className={`flex items-center justify-between px-2 py-1 rounded text-sm ${readOnly ? 'text-[var(--text-secondary)] bg-[var(--panel-bg)]' : submitted ? (items[idx].correct === 'right' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10') : 'text-[var(--text-secondary)] bg-[var(--panel-bg)]'}`}>
                <BlockText text={items[idx].text} />
                {!readOnly && !submitted && <button onClick={() => removeItem(idx)} aria-label={`Remove ${items[idx].text}`} className="text-[var(--text-muted)] hover:text-red-400 text-xs">×</button>}
                {!readOnly && submitted && items[idx].correct === 'right' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                {!readOnly && submitted && items[idx].correct !== 'right' && <XCircle className="w-3 h-3 text-red-400" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!readOnly && !submitted && unplaced.length === 0 && items.length > 0 && (
        <button onClick={handleSubmit} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition">
          Check Sorting
        </button>
      )}
      {!readOnly && submitted && (
        <div className="flex items-center gap-3">
          <div className={`text-xs font-bold ${correctCount === items.length ? 'text-green-400' : 'text-amber-400'}`}>
            {correctCount === items.length ? 'All correct!' : `${correctCount}/${items.length} correct`}
          </div>
          <button
            onClick={() => {
              setSubmitted(false);
              onResponseChange?.({ placements, submitted: false });
            }}
            className="flex items-center gap-1 text-[11.5px] text-[var(--text-tertiary)] hover:text-purple-400 transition"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
      )}
    </div>
  );
});

const DataTableBlock: React.FC<{ block: LessonBlock; savedResponse?: { data: Record<string, string>[] }; onResponseChange?: (response: unknown) => void; readOnly?: boolean }> = React.memo(({ block, savedResponse, onResponseChange, readOnly }) => {
  const columns = block.columns || [];
  const rowCount = block.trials || 3;
  const rowLabels = block.rowLabels || [];
  const hasCustomLabels = rowLabels.some(l => l && l.trim() !== '');
  const prefillRows = block.rows || [];
  const [data, setData] = useState<Record<string, string>[]>(() =>
    savedResponse?.data ?? Array.from({ length: rowCount }, (_, i) => {
      const base = Object.fromEntries(columns.map(c => [c.key, '']));
      if (prefillRows[i]) { for (const k in prefillRows[i]) base[k] = prefillRows[i][k]; }
      return base;
    })
  );

  const updateCell = (rowIdx: number, colKey: string, val: string) => {
    setData(prev => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [colKey]: val };
      onResponseChange?.({ data: next });
      return next;
    });
  };

  const rowLabel = (rowIdx: number) => {
    const custom = rowLabels[rowIdx]?.trim();
    return custom || String(rowIdx + 1);
  };

  return (
    <div className="space-y-2">
      {block.title && <BlockText text={block.title} tag="p" className="text-base text-[var(--text-primary)] font-medium" />}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm" aria-label={block.title || 'Data table'}>
          <thead>
            <tr className="bg-[var(--panel-bg)]">
              <th scope="col" className="px-3 py-2.5 text-[11.5px] text-[var(--text-muted)] uppercase font-bold text-left w-16">{hasCustomLabels ? 'Label' : '#'}</th>
              {columns.map(col => (
                <th scope="col" key={col.key} className="px-3 py-2.5 text-[11.5px] text-[var(--text-muted)] uppercase font-bold text-left">
                  {col.label}{col.unit ? ` (${col.unit})` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-t border-[var(--border)] odd:bg-[var(--panel-bg)]/30">
                <td className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap">{rowLabel(rowIdx)}</td>
                {columns.map(col => (
                  <td key={col.key} className="px-2 py-1.5">
                    {col.editable !== false ? (
                      <input
                        type="text"
                        value={row[col.key] || ''}
                        onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                        disabled={readOnly}
                        aria-label={`${col.label} for ${rowLabel(rowIdx)}`}
                        className={`w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20 transition${readOnly ? ' opacity-80' : ''}`}
                      />
                    ) : (
                      <span className="px-2 py-1 text-[var(--text-tertiary)]">{row[col.key]}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const BarChartBlock: React.FC<{ block: LessonBlock; savedResponse?: { initial: Array<{value: number; labelHTML: string; labelType?: string; labelTemplate?: string}>; delta: Array<{value: number; labelHTML: string; labelType?: string; labelTemplate?: string}>; final: Array<{value: number; labelHTML: string; labelType?: string; labelTemplate?: string}> }; onResponseChange?: (response: unknown) => void; readOnly?: boolean }> = React.memo(({ block, savedResponse, onResponseChange, readOnly }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [userHeight, setUserHeight] = useState<number | null>(null);
  const chartHeight = userHeight ?? (block.height || 450);
  const latestStateRef = useRef(savedResponse);
  const onResponseChangeRef = useRef(onResponseChange);
  onResponseChangeRef.current = onResponseChange;
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'barChartReady' && latestStateRef.current && iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage({ type: 'loadBarChartState', state: latestStateRef.current }, window.location.origin);
      }
      if (e.data?.type === 'barChartState') {
        latestStateRef.current = e.data.state;
        onResponseChangeRef.current?.(e.data.state);
      }
      if (e.data?.type === 'barChartWheel' && iframeRef.current) {
        const scrollParent = iframeRef.current.closest('.overflow-y-auto');
        if (scrollParent) scrollParent.scrollBy({ top: e.data.deltaY, left: e.data.deltaX });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="space-y-2">
      {block.title && <BlockText text={block.title} tag="p" className="text-base text-[var(--text-primary)] font-medium text-center" />}
      <iframe
        ref={iframeRef}
        src="/tools/bar-chart.html?embedded=true"
        className="w-full rounded-lg border border-[var(--border)]"
        style={{ height: chartHeight, background: 'transparent', pointerEvents: readOnly ? 'none' : isResizing ? 'none' : 'auto' }}
        title="Bar Chart Tool"
      />
      {!readOnly && <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize chart height"
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          height: '16px', cursor: 'row-resize', userSelect: 'none',
          borderRadius: '0 0 8px 8px',
          background: isResizing
            ? (isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)')
            : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'),
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)'}`, borderTop: 'none',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'; }}
        onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; }}
        onMouseDown={e => {
          e.preventDefault();
          resizeRef.current = { startY: e.clientY, startH: chartHeight };
          setIsResizing(true);

          const onMove = (ev: MouseEvent) => {
            if (!resizeRef.current) return;
            const newH = Math.max(200, Math.min(1000, resizeRef.current.startH + (ev.clientY - resizeRef.current.startY)));
            setUserHeight(newH);
          };
          const onUp = () => {
            resizeRef.current = null;
            setIsResizing(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
        onTouchStart={e => {
          const touch = e.touches[0];
          resizeRef.current = { startY: touch.clientY, startH: chartHeight };
          setIsResizing(true);

          const onTouchMove = (ev: TouchEvent) => {
            if (!resizeRef.current) return;
            const newH = Math.max(200, Math.min(1000, resizeRef.current.startH + (ev.touches[0].clientY - resizeRef.current.startY)));
            setUserHeight(newH);
          };
          const onTouchEnd = () => {
            resizeRef.current = null;
            setIsResizing(false);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
          };
          window.addEventListener('touchmove', onTouchMove);
          window.addEventListener('touchend', onTouchEnd);
        }}
        title="Drag to resize chart"
      >
        <GripHorizontal size={14} color={isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} />
      </div>}
    </div>
  );
});

const RankingBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void; savedResponse?: { order: { item: string; origIdx: number }[]; submitted: boolean }; onResponseChange?: (response: unknown) => void; readOnly?: boolean }> = React.memo(({ block, onComplete, savedResponse, onResponseChange, readOnly }) => {
  const correctOrder = block.items || [];
  const shuffled = useMemo(() => {
    const items = block.items || [];
    const arr = items.map((item, idx) => ({ item, origIdx: idx }));
    let seed = block.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 16807 + 0) % 2147483647;
      const j = seed % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [block.id, block.items]);

  const [order, setOrder] = useState(savedResponse?.order ?? shuffled);
  const [submitted, setSubmitted] = useState(savedResponse?.submitted ?? false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const moveItem = (from: number, to: number) => {
    if (submitted) return;
    setOrder(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onResponseChange?.({ order: next, submitted: false });
      return next;
    });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    const isCorrect = order.every((item, idx) => item.origIdx === idx);
    onResponseChange?.({ order, submitted: true });
    onComplete(isCorrect);
  };

  const correctCount = order.filter((item, idx) => item.origIdx === idx).length;

  return (
    <div className="space-y-3" role="list" aria-label={block.content || 'Ranking activity'}>
      <div className="text-base text-[var(--text-primary)] font-medium flex items-center gap-2" translate="no">
        <GripVertical className="w-4 h-4 text-purple-400 shrink-0" />
        <BlockText text={block.content} />
      </div>
      <div className="space-y-1" translate="no">
        {order.map((item, idx) => (
          <div
            key={item.origIdx}
            role="listitem"
            aria-label={`Item ${idx + 1}: ${item.item}`}
            draggable={!submitted && !readOnly}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null) moveItem(dragIdx, idx); setDragIdx(null); }}
            className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${
              readOnly
                ? 'border-[var(--border)] bg-[var(--surface-glass)] text-[var(--text-secondary)]'
                : submitted
                ? item.origIdx === idx
                  ? 'border-green-500/30 bg-green-500/5 text-green-400'
                  : 'border-red-500/30 bg-red-500/5 text-red-400'
                : dragIdx === idx
                ? 'border-purple-500/30 bg-purple-500/10 text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--surface-glass)] text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)]'
            }`}
          >
            <GripVertical className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <span className="text-xs font-mono text-[var(--text-muted)] w-5">{idx + 1}.</span>
            <BlockText text={item.item} className="flex-1" />
            {!readOnly && submitted && item.origIdx === idx && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {!readOnly && submitted && item.origIdx !== idx && <XCircle className="w-4 h-4 text-red-400" />}
            {!readOnly && !submitted && (
              <div className="flex gap-0.5">
                <button onClick={() => idx > 0 && moveItem(idx, idx - 1)} disabled={idx === 0} aria-label="Move up" className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20"><ChevronRight className="w-3 h-3 -rotate-90" /></button>
                <button onClick={() => idx < order.length - 1 && moveItem(idx, idx + 1)} disabled={idx === order.length - 1} aria-label="Move down" className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20"><ChevronRight className="w-3 h-3 rotate-90" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!readOnly && !submitted && (
        <button onClick={handleSubmit} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition">
          Check Order
        </button>
      )}
      {!readOnly && submitted && (
        <div className="flex items-center gap-3">
          <div className={`text-xs font-bold ${correctCount === correctOrder.length ? 'text-green-400' : 'text-amber-400'}`}>
            {correctCount === correctOrder.length ? 'Perfect order!' : `${correctCount}/${correctOrder.length} in correct position`}
          </div>
          <button
            onClick={() => {
              setSubmitted(false);
              onResponseChange?.({ order, submitted: false });
            }}
            className="flex items-center gap-1 text-[11.5px] text-[var(--text-tertiary)] hover:text-purple-400 transition"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
      )}
    </div>
  );
});

const LinkedBlock: React.FC<{ block: LessonBlock; allBlocks: LessonBlock[]; onComplete: (correct: boolean) => void; savedResponse?: { answer: string; answered: boolean; isCorrect: boolean }; onResponseChange?: (response: unknown) => void; readOnly?: boolean }> = React.memo(({ block, allBlocks, onComplete, savedResponse, onResponseChange, readOnly }) => {
  const linkedBlock = allBlocks.find(b => b.id === block.linkedBlockId);
  const [answer, setAnswer] = useState(savedResponse?.answer ?? '');
  const [answered, setAnswered] = useState(savedResponse?.answered ?? false);
  const [isCorrect, setIsCorrect] = useState(savedResponse?.isCorrect ?? false);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    const accepted = (block.acceptedAnswers || []).map(a => a.toLowerCase().trim());
    const correct = accepted.length === 0 || accepted.includes(answer.toLowerCase().trim());
    setIsCorrect(correct);
    setAnswered(true);
    onResponseChange?.({ answer, answered: true, isCorrect: correct });
    onComplete(correct);
  };

  return (
    <div className="space-y-3">
      {linkedBlock && (
        <div className="border border-[var(--border)] bg-[var(--surface-glass)] rounded-xl p-3">
          <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1 flex items-center gap-1">
            <Link className="w-3 h-3" /> Referenced question
          </div>
          <BlockText text={linkedBlock.content} tag="p" className="text-xs text-[var(--text-tertiary)]" />
        </div>
      )}
      <div className="text-base text-[var(--text-primary)] font-medium flex items-center gap-2" translate="no">
        <Link className="w-4 h-4 text-purple-400 shrink-0" />
        <BlockText text={block.content} />
      </div>
      <div className="flex gap-2 items-end">
        <textarea
          value={answer}
          onChange={e => {
            const val = e.target.value;
            setAnswer(val);
            onResponseChange?.({ answer: val, answered: false, isCorrect: false });
          }}
          disabled={answered || readOnly}
          placeholder="Type your answer... (Ctrl+Enter to lock in)"
          aria-label={block.content || 'Linked question answer'}
          className="flex-1 bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 focus-visible:ring-2 focus-visible:ring-purple-400 transition resize-y min-h-[38px]"
          rows={2}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        {!readOnly && !answered && (
          <button onClick={handleSubmit} disabled={!answer.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shrink-0">
            Lock In
          </button>
        )}
      </div>
      {!readOnly && answered && (
        <div className="flex items-center gap-3">
          <div className={`text-xs font-bold flex items-center gap-1 ${isCorrect ? 'text-green-400' : 'text-amber-400'}`}>
            {isCorrect ? <><CheckCircle2 className="w-3 h-3" /> Correct!</> : <><XCircle className="w-3 h-3" /> {(block.acceptedAnswers || []).length > 0 ? 'Not quite — review the material above.' : 'Response recorded'}</>}
          </div>
          <button
            onClick={() => {
              setAnswered(false);
              onResponseChange?.({ answer, answered: false, isCorrect: false });
            }}
            className="flex items-center gap-1 text-[11.5px] text-[var(--text-tertiary)] hover:text-purple-400 transition"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
      )}
    </div>
  );
});

// ──────────────────────────────────────────────
// Main lesson viewer
// ──────────────────────────────────────────────

const LessonBlocks: React.FC<LessonBlocksProps> = ({ blocks, onBlockComplete, onAllComplete, showSidebar = false, engagementTime, xpEarned, savedResponses, onResponseChange, onExportPdf, onClearResponses, readOnly }) => {
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState<'clear' | 'export-clear' | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showActionsMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showActionsMenu]);
  // Restore completedBlocks from saved responses (blocks that were already answered)
  const [completedBlocks, setCompletedBlocks] = useState<Set<string>>(() => {
    if (!savedResponses) return new Set<string>();
    const restored = new Set<string>();
    for (const blockId of Object.keys(savedResponses)) {
      const resp = savedResponses[blockId];
      if (resp?.answered || resp?.submitted || resp?.checked?.length > 0) {
        restored.add(blockId);
      }
    }
    return restored;
  });
  const [visibleBlockIndex, setVisibleBlockIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const allCompleteFireRef = useRef(false);

  useEffect(() => {
    allCompleteFireRef.current = false;
  }, [blocks]);

  const handleBlockComplete = useCallback((blockId: string, correct: boolean) => {
    onBlockComplete?.(blockId, correct);
    setCompletedBlocks(prev => {
      const next = new Set(prev);
      next.add(blockId);
      const interactiveBlocks = blocks.filter(b => INTERACTIVE_TYPES.includes(b.type));
      if (interactiveBlocks.every(b => next.has(b.id)) && !allCompleteFireRef.current) {
        allCompleteFireRef.current = true;
        onAllComplete?.();
      }
      return next;
    });
  }, [blocks, onBlockComplete, onAllComplete]);

  // Remove a block from completed set when student clicks Edit
  const handleBlockUncomplete = useCallback((blockId: string) => {
    setCompletedBlocks(prev => {
      if (!prev.has(blockId)) return prev;
      const next = new Set(prev);
      next.delete(blockId);
      allCompleteFireRef.current = false;
      return next;
    });
  }, []);

  // IntersectionObserver for scroll-reveal animations + tracking visible block
  useEffect(() => {
    const elements = blockRefs.current;
    if (elements.size === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting && !el.classList.contains('block-visible')) {
            // One-way reveal: once visible, stays visible (no fade-out loop)
            el.classList.add('block-visible');
          }
          // Track current intersection state for sidebar navigation
          el.dataset.intersecting = entry.isIntersecting ? 'true' : 'false';
        });

        // Track the topmost currently-intersecting block for the sidebar
        let topVisibleIdx = blocks.length - 1;
        for (let i = 0; i < blocks.length; i++) {
          const el = elements.get(blocks[i].id);
          if (el && el.dataset.intersecting === 'true') {
            topVisibleIdx = i;
            break;
          }
        }
        setVisibleBlockIndex(topVisibleIdx);
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '0px 0px -5% 0px',
        threshold: 0.1,
      }
    );

    elements.forEach(el => observer.observe(el));

    // Fallback: ensure all blocks become visible after a short delay.
    // Prevents blocks from staying invisible if the IntersectionObserver
    // can't reach them (e.g. last block on small Chromebook screens).
    const fallbackTimer = setTimeout(() => {
      elements.forEach(el => {
        if (!el.classList.contains('block-visible')) {
          el.classList.add('block-visible');
        }
      });
    }, 1500);

    return () => {
      observer.disconnect();
      clearTimeout(fallbackTimer);
    };
  }, [blocks]);

  // Navigate to a block by scrolling
  const navigateToBlock = useCallback((index: number) => {
    const block = blocks[index];
    if (!block) return;
    const el = blockRefs.current.get(block.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  }, [blocks]);

  // Keyboard shortcuts: j/k to navigate between blocks, ? for help
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === 'j') {
        e.preventDefault();
        const next = Math.min(visibleBlockIndex + 1, blocks.length - 1);
        navigateToBlock(next);
      } else if (e.key === 'k') {
        e.preventDefault();
        const prev = Math.max(visibleBlockIndex - 1, 0);
        navigateToBlock(prev);
      } else if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcutsHelp(p => !p);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visibleBlockIndex, blocks.length, navigateToBlock]);

  if (blocks.length === 0) return null;

  const renderBlock = (block: LessonBlock) => {
    const onComplete = (correct: boolean) => handleBlockComplete(block.id, correct);
    const saved = savedResponses?.[block.id];
    const onRespChange = onResponseChange ? (resp: unknown) => {
      onResponseChange(block.id, resp);
      // If the response signals un-submission (Edit button clicked), remove from completed set
      const r = resp as Record<string, unknown> | null;
      if (r && (r.answered === false || r.submitted === false)) {
        handleBlockUncomplete(block.id);
      }
    } : undefined;

    switch (block.type) {
      case 'TEXT': return <TextBlock block={block} />;
      case 'INFO_BOX': return <InfoBoxBlock block={block} />;
      case 'MC': return <MCBlock block={block} onComplete={onComplete} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} />;
      case 'SHORT_ANSWER': return <ShortAnswerBlock block={block} onComplete={onComplete} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} />;
      case 'VOCABULARY': return <VocabularyBlock block={block} />;
      case 'CHECKLIST': return <ChecklistBlock block={block} onComplete={onComplete} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} />;
      case 'SECTION_HEADER': return <SectionHeaderBlock block={block} />;
      case 'IMAGE': return <ImageBlock block={block} />;
      case 'VIDEO': return <VideoBlock block={block} />;
      case 'OBJECTIVES': return <ObjectivesBlock block={block} />;
      case 'DIVIDER': return <DividerBlock />;
      case 'EXTERNAL_LINK': return <ExternalLinkBlock block={block} />;
      case 'EMBED': return <EmbedBlock block={block} />;
      case 'VOCAB_LIST': return <VocabListBlock block={block} />;
      case 'ACTIVITY': return <ActivityBlock block={block} />;
      case 'SORTING': return <SortingBlock block={block} onComplete={onComplete} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} />;
      case 'DATA_TABLE': return <DataTableBlock block={block} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} />;
      case 'BAR_CHART': return <BarChartBlock block={block} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} />;
      case 'RANKING': return <RankingBlock block={block} onComplete={onComplete} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} />;
      case 'LINKED': return <LinkedBlock block={block} allBlocks={blocks} onComplete={onComplete} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} />;
      case 'DRAWING': return <React.Suspense fallback={<div className="h-[400px] bg-[var(--surface-glass)] rounded-xl animate-pulse flex items-center justify-center text-[var(--text-muted)] text-sm">Loading drawing tool...</div>}><DrawingBlock block={block} onComplete={onComplete} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} /></React.Suspense>;
      case 'MATH_RESPONSE': return <React.Suspense fallback={<div className="h-[200px] bg-[var(--surface-glass)] rounded-xl animate-pulse flex items-center justify-center text-[var(--text-muted)] text-sm">Loading math tool...</div>}><MathResponseBlock block={block} onComplete={onComplete} savedResponse={saved} onResponseChange={readOnly ? undefined : onRespChange} readOnly={readOnly} /></React.Suspense>;
      default: return <div className="text-sm text-[var(--text-muted)] italic">Unknown block type: {block.type}</div>;
    }
  };

  // Completion progress based on interactive blocks
  const interactiveBlockCount = blocks.filter(b => INTERACTIVE_TYPES.includes(b.type)).length;
  const completionProgress = interactiveBlockCount > 0
    ? Math.round((completedBlocks.size / interactiveBlockCount) * 100)
    : 100;

  const hasAnyResponses = savedResponses && Object.keys(savedResponses).length > 0;

  const contentArea = (
    <div className="flex-1 min-w-0 flex flex-col overflow-clip">
      {/* Progress bar + actions */}
      {!readOnly && <div className={`flex items-center gap-2 ${showSidebar && blocks.length >= 3 ? 'mb-1 justify-end' : 'mb-3'} shrink-0`}>
        {!(showSidebar && blocks.length >= 3) && <>
          <div className="flex-1 bg-[var(--surface-glass)] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-purple-500 transition-all duration-500"
              style={{ width: `${completionProgress}%` }}
            />
          </div>
          <span className="text-[11.5px] text-[var(--text-muted)] font-mono">{completedBlocks.size}/{interactiveBlockCount}</span>
        </>}

        {/* Actions menu */}
        {(onExportPdf || onClearResponses) && (
          <div ref={actionsRef} className="relative">
            <button
              onClick={() => setShowActionsMenu(prev => !prev)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--surface-glass-heavy)] transition cursor-pointer"
              title="Progress options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showActionsMenu && !showClearConfirm && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl shadow-2xl min-w-[200px] py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                {onExportPdf && (
                  <button
                    onClick={() => { onExportPdf(); setShowActionsMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass)] transition text-left cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5 text-blue-400" /> Export to PDF
                  </button>
                )}
                {onExportPdf && onClearResponses && (
                  <button
                    onClick={() => setShowClearConfirm('export-clear')}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass)] transition text-left cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5 text-amber-400" /> Export & Clear
                  </button>
                )}
                {onClearResponses && hasAnyResponses && (
                  <>
                    <div className="border-t border-[var(--border)] my-1" />
                    <button
                      onClick={() => setShowClearConfirm('clear')}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/5 transition text-left cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear Responses
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Confirmation dialog */}
            {showClearConfirm && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl shadow-2xl min-w-[240px] p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  {showClearConfirm === 'export-clear'
                    ? 'Export your progress, then clear all responses? This cannot be undone.'
                    : 'Clear all your responses? This cannot be undone.'}
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => { setShowClearConfirm(null); setShowActionsMenu(false); }}
                    className="text-[11.5px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--surface-glass)] transition font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (showClearConfirm === 'export-clear') onExportPdf?.();
                      onClearResponses?.();
                      setShowClearConfirm(null);
                      setShowActionsMenu(false);
                    }}
                    className="text-[11.5px] text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg transition font-bold cursor-pointer"
                  >
                    {showClearConfirm === 'export-clear' ? 'Export & Clear' : 'Clear'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>}

      {/* Scrollable block container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar select-text"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="flex flex-col gap-6 pb-16 px-1">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              id={`block-${block.id}`}
              ref={(el) => { if (el) blockRefs.current.set(block.id, el); else blockRefs.current.delete(block.id); }}
              tabIndex={-1}
              className={`block-reveal ${block.type === 'DIVIDER' ? '' : 'bg-[var(--surface-glass)] border border-[var(--border)] rounded-2xl p-5'}`}
              data-stagger={index % 4}
              style={{ scrollMarginTop: 20 }}
            >
              {renderBlock(block)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const shortcutsOverlay = showShortcutsHelp ? (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" role="dialog" aria-modal="true" onClick={() => setShowShortcutsHelp(false)} onKeyDown={e => { if (e.key === 'Tab') e.preventDefault(); }}>
      <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-6 max-w-xs w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Keyboard Shortcuts</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between text-[var(--text-secondary)]"><span>Next block</span><kbd className="bg-[var(--surface-glass-heavy)] px-2 py-0.5 rounded font-mono">j</kbd></div>
          <div className="flex justify-between text-[var(--text-secondary)]"><span>Previous block</span><kbd className="bg-[var(--surface-glass-heavy)] px-2 py-0.5 rounded font-mono">k</kbd></div>
          <div className="flex justify-between text-[var(--text-secondary)]"><span>Lock in answer</span><kbd className="bg-[var(--surface-glass-heavy)] px-2 py-0.5 rounded font-mono">Ctrl+Enter</kbd></div>
          <div className="flex justify-between text-[var(--text-secondary)]"><span>Toggle this help</span><kbd className="bg-[var(--surface-glass-heavy)] px-2 py-0.5 rounded font-mono">?</kbd></div>
        </div>
        <button autoFocus onClick={() => setShowShortcutsHelp(false)} className="mt-4 w-full py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-xs font-bold text-white transition">
          Got it
        </button>
      </div>
    </div>
  ) : null;

  if (showSidebar && blocks.length >= 3) {
    return (
      <div className="flex gap-4 h-full">
        {contentArea}
        <FeatureErrorBoundary feature="Lesson Progress Sidebar">
          <LessonProgressSidebar
            blocks={blocks}
            currentBlockIndex={visibleBlockIndex}
            completedBlocks={completedBlocks}
            onNavigateToBlock={navigateToBlock}
            engagementTime={engagementTime}
            xpEarned={xpEarned}
          />
        </FeatureErrorBoundary>
        {shortcutsOverlay}
      </div>
    );
  }

  return <>{contentArea}{shortcutsOverlay}</>;
};

export default LessonBlocks;

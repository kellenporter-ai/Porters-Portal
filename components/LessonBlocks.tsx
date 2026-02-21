
import React, { useState, useCallback, useMemo } from 'react';
import {
  CheckCircle2, XCircle, ChevronRight, BookOpen, MessageSquare, HelpCircle, ListChecks,
  ExternalLink, GripVertical, Target, Link, Play
} from 'lucide-react';
import { LessonBlock } from '../types';
import LessonProgressSidebar from './LessonProgressSidebar';

export type { LessonBlock } from '../types';

interface LessonBlocksProps {
  blocks: LessonBlock[];
  onBlockComplete?: (blockId: string, correct: boolean) => void;
  onAllComplete?: () => void;
  showSidebar?: boolean;
  engagementTime?: number;
  xpEarned?: number;
}

// ──────────────────────────────────────────────
// Interactive block types (require completion)
// ──────────────────────────────────────────────
const INTERACTIVE_TYPES = ['MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED'];

// ──────────────────────────────────────────────
// Original block renderers
// ──────────────────────────────────────────────

const TextBlock: React.FC<{ block: LessonBlock }> = ({ block }) => (
  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
    {block.content}
  </div>
);

const InfoBoxBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const variantStyles = {
    tip: 'border-green-500/30 bg-green-500/5 text-green-400',
    warning: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    note: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
  };
  const style = variantStyles[block.variant || 'note'];
  return (
    <div className={`border rounded-xl p-4 text-sm ${style}`}>
      <div className="font-bold text-xs uppercase tracking-widest mb-1">
        {block.variant === 'tip' ? 'Tip' : block.variant === 'warning' ? 'Warning' : 'Note'}
      </div>
      <div className="text-gray-300">{block.content}</div>
    </div>
  );
};

const MCBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void }> = ({ block, onComplete }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const isCorrect = selected === block.correctAnswer;

  const handleSubmit = () => {
    if (selected === null) return;
    setAnswered(true);
    onComplete(selected === block.correctAnswer);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white font-medium flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-purple-400 shrink-0" />
        {block.content}
      </p>
      <div className="space-y-2">
        {(block.options || []).map((opt, idx) => (
          <button
            key={idx}
            onClick={() => !answered && setSelected(idx)}
            disabled={answered}
            className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
              answered && idx === block.correctAnswer
                ? 'border-green-500/50 bg-green-500/10 text-green-400'
                : answered && idx === selected && !isCorrect
                ? 'border-red-500/50 bg-red-500/10 text-red-400'
                : selected === idx
                ? 'border-purple-500/30 bg-purple-500/10 text-white'
                : 'border-white/10 bg-white/5 hover:bg-white/10 text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-600 w-5">{String.fromCharCode(65 + idx)}.</span>
              <span>{opt}</span>
              {answered && idx === block.correctAnswer && <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />}
              {answered && idx === selected && !isCorrect && <XCircle className="w-4 h-4 text-red-400 ml-auto" />}
            </div>
          </button>
        ))}
      </div>
      {!answered && (
        <button onClick={handleSubmit} disabled={selected === null} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition">
          Check Answer
        </button>
      )}
      {answered && (
        <div className={`text-xs font-bold ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
          {isCorrect ? 'Correct!' : 'Incorrect — review the material above.'}
        </div>
      )}
    </div>
  );
};

const ShortAnswerBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void }> = ({ block, onComplete }) => {
  const [answer, setAnswer] = useState('');
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    const accepted = (block.acceptedAnswers || []).map(a => a.toLowerCase().trim());
    const correct = accepted.includes(answer.toLowerCase().trim());
    setIsCorrect(correct);
    setAnswered(true);
    onComplete(correct);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white font-medium flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" />
        {block.content}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={answered}
          placeholder="Type your answer..."
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        {!answered && (
          <button onClick={handleSubmit} disabled={!answer.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition">
            Submit
          </button>
        )}
      </div>
      {answered && (
        <div className={`text-xs font-bold flex items-center gap-1 ${isCorrect ? 'text-green-400' : 'text-amber-400'}`}>
          {isCorrect ? <><CheckCircle2 className="w-3 h-3" /> Correct!</> : <><XCircle className="w-3 h-3" /> Accepted answers: {(block.acceptedAnswers || []).join(', ')}</>}
        </div>
      )}
    </div>
  );
};

const VocabularyBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      onClick={() => setFlipped(!flipped)}
      className="w-full text-left p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-bold text-white">{block.term}</div>
          {flipped ? (
            <div className="text-sm text-gray-300 mt-1 animate-in fade-in duration-200">{block.definition}</div>
          ) : (
            <div className="text-xs text-gray-600 mt-1">Tap to reveal definition</div>
          )}
        </div>
      </div>
    </button>
  );
};

const ChecklistBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void }> = ({ block, onComplete }) => {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const allChecked = (block.items || []).length > 0 && checked.size === (block.items || []).length;

  const toggle = (idx: number) => {
    const next = new Set(checked);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setChecked(next);
    if (next.size === (block.items || []).length) {
      onComplete(true);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white font-medium flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-green-400 shrink-0" />
        {block.content}
      </p>
      <div className="space-y-2">
        {(block.items || []).map((item, idx) => (
          <button
            key={idx}
            onClick={() => toggle(idx)}
            className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border text-sm transition ${
              checked.has(idx)
                ? 'border-green-500/30 bg-green-500/5 text-green-400 line-through'
                : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${
              checked.has(idx) ? 'border-green-500 bg-green-500' : 'border-gray-600'
            }`}>
              {checked.has(idx) && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            {item}
          </button>
        ))}
      </div>
      {allChecked && (
        <div className="text-xs font-bold text-green-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> All items completed!
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────
// NEW block renderers
// ──────────────────────────────────────────────

const SectionHeaderBlock: React.FC<{ block: LessonBlock }> = ({ block }) => (
  <div className="text-center py-2">
    {block.icon && <div className="text-3xl mb-2">{block.icon}</div>}
    <h2 className="text-xl font-black text-white tracking-tight">{block.title}</h2>
    {block.subtitle && <p className="text-sm text-gray-400 mt-1">{block.subtitle}</p>}
  </div>
);

const ImageBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const driveUrl = (block.url || '').replace(/\/file\/d\/([^/]+)\/.*/, '/uc?export=view&id=$1');
  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20">
        <img
          src={driveUrl !== block.url ? driveUrl : block.url}
          alt={block.alt || block.caption || ''}
          className="w-full max-h-[500px] object-contain"
          loading="lazy"
        />
      </div>
      {block.caption && <p className="text-xs text-gray-500 text-center italic">{block.caption}</p>}
    </div>
  );
};

const VideoBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const getEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : '';
  };
  const embedUrl = getEmbedUrl(block.url || '');

  if (!embedUrl) return <div className="text-sm text-gray-500 italic">Invalid video URL</div>;

  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-white/10 aspect-video bg-black">
        <iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" title={block.caption || 'Video'} />
      </div>
      {block.caption && <p className="text-xs text-gray-500 text-center italic flex items-center justify-center gap-1"><Play className="w-3 h-3" /> {block.caption}</p>}
    </div>
  );
};

const ObjectivesBlock: React.FC<{ block: LessonBlock }> = ({ block }) => (
  <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-4 space-y-2">
    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
      <Target className="w-4 h-4" />
      {block.title || 'Learning Objectives'}
    </div>
    <ul className="space-y-1">
      {(block.items || []).map((item, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
          <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
          {item}
        </li>
      ))}
    </ul>
  </div>
);

const DividerBlock: React.FC = () => (
  <div className="py-2">
    <hr className="border-white/10" />
  </div>
);

const ExternalLinkBlock: React.FC<{ block: LessonBlock }> = ({ block }) => (
  <a
    href={block.url}
    target={block.openInNewTab !== false ? '_blank' : '_self'}
    rel="noopener noreferrer"
    className="block p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition group"
  >
    <div className="flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-purple-300 group-hover:text-purple-200 transition">{block.title || block.url}</div>
        {block.content && <div className="text-xs text-gray-400 mt-0.5">{block.content}</div>}
      </div>
      <div className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-lg shrink-0 ml-3">
        {block.buttonLabel || 'Open'} <ExternalLink className="w-3 h-3" />
      </div>
    </div>
  </a>
);

const EmbedBlock: React.FC<{ block: LessonBlock }> = ({ block }) => (
  <div className="space-y-2">
    <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20" style={{ height: block.height || 500 }}>
      <iframe src={block.url} className="w-full h-full border-0" title={block.caption || 'Embedded content'} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
    </div>
    {block.caption && <p className="text-xs text-gray-500 text-center italic">{block.caption}</p>}
  </div>
);

const VocabListBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  return (
    <div className="space-y-2">
      {(block.terms || []).map((t, idx) => (
        <button
          key={idx}
          onClick={() => setRevealed(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; })}
          className="w-full text-left p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition cursor-pointer"
        >
          <div className="flex items-start gap-3">
            <BookOpen className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-bold text-white">{t.term}</div>
              {revealed.has(idx) ? (
                <div className="text-sm text-gray-300 mt-1 animate-in fade-in duration-200">{t.definition}</div>
              ) : (
                <div className="text-xs text-gray-600 mt-1">Tap to reveal</div>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

const ActivityBlock: React.FC<{ block: LessonBlock }> = ({ block }) => (
  <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-2">
    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
      {block.icon && <span className="text-lg">{block.icon}</span>}
      {block.title || 'Activity'}
    </div>
    <div className="text-sm text-gray-300 whitespace-pre-line">{block.instructions}</div>
  </div>
);

const SortingBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void }> = ({ block, onComplete }) => {
  const items = block.sortItems || [];
  const [placements, setPlacements] = useState<Record<number, 'left' | 'right'>>({});
  const [submitted, setSubmitted] = useState(false);

  const unplaced = items.map((_, i) => i).filter(i => !(i in placements));
  const leftItems = Object.entries(placements).filter(([, v]) => v === 'left').map(([k]) => parseInt(k));
  const rightItems = Object.entries(placements).filter(([, v]) => v === 'right').map(([k]) => parseInt(k));

  const placeItem = (itemIdx: number, side: 'left' | 'right') => {
    if (submitted) return;
    setPlacements(prev => ({ ...prev, [itemIdx]: side }));
  };

  const removeItem = (itemIdx: number) => {
    if (submitted) return;
    setPlacements(prev => {
      const next = { ...prev };
      delete next[itemIdx];
      return next;
    });
  };

  const handleSubmit = () => {
    if (unplaced.length > 0) return;
    setSubmitted(true);
    const allCorrect = items.every((item, idx) => placements[idx] === item.correct);
    onComplete(allCorrect);
  };

  const correctCount = items.filter((item, idx) => placements[idx] === item.correct).length;

  return (
    <div className="space-y-3">
      {block.title && <p className="text-sm text-white font-medium">{block.title}</p>}
      {block.instructions && <p className="text-xs text-gray-400">{block.instructions}</p>}

      {/* Unplaced items */}
      {unplaced.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Sort these items</div>
          <div className="flex flex-wrap gap-2">
            {unplaced.map(idx => (
              <div key={idx} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300">
                <span>{items[idx].text}</span>
                <button onClick={() => placeItem(idx, 'left')} className="ml-1 text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-500/30 transition">{block.leftLabel || 'L'}</button>
                <button onClick={() => placeItem(idx, 'right')} className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded hover:bg-orange-500/30 transition">{block.rightLabel || 'R'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category columns */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 min-h-[80px]">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">{block.leftLabel || 'Category A'}</div>
          <div className="space-y-1">
            {leftItems.map(idx => (
              <div key={idx} className={`flex items-center justify-between px-2 py-1 rounded text-sm ${submitted ? (items[idx].correct === 'left' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10') : 'text-gray-300 bg-black/20'}`}>
                <span>{items[idx].text}</span>
                {!submitted && <button onClick={() => removeItem(idx)} className="text-gray-500 hover:text-red-400 text-xs">×</button>}
                {submitted && items[idx].correct === 'left' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                {submitted && items[idx].correct !== 'left' && <XCircle className="w-3 h-3 text-red-400" />}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 min-h-[80px]">
          <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">{block.rightLabel || 'Category B'}</div>
          <div className="space-y-1">
            {rightItems.map(idx => (
              <div key={idx} className={`flex items-center justify-between px-2 py-1 rounded text-sm ${submitted ? (items[idx].correct === 'right' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10') : 'text-gray-300 bg-black/20'}`}>
                <span>{items[idx].text}</span>
                {!submitted && <button onClick={() => removeItem(idx)} className="text-gray-500 hover:text-red-400 text-xs">×</button>}
                {submitted && items[idx].correct === 'right' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                {submitted && items[idx].correct !== 'right' && <XCircle className="w-3 h-3 text-red-400" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!submitted && unplaced.length === 0 && items.length > 0 && (
        <button onClick={handleSubmit} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition">
          Check Sorting
        </button>
      )}
      {submitted && (
        <div className={`text-xs font-bold ${correctCount === items.length ? 'text-green-400' : 'text-amber-400'}`}>
          {correctCount === items.length ? 'All correct!' : `${correctCount}/${items.length} correct`}
        </div>
      )}
    </div>
  );
};

const DataTableBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const columns = block.columns || [];
  const rowCount = block.trials || 3;
  const [data, setData] = useState<Record<string, string>[]>(() =>
    Array.from({ length: rowCount }, () => Object.fromEntries(columns.map(c => [c.key, ''])))
  );

  const updateCell = (rowIdx: number, colKey: string, val: string) => {
    setData(prev => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [colKey]: val };
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {block.title && <p className="text-sm text-white font-medium">{block.title}</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className="px-3 py-2 text-[10px] text-gray-500 uppercase font-bold text-left w-12">#</th>
              {columns.map(col => (
                <th key={col.key} className="px-3 py-2 text-[10px] text-gray-500 uppercase font-bold text-left">
                  {col.label}{col.unit ? ` (${col.unit})` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-t border-white/5">
                <td className="px-3 py-1 text-xs text-gray-600 font-mono">{rowIdx + 1}</td>
                {columns.map(col => (
                  <td key={col.key} className="px-1 py-1">
                    {col.editable !== false ? (
                      <input
                        type="text"
                        value={row[col.key] || ''}
                        onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                        className="w-full bg-black/20 border border-white/5 rounded px-2 py-1 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/50 transition"
                      />
                    ) : (
                      <span className="px-2 py-1 text-gray-400">{row[col.key]}</span>
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
};

const BarChartBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const barCount = block.barCount || 3;
  const chartHeight = block.height || 300;
  const [values, setValues] = useState<number[]>(() => Array(barCount).fill(0));
  const maxVal = Math.max(...values.map(Math.abs), 1);
  const colors = ['#a855f7', '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

  const handleBarClick = (idx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const normalizedVal = Math.round(((rect.height / 2 - clickY) / (rect.height / 2)) * 10);
    setValues(prev => { const next = [...prev]; next[idx] = normalizedVal; return next; });
  };

  return (
    <div className="space-y-2">
      {block.title && <p className="text-sm text-white font-medium text-center">{block.title}</p>}
      <div className="flex items-end justify-center gap-4 px-4" style={{ height: chartHeight }}>
        {values.map((val, idx) => {
          const barHeight = Math.abs(val) / Math.max(maxVal, 10) * (chartHeight / 2 - 20);
          return (
            <div key={idx} className="flex flex-col items-center gap-1 flex-1 h-full justify-center cursor-pointer" onClick={(e) => handleBarClick(idx, e)}>
              <div className="relative w-full max-w-[60px] h-full flex items-center">
                <div className="absolute inset-0 border-b border-white/10" style={{ top: '50%' }} />
                <div
                  className="absolute left-0 right-0 rounded-t-lg transition-all duration-200"
                  style={{
                    height: barHeight,
                    bottom: val >= 0 ? '50%' : undefined,
                    top: val < 0 ? '50%' : undefined,
                    backgroundColor: colors[idx % colors.length],
                    opacity: 0.8,
                  }}
                />
              </div>
              <div className="text-[10px] text-gray-400 font-mono">{val}</div>
              <div className="text-[10px] text-gray-500">Bar {idx + 1}</div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 px-4">
        <span>{block.initialLabel}</span>
        <span>{block.deltaLabel}</span>
        <span>{block.finalLabel}</span>
      </div>
    </div>
  );
};

const RankingBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void }> = ({ block, onComplete }) => {
  const correctOrder = block.items || [];
  // Deterministic shuffle based on block ID
  const shuffled = useMemo(() => {
    const arr = correctOrder.map((item, idx) => ({ item, origIdx: idx }));
    let seed = block.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 16807 + 0) % 2147483647;
      const j = seed % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [block.id, correctOrder]);

  const [order, setOrder] = useState(shuffled);
  const [submitted, setSubmitted] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const moveItem = (from: number, to: number) => {
    if (submitted) return;
    setOrder(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    const isCorrect = order.every((item, idx) => item.origIdx === idx);
    onComplete(isCorrect);
  };

  const correctCount = order.filter((item, idx) => item.origIdx === idx).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-white font-medium flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-purple-400 shrink-0" />
        {block.content}
      </p>
      <div className="space-y-1">
        {order.map((item, idx) => (
          <div
            key={item.origIdx}
            draggable={!submitted}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null) moveItem(dragIdx, idx); setDragIdx(null); }}
            className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition cursor-grab active:cursor-grabbing ${
              submitted
                ? item.origIdx === idx
                  ? 'border-green-500/30 bg-green-500/5 text-green-400'
                  : 'border-red-500/30 bg-red-500/5 text-red-400'
                : dragIdx === idx
                ? 'border-purple-500/30 bg-purple-500/10 text-white'
                : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            <GripVertical className="w-4 h-4 text-gray-600 shrink-0" />
            <span className="text-xs font-mono text-gray-600 w-5">{idx + 1}.</span>
            <span className="flex-1">{item.item}</span>
            {submitted && item.origIdx === idx && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {submitted && item.origIdx !== idx && <XCircle className="w-4 h-4 text-red-400" />}
            {!submitted && (
              <div className="flex gap-0.5">
                <button onClick={() => idx > 0 && moveItem(idx, idx - 1)} disabled={idx === 0} className="p-0.5 text-gray-600 hover:text-white disabled:opacity-20"><ChevronRight className="w-3 h-3 -rotate-90" /></button>
                <button onClick={() => idx < order.length - 1 && moveItem(idx, idx + 1)} disabled={idx === order.length - 1} className="p-0.5 text-gray-600 hover:text-white disabled:opacity-20"><ChevronRight className="w-3 h-3 rotate-90" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!submitted && (
        <button onClick={handleSubmit} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition">
          Check Order
        </button>
      )}
      {submitted && (
        <div className={`text-xs font-bold ${correctCount === correctOrder.length ? 'text-green-400' : 'text-amber-400'}`}>
          {correctCount === correctOrder.length ? 'Perfect order!' : `${correctCount}/${correctOrder.length} in correct position`}
        </div>
      )}
    </div>
  );
};

const LinkedBlock: React.FC<{ block: LessonBlock; allBlocks: LessonBlock[]; onComplete: (correct: boolean) => void }> = ({ block, allBlocks, onComplete }) => {
  const linkedBlock = allBlocks.find(b => b.id === block.linkedBlockId);
  const [answer, setAnswer] = useState('');
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    const accepted = (block.acceptedAnswers || []).map(a => a.toLowerCase().trim());
    const correct = accepted.length === 0 || accepted.includes(answer.toLowerCase().trim());
    setIsCorrect(correct);
    setAnswered(true);
    onComplete(correct);
  };

  return (
    <div className="space-y-3">
      {linkedBlock && (
        <div className="border border-white/10 bg-white/5 rounded-xl p-3">
          <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1 flex items-center gap-1">
            <Link className="w-3 h-3" /> Referenced question
          </div>
          <p className="text-xs text-gray-400">{linkedBlock.content}</p>
        </div>
      )}
      <p className="text-sm text-white font-medium flex items-center gap-2">
        <Link className="w-4 h-4 text-purple-400 shrink-0" />
        {block.content}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={answered}
          placeholder="Type your answer..."
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        {!answered && (
          <button onClick={handleSubmit} disabled={!answer.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition">
            Submit
          </button>
        )}
      </div>
      {answered && (
        <div className={`text-xs font-bold flex items-center gap-1 ${isCorrect ? 'text-green-400' : 'text-amber-400'}`}>
          {isCorrect ? <><CheckCircle2 className="w-3 h-3" /> Correct!</> : <><XCircle className="w-3 h-3" /> {(block.acceptedAnswers || []).length > 0 ? `Accepted: ${block.acceptedAnswers?.join(', ')}` : 'Response recorded'}</>}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────
// Main lesson viewer
// ──────────────────────────────────────────────

const LessonBlocks: React.FC<LessonBlocksProps> = ({ blocks, onBlockComplete, onAllComplete, showSidebar = false, engagementTime, xpEarned }) => {
  const [completedBlocks, setCompletedBlocks] = useState<Set<string>>(new Set());
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);

  const handleBlockComplete = useCallback((blockId: string, correct: boolean) => {
    onBlockComplete?.(blockId, correct);
    setCompletedBlocks(prev => {
      const next = new Set(prev);
      next.add(blockId);
      const interactiveBlocks = blocks.filter(b => INTERACTIVE_TYPES.includes(b.type));
      if (interactiveBlocks.every(b => next.has(b.id))) {
        onAllComplete?.();
      }
      return next;
    });
  }, [blocks, onBlockComplete, onAllComplete]);

  const handleNext = () => {
    if (currentBlockIndex < blocks.length - 1) {
      setCurrentBlockIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentBlockIndex > 0) {
      setCurrentBlockIndex(prev => prev - 1);
    }
  };

  if (blocks.length === 0) return null;

  const currentBlock = blocks[currentBlockIndex];
  const isInteractive = INTERACTIVE_TYPES.includes(currentBlock.type);
  const isBlockDone = completedBlocks.has(currentBlock.id);

  const renderBlock = (block: LessonBlock) => {
    const onComplete = (correct: boolean) => handleBlockComplete(block.id, correct);

    switch (block.type) {
      case 'TEXT': return <TextBlock block={block} />;
      case 'INFO_BOX': return <InfoBoxBlock block={block} />;
      case 'MC': return <MCBlock block={block} onComplete={onComplete} />;
      case 'SHORT_ANSWER': return <ShortAnswerBlock block={block} onComplete={onComplete} />;
      case 'VOCABULARY': return <VocabularyBlock block={block} />;
      case 'CHECKLIST': return <ChecklistBlock block={block} onComplete={onComplete} />;
      case 'SECTION_HEADER': return <SectionHeaderBlock block={block} />;
      case 'IMAGE': return <ImageBlock block={block} />;
      case 'VIDEO': return <VideoBlock block={block} />;
      case 'OBJECTIVES': return <ObjectivesBlock block={block} />;
      case 'DIVIDER': return <DividerBlock />;
      case 'EXTERNAL_LINK': return <ExternalLinkBlock block={block} />;
      case 'EMBED': return <EmbedBlock block={block} />;
      case 'VOCAB_LIST': return <VocabListBlock block={block} />;
      case 'ACTIVITY': return <ActivityBlock block={block} />;
      case 'SORTING': return <SortingBlock block={block} onComplete={onComplete} />;
      case 'DATA_TABLE': return <DataTableBlock block={block} />;
      case 'BAR_CHART': return <BarChartBlock block={block} />;
      case 'RANKING': return <RankingBlock block={block} onComplete={onComplete} />;
      case 'LINKED': return <LinkedBlock block={block} allBlocks={blocks} onComplete={onComplete} />;
      default: return <div className="text-sm text-gray-500 italic">Unknown block type: {block.type}</div>;
    }
  };

  const contentArea = (
    <div className="space-y-4 flex-1 min-w-0">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-purple-500 transition-all duration-500"
            style={{ width: `${((currentBlockIndex + 1) / blocks.length) * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 font-mono">{currentBlockIndex + 1}/{blocks.length}</span>
      </div>

      {/* Current block */}
      <div key={currentBlock.id} className="animate-in fade-in slide-in-from-right-2 duration-200">
        {renderBlock(currentBlock)}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-2 border-t border-white/5">
        <button
          onClick={handlePrev}
          disabled={currentBlockIndex === 0}
          className="text-xs text-gray-500 hover:text-white disabled:opacity-30 transition px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          Previous
        </button>

        <div className="flex gap-1">
          {blocks.map((b, i) => (
            <button
              key={b.id}
              onClick={() => setCurrentBlockIndex(i)}
              className={`w-2 h-2 rounded-full transition ${
                i === currentBlockIndex ? 'bg-purple-500 scale-125' :
                completedBlocks.has(b.id) ? 'bg-green-500' :
                'bg-white/10 hover:bg-white/20'
              }`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          disabled={currentBlockIndex >= blocks.length - 1 || (isInteractive && !isBlockDone)}
          className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 disabled:opacity-30 transition px-3 py-1.5 rounded-lg hover:bg-purple-500/10"
        >
          Next <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  if (showSidebar && blocks.length >= 3) {
    return (
      <div className="flex gap-4">
        {contentArea}
        <LessonProgressSidebar
          blocks={blocks}
          currentBlockIndex={currentBlockIndex}
          completedBlocks={completedBlocks}
          onNavigateToBlock={setCurrentBlockIndex}
          engagementTime={engagementTime}
          xpEarned={xpEarned}
        />
      </div>
    );
  }

  return contentArea;
};

export default LessonBlocks;

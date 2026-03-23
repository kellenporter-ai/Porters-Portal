
import React, { useState } from 'react';
import { LessonBlock } from '../types';
import { useTheme } from '../lib/ThemeContext';
import {
  CheckCircle2, HelpCircle, MessageSquare, ListChecks, BookOpen, FileText,
  Heading, Play, Target, Zap,
  ArrowUpDown, Table, BarChart3, GripVertical, Link, ChevronLeft, ChevronRight, Clock, Star,
  Pencil, Calculator
} from 'lucide-react';

interface LessonProgressSidebarProps {
  blocks: LessonBlock[];
  currentBlockIndex: number;
  completedBlocks: Set<string>;
  onNavigateToBlock: (index: number) => void;
  engagementTime?: number;
  xpEarned?: number;
}

// Block types that are meaningful to show in the HUD navigation
// Excluded: DIVIDER, IMAGE, EMBED, INFO_BOX, EXTERNAL_LINK (noise for students)
const VISIBLE_TYPES = new Set([
  'TEXT', 'MC', 'SHORT_ANSWER', 'CHECKLIST', 'VOCABULARY', 'SECTION_HEADER',
  'VIDEO', 'OBJECTIVES', 'VOCAB_LIST', 'ACTIVITY', 'SORTING', 'DATA_TABLE',
  'BAR_CHART', 'RANKING', 'LINKED', 'DRAWING', 'MATH_RESPONSE',
]);

// Block types that award XP when completed
const XP_TYPES = new Set([
  'MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED', 'DRAWING', 'MATH_RESPONSE',
]);

const BLOCK_TYPE_ICON: Record<string, React.ReactNode> = {
  TEXT: <FileText className="w-3 h-3" />,
  MC: <HelpCircle className="w-3 h-3" />,
  SHORT_ANSWER: <MessageSquare className="w-3 h-3" />,
  CHECKLIST: <ListChecks className="w-3 h-3" />,
  VOCABULARY: <BookOpen className="w-3 h-3" />,
  SECTION_HEADER: <Heading className="w-3 h-3" />,
  VIDEO: <Play className="w-3 h-3" />,
  OBJECTIVES: <Target className="w-3 h-3" />,
  VOCAB_LIST: <BookOpen className="w-3 h-3" />,
  ACTIVITY: <Zap className="w-3 h-3" />,
  SORTING: <ArrowUpDown className="w-3 h-3" />,
  DATA_TABLE: <Table className="w-3 h-3" />,
  BAR_CHART: <BarChart3 className="w-3 h-3" />,
  RANKING: <GripVertical className="w-3 h-3" />,
  LINKED: <Link className="w-3 h-3" />,
  DRAWING: <Pencil className="w-3 h-3" />,
  MATH_RESPONSE: <Calculator className="w-3 h-3" />,
};

const BLOCK_TYPE_LABEL: Record<string, string> = {
  TEXT: 'Reading',
  MC: 'Question',
  SHORT_ANSWER: 'Response',
  CHECKLIST: 'Checklist',
  VOCABULARY: 'Vocabulary',
  SECTION_HEADER: 'Section',
  VIDEO: 'Video',
  OBJECTIVES: 'Objectives',
  VOCAB_LIST: 'Vocab List',
  ACTIVITY: 'Activity',
  SORTING: 'Sorting',
  DATA_TABLE: 'Data Table',
  BAR_CHART: 'Bar Chart',
  RANKING: 'Ranking',
  LINKED: 'Follow-up',
  DRAWING: 'Drawing',
  MATH_RESPONSE: 'Math Work',
};

const LessonProgressSidebar: React.FC<LessonProgressSidebarProps> = ({
  blocks,
  currentBlockIndex,
  completedBlocks,
  onNavigateToBlock,
  engagementTime = 0,
  xpEarned = 0,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const ringTrackColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)';

  const safeIndex = Math.max(0, Math.min(currentBlockIndex, blocks.length - 1));
  const interactiveBlocks = blocks.filter(b => ['MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED', 'DRAWING', 'MATH_RESPONSE'].includes(b.type));
  const completedInteractive = interactiveBlocks.filter(b => completedBlocks.has(b.id)).length;
  const totalInteractive = interactiveBlocks.length;
  const completionPercent = totalInteractive > 0
    ? Math.round((completedInteractive / totalInteractive) * 100)
    : blocks.length > 0
      ? (safeIndex >= blocks.length - 1 ? 100 : Math.round(((safeIndex + 1) / blocks.length) * 100))
      : 0;

  // Clamp to 0–100 to guard against NaN/Infinity from unexpected data
  const safePercent = Math.max(0, Math.min(100, isFinite(completionPercent) ? completionPercent : 0));

  // SVG progress ring dimensions
  const size = collapsed ? 36 : 64;
  const strokeWidth = collapsed ? 4 : 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safePercent / 100) * circumference;

  const minutes = Math.floor(engagementTime / 60);
  const seconds = engagementTime % 60;

  // Collapsed: minimal vertical strip
  if (collapsed) {
    return (
      <div className="w-12 flex-shrink-0 flex flex-col items-center gap-2 py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-text)] transition cursor-pointer"
          title="Expand sidebar"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {/* Mini progress ring */}
        <div className="relative">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={ringTrackColor} strokeWidth={strokeWidth} />
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke={safePercent === 100 ? '#34d399' : '#a855f7'}
              strokeWidth={strokeWidth} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-[11px] font-black ${safePercent === 100 ? 'text-emerald-400' : 'text-[var(--text-primary)]'}`}>
              {safePercent}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-[var(--text-muted)] font-mono">{minutes}:{String(seconds).padStart(2, '0')}</span>
        {/* Mini block dots — only visible types */}
        <div className="flex flex-col gap-0.5 items-center mt-1">
          {blocks.map((block, index) => {
            if (!VISIBLE_TYPES.has(block.type)) return null;
            const isCurrent = index === currentBlockIndex;
            const isComplete = completedBlocks.has(block.id);
            const isXP = XP_TYPES.has(block.type);
            return (
              <button
                key={block.id}
                onClick={() => onNavigateToBlock(index)}
                className={`rounded-full transition cursor-pointer ${
                  isXP ? 'w-2.5 h-2.5' : 'w-2 h-2'
                } ${
                  isCurrent ? 'bg-purple-400 ring-1 ring-purple-400/50' :
                  isComplete ? 'bg-emerald-400/80' :
                  isXP ? 'bg-amber-500/30 hover:bg-amber-500/50' : 'bg-[var(--surface-glass-heavy)] hover:bg-[var(--surface-glass-heavy)]'
                }`}
                title={`${BLOCK_TYPE_LABEL[block.type] || block.type}${isXP ? ' (XP)' : ''}`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // Expanded: compact right sidebar
  return (
    <div className="w-44 flex-shrink-0 flex flex-col gap-3 overflow-y-auto custom-scrollbar py-2 pr-1">
      {/* Header with collapse button */}
      <div className="flex items-center justify-between px-2">
        <span className="text-[11px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Progress</span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-text)] transition cursor-pointer"
          title="Collapse sidebar"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Progress ring + stats */}
      <div className="flex flex-col items-center gap-1.5 bg-[var(--panel-bg)] rounded-xl p-3 border border-[var(--border)]">
        <div className="relative">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={ringTrackColor} strokeWidth={strokeWidth} />
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke={safePercent === 100 ? '#34d399' : '#a855f7'}
              strokeWidth={strokeWidth} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-black ${safePercent === 100 ? 'text-emerald-400' : 'text-[var(--text-primary)]'}`}>
              {safePercent}%
            </span>
          </div>
        </div>
        <div className="text-[11px] text-[var(--text-muted)] font-bold">
          {completedInteractive}/{totalInteractive} complete
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono">
          <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {minutes}:{String(seconds).padStart(2, '0')}</span>
          {xpEarned > 0 && <span className="text-amber-400">+{xpEarned}</span>}
        </div>
      </div>

      {/* Block navigation — filtered to useful types */}
      <div className="bg-[var(--panel-bg)] rounded-xl p-2 border border-[var(--border)] flex flex-col gap-0.5">
        <div className="text-[11px] text-[var(--text-muted)] uppercase font-bold tracking-widest px-1.5 mb-0.5">Contents</div>
        {blocks.map((block, index) => {
          if (!VISIBLE_TYPES.has(block.type)) return null;
          const isCurrent = index === currentBlockIndex;
          const isComplete = completedBlocks.has(block.id);
          const isXP = XP_TYPES.has(block.type);
          const isSection = block.type === 'SECTION_HEADER';

          // Section headers render as group labels
          if (isSection) {
            return (
              <button
                key={block.id}
                onClick={() => onNavigateToBlock(index)}
                className={`flex items-center gap-1.5 px-1.5 py-1 mt-1 first:mt-0 text-left text-[11px] font-bold uppercase tracking-wider cursor-pointer transition ${
                  isCurrent ? 'text-purple-300' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <span className="truncate">{block.icon || ''} {block.title || 'Section'}</span>
              </button>
            );
          }

          return (
            <button
              key={block.id}
              onClick={() => onNavigateToBlock(index)}
              className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left transition-all text-[11px] cursor-pointer ${
                isCurrent
                  ? 'bg-purple-500/20 text-purple-300'
                  : isComplete
                  ? 'text-emerald-400/70 hover:bg-emerald-500/10'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-glass)]'
              }`}
            >
              <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                {isComplete ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <span className={isCurrent ? 'text-purple-400' : 'text-[var(--text-muted)]'}>
                    {BLOCK_TYPE_ICON[block.type] || <FileText className="w-3 h-3" />}
                  </span>
                )}
              </span>
              <span className="truncate flex-1 font-medium">
                {BLOCK_TYPE_LABEL[block.type] || block.type}
              </span>
              {isXP && !isComplete && (
                <Star className="w-2.5 h-2.5 text-amber-400/60 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LessonProgressSidebar;

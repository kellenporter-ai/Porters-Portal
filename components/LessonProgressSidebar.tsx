
import React from 'react';
import { LessonBlock } from '../types';
import {
  CheckCircle2, HelpCircle, MessageSquare, ListChecks, BookOpen, FileText, Info,
  Heading, Image, Play, Target, Minus, ExternalLink, Code, List, Zap,
  ArrowUpDown, Table, BarChart3, GripVertical, Link
} from 'lucide-react';

interface LessonProgressSidebarProps {
  blocks: LessonBlock[];
  currentBlockIndex: number;
  completedBlocks: Set<string>;
  onNavigateToBlock: (index: number) => void;
  engagementTime?: number;
  xpEarned?: number;
}

const BLOCK_TYPE_ICON: Record<string, React.ReactNode> = {
  TEXT: <FileText className="w-3.5 h-3.5" />,
  MC: <HelpCircle className="w-3.5 h-3.5" />,
  SHORT_ANSWER: <MessageSquare className="w-3.5 h-3.5" />,
  CHECKLIST: <ListChecks className="w-3.5 h-3.5" />,
  VOCABULARY: <BookOpen className="w-3.5 h-3.5" />,
  INFO_BOX: <Info className="w-3.5 h-3.5" />,
  SECTION_HEADER: <Heading className="w-3.5 h-3.5" />,
  IMAGE: <Image className="w-3.5 h-3.5" />,
  VIDEO: <Play className="w-3.5 h-3.5" />,
  OBJECTIVES: <Target className="w-3.5 h-3.5" />,
  DIVIDER: <Minus className="w-3.5 h-3.5" />,
  EXTERNAL_LINK: <ExternalLink className="w-3.5 h-3.5" />,
  EMBED: <Code className="w-3.5 h-3.5" />,
  VOCAB_LIST: <List className="w-3.5 h-3.5" />,
  ACTIVITY: <Zap className="w-3.5 h-3.5" />,
  SORTING: <ArrowUpDown className="w-3.5 h-3.5" />,
  DATA_TABLE: <Table className="w-3.5 h-3.5" />,
  BAR_CHART: <BarChart3 className="w-3.5 h-3.5" />,
  RANKING: <GripVertical className="w-3.5 h-3.5" />,
  LINKED: <Link className="w-3.5 h-3.5" />,
};

const BLOCK_TYPE_LABEL: Record<string, string> = {
  TEXT: 'Reading',
  MC: 'Question',
  SHORT_ANSWER: 'Response',
  CHECKLIST: 'Checklist',
  VOCABULARY: 'Vocabulary',
  INFO_BOX: 'Info',
  SECTION_HEADER: 'Section',
  IMAGE: 'Image',
  VIDEO: 'Video',
  OBJECTIVES: 'Objectives',
  DIVIDER: 'Divider',
  EXTERNAL_LINK: 'Link',
  EMBED: 'Embed',
  VOCAB_LIST: 'Vocab List',
  ACTIVITY: 'Activity',
  SORTING: 'Sorting',
  DATA_TABLE: 'Data Table',
  BAR_CHART: 'Bar Chart',
  RANKING: 'Ranking',
  LINKED: 'Follow-up',
};

const LessonProgressSidebar: React.FC<LessonProgressSidebarProps> = ({
  blocks,
  currentBlockIndex,
  completedBlocks,
  onNavigateToBlock,
  engagementTime = 0,
  xpEarned = 0,
}) => {
  const interactiveBlocks = blocks.filter(b => ['MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED'].includes(b.type));
  const completedInteractive = interactiveBlocks.filter(b => completedBlocks.has(b.id)).length;
  const totalInteractive = interactiveBlocks.length;
  const completionPercent = totalInteractive > 0
    ? Math.round((completedInteractive / totalInteractive) * 100)
    : (currentBlockIndex >= blocks.length - 1 ? 100 : Math.round(((currentBlockIndex + 1) / blocks.length) * 100));

  // SVG progress ring dimensions
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionPercent / 100) * circumference;

  const minutes = Math.floor(engagementTime / 60);
  const seconds = engagementTime % 60;

  return (
    <div className="w-56 flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
      {/* Progress Ring */}
      <div className="flex flex-col items-center gap-2 bg-black/30 rounded-2xl p-4 border border-white/5">
        <div className="relative">
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={strokeWidth}
            />
            {/* Progress arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={completionPercent === 100 ? '#34d399' : '#a855f7'}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xl font-black ${completionPercent === 100 ? 'text-emerald-400' : 'text-white'}`}>
              {completionPercent}%
            </span>
          </div>
        </div>
        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
          {completedInteractive}/{totalInteractive} questions
        </div>

        {/* Mini stats */}
        <div className="flex gap-3 text-[10px] text-gray-500 font-mono">
          <span>{minutes}:{String(seconds).padStart(2, '0')}</span>
          {xpEarned > 0 && <span className="text-amber-400">+{xpEarned} XP</span>}
        </div>
      </div>

      {/* Block navigation */}
      <div className="bg-black/30 rounded-2xl p-3 border border-white/5 flex flex-col gap-1">
        <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest px-2 mb-1">Sections</div>
        {blocks.map((block, index) => {
          const isCurrent = index === currentBlockIndex;
          const isComplete = completedBlocks.has(block.id);
          const isInteractive = ['MC', 'SHORT_ANSWER', 'CHECKLIST', 'SORTING', 'RANKING', 'LINKED'].includes(block.type);

          return (
            <button
              key={block.id}
              onClick={() => onNavigateToBlock(index)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all text-[11px] ${
                isCurrent
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : isComplete
                  ? 'text-emerald-400/80 hover:bg-emerald-500/10'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className="shrink-0 w-4 h-4 flex items-center justify-center">
                {isComplete ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <span className={isCurrent ? 'text-purple-400' : 'text-gray-600'}>
                    {BLOCK_TYPE_ICON[block.type] || <FileText className="w-3.5 h-3.5" />}
                  </span>
                )}
              </span>
              <span className="truncate flex-1 font-medium">
                {BLOCK_TYPE_LABEL[block.type] || block.type}
                {isInteractive && !isComplete && (
                  <span className="ml-1 text-[9px] text-amber-400/60">*</span>
                )}
              </span>
              <span className={`text-[9px] font-mono ${isCurrent ? 'text-purple-400' : 'text-gray-600'}`}>
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LessonProgressSidebar;

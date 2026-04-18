import React from 'react';
import { CheckCircle, Undo2, Clock, Sparkles, Eye, Circle, Bot, AlertTriangle, Loader2 } from 'lucide-react';

export type GradingStatus =
  | 'graded'
  | 'returned'
  | 'needs_grading'
  | 'ai_suggested'
  | 'draft'
  | 'not_started'
  | 'ai_flagged'
  | 'flagged'
  | 'in_progress';

interface StatusBadgeProps {
  status: GradingStatus;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<GradingStatus, { label: string; className: string; icon: React.ReactNode }> = {
  graded: {
    label: 'GRADED',
    className: 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30',
    icon: <CheckCircle className="w-3 h-3" aria-hidden="true" />,
  },
  returned: {
    label: 'RETURNED',
    className: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30',
    icon: <Undo2 className="w-3 h-3" aria-hidden="true" />,
  },
  needs_grading: {
    label: 'NEEDS GRADING',
    className: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30',
    icon: <Clock className="w-3 h-3" aria-hidden="true" />,
  },
  ai_suggested: {
    label: 'AI SUGGESTED',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30',
    icon: <Sparkles className="w-3 h-3" aria-hidden="true" />,
  },
  draft: {
    label: 'DRAFT',
    className: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30',
    icon: <Eye className="w-3 h-3" aria-hidden="true" />,
  },
  not_started: {
    label: 'NOT STARTED',
    className: 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30',
    icon: <Circle className="w-3 h-3" aria-hidden="true" />,
  },
  ai_flagged: {
    label: 'AI FLAGGED',
    className: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30',
    icon: <Bot className="w-3 h-3" aria-hidden="true" />,
  },
  flagged: {
    label: 'FLAGGED',
    className: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30',
    icon: <AlertTriangle className="w-3 h-3" aria-hidden="true" />,
  },
  in_progress: {
    label: 'IN PROGRESS',
    className: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30',
    icon: <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />,
  },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const config = STATUS_CONFIG[status];
  const sizeClass = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11.5px]';
  return (
    <span className={`${sizeClass} rounded-full font-bold flex items-center gap-1 w-fit ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

export default StatusBadge;

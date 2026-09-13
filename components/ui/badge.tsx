import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Badge — shadcn-idiom primitive (copy-in, no Radix dep).
 * Status/tone communicated via `tone` variant + text label — never color alone.
 * Light-mode dual-class pattern applied per porters-portal-light-mode-patterns:
 *   text-COLOR-600 dark:text-COLOR-400, tinted bg at /10 opacity.
 */

export type BadgeTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral';

const toneClasses: Record<BadgeTone, string> = {
  accent:
    'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25',
  success:
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
  warning:
    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
  error:
    'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25',
  info:
    'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
  neutral:
    'bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--border)]',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ref, ...props }: BadgeProps & { ref?: React.Ref<HTMLSpanElement> }) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
        'text-[11.5px] font-bold uppercase tracking-widest',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

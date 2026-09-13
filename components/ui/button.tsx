import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Button — shadcn-idiom primitive (copy-in, no Radix dep).
 * Variant API via `variant` + `size`; extra classes merge via `cn()`.
 * Theme-aware: uses the existing `--accent*` / `--surface*` CSS variables,
 * so both dark-first and light dual-class themes apply automatically.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--text-inverted)] hover:bg-[var(--accent-hover)] border border-transparent',
  secondary:
    'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--accent-muted)] hover:text-[var(--text-primary)]',
  outline:
    'bg-transparent text-[var(--accent-text)] border border-[var(--border-accent)] hover:bg-[var(--accent-muted)]',
  destructive:
    'bg-[var(--error)] text-white border border-transparent hover:opacity-90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)]',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

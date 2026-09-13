import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Card — shadcn-idiom composable primitive (copy-in, no Radix dep).
 * Use CardHeader / CardContent / CardFooter as semantic subcomponents.
 * Theme-aware via existing `--surface*` / `--border*` CSS variables.
 */

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ref, ...props }: CardProps & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] text-[var(--text-primary)]',
        className,
      )}
      {...props}
    />
  );
}

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export function CardHeader({ className, ref, ...props }: CardHeaderProps & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

export function CardTitle({ className, ref, ...props }: CardTitleProps & { ref?: React.Ref<HTMLHeadingElement> }) {
  // Heading level defaults to h3 — the caller's page-level h1/h2 supplies context.
  return (
    <h3
      ref={ref}
      className={cn('text-lg font-bold leading-tight text-[var(--text-primary)]', className)}
      {...props}
    />
  );
}

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export function CardDescription({
  className,
  ref,
  ...props
}: CardDescriptionProps & { ref?: React.Ref<HTMLParagraphElement> }) {
  return <p ref={ref} className={cn('text-sm text-[var(--text-secondary)]', className)} {...props} />;
}

export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export function CardContent({ className, ref, ...props }: CardContentProps & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
}

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

export function CardFooter({ className, ref, ...props }: CardFooterProps & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn('flex items-center gap-3 p-6 pt-0', className)} {...props} />;
}

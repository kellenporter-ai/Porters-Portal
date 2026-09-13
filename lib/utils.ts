/**
 * Minimal class-merge helper (shadcn-style `cn()`).
 *
 * Hand-rolled per ADR 2026-09-12-shadcn-portal-ui-convention — no new
 * runtime dependencies. Intentionally simple: flattens nested arrays,
 * filters falsy values, joins with a single space. Unlike clsx +
 * tailwind-merge it does NOT dedupe conflicting Tailwind utilities —
 * callers are responsible for not passing conflicting classes.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

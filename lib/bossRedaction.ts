/**
 * Boss event redaction helpers (Increment 1, Piece 2).
 *
 * Defense in depth: `boss_events` documents ship `questions[].correctAnswer` and
 * `questions[].explanation` to every authenticated student via
 * `dataService.subscribeToBossEvents`. Piece 5 must run every event doc through
 * `stripBossEventForClient` before it reaches component state. This file is the
 * client-importable copy of the server-side helper in functions/src/bosses.ts
 * (Cloud Functions modules cannot be imported by the client).
 *
 * Pure functions only — no imports, no side effects.
 */

export interface BossQuestion {
  id: string;
  stem: string;
  options: string[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  topicId?: string;
  damageBonus?: number;
  correctAnswer?: unknown;
  explanation?: string;
  [key: string]: unknown;
}

/** Strip exactly `correctAnswer` and `explanation` from a question; preserve the rest. */
export function toStudentQuestion<T extends Record<string, unknown>>(q: T | undefined | null): Record<string, unknown> | null {
  if (!q || typeof q !== 'object') return null;
  const { correctAnswer: _ca, explanation: _ex, ...rest } = q;
  return rest;
}

/**
 * Return the event minus `questions[].correctAnswer` and `questions[].explanation`.
 * All other fields are preserved byte-identical (shallow copy of the event,
 * new array + new question objects only for `questions`).
 */
export function stripBossEventForClient<T extends Record<string, unknown>>(event: T | undefined | null): Record<string, unknown> | null {
  if (!event || typeof event !== 'object') return null;
  const out: Record<string, unknown> = { ...event };
  if (Array.isArray(out.questions)) {
    out.questions = (out.questions as Record<string, unknown>[]).map((q) => {
      if (!q || typeof q !== 'object') return q;
      const { correctAnswer: _ca, explanation: _ex, ...rest } = q;
      return rest;
    });
  }
  return out;
}

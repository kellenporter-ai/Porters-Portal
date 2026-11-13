/**
 * Boss results derivation — the single read path for async boss progress.
 *
 * Boss fights are async per-student encounters. `functions/src/bosses.ts` writes
 * `boss_event_progress/{uid}_{eventId}` with exactly these fields:
 *
 *   userId, eventId, bossMaxHp, bossHp, answeredCount, correctCount,
 *   victoryClaimed, knockoutCount, answeredQuestionIds,
 *   activeAttempt (non-null while a fight is open), lastCompletedAttempt,
 *   lastAnsweredAt (ISO, most recent answer), attemptCount (completed attempts)
 *
 * `lastAnsweredAt` and `attemptCount` were added after the async engine shipped,
 * so documents written before then carry neither. Absent `lastAnsweredAt` means
 * UNKNOWN activity — never read it as "idle" and never substitute a derived
 * timestamp (e.g. from `answeredCount`) for it.
 *
 * Anything else on that document is a DEAD field left over from the pre-async
 * engine and must never be read: `totalDamageDealt`, `combatStats`,
 * `participated`, `attempts[]`, `currentHp`, `maxHp`, `bestAttemptNumber`,
 * `rewardClaimed`. Rendering those produced the "0 damage / not participated"
 * bug this module exists to fix. Every value below is either read from a live
 * field or DERIVED here.
 *
 * Pure module: no React, no Firebase, no imports, no side effects. Everything
 * is a pure function of its arguments so the UI can call it during render
 * without memoisation hazards.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Difficulty the "par" baseline is measured at. MEDIUM is the reference 1.0. */
export const BOSS_PAR_DIFFICULTY = 'MEDIUM';

/** Engine constants mirrored from functions/src/boss-combat.ts. */
export const BOSS_PPI_BASE_HP = 1400;
export const BOSS_PPI_EXPONENT = 0.8;
export const BOSS_PAR_DIFFICULTY_MOD = 1.0; // MEDIUM
/**
 * Average streak multiplier over a kill sequence.
 *
 * Validated: with this value the par formula reproduces the 2000-trial Monte
 * Carlo ground truth for every reference bossMaxHp within 1 (see
 * `lib/__tests__/boss-results.test.ts`). The full ±1-correct band for all four
 * reference points simultaneously is [1.08, 1.26]; 1.18 sits mid-band. It is
 * also the observed average streak multiplier across a typical kill sequence
 * and stays under the engine's hard streak cap of 1.25.
 */
export const BOSS_PAR_STREAK_AVG = 1.18;

/**
 * The engine's per-hit ceiling as a fraction of bossMaxHp
 * (functions/src/boss-combat.ts, HIT_CEILING_FRACTION). Mirrored so par and
 * the engine cannot silently disagree if one side is edited.
 */
export const BOSS_PAR_HIT_CEILING_FRACTION = 0.45;

/** Below this many victors: hide "N won so far". */
export const BOSS_COMPARISON_MIN_VICTORS_COUNT = 5;
/** Median over-par comparison needs at least this many victors. */
export const BOSS_COMPARISON_MIN_VICTORS_MEDIAN = 5;
/** Band phrasing ("you were ahead/behind the typical victor") needs this many. */
export const BOSS_COMPARISON_MIN_VICTORS_BAND = 10;
/** Victor/fighter totals are suppressed below this many fighters. */
export const BOSS_COMPARISON_MIN_FIGHTERS = 5;

// ─── Result types ────────────────────────────────────────────────────────────

export interface BossResult {
  userId: string;
  eventId: string;
  /** true when the progress doc predates the async engine (no numeric bossMaxHp). */
  isLegacy: boolean;
  bossMaxHp: number | null;
  bossHp: number | null;
  /** Damage dealt = bossMaxHp - bossHp, clamped >= 0. null when legacy. */
  damage: number | null;
  /** damage / bossMaxHp, 0..1. null when legacy or bossMaxHp === 0. */
  pctDefeated: number | null;
  answeredCount: number;
  correctCount: number;
  /** correctCount / answeredCount as 0..1, null when answeredCount === 0. */
  accuracy: number | null;
  victory: boolean;
  knockoutCount: number;
  /** A fight is open right now (activeAttempt present). */
  inProgress: boolean;
  /**
   * ISO timestamp of the most recent answer, or null when the document does not
   * carry one (every document written before the field existed) or the stored
   * value is unparseable. null means UNKNOWN activity, never "idle": consumers
   * must render an em dash and must NOT infer a stall from it.
   */
  lastAnsweredAt: string | null;
  /** Completed 5-question attempts. 0 when absent. */
  attemptCount: number;
  /** Derived, never read from a stored field. */
  participationMet: boolean;
}

export interface BossParResult {
  /** Expected CORRECT answers to kill this student's boss. null when legacy. */
  par: number | null;
  /** Answers submitted to the boss (all attempts). */
  strokes: number;
  /** strokes - par, rounded. Positive = took more swings than par. null when legacy. */
  overPar: number | null;
}

export type BossBand = 'ahead' | 'typical' | 'behind';

// ─── Coercion helpers ────────────────────────────────────────────────────────

/**
 * Non-finite, NaN, or negative input collapses to 0. Deliberately does NOT
 * floor — damage/HP values are already integers from the engine, but rounding
 * here would hide a bug rather than mask it.
 */
function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** safeNumber + floor, for count fields. */
function safeCount(value: unknown): number {
  return Math.floor(safeNumber(value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

// ─── Result derivation ───────────────────────────────────────────────────────

/**
 * Derive every display value a boss result surface needs in one call.
 *
 * Returns `null` only when there is nothing to describe (no `progress`, or a
 * document with no `userId`). A legacy document still returns a full result
 * with `isLegacy: true` — consumers must render an em dash (—) for
 * `damage`/`pctDefeated`, NEVER `0`.
 */
export function deriveBossResult(
  progress: Record<string, unknown> | null | undefined,
  minAttempts: number,
  minCorrect: number,
): BossResult | null {
  if (!progress || typeof progress !== 'object') return null;

  const userId = typeof progress.userId === 'string' ? progress.userId : '';
  if (!userId) return null;

  const eventId = typeof progress.eventId === 'string' ? progress.eventId : '';

  // A doc created before the async engine has no numeric bossMaxHp snapshot.
  // typeof null / string / undefined all fail this check on purpose.
  const isLegacy = typeof progress.bossMaxHp !== 'number' || !Number.isFinite(progress.bossMaxHp as number);

  const bossMaxHp = isLegacy ? null : Math.max(0, progress.bossMaxHp as number);
  // bossHp is clamped at 0 by the engine; a malformed/missing value reads as 0.
  const bossHp = isLegacy ? null : safeNumber(progress.bossHp);

  let damage: number | null = null;
  let pctDefeated: number | null = null;
  if (!isLegacy && bossMaxHp !== null) {
    damage = bossHp === null ? 0 : Math.max(0, bossMaxHp - bossHp);
    pctDefeated = bossMaxHp > 0 ? clamp01(damage / bossMaxHp) : null;
  }

  const answeredCount = safeCount(progress.answeredCount);
  const correctCount = safeCount(progress.correctCount);
  const accuracy = answeredCount > 0 ? clamp01(correctCount / answeredCount) : null;

  const victory = progress.victoryClaimed === true;
  const knockoutCount = safeCount(progress.knockoutCount);
  const inProgress = Boolean(progress.activeAttempt);

  // Activity timestamp. Anything that is not a parseable ISO string is treated
  // as "unknown" (null) rather than guessed from the counters — a doc with a
  // corrupt timestamp must not read as a fresh or a stale one.
  const rawLastAnsweredAt = progress.lastAnsweredAt;
  const lastAnsweredAt =
    typeof rawLastAnsweredAt === 'string' &&
    rawLastAnsweredAt.length > 0 &&
    !Number.isNaN(Date.parse(rawLastAnsweredAt))
      ? rawLastAnsweredAt
      : null;

  const attemptCount = safeCount(progress.attemptCount);

  // Never read a stored `participationMet` — the pre-async engine wrote one and
  // it disagrees with the async counters. Always derive from the live fields.
  const participationMet = answeredCount >= minAttempts && correctCount >= minCorrect;

  return {
    userId,
    eventId,
    isLegacy,
    bossMaxHp,
    bossHp,
    damage,
    pctDefeated,
    answeredCount,
    correctCount,
    accuracy,
    victory,
    knockoutCount,
    inProgress,
    lastAnsweredAt,
    attemptCount,
    participationMet,
  };
}

// ─── Par / strokes / over-par ────────────────────────────────────────────────

/**
 * "How many correct answers SHOULD this build have needed?"
 *
 * Gear-neutral by construction: `bossMaxHp` is already PPI-scaled per student
 * (`round(1400 * PPI^0.8)`), and par is computed by inverting that same spawn
 * to recover the student's own PPI. Two students with different gear therefore
 * get different pars, and over-par compares each of them against their own
 * fight rather than against a fixed target. A student cannot lower par by
 * equipping more gear — higher gear raises bossMaxHp AND per-hit damage in
 * lockstep.
 *
 * Engine model (functions/src/boss-combat.ts, computeCorrectHit):
 *   hit      = 100 * PPI * DIFFICULTY_MOD * (0.95..1.05) * streakMultiplier
 *   ceiling  = floor(0.45 * bossMaxHp)      ← hard cap per hit
 *
 * So the average hit is `100 * PPI * MOD * streakAvg`, and the answers needed
 * is `bossMaxHp / min(avgHit, ceiling)`. `ceil` because a partial answer is
 * still an answer.
 *
 * Reference points from a 2000-trial Monte Carlo of the real formula
 * (1400→12.64, 2120→11.39, 3007→10.98, 4910→9.95 mean correct-to-kill) are
 * reproduced within 1 by every BOSS_PAR_STREAK_AVG in [1.08, 1.26]. 1.18 sits
 * mid-band, which is why it is the shipped value.
 */
function computeParFromMaxHp(bossMaxHp: number): number | null {
  if (!Number.isFinite(bossMaxHp) || bossMaxHp <= 0) return null;

  const ppi = Math.pow(bossMaxHp / BOSS_PPI_BASE_HP, 1 / BOSS_PPI_EXPONENT);
  const avgHit = 100 * ppi * BOSS_PAR_DIFFICULTY_MOD * BOSS_PAR_STREAK_AVG;
  const hitCeiling = bossMaxHp * BOSS_PAR_HIT_CEILING_FRACTION;
  const effectiveHit = Math.min(avgHit, hitCeiling);

  if (!Number.isFinite(effectiveHit) || effectiveHit <= 0) return null;
  return Math.max(1, Math.ceil(bossMaxHp / effectiveHit));
}

/**
 * Par / strokes / over-par for one student's boss instance.
 *
 * `strokes` is every answer submitted to the boss across all attempts
 * (`answeredCount`), so over-par counts misses too — that is the point: it
 * measures swings taken, not just good swings.
 */
export function computeBossPar(
  bossMaxHp: number | null,
  answeredCount: number,
  correctCount: number,
): BossParResult {
  const strokes = safeCount(answeredCount);
  void correctCount; // accepted for symmetry / future accuracy-weighted variants

  const par =
    bossMaxHp === null || typeof bossMaxHp !== 'number' || !Number.isFinite(bossMaxHp) || bossMaxHp <= 0
      ? null
      : computeParFromMaxHp(bossMaxHp);

  const overPar = par === null ? null : Math.round(strokes - par);

  return { par, strokes, overPar };
}

// ─── Comparison suppression ──────────────────────────────────────────────────

/** Median of a numeric list. Returns null for an empty list. */
export function median(nums: number[]): number | null {
  if (!Array.isArray(nums)) return null;
  const finite = nums.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Band a victor's over-par against the median over-par of other victors.
 *
 * Ties resolve to the KINDER band on purpose. A student within half a swing of
 * the median is indistinguishable from typical performance, and telling a
 * student who effectively matched the median that they were "behind" is a
 * demotivating false signal. Inside the ±0.5 dead band everything reads
 * 'typical'; only a clear gap gets 'ahead' or 'behind'.
 *
 * Returns null below BOSS_COMPARISON_MIN_VICTORS_BAND victors — with a handful
 * of comparators the median is not a meaningful benchmark.
 */
export function classifyVictorBand(
  overPar: number,
  medianOverPar: number,
  victorCount: number,
): BossBand | null {
  if (!Number.isFinite(victorCount) || victorCount < BOSS_COMPARISON_MIN_VICTORS_BAND) return null;
  if (!Number.isFinite(overPar) || !Number.isFinite(medianOverPar)) return 'typical';

  if (overPar < medianOverPar - 0.5) return 'ahead';
  if (overPar > medianOverPar + 0.5) return 'behind';
  return 'typical';
}

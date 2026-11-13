import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { verifyAdmin } from "./core";


/**
 * Per-question answer analytics for one boss event — the teacher "Results"
 * screen's data source.
 *
 * There is no shared HP pool in the async boss model, so the only meaningful
 * cross-student aggregate is per-question performance (which questions the
 * class is missing). The roster itself comes from the client's live
 * `boss_event_progress` listener; this function deliberately returns ZERO
 * student-level data so the payload stays small and the function cannot be
 * repurposed to enumerate students.
 *
 * The 20,000-answer cap is explicit rather than silent: when a scan is cut
 * short the response carries `truncated: true` and the client shows a banner.
 *
 * CONSTANTS AND DERIVATION ARE DUPLICATED FROM lib/ — Cloud Functions set
 * `rootDir: "src"` and cannot import from `../../lib`. Anything here that
 * mirrors client logic must be kept in sync manually.
 */

/** Hard cap on answers scanned per call. Above this the response is truncated. */
const MAX_ANSWER_SCAN = 20_000;

/** Firestore page size for the paginated scan. */
const PAGE_SIZE = 500;

interface PerQuestionAggregate {
  questionId: string;
  /** Non-revision answers for this question. */
  answers: number;
  correct: number;
  /** correct / answers, 0..1. null when answers === 0. */
  accuracy: number | null;
  /** Revision retries recorded for this question (excluded from `answers`). */
  revisions: number;
  /** Of those revisions, how many eventually answered correctly. */
  correctAfterRevision: number;
}

export const getBossEventStats = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  await verifyAdmin(request.auth);

  const { eventId } = request.data ?? {};
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new HttpsError("invalid-argument", "Missing or invalid eventId");
  }

  const db = admin.firestore();

  const eventSnap = await db.doc(`boss_events/${eventId}`).get();
  if (!eventSnap.exists) {
    throw new HttpsError("not-found", "Boss event not found");
  }

  const aggregates = new Map<string, PerQuestionAggregate>();
  let scanned = 0;
  let truncated = false;

  // Paginate with orderBy(answeredAt) + startAfter so the scan is stable and
  // resumable. A single unbounded `.get()` would be capped by Firestore at the
  // first page and silently under-report every question past it.
  const answersRef = db.collection("boss_event_answers").where("eventId", "==", eventId);
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;

  while (scanned < MAX_ANSWER_SCAN) {
    const pageLimit = Math.min(PAGE_SIZE, MAX_ANSWER_SCAN - scanned);
    let pageQuery = answersRef.orderBy("answeredAt").limit(pageLimit);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);

    const page = await pageQuery.get();
    if (page.empty) break;

    for (const doc of page.docs) {
      const data = doc.data() as Record<string, unknown>;
      const questionId = typeof data.questionId === "string" ? data.questionId : "";
      if (!questionId) continue;

      let agg = aggregates.get(questionId);
      if (!agg) {
        agg = { questionId, answers: 0, correct: 0, accuracy: null, revisions: 0, correctAfterRevision: 0 };
        aggregates.set(questionId, agg);
      }

      // A revision's `correct` is the retry outcome. It is counted separately
      // and excluded from headline accuracy: counting the retry as a second
      // first-attempt would double-weight that student on that question.
      if (data.isRevision === true) {
        agg.revisions += 1;
        if (data.correct === true) agg.correctAfterRevision += 1;
      } else {
        agg.answers += 1;
        if (data.correct === true) agg.correct += 1;
      }
    }

    scanned += page.docs.length;
    cursor = page.docs[page.docs.length - 1];
    if (page.docs.length < pageLimit) break;
  }

  // Only flag truncation if there is provably more to read: a scan that
  // stopped exactly at the cap with an empty next page is complete.
  if (scanned >= MAX_ANSWER_SCAN) {
    const probe = await answersRef.orderBy("answeredAt").startAfter(cursor!).limit(1).get();
    truncated = !probe.empty;
  }

  const perQuestion: PerQuestionAggregate[] = [...aggregates.values()]
    .map(agg => ({
      ...agg,
      accuracy: agg.answers > 0 ? agg.correct / agg.answers : null,
    }))
    .sort((a, b) => a.questionId.localeCompare(b.questionId));

  return {
    eventId,
    truncated,
    totalAnswers: perQuestion.reduce((sum, q) => sum + q.answers, 0),
    perQuestion,
    answeredQuestionIds: perQuestion.map(q => q.questionId).sort(),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Student-facing class comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELIBERATE DUPLICATION of the par formula in `lib/bossResults.ts`.
 *
 * `lib/bossResults.ts` is the SOURCE OF TRUTH for this maths. It cannot be
 * imported here: Cloud Functions build with `rootDir: "src"` and have no path
 * to `../../lib`. If you change the formula on one side, change it on the other
 * or the student's "over par" will disagree with the class median it is being
 * compared against.
 *
 * Mirrored from lib/bossResults.ts:
 *   BOSS_PAR_STREAK_AVG            1.18
 *   BOSS_PPI_BASE_HP               1400
 *   BOSS_PPI_EXPONENT              0.8
 *   BOSS_PAR_HIT_CEILING_FRACTION  0.45
 *   par = ceil(bossMaxHp / min(avgHit, 0.45 * bossMaxHp))
 */
const PAR_STREAK_AVG = 1.18;
const PAR_PPI_BASE_HP = 1400;
const PAR_PPI_EXPONENT = 0.8;
const PAR_HIT_CEILING_FRACTION = 0.45;

/** Below this many victors the median over-par is suppressed server-side. */
const MIN_VICTORS_MEDIAN = 5;
/** Below this many victors the p25/p75 band is suppressed server-side. */
const MIN_VICTORS_BAND = 10;
/** Hard cap on progress docs read per call. */
const MAX_PROGRESS_SCAN = 500;

/**
 * Par for one boss instance. Returns null when the doc predates the async
 * engine (no numeric `bossMaxHp`). Mirrors `computeBossPar` in lib/bossResults.ts.
 */
function parForMaxHp(bossMaxHp: unknown): number | null {
  if (typeof bossMaxHp !== "number" || !Number.isFinite(bossMaxHp) || bossMaxHp <= 0) return null;
  const ppi = Math.pow(bossMaxHp / PAR_PPI_BASE_HP, 1 / PAR_PPI_EXPONENT);
  const avgHit = 100 * ppi * PAR_STREAK_AVG;
  const effectiveHit = Math.min(avgHit, bossMaxHp * PAR_HIT_CEILING_FRACTION);
  if (!Number.isFinite(effectiveHit) || effectiveHit <= 0) return null;
  return Math.max(1, Math.ceil(bossMaxHp / effectiveHit));
}

/** Median of a numeric list. null for an empty list. Mirrors lib/bossResults.ts. */
function medianOf(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Percentile of a sorted-or-unsorted numeric list using linear interpolation
 * between closest ranks (the R-7 / Excel PERCENTILE.INC definition). Chosen
 * because it is what a teacher would compute in a spreadsheet.
 */
function percentileOf(nums: number[], p: number): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

/** AGGREGATES ONLY. There is deliberately no per-student field on this shape. */
export interface BossClassSummary {
  eventId: string;
  /** true when now > deadline. */
  closed: boolean;
  /** Students who answered at least one question. */
  fighters: number;
  /** Students who killed the boss. */
  victors: number;
  /** Median victor over-par, or null when victors < MIN_VICTORS_MEDIAN. */
  medianVictorOverPar: number | null;
  /** Victor over-par p25/p75, or null when victors < MIN_VICTORS_BAND. */
  victorOverParBand: { p25: number; p75: number } | null;
}

/**
 * Pure aggregation over already-read progress documents.
 *
 * Exported and free of Firestore/admin imports so it can be unit-tested
 * directly (functions/__tests__/boss-class-summary.test.mjs) without an
 * emulator.
 *
 * PRIVACY INVARIANT: this function reads `userId` only to decide whether a doc
 * is a fight record at all; nothing identifying is ever copied into the return
 * value. A test walks the returned object to prove no uid/name key survives.
 *
 * Suppression happens HERE, not in the client. A compromised or modified client
 * must not be able to learn the median of a two-student class.
 */
export function buildBossClassSummary(
  progressDocs: Array<Record<string, unknown>>,
  deadlineIso: string | null | undefined,
  nowMs: number,
  eventId = "",
): BossClassSummary {
  const deadlineMs = deadlineIso ? Date.parse(deadlineIso) : Number.NaN;
  const closed = !Number.isNaN(deadlineMs) && nowMs > deadlineMs;

  let fighters = 0;
  let victors = 0;
  const victorOverPar: number[] = [];

  for (const doc of progressDocs) {
    if (!doc || typeof doc !== "object") continue;

    const answeredCount =
      typeof doc.answeredCount === "number" && Number.isFinite(doc.answeredCount)
        ? Math.floor(doc.answeredCount)
        : 0;
    if (answeredCount <= 0) continue;
    fighters += 1;

    if (doc.victoryClaimed !== true) continue;
    victors += 1;

    const par = parForMaxHp(doc.bossMaxHp);
    if (par === null) continue; // legacy doc: no comparable par
    victorOverPar.push(Math.round(answeredCount - par));
  }

  const medianVictorOverPar =
    victors >= MIN_VICTORS_MEDIAN && victorOverPar.length > 0
      ? medianOf(victorOverPar)
      : null;

  const victorOverParBand =
    victors >= MIN_VICTORS_BAND && victorOverPar.length > 0
      ? { p25: percentileOf(victorOverPar, 0.25) as number, p75: percentileOf(victorOverPar, 0.75) as number }
      : null;

  return {
    eventId,
    closed,
    fighters,
    victors,
    medianVictorOverPar,
    victorOverParBand,
  };
}

/**
 * Class-wide boss aggregates for a STUDENT, used by the endgame comparison card.
 *
 * Not admin-gated (students must call it), so the gate is membership:
 *   1. authenticated
 *   2. holds a progress doc for this event, OR is in the event's targetSections
 *
 * Returns aggregates only — never a per-student row, name, uid or uid fragment.
 * All suppression thresholds are applied server-side, so a student below every
 * threshold receives fields they could not have derived anyway.
 */
export const getBossClassSummary = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be logged in.");

  const { eventId } = request.data ?? {};
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new HttpsError("invalid-argument", "Missing or invalid eventId");
  }

  const db = admin.firestore();

  const eventSnap = await db.doc(`boss_events/${eventId}`).get();
  if (!eventSnap.exists) throw new HttpsError("not-found", "Boss event not found.");
  const event = eventSnap.data() as Record<string, unknown>;

  // Membership: either this student has fought the event, or the event targets
  // one of their sections. Read the user doc only when the progress doc is
  // missing, so the common path is a single read.
  const ownProgressSnap = await db.doc(`boss_event_progress/${uid}_${eventId}`).get();
  if (!ownProgressSnap.exists) {
    const targetSections = Array.isArray(event.targetSections)
      ? (event.targetSections as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    let admitted = false;
    if (targetSections.length > 0) {
      const userSnap = await db.doc(`users/${uid}`).get();
      const user = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
      // `classSections` is the live field; `section` is the older single-value
      // shape. Both are checked so a student admitted by either is admitted
      // here — mirrors the client's section gate in StudentDashboard.tsx.
      const classSections =
        user.classSections && typeof user.classSections === "object"
          ? (user.classSections as Record<string, unknown>)
          : {};
      const eventClass = typeof event.classType === "string" ? event.classType : "";
      const activeClass = eventClass || (typeof user.classType === "string" ? user.classType : "");
      const candidates = [
        typeof classSections[activeClass] === "string" ? (classSections[activeClass] as string) : "",
        typeof user.section === "string" ? user.section : "",
      ];
      admitted = candidates.some(s => s !== "" && targetSections.includes(s));
    }
    if (!admitted) {
      throw new HttpsError("permission-denied", "Not enrolled in this boss event.");
    }
  }

  const snapshot = await db
    .collection("boss_event_progress")
    .where("eventId", "==", eventId)
    .limit(MAX_PROGRESS_SCAN)
    .get();

  const docs = snapshot.docs.map(d => d.data() as Record<string, unknown>);

  return buildBossClassSummary(docs, event.deadline as string | undefined, Date.now(), eventId);
});

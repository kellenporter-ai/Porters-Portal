import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  verifyAuth,
  calculateServerStats,
  deriveCombatStats,
  calculateServerGearScore,
  buildXPUpdates,
  generateCorrelationId,
  logWithCorrelation,
} from "./core";
import { checkAndUnlockAchievements, writeAchievementNotifications } from "./achievements";
import { generateLoot } from "./gamification-items";
import { randomInt, randomUUID } from "node:crypto";
import {
  BOSS_ATTEMPT_SIZE,
  MAX_REVISIONS_PER_ATTEMPT,
  REVISION_COOLDOWN_ANSWERS,
  type BossAttempt,
  type BossPresentation,
  type Rng,
  shuffleOptions,
  toDisplayedOptions,
  gradeByDisplayedIndex,
} from "./boss-presentation.js";

/** Returns a safe topicMastery key, or null when no meaningful topic exists. */
export function sanitizeTopicKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") return null;
  const sanitized = trimmed.replace(/\s+/g, "_").replace(/[.[\]*\/~]/g, "_").trim();
  return sanitized || null;
}

// ==========================================
// UNIFIED BOSS EVENT v2 (attempt-based, topic mastery, new damage formula)
// ==========================================

// ==========================================
// ASYNC BOSS MODEL (Increment 1, Piece 2)
// Per-student boss HP on boss_event_progress/{uid}_{eventId}.
// Combat math imported from ./boss-combat.js — do not reimplement.
// ==========================================

import {
  computeBossMaxHp,
  evaluateSkillIdentity,
  computeSkillRank,
  resolveBossTurn,
  SKILL_IDENTITY_VERSION,
  type SkillIdentityId,
} from "./boss-combat.js";

export interface IdentityModifierInput {
  specId?: string;
  unlockedSkills: string[];
  correct: boolean;
  streak: number;
  priorStreak: number;
  playerHp: number;
  playerMaxHp: number;
  bossHp: number;
  bossMaxHp: number;
  difficulty: string;
  isRevision: boolean;
  healsUsedThisAttempt: number;
}

/** Resolve unlocked nodes to combat effects; missing/unknown identities stay neutral. */
export function resolveIdentityModifiers(args: IdentityModifierInput) {
  const neutral = {
    damageMultiplier: 1,
    incomingMultiplier: 1,
    healApplied: 0,
    critBonus: 0,
    rank: 0,
    identity: null as string | null,
  };
  const specId = args.specId as SkillIdentityId | undefined;
  const rank = specId ? computeSkillRank(specId, args.unlockedSkills) : 0;
  if (!specId || rank === 0) return neutral;

  const result = evaluateSkillIdentity({
    ...args,
    identity: specId,
    rank,
    difficulty: args.difficulty as "EASY" | "MEDIUM" | "HARD",
    isHardestDifficulty: args.difficulty === "HARD",
  });
  return {
    damageMultiplier: result.damageMultiplier,
    incomingMultiplier: result.incomingMultiplier,
    healApplied: result.healApplied,
    critBonus: result.critBonus,
    rank: result.rank,
    identity: result.identity,
  };
}

export interface AttemptFlags {
  isFirstOfAttempt: boolean;
  isFirstMissOfAttempt: boolean;
}

/**
 * Derive per-attempt first-answer / first-miss flags from the presentations
 * array. Never a stored boolean: this stays correct across reloads and partial
 * state (the current presentation is excluded because it is still pending).
 */
export function deriveAttemptFlags(
  presentations: readonly BossPresentation[] | undefined | null,
  currentPresentationId: string,
  isCorrect: boolean,
): AttemptFlags {
  const priorAnswered = (presentations || []).filter(
    (p) => p.status === "answered" && p.presentationId !== currentPresentationId,
  );
  const isFirstOfAttempt = priorAnswered.length === 0;
  const isFirstMissOfAttempt = !isCorrect &&
    !priorAnswered.some((p) => p.result && p.result.correct === false);
  return { isFirstOfAttempt, isFirstMissOfAttempt };
}

const KOOLDOWN_MS = 6 * 60 * 60 * 1000; // knockout cooldown: 6 hours
const MEDEVAC_WINDOW_MS = 24 * 60 * 60 * 1000; // global medevac escalator window

export const MEDEVAC_COSTS = [50, 100, 150, 250, 400];

/**
 * Pure: resolve a boss event's victory payout.
 *
 * v2 documents store the payout under `rewards`; `completionRewards` is the
 * deprecated v1 BossEncounter field. Reading only the v1 name made every real
 * victory pay 0 XP, 0 Flux and no item, so this helper exists to be importable
 * by tests rather than duplicated there.
 */
export function resolveVictoryRewards(event: Record<string, unknown> | undefined): {
  xp: number;
  flux: number;
  itemRarity: string | null;
} {
  const src = (event?.rewards ?? event?.completionRewards ?? {}) as Record<string, unknown>;
  return {
    xp: Number(src.xp) || 0,
    flux: Number(src.flux) || 0,
    itemRarity: (src.itemRarity as string) || null,
  };
}

/** Pure: cost of the NEXT medevac given how many have been purchased (global counter). */
export function getMedevacCost(medevacCount: number): number {
  const idx = Math.min(Math.max(0, Math.floor(medevacCount)), MEDEVAC_COSTS.length - 1);
  return MEDEVAC_COSTS[idx];
}

export interface MedevacStateInput {
  now: number;
  medevacCount?: number;
  medevacResetAt?: number | string | null;
}

export interface MedevacState {
  nextCount: number;
  cost: number;
  /** Epoch ms when the global escalator window resets (undefined = no anchor needed). */
  resetAt?: number;
}

/**
 * Pure: medevac escalator state for a purchase.
 * - Fresh user (no count, or window expired/missing): anchor purchase → count 1, cost 50, new 24h window.
 * - Mid-window: increment count, cost = ladder[count], window NOT extended.
 */
export function computeMedevacState(input: MedevacStateInput): MedevacState {
  const count = typeof input.medevacCount === "number" && input.medevacCount > 0 ? input.medevacCount : 0;
  const resetAtRaw = typeof input.medevacResetAt === "string" ? Date.parse(input.medevacResetAt) : input.medevacResetAt;
  const windowActive = typeof resetAtRaw === "number" && !Number.isNaN(resetAtRaw) && input.now < resetAtRaw;

  if (!windowActive) {
    return { nextCount: 1, cost: getMedevacCost(0), resetAt: input.now + MEDEVAC_WINDOW_MS };
  }
  return { nextCount: count + 1, cost: getMedevacCost(count), resetAt: resetAtRaw };
}

export interface StudentQuestion {
  id: string;
  stem: string;
  options: string[];
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topicId?: string;
  damageBonus?: number;
  [key: string]: unknown;
}

/** Strip answer keys before a question reaches the client. */
export function toStudentQuestion(q: Record<string, unknown> | undefined): StudentQuestion | null {
  if (!q || typeof q !== "object") return null;
  const { correctAnswer: _ca, explanation: _ex, ...rest } = q as Record<string, unknown>;
  return {
    id: String(rest.id ?? ""),
    stem: String(rest.stem ?? ""),
    options: Array.isArray(rest.options) ? (rest.options as string[]) : [],
    difficulty: (rest.difficulty as "EASY" | "MEDIUM" | "HARD") ?? "MEDIUM",
    ...(rest.topicId !== undefined ? { topicId: rest.topicId as string } : {}),
    ...(rest.damageBonus !== undefined ? { damageBonus: rest.damageBonus as number } : {}),
  };
}

/** Defense in depth for Piece 5: event doc minus questions[].correctAnswer/explanation. */
export function stripBossEventForClient(event: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!event || typeof event !== "object") return null;
  const out: Record<string, unknown> = { ...event };
  if (Array.isArray(out.questions)) {
    out.questions = (out.questions as Record<string, unknown>[]).map((q) => {
      if (!q || typeof q !== "object") return q;
      const { correctAnswer: _ca, explanation: _ex, ...rest } = q;
      return rest;
    });
  }
  return out;
}

interface BossEventQuestion {
  id: string;
  stem: string;
  options: string[];
  correctAnswer: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topicId?: string;
  damageBonus?: number;
}

interface BossProgress {
  userId?: string;
  eventId?: string;
  bossMaxHp?: number;
  bossHp?: number;
  cooldownUntil?: string | null;
  session?: { id: string; playerHp: number; playerMaxHp: number; streak: number; startedAt: string } | null;
  victoryClaimed?: boolean;
  knockoutCount?: number;
  answeredQuestionIds?: string[];
  answeredCount?: number;
  correctCount?: number;
  activeAttempt?: BossAttempt | null;
  lastCompletedAttempt?: BossAttempt | null;
  // legacy fields (read-only): attempts, totalDamageDealt, participationMet, rewardClaimed
  attempts?: unknown[];
  [key: string]: unknown;
}

function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createBossAttempt(id: string, startedAt: string): BossAttempt {
  return {
    id,
    startedAt,
    targetSize: BOSS_ATTEMPT_SIZE,
    answeredCount: 0,
    presentations: [],
    revisionQueue: [],
    healsUsedThisAttempt: 0,
    attemptDamageReduction: 0,
    lethalSaveUsed: false,
    shieldHp: 0,
  } as BossAttempt & { healsUsedThisAttempt: number };
}

export interface PlannedPresentation {
  attempt: BossAttempt;
  presentation: BossPresentation;
}

/** Pure attempt planner. The pending presentation always wins, making reloads idempotent. */
export function planNextPresentation(
  attempt: BossAttempt,
  availableQuestionIds: string[],
  rng: Rng,
  preferredQuestionId?: string,
): PlannedPresentation | null {
  const pending = attempt.presentations[attempt.presentations.length - 1];
  if (pending?.status === "pending") return { attempt, presentation: pending };
  // Only answeredCount decides whether the attempt is full. Counting
  // presentations.length here was a bug: revisions add presentations that do not
  // count as answers, so an attempt with 4 answers plus 1 revision hit the cap and
  // planning returned null, stranding the student on a question they could not
  // replace.
  if (attempt.answeredCount >= attempt.targetSize) return null;

  const available = new Set(availableQuestionIds);
  const answered = new Set(
    attempt.presentations.filter((p) => p.status === "answered").map((p) => p.questionId),
  );
  const revision = attempt.revisionQueue.find((item) =>
    item.eligibleAfterAnswered <= attempt.answeredCount &&
    item.failedCount < MAX_REVISIONS_PER_ATTEMPT &&
    available.has(item.questionId)
  );
  let questionId = revision?.questionId;
  if (!questionId) {
    const candidates = availableQuestionIds.filter((id) => !answered.has(id));
    questionId = preferredQuestionId && candidates.includes(preferredQuestionId)
      ? preferredQuestionId
      : candidates[0];
  }
  if (!questionId) return null;

  const presentation: BossPresentation = {
    presentationId: `${attempt.id}_${attempt.answeredCount}_${questionId}`,
    questionId,
    optionOrder: [],
    status: "pending",
    isRevision: !!revision,
  };
  return {
    attempt: { ...attempt, presentations: [...attempt.presentations, presentation] },
    presentation,
  };
}

export interface AppliedAttemptAnswer {
  status: "answered" | "cached" | "stale";
  attempt: BossAttempt;
  presentation?: BossPresentation;
  complete: boolean;
}

/** Pure, idempotent answer application; combat and persistence stay in the callable. */
export function applyAnswerToAttempt(
  attempt: BossAttempt,
  presentationId: string,
  result: { correct: boolean; damage: number },
): AppliedAttemptAnswer {
  const presentation = attempt.presentations.find((p) => p.presentationId === presentationId);
  if (!presentation) return { status: "stale", attempt, complete: attempt.answeredCount >= attempt.targetSize };
  if (presentation.status === "answered") {
    return {
      status: "cached",
      attempt,
      presentation,
      complete: attempt.answeredCount >= attempt.targetSize,
    };
  }

  const answeredCount = attempt.answeredCount + 1;
  const answeredPresentation: BossPresentation = {
    ...presentation,
    status: "answered",
    result: { correct: result.correct, damage: result.damage },
  };
  let revisionQueue = attempt.revisionQueue.filter((item) => item.questionId !== presentation.questionId);
  if (!result.correct) {
    const previous = attempt.revisionQueue.find((item) => item.questionId === presentation.questionId);
    const failedCount = (previous?.failedCount || 0) + 1;
    if (failedCount < MAX_REVISIONS_PER_ATTEMPT) {
      revisionQueue = [...revisionQueue, {
        questionId: presentation.questionId,
        failedCount,
        eligibleAfterAnswered: answeredCount + REVISION_COOLDOWN_ANSWERS,
      }];
    }
  }

  return {
    status: "answered",
    attempt: {
      ...attempt,
      answeredCount,
      healsUsedThisAttempt: (attempt as BossAttempt & { healsUsedThisAttempt?: number }).healsUsedThisAttempt || 0,
      presentations: attempt.presentations.map((p) =>
        p.presentationId === presentationId ? answeredPresentation : p
      ),
      revisionQueue,
    } as BossAttempt & { healsUsedThisAttempt?: number },
    presentation: answeredPresentation,
    complete: answeredCount === attempt.targetSize,
  };
}

/** Shared equipment/stat derivation for the async boss model. */
function derivePlayerLoadout(userData: FirebaseFirestore.DocumentData, eventClassType: unknown) {
  const gam = (userData.gamification || {}) as Record<string, any>;
  const activeClass = (eventClassType as string) || userData.classType || "";
  const profile = gam.classProfiles?.[activeClass];
  const equipped = profile?.equipped || gam.equipped || {};
  const stats = calculateServerStats(equipped);
  const gearScore = calculateServerGearScore(equipped);
  const combat = deriveCombatStats(stats);
  return { gam, activeClass, equipped, stats, gearScore, combat };
}

function isWindowOpen(event: { scheduledAt?: string; deadline?: string }, now: number): boolean {
  const start = event.scheduledAt ? Date.parse(event.scheduledAt) : 0;
  const end = event.deadline ? Date.parse(event.deadline) : Number.POSITIVE_INFINITY;
  if (!Number.isNaN(start) && now < start) return false;
  if (!Number.isNaN(end) && now > end) return false;
  return true;
}

/**
 * Async boss answer handler. Per-student boss HP, knockout cooldown, flat victory payout.
 * Replaces the shared-pool shard model. `timeTakenMs` is accepted for API compatibility
 * but no longer affects damage (speed bonus deleted).
 */
export const answerBossEvent = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
  const { eventId, questionId, answer, presentationId, displayedIndex, timeTakenMs: _timeTakenMs } = request.data;
  const legacySubmission = !presentationId && !!questionId && answer !== undefined;
  const newSubmission = !!presentationId && displayedIndex !== undefined;
  if (!eventId || (!legacySubmission && !newSubmission)) {
    throw new HttpsError("invalid-argument", "Event ID and presentation answer required.");
  }
  if (legacySubmission) {
    logWithCorrelation("warn", "answerBossEvent: legacy submission shape", correlationId, { uid, eventId });
  }

  const db = admin.firestore();
  const eventRef = db.doc(`boss_events/${eventId}`);
  const userRef = db.doc(`users/${uid}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);

  const [eventSnap, userSnap, progressSnap] = await Promise.all([
    eventRef.get(), userRef.get(), progressRef.get(),
  ]);

  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const event = eventSnap.data() as Record<string, any>;
  if (!event.isActive) throw new HttpsError("failed-precondition", "Event is not active.");

  const now = Date.now();
  if (!isWindowOpen(event, now)) {
    return { error: "EVENT_CLOSED", message: "This boss event is not currently open." };
  }

  const questions: BossEventQuestion[] = event.questions || [];
  const initialProgress = (progressSnap.exists ? progressSnap.data() : {}) as BossProgress;
  const initialPresentation = presentationId
    ? [...(initialProgress.activeAttempt?.presentations || []), ...(initialProgress.lastCompletedAttempt?.presentations || [])]
      .find((p) => p.presentationId === presentationId)
    : undefined;
  const resolvedQuestionId = questionId || initialPresentation?.questionId;
  const question = questions.find((q) => q.id === resolvedQuestionId);
  if (!question) throw new HttpsError("not-found", "Question not found.");

  const userData = userSnap.data()!;
  const loadout = derivePlayerLoadout(userData, event.classType);
  const { gam } = loadout;

  // Pre-transaction structured rejections (client-renderable)
  const progress = initialProgress;
  if (progress.victoryClaimed) {
    return { error: "ALREADY_VICTORIOUS", message: "You have already defeated this boss." };
  }
  const cooldownUntil = progress.cooldownUntil ? Date.parse(progress.cooldownUntil) : 0;
  if (!Number.isNaN(cooldownUntil) && cooldownUntil > now) {
    return {
      error: "COOLDOWN_ACTIVE",
      cooldownUntil: progress.cooldownUntil,
      medevacCost: getMedevacCost(gam.medevacCount || 0),
    };
  }
  const rand = Math.random();
  const critRoll = Math.random();

  const txResult = await db.runTransaction(async (t) => {
    // All reads first
    const [latestEventDoc, latestUserDoc, latestProgressDoc] = await Promise.all([
      t.get(eventRef), t.get(userRef), t.get(progressRef),
    ]);
    if (!latestEventDoc.exists) throw new HttpsError("not-found", "Event not found.");
    if (!latestUserDoc.exists) throw new HttpsError("not-found", "User not found.");

    const latestEvent = latestEventDoc.data() as Record<string, any>;
    if (!latestEvent.isActive) throw new HttpsError("failed-precondition", "Event is not active.");
    const txNow = Date.now();
    if (!isWindowOpen(latestEvent, txNow)) {
      return { error: "EVENT_CLOSED" as const };
    }

    const latestUserData = latestUserDoc.data()!;
    const latestLoadout = derivePlayerLoadout(latestUserData, latestEvent.classType);
    const latestGam = latestLoadout.gam;

    const latestProgress = (latestProgressDoc.exists ? latestProgressDoc.data() : {}) as BossProgress;

    // Re-check guards inside the transaction (concurrency-safe)
    if (latestProgress.victoryClaimed) {
      return { error: "ALREADY_VICTORIOUS" as const };
    }
    const cdUntil = latestProgress.cooldownUntil ? Date.parse(latestProgress.cooldownUntil) : 0;
    if (!Number.isNaN(cdUntil) && cdUntil > txNow) {
      return {
        error: "COOLDOWN_ACTIVE" as const,
        cooldownUntil: latestProgress.cooldownUntil,
        medevacCost: getMedevacCost(latestGam.medevacCount || 0),
      };
    }
    // Initialize / migrate progress. Legacy docs (shared-pool era) start the student
    // at full personal HP — prior shared damage is treated as irrelevant.
    const isNewProgress = !latestProgressDoc.exists || typeof latestProgress.bossMaxHp !== "number";
    const bossMaxHp = isNewProgress
      ? computeBossMaxHp(latestLoadout.gearScore, latestLoadout.stats)
      : (latestProgress.bossMaxHp as number);
    const bossHp = isNewProgress ? bossMaxHp : Math.max(0, latestProgress.bossHp as number);

    let attempt = latestProgress.activeAttempt || null;
    if (!legacySubmission) {
      if (!attempt) {
        return { error: "STALE_PRESENTATION" as const };
      }
      const pending = attempt.presentations.find((p) => p.presentationId === presentationId);
      if (!pending) {
        const completed = latestProgress.lastCompletedAttempt;
        const cached = completed?.presentations.find((p) => p.presentationId === presentationId);
        if (completed && cached?.status === "answered" && cached.result) {
          const cachedSession = latestProgress.session;
          return {
            correct: cached.result.correct,
            damage: cached.result.damage,
            isCrit: false,
            bossHp: latestProgress.bossHp ?? 0,
            bossMaxHp: latestProgress.bossMaxHp ?? 0,
            playerHp: cachedSession?.playerHp || 0,
            playerMaxHp: cachedSession?.playerMaxHp || latestLoadout.combat.maxHp,
            knockedOut: !cachedSession,
            cooldownUntil: latestProgress.cooldownUntil || null,
            victory: !!latestProgress.victoryClaimed,
            streak: cachedSession?.streak || 0,
            newUnlocks: [] as string[],
            alreadyAnswered: true as const,
            attemptComplete: true,
          };
        }
        return { error: "STALE_PRESENTATION" as const };
      }
      const applied = applyAnswerToAttempt(attempt, presentationId, { correct: false, damage: 0 });
      if (applied.status === "stale") return { error: "STALE_PRESENTATION" as const };
      if (applied.status === "cached" && applied.presentation?.result) {
        const cachedSession = latestProgress.session;
        return {
          correct: applied.presentation.result.correct,
          damage: applied.presentation.result.damage,
          isCrit: false,
          bossHp: latestProgress.bossHp ?? 0,
          bossMaxHp: latestProgress.bossMaxHp ?? 0,
          playerHp: cachedSession?.playerHp || 0,
          playerMaxHp: cachedSession?.playerMaxHp || latestLoadout.combat.maxHp,
          knockedOut: !cachedSession,
          cooldownUntil: latestProgress.cooldownUntil || null,
          victory: !!latestProgress.victoryClaimed,
          streak: cachedSession?.streak || 0,
          newUnlocks: [] as string[],
          alreadyAnswered: true as const,
          attemptComplete: applied.complete,
        };
      }
    }

    // Session: reuse the active one, or open a fresh one
    let session = latestProgress.session || null;
    if (session && (!session.playerMaxHp || session.playerHp === undefined)) session = null;
    if (!session) {
      session = {
        id: newSessionId(),
        playerHp: latestLoadout.combat.maxHp,
        playerMaxHp: latestLoadout.combat.maxHp,
        streak: 0,
        startedAt: new Date(txNow).toISOString(),
      };
    }

    const presentationForAnswer: BossPresentation = legacySubmission
      ? {
          presentationId: `legacy_${randomUUID()}`,
          questionId,
          optionOrder: shuffleOptions(question.options.length, randomInt),
          status: "pending",
          isRevision: false,
        }
      : attempt!.presentations.find((p) => p.presentationId === presentationId)!;
    const graded = legacySubmission
      ? { valid: true, correct: Number(answer) === question.correctAnswer, canonicalIndex: Number(answer) }
      : gradeByDisplayedIndex(question, presentationForAnswer.optionOrder, Number(displayedIndex));
    if (!graded.valid) throw new HttpsError("invalid-argument", "Invalid displayed answer index.");
    const isCorrect = graded.correct;
    const submittedAttemptId = legacySubmission ? `legacy_${presentationForAnswer.presentationId}` : attempt!.id;
    const healsBeforeAnswer = (attempt as (BossAttempt & { healsUsedThisAttempt?: number }) | null)?.healsUsedThisAttempt || 0;
    const priorStreak = session.streak || 0;
    const bossMaxHpLocal = bossMaxHp;
    const attemptProgress = attempt as (BossAttempt & {
      attemptDamageReduction?: number;
      lethalSaveUsed?: boolean;
      shieldHp?: number;
    }) | null;

    // DERIVE from presentations[] — never store booleans (immune to reloads)
    const { isFirstOfAttempt, isFirstMissOfAttempt } = deriveAttemptFlags(
      attempt?.presentations,
      presentationForAnswer.presentationId,
      isCorrect,
    );

    const specId = (latestGam.specialization as SkillIdentityId | undefined) ?? null;
    const turnState = {
      bossHp, bossMaxHp: bossMaxHpLocal,
      playerHp: Number.isFinite(session.playerHp) ? session.playerHp : 0,
      playerMaxHp: session.playerMaxHp || latestLoadout.combat.maxHp,
      streak: priorStreak,
      healsUsedThisAttempt: healsBeforeAnswer,
      attemptDamageReduction: attemptProgress?.attemptDamageReduction ?? 0,
      lethalSaveUsed: attemptProgress?.lethalSaveUsed ?? false,
      shieldHp: attemptProgress?.shieldHp ?? 0,
      isFirstOfAttempt,
      isFirstMissOfAttempt,
    };

    const turn = resolveBossTurn(specId, latestGam.unlockedSkills || [], turnState, {
      correct: isCorrect,
      difficulty: question.difficulty,
      isRevision: presentationForAnswer.isRevision,
      rand, critRoll,
      gearScore: latestLoadout.gearScore,
      stats: latestLoadout.stats,
    });

    const newBossHp = turn.bossHp;
    const rawPlayerHp = turn.playerHp;
    const playerHp = Number.isFinite(rawPlayerHp)
      ? Math.min(Math.max(rawPlayerHp, 0), turnState.playerMaxHp)
      : turnState.playerHp;
    const newStreak = turn.streak;
    const damage = turn.damageDealt;
    const isCrit = turn.isCrit;

    // Knockout
    let knockedOut = false;
    let newCooldownUntil: string | null = latestProgress.cooldownUntil || null;
    let knockoutCount = latestProgress.knockoutCount || 0;
    let newSession: BossProgress["session"] = session;
    if (turn.knockout) {
      knockedOut = true;
      newSession = null;
      newCooldownUntil = new Date(txNow + KOOLDOWN_MS).toISOString();
      knockoutCount += 1;
    } else {
      newSession = { ...session, playerHp: playerHp as number, playerMaxHp: session.playerMaxHp || latestLoadout.combat.maxHp, streak: newStreak };
    }

    // Victory payout (per-student, same transaction)
    let victory = false;
    let pendingAchievementUnlocks: string[] = [];
    const userUpdates: Record<string, any> = {};
    if (turn.victory && !latestProgress.victoryClaimed) {
      victory = true;
      // v2 events store the payout under `rewards`. `completionRewards` is the
      // deprecated v1 BossEncounter field and is undefined on v2 documents, so
      // reading it made every victory pay 0 XP, 0 Flux and no item.
      const { xp: rewardXp, flux: rewardFlux, itemRarity: rewardItemRarity } =
        resolveVictoryRewards(latestEvent);

      if (rewardXp > 0) {
        const xpRes = buildXPUpdates(latestUserData, rewardXp, latestLoadout.activeClass);
        Object.assign(userUpdates, xpRes.updates);
      }
      if (rewardFlux > 0) {
        const baseCurrency = userUpdates["gamification.currency"] ?? (latestGam.currency || 0);
        userUpdates["gamification.currency"] = baseCurrency + rewardFlux;
      }
      if (rewardItemRarity) {
        const loot = generateLoot(latestGam.level || 1, rewardItemRarity);
        const bossClass = latestEvent.classType && latestEvent.classType !== "GLOBAL" ? latestEvent.classType : null;
        const lootClass = bossClass || latestUserData.classType;
        if (lootClass && lootClass !== "Uncategorized" && latestGam.classProfiles?.[lootClass]) {
          const inv = latestGam.classProfiles[lootClass].inventory || [];
          userUpdates[`gamification.classProfiles.${lootClass}.inventory`] = [...inv, loot];
        } else {
          const inv = latestGam.inventory || [];
          userUpdates["gamification.inventory"] = [...inv, loot];
        }
      }
      userUpdates["gamification.bossesDefeated"] = (latestGam.bossesDefeated || 0) + 1;
      const { rewardUpdates: achievementUpdates, newUnlocks } = checkAndUnlockAchievements(latestUserData, userUpdates);
      Object.assign(userUpdates, achievementUpdates);
      userUpdates["gamification.bossesDefeated"] = (latestGam.bossesDefeated || 0) + 1; // guard against achievement-rewrite
      pendingAchievementUnlocks = newUnlocks;
    }

    let attemptComplete = false;
    let completedAttempt: BossAttempt | null = null;
    if (!legacySubmission) {
      const applied = applyAnswerToAttempt(attempt!, presentationId, { correct: isCorrect, damage });
      if (applied.status !== "answered") return { error: "STALE_PRESENTATION" as const };
      (applied.attempt as BossAttempt & { healsUsedThisAttempt?: number }).healsUsedThisAttempt =
        turn.healsUsedThisAttempt;
      (applied.attempt as any).attemptDamageReduction = turn.attemptDamageReduction;
      (applied.attempt as any).lethalSaveUsed = turn.lethalSaveUsed;
      (applied.attempt as any).shieldHp = turn.shieldHp;
      attemptComplete = applied.complete;
      completedAttempt = applied.complete ? applied.attempt : null;
      attempt = applied.complete ? null : applied.attempt;
    }

    // Plain display counter: increment once per student per event
    const isFirstAnswer = (latestProgress.answeredQuestionIds || []).length === 0;
    if (isFirstAnswer) {
      t.update(eventRef, { participantCount: admin.firestore.FieldValue.increment(1) });
    }

    if (Object.keys(userUpdates).length > 0) {
      t.update(userRef, userUpdates);
    }

    const answerRecordRef = db.doc(`boss_event_answers/${uid}_${presentationForAnswer.presentationId}`);
    t.set(answerRecordRef, {
      uid,
      eventId,
      attemptId: submittedAttemptId,
      presentationId: presentationForAnswer.presentationId,
      questionId: question.id,
      correct: isCorrect,
      isRevision: presentationForAnswer.isRevision,
      difficulty: question.difficulty,
      answeredAt: new Date(txNow).toISOString(),
      skillIdentityVersion: SKILL_IDENTITY_VERSION,
      ...(specId !== null ? { skillIdentity: specId } : {}),
      appliedKeys: turn.appliedKeys,
      executed: turn.executed,
      lethalSaveConsumed: turn.lethalSaveConsumed,
      skillRank: turn.rank,
      skillDamageMultiplier: turn.damageMultiplier,
      skillIncomingMultiplier: turn.incomingMultiplier,
      skillCritBonus: turn.critBonus,
      skillHealingApplied: turn.healApplied,
      healCapped: turn.healCapped,
    });

    // Progress write (legacy `attempts` field is no longer written)
    const answeredQuestionIds = [...(latestProgress.answeredQuestionIds || []), question.id];
    t.set(progressRef, {
      userId: uid,
      eventId,
      bossMaxHp,
      bossHp: newBossHp,
      cooldownUntil: newCooldownUntil,
      session: newSession,
      victoryClaimed: latestProgress.victoryClaimed || victory,
      knockoutCount,
      answeredQuestionIds,
      answeredCount: (latestProgress.answeredCount || 0) + 1,
      correctCount: (latestProgress.correctCount || 0) + (isCorrect ? 1 : 0),
      ...(legacySubmission ? {} : {
        activeAttempt: attempt,
        ...(attemptComplete ? { lastCompletedAttempt: completedAttempt } : {}),
      }),
    }, { merge: true });

    return {
      correct: isCorrect,
      damage,
      isCrit,
      bossHp: newBossHp,
      bossMaxHp,
      playerHp: newSession ? newSession.playerHp : 0,
      playerMaxHp: (newSession ? newSession.playerMaxHp : session.playerMaxHp) || latestLoadout.combat.maxHp,
      knockedOut,
      cooldownUntil: newCooldownUntil,
      // Always surface the current Medevac price so the knockout screen can offer
      // an instant revive. Omitting it here left the client's medevacCost null and
      // hid the button until the student reloaded the page.
      medevacCost: getMedevacCost(latestGam.medevacCount || 0),
      victory,
      streak: newStreak,
      healAmount: turn.healApplied,
      healApplied: turn.healApplied,
      healCapped: turn.healCapped,
      newUnlocks: pendingAchievementUnlocks,
      ...(legacySubmission ? {} : { attemptComplete, presentationId }),
    };
  });

  if ("error" in txResult && txResult.error) {
    if (txResult.error === "ALREADY_VICTORIOUS") {
      return { error: "ALREADY_VICTORIOUS", message: "You have already defeated this boss." };
    }
    if (txResult.error === "COOLDOWN_ACTIVE") {
      return txResult;
    }
    if (txResult.error === "STALE_PRESENTATION") return { error: "STALE_PRESENTATION" };
    return { error: "EVENT_CLOSED", message: "This boss event is not currently open." };
  }
  if ("alreadyAnswered" in txResult && txResult.alreadyAnswered) {
    return txResult;
  }

  // Achievement notifications AFTER the transaction resolves (no side effects in tx callback)
  if (txResult.newUnlocks && txResult.newUnlocks.length > 0) {
    try {
      await writeAchievementNotifications(db, uid, txResult.newUnlocks);
    } catch (err) {
      logWithCorrelation("error", "Failed to write achievement notifications", correlationId, {
        uid, eventId, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Topic mastery tracking (outside transaction, best-effort)
  const topicKey = sanitizeTopicKey(question.topicId);
  if (topicKey !== null) {
    try {
      const masteryData = gam.topicMastery || {};
      const currentMastery = masteryData[topicKey] || {
        topicId: topicKey, topicName: topicKey,
        level: 0, accuracyHistory: [], currentAccuracy: 0,
        questionsAnswered: 0, questionsCorrect: 0, lastUpdated: new Date().toISOString(),
      };
      currentMastery.accuracyHistory = [...(currentMastery.accuracyHistory || []), txResult.correct ? 1 : 0].slice(-20);
      currentMastery.questionsAnswered = (currentMastery.questionsAnswered || 0) + 1;
      if (txResult.correct) currentMastery.questionsCorrect = (currentMastery.questionsCorrect || 0) + 1;
      const recent = currentMastery.accuracyHistory;
      currentMastery.currentAccuracy = recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
      currentMastery.level = Math.min(10, Math.floor(currentMastery.currentAccuracy * 10));
      currentMastery.lastUpdated = new Date().toISOString();
      await userRef.update({ [`gamification.topicMastery.${topicKey}`]: currentMastery });
    } catch (err) {
      logWithCorrelation("error", "Failed to update topic mastery", correlationId, {
        uid, eventId, topicId: topicKey, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return txResult;
});

// ==========================================
// ADAPTIVE QUESTION SELECTION
// ==========================================

/**
 * Pure: pick the next question for an attempt.
 *
 * Scores by difficulty band and topic recency, and applies a strong penalty to
 * anything already served during the event. Without the lifetime penalty every
 * new attempt restarted at the first question, so students saw the same handful
 * on repeat. The unseen pool always wins until it is exhausted.
 */
export function selectNextQuestion(args: {
  questions: Array<{ id: string; difficulty: string; topicId?: string }>;
  lifetimeAnsweredIds: string[];
  targetDifficulties: string[];
  recentTopics?: Record<string, number>;
  rand?: () => number;
}): { id: string; difficulty: string; topicId?: string } | null {
  const { questions, lifetimeAnsweredIds, targetDifficulties } = args;
  if (!questions || questions.length === 0) return null;
  const rand = args.rand || Math.random;
  const recentTopics = args.recentTopics || {};
  const lifetimeAnswered = new Set<string>(lifetimeAnsweredIds || []);

  const scored = questions.map((q) => {
    let score = rand();
    const diffIdx = targetDifficulties.indexOf(q.difficulty);
    if (diffIdx === 0) score += 2.0;
    else if (diffIdx === 1) score += 1.0;
    if (lifetimeAnswered.has(q.id)) score -= 3.0;
    if (q.topicId && recentTopics[q.topicId]) {
      score -= recentTopics[q.topicId] * 0.5;
    }
    return { q, score };
  });

  const unseen = scored.filter((s) => !lifetimeAnswered.has(s.q.id));
  const pool = unseen.length > 0 ? unseen : scored;
  pool.sort((a, b) => b.score - a.score);
  return pool[0].q;
}

export const getNextBossQuestion = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  generateCorrelationId();
  const { eventId } = request.data;
  if (!eventId) {
    throw new HttpsError("invalid-argument", "Event ID required.");
  }

  const db = admin.firestore();
  const eventRef = db.doc(`boss_events/${eventId}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);
  const userRef = db.doc(`users/${uid}`);

  const [eventSnap, progressSnap, userSnap] = await Promise.all([
    eventRef.get(), progressRef.get(), userRef.get(),
  ]);

  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
  const event = eventSnap.data() as Record<string, any>;
  if (!event.isActive) throw new HttpsError("failed-precondition", "Event is not active.");

  const now = Date.now();
  if (!isWindowOpen(event, now)) {
    return { error: "EVENT_CLOSED", message: "This boss event is not currently open." };
  }

  const userData = userSnap.data()!;
  const loadout = derivePlayerLoadout(userData, event.classType);
  const gam = loadout.gam;

  // Bootstrap the progress doc if missing (cold start) or legacy (no bossMaxHp snapshot).
  const existing = progressSnap.exists ? (progressSnap.data() as BossProgress) : null;
  if (!existing || typeof existing.bossMaxHp !== "number") {
    const bossMaxHp = computeBossMaxHp(loadout.gearScore, loadout.stats);
    const bootstrap: BossProgress = {
      userId: uid,
      eventId,
      bossMaxHp,
      bossHp: bossMaxHp,
      cooldownUntil: null,
      session: null,
      victoryClaimed: false,
      knockoutCount: 0,
      answeredQuestionIds: [],
      answeredCount: 0,
      correctCount: 0,
    };
    await progressRef.set(bootstrap, { merge: true });
    return {
      question: null,
      bossHp: bossMaxHp,
      bossMaxHp,
      playerHp: loadout.combat.maxHp,
      playerMaxHp: loadout.combat.maxHp,
      knockoutCount: 0,
      victoryClaimed: false,
      cooldownUntil: null,
      medevacCost: getMedevacCost(gam.medevacCount || 0),
      remainingCount: (event.questions || []).length,
      attemptStats: { accuracy: null, correct: 0, attempted: 0 },
      message: "Boss encounter initialized.",
    };
  }

  const progress = existing;

  // Cooldown state so the client can render the knockout screen without a second call
  const cooldownUntil = progress.cooldownUntil ? Date.parse(progress.cooldownUntil) : 0;
  if (!Number.isNaN(cooldownUntil) && cooldownUntil > now) {
    return {
      question: null,
      cooldownActive: true,
      cooldownUntil: progress.cooldownUntil,
      medevacCost: getMedevacCost(gam.medevacCount || 0),
      bossHp: progress.bossHp ?? 0,
      bossMaxHp: progress.bossMaxHp,
      knockoutCount: progress.knockoutCount || 0,
      victoryClaimed: !!progress.victoryClaimed,
    };
  }

  if (progress.victoryClaimed) {
    return {
      question: null,
      complete: true,
      victoryClaimed: true,
      message: "You have already defeated this boss!",
      bossHp: 0,
      bossMaxHp: progress.bossMaxHp,
    };
  }

  const questions: BossEventQuestion[] = event.questions || [];
  const remaining = questions;

  if (remaining.length === 0) {
    return {
      question: null,
      complete: true,
      message: "All questions answered!",
      bossHp: progress.bossHp ?? 0,
      bossMaxHp: progress.bossMaxHp,
      victoryClaimed: !!progress.victoryClaimed,
    };
  }

  // --- Adaptive selection (accuracy band + topic diversity penalty) ---
  const answeredCount = progress.answeredCount || 0;
  const correctCount = progress.correctCount || 0;
  const accuracy = answeredCount > 0 ? correctCount / answeredCount : 0.5;

  let targetDifficulties: ("EASY" | "MEDIUM" | "HARD")[];
  if (accuracy > 0.85) targetDifficulties = ["HARD", "MEDIUM"];
  else if (accuracy < 0.55) targetDifficulties = ["EASY", "MEDIUM"];
  else targetDifficulties = ["MEDIUM", "EASY", "HARD"];

  const recentTopics: Record<string, number> = {};
  for (const qid of (progress.answeredQuestionIds || []).slice(-5)) {
    const q = questions.find((x) => x.id === qid);
    if (q?.topicId) recentTopics[q.topicId] = (recentTopics[q.topicId] || 0) + 1;
  }

  // Score by recent exposure across the WHOLE event, not just the current attempt.
  // `answeredQuestionIds` is event-lifetime history; without it every new attempt
  // restarted at the first question and students saw the same five on repeat.
  const selected = selectNextQuestion({
    questions: remaining,
    lifetimeAnsweredIds: progress.answeredQuestionIds || [],
    targetDifficulties,
    recentTopics,
    rand: Math.random,
  })!;

  const nextRemaining = remaining.filter((q) => q.id !== selected.id);
  let bossIntent = null;
  if (nextRemaining.length > 0) {
    const nextQ = nextRemaining[0];
    bossIntent = {
      type: "channel",
      warningText: "Channeling...",
      icon: "⚡",
      targetSubject: nextQ.topicId,
    };
  }

  const session = progress.session || null;
  const attemptResult = await db.runTransaction(async (t) => {
    const latestProgressDoc = await t.get(progressRef);
    const latestProgress = (latestProgressDoc.exists ? latestProgressDoc.data() : progress) as BossProgress;
    const isNewAttempt = !latestProgress.activeAttempt;
    let attempt = latestProgress.activeAttempt ||
      createBossAttempt(
        `a_${Date.now().toString(36)}_${randomUUID()}`,
        new Date().toISOString(),
      );
    // A freshly created attempt must be persisted even if planning below fails,
    // otherwise the next call would mint another new attempt and progress would
    // never accumulate. lastCompletedAttempt is read-only history and is never
    // resumed as the active attempt.
    if (isNewAttempt) {
      t.set(progressRef, { activeAttempt: attempt }, { merge: true });
    }
    const completed = attempt.answeredCount >= attempt.targetSize;
    const planned = completed ? null : planNextPresentation(
      attempt,
      remaining.map((q) => q.id),
      randomInt,
      selected.id,
    );
    if (planned && planned.presentation.status === "pending" && planned.presentation !== attempt.presentations[attempt.presentations.length - 1]) {
      const selectedQuestion = questions.find((q) => q.id === planned!.presentation.questionId);
      if (!selectedQuestion) return { error: "STALE_PRESENTATION" as const, attempt };
      planned.presentation.optionOrder = shuffleOptions(selectedQuestion.options.length, randomInt);
      attempt = planned.attempt;
      await Promise.resolve();
      t.set(progressRef, { activeAttempt: attempt }, { merge: true });
    }
    const presentation = attempt.presentations[attempt.presentations.length - 1];
    return { attempt, presentation };
  });
  if ("error" in attemptResult && attemptResult.error) return { error: attemptResult.error };
  const currentAttempt = attemptResult.attempt;
  const presentation = attemptResult.presentation;
  const selectedQuestion = presentation ? questions.find((q) => q.id === presentation.questionId) : undefined;
  const common = {
    bossHp: progress.bossHp ?? 0,
    bossMaxHp: progress.bossMaxHp,
    playerHp: session ? session.playerHp : loadout.combat.maxHp,
    playerMaxHp: session ? session.playerMaxHp : loadout.combat.maxHp,
    streak: session ? session.streak || 0 : 0,
    cooldownUntil: progress.cooldownUntil || null,
    medevacCost: getMedevacCost(gam.medevacCount || 0),
    knockoutCount: progress.knockoutCount || 0,
    victoryClaimed: !!progress.victoryClaimed,
  };
  if (!presentation || !selectedQuestion || currentAttempt.answeredCount >= currentAttempt.targetSize) {
    return {
      ...common,
      presentation: null,
      complete: true,
      attemptState: {
        attemptId: currentAttempt.id,
        answeredCount: currentAttempt.answeredCount,
        targetSize: currentAttempt.targetSize,
        complete: true,
        revisionsPending: currentAttempt.revisionQueue.length,
      },
    };
  }

  return {
    ...common,
    presentation: {
      presentationId: presentation.presentationId,
      stem: selectedQuestion.stem,
      options: toDisplayedOptions(selectedQuestion.options, presentation.optionOrder),
      difficulty: selectedQuestion.difficulty,
      isRevision: presentation.isRevision,
      attemptAnsweredCount: currentAttempt.answeredCount,
      attemptSize: currentAttempt.targetSize,
    },
    attemptState: {
      attemptId: currentAttempt.id,
      answeredCount: currentAttempt.answeredCount,
      targetSize: currentAttempt.targetSize,
      complete: false,
      revisionsPending: currentAttempt.revisionQueue.length,
    },
    complete: false,
    bossIntent,
    remainingCount: remaining.length - 1,
    attemptStats: {
      accuracy: Math.round(accuracy * 100),
      correct: correctCount,
      attempted: answeredCount,
    },
  };
});

// ==========================================
// MEDEVAC
// ==========================================

export const medevacBoss = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
  const { eventId } = request.data;
  if (!eventId) throw new HttpsError("invalid-argument", "Event ID required.");

  const db = admin.firestore();
  const eventRef = db.doc(`boss_events/${eventId}`);
  const userRef = db.doc(`users/${uid}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${eventId}`);

  const [eventSnap, userSnap, progressSnap] = await Promise.all([
    eventRef.get(), userRef.get(), progressRef.get(),
  ]);

  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");
  if (!progressSnap.exists) throw new HttpsError("not-found", "No boss progress found for this event.");

  const progress = progressSnap.data() as BossProgress;
  const now = Date.now();
  const cooldownUntil = progress.cooldownUntil ? Date.parse(progress.cooldownUntil) : 0;
  if (Number.isNaN(cooldownUntil) || cooldownUntil <= now) {
    return { error: "NO_ACTIVE_COOLDOWN", message: "You are not on a knockout cooldown." };
  }

  const txResult = await db.runTransaction(async (t) => {
    // All reads first
    const [latestUserDoc, latestProgressDoc] = await Promise.all([t.get(userRef), t.get(progressRef)]);
    if (!latestUserDoc.exists) throw new HttpsError("not-found", "User not found.");
    if (!latestProgressDoc.exists) throw new HttpsError("not-found", "No boss progress found for this event.");

    const latestUserData = latestUserDoc.data()!;
    const latestGam = (latestUserData.gamification || {}) as Record<string, any>;
    const latestProgress = latestProgressDoc.data() as BossProgress;

    const txNow = Date.now();
    const cd = latestProgress.cooldownUntil ? Date.parse(latestProgress.cooldownUntil) : 0;
    if (Number.isNaN(cd) || cd <= txNow) {
      return { error: "NO_ACTIVE_COOLDOWN" as const };
    }

    const state = computeMedevacState({
      now: txNow,
      medevacCount: latestGam.medevacCount,
      medevacResetAt: latestGam.medevacResetAt,
    });

    const balance = latestGam.currency || 0;
    if (balance < state.cost) {
      return { error: "INSUFFICIENT_FLUX" as const, cost: state.cost, balance };
    }

    // All writes after all reads
    const userUpdates: Record<string, any> = {
      "gamification.currency": balance - state.cost,
      "gamification.medevacCount": state.nextCount,
    };
    if (state.resetAt !== undefined) {
      userUpdates["gamification.medevacResetAt"] = state.resetAt;
    }
    t.update(userRef, userUpdates);
    t.update(progressRef, { cooldownUntil: null });

    return {
      success: true as const,
      cost: state.cost,
      remainingFlux: balance - state.cost,
      nextCost: getMedevacCost(state.nextCount),
      resetsAt: state.resetAt !== undefined ? state.resetAt : (latestGam.medevacResetAt ?? null),
    };
  });

  if ("error" in txResult && txResult.error) {
    return txResult;
  }
  logWithCorrelation("info", "medevacBoss: success", correlationId, { uid, eventId, cost: txResult.cost });
  return txResult;
});

// ==========================================
// SPECIALIZATION TRIALS
// ==========================================

export const startSpecializationTrial = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  const correlationId = generateCorrelationId();
  const { specializationId } = request.data;
  if (!specializationId) {
    throw new HttpsError("invalid-argument", "Specialization ID required.");
  }

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const userData = userSnap.data()!;
  const gam = userData.gamification || {};

  // Check if already has a specialization
  if (gam.specialization) {
    throw new HttpsError("failed-precondition", "You already have a specialization.");
  }

  // Check level requirement
  const level = gam.level || 1;
  if (level < 10) {
    throw new HttpsError("failed-precondition", `Reach level 10 to unlock specializations. You are level ${level}.`);
  }

  const { force } = request.data;

  // Check if trial already in progress
  const trialEventId = `trial_${uid}_${specializationId}`;
  const trialRef = db.doc(`boss_events/${trialEventId}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${trialEventId}`);
  const trialSnap = await trialRef.get();
  if (trialSnap.exists && trialSnap.data()?.isActive && !force) {
    return { trialEventId, message: "Continuing your trial..." };
  }

  // If forcing a restart, clean up old progress
  if (force) {
    try {
      await progressRef.delete();
    } catch (err) {
      logWithCorrelation('warn', 'Exception swallowed', correlationId, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  const classType = userData.classType || 'GLOBAL';

  // Tutorial questions — teach the class mechanics
  const TRIAL_QUESTIONS: Record<string, Array<{ id: string; stem: string; options: string[]; correctAnswer: number; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; topicId: string }>> = {
    JUGGERNAUT: [
      { id: 'trial_q_0', stem: 'What is the Juggernaut\'s primary combat role?', options: ['Healer', 'Tank / Vanguard', 'Speedster', 'Sniper'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'When does Juggernaut deal bonus damage?', options: ['When HP is below 25%', 'When HP is above 75%', 'On fast answers', 'On streaks'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does the "Iron Skin" skill provide?', options: ['+15% damage', '+15% armor', '+15% speed', '+15% crit chance'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What happens when Juggernaut\'s HP drops below 30% with "Unstoppable"?', options: ['Deal more damage', '+25% armor and +15% damage', 'Heal allies', 'Dodge attacks'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What is Juggernaut\'s ultimate "Colossus" best known for?', options: ['Dealing massive crit damage', 'Immunity to stun + heavy armor', 'Healing the party', 'Speed boosts'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    BERSERKER: [
      { id: 'trial_q_0', stem: 'What describes the Berserker\'s playstyle?', options: ['Safe and steady', 'High risk, high reward', 'Support and healing', 'Precision strikes'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'When does Berserker deal maximum damage?', options: ['At full HP', 'When HP is below 40%', 'On streaks', 'With fast answers'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Reckless Assault" trade for more damage?', options: ['Speed', 'Armor', 'HP', 'Crit chance'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What does "Execute" do?', options: ['Heals you', 'Bosses below 15% HP take +25% damage from you', 'Blocks boss attacks', 'Speeds up answers'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What is unique about "Rampage"?', options: ['It heals allies', '+35% damage and lifesteal when HP < 25%', 'It dodges attacks', 'It stuns the boss'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    SNIPER: [
      { id: 'trial_q_0', stem: 'What is the Sniper\'s specialty?', options: ['Healing', 'Streak mastery and precision', 'Raw endurance', 'Speed'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'When does Sniper deal bonus damage?', options: ['When HP is low', 'On streaks of 3+ correct answers', 'On wrong answers', 'At random'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Quick Draw" reward?', options: ['Slow, careful answers', 'Fast answers under 50% time', 'Wrong answers', 'Skipping questions'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What happens at a 5-answer streak with "Focus Fire"?', options: ['+25% crit chance', '+25% armor', 'Healing', 'Speed boost'], correctAnswer: 0, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What makes "One Shot" powerful?', options: ['First correct answer each attempt deals +50% damage', 'It heals you', 'It blocks damage', 'It speeds up time'], correctAnswer: 0, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    SPEEDSTER: [
      { id: 'trial_q_0', stem: 'What is the Speedster\'s specialty?', options: ['Heavy armor', 'Dodging and fast answers', 'Healing', 'Raw damage'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "Nimble" provide?', options: ['+20% dodge chance', '+20% damage', '+20% armor', '+20% healing'], correctAnswer: 0, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What bonus does "Haste" give on fast answers?', options: ['Only damage', '+15% damage AND +5 HP heal', 'Armor', 'Crit chance'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What happens after dodging with "Phase Shift"?', options: ['Nothing', 'Next answer gets +25% damage', 'You heal', 'Boss gets stunned'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What is "Time Warp" known for?', options: ['+50% dodge, fast answer damage, and speed', 'Healing', 'Armor', 'Stunning bosses'], correctAnswer: 0, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    GUARDIAN: [
      { id: 'trial_q_0', stem: 'What is the Guardian\'s primary role?', options: ['Solo damage dealer', 'Protecting allies', 'Healer', 'Speedster'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "Aegis" do for nearby allies?', options: ['Nothing', '+5% armor', '+20% damage', 'Healing'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Bulwark" reflect back to the boss?', options: ['10% damage', '10% healing', 'Nothing', 'Speed'], correctAnswer: 0, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'When does "Rescue" activate?', options: ['When you answer correctly', 'When an ally drops below 25% HP', 'At random', 'Never'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What makes "Immortal" unique?', options: ['It deals massive damage', 'Survive a lethal hit once per attempt at 1 HP', 'It heals allies', 'It speeds up answers'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    CLERIC: [
      { id: 'trial_q_0', stem: 'What is the Cleric\'s primary role?', options: ['Damage dealer', 'Healer and support', 'Tank', 'Speedster'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "First Aid" do?', options: ['Deals damage', 'Heals +5 HP on correct answers', 'Armor boost', 'Speed boost'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Inspiration" do for allies?', options: ['Nothing', 'Gives nearest ally +3% damage on correct answers', 'Heals them directly', 'Speeds them up'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What does "Sanctuary" do?', options: ['Heals only you', 'All party members heal +8 HP per correct answer', 'Damages the boss', 'Speed boost'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What triggers "Divine Intervention"?', options: ['Any correct answer', 'Once per attempt, fully heals all allies when any hits 0 HP', 'Randomly', 'Never'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    TACTICIAN: [
      { id: 'trial_q_0', stem: 'What is the Tactician\'s specialty?', options: ['Raw damage', 'Strategic debuffs and boss vulnerabilities', 'Healing', 'Speed'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "Scan Weakness" do?', options: ['Heals you', '+10% damage after boss phase transition', 'Armor boost', 'Speed boost'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'What does "Prepared Mind" improve?', options: ['Damage', 'Hint effectiveness by 15%', 'Armor', 'Speed'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What does "Vulnerability Scan" do for the party?', options: ['Nothing', 'All party +15% damage for 15s after you answer correctly', 'Heals party', 'Speeds up party'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What does "Checkmate" do when the boss is below 20% HP?', options: ['Nothing', 'All party +30% damage', 'Heals party', 'Stuns boss'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
    SCHOLAR: [
      { id: 'trial_q_0', stem: 'What is the Scholar\'s specialty?', options: ['Raw damage', 'Topic mastery and knowledge power', 'Healing', 'Speed'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_1', stem: 'What does "Deep Study" do?', options: ['+20% faster topic mastery advancement', '+20% damage', '+20% armor', '+20% speed'], correctAnswer: 0, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_2', stem: 'When does "Applied Knowledge" deal bonus damage?', options: ['Always', 'When topic mastery >= 0.6', 'On streaks', 'On fast answers'], correctAnswer: 1, difficulty: 'EASY', topicId: 'trial' },
      { id: 'trial_q_3', stem: 'What does "Cross-Domain" reward?', options: ['Nothing', 'Skills from 2+ trees unlocked: +10% all damage', 'Armor', 'Healing'], correctAnswer: 1, difficulty: 'MEDIUM', topicId: 'trial' },
      { id: 'trial_q_4', stem: 'What does "Omniscient" raise?', options: ['All topic mastery caps', 'Only damage', 'Only armor', 'Only speed'], correctAnswer: 0, difficulty: 'MEDIUM', topicId: 'trial' },
    ],
  };

  const questions = TRIAL_QUESTIONS[specializationId] || TRIAL_QUESTIONS['JUGGERNAUT'];

  // Create trial boss event
  const trialBoss = {
    id: trialEventId,
    mode: 'QUIZ',
    bossName: `${specializationId} Tutorial`,
    description: `Learn how to play the ${specializationId} specialization. Answer the tutorial questions to unlock this class.`,
    maxHp: 50,
    currentHp: 50,
    scaledMaxHp: 50,
    classType,
    isActive: true,
    deadline: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    questions,
    damagePerCorrect: 10,
    rewards: { xp: 25, flux: 5 },
    modifiers: [],
    phases: [{ name: 'Tutorial', hpThreshold: 100, modifiers: [], dialogue: 'Learn your class.' }],
    currentPhase: 0,
    participantCount: 0,
    createdAt: new Date().toISOString(),
    isTrial: true,
    trialSpecializationId: specializationId,
  };

  await trialRef.set(trialBoss);

  // Initialize progress
  await progressRef.set({
    userId: uid,
    eventId: trialEventId,
    attempts: [],
    totalDamageDealt: 0,
    participationMet: false,
    rewardClaimed: false,
  });

  return { trialEventId, message: `Tutorial started! Answer the questions to learn the ${specializationId} specialization and unlock it.` };
});

export const completeSpecializationTrial = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const uid = verifyAuth(request.auth);
  generateCorrelationId();
  const { trialEventId } = request.data;
  if (!trialEventId) {
    throw new HttpsError("invalid-argument", "Trial event ID required.");
  }

  const db = admin.firestore();
  const trialRef = db.doc(`boss_events/${trialEventId}`);
  const progressRef = db.doc(`boss_event_progress/${uid}_${trialEventId}`);
  const userRef = db.doc(`users/${uid}`);

  const [trialSnap, progressSnap, userSnap] = await Promise.all([
    trialRef.get(), progressRef.get(), userRef.get(),
  ]);

  if (!trialSnap.exists) throw new HttpsError("not-found", "Trial not found.");
  if (!progressSnap.exists) throw new HttpsError("not-found", "Progress not found.");
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const trial = trialSnap.data()!;
  const progress = progressSnap.data()!;
  const userData = userSnap.data()!;

  // Verify this is a trial
  if (!trial.isTrial || !trial.trialSpecializationId) {
    throw new HttpsError("failed-precondition", "Not a valid trial.");
  }

  const specId = trial.trialSpecializationId;

  // Evaluate trial results
  const attempts = progress.attempts || [];
  const bestAttempt = attempts.reduce((best: Record<string, unknown> | null, a: Record<string, unknown>) => {
    if (!best) return a;
    const bestCorrect = (best.combatStats as Record<string, unknown>)?.questionsCorrect as number || 0;
    const aCorrect = (a.combatStats as Record<string, unknown>)?.questionsCorrect as number || 0;
    return aCorrect > bestCorrect ? a : best;
  }, null);

  const stats = bestAttempt?.combatStats as Record<string, unknown> | undefined;
  const correct = stats?.questionsCorrect as number || 0;
  const attempted = stats?.questionsAttempted as number || 0;
  const accuracy = attempted > 0 ? correct / attempted : 0;
  const survived = (bestAttempt?.currentHp as number || 0) > 0;

  // Pass criteria: at least 3 correct out of 5, and survived
  const passed = correct >= 3 && survived;

  // Mark trial as evaluated but keep it active so the user can see the result
  // and choose whether to commit or decline.
  await trialRef.update({
    trialPassed: passed,
    trialCompletedAt: new Date().toISOString(),
  });

  // If user already has a specialization, deactivate this trial immediately
  // since they cannot commit to another one.
  if (userData.gamification?.specialization) {
    await trialRef.update({ isActive: false });
    return {
      success: false,
      passed: false,
      message: "You already have a specialization.",
      stats: { correct, attempted, accuracy: Math.round(accuracy * 100) },
    };
  }

  if (passed) {
    return {
      success: true,
      passed: true,
      specializationId: specId,
      message: `You passed the ${specId} tutorial! Confirm below to commit to this specialization.`,
      stats: { correct, attempted, accuracy: Math.round(accuracy * 100) },
    };
  }

  return {
    success: false,
    passed: false,
    message: "Tutorial complete — you didn't pass this time. Review the class skills and try again!",
    stats: { correct, attempted, accuracy: Math.round(accuracy * 100) },
  };
});

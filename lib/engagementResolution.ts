/**
 * Engagement resolution — server-trusted timing for student sessions.
 *
 * BACKGROUND (2026-11-12)
 * -----------------------
 * Engagement time used to be clamped against a SINGLE session token's
 * `startedAt`:
 *
 *     engagementTime = min(clientReported, serverElapsed + 5)
 *
 * Three paths mint a NEW token mid-session, each with a fresh `startedAt`
 * (see functions/src/assessment.ts and components/Proctor.tsx):
 *
 *   1. submit-retry  — callStartAssessmentSession({ forceNew: true })
 *   2. handleFreshStart — fresh mount with a dirty localStorage draft
 *   3. idle-stale    — token idle past MAX_SESSION_IDLE_MS is treated as stale
 *
 * Each one reset the clock to ~0 while the student's client timer kept
 * counting from the original mount. The clamp then collapsed a genuine
 * 4000 s session to ~5-7 s, and because the clamped value also drove the XP
 * award, real work earned nothing. 28 of 114 historical rows were damaged
 * this way, 25 of them landing in a tell-tale 5-7.2 s band.
 *
 * FIX
 * ---
 * Never clamp against a single token. Clamp against the EARLIEST server-minted
 * start for the same (userId, resourceId) inside the 4 h ceiling — a token
 * refresh does not erase the earlier session document, so the original start
 * survives churn. Reported time and XP are then decoupled:
 *
 *   engagementTime  what a teacher sees — the best estimate, never silently
 *                   truncated, always labelled with its provenance
 *   xpBasisSeconds  what earns XP — server-verified seconds only
 *
 * Rationale for the split: under-reporting makes a teacher wrongly conclude a
 * student did not work (documented incident, and the student cannot contest a
 * number they cannot see), while undeserved XP is cosmetic and reversible. The
 * asymmetry flips for XP because XP is the only thing worth attacking.
 *
 * NOTE: a client-supplied start time is NEVER used as an anchor. Doing so would
 * let a forged `startTime` plus a deliberate not-found produce a "server"
 * clock that agrees with the forgery.
 */

/** Maximum plausible single-session engagement (4 hours). */
export const HARD_CAP_SECONDS = 14400;

/** Grace added to a server-observed span before it is considered exceeded. */
export const CLAMP_GRACE_SECONDS = 5;

/** A claim counts as corroborated when verified >= client * this ratio. */
export const CORROBORATION_RATIO = 0.95;

export type TimeSource =
  /** The submitted token's own startedAt corroborates the claim (normal path). */
  | "token"
  /** An earlier session doc for this student+resource corroborates the claim. */
  | "anchor"
  /** No server timestamp corroborates the claim — anomaly, must be alerted on. */
  | "unverified";

export interface EngagementResolution {
  /** Raw client claim, capped at the 4 h ceiling. */
  clientReportedSeconds: number;
  /** Seconds the server can actually stand behind. */
  verifiedSeconds: number;
  /** What the teacher sees. Equals the client claim; provenance is labelled. */
  engagementTime: number;
  /** Provenance of the reported figure. */
  timeSource: TimeSource;
  /** Seconds that earn XP. Always the verified figure. */
  xpBasisSeconds: number;
  /** Server-observed span in seconds (0 when nothing corroborates). */
  serverSpanSeconds: number;
}

export interface ResolveEngagementInput {
  /** Client-reported engagement in seconds (already the validated value). */
  clientReportedSeconds: number;
  /** startedAt of the token supplied with this submission, if the doc exists. */
  tokenStartedAtMs?: number | null;
  /** Earliest startedAt for this (userId, resourceId) inside the lookback. */
  anchorStartedAtMs?: number | null;
  /** Server "now". Injected so the policy is testable without a clock. */
  nowMs: number;
}

/**
 * Pure resolution policy. No Firestore, no clock — callers supply the facts.
 *
 * The earliest of {token start, anchor start} wins: a stale token handed back
 * to us must never make the session look shorter than it was.
 */
export function resolveEngagement(input: ResolveEngagementInput): EngagementResolution {
  const { clientReportedSeconds, tokenStartedAtMs, anchorStartedAtMs, nowMs } = input;

  const client = Math.min(
    Math.max(0, Number.isFinite(clientReportedSeconds) ? clientReportedSeconds : 0),
    HARD_CAP_SECONDS,
  );

  const candidates = [tokenStartedAtMs, anchorStartedAtMs]
    .filter(
      (v): v is number =>
        typeof v === "number" && Number.isFinite(v) && v > 0 && v <= nowMs,
    );
  const startMs = candidates.length > 0 ? Math.min(...candidates) : null;

  // A future-dated start is not an anchor — it cannot corroborate anything and
  // must not be rescued by the grace window. Treat it as absent.
  const serverSpan = startMs === null ? 0 : Math.max(0, (nowMs - startMs) / 1000);

  const hasServerAnchor = startMs !== null;
  const verified = hasServerAnchor
    ? Math.min(client, serverSpan + CLAMP_GRACE_SECONDS)
    : 0;

  const corroborated = hasServerAnchor && verified >= client * CORROBORATION_RATIO;

  let timeSource: TimeSource;
  if (!corroborated) {
    timeSource = "unverified";
  } else if (
    typeof tokenStartedAtMs === "number" &&
    Number.isFinite(tokenStartedAtMs) &&
    tokenStartedAtMs <= (anchorStartedAtMs ?? Infinity)
  ) {
    timeSource = "token";
  } else {
    timeSource = "anchor";
  }

  return {
    clientReportedSeconds: client,
    verifiedSeconds: verified,
    engagementTime: client,
    timeSource,
    xpBasisSeconds: verified,
    serverSpanSeconds: serverSpan,
  };
}

/**
 * True when a stored row disagrees with its own client report — the signature
 * of the clock-reset bug this module exists to prevent. Used by the daily
 * invariant check; the expected count is zero.
 */
export function isReportedTimeInconsistent(
  engagementTime: number,
  clientReported: number,
  timeSource: TimeSource | undefined,
): boolean {
  if (timeSource === "unverified") return false; // honest divergence, labelled
  if (!Number.isFinite(clientReported) || clientReported <= 0) return false;
  return engagementTime / clientReported < CORROBORATION_RATIO;
}

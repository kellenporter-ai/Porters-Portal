/**
 * Daily engagement rollup — server-credited time, captured from heartbeats.
 *
 * WHY THIS EXISTS
 * ---------------
 * Engagement time used to be known only at the END of a session, computed from
 * a single client-reported number clamped against one token. When the session
 * doc was lost, swept, or churned, the duration was lost with it — and for
 * sessions that never produced a submission (most reading work), no duration
 * was recorded anywhere at all.
 *
 * A heartbeat is the only place duration can be measured incrementally while
 * the student is actually present. Crediting each interval to a per-day doc
 * server-side means a crash, a closed tab, or a swept token costs at most one
 * heartbeat interval instead of the whole session.
 *
 * DESIGN RULES
 * ------------
 * 1. Server-credited only. The client never sends a duration; it sends "I am
 *    here". The server computes the delta from the previous heartbeat it
 *    recorded and caps it, so a spammed heartbeat earns nothing extra.
 * 2. One doc per (userId, LOCAL day). The day is keyed in the school's timezone
 *    (America/New_York) because a report row that says "Tuesday" must mean the
 *    Tuesday the teacher experienced, not a UTC boundary.
 * 3. Per-tab dedupe, cross-tab safety. The delta is computed inside a
 *    transaction against the same doc, so two tabs cannot both claim the same
 *    wall-clock seconds.
 * 4. Separate from `submissions`. This collection records presence-seconds; a
 *    submission records a completed session. Neither is derived from the other.
 */

import * as admin from "firebase-admin";

/** Longest interval a single heartbeat may credit, in seconds. */
export const MAX_CREDIT_PER_HEARTBEAT_SEC = 90;

/** Heartbeats closer together than this credit nothing (dedupe/debounce). */
export const MIN_CREDIT_INTERVAL_SEC = 5;

/** Hard ceiling per student-day, in seconds (16 hours). */
export const MAX_DAILY_CREDIT_SEC = 16 * 60 * 60;

const SCHOOL_TZ = "America/New_York";

/**
 * Local calendar date (YYYY-MM-DD) for a moment, in the school's timezone.
 * Uses Intl so DST transitions are handled by the platform, not by hand.
 */
export function localDayKey(date: Date, timeZone: string = SCHOOL_TZ): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface CreditResult {
  dayKey: string;
  creditedSeconds: number;
  totalSeconds: number;
  /** False when the heartbeat was too soon or the day is capped. */
  credited: boolean;
  reason?: "too_soon" | "capped" | "no_prior";
}

/**
 * Credits presence-seconds to a student's local-day rollup.
 *
 * @param lastHeartbeatMs server-recorded time of the previous heartbeat for
 *        this session (NOT a client value). When absent, this heartbeat only
 *        establishes a baseline and credits nothing — an interval cannot be
 *        proven without a prior server timestamp to measure from.
 */
export async function creditEngagement(
  db: FirebaseFirestore.Firestore,
  uid: string,
  localDay: string,
  lastHeartbeatMs: number | null,
  nowMs: number,
  context: { assignmentId?: string; classType?: string; source?: string } = {},
): Promise<CreditResult> {
  const docId = `${uid}_${localDay}`;
  const ref = db.collection("engagement_daily").doc(docId);

  if (lastHeartbeatMs === null) {
    // Establish a baseline without crediting: we cannot know how long the
    // student was present before this first server observation.
    await ref.set(
      {
        userId: uid,
        localDay,
        lastObservedAt: admin.firestore.Timestamp.fromMillis(nowMs),
        ...(context.assignmentId ? { lastAssignmentId: context.assignmentId } : {}),
        ...(context.classType ? { classType: context.classType } : {}),
        source: context.source || "heartbeat",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { dayKey: localDay, creditedSeconds: 0, totalSeconds: 0, credited: false, reason: "no_prior" };
  }

  const rawDeltaSec = Math.max(0, (nowMs - lastHeartbeatMs) / 1000);
  if (rawDeltaSec < MIN_CREDIT_INTERVAL_SEC) {
    return { dayKey: localDay, creditedSeconds: 0, totalSeconds: 0, credited: false, reason: "too_soon" };
  }
  // Cap so a student who leaves a tab open and returns hours later is credited
  // only for one plausible heartbeat interval, not the whole absence.
  const creditSec = Math.min(rawDeltaSec, MAX_CREDIT_PER_HEARTBEAT_SEC);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data()! : null;
    const current = Number(existing?.creditedSeconds) || 0;
    const remaining = MAX_DAILY_CREDIT_SEC - current;
    if (remaining <= 0) {
      tx.set(ref, { lastObservedAt: admin.firestore.Timestamp.fromMillis(nowMs) }, { merge: true });
      return { creditedSeconds: 0, totalSeconds: current, credited: false, reason: "capped" as const };
    }
    const granted = Math.min(creditSec, remaining);
    tx.set(
      ref,
      {
        userId: uid,
        localDay,
        creditedSeconds: admin.firestore.FieldValue.increment(granted),
        heartbeatCount: admin.firestore.FieldValue.increment(1),
        firstObservedAt: existing?.firstObservedAt ?? admin.firestore.Timestamp.fromMillis(nowMs),
        lastObservedAt: admin.firestore.Timestamp.fromMillis(nowMs),
        ...(context.assignmentId ? { lastAssignmentId: context.assignmentId } : {}),
        ...(context.classType ? { classType: context.classType } : {}),
        source: context.source || "heartbeat",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { creditedSeconds: granted, totalSeconds: current + granted, credited: granted > 0 };
  });

  return { dayKey: localDay, ...result };
}

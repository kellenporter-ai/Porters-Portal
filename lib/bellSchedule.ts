/**
 * Bell schedule definitions + the live-schedule resolution rules.
 *
 * Single source of truth for:
 *   - the period tables for every schedule type
 *   - which schedule is "live" right now
 *   - the timekeeper state machine (in period / passing / before / after)
 *
 * Consumers:
 *   - components/dashboard/HomeTab.tsx  (homepage banner, live clock)
 *   - public/schedule.html              (standalone page — reads the same rules via
 *                                        its own copy; lib/bellSchedule.parity.test.ts
 *                                        guards the two against drift)
 *
 * WHY THERE IS AN OVERRIDE DOC
 * ----------------------------
 * Homeroom Hold can be called at random, at any time, by the office. A baked-in
 * date table cannot express "it is happening right now because a human said so".
 * So the live schedule is: an admin-settable override for TODAY, falling back to
 * the regular schedule. The override expires at midnight, so a forgotten switch
 * can never bleed into the next school day.
 */

export interface BellPeriod {
  name: string;
  /** 24-hour "HH:MM", local time. */
  start: string;
  /** 24-hour "HH:MM", local time. */
  end: string;
}

export interface BellSchedule {
  id: BellScheduleId;
  label: string;
  shortLabel: string;
  /** Theme accent token understood by both consumers. */
  accent: 'slate' | 'rose' | 'blue' | 'amber';
  periods: BellPeriod[];
}

export type BellScheduleId =
  | 'regular'
  | 'homeroom-hold'
  | 'early-dismissal'
  | 'evening-conferences'
  | 'two-hour-delay';

/**
 * The four schedule types. Period lengths are DERIVED from start/end everywhere,
 * so a typo cannot desync a table from the timekeeper.
 *
 * `regular` is the default whenever no override is set for today.
 */
export const BELL_SCHEDULES: Record<BellScheduleId, BellSchedule> = {
  regular: {
    id: 'regular',
    label: 'Regular Bell Schedule',
    shortLabel: 'Regular',
    accent: 'slate',
    periods: [
      { name: 'Period 1', start: '08:00', end: '08:42' },
      { name: 'Period 2', start: '08:46', end: '09:28' },
      { name: 'Homeroom', start: '09:28', end: '09:39' },
      { name: 'Period 3', start: '09:43', end: '10:25' },
      { name: 'Period 4', start: '10:29', end: '11:11' },
      { name: 'Period 5', start: '11:15', end: '11:57' },
      { name: 'Period 6', start: '12:01', end: '12:43' },
      { name: 'Period 7', start: '12:47', end: '13:29' },
      { name: 'Period 8', start: '13:33', end: '14:15' },
      { name: 'Period 9', start: '14:19', end: '15:01' },
    ],
  },
  'homeroom-hold': {
    id: 'homeroom-hold',
    label: 'Homeroom Hold Schedule',
    shortLabel: 'Homeroom Hold',
    accent: 'amber',
    periods: [
      // 0-minute gap after Period 2: the hold begins the moment P2 ends.
      { name: 'Period 1', start: '08:00', end: '08:39' },
      { name: 'Period 2', start: '08:43', end: '09:22' },
      { name: 'Homeroom', start: '09:22', end: '10:02' },
      { name: 'Period 3', start: '10:06', end: '10:45' },
      { name: 'Period 4', start: '10:49', end: '11:28' },
      { name: 'Period 5', start: '11:32', end: '12:11' },
      { name: 'Period 6', start: '12:15', end: '12:53' },
      { name: 'Period 7', start: '12:57', end: '13:35' },
      { name: 'Period 8', start: '13:39', end: '14:18' },
      { name: 'Period 9', start: '14:22', end: '15:01' },
    ],
  },
  'early-dismissal': {
    id: 'early-dismissal',
    label: 'Early Dismissal Schedule',
    shortLabel: 'Early Dismissal',
    accent: 'rose',
    periods: [
      { name: 'Period 1', start: '08:00', end: '08:30' },
      { name: 'Period 2', start: '08:34', end: '09:04' },
      { name: 'Homeroom', start: '09:04', end: '09:12' },
      { name: 'Period 3', start: '09:16', end: '09:46' },
      { name: 'Period 4', start: '09:50', end: '10:20' },
      { name: 'Period 5', start: '10:24', end: '10:54' },
      { name: 'Period 6', start: '10:58', end: '11:28' },
      { name: 'Period 7', start: '11:32', end: '12:02' },
      { name: 'Period 8', start: '12:06', end: '12:36' },
      { name: 'Period 9', start: '12:40', end: '13:10' },
    ],
  },
  'evening-conferences': {
    id: 'evening-conferences',
    label: 'Early Dismissal — Evening Conferences',
    shortLabel: 'Evening Conferences',
    accent: 'blue',
    // 32-minute periods, homeroom 10 min, dismisses 1:30 PM. Conferences run
    // 6:00–7:30 p.m. Same bell pattern the district uses for conference days.
    periods: [
      { name: 'Period 1', start: '08:00', end: '08:32' },
      { name: 'Period 2', start: '08:36', end: '09:08' },
      { name: 'Homeroom', start: '09:08', end: '09:18' },
      { name: 'Period 3', start: '09:22', end: '09:54' },
      { name: 'Period 4', start: '09:58', end: '10:30' },
      { name: 'Period 5', start: '10:34', end: '11:06' },
      { name: 'Period 6', start: '11:10', end: '11:42' },
      { name: 'Period 7', start: '11:46', end: '12:18' },
      { name: 'Period 8', start: '12:22', end: '12:54' },
      { name: 'Period 9', start: '12:58', end: '13:30' },
    ],
  },
  'two-hour-delay': {
    id: 'two-hour-delay',
    label: 'Two-Hour Delay Schedule',
    shortLabel: 'Two-Hour Delay',
    accent: 'blue',
    // NOT YET SUPPLIED by the school. Empty periods make the UI render an honest
    // "not posted yet" state rather than inventing times. Fill this in when the
    // district publishes the delay schedule; nothing else needs to change.
    periods: [],
  },
};

export const DEFAULT_SCHEDULE_ID: BellScheduleId = 'regular';

/** Ordered list for admin pickers. */
export const SCHEDULE_ORDER: BellScheduleId[] = [
  'regular',
  'homeroom-hold',
  'early-dismissal',
  'evening-conferences',
  'two-hour-delay',
];

export function getSchedule(id: BellScheduleId | null | undefined): BellSchedule {
  if (id && BELL_SCHEDULES[id]) return BELL_SCHEDULES[id];
  return BELL_SCHEDULES[DEFAULT_SCHEDULE_ID];
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n;
}

/** Local-time date key "YYYY-MM-DD". Never toISOString — that is UTC. */
export function scheduleDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "HH:MM" → seconds since local midnight. */
export function hhmmToSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return ((parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0)) * 60;
}

/** "HH:MM" → "8:00 AM". */
export function to12h(hhmm: string): string {
  const total = hhmmToSeconds(hhmm);
  const h = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(mm)} ${suffix}`;
}

/** Whole minutes between two "HH:MM" strings. */
export function minutesBetween(start: string, end: string): number {
  return Math.round((hhmmToSeconds(end) - hhmmToSeconds(start)) / 60);
}

// ─── The override document ────────────────────────────────────────────────────

/**
 * The shape of `config/bell_schedule` in Firestore.
 *
 * `dateKey` is the guard: an override only applies on the day it was set. If
 * yesterday's document is still sitting there, it is ignored — the regular
 * schedule takes over. This is what makes "auto-reset to Regular daily" work
 * without needing a scheduled Cloud Function to clear it.
 */
export interface BellScheduleOverride {
  /** "YYYY-MM-DD" the override applies to. */
  dateKey: string;
  /** Which schedule is live on that date. */
  scheduleId: BellScheduleId;
  /** Admin uid — audit trail only, never shown to students. */
  setBy?: string;
  /** ISO timestamp — audit trail only. */
  setAt?: string;
}

/**
 * Resolve which schedule is live right now.
 *
 * Rules:
 *   1. An override whose dateKey matches today wins.
 *   2. Anything else — no doc, a stale doc from a previous day, or a doc naming
 *      an unknown schedule — falls back to the regular schedule.
 *
 * Note this never returns null: the regular schedule is always a valid answer.
 * A missing/empty period list is a *rendering* concern (the "not posted yet"
 * state), not a resolution concern.
 */
export function resolveLiveSchedule(
  now: Date,
  override: BellScheduleOverride | null | undefined,
): { schedule: BellSchedule; source: 'override' | 'default'; override?: BellScheduleOverride } {
  const todayKey = scheduleDateKey(now);
  if (override && override.dateKey === todayKey) {
    const schedule = BELL_SCHEDULES[override.scheduleId];
    if (schedule) return { schedule, source: 'override', override };
    // Unknown id — fall through to the default rather than showing nothing.
  }
  return { schedule: BELL_SCHEDULES[DEFAULT_SCHEDULE_ID], source: 'default' };
}

// ─── Timekeeper state machine ─────────────────────────────────────────────────

export type SchedulePhase =
  | { kind: 'empty' }
  | { kind: 'before'; next: BellPeriod; remainingSec: number }
  | { kind: 'in'; period: BellPeriod; next: BellPeriod | null; remainingSec: number; elapsedSec: number; totalSec: number }
  | { kind: 'passing'; prev: BellPeriod; next: BellPeriod; remainingSec: number; elapsedSec: number; windowSec: number }
  | { kind: 'after'; dismissedAt: string };

/**
 * Compute the timekeeper phase for a schedule at a moment in time.
 *
 * Passing windows are DERIVED from consecutive rows — never stored. That is why
 * the schedule tables carry no explicit "passing period" rows: the 4-minute gap
 * between Period 1 ending at 08:42 and Period 2 starting at 08:46 *is* the
 * passing period, and it stays correct if a row's times are ever edited.
 */
export function computeSchedulePhase(schedule: BellSchedule | null, now: Date): SchedulePhase {
  if (!schedule || schedule.periods.length === 0) return { kind: 'empty' };

  const periods = schedule.periods;
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
  const firstStart = hhmmToSeconds(periods[0].start);
  const lastEnd = hhmmToSeconds(periods[periods.length - 1].end);

  if (nowSec < firstStart) {
    return { kind: 'before', next: periods[0], remainingSec: firstStart - nowSec };
  }
  if (nowSec >= lastEnd) {
    return { kind: 'after', dismissedAt: periods[periods.length - 1].end };
  }

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const pStart = hhmmToSeconds(p.start);
    const pEnd = hhmmToSeconds(p.end);

    if (nowSec >= pStart && nowSec < pEnd) {
      return {
        kind: 'in',
        period: p,
        next: periods[i + 1] ?? null,
        remainingSec: pEnd - nowSec,
        elapsedSec: nowSec - pStart,
        totalSec: pEnd - pStart,
      };
    }

    const next = periods[i + 1];
    if (next) {
      const nStart = hhmmToSeconds(next.start);
      if (nowSec >= pEnd && nowSec < nStart) {
        return {
          kind: 'passing',
          prev: p,
          next,
          remainingSec: nStart - nowSec,
          elapsedSec: nowSec - pEnd,
          windowSec: nStart - pEnd,
        };
      }
    }
  }

  // Unreachable when periods are ordered and non-overlapping; treat as done.
  return { kind: 'after', dismissedAt: periods[periods.length - 1].end };
}

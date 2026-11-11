import { describe, it, expect } from 'vitest';
import {
  BELL_SCHEDULES,
  DEFAULT_SCHEDULE_ID,
  SCHEDULE_ORDER,
  computeSchedulePhase,
  getSchedule,
  resolveLiveSchedule,
  scheduleDateKey,
  minutesBetween,
  to12h,
} from '../bellSchedule';

const at = (iso: string) => new Date(iso);

describe('bell schedule period tables', () => {
  it('every schedule has ordered, non-overlapping periods', () => {
    for (const id of SCHEDULE_ORDER) {
      const s = BELL_SCHEDULES[id];
      for (let i = 1; i < s.periods.length; i++) {
        const prevEnd = s.periods[i - 1].end;
        const start = s.periods[i].start;
        expect(
          start >= prevEnd,
          `${id}: ${s.periods[i].name} starts ${start} before ${s.periods[i - 1].name} ends ${prevEnd}`,
        ).toBe(true);
      }
    }
  });

  it('the three published schedules carry 10 periods each', () => {
    expect(BELL_SCHEDULES.regular.periods).toHaveLength(10);
    expect(BELL_SCHEDULES['homeroom-hold'].periods).toHaveLength(10);
    expect(BELL_SCHEDULES['early-dismissal'].periods).toHaveLength(10);
  });

  it('period lengths match the published tables', () => {
    expect(minutesBetween('08:00', '08:42')).toBe(42); // regular P1
    expect(minutesBetween('09:28', '09:39')).toBe(11); // regular homeroom
    expect(minutesBetween('09:22', '10:02')).toBe(40); // homeroom hold
    expect(minutesBetween('08:00', '08:30')).toBe(30); // early dismissal P1
  });

  it('two-hour-delay is declared but not posted, so the UI can say so honestly', () => {
    expect(BELL_SCHEDULES['two-hour-delay'].periods).toEqual([]);
  });
});

describe('resolveLiveSchedule — the override contract', () => {
  const now = at('2026-11-11T09:30:00');
  const todayKey = scheduleDateKey(now);

  it('falls back to Regular with no override', () => {
    const r = resolveLiveSchedule(now, null);
    expect(r.schedule.id).toBe(DEFAULT_SCHEDULE_ID);
    expect(r.source).toBe('default');
  });

  it("an override for TODAY wins", () => {
    const r = resolveLiveSchedule(now, { dateKey: todayKey, scheduleId: 'homeroom-hold' });
    expect(r.schedule.id).toBe('homeroom-hold');
    expect(r.source).toBe('override');
  });

  it("YESTERDAY's override is ignored — this is what makes the daily auto-reset work", () => {
    const r = resolveLiveSchedule(now, { dateKey: '2026-11-10', scheduleId: 'homeroom-hold' });
    expect(r.schedule.id).toBe(DEFAULT_SCHEDULE_ID);
    expect(r.source).toBe('default');
  });

  it("TOMORROW's override does not leak backwards", () => {
    const r = resolveLiveSchedule(now, { dateKey: '2026-11-12', scheduleId: 'early-dismissal' });
    expect(r.schedule.id).toBe(DEFAULT_SCHEDULE_ID);
  });

  it('an unknown schedule id falls back rather than rendering nothing', () => {
    const r = resolveLiveSchedule(now, {
      dateKey: todayKey,
      scheduleId: 'does-not-exist' as never,
    });
    expect(r.schedule.id).toBe(DEFAULT_SCHEDULE_ID);
    expect(r.source).toBe('default');
  });

  it('the regular schedule is never null, even with no override and no doc', () => {
    expect(resolveLiveSchedule(now, undefined).schedule).toBeTruthy();
  });

  it('getSchedule tolerates junk input', () => {
    expect(getSchedule(null).id).toBe(DEFAULT_SCHEDULE_ID);
    expect(getSchedule(undefined).id).toBe(DEFAULT_SCHEDULE_ID);
    expect(getSchedule('bogus' as never).id).toBe(DEFAULT_SCHEDULE_ID);
  });
});

describe('computeSchedulePhase — the timekeeper', () => {
  const S = BELL_SCHEDULES['homeroom-hold'];

  it('reports BEFORE SCHOOL before the first bell', () => {
    const p = computeSchedulePhase(S, at('2026-11-11T07:40:00'));
    expect(p.kind).toBe('before');
    if (p.kind === 'before') expect(p.next.name).toBe('Period 1');
  });

  it('reports IN PERIOD with a correct countdown', () => {
    // Homeroom Hold: Period 4 = 10:49–11:28, so 11:00 leaves 28 min.
    const p = computeSchedulePhase(S, at('2026-11-11T11:00:00'));
    expect(p.kind).toBe('in');
    if (p.kind === 'in') {
      expect(p.period.name).toBe('Period 4');
      expect(Math.round(p.remainingSec)).toBe(28 * 60);
      expect(p.next?.name).toBe('Period 5');
    }
  });

  it('derives the passing window from consecutive rows', () => {
    // Period 4 ends 11:28, Period 5 starts 11:32 → a 4-minute pass.
    const p = computeSchedulePhase(S, at('2026-11-11T11:30:00'));
    expect(p.kind).toBe('passing');
    if (p.kind === 'passing') {
      expect(p.prev.name).toBe('Period 4');
      expect(p.next.name).toBe('Period 5');
      expect(p.windowSec).toBe(4 * 60);
      expect(Math.round(p.remainingSec)).toBe(2 * 60);
    }
  });

  it('handles a zero-length gap without inventing a passing period', () => {
    // Period 2 ends 09:22, Homeroom starts 09:22 — no gap to show.
    const p = computeSchedulePhase(S, at('2026-11-11T09:21:30'));
    expect(p.kind).toBe('in');
    if (p.kind === 'in') expect(p.period.name).toBe('Period 2');
  });

  it('reports AFTER SCHOOL once the last bell has gone', () => {
    const p = computeSchedulePhase(S, at('2026-11-11T15:30:00'));
    expect(p.kind).toBe('after');
    if (p.kind === 'after') expect(p.dismissedAt).toBe('15:01');
  });

  it('reports EMPTY for a schedule with no posted periods', () => {
    const p = computeSchedulePhase(BELL_SCHEDULES['two-hour-delay'], at('2026-11-11T10:00:00'));
    expect(p.kind).toBe('empty');
  });

  it('reports EMPTY for null', () => {
    expect(computeSchedulePhase(null, at('2026-11-11T10:00:00')).kind).toBe('empty');
  });

  it('the boundary between periods belongs to the incoming period', () => {
    // Exactly 11:28 → the pass has begun, Period 4 is over.
    const p = computeSchedulePhase(S, at('2026-11-11T11:28:00'));
    expect(p.kind).toBe('passing');
  });
});

describe('time formatting', () => {
  it('renders 12-hour times with correct noon/midnight handling', () => {
    expect(to12h('08:00')).toBe('8:00 AM');
    expect(to12h('12:00')).toBe('12:00 PM');
    expect(to12h('00:30')).toBe('12:30 AM');
    expect(to12h('13:10')).toBe('1:10 PM');
  });
});

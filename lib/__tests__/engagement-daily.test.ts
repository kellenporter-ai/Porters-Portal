import { describe, it, expect } from 'vitest';

// Rules for server-credited presence time. The credit function itself needs
// Firestore, so the DECISION rules are pinned here as pure functions and
// mirrored from functions/src/engagement-daily.ts. Any drift is a bug.
//
// Why these rules exist: engagement was previously known only at session close,
// computed from one client-reported number. When the session token was lost or
// churned, the duration vanished with it. Crediting increments server-side
// means a crash costs one heartbeat interval, not the whole session — but only
// if the caps are right, otherwise an open tab farms unlimited time.

const MAX_CREDIT_PER_HEARTBEAT_SEC = 90;
const MIN_CREDIT_INTERVAL_SEC = 5;
const MAX_DAILY_CREDIT_SEC = 16 * 60 * 60;

interface CreditInput {
  lastHeartbeatMs: number | null;
  nowMs: number;
  currentDailySeconds: number;
}

interface CreditDecision {
  creditedSeconds: number;
  reason?: 'too_soon' | 'capped' | 'no_prior';
}

/** Mirrors the decision half of creditEngagement(). */
function decideCredit({ lastHeartbeatMs, nowMs, currentDailySeconds }: CreditInput): CreditDecision {
  if (lastHeartbeatMs === null) return { creditedSeconds: 0, reason: 'no_prior' };

  const rawDeltaSec = Math.max(0, (nowMs - lastHeartbeatMs) / 1000);
  if (rawDeltaSec < MIN_CREDIT_INTERVAL_SEC) return { creditedSeconds: 0, reason: 'too_soon' };

  const creditSec = Math.min(rawDeltaSec, MAX_CREDIT_PER_HEARTBEAT_SEC);
  const remaining = MAX_DAILY_CREDIT_SEC - currentDailySeconds;
  if (remaining <= 0) return { creditedSeconds: 0, reason: 'capped' };

  return { creditedSeconds: Math.min(creditSec, remaining) };
}

/** Mirrors localDayKey() — day keyed in the school's timezone, not UTC. */
function localDayKey(date: Date, timeZone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const NOW = 1_700_000_000_000;
const agoSec = (s: number) => NOW - s * 1000;

describe('credit decision — normal operation', () => {
  it('credits a standard 30s heartbeat interval', () => {
    const d = decideCredit({ lastHeartbeatMs: agoSec(30), nowMs: NOW, currentDailySeconds: 0 });
    expect(d.creditedSeconds).toBe(30);
  });

  it('establishes a baseline without crediting on the first heartbeat', () => {
    const d = decideCredit({ lastHeartbeatMs: null, nowMs: NOW, currentDailySeconds: 0 });
    expect(d.creditedSeconds).toBe(0);
    expect(d.reason).toBe('no_prior');
  });

  it('ignores heartbeats that arrive too close together', () => {
    const d = decideCredit({ lastHeartbeatMs: agoSec(2), nowMs: NOW, currentDailySeconds: 0 });
    expect(d.creditedSeconds).toBe(0);
    expect(d.reason).toBe('too_soon');
  });
});

describe('credit decision — anti-farming', () => {
  it('caps a long absence at one heartbeat interval, not the whole gap', () => {
    // Student leaves a tab open for 3 hours, then the browser fires once.
    const d = decideCredit({ lastHeartbeatMs: agoSec(3 * 3600), nowMs: NOW, currentDailySeconds: 0 });
    expect(d.creditedSeconds).toBe(MAX_CREDIT_PER_HEARTBEAT_SEC);
    expect(d.creditedSeconds).toBeLessThan(3 * 3600); // mutation control
  });

  it('stops crediting once the daily ceiling is reached', () => {
    const d = decideCredit({
      lastHeartbeatMs: agoSec(30),
      nowMs: NOW,
      currentDailySeconds: MAX_DAILY_CREDIT_SEC,
    });
    expect(d.creditedSeconds).toBe(0);
    expect(d.reason).toBe('capped');
  });

  it('grants only the remaining allowance near the ceiling', () => {
    const d = decideCredit({
      lastHeartbeatMs: agoSec(30),
      nowMs: NOW,
      currentDailySeconds: MAX_DAILY_CREDIT_SEC - 10,
    });
    expect(d.creditedSeconds).toBe(10);
  });

  it('never credits a negative delta from clock skew', () => {
    // nowMs BEFORE the recorded last heartbeat.
    const d = decideCredit({ lastHeartbeatMs: NOW + 60_000, nowMs: NOW, currentDailySeconds: 0 });
    expect(d.creditedSeconds).toBe(0);
    expect(d.reason).toBe('too_soon');
  });
});

describe('localDayKey — the day a teacher experiences', () => {
  it('keys an evening Eastern session to the local day, not the UTC day', () => {
    // 2026-11-12 23:30 Eastern = 2026-11-13 04:30 UTC.
    const utc = new Date('2026-11-13T04:30:00Z');
    expect(localDayKey(utc)).toBe('2026-11-12');
    expect(utc.toISOString().slice(0, 10)).toBe('2026-11-13'); // mutation control
  });

  it('keys an early-morning Eastern session correctly', () => {
    // 2026-11-12 07:00 Eastern = 12:00 UTC.
    expect(localDayKey(new Date('2026-11-12T12:00:00Z'))).toBe('2026-11-12');
  });

  it('handles the DST spring-forward boundary without shifting the day', () => {
    // US DST starts 2026-03-08. 03:30 local is still the 8th.
    expect(localDayKey(new Date('2026-03-08T07:30:00Z'))).toBe('2026-03-08');
  });
});

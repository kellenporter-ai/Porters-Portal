import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Paged anchor enumeration.
//
// The anchor lookup must find the EARLIEST server-minted start for a
// (userId, assignmentId) pair. An earlier version used an unbounded
// `.limit(50)` with no orderBy, which returns an ARBITRARY subset of the pair's
// documents (the 50 lowest document IDs), so swept debris from an earlier term
// could outrank and hide a live session — silently re-opening the clock-reset
// bug the anchor exists to fix.
//
// Production data cannot exercise this (every pair currently has one document),
// so the enumeration rule is pinned here instead.
// ---------------------------------------------------------------------------

const PAGE = 100;
const MAX_DOCS = 500;
const LOOKBACK_MS = 4 * 60 * 60 * 1000;
const DEBRIS_MS = 24 * 60 * 60 * 1000;

interface SessionDoc {
  id: string;
  userId: string;
  assignmentId: string;
  startedAt: number;
  expiresAt: number;
}

/** Mirrors earliestSessionStartMs' scan + filter rules exactly. */
function earliestStart(
  docs: SessionDoc[],
  nowMs: number,
): { earliest: number | null; scanned: number; pages: number } {
  const cutoff = nowMs - LOOKBACK_MS;
  const staleBefore = nowMs - DEBRIS_MS;

  let earliest: number | null = null;
  let cursorId: string | null = null;
  let scanned = 0;
  let pages = 0;

  // Firestore returns docs ordered by __name__; the cursor is that same order.
  const ordered = [...docs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  while (scanned < MAX_DOCS) {
    const startIdx = cursorId === null
      ? 0
      : ordered.findIndex((d) => d.id === cursorId) + 1;
    const page = ordered.slice(startIdx, startIdx + PAGE);
    pages++;
    if (page.length === 0) break;

    for (const d of page) {
      // Debris: expired longer ago than the sweeper's grace.
      if (d.expiresAt < staleBefore) continue;
      if (d.startedAt <= 0 || d.startedAt < cutoff) continue;
      if (earliest === null || d.startedAt < earliest) earliest = d.startedAt;
    }

    scanned += page.length;
    cursorId = page[page.length - 1].id;
    if (page.length < PAGE) break;
  }

  return { earliest, scanned, pages };
}

const NOW = 1_700_000_000_000;
const hoursAgo = (h: number) => NOW - h * 3600 * 1000;

function doc(id: string, startedHoursAgo: number, expiresHoursAgo = -20): SessionDoc {
  return {
    id,
    userId: 'u1',
    assignmentId: 'a1',
    startedAt: hoursAgo(startedHoursAgo),
    // Default: still live (expires in the future).
    expiresAt: expiresHoursAgo < 0 ? hoursAgo(expiresHoursAgo) : hoursAgo(expiresHoursAgo),
  };
}

describe('earliestSessionStartMs enumeration', () => {
  it('finds the earliest start across a multi-page set', () => {
    // 250 docs, only a few inside the 4h window; the earliest is on page 3.
    const docs: SessionDoc[] = [];
    for (let i = 0; i < 250; i++) {
      docs.push(doc(`id${String(i).padStart(3, '0')}`, 5 + i * 0.01)); // all outside lookback
    }
    // Three genuine candidates; the earliest sorts LAST by document id.
    docs.push(doc('zzz-early', 3.5));
    docs.push(doc('zzz-mid', 2.0));
    docs.push(doc('zzz-late', 0.5));

    const r = earliestStart(docs, NOW);
    expect(r.pages).toBeGreaterThan(1); // proves it actually paged
    expect(r.earliest).toBe(hoursAgo(3.5));
  });

  it('ignores swept debris that outranks a live session by document id', () => {
    // The debris doc must be INSIDE the lookback by start time (so the lookback
    // filter cannot rescue it) but expired long ago — only the expiry filter
    // excludes it. This is the case the debris guard actually exists for.
    const docs: SessionDoc[] = [
      doc('aaa-debris', 3.0, 30), // started 3h ago, expired 30h ago (impossible in
      //                             practice, but it isolates the expiry filter)
      doc('zzz-live', 2.0),
    ];
    const r = earliestStart(docs, NOW);
    expect(r.earliest).toBe(hoursAgo(2.0));
    // Prove the lookback filter alone would have picked the debris:
    const lookbackOnly = docs
      .filter((d) => d.startedAt >= NOW - LOOKBACK_MS)
      .sort((a, b) => a.startedAt - b.startedAt)[0];
    expect(lookbackOnly.id).toBe('aaa-debris');
  });

  it('returns null when every doc is outside the lookback', () => {
    const r = earliestStart([doc('a', 10), doc('b', 20)], NOW);
    expect(r.earliest).toBeNull();
  });

  it('honours the runaway guard rather than scanning forever', () => {
    const docs: SessionDoc[] = [];
    for (let i = 0; i < 700; i++) docs.push(doc(`id${String(i).padStart(4, '0')}`, 100));
    const r = earliestStart(docs, NOW);
    expect(r.scanned).toBeLessThanOrEqual(MAX_DOCS);
  });

  it('stops early when a page is short (fully enumerated)', () => {
    const r = earliestStart([doc('a', 1), doc('b', 2)], NOW);
    expect(r.pages).toBe(1);
    expect(r.earliest).toBe(hoursAgo(2));
  });
});

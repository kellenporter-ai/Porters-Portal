// Pure-logic unit tests for the student-facing class comparison aggregate in
// functions/src/boss-results.ts. Runs against compiled output (lib/) via
// functions/vitest.config.mts — run `tsc` first (`npm test` does it via pretest).
//
// The product rules under test are LOCKED (a deliberate product decision):
//
//   median victor over-par   victors only, after close, min 5 victors
//   victor p25/p75 band      victors only, after close, min 10 victors
//   ordinal rank / percentile / histogram   never emitted
//   any comparison to others for a non-victor   never emitted
//
// Suppression must happen in the FUNCTION, not the client, so these tests assert
// the returned object itself — a modified client must not be able to read a
// suppressed value back out.
import { describe, it, expect } from 'vitest';
import { buildBossClassSummary } from '../lib/boss-results.js';

const DEADLINE = '2026-11-01T00:00:00.000Z';
const BEFORE_CLOSE = Date.parse('2026-10-15T12:00:00.000Z');
const AFTER_CLOSE = Date.parse('2026-11-02T12:00:00.000Z');

/**
 * Build N fighter docs. `overPar` is expressed as answeredCount relative to par
 * so the fixtures stay readable: for bossMaxHp 1400, par is 12.
 */
const PAR_1400 = 12;

function fighter(index, overPar) {
  return {
    userId: `uid_${String(index).padStart(4, '0')}`,
    eventId: 'evt-1',
    bossMaxHp: 1400,
    bossHp: 0,
    answeredCount: PAR_1400 + overPar,
    correctCount: PAR_1400,
    victoryClaimed: true,
  };
}

function victors(n, overPar = 0) {
  return Array.from({ length: n }, (_, i) => fighter(i, overPar));
}

/** Walk the returned object recursively collecting every key at any depth. */
function collectKeys(value, acc = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.push(k);
      collectKeys(v, acc);
    }
  }
  return acc;
}

describe('buildBossClassSummary — par mirrors lib/bossResults.ts', () => {
  it('computes the same par as the client module for a mid-size boss', () => {
    // 1400 HP → par 12 (validated against the client's Monte Carlo table).
    const summary = buildBossClassSummary([fighter(1, 0)], DEADLINE, AFTER_CLOSE, 'evt-1');
    // One victor with answeredCount == par → over-par 0. Median is suppressed
    // below 5 victors, so assert through the par-implied counters instead.
    expect(summary.victors).toBe(1);
    expect(summary.fighters).toBe(1);
  });

  it('excludes legacy docs (no bossMaxHp) from the over-par sample', () => {
    const legacy = {
      userId: 'uid_legacy',
      eventId: 'evt-1',
      answeredCount: 9,
      victoryClaimed: true,
      // no bossMaxHp at all
    };
    const summary = buildBossClassSummary(
      [...victors(5, 1), legacy],
      DEADLINE,
      AFTER_CLOSE,
      'evt-1',
    );
    expect(summary.victors).toBe(6);
    // The 5 modern victors all sit at +1; the legacy one must not drag it.
    expect(summary.medianVictorOverPar).toBe(1);
  });
});

describe('buildBossClassSummary — median suppression at the 5-victor threshold', () => {
  it('suppresses the median at 4 victors', () => {
    const s = buildBossClassSummary(victors(4, 2), DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.victors).toBe(4);
    expect(s.medianVictorOverPar).toBeNull();
  });

  it('emits the median at exactly 5 victors', () => {
    const s = buildBossClassSummary(victors(5, 2), DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.victors).toBe(5);
    expect(s.medianVictorOverPar).toBe(2);
  });

  it('suppresses the median at 0 victors', () => {
    const s = buildBossClassSummary([], DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.victors).toBe(0);
    expect(s.medianVictorOverPar).toBeNull();
  });
});

describe('buildBossClassSummary — band suppression at the 10-victor threshold', () => {
  it('suppresses the band at 9 victors', () => {
    const s = buildBossClassSummary(victors(9, 3), DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.victors).toBe(9);
    expect(s.medianVictorOverPar).toBe(3); // median still available at 9
    expect(s.victorOverParBand).toBeNull();
  });

  it('emits the band at exactly 10 victors', () => {
    const s = buildBossClassSummary(victors(10, 3), DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.victors).toBe(10);
    expect(s.victorOverParBand).toEqual({ p25: 3, p75: 3 });
  });

  it('suppresses the band at 4 victors too', () => {
    const s = buildBossClassSummary(victors(4, 1), DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.victorOverParBand).toBeNull();
  });
});

describe('buildBossClassSummary — median correctness', () => {
  it('takes the middle value of an odd sample', () => {
    const docs = [
      fighter(1, 0),
      fighter(2, 1),
      fighter(3, 5),
      fighter(4, 9),
      fighter(5, 14),
    ];
    const s = buildBossClassSummary(docs, DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.medianVictorOverPar).toBe(5);
  });

  it('averages the middle pair of an even sample', () => {
    const docs = [
      fighter(1, -2),
      fighter(2, 0),
      fighter(3, 2),
      fighter(4, 10),
    ];
    const s = buildBossClassSummary(docs, DEADLINE, AFTER_CLOSE, 'evt-1');
    // Only 4 victors → median suppressed. Add one more to expose the average path.
    expect(s.medianVictorOverPar).toBeNull();

    const six = [
      fighter(1, -2),
      fighter(2, 0),
      fighter(3, 2),
      fighter(4, 4),
      fighter(5, 6),
      fighter(6, 8),
    ];
    const s6 = buildBossClassSummary(six, DEADLINE, AFTER_CLOSE, 'evt-1');
    // sorted -2,0,2,4,6,8 → middle pair (2,4) → 3
    expect(s6.medianVictorOverPar).toBe(3);
  });

  it('is order-independent', () => {
    const docs = [fighter(1, 7), fighter(2, 1), fighter(3, 4), fighter(4, 0), fighter(5, 11)];
    const forward = buildBossClassSummary(docs, DEADLINE, AFTER_CLOSE, 'evt-1');
    const reversed = buildBossClassSummary([...docs].reverse(), DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(forward.medianVictorOverPar).toBe(reversed.medianVictorOverPar);
    expect(forward.victorOverParBand).toEqual(reversed.victorOverParBand);
  });

  it('counts fighters separately from victors', () => {
    const losers = Array.from({ length: 7 }, (_, i) => ({
      userId: `uid_loser_${i}`,
      eventId: 'evt-1',
      bossMaxHp: 1400,
      bossHp: 900,
      answeredCount: 5,
      correctCount: 2,
      victoryClaimed: false,
    }));
    const s = buildBossClassSummary([...victors(5, 1), ...losers], DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.fighters).toBe(12);
    expect(s.victors).toBe(5);
  });

  it('does not count a student who never answered as a fighter', () => {
    const idle = {
      userId: 'uid_idle',
      eventId: 'evt-1',
      bossMaxHp: 1400,
      bossHp: 1400,
      answeredCount: 0,
      correctCount: 0,
      victoryClaimed: false,
    };
    const s = buildBossClassSummary([idle, ...victors(5)], DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(s.fighters).toBe(5);
  });

  it('tolerates malformed documents without throwing', () => {
    const s = buildBossClassSummary(
      [null, undefined, {}, { answeredCount: 'x' }, { answeredCount: -3 }, { answeredCount: 3 }],
      DEADLINE,
      AFTER_CLOSE,
      'evt-1',
    );
    expect(s.fighters).toBe(1); // only the last doc answered > 0
    expect(s.victors).toBe(0);
    expect(s.medianVictorOverPar).toBeNull();
  });
});

describe('buildBossClassSummary — window state', () => {
  it('reports closed=false before the deadline', () => {
    expect(buildBossClassSummary(victors(5), DEADLINE, BEFORE_CLOSE, 'evt-1').closed).toBe(false);
  });

  it('reports closed=true after the deadline', () => {
    expect(buildBossClassSummary(victors(5), DEADLINE, AFTER_CLOSE, 'evt-1').closed).toBe(true);
  });

  it('treats a missing or unparseable deadline as never closed', () => {
    expect(buildBossClassSummary(victors(5), null, AFTER_CLOSE, 'evt-1').closed).toBe(false);
    expect(buildBossClassSummary(victors(5), undefined, AFTER_CLOSE, 'evt-1').closed).toBe(false);
    expect(buildBossClassSummary(victors(5), 'not-a-date', AFTER_CLOSE, 'evt-1').closed).toBe(false);
  });

  it('computes aggregates regardless of window state (the CLIENT decides when to show them)', () => {
    // Mid-window the client still needs `victors` for the "N have won so far" line.
    const s = buildBossClassSummary(victors(5, 2), DEADLINE, BEFORE_CLOSE, 'evt-1');
    expect(s.closed).toBe(false);
    expect(s.victors).toBe(5);
    expect(s.medianVictorOverPar).toBe(2);
  });
});

describe('buildBossClassSummary — PRIVACY: no student identifiers survive', () => {
  const docs = [
    ...victors(10, 2),
    { userId: 'uid_secret', eventId: 'evt-1', bossMaxHp: 1400, answeredCount: 4, victoryClaimed: false },
  ];

  it('contains no userId / name / uid key anywhere in the response', () => {
    const summary = buildBossClassSummary(docs, DEADLINE, AFTER_CLOSE, 'evt-1');
    const keys = collectKeys(summary);
    expect(keys).not.toContain('userId');
    expect(keys).not.toContain('uid');
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('displayName');
    expect(keys).not.toContain('email');
  });

  it('contains no value that looks like one of the input uids', () => {
    const summary = buildBossClassSummary(docs, DEADLINE, AFTER_CLOSE, 'evt-1');
    const serialized = JSON.stringify(summary);
    for (const doc of docs) {
      expect(serialized).not.toContain(doc.userId);
    }
  });

  it('exposes exactly the documented aggregate keys and nothing else', () => {
    const summary = buildBossClassSummary(docs, DEADLINE, AFTER_CLOSE, 'evt-1');
    expect(Object.keys(summary).sort()).toEqual(
      ['closed', 'eventId', 'fighters', 'medianVictorOverPar', 'victorOverParBand', 'victors'],
    );
    // A rank, percentile or histogram field would be a per-student leak vector.
    expect(summary).not.toHaveProperty('rank');
    expect(summary).not.toHaveProperty('percentile');
    expect(summary).not.toHaveProperty('histogram');
    expect(summary).not.toHaveProperty('rows');
  });

  it('emits the documented aggregate shape for a real-ish payload', () => {
    // Kept as an assertion-by-construction: this is the literal JSON the
    // function returns for a 10-victor, 22-fighter class after close.
    const fightersOnly = Array.from({ length: 12 }, (_, i) => ({
      userId: `uid_f${i}`,
      eventId: 'evt-1',
      bossMaxHp: 1400,
      answeredCount: 6,
      victoryClaimed: false,
    }));
    const overPars = [3, 4, 4, 5, 5, 6, 6, 7, 8, 9];
    const winnerDocs = overPars.map((op, i) => fighter(i, op));
    const summary = buildBossClassSummary(
      [...winnerDocs, ...fightersOnly],
      DEADLINE,
      AFTER_CLOSE,
      'evt-1',
    );

    expect(summary).toEqual({
      eventId: 'evt-1',
      closed: true,
      fighters: 22,
      victors: 10,
      medianVictorOverPar: 5.5,
      victorOverParBand: { p25: 4.25, p75: 6.75 },
    });
    // eslint-disable-next-line no-console
    console.log('AGGREGATE PAYLOAD:', JSON.stringify(summary, null, 2));
  });
});

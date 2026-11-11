import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { BELL_SCHEDULES, SCHEDULE_ORDER } from '../bellSchedule';

/*
 * public/schedule.html (the /schedule page) cannot import lib/bellSchedule.ts —
 * it is a standalone static file served straight from hosting — so it carries
 * its own copy of the period tables. That duplication is deliberate and
 * unavoidable, but it is also silent-breakage-prone: editing one side and not
 * the other shows students a wrong countdown.
 *
 * The React side no longer duplicates anything (HomeTab imports lib/bellSchedule),
 * so this test has exactly two sides to compare: the TS module and the HTML.
 *
 * If you edit a schedule, edit both. This test names the drifting row.
 */

const root = path.resolve(__dirname, '../..');
const scheduleHtml = readFileSync(path.join(root, 'public/schedule.html'), 'utf8');

interface PeriodRow {
  name: string;
  start: string;
  end: string;
}

/** Pull the periods array for a given schedule id out of schedule.html. */
function periodsFromHtml(id: string): PeriodRow[] {
  const idIndex = scheduleHtml.indexOf(`id: '${id}'`);
  expect(idIndex, `schedule id ${id} not found in public/schedule.html`).toBeGreaterThan(-1);
  // Slice to this entry's closing bracket, not a fixed window — a fixed window
  // silently truncates as the array grows and the comparison passes on a prefix.
  const start = scheduleHtml.indexOf('periods:', idIndex);
  expect(start, `periods array for ${id} not found`).toBeGreaterThan(-1);
  const open = scheduleHtml.indexOf('[', start);
  const close = scheduleHtml.indexOf(']', open);
  const body = scheduleHtml.slice(open, close);
  return [...body.matchAll(/name:\s*'([^']+)',\s*start:\s*'([\d:]+)',\s*end:\s*'([\d:]+)'/g)].map(
    (m) => ({ name: m[1], start: m[2], end: m[3] }),
  );
}

describe('lib/bellSchedule.ts ↔ public/schedule.html parity', () => {
  for (const id of SCHEDULE_ORDER) {
    it(`${id} periods match between the shared module and the standalone page`, () => {
      const fromHtml = periodsFromHtml(id);
      const fromTs = BELL_SCHEDULES[id].periods.map((p) => ({
        name: p.name,
        start: p.start,
        end: p.end,
      }));
      expect(fromHtml).toEqual(fromTs);
    });
  }

  it('the standalone page declares exactly the same schedule ids', () => {
    const htmlIds = [...scheduleHtml.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
    const unique = [...new Set(htmlIds)];
    for (const id of SCHEDULE_ORDER) expect(unique).toContain(id);
  });

  it('the regular schedule is the flagged default in the page too', () => {
    // `live: true` is what lets auto-resolution pick Regular without ever
    // adopting a dateless pattern like homeroom-hold.
    const regularBlock = scheduleHtml.slice(
      scheduleHtml.indexOf("id: 'regular'"),
      scheduleHtml.indexOf("id: 'homeroom-hold'"),
    );
    expect(regularBlock).toContain('live: true');
  });

  it('the standalone page authenticates its override read', () => {
    // The rules require sign-in. An anonymous fetch gets 403, which the page
    // swallowed as "no override" — the /schedule page silently showed Regular
    // while the signed-in banner showed the admin's real choice.
    expect(scheduleHtml).toContain('portal-auth.js');
    expect(scheduleHtml).toContain('Authorization');
  });

  it('the standalone page reads the admin override document', () => {
    // Without this the /schedule page and the homepage banner would disagree
    // about which schedule is live — the worst failure for a clock.
    expect(scheduleHtml).toContain('config/bell_schedule');
    expect(scheduleHtml).toContain('fetchOverride');
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { FORTUNE_WHEEL_PRIZES } from '../achievements';

// The server table lives in functions/src/engagement.ts and cannot be imported from the
// frontend test runner (it pulls in the Cloud Functions SDK), so it is parsed from source.
const SERVER_SRC = readFileSync(
  join(__dirname, '..', '..', 'functions', 'src', 'engagement.ts'),
  'utf8',
);

interface ServerPrize {
  id: string;
  weight: number;
}

function parseServerPrizes(src: string): ServerPrize[] {
  const start = src.indexOf('const WHEEL_PRIZES = [');
  const end = src.indexOf('];', start);
  const block = src.slice(start, end);
  const prizes: ServerPrize[] = [];
  const re = /\{ id: "([^"]+)"[\s\S]*?weight: (\d+)[^}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    prizes.push({ id: m[1], weight: parseInt(m[2], 10) });
  }
  return prizes;
}

describe('fortune wheel server/client parity', () => {
  const server = parseServerPrizes(SERVER_SRC);

  it('parses the server table (sanity)', () => {
    expect(server.length).toBe(13);
  });

  it('same ids in the same order', () => {
    expect(server.map(p => p.id)).toEqual(FORTUNE_WHEEL_PRIZES.map(p => p.id));
  });

  it('same weights', () => {
    expect(server.map(p => p.weight)).toEqual(FORTUNE_WHEEL_PRIZES.map(p => p.weight));
  });

  it('no NOTHING prize', () => {
    expect(FORTUNE_WHEEL_PRIZES.some(p => p.type === 'NOTHING')).toBe(false);
    expect(server.length).toBe(FORTUNE_WHEEL_PRIZES.length);
  });

  it('13 entries, total weight 122', () => {
    expect(FORTUNE_WHEEL_PRIZES.length).toBe(13);
    expect(FORTUNE_WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0)).toBe(122);
  });

  it('the three rail ids sit at indices 10/11/12', () => {
    const rail = ['w_xp_500', 'w_flux_250', 'w_item_legendary'];
    expect(FORTUNE_WHEEL_PRIZES.slice(10).map(p => p.id)).toEqual(rail);
    expect(server.slice(10).map(p => p.id)).toEqual(rail);
  });
});

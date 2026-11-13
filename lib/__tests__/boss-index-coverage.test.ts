/**
 * Guard: every composite query in functions/src/boss-results.ts must have a
 * matching index in firestore.indexes.json.
 *
 * Why this exists: getBossEventStats shipped green (344 tests passing) and then
 * failed in production with FAILED_PRECONDITION because it ordered
 * `boss_event_answers` by `answeredAt` ASCENDING while the only deployed index
 * used DESCENDING. Unit tests exercise pure aggregators, never the query
 * planner, so nothing caught it. Firestore rejects an unindexed composite query
 * at runtime, not at build time.
 *
 * This test reads the real source and the real index file, so it fails on the
 * same day someone adds a query without the index.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Vitest's root varies (repo root here, but cwd-relative in some runners), so
// resolve candidate roots and take the first that actually contains the files.
function resolveRepoRoot(): string {
  const candidates = [
    join(here, '..', '..'),
    join(here, '..', '..', '..'),
    process.cwd(),
    join(process.cwd(), 'projects', 'Porters-Portal'),
  ];
  for (const c of candidates) {
    try {
      readFileSync(join(c, 'firestore.indexes.json'), 'utf8');
      readFileSync(join(c, 'functions', 'src', 'boss-results.ts'), 'utf8');
      return c;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`Could not locate repo root from ${here} (cwd=${process.cwd()})`);
}
const repoRoot = resolveRepoRoot();
const sourcePath = join(repoRoot, 'functions', 'src', 'boss-results.ts');
const indexesPath = join(repoRoot, 'firestore.indexes.json');

interface IndexField {
  fieldPath: string;
  order?: string;
}
interface IndexDef {
  collectionGroup: string;
  queryScope?: string;
  fields: IndexField[];
}

interface ParsedQuery {
  collection: string;
  orderBy: Array<{ field: string; dir: 'asc' | 'desc' }>;
  equality: string[];
}

/**
 * Pull collection queries out of the source.
 *
 * Two shapes appear in this codebase:
 *   1. inline chains:  db.collection("x").where(...).orderBy(...)
 *   2. bound refs:     const ref = db.collection("x").where(...);
 *                      ... ref.orderBy(...)   // often many lines later
 *
 * The second shape is why a naive "grab 400 chars after .collection()" parse
 * silently found zero queries. This walks the whole file and, for each
 * collection, also collects orderBy/where calls made on any variable that was
 * bound to that collection's ref.
 */
export function parseQueries(src: string): ParsedQuery[] {
  const byCollection = new Map<string, ParsedQuery>();

  // Find every `.collection("NAME")` and record the variable it was bound to.
  const collectionRe = /\.collection\(["']([a-zA-Z0-9_]+)["']\)/g;
  const collectionAt: Array<{ name: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = collectionRe.exec(src)) !== null) {
    collectionAt.push({ name: m[1], index: m.index });
    if (!byCollection.has(m[1])) {
      byCollection.set(m[1], { collection: m[1], orderBy: [], equality: [] });
    }
  }

  // Map each bound variable name to the collection it refers to.
  const varToCollection = new Map<string, string>();
  for (const { name, index } of collectionAt) {
    const before = src.slice(Math.max(0, index - 120), index);
    // Handles `const ref = db.collection(...)`, `const ref = admin.firestore()
    // .collection(...)`, and a bare `db.collection(...)` with no binding.
    const bind = /(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:[A-Za-z0-9_.]+(?:\(\))?\s*)?$/.exec(before);
    if (bind) varToCollection.set(bind[1], name);
  }

  const scanOrder = (text: string, collection: string) => {
    const q = byCollection.get(collection);
    if (!q) return;
    const re = /\.orderBy\(\s*["']([a-zA-Z0-9_]+)["']\s*(?:,\s*["'](asc|desc)["']\s*)?\)/g;
    let r: RegExpExecArray | null;
    while ((r = re.exec(text)) !== null) {
      const entry = { field: r[1], dir: (r[2] as 'asc' | 'desc') || 'asc' } as const;
      if (!q.orderBy.some((o) => o.field === entry.field && o.dir === entry.dir)) {
        q.orderBy.push(entry);
      }
    }
    const whereRe = /\.where\(\s*["']([a-zA-Z0-9_]+)["']\s*,\s*["']==["']/g;
    let w: RegExpExecArray | null;
    while ((w = whereRe.exec(text)) !== null) {
      if (!q.equality.includes(w[1])) q.equality.push(w[1]);
    }
  };

  // Shape 1: inline chains, starting at each .collection( and reading forward.
  for (const { name, index } of collectionAt) {
    scanOrder(src.slice(index, index + 400), name);
  }
  // Shape 2: orderBy/where called on a variable bound to a collection ref.
  for (const [varName, collection] of varToCollection.entries()) {
    const callRe = new RegExp(`\\b${varName}\\s*(\\.(?:orderBy|where|startAfter|limit)\\([^)]*\\))`, 'g');
    let c: RegExpExecArray | null;
    while ((c = callRe.exec(src)) !== null) {
      scanOrder(c[1], collection);
    }
  }

  return [...byCollection.values()].filter((q) => q.orderBy.length > 0);
}

/**
 * True when `indexes` contains an index that can serve the query. Firestore
 * requires: every equality field present as ASC, then the orderBy fields in
 * order with matching direction.
 */
export function hasSupportingIndex(q: ParsedQuery, indexes: IndexDef[]): boolean {
  return indexes.some((idx) => {
    if (idx.collectionGroup !== q.collection) return false;
    const fields = idx.fields.filter((f) => f.fieldPath !== '__name__');
    const eqPrefix = q.equality;
    if (fields.length < eqPrefix.length + q.orderBy.length) return false;
    for (let i = 0; i < eqPrefix.length; i += 1) {
      if (fields[i].fieldPath !== eqPrefix[i]) return false;
      if ((fields[i].order || 'ASCENDING') !== 'ASCENDING') return false;
    }
    for (let i = 0; i < q.orderBy.length; i += 1) {
      const want = fields[eqPrefix.length + i];
      if (!want || want.fieldPath !== q.orderBy[i].field) return false;
      const wantDir = q.orderBy[i].dir === 'desc' ? 'DESCENDING' : 'ASCENDING';
      if ((want.order || 'ASCENDING') !== wantDir) return false;
    }
    return true;
  });
}

describe('boss-results composite queries are backed by a declared index', () => {
  const src = readFileSync(sourcePath, 'utf8');
  const indexes = JSON.parse(readFileSync(indexesPath, 'utf8')).indexes as IndexDef[];
  const queries = parseQueries(src);

  it('actually found the queries (guards against a parser that silently matches nothing)', () => {
    // If this drops to 0 the rest of the suite is meaningless.
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.collection === 'boss_event_answers')).toBe(true);
  });

  it('every ordered query has a supporting index', () => {
    const unsupported = queries.filter((q) => !hasSupportingIndex(q, indexes));
    expect(
      unsupported,
      `These queries would fail at runtime with FAILED_PRECONDITION:\n${JSON.stringify(unsupported, null, 2)}`,
    ).toEqual([]);
  });

  it('rejects a query ordered the wrong way (proves the check can fail)', () => {
    // Known-bad input: the exact regression that shipped. The deployed index is
    // answeredAt DESCENDING, so an ASCENDING order must NOT be considered
    // supported by it alone.
    const bad: ParsedQuery = {
      collection: 'boss_event_answers',
      orderBy: [{ field: 'answeredAt', dir: 'asc' }],
      equality: ['eventId'],
    };
    const descOnly: IndexDef[] = [
      {
        collectionGroup: 'boss_event_answers',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'eventId', order: 'ASCENDING' },
          { fieldPath: 'answeredAt', order: 'DESCENDING' },
        ],
      },
    ];
    expect(hasSupportingIndex(bad, descOnly)).toBe(false);
    // And the direction actually shipped today must pass.
    const good: ParsedQuery = { ...bad, orderBy: [{ field: 'answeredAt', dir: 'desc' }] };
    expect(hasSupportingIndex(good, descOnly)).toBe(true);
  });
});

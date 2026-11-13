// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { findUndefinedPath, stripUndefinedDeep } from '../firestoreSanitize';

// Regression + capability tests for the shared sanitizer extracted from the
// 2026-11 boss clone fix. The dangerous failure mode is NOT the one being fixed:
// rebuilding a class instance (Timestamp, FieldValue, GeoPoint) into a plain map
// writes SUCCESSFULLY as garbage, so nothing ever throws. These tests pin the
// pass-through contract, not just the undefined-stripping one.

describe('stripUndefinedDeep', () => {
  it('drops undefined object keys but keeps null, false, 0 and empty string', () => {
    const cleaned = stripUndefinedDeep({
      a: undefined,
      b: null,
      c: false,
      d: 0,
      e: '',
      f: 'kept',
    });
    expect(cleaned).toEqual({ b: null, c: false, d: 0, e: '', f: 'kept' });
    expect(Object.keys(cleaned)).not.toContain('a');
  });

  it('drops nested undefined values inside plain objects', () => {
    const cleaned = stripUndefinedDeep({
      rewards: { xp: 250, flux: undefined, itemRarity: 'RARE' },
      meta: { deep: { deeper: undefined, keep: 1 } },
    });
    expect(cleaned).toEqual({
      rewards: { xp: 250, itemRarity: 'RARE' },
      meta: { deep: { keep: 1 } },
    });
  });

  it('removes undefined array ELEMENTS rather than mapping them through', () => {
    // Array.prototype.map preserves undefined, which Firestore also rejects.
    const cleaned = stripUndefinedDeep({ questions: [{ id: 'q1' }, undefined, { id: 'q3' }] });
    expect(cleaned.questions).toHaveLength(2);
    expect(cleaned.questions).toEqual([{ id: 'q1' }, { id: 'q3' }]);
  });

  // --- The class-instance guard (the reason this module exists) -----------------

  it('passes Firestore Timestamps through BY REFERENCE, not as a rebuilt map', () => {
    const stamp = Timestamp.fromMillis(1_700_000_000_000);
    const cleaned = stripUndefinedDeep({ createdAt: stamp, updatedAt: undefined });
    expect(cleaned.createdAt).toBe(stamp);
    // A rebuilt map would be a plain object with seconds/nanoseconds and no isEqual().
    expect(cleaned.createdAt).toBeInstanceOf(Timestamp);
    expect(typeof cleaned.createdAt.toMillis).toBe('function');
    expect(Object.keys(cleaned)).not.toContain('updatedAt');
  });

  it('passes Date instances through by reference', () => {
    const date = new Date('2026-11-13T00:00:00Z');
    const cleaned = stripUndefinedDeep({ when: date });
    expect(cleaned.when).toBe(date);
    expect(cleaned.when).toBeInstanceOf(Date);
  });

  it('passes a non-plain class instance through untouched instead of flattening it', () => {
    class Sentinel {
      constructor(public op = 'SERVER_TIMESTAMP') {}
      isEqual() { return true; }
    }
    const sentinel = new Sentinel();
    const cleaned = stripUndefinedDeep({ stamp: sentinel });
    expect(cleaned.stamp).toBe(sentinel);
    expect(typeof cleaned.stamp.isEqual).toBe('function');
    expect(Object.keys(cleaned.stamp as object)).toEqual(['op']);
  });

  it('rebuilds Object.create(null) plain objects (no prototype, still data)', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.keep = 1;
    bare.drop = undefined;
    const cleaned = stripUndefinedDeep(bare);
    expect(cleaned).toEqual({ keep: 1 });
  });

  it('does not interpret a "__proto__" own key as a prototype setter', () => {
    const payload = JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}');
    const cleaned = stripUndefinedDeep(payload) as Record<string, unknown>;
    // Nothing leaked into the global Object prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Output has a null prototype by design, so a runtime prototype-setter assignment
    // cannot be triggered while building it.
    expect(Object.getPrototypeOf(cleaned)).toBeNull();
    expect(cleaned.safe).toBe(1);
    // The __proto__ key is carried as inert own data, not applied as a prototype.
    expect(Object.getPrototypeOf(cleaned as object)?.polluted).toBeUndefined();
  });

  it('terminates on a cyclic plain-object graph instead of overflowing', () => {
    const node: Record<string, unknown> = { name: 'loop', drop: undefined };
    node.self = node;
    expect(() => stripUndefinedDeep(node)).not.toThrow();
  });
});

describe('findUndefinedPath', () => {
  it('returns null for a Firestore-legal document', () => {
    expect(findUndefinedPath({ a: 1, b: null, c: false, d: 0, e: '' })).toBeNull();
  });

  it('names the offending top-level field', () => {
    expect(findUndefinedPath({ bossName: 'x', scaledMaxHp: undefined })).toBe('scaledMaxHp');
  });

  it('names a nested dotted path', () => {
    expect(findUndefinedPath({ rewards: { xp: 1, itemRarity: undefined } })).toBe('rewards.itemRarity');
  });

  it('names an array-indexed path', () => {
    expect(findUndefinedPath({ questions: [{ stem: 'ok' }, { stem: undefined }] }))
      .toBe('questions[1].stem');
  });

  it('does not flag class instances as containers to walk', () => {
    // A Timestamp's internal fields are not user data and must not be scanned.
    expect(findUndefinedPath({ createdAt: Timestamp.fromMillis(0) })).toBeNull();
  });
});

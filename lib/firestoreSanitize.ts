/**
 * Firestore document sanitization.
 *
 * The client SDK is initialized WITHOUT `ignoreUndefinedProperties`, so a single
 * `undefined` value anywhere in a document aborts the entire write
 * ("Unsupported field value: undefined"). See the 2026-11 boss clone bug, where a
 * `scaledMaxHp: undefined` key reintroduced after a JSON deep-copy survived into
 * `setDoc()` and blocked every save.
 *
 * `null`, `false`, `0` and `''` are all legal Firestore values and are preserved.
 *
 * IMPORTANT: only *plain* objects and arrays are rebuilt. Class instances —
 * Firestore `Timestamp`, `GeoPoint`, `DocumentReference`, `Bytes`, `FieldValue`
 * sentinels (`serverTimestamp()`), `Date`, `File`, etc. — are passed through
 * untouched. Rebuilding those would silently convert them into plain maps that
 * write successfully as garbage, which is strictly worse than a loud failure.
 */

/** True only for `{}` literals and `Object.create(null)` objects. */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively drop `undefined` values.
 *
 * - Object keys with an `undefined` value are omitted.
 * - Array elements that are `undefined` are removed (Firestore rejects them too).
 * - Non-plain objects and `Date` instances pass through by reference.
 * - Cycles are tracked defensively; Firestore rejects them independently.
 */
export function stripUndefinedDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;

  const asObject = value as unknown as object;
  if (seen.has(asObject)) return value;

  if (Array.isArray(value)) {
    seen.add(asObject);
    const cleaned = value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefinedDeep(entry, seen));
    seen.delete(asObject);
    return cleaned as unknown as T;
  }

  if (!isPlainObject(asObject)) return value;

  seen.add(asObject);
  // Object.create(null) avoids `__proto__` being interpreted as a prototype setter
  // when a JSON-parsed document carries it as an own key.
  const cleaned: Record<string, unknown> = Object.create(null);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    cleaned[key] = stripUndefinedDeep(entry, seen);
  }
  seen.delete(asObject);
  return cleaned as T;
}

/**
 * Walk a value the way Firestore validates it and return the dotted path of the
 * first `undefined` found, or `null` if the document is legal.
 *
 * Use this at a write boundary to FAIL LOUDLY with a field name instead of
 * relying on the SDK's error message, which omits the collection context.
 */
export function findUndefinedPath(value: unknown, path = ''): string | null {
  if (value === undefined) return path || '(root)';
  if (value === null || typeof value !== 'object') return null;

  const asObject = value as unknown as object;
  if (!isPlainObject(asObject) && !Array.isArray(value)) return null;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUndefinedPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const found = findUndefinedPath(entry, path ? `${path}.${key}` : key);
    if (found) return found;
  }
  return null;
}

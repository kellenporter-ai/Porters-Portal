/** Sort unit keys according to a unitOrder array. Unordered units go last alphabetically. */
export function sortUnitKeys(unitNames: string[], unitOrder?: string[]): string[] {
  if (!unitOrder || unitOrder.length === 0) return [...unitNames].sort();
  const orderMap = new Map(unitOrder.map((u, i) => [u, i]));
  return [...unitNames].sort((a, b) => {
    const aIdx = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aIdx === bIdx) return a.localeCompare(b);
    return aIdx - bIdx;
  });
}

/**
 * Phase 1e — Answer-key resolution helpers (pure, no Firestore imports).
 *
 * Answer keys (correctAnswer / acceptedAnswers / sortItems[].correct /
 * RANKING items[]) are stored in the admin-only `assignment_keys/{id}`
 * collection. Student-readable `assignments/{id}.lessonBlocks` carries
 * key-stripped blocks.
 *
 * CANONICAL COPY: this module is the testable source of truth for the
 * resolution logic. `functions/src/assessment.ts` inlines the same logic
 * because functions/ tsconfig rootDir excludes ../../lib imports (same
 * precedent as the tombstone envelope and ACHIEVEMENT_DEFS). The drift
 * guard in lib/__tests__/grading-keys.test.ts greps functions/src to keep
 * the two copies in sync.
 */

export interface KeyBlockInput {
  id?: string;
  type?: string;
  [key: string]: unknown;
}

/** Fields that constitute an answer key and must live in assignment_keys only. */
const KEY_FIELDS = ['correctAnswer', 'acceptedAnswers', 'sortItems', 'items'] as const;

/**
 * Extract the answer-key subset of a lesson block. The returned object
 * always carries { id, type } plus any present key fields. Used when
 * writing assignment_keys and when reconstructing keys from legacy inline
 * assignment docs (pre-migration fallback).
 */
export function extractKeyBlock(block: KeyBlockInput): KeyBlockInput {
  const key: KeyBlockInput = { id: block.id, type: block.type };
  for (const field of KEY_FIELDS) {
    if (block[field] !== undefined) key[field] = block[field];
  }
  return key;
}

/**
 * Merge key blocks (from assignment_keys) onto inline blocks (from the
 * student-readable assignment doc), matching by block id. The merged
 * object is `{ ...inline, ...key }` so key fields from assignment_keys
 * win, while non-key fields (prompt, options, etc.) on the assignment doc
 * remain authoritative. Blocks without a matching key block pass through
 * unchanged. Returns inlineBlocks untouched when keyBlocks is empty or
 * has no usable entries — the legacy pre-migration fallback.
 */
export function mergeKeyBlocks(
  inlineBlocks: KeyBlockInput[],
  keyBlocks: KeyBlockInput[],
): KeyBlockInput[] {
  const keyById = new Map<string, KeyBlockInput>();
  for (const kb of keyBlocks) {
    if (kb && typeof kb.id === 'string') keyById.set(kb.id, kb);
  }
  if (keyById.size === 0) return inlineBlocks;
  return inlineBlocks.map((block) => {
    const keyBlock = keyById.get(block.id as string);
    return keyBlock ? { ...block, ...keyBlock } : block;
  });
}

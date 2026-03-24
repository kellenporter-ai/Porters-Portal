import { LessonBlock } from '../types';

/**
 * Normalizes imported lesson blocks by mapping common property mismatches.
 * Content-generation tools sometimes use `content` as a catch-all field,
 * but certain block types expect type-specific properties (title, instructions, etc.).
 */
export function normalizeBlock(block: LessonBlock): LessonBlock {
  const b = { ...block };

  switch (b.type) {
    case 'SECTION_HEADER':
      // Generators often put header text in `content` instead of `title`
      if (!b.title && b.content) {
        b.title = b.content;
        b.content = '';
      }
      break;

    case 'ACTIVITY':
      // Generators often put activity description in `content` instead of `instructions`
      if (!b.instructions && b.content) {
        b.instructions = b.content;
        b.content = '';
      }
      break;

    case 'OBJECTIVES':
      // Generators sometimes put objective title in `content` instead of `title`
      // Note: `items` (the array) cannot be recovered from `content` — that gap is accepted
      if (!b.title && b.content) {
        b.title = b.content;
        b.content = '';
      }
      break;

    case 'SORTING':
      // Same pattern as ACTIVITY — generators may put instructions text in `content`
      if (!b.instructions && b.content) {
        b.instructions = b.content;
        b.content = '';
      }
      break;
  }

  return b;
}

export function normalizeBlocks(blocks: LessonBlock[]): LessonBlock[] {
  return blocks.map(normalizeBlock);
}

/**
 * Phase 1e — Answer-key resolution logic (pure helpers in lib/gradingKeys.ts).
 *
 * Covers:
 *  - extractKeyBlock: pulls { id, type, correctAnswer, acceptedAnswers,
 *    sortItems, items } off a lesson block; omits absent key fields.
 *  - mergeKeyBlocks: assignment_keys win over inline blocks by block id;
 *    non-key inline fields stay authoritative; empty/missing key blocks
 *    fall back to inline (legacy pre-migration docs).
 *  - Drift guard: the same logic is inlined in functions/src/assessment.ts
 *    (resolveGradingBlocks) because functions/ rootDir excludes ../../lib.
 *    This test greps the inlined copy so the two cannot silently diverge.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { extractKeyBlock, mergeKeyBlocks } from '../gradingKeys';

describe('extractKeyBlock', () => {
  it('extracts all present key fields plus id and type', () => {
    const block = {
      id: 'b1',
      type: 'MC',
      prompt: 'What is 2+2?',
      options: ['3', '4'],
      correctAnswer: 1,
    };
    expect(extractKeyBlock(block)).toEqual({ id: 'b1', type: 'MC', correctAnswer: 1 });
  });

  it('omits key fields that are absent (not undefined keys)', () => {
    const block = { id: 'b2', type: 'SHORT_ANSWER', prompt: 'Name a force.' };
    const key = extractKeyBlock(block);
    expect(key).toEqual({ id: 'b2', type: 'SHORT_ANSWER' });
    expect('correctAnswer' in key).toBe(false);
    expect('acceptedAnswers' in key).toBe(false);
  });

  it('extracts acceptedAnswers and sortItems', () => {
    const block = {
      id: 'b3',
      type: 'SORTING',
      sortItems: [
        { text: 'alpha', correct: '1' },
        { text: 'beta', correct: '2' },
      ],
      acceptedAnswers: ['gravity'],
    };
    expect(extractKeyBlock(block)).toEqual({
      id: 'b3',
      type: 'SORTING',
      sortItems: [
        { text: 'alpha', correct: '1' },
        { text: 'beta', correct: '2' },
      ],
      acceptedAnswers: ['gravity'],
    });
  });

  it('extracts RANKING items (the ordered items array IS the key)', () => {
    const block = { id: 'b4', type: 'RANKING', items: ['first', 'second', 'third'] };
    expect(extractKeyBlock(block)).toEqual({ id: 'b4', type: 'RANKING', items: ['first', 'second', 'third'] });
  });
});

describe('mergeKeyBlocks', () => {
  const inlineBlocks = [
    { id: 'b1', type: 'MC', prompt: 'What is 2+2?', options: ['3', '4'] },
    { id: 'b2', type: 'SHORT_ANSWER', prompt: 'Name a force.' },
    { id: 'b3', type: 'SORTING', sortItems: [{ text: 'alpha', correct: '' }] },
  ];

  it('key fields from assignment_keys win; non-key inline fields preserved', () => {
    const keyBlocks = [
      { id: 'b1', type: 'MC', correctAnswer: 1 },
      { id: 'b3', type: 'SORTING', sortItems: [{ text: 'alpha', correct: '1' }] },
    ];
    const merged = mergeKeyBlocks(inlineBlocks, keyBlocks);
    expect(merged[0]).toEqual({
      id: 'b1',
      type: 'MC',
      prompt: 'What is 2+2?',
      options: ['3', '4'],
      correctAnswer: 1,
    });
    // b2 has no key block — passes through untouched.
    expect(merged[1]).toEqual(inlineBlocks[1]);
    // b3's stripped sortItems get their correct values back.
    expect(merged[2].sortItems).toEqual([{ text: 'alpha', correct: '1' }]);
  });

  it('returns inline blocks unchanged when keyBlocks is empty (legacy fallback)', () => {
    expect(mergeKeyBlocks(inlineBlocks, [])).toBe(inlineBlocks);
  });

  it('returns inline blocks unchanged when keyBlocks has no string ids', () => {
    expect(mergeKeyBlocks(inlineBlocks, [{ type: 'MC' }])).toBe(inlineBlocks);
  });

  it('preserves key fields already inline for blocks missing from assignment_keys (mid-migration)', () => {
    const withInlineKey = [{ id: 'b1', type: 'MC', prompt: 'p', correctAnswer: 0 }];
    const merged = mergeKeyBlocks(withInlineKey, [{ id: 'b9', type: 'MC', correctAnswer: 3 }]);
    expect(merged[0].correctAnswer).toBe(0);
  });
});

describe('drift guard: functions/src/assessment.ts inlined copy', () => {
  it('resolveGradingBlocks still contains the canonical merge logic', () => {
    const root = resolve(__dirname, '../..');
    const src = execSync(`cat "${root}/functions/src/assessment.ts"`, { encoding: 'utf8' });
    expect(src).toContain('INLINED from lib/gradingKeys.ts');
    // The three canonical merge lines must exist verbatim in the inlined copy.
    expect(src).toContain('if (kb && typeof kb.id === "string") keyById.set(kb.id, kb);');
    expect(src).toContain('if (keyById.size === 0) return inlineBlocks as GradingBlock[];');
    expect(src).toContain('return (keyBlock ? { ...block, ...keyBlock } : block) as GradingBlock;');
  });
});

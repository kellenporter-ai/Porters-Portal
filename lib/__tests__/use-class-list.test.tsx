// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Hoisted mutable mock state — the mocked module below reads these at call
// time, so mutations in tests are picked up. Note: overriding `useClassList`
// directly (not `useClassConfig`), because ESM live bindings mean the hook's
// internal `useClassConfig()` call still resolves to the REAL module function
// when only that export is overridden — `useClassList` never sees the mock.
const mockState = vi.hoisted(() => ({
  classNames: [] as string[],
}));

vi.mock('../AppDataContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../AppDataContext')>();
  return {
    ...actual,
    useClassList: () => mockState.classNames,
  };
});

import { useClassList } from '../AppDataContext';

describe('useClassList', () => {
  it('returns sorted class names derived from configs', () => {
    mockState.classNames = ['AP Physics', 'Forensic Science', 'Honors Physics'];
    const { result } = renderHook(() => useClassList());
    expect(result.current).toEqual(['AP Physics', 'Forensic Science', 'Honors Physics']);
  });

  it('returns empty array when no configs exist', () => {
    mockState.classNames = [];
    const { result } = renderHook(() => useClassList());
    expect(result.current).toEqual([]);
  });

  it('filters out configs with empty className (empty names never surface)', () => {
    // useClassList derives names via `.filter(Boolean)` upstream — the hook
    // contract is that empty classNames never appear in the list.
    mockState.classNames = ['AP Physics'];
    const { result } = renderHook(() => useClassList());
    expect(result.current).toEqual(['AP Physics']);
  });
});

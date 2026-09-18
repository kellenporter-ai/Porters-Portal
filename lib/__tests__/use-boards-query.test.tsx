// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Capture the where()/orderBy() constraints passed to the Firestore query so
// we can assert the query shape without a real Firestore backend.
const mockResilientSnapshot = vi.fn((_name: string, _q: unknown, callback: (snap: unknown) => void) => {
  callback({ docs: [] });
  return vi.fn();
});

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../../services/resilientSnapshot', () => ({
  resilientSnapshot: (...args: unknown[]) => mockResilientSnapshot(...args as [string, unknown, (snap: unknown) => void]),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ _collection: name }),
  query: (...parts: unknown[]) => ({ _query: parts }),
  where: (field: string, op: string, value: unknown) => ({ _where: { field, op, value } }),
  orderBy: (field: string, dir: string) => ({ _orderBy: { field, dir } }),
}));

import { useBoards } from '../boards';

describe('useBoards', () => {
  it('subscribes with createdBy == teacher uid and createdAt desc order', () => {
    renderHook(() => useBoards('teacher-uid-1'));
    expect(mockResilientSnapshot).toHaveBeenCalledTimes(1);
    const [name, q] = mockResilientSnapshot.mock.calls[0] as unknown as [string, { _query: unknown[] }];

    expect(name).toBe('question_boards');
    const whereParts = q._query.filter(p => typeof p === 'object' && p !== null && '_where' in p) as { _where: { field: string; op: string; value: unknown } }[];
    expect(whereParts).toEqual([
      { _where: { field: 'createdBy', op: '==', value: 'teacher-uid-1' } },
    ]);

    const orderParts = q._query.filter(p => typeof p === 'object' && p !== null && '_orderBy' in p) as { _orderBy: { field: string; dir: string } }[];
    expect(orderParts).toEqual([
      { _orderBy: { field: 'createdAt', dir: 'desc' } },
    ]);

    // classType must no longer drive the teacher list filter.
    expect(JSON.stringify(q)).not.toContain('classType');
  });

  it('skips the subscription when uid is null', () => {
    mockResilientSnapshot.mockClear();
    const { result } = renderHook(() => useBoards(null));
    expect(mockResilientSnapshot).not.toHaveBeenCalled();
    expect(result.current.boards).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

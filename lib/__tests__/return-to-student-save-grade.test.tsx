// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { useGradingState } from '../../components/grading/useGradingState';
import type { Assignment, Submission, User, Rubric, RubricGrade } from '../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const saveRubricGradeMock = vi.fn();
const callReturnAssessmentMock = vi.fn();
const confirmMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

// Hoisted so the vi.mock factories below can reference it without a
// temporal-dead-zone error (same pattern as grading-attempt-drafts.test.tsx).
const mocks = vi.hoisted(() => ({ liveSubs: [] as Submission[] }));

// happy-dom in this environment does not expose localStorage as a global —
// polyfill a minimal in-memory stub (same pattern as i18n.test.tsx).
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
}

vi.mock('../../services/dataService', () => ({
  dataService: {
    subscribeToAssignmentSubmissions: vi.fn((_id: string, cb: (subs: Submission[]) => void) => {
      cb(mocks.liveSubs);
      return () => {};
    }),
    subscribeToAssessmentSessions: vi.fn((_id: string, cb: (s: unknown[]) => void) => { cb([]); return () => {}; }),
    subscribeToDraftResponseUsers: vi.fn((_id: string, cb: (ids: Set<string>) => void) => { cb(new Set()); return () => {}; }),
    saveRubricGrade: (...args: unknown[]) => saveRubricGradeMock(...args),
    getLatestIntegrityReport: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../lib/firebase', () => ({
  callReturnAssessment: (...args: unknown[]) => callReturnAssessmentMock(...args),
  callClassroomPushGrades: vi.fn(),
  callSubmitOnBehalf: vi.fn(),
  auth: { currentUser: null },
}));

vi.mock('../../lib/classroomAuth', () => ({ getClassroomAccessToken: vi.fn() }));
vi.mock('../../lib/integrityAnalysis', () => ({ analyzeIntegrity: vi.fn(() => ({ flags: [], score: 100 })) }));
vi.mock('../../lib/errorReporting', () => ({ reportError: vi.fn() }));
vi.mock('../../components/ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: confirmMock }),
  ConfirmProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../lib/csvGradeExport', () => ({ downloadGradeCSV: vi.fn() }));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRubric(): Rubric {
  return {
    title: 'Quiz Rubric',
    rawMarkdown: '',
    questions: [{ id: 'q1', questionLabel: 'Question 1', skills: [{ id: 's1', name: 'Accuracy', tiers: [] }] }],
  } as unknown as Rubric;
}

function makeAssignment(): Assignment {
  return { id: 'a1', title: 'Quiz', isAssessment: true, classType: 'SPANISH_1', rubric: makeRubric() } as unknown as Assignment;
}

function makeGrade(pct: number): RubricGrade {
  return {
    grades: { q1: { s1: { selectedTier: 3, percentage: pct } } },
    overallPercentage: pct,
    gradedAt: '2026-01-01T00:00:00.000Z',
    gradedBy: 'Admin',
  } as unknown as RubricGrade;
}

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1', userId: 'u1', userName: 'Student One', assignmentId: 'a1',
    assignmentTitle: 'Quiz', status: 'SUCCESS', score: 85,
    submittedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  } as unknown as Submission;
}

function makeUser(): User {
  return { id: 'u1', name: 'Student One', role: 'STUDENT', classType: 'SPANISH_1' } as unknown as User;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/grading/a1/u1']}>
      <Routes>
        <Route path="/grading/:assessmentId/:studentId" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );
}

function setup() {
  const submission = makeSubmission({ rubricGrade: makeGrade(85) });
  mocks.liveSubs = [submission];
  const utils = renderHook(
    () => useGradingState({ users: [makeUser()], assignments: [makeAssignment()], submissions: [submission] }),
    { wrapper },
  );
  return { ...utils, submission };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useGradingState.handleReturnToStudent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    saveRubricGradeMock.mockResolvedValue({ clearedAIFlag: false });
    callReturnAssessmentMock.mockResolvedValue({ success: true });
    mocks.liveSubs = [];
  });

  it('awaits saveRubricGrade BEFORE calling returnAssessment when rubric grades exist', async () => {
    const order: string[] = [];
    saveRubricGradeMock.mockImplementation(async () => { order.push('save'); });
    callReturnAssessmentMock.mockImplementation(async () => { order.push('return'); });

    const { result } = setup();
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    await act(async () => { await result.current.handleReturnToStudent(); });

    expect(saveRubricGradeMock).toHaveBeenCalledTimes(1);
    expect(callReturnAssessmentMock).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['save', 'return']);
    // Grade must be saved against the selected submission id
    expect(saveRubricGradeMock.mock.calls[0][0]).toBe('sub-1');
  });

  it('does NOT call returnAssessment when saveRubricGrade fails', async () => {
    saveRubricGradeMock.mockRejectedValue(new Error('network down'));

    const { result } = setup();
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    await act(async () => { await result.current.handleReturnToStudent(); });

    expect(saveRubricGradeMock).toHaveBeenCalledTimes(1);
    expect(callReturnAssessmentMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });
});

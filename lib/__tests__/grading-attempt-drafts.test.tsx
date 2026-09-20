// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import StudentResponsePanel from '../../components/grading/StudentResponsePanel';
import RubricViewer from '../../components/RubricViewer';
import { ConfirmProvider } from '../../components/ConfirmDialog';
import { ToastProvider } from '../../components/ToastProvider';
import type { StudentGroup } from '../../components/grading/gradingHelpers';
import type { Assignment, Submission, LessonBlock, Rubric } from '../../types';

const mockSubmissions = vi.hoisted(() => ({ current: [] as Submission[] }));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getAssignmentKeys: vi.fn().mockResolvedValue(null),
    getAssignmentContent: vi.fn().mockResolvedValue(null),
    subscribeToAssignmentSubmissions: vi.fn((_id: string, cb: (subs: Submission[]) => void) => {
      cb(mockSubmissions.current);
      return () => {};
    }),
    subscribeToAssessmentSessions: vi.fn((_id: string, cb: (sessions: Array<{ userId: string; startedAt: string }>) => void) => {
      cb([]);
      return () => {};
    }),
    subscribeToDraftResponseUsers: vi.fn((_id: string, cb: (userIds: Set<string>) => void) => {
      cb(new Set());
      return () => {};
    }),
    getLatestIntegrityReport: vi.fn().mockResolvedValue(null),
    saveRubricGrade: vi.fn().mockResolvedValue({ clearedAIFlag: false }),
    saveGradingCorrections: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../lib/firebase', () => ({
  callSubmitOnBehalf: vi.fn(),
}));
vi.mock('../../lib/errorReporting', () => ({
  reportError: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    userId: 'u1',
    userName: 'Student One',
    assignmentId: 'a1',
    assignmentTitle: 'Quiz',
    metrics: {
      pasteCount: 0, engagementTime: 100, keystrokes: 10, clickCount: 5,
      startTime: 0, lastActive: 0,
    },
    score: 0,
    status: 'SUCCESS',
    privateComments: [],
    ...overrides,
  } as Submission;
}

function makeGroup(submissions: Submission[], overrides: Partial<StudentGroup> = {}): StudentGroup {
  const sorted = [...submissions].sort((a, b) => (b.attemptNumber || 1) - (a.attemptNumber || 1));
  const latest = sorted[0];
  return {
    userId: latest.userId,
    userName: latest.userName,
    userSection: undefined,
    submissions: sorted,
    latest,
    best: latest,
    bestGraded: null,
    attemptCount: sorted.length,
    maxAttempts: undefined,
    isInProgress: false,
    hasRubricGrade: false,
    needsGrading: true,
    hasAISuggestion: false,
    ...overrides,
  };
}

function renderResponsePanel(sub: Submission, group: StudentGroup, blocks: LessonBlock[]) {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <ToastProvider>
          <StudentResponsePanel
            selectedGroup={group}
            sub={sub}
            selectedAssessment={{ id: 'a1', title: 'Quiz', lessonBlocks: blocks } as unknown as Assignment}
            selectedAssessmentId="a1"
            viewingDraftUserId={null}
            draftUserIds={new Set()}
            draftResponses={null}
            draftLoading={false}
            currentUnifiedIndex={0}
            totalUnified={1}
            gradingAttemptId={sub.id}
            onNavigate={() => {}}
            onFlagAsAI={() => {}}
            onUnflagAI={() => {}}
            onAttemptChange={() => {}}
            users={[]}
          />
        </ToastProvider>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

// ─── Bug 1: drawing replay viewBox must not clip student work ───────────────

describe('drawing replay viewBox (no clipping)', () => {
  it('viewBox height covers elements extending beyond canvasHeight', () => {
    const elements = [
      { type: 'stroke', points: [{ x: 100, y: 900 }, { x: 150, y: 950 }], color: '#000', width: 2 },
    ];
    const drawingBlock = { id: 'draw-1', type: 'DRAWING', content: 'Draw', canvasHeight: 520 } as unknown as LessonBlock;
    const sub = makeSubmission({
      blockResponses: { 'draw-1': { elements } },
      assessmentScore: { correct: 1, total: 1, percentage: 100, perBlock: { 'draw-1': { correct: true, answer: { elements }, needsReview: false } } },
    });
    const group = makeGroup([sub]);
    void group;

    const { container } = renderResponsePanel(sub, group, [drawingBlock]);
    // The replay svg is the drawing canvas — it is the last svg in the
    // panel (icon svgs come first in the header/actions).
    const svgs = Array.from(container.querySelectorAll('svg[viewBox]'));
    const svg = svgs[svgs.length - 1];
    expect(svg).not.toBeNull();
    const vb = (svg!.getAttribute('viewBox') || '').split(' ').map(Number);
    // max element y (950) + 20px padding
    expect(vb[3]).toBeGreaterThanOrEqual(970);
  });

  it('viewBox width covers elements extending horizontally', () => {
    const elements = [
      { type: 'shape', shape: 'rectangle', start: { x: 50, y: 50 }, end: { x: 1600, y: 200 }, color: '#000' },
    ];
    const drawingBlock = { id: 'draw-2', type: 'DRAWING', content: 'Draw', canvasHeight: 520 } as unknown as LessonBlock;
    const sub = makeSubmission({
      blockResponses: { 'draw-2': { elements } },
      assessmentScore: { correct: 1, total: 1, percentage: 100, perBlock: { 'draw-2': { correct: true, answer: { elements }, needsReview: false } } },
    });
    const group = makeGroup([sub]);
    void group;

    const { container } = renderResponsePanel(sub, group, [drawingBlock]);
    // The replay svg is the drawing canvas — it is the last svg in the
    // panel (icon svgs come first in the header/actions).
    const svgs = Array.from(container.querySelectorAll('svg[viewBox]'));
    const svg = svgs[svgs.length - 1];
    expect(svg).not.toBeNull();
    const vb = (svg!.getAttribute('viewBox') || '').split(' ').map(Number);
    expect(vb[2]).toBeGreaterThanOrEqual(1620);
  });

  it('falls back to the authored canvasHeight when elements stay inside it', () => {
    const elements = [
      { type: 'stroke', points: [{ x: 10, y: 10 }, { x: 80, y: 90 }], color: '#000', width: 2 },
    ];
    const drawingBlock = { id: 'draw-3', type: 'DRAWING', content: 'Draw', canvasHeight: 520 } as unknown as LessonBlock;
    const sub = makeSubmission({
      blockResponses: { 'draw-3': { elements } },
      assessmentScore: { correct: 1, total: 1, percentage: 100, perBlock: { 'draw-3': { correct: true, answer: { elements }, needsReview: false } } },
    });
    const group = makeGroup([sub]);
    void group;

    const { container } = renderResponsePanel(sub, group, [drawingBlock]);
    // The replay svg is the drawing canvas — it is the last svg in the
    // panel (icon svgs come first in the header/actions).
    const svgs = Array.from(container.querySelectorAll('svg[viewBox]'));
    const svg = svgs[svgs.length - 1];
    expect(svg!.getAttribute('viewBox')).toBe('0 0 820 540'); // 800+20 x 520+20
  });

  it('uses a 400px minimum height when canvasHeight is undefined', () => {
    const elements = [
      { type: 'stroke', points: [{ x: 10, y: 10 }, { x: 80, y: 90 }], color: '#000', width: 2 },
    ];
    const drawingBlock = { id: 'draw-4', type: 'DRAWING', content: 'Draw' } as unknown as LessonBlock;
    const sub = makeSubmission({
      blockResponses: { 'draw-4': { elements } },
      assessmentScore: { correct: 1, total: 1, percentage: 100, perBlock: { 'draw-4': { correct: true, answer: { elements }, needsReview: false } } },
    });
    const group = makeGroup([sub]);
    void group;

    const { container } = renderResponsePanel(sub, group, [drawingBlock]);
    // The replay svg is the drawing canvas — it is the last svg in the
    // panel (icon svgs come first in the header/actions).
    const svgs = Array.from(container.querySelectorAll('svg[viewBox]'));
    const svg = svgs[svgs.length - 1];
    expect(svg!.getAttribute('viewBox')).toBe('0 0 820 420'); // 800+20 x 400+20
  });
});

// ─── Bug 2b: best-attempt baseline outline ──────────────────────────────────

const rubric: Rubric = {
  title: 'Rubric',
  rawMarkdown: '',
  questions: [
    {
      id: 'q1',
      questionLabel: 'Q1',
      skills: [
        {
          id: 'sk1',
          skillText: 'Explains the concept',
          tiers: [
            { label: 'Missing', percentage: 0, descriptor: 'Not present' },
            { label: 'Emerging', percentage: 55, descriptor: 'Partial' },
            { label: 'Approaching', percentage: 65, descriptor: 'Developing idea' },
            { label: 'Developing', percentage: 85, descriptor: 'Clear explanation' },
            { label: 'Refining', percentage: 100, descriptor: 'Excellent' },
          ],
        },
      ],
    },
  ],
};

describe('best-attempt baseline outline', () => {
  it('outlines the baseline tier cell and not the selected one', () => {
    const currentGrades = { q1: { sk1: { selectedTier: 1, percentage: 55 } } };
    const baselineGrades = { q1: { sk1: { selectedTier: 3, percentage: 85 } } };

    const { container } = render(
      <RubricViewer
        rubric={rubric as never}
        mode="grade"
        rubricGrade={{ grades: currentGrades, overallPercentage: 55, gradedAt: '', gradedBy: '' }}
        baselineGrades={baselineGrades}
      />
    );

    const baselines = container.querySelectorAll('[data-baseline="true"]');
    expect(baselines).toHaveLength(1);
    expect(baselines[0].textContent).toContain('Developing');
    expect(baselines[0].getAttribute('aria-pressed')).toBe('false');
    // The "Best" corner badge is present
    expect(baselines[0].textContent).toContain('Best');
  });

  it('shows no baseline outline when no attempt has a saved grade (prop omitted)', () => {
    const { container } = render(
      <RubricViewer
        rubric={rubric as never}
        mode="grade"
        rubricGrade={{ grades: {}, overallPercentage: 0, gradedAt: '', gradedBy: '' }}
      />
    );
    expect(container.querySelector('[data-baseline]')).toBeNull();
  });
});

// ─── Session-scoped rubric drafts (Google Classroom behavior) ───────────────

import { UserRole, AssignmentStatus } from '../../types';
import type { RubricGrade } from '../../types';

function renderGradingHarness({
  users,
  assignments = [],
  submissions,
  initialEntry,
  onReady,
  harness: Harness,
}: {
  users: Array<{ id: string; role: UserRole }>;
  assignments?: unknown[];
  submissions: Submission[];
  initialEntry: string;
  onReady: (a: Record<string, unknown>) => void;
  harness: React.ComponentType<any>;
}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ConfirmProvider>
        <ToastProvider>
          <Routes>
            <Route
              path="/grading/:assessmentId"
              element={
                <Harness users={users} assignments={assignments} submissions={submissions} onReady={onReady} />
              }
            />
            <Route
              path="/grading/:assessmentId/:studentId"
              element={
                <Harness users={users} assignments={assignments} submissions={submissions} onReady={onReady} />
              }
            />
          </Routes>
        </ToastProvider>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

const savedGradeA: RubricGrade = {
  grades: { q1: { sk1: { selectedTier: 3, percentage: 85 } } },
  overallPercentage: 85,
  gradedAt: '2026-01-01',
  gradedBy: 'Admin',
};

const studentA = { id: 'u1', name: 'Student One', role: UserRole.STUDENT } as never;
const studentB = { id: 'u2', name: 'Student Two', role: UserRole.STUDENT } as never;

// A: best attempt saved-graded; older attempt ungraded. B: single ungraded attempt.
const subA1 = makeSubmission({ id: 'sub-a1', userId: 'u1', userName: 'Student One', attemptNumber: 1, rubricGrade: savedGradeA });
const subA2 = makeSubmission({ id: 'sub-a2', userId: 'u1', userName: 'Student One', attemptNumber: 2, score: 90, assessmentScore: { correct: 0, total: 1, percentage: 90, perBlock: {} } });
const subB1 = makeSubmission({ id: 'sub-b1', userId: 'u2', userName: 'Student Two', attemptNumber: 1, score: 95, assessmentScore: { correct: 0, total: 1, percentage: 95, perBlock: {} } });

describe('useGradingState session-scoped rubric drafts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockSubmissions.current = [];
  });

  function stubLocalStorage() {
    if (typeof globalThis.localStorage === 'undefined') {
      const store = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
      });
    }
  }

  it('draft survives student switch and restores on switch-back', async () => {
    const { useGradingState } = await import('../../components/grading/useGradingState');
    stubLocalStorage();
    mockSubmissions.current = [subA1, subA2, subB1];

    let api: Record<string, any> = {};
    function Harness({ onReady }: { onReady: (a: Record<string, unknown>) => void }) {
      const hookApi = useGradingState({
        users: [studentA, studentB],
        assignments: [],
        submissions: mockSubmissions.current,
      });
      React.useEffect(() => { onReady(hookApi); });
      return null;
    }

    await act(async () => {
      renderGradingHarness({
        users: [studentA, studentB],
        submissions: [subA1, subA2, subB1],
        initialEntry: '/grading/a1/u1',
        onReady: (a) => { api = a as Record<string, any>; },
        harness: Harness,
      });
    });

    // Viewing best attempt (a2, ungraded).
    await vi.waitFor(() => { expect(api.sub?.id).toBe('sub-a2'); });
    expect(api.rubricDraft).toEqual({});

    // Draft a tier on student A (unsaved).
    await act(async () => { api.handleRubricGradeChange('q1', 'sk1', 2); });
    expect(api.rubricDraft.q1.sk1.selectedTier).toBe(2);

    // Switch to student B: no saved grade and no stashed draft -> empty.
    await act(async () => { api.selectStudent('u2'); });
    await vi.waitFor(() => { expect(api.sub?.id).toBe('sub-b1'); });
    expect(api.rubricDraft).toEqual({});
    // The draft for student A must still exist in the session map.
    expect(api.rubricDrafts['sub-a2']).toBeDefined();

    // Switch back to student A: draft restored, not lost.
    await act(async () => { api.selectStudent('u1'); });
    await vi.waitFor(() => { expect(api.sub?.id).toBe('sub-a2'); });
    expect(api.rubricDraft.q1.sk1.selectedTier).toBe(2);
    expect(api.hasActiveRubricDraft).toBe(true);
  });

  it('saved grade wins over a stashed draft for the same submission', async () => {
    const { useGradingState } = await import('../../components/grading/useGradingState');
    stubLocalStorage();
    mockSubmissions.current = [subA1, subA2, subB1];

    let api: Record<string, any> = {};
    function Harness({ onReady }: { onReady: (a: Record<string, unknown>) => void }) {
      const hookApi = useGradingState({
        users: [studentA, studentB],
        assignments: [],
        submissions: mockSubmissions.current,
      });
      React.useEffect(() => { onReady(hookApi); });
      return null;
    }

    await act(async () => {
      renderGradingHarness({
        users: [studentA, studentB],
        submissions: [subA1, subA2, subB1],
        initialEntry: '/grading/a1/u1',
        onReady: (a) => { api = a as Record<string, any>; },
        harness: Harness,
      });
    });

    await vi.waitFor(() => { expect(api.sub?.id).toBe('sub-a2'); });

    // Switch to attempt a1 which has a saved grade: saved wins.
    await act(async () => { api.handleAttemptChange('sub-a1'); });
    expect(api.rubricDraft.q1.sk1.selectedTier).toBe(3);
    expect(api.hasActiveRubricDraft).toBe(false);
  });

  it('assessment change clears all session drafts', async () => {
    const { useGradingState } = await import('../../components/grading/useGradingState');
    stubLocalStorage();
    mockSubmissions.current = [subA1, subA2, subB1];

    let api: Record<string, any> = {};
    function Harness({ onReady }: { onReady: (a: Record<string, unknown>) => void }) {
      const hookApi = useGradingState({
        users: [studentA, studentB],
        assignments: [],
        submissions: mockSubmissions.current,
      });
      React.useEffect(() => { onReady(hookApi); });
      return null;
    }

    await act(async () => {
      renderGradingHarness({
        users: [studentA, studentB],
        submissions: [subA1, subA2, subB1],
        initialEntry: '/grading/a1/u1',
        onReady: (a) => { api = a as Record<string, any>; },
        harness: Harness,
      });
    });

    await vi.waitFor(() => { expect(api.sub?.id).toBe('sub-a2'); });
    await act(async () => { api.handleRubricGradeChange('q1', 'sk1', 2); });
    expect(api.rubricDrafts['sub-a2']).toBeDefined();

    // Switch to a different assessment: the whole draft map clears.
    await act(async () => { api.selectAssessment('a2'); });
    expect(api.rubricDrafts).toEqual({});
  });

  it('saving a grade clears that submission draft but keeps others', async () => {
    const { dataService } = await import('../../services/dataService');
    const { useGradingState } = await import('../../components/grading/useGradingState');
    stubLocalStorage();
    mockSubmissions.current = [subA1, subA2, subB1];

    const saveRubricGrade = vi.mocked(dataService.saveRubricGrade);

    const assignmentWithRubric = {
      id: 'a1',
      title: 'Quiz',
      description: '',
      classType: 'Sandbox Class',
      status: AssignmentStatus.ACTIVE,
      resources: [],
      publicComments: [],
      isAssessment: true,
      rubric,
    };

    let api: Record<string, any> = {};
    function Harness({ onReady }: { onReady: (a: Record<string, unknown>) => void }) {
      const hookApi = useGradingState({
        users: [studentA, studentB],
        assignments: [assignmentWithRubric],
        submissions: mockSubmissions.current,
      });
      React.useEffect(() => { onReady(hookApi); });
      return null;
    }

    await act(async () => {
      renderGradingHarness({
        users: [studentA, studentB],
        assignments: [assignmentWithRubric],
        submissions: [subA1, subA2, subB1],
        initialEntry: '/grading/a1/u1',
        onReady: (a) => { api = a as Record<string, any>; },
        harness: Harness,
      });
    });

    await vi.waitFor(() => { expect(api.sub?.id).toBe('sub-a2'); });

    // Draft tiers on A's ungraded attempt.
    await act(async () => { api.handleRubricGradeChange('q1', 'sk1', 4); });
    expect(api.rubricDrafts['sub-a2']).toBeDefined();

    // Draft tiers on B as well.
    await act(async () => { api.selectStudent('u2'); });
    await vi.waitFor(() => { expect(api.sub?.id).toBe('sub-b1'); });
    await act(async () => { api.handleRubricGradeChange('q1', 'sk1', 1); });
    expect(api.rubricDrafts['sub-b1']).toBeDefined();

    // Save B's grade: only B's draft clears.
    await act(async () => { await api.handleSaveRubric(); });
    expect(saveRubricGrade).toHaveBeenCalledWith('sub-b1', expect.objectContaining({ overallPercentage: 55 }), 'u2', 'Quiz');
    expect(api.rubricDrafts['sub-b1']).toBeUndefined();
    expect(api.rubricDrafts['sub-a2']).toBeDefined();
    expect(api.hasActiveRubricDraft).toBe(false);
    vi.doUnmock('../../services/dataService');
  });
});

// ─── Bug 2a: per-attempt rubric draft preservation ──────────────────────────

describe('useGradingState per-attempt draft preservation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stashes unsaved selections on attempt switch and restores them when switching back', async () => {
    const { useGradingState } = await import('../../components/grading/useGradingState');

    const attempt1 = makeSubmission({
      id: 'sub-1', attemptNumber: 1,
      rubricGrade: { grades: {}, overallPercentage: 85, gradedAt: '2026-01-01', gradedBy: 'Admin' },
    });
    const attempt2 = makeSubmission({ id: 'sub-2', attemptNumber: 2 });
    // The hook derives groups from the assignment-submissions subscription
    // when an assessmentId is in the URL (the subscription replaces the
    // prop-level `submissions` fallback), so feed the attempts through it.
    mockSubmissions.current = [attempt1, attempt2];
    // happy-dom in this environment lacks localStorage; the hook reads it in
    // a feedback-draft effect, so provide a minimal in-memory stub.
    if (typeof globalThis.localStorage === 'undefined') {
      const store = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
      });
    }

    let api: Record<string, any> = {};
    function Harness({ onReady }: { onReady: (a: Record<string, unknown>) => void }) {
      const hookApi = useGradingState({
        users: [{ id: 'u1' } as never],
        assignments: [],
        submissions: [attempt1, attempt2],
      });
      React.useEffect(() => { onReady(hookApi); });
      return null;
    }

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/grading/a1/u1']}>
          <ConfirmProvider>
            <ToastProvider>
              <Routes>
                <Route path="/grading/:assessmentId/:studentId" element={
                  <Harness onReady={(a) => { api = a as Record<string, any>; }} />
                } />
              </Routes>
            </ToastProvider>
          </ConfirmProvider>
        </MemoryRouter>
      );
    });

    // Sanity: viewing best attempt (attempt1) with its saved grade.
    // The group/attempt population happens in async effects + the URL-sync
    // effect, so poll until the derived `sub` is available.
    await vi.waitFor(() => {
      expect(api.sub?.id).toBe('sub-1');
    });
    expect(api.rubricDraft).toEqual({});

    // Switch to attempt2 (no saved grade): empty draft
    await act(async () => { api.handleAttemptChange('sub-2'); });
    expect(api.gradingAttemptId).toBe('sub-2');
    expect(api.rubricDraft).toEqual({});

    // Select a tier on attempt2 (unsaved)
    await act(async () => { api.handleRubricGradeChange('q1', 'sk1', 2); });
    expect(api.rubricDraft.q1.sk1.selectedTier).toBe(2);

    // Switch to attempt1: saved grade wins; the draft must not override it
    await act(async () => { api.handleAttemptChange('sub-1'); });
    expect(api.rubricDraft.q1?.sk1).toBeUndefined();
    expect(api.sub?.id).toBe('sub-1');

    // Switch back to attempt2: the stashed draft is restored
    await act(async () => { api.handleAttemptChange('sub-2'); });
    expect(api.rubricDraft.q1.sk1.selectedTier).toBe(2);
  });
});

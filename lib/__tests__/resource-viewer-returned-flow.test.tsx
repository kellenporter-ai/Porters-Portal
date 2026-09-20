// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { type ReactNode } from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ResourceViewer from '../../components/ResourceViewer';
import { LocaleProvider } from '../../lib/i18n';
import { ThemeProvider } from '../../lib/ThemeContext';
import type { Submission, User } from '../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Hoisted so the vi.mock factory below can reference it without a
// temporal-dead-zone error (same pattern as grading-attempt-drafts.test.tsx).
const state = vi.hoisted(() => ({ existingSubmission: null as (Submission & { id: string }) | null }));

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({})), onAuthStateChanged: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async () => ({ id: 'x' })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  onSnapshot: vi.fn((...args: unknown[]) => {
    // Real call signature: onSnapshot(q, onNext, onError?) — find the snapshot callback.
    const cb = args.find(a => typeof a === 'function') as (snap: { empty: boolean; docs: unknown[] }) => void;
    // submissions listener
    const sub = state.existingSubmission;
    if (sub) {
      const payload = {
        empty: false,
        docs: [{
          id: sub.id,
          data: () => {
            const { id: _id, ...rest } = sub;
            return rest;
          },
        }],
      };
      cb(payload);
    } else {
      cb({ empty: true, docs: [] });
    }
    return () => {};
  }),
}));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn() }));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(() => ({})), ref: vi.fn(() => ({})), getDownloadURL: vi.fn(async () => '') }));
vi.mock('firebase/analytics', () => ({ getAnalytics: vi.fn(() => ({})), logEvent: vi.fn() }));

const confirmMock = vi.fn();
vi.mock('../../components/ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: confirmMock }),
  ConfirmProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../lib/errorReporting', () => ({ reportError: vi.fn(), extractFirebaseErrorCode: vi.fn(() => 'unknown') }));

vi.mock('../../lib/AppDataContext', () => ({
  useAssignments: () => ({
    assignments: [
      {
        id: 'a1',
        title: 'Quiz',
        isAssessment: true,
        assessmentConfig: { allowResubmission: true, maxAttempts: 0 },
      },
    ],
    loading: false,
  }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getAssignmentContent: vi.fn().mockResolvedValue(null),
    subscribeToSubmissions: vi.fn(() => () => {}),
    markFeedbackRead: vi.fn(),
    submitEngagement: vi.fn(),
  },
}));

vi.mock('../../lib/firebase', () => ({
  db: {},
  callStartAssessmentSession: vi.fn(),
}));

// ResourceViewer lazy-loads AssessmentWorkspace via lazyWithRetry() (dynamic
// import — vi.mock can't intercept). Stub the lazy helper itself so the stub
// below is actually used.
vi.mock('../../lib/lazyWithRetry', () => ({
  lazyWithRetry: (factory: () => Promise<{ default: React.ComponentType<any> }>) =>
    React.lazy(factory),
}));

// Child components that pull in heavy dependencies — stub them.
vi.mock('../../components/Proctor', () => ({ default: () => null }));
vi.mock('../../components/ReviewQuestions', () => ({ default: () => null }));
vi.mock('../../components/RubricViewer', () => ({ default: () => null }));
vi.mock('../../components/StudyMaterial', () => ({ default: () => null }));
vi.mock('../../components/AssessmentWorkspace', () => ({
  default: (props: { existingSubmission: Submission | null; onExit: () => void }) => {
    return (
      <div data-testid="results-mode">
        {props.existingSubmission?.status === 'RETURNED' && props.existingSubmission.rubricGrade
          ? 'revise-cta'
          : 'no-revise'}
        <button onClick={props.onExit}>exit</button>
      </div>
    );
  },
}));
vi.mock('../../components/LessonBlocks', () => ({ default: () => null }));

const exitFullscreenMock = vi.fn().mockResolvedValue(undefined);
const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(): User {
  return { id: 'u1', name: 'Student One', role: 'STUDENT', classType: 'SPANISH_1' } as unknown as User;
}

function makeReturnedSubmission(withGrade: boolean): Submission & { id: string } {
  return {
    id: 'sub-1',
    userId: 'u1',
    assignmentId: 'a1',
    assignmentTitle: 'Quiz',
    status: 'RETURNED',
    isAssessment: true,
    assessmentScore: { correct: 3, total: 4, percentage: 75, perBlock: {} },
    submittedAt: '2026-01-01T00:00:00.000Z',
    returnedAt: '2026-01-02T00:00:00.000Z',
    ...(withGrade
      ? {
          rubricGrade: {
            grades: { q1: { s1: { selectedTier: 3, percentage: 85 } } },
            overallPercentage: 85,
            gradedAt: '2026-01-02T00:00:00.000Z',
            gradedBy: 'Admin',
            teacherFeedback: 'Good work, revise question 2.',
          },
        }
      : {}),
  } as unknown as Submission & { id: string };
}

function renderViewer(user: User) {
  return render(
    <MemoryRouter initialEntries={['/resources/a1']}>
      <LocaleProvider>
        <ThemeProvider>
          {/* Real route so useParams() resolves { id: 'a1' } (mirrors App.tsx) */}
          <Routes>
            <Route path="/resources/:id" element={<ResourceViewer user={user} />} />
          </Routes>
        </ThemeProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ResourceViewer RETURNED-submission gating + exitFocusMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    Object.defineProperty(document, 'exitFullscreen', { value: exitFullscreenMock, configurable: true, writable: true });
    Object.defineProperty(document, 'requestFullscreen', { value: requestFullscreenMock, configurable: true, writable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true, writable: true });
    state.existingSubmission = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders results mode with revise CTA when RETURNED submission has a rubricGrade', async () => {
    state.existingSubmission = makeReturnedSubmission(true);
    await act(async () => {
      renderViewer(makeUser());
    });

    expect(await screen.findByTestId('results-mode')).toBeInTheDocument();
    expect(screen.getByText('revise-cta')).toBeInTheDocument();
  });

  it('does NOT render results mode when RETURNED submission lacks a rubricGrade', async () => {
    state.existingSubmission = makeReturnedSubmission(false);
    await act(async () => {
      renderViewer(makeUser());
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 200));
    });
    // Without a rubricGrade the workspace renders in taking mode (student goes
    // straight into the retake flow) — the stub testid still mounts, but the
    // revise CTA must NOT appear.
    expect(screen.queryByText('revise-cta')).not.toBeInTheDocument();
    expect(await screen.findByTestId('results-mode')).toBeInTheDocument();
    expect(screen.getByText('no-revise')).toBeInTheDocument();
  });

  it('calls document.exitFullscreen() on exit only when fullscreenElement is set', async () => {
    // Case 1: fullscreen active → exit called
    state.existingSubmission = makeReturnedSubmission(true);
    await act(async () => {
      renderViewer(makeUser());
    });
    const resultsView = await screen.findByTestId('results-mode');

    Object.defineProperty(document, 'fullscreenElement', { value: resultsView, configurable: true, writable: true });
    await act(async () => {
      screen.getByRole('button', { name: 'exit' }).click();
    });
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);

    // Case 2: not fullscreen → exit NOT called
    exitFullscreenMock.mockClear();
    cleanup();
    state.existingSubmission = makeReturnedSubmission(true);
    await act(async () => {
      renderViewer(makeUser());
    });
    await screen.findByTestId('results-mode');
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true, writable: true });
    await act(async () => {
      screen.getByRole('button', { name: 'exit' }).click();
    });
    expect(exitFullscreenMock).not.toHaveBeenCalled();
  });
});

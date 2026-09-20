// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { type ReactNode } from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ResourceViewer from '../../components/ResourceViewer';
import { LocaleProvider } from '../../lib/i18n';
import { ThemeProvider } from '../../lib/ThemeContext';
import type { User } from '../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({})), onAuthStateChanged: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})), doc: vi.fn(() => ({})), getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => undefined), updateDoc: vi.fn(async () => undefined), deleteDoc: vi.fn(async () => undefined),
  collection: vi.fn(() => ({})), addDoc: vi.fn(async () => ({ id: 'x' })), query: vi.fn(() => ({})), where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})), limit: vi.fn(() => ({})), getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  onSnapshot: vi.fn(() => () => {}),
}));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn() }));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(() => ({})), ref: vi.fn(() => ({})), getDownloadURL: vi.fn(async () => '') }));
vi.mock('firebase/analytics', () => ({ getAnalytics: vi.fn(() => ({})), logEvent: vi.fn() }));

vi.mock('../../components/ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: vi.fn() }),
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
      { id: 'a1', title: 'Quiz', isAssessment: true, assessmentConfig: { allowResubmission: true, maxAttempts: 0 } },
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

vi.mock('../../lib/firebase', () => ({ db: {}, callStartAssessmentSession: vi.fn() }));

vi.mock('../../lib/lazyWithRetry', () => {
  const ReactSync = React;
  // Fully synchronous lazy: resolve the factory's module via require (vitest
  // transforms CJS-interop), so nested lazy children render in the same commit.
  const resolved = new Map<string, React.ComponentType<any>>();
  const mod = (globalThis as any).__vitest_require__ || ((globalThis as any).require as undefined);
  const resolveSync = (factory: () => Promise<{ default: React.ComponentType<any> }>) => {
    const key = factory.toString();
    if (resolved.has(key)) return resolved.get(key)!;
    if (mod) {
      const src = factory.toString();
      const m = /import\(['"]([^'"]+)['"]\)/.exec(src);
      if (m) {
        const r: any = mod(m[1]);
        const Comp = r?.default ?? r;
        resolved.set(key, Comp);
        return Comp;
      }
    }
    return null;
  };
  return {
    lazyWithRetry: (factory: () => Promise<{ default: React.ComponentType<any> }>) => {
      let Comp = resolveSync(factory);
      if (Comp) return Comp;
      // Fallback: async resolution with polling re-render (no Suspense).
      return function LazySync(props: any) {
        const [, force] = ReactSync.useReducer((c: number) => c + 1, 0);
        ReactSync.useEffect(() => {
          factory().then((m) => { Comp = m.default; force(); });
        }, []);
        return Comp ? <Comp {...props} /> : null;
      };
    },
  };
});

// Proctor stub: immediately reports a session-token error (the "Cannot Start
// Assessment" state) and exposes the flushRef it was handed so we can assert
// Save & Exit never invokes it.
const captured: { onSessionTokenError?: (e: string | null) => void; flushRef?: React.MutableRefObject<unknown> } = {};
vi.mock('../../components/Proctor', () => ({
  default: (props: { onSessionTokenError?: (e: string | null) => void; flushRef?: React.MutableRefObject<unknown> }) => {
    captured.onSessionTokenError = props.onSessionTokenError;
    captured.flushRef = props.flushRef;
    return <div data-testid="proctor-error">Cannot Start Assessment</div>;
  },
}));
vi.mock('../../components/ReviewQuestions', () => ({ default: () => null }));
vi.mock('../../components/RubricViewer', () => ({ default: () => null }));
vi.mock('../../components/StudyMaterial', () => ({ default: () => null }));

// AssessmentWorkspace stub records the gating props it receives.
const workspaceProps: { submitDisabled?: boolean; submitDisabledReason?: string; onExit?: () => void } = {};
vi.mock('../../components/AssessmentWorkspace', () => ({
  default: (props: { submitDisabled?: boolean; submitDisabledReason?: string; onExit?: () => void; children?: ReactNode }) => {
    Object.assign(workspaceProps, props);
    return (
      <div data-testid="workspace">
        <button onClick={props.onExit}>save-and-exit</button>
        <button disabled={props.submitDisabled} title={props.submitDisabledReason}>submit</button>
        {props.children}
      </div>
    );
  },
}));
vi.mock('../../components/LessonBlocks', () => ({ default: () => null }));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(): User {
  return { id: 'u1', name: 'Student One', role: 'STUDENT', classType: 'SPANISH_1' } as unknown as User;
}

function renderViewer(user: User) {
  return render(
    <MemoryRouter initialEntries={['/resources/a1']}>
      <LocaleProvider>
        <ThemeProvider>
          <Routes>
            <Route path="/resources/:id" element={<ResourceViewer user={user} />} />
          </Routes>
        </ThemeProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ResourceViewer token-error gating (Cannot Start Assessment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceProps.submitDisabled = undefined;
    workspaceProps.submitDisabledReason = undefined;
    workspaceProps.onExit = undefined;
    Object.defineProperty(document, 'exitFullscreen', { value: vi.fn().mockResolvedValue(undefined), configurable: true, writable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true, writable: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('disables Submit with the no-session reason and Save & Exit resolves without touching the flush', async () => {
    await act(async () => {
      renderViewer(makeUser());
    });

    // The WORK view for a live assessment is gated behind the "Start
    // Assessment" screen (assessmentStarted=false). Click through it so the
    // AssessmentWorkspace (and the stubbed Proctor inside it) mounts.
    const startBtn = await screen.findByRole('button', { name: 'Start Assessment' });
    await act(async () => {
      startBtn.click();
    });
    // Workspace (and the stubbed Proctor inside it) mounts lazily — flush the
    // Suspense boundary repeatedly until React resolves the lazy import
    // (happy-dom needs several microtask+timer turns for nested lazy mounts).
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      if (captured.onSessionTokenError) break;
    }

    // Proctor entered the token-error gate → parent must be notified.
    expect(captured.onSessionTokenError).toBeDefined();
    await act(async () => {
      captured.onSessionTokenError!('session expired');
    });

    // AssessmentWorkspace receives the gate.
    expect(workspaceProps.submitDisabled).toBe(true);
    expect(workspaceProps.submitDisabledReason).toBeTruthy();
    const submitBtn = screen.getByRole('button', { name: 'submit' });
    expect(submitBtn).toBeDisabled();

    // Save & Exit must resolve promptly WITHOUT calling flushRef (the
    // pre-fix bug hung here for 60s awaiting an unwired flush promise).
    const flushSpy = vi.fn();
    captured.flushRef!.current = flushSpy as never;

    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Save & Exit hung — flush was awaited')), 2000));
    await act(async () => {
      await Promise.race([Promise.resolve(workspaceProps.onExit!()).then(() => 'exited'), timeout]);
    });
    expect(flushSpy).not.toHaveBeenCalled();
  }, 10000);
});

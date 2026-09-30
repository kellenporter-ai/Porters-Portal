// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { LocaleProvider } from '../i18n';
import { ToastProvider } from '../../components/ToastProvider';
import AssessmentWorkspace from '../../components/AssessmentWorkspace';
import type { LessonBlock, Submission } from '../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const getAssessmentAttemptsMock = vi.fn();

vi.mock('../../services/dataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/dataService')>();
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getAssessmentAttempts: (...args: unknown[]) => getAssessmentAttemptsMock(...args),
      getStudentNotes: vi.fn(async () => ({})),
    },
  };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const shortAnswerBlock: LessonBlock = {
  id: 'blk-sa',
  type: 'SHORT_ANSWER',
  content: 'What is gravity?',
  title: 'Gravity',
} as LessonBlock;

/** assessmentScore has the real object shape ({correct, total, percentage, perBlock}). */
function makeAttempt(
  id: string,
  attemptNumber: number,
  answer: string,
  score: number,
): Submission {
  return {
    id,
    userId: 'u1',
    assignmentId: 'a1',
    isAssessment: true,
    attemptNumber,
    submittedAt: `2026-03-0${attemptNumber}T00:00:00Z`,
    assessmentScore: {
      correct: score,
      total: 100,
      percentage: score,
      perBlock: {},
    },
    blockResponses: { 'blk-sa': { answer } },
  } as unknown as Submission;
}

const assessmentResult = {
  correct: 1,
  total: 1,
  percentage: 100,
  perBlock: {},
  attemptNumber: 2,
  status: 'SUCCESS',
  xpEarned: 0,
};

function renderWorkspace(submission: Submission, blocks: LessonBlock[] = [shortAnswerBlock]) {
  return render(
    <LocaleProvider>
      <ToastProvider>
        <AssessmentWorkspace
          mode="results"
          activeAssignment={{ id: 'a1', lessonBlocks: blocks } as never}
          assessmentResult={assessmentResult}
          existingSubmission={submission}
          onReviewWork={() => {}}
          onExit={() => {}}
        />
      </ToastProvider>
    </LocaleProvider>,
  );
}

async function openMyWork() {
  const myWorkTab = await screen.findByRole('button', { name: /my work/i });
  fireEvent.click(myWorkTab);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MyWorkPanel attempt selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a selector with both attempt scores when 2+ attempts exist', async () => {
    const latest = makeAttempt('sub-2', 2, 'Revised answer', 90);
    const older = makeAttempt('sub-1', 1, 'First answer', 55);
    getAssessmentAttemptsMock.mockResolvedValueOnce([latest, older]);

    renderWorkspace(latest);
    await openMyWork();

    const selector = await screen.findByRole('combobox');
    const options = Array.from(selector.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Attempt 2 · 90%', 'Attempt 1 · 55%']);

    // Score pill reflects the default (latest) selection
    expect(screen.getByTestId('mywork-score-pill')).toHaveTextContent('90%');
  });

  it('switching the selector swaps the rendered responses', async () => {
    const latest = makeAttempt('sub-2', 2, 'Revised answer', 90);
    const older = makeAttempt('sub-1', 1, 'First answer', 55);
    getAssessmentAttemptsMock.mockResolvedValueOnce([latest, older]);

    renderWorkspace(latest);
    await openMyWork();

    expect(screen.getByText('Revised answer')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sub-1' } });

    await waitFor(() => {
      expect(screen.getByText('First answer')).toBeInTheDocument();
      expect(screen.queryByText('Revised answer')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('mywork-score-pill')).toHaveTextContent('55%');
  });

  it('renders no selector when only one attempt exists', async () => {
    const latest = makeAttempt('sub-1', 1, 'Only answer', 70);
    getAssessmentAttemptsMock.mockResolvedValueOnce([latest]);

    renderWorkspace(latest);
    await openMyWork();

    await waitFor(() => {
      expect(screen.getByText('Only answer')).toBeInTheDocument();
    });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByTestId('mywork-score-pill')).toHaveTextContent('70%');
  });

  it('shows the percentage for an ungraded attempt instead of Pending Review', async () => {
    // No rubricGrade; assessmentScore.percentage = 80 → must render "80%".
    const latest = makeAttempt('sub-2', 2, 'Revised answer', 90);
    const ungradedOlder = makeAttempt('sub-1', 1, 'First answer', 80);
    getAssessmentAttemptsMock.mockResolvedValueOnce([latest, ungradedOlder]);

    renderWorkspace(latest);
    await openMyWork();

    // Default selection (latest) shows its own score
    expect(screen.getByTestId('mywork-score-pill')).toHaveTextContent('90%');

    // The ungraded older attempt shows "80%", NOT "Pending Review"
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sub-1' } });
    await waitFor(() => {
      expect(screen.getByTestId('mywork-score-pill')).toHaveTextContent('80%');
    });
    expect(screen.queryByText(/pending review/i)).not.toBeInTheDocument();
  });

  it('shows "No answer submitted" for blocks unanswered in the selected attempt', async () => {
    const secondBlock: LessonBlock = {
      id: 'blk-sa-2',
      type: 'SHORT_ANSWER',
      content: 'What is friction?',
      title: 'Friction',
    } as LessonBlock;
    const latest = makeAttempt('sub-2', 2, 'Revised answer', 90);
    // Older attempt answered the first block but not the second.
    const older = makeAttempt('sub-1', 1, 'First answer', 55);
    getAssessmentAttemptsMock.mockResolvedValueOnce([latest, older]);

    renderWorkspace(latest, [shortAnswerBlock, secondBlock]);
    await openMyWork();
    expect(screen.getByText('Revised answer')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sub-1' } });
    await waitFor(() => {
      expect(screen.getByText('First answer')).toBeInTheDocument();
      // The unanswered block renders the muted empty state, not nothing.
      expect(screen.getByText(/no answer submitted/i)).toBeInTheDocument();
    });
  });

  it('falls back to the latest submission when the attempt fetch fails', async () => {
    const latest = makeAttempt('sub-1', 1, 'Only answer', 70);
    getAssessmentAttemptsMock.mockRejectedValueOnce(new Error('network'));

    renderWorkspace(latest);
    await openMyWork();

    await waitFor(() => {
      expect(screen.getByText('Only answer')).toBeInTheDocument();
    });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import RubricGradingPanel from '../../components/grading/RubricGradingPanel';
import StudentListPanel from '../../components/grading/StudentListPanel';
import type { StudentGroup } from '../../components/grading/gradingHelpers';
import type { Assignment, Submission, Rubric } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRubric(): Rubric {
  return {
    title: 'Quiz Rubric',
    rawMarkdown: '',
    questions: [{
      id: 'q1',
      questionLabel: 'Question 1',
      skills: [{
        id: 's1',
        name: 'Accuracy',
        tiers: [
          { label: 'Missing', percentage: 0, descriptor: 'No answer' },
          { label: 'Emerging', percentage: 50, descriptor: 'Partial' },
          { label: 'Developing', percentage: 100, descriptor: 'Full' },
        ],
      }],
    }],
  } as unknown as Rubric;
}

function makeAssignment(): Assignment {
  return { id: 'a1', title: 'Quiz', isAssessment: true, classType: 'PHYSICS', rubric: makeRubric() } as unknown as Assignment;
}

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1', userId: 'u1', userName: 'Student One', assignmentId: 'a1',
    assignmentTitle: 'Quiz', status: 'SUCCESS', score: 80,
    submittedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  } as unknown as Submission;
}

function makeGroup(latest: Submission): StudentGroup {
  return {
    userId: latest.userId,
    userName: latest.userName,
    userSection: undefined,
    submissions: [latest],
    latest,
    best: latest,
    bestGraded: null,
    attemptCount: 1,
    maxAttempts: undefined,
    isInProgress: false,
    hasRubricGrade: false,
    needsGrading: true,
    hasAISuggestion: false,
  };
}

function renderRubricPanel(sub: Submission, overrides: Partial<Parameters<typeof RubricGradingPanel>[0]> = {}) {
  const group = makeGroup(sub);
  return render(
    <RubricGradingPanel
      selectedGroup={group}
      sub={sub}
      selectedAssessment={makeAssignment()}
      rubricDraft={{}}
      hasActiveRubricDraft={false}
      feedbackDraft=""
      isSavingRubric={false}
      isReturning={false}
      viewingDraftUserId={null}
      draftUserIds={new Set()}
      unifiedList={[{ type: 'submitted', group }]}
      gradingStudentId={sub.userId}
      draftFeedbackDraft=""
      draftFeedbackMessages={[]}
      isSendingDraftFeedback={false}
      onFeedbackChange={() => {}}
      onDraftFeedbackChange={() => {}}
      onSendDraftFeedback={() => {}}
      onGradeChange={() => {}}
      baselineGrade={null}
      baselineAttemptNumber={0}
      onAcceptAllAI={() => {}}
      onDismissAISuggestion={() => {}}
      onSaveRubric={() => {}}
      onReturnToStudent={() => {}}
      onSelectStudent={() => {}}
      {...overrides}
    />,
  );
}

// ─── Edit 1: RETURNED attempt grading ────────────────────────────────────────

describe('RETURNED attempt grading UI', () => {
  it('renders clickable rubric tiers and a save footer for a RETURNED submission', async () => {
    const onGradeChange = vi.fn();
    const onSaveRubric = vi.fn();
    const sub = makeSubmission({ status: 'RETURNED' });
    renderRubricPanel(sub, { onGradeChange, onSaveRubric });

    // Returned notice shown
    expect(screen.getByText(/returned/i)).toBeInTheDocument();

    // RubricViewer is lazy-loaded inside a Suspense boundary — await it.
    // Question 1 starts expanded by default, so tiers are visible immediately.
    await waitFor(() => expect(screen.getByRole('button', { name: /Question 1/i })).toBeInTheDocument());

    // Rubric tiers render as clickable role="button" cells in grade mode,
    // each labeled "{label} ({pct}%): {descriptor}" (e.g. "Missing (0%): No answer").
    const tierButtons = screen.getAllByRole('button', { name: /\(0%\)|\(50%\)|\(100%\)/ });
    expect(tierButtons.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('button', { name: /Missing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Emerging/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Developing/i })).toBeInTheDocument();

    // Clickable: clicking a tier fires onGradeChange with the right args
    fireEvent.click(screen.getByRole('button', { name: /Emerging/i }));
    expect(onGradeChange).toHaveBeenCalledWith('q1', 's1', 1);

    // Save footer present ("Save Grade", not "Return to Student" which is hidden for RETURNED)
    const saveButton = screen.getByRole('button', { name: /Save grade/i });
    expect(saveButton).toBeInTheDocument();
    fireEvent.click(saveButton);
    expect(onSaveRubric).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Return to Student/i })).not.toBeInTheDocument();
  });
});

// ─── Edit 2: Long-name row layout ────────────────────────────────────────────

describe('StudentListPanel long-name row layout', () => {
  it('renders the badge container with flex-wrap and the name span with min-w-[60px]', () => {
    const longName = 'A Very Long Student Name That Would Definitely Overflow The Panel Width';
    const sub = makeSubmission({ userName: longName });
    const group = makeGroup(sub);
    render(
      <StudentListPanel
        assessmentId="a1"
        assessmentClassType="Physics"
        studentGroups={[group]}
        unifiedList={[{ type: 'submitted', group }]}
        hasDraftStudents={[]}
        notStartedStudents={[]}
        gradingStudentId={null}
        viewingDraftUserId={null}
        assessmentSortKey="name"
        assessmentSortDesc={false}
        assessmentSectionFilter=""
        availableSections={[]}
        onSort={() => {}}
        onSelectStudent={() => {}}
        onSelectDraft={() => {}}
        onSelectNotStarted={() => {}}
        selectedIds={new Set()}
        isBulkReturning={false}
        onToggleSelected={() => {}}
        onSelectAllVisible={() => {}}
        onClearSelection={() => {}}
        onBulkReturn={() => {}}
        onKeyboardNav={() => {}}
      />,
    );

    // Name span truncates with a minimum width and exposes a full-name tooltip
    const nameSpan = screen.getByText(longName);
    expect(nameSpan).toHaveClass('truncate');
    expect(nameSpan).toHaveClass('min-w-[60px]');
    expect(nameSpan).toHaveAttribute('title', longName);

    // Line-2 badge group wraps and right-justifies
    const badgeGroup = nameSpan.closest('.flex.items-center.gap-2')!.nextElementSibling as HTMLElement;
    expect(badgeGroup).toHaveClass('flex-wrap');
    expect(badgeGroup).toHaveClass('justify-end');
    expect(badgeGroup).toHaveClass('gap-1');
  });
});

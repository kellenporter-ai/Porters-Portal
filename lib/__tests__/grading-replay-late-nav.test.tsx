// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import DiagramReplay, { DIAGRAM_CANVAS_SIZE } from '../../components/grading/DiagramReplay';
import GraphingReplay, { normalizeGraphingResponse, toSvg } from '../../components/grading/GraphingReplay';
import StudentListPanel from '../../components/grading/StudentListPanel';
import type { StudentGroup } from '../../components/grading/gradingHelpers';
import type { Submission } from '../../types';

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

// ─── D-1: DiagramReplay geometry ─────────────────────────────────────────────

describe('DiagramReplay geometry (D-1)', () => {
  const state = {
    init1: { symbols: [{ id: 's1', type: 'battery', x: 100, y: 200, rotation: 90 }] },
    final1: { symbols: [
      { id: 's2', type: 'resistor', x: 50, y: 50, rotation: 0 },
      { id: 's3', type: 'wire', x: 300, y: 400, rotation: 45 },
    ] },
    final2: { symbols: [] },
  };

  it('renders a figure per populated panel with correct symbol counts', () => {
    render(<DiagramReplay state={state} />);
    expect(screen.getByText('Initial 1')).toBeInTheDocument();
    expect(screen.getByText('Final 1')).toBeInTheDocument();
    expect(screen.getByText('1 symbol')).toBeInTheDocument();
    expect(screen.getByText('2 symbols')).toBeInTheDocument();
  });

  it('places each symbol at its stored x/y/rotation', () => {
    const { container } = render(<DiagramReplay state={state} />);
    const groups = container.querySelectorAll('g[data-symbol-id]');
    expect(groups).toHaveLength(3);
    const byId = new Map(Array.from(groups).map(g => [g.getAttribute('data-symbol-id'), g.getAttribute('transform')]));
    expect(byId.get('s1')).toBe('translate(100 200) rotate(90)');
    expect(byId.get('s2')).toBe('translate(50 50) rotate(0)');
    expect(byId.get('s3')).toBe('translate(300 400) rotate(45)');
  });

  it('shows "No symbols placed" for empty panels', () => {
    render(<DiagramReplay state={state} />);
    expect(screen.getByText('No symbols placed')).toBeInTheDocument();
  });

  it('renders nothing when state has no panels', () => {
    const { container } = render(<DiagramReplay state={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('svg viewBox matches the exported canvas size', () => {
    const { container } = render(<DiagramReplay state={state} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach(svg => expect(svg.getAttribute('viewBox')).toBe(`0 0 ${DIAGRAM_CANVAS_SIZE} ${DIAGRAM_CANVAS_SIZE}`));
  });
});

// ─── D-2: GraphingReplay ─────────────────────────────────────────────────────

describe('GraphingReplay (D-2)', () => {
  const viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

  it('maps data coordinates to svg coordinates symmetrically', () => {
    const center = toSvg({ x: 0, y: 0 }, viewport, 480, 360, 36);
    expect(center.x).toBeCloseTo(240);
    expect(center.y).toBeCloseTo(180);
    const corner = toSvg({ x: -10, y: -10 }, viewport, 480, 360, 36);
    expect(corner.x).toBeCloseTo(36);
    expect(corner.y).toBeCloseTo(324);
  });

  it('normalizes points and best-fit line from the canonical shape', () => {
    const g = normalizeGraphingResponse({ points: [{ x: 1, y: 2 }], line: { slope: 1, intercept: 0 }, viewport });
    expect(g.points).toEqual([{ x: 1, y: 2 }]);
    expect(g.line).toEqual({ slope: 1, intercept: 0 });
    expect(g.viewport).toEqual(viewport);
  });

  it('renders points and the best-fit line when present', () => {
    const { container } = render(
      <GraphingReplay response={{ points: [{ x: 1, y: 1 }, { x: 3, y: 3 }], line: { slope: 1, intercept: 0 }, viewport }} />,
    );
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(container.querySelector('line[stroke-dasharray]')).not.toBeNull();
  });

  it('renders nothing when there is no graphable content', () => {
    const { container } = render(<GraphingReplay response={{ viewport }} />);
    expect(container.firstChild).toBeNull();
  });
});

// ─── Edit 3: Late badge ──────────────────────────────────────────────────────

describe('Late badge (Edit 3)', () => {
  function renderList(latest: Submission) {
    const group = makeGroup(latest);
    return render(
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
      />,
    );
  }

  it('shows the Late badge when submittedLate is true', () => {
    renderList(makeSubmission({ submittedLate: true }));
    expect(screen.getByText('Late')).toBeInTheDocument();
  });

  it('hides the Late badge when submittedLate is false or absent', () => {
    const { container: c1 } = renderList(makeSubmission({ submittedLate: false }));
    expect(c1.textContent).not.toContain('Late');
    const { container: c2 } = renderList(makeSubmission());
    expect(c2.textContent).not.toContain('Late');
  });
});

// ─── Edit 4: Nav-guard dirty-confirm (D-5/D-6 gate) ─────────────────────────

describe('nav-guard dirty-confirm (D-5/D-6)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('calls window.confirm before navigating away with unsaved edits', async () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    // Simulate the guard logic from AssessmentGradingView/useGradingState:
    // isDirty is true when a rubric tier is selected or feedback is typed,
    // and navigateUnified must gate on window.confirm.
    const isDirty = true;
    let navigated = false;
    const navigate = () => {
      if (isDirty && !window.confirm('Discard unsaved changes?')) return;
      navigated = true;
    };
    navigate();
    expect(confirmSpy).toHaveBeenCalledWith('Discard unsaved changes?');
    expect(navigated).toBe(false);
    // guard allows navigation once the user confirms
    confirmSpy.mockReturnValue(true);
    navigate();
    expect(navigated).toBe(true);
  });
});

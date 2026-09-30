// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LocaleProvider } from '../i18n';
import { ToastProvider } from '../../components/ToastProvider';
import { DrawingReplay, MathStepsReplay, BarChartReplay } from '../../components/responseReplay';
import AssessmentWorkspace from '../../components/AssessmentWorkspace';
import type { LessonBlock, Submission } from '../../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const drawingBlock: LessonBlock = {
  id: 'blk-draw',
  type: 'DRAWING',
  content: 'Draw a free-body diagram.',
  title: 'Free-Body Diagram',
  canvasHeight: 300,
} as LessonBlock;

const drawingResponse = {
  elements: [
    { type: 'stroke', points: [{ x: 10, y: 10 }, { x: 100, y: 80 }], color: '#000', width: 2 },
    { type: 'text', position: { x: 50, y: 40 }, text: 'F_g', color: '#000', fontSize: 14 },
  ],
  submitted: true,
};

const mathBlock: LessonBlock = {
  id: 'blk-math',
  type: 'MATH_RESPONSE',
  content: 'Solve for x.',
  title: 'Algebra Steps',
} as LessonBlock;

const mathResponse = {
  steps: [{ label: 'Step 1', latex: 'x + 2 = 5', input: 'x + 2 = 5' }],
  submitted: true,
};

const chartBlock: LessonBlock = {
  id: 'blk-chart',
  type: 'BAR_CHART',
  content: 'Chart the data.',
  title: 'Bar Chart',
} as LessonBlock;

const chartResponse = {
  initial: [{ value: 3, labelHTML: 'A' }],
  final: [{ value: 5, labelHTML: 'B' }],
  submitted: true,
};

function makeSubmission(blockResponses: Record<string, unknown>): Submission {
  return {
    id: 'sub-1',
    userId: 'u1',
    blockResponses,
  } as unknown as Submission;
}

const assessmentResult = {
  correct: 1,
  total: 1,
  percentage: 100,
  perBlock: {},
  attemptNumber: 1,
  status: 'SUCCESS',
  xpEarned: 0,
};

function renderMyWork(blocks: LessonBlock[], submission: Submission) {
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

// ─── DrawingReplay (unit) ────────────────────────────────────────────────────

describe('DrawingReplay', () => {
  it('renders an svg with one path per multi-point stroke', () => {
    const { container } = render(
      <svg>
        <DrawingReplay elements={drawingResponse.elements as Array<Record<string, unknown>>} canvasHeight={300} blockId="blk-draw" />
      </svg>,
    );
    const svg = container.querySelector('svg svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll('path')).toHaveLength(1);
    expect(svg!.querySelector('text')?.textContent).toBe('F_g');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 820 320');
  });

  it('respects canvasHeight in the viewBox', () => {
    const { container } = render(
      <DrawingReplay elements={[{ type: 'stroke', points: [{ x: 5, y: 5 }, { x: 20, y: 20 }] }]} canvasHeight={500} />,
    );
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 820 520');
  });
});

// ─── MathStepsReplay / BarChartReplay (unit smoke) ───────────────────────────

describe('MathStepsReplay and BarChartReplay', () => {
  it('renders a row per math step', () => {
    const { container } = render(<MathStepsReplay steps={mathResponse.steps} />);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(container.querySelectorAll('.flex.items-start')).toHaveLength(1);
  });

  it('renders non-empty bar chart sections only', () => {
    const { container } = render(<BarChartReplay chartData={chartResponse} />);
    const sections = Array.from(container.querySelectorAll('span.font-bold')).map(s => s.textContent);
    expect(sections).toContain('initial');
    expect(sections).toContain('final');
    expect(sections).not.toContain('delta');
  });
});

// ─── MyWorkPanel rich rendering (integration) ────────────────────────────────

describe('MyWorkPanel rich block rendering', () => {
  it('renders a drawing submission as svg, not raw JSON', () => {
    const { container } = renderMyWork([drawingBlock], makeSubmission({ 'blk-draw': drawingResponse }));
    expect(screen.getByText('Free-Body Diagram')).toBeInTheDocument();
    const card = container.querySelector('.rounded-xl.border');
    expect(card).not.toBeNull();
    expect(card!.querySelector('svg')).not.toBeNull();
    // The literal payload keys must not appear as dumped JSON.
    expect(card!.textContent).not.toContain('"elements"');
    expect(card!.textContent).not.toContain('submitted');
  });

  it('renders a math-steps submission as steps, not raw JSON', () => {
    const { container } = renderMyWork([mathBlock], makeSubmission({ 'blk-math': mathResponse }));
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    const card = container.querySelector('.rounded-xl.border');
    expect(card!.textContent).not.toContain('"steps"');
    expect(card!.textContent).not.toContain('submitted');
  });

  it('renders a bar-chart submission as bars, not raw JSON', () => {
    const { container } = renderMyWork([chartBlock], makeSubmission({ 'blk-chart': chartResponse }));
    const card = container.querySelector('.rounded-xl.border');
    expect(card!.querySelectorAll('div.flex.flex-col.items-center').length).toBeGreaterThan(0);
    expect(card!.textContent).not.toContain('"initial"');
    expect(card!.textContent).not.toContain('submitted');
  });

  it('keeps formatResponse text path for plain block types', () => {
    const shortAnswerBlock = { id: 'blk-sa', type: 'SHORT_ANSWER', content: 'Why?', title: 'Short Answer' } as LessonBlock;
    const { container } = renderMyWork(
      [shortAnswerBlock],
      makeSubmission({ 'blk-sa': { answer: 'Because gravity.' } }),
    );
    expect(screen.getByText('Because gravity.')).toBeInTheDocument();
    const card = container.querySelector('.rounded-xl.border');
    expect(card!.querySelector('svg')).toBeNull();
  });

  it('falls back to formatResponse for a drawing block with no elements payload', () => {
    const { container } = renderMyWork([drawingBlock], makeSubmission({ 'blk-draw': { submitted: true } }));
    const card = container.querySelector('.rounded-xl.border');
    expect(card!.querySelector('svg')).toBeNull();
    expect(card!.textContent).not.toContain('"elements"');
  });
});

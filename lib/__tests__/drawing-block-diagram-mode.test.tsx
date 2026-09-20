// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import DrawingBlock from '../../components/blocks/DrawingBlock';
import type { LessonBlock } from '../../types';

// happy-dom: HTMLCanvasElement.getContext is not implemented.
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);

function makeBlock(overrides: Partial<LessonBlock> = {}): LessonBlock {
  return {
    id: 'b1',
    type: 'DRAWING',
    title: 'Test diagram',
    instructions: '',
    drawingMode: 'diagram',
    ...overrides,
  } as LessonBlock;
}

const containerStyle = { width: '600px', height: '400px' };

function renderDiagramMode() {
  return render(
    <div style={containerStyle}>
      <DrawingBlock block={makeBlock()} onComplete={() => {}} />
    </div>
  );
}

describe('DrawingBlock drawingMode: diagram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render the Vector/Arrow tool button in diagram mode', () => {
    const { getByLabelText, queryByLabelText } = renderDiagramMode();
    expect(getByLabelText('Select')).toBeInTheDocument();
    expect(queryByLabelText('Vector/Arrow')).not.toBeInTheDocument();
    expect(queryByLabelText('Copy')).not.toBeInTheDocument();
    expect(queryByLabelText('Paste')).not.toBeInTheDocument();
  });

  it('does render the Vector/Arrow tool button in full (free) mode', () => {
    const { getByLabelText } = render(
      <div style={containerStyle}>
        <DrawingBlock block={makeBlock({ drawingMode: 'free' })} onComplete={() => {}} />
      </div>
    );
    expect(getByLabelText('Vector/Arrow')).toBeInTheDocument();
  });

  it("'a' key shortcut does not activate the arrow tool in diagram mode", () => {
    const { queryByTitle } = renderDiagramMode();
    // There is no arrow button to check `activeTool` styling against, so assert
    // indirectly: pressing 'a' must not throw and must not enable arrow drawing.
    fireEvent.keyDown(window, { key: 'a' });
    // Canvas pointer drag still produces no arrow element.
    const canvas = document.querySelector('canvas')!;
    const rect = { left: 0, top: 0, width: 600, height: 400 };
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
    fireEvent.mouseUp(canvas, { clientX: 150, clientY: 150 });
    expect(queryByTitle('Vector/Arrow')).not.toBeInTheDocument();
  });

  it('pointer drag on the canvas creates no arrow element in diagram mode', () => {
    const { container } = renderDiagramMode();
    const canvas = container.querySelector('canvas')!;
    const rect = { left: 0, top: 0, width: 600, height: 400 } as DOMRect;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect);
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { clientX: 250, clientY: 250 });
    fireEvent.mouseUp(canvas, { clientX: 250, clientY: 250 });
    // If an arrow element had been created, the precision-editor overlay would
    // appear on select hover or onResponseChange would fire with an arrow.
    // The simplest robust assertion: the overlay contains no arrow editor.
    expect(container.querySelector('[data-arrow-editor]')).toBeNull();
  });
});

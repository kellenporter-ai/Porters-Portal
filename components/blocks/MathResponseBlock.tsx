import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, X, ChevronUp, ChevronDown, Pencil, Calculator } from 'lucide-react';
import katex from 'katex';
import { LessonBlock } from '../../types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface MathStep {
  label: string;
  latex: string;
}

interface MathResponse {
  steps: MathStep[];
  submitted: boolean;
}

interface MathResponseBlockProps {
  block: LessonBlock;
  onComplete: (correct: boolean) => void;
  savedResponse?: MathResponse;
  onResponseChange?: (response: unknown) => void;
}

// ──────────────────────────────────────────────
// Symbol toolbar definitions
// ──────────────────────────────────────────────

interface SymbolEntry {
  display: string;
  latex: string;
  title: string;
}

const SYMBOL_GROUPS: { label: string; symbols: SymbolEntry[] }[] = [
  {
    label: 'Greek',
    symbols: [
      { display: 'Σ', latex: '\\Sigma', title: 'Sigma (summation)' },
      { display: 'Δ', latex: '\\Delta', title: 'Delta (change)' },
      { display: 'θ', latex: '\\theta', title: 'Theta (angle)' },
      { display: 'α', latex: '\\alpha', title: 'Alpha' },
      { display: 'μ', latex: '\\mu', title: 'Mu (micro/mean)' },
      { display: 'ω', latex: '\\omega', title: 'Omega (angular velocity)' },
    ],
  },
  {
    label: 'Operators',
    symbols: [
      { display: '×', latex: '\\times', title: 'Multiplication' },
      { display: '÷', latex: '\\div', title: 'Division' },
      { display: '±', latex: '\\pm', title: 'Plus-minus' },
      { display: '→', latex: '\\rightarrow', title: 'Right arrow' },
      { display: '≈', latex: '\\approx', title: 'Approximately equal' },
      { display: '≠', latex: '\\neq', title: 'Not equal' },
    ],
  },
  {
    label: 'Structures',
    symbols: [
      { display: 'a/b', latex: '\\frac{}{}', title: 'Fraction' },
      { display: '√', latex: '\\sqrt{}', title: 'Square root' },
      { display: 'x₁', latex: '_{}', title: 'Subscript' },
      { display: 'x²', latex: '^{}', title: 'Superscript' },
      { display: 'x̄', latex: '\\overline{}', title: 'Overline (mean)' },
    ],
  },
  {
    label: 'Units',
    symbols: [
      { display: 'm/s', latex: '\\text{ m/s}', title: 'Meters per second' },
      { display: 'm/s²', latex: '\\text{ m/s}^2', title: 'Meters per second squared' },
      { display: 'N', latex: '\\text{ N}', title: 'Newtons' },
      { display: 'kg', latex: '\\text{ kg}', title: 'Kilograms' },
      { display: 'J', latex: '\\text{ J}', title: 'Joules' },
    ],
  },
];

// ──────────────────────────────────────────────
// KaTeX preview helper
// ──────────────────────────────────────────────

function renderLatex(latex: string): string {
  if (!latex.trim()) return '';
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: true });
  } catch {
    return '<span class="text-red-400 text-xs">Invalid LaTeX</span>';
  }
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

const MathResponseBlock: React.FC<MathResponseBlockProps> = ({
  block,
  onComplete,
  savedResponse,
  onResponseChange,
}) => {
  const maxSteps = block.maxSteps ?? 10;
  const stepLabels = block.stepLabels ?? ['Given:', 'Find:', 'Solve:', 'Step 1:', 'Step 2:', 'Step 3:'];

  const [steps, setSteps] = useState<MathStep[]>(
    savedResponse?.steps?.length
      ? savedResponse.steps
      : [{ label: stepLabels[0] || 'Step 1:', latex: '' }]
  );
  const [submitted, setSubmitted] = useState(savedResponse?.submitted ?? false);

  // Track which input is focused
  const focusedInputRef = useRef<{ index: number; el: HTMLInputElement | null }>({
    index: 0,
    el: null,
  });
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Sync inputRefs array length
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, steps.length);
  }, [steps.length]);

  // Notify parent of changes
  const emitChange = useCallback(
    (newSteps: MathStep[], isSubmitted: boolean) => {
      onResponseChange?.({ steps: newSteps, submitted: isSubmitted });
    },
    [onResponseChange]
  );

  // ── Step mutations ──

  const updateStep = useCallback(
    (index: number, field: keyof MathStep, value: string) => {
      setSteps(prev => {
        const next = prev.map((s, i) => (i === index ? { ...s, [field]: value } : s));
        emitChange(next, false);
        return next;
      });
    },
    [emitChange]
  );

  const addStep = useCallback(() => {
    if (steps.length >= maxSteps) return;
    const nextLabel =
      stepLabels[steps.length] || `Step ${steps.length + 1}:`;
    setSteps(prev => {
      const next = [...prev, { label: nextLabel, latex: '' }];
      emitChange(next, false);
      return next;
    });
    // Focus the new input after render
    setTimeout(() => {
      inputRefs.current[steps.length]?.focus();
    }, 50);
  }, [steps.length, maxSteps, stepLabels, emitChange]);

  const removeStep = useCallback(
    (index: number) => {
      if (steps.length <= 1) return;
      setSteps(prev => {
        const next = prev.filter((_, i) => i !== index);
        emitChange(next, false);
        return next;
      });
    },
    [steps.length, emitChange]
  );

  const moveStep = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= steps.length) return;
      setSteps(prev => {
        const next = [...prev];
        [next[index], next[target]] = [next[target], next[index]];
        emitChange(next, false);
        return next;
      });
    },
    [steps.length, emitChange]
  );

  // ── Symbol insertion ──

  const insertSymbol = useCallback(
    (latex: string) => {
      const idx = focusedInputRef.current.index;
      const el = focusedInputRef.current.el ?? inputRefs.current[steps.length - 1];
      if (!el) {
        // Fallback: append to last step
        updateStep(steps.length - 1, 'latex', steps[steps.length - 1].latex + latex);
        return;
      }

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const before = el.value.slice(0, start);
      const after = el.value.slice(end);
      const newValue = before + latex + after;

      // Update step state
      const stepIndex = inputRefs.current.indexOf(el);
      const actualIndex = stepIndex >= 0 ? stepIndex : idx;
      updateStep(actualIndex, 'latex', newValue);

      // Position cursor inside first {} if present
      const bracePos = latex.indexOf('{}');
      const cursorPos = bracePos >= 0 ? start + bracePos + 1 : start + latex.length;

      // Restore focus and cursor after React re-render
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [steps, updateStep]
  );

  // ── Submit / Edit ──

  const handleSubmit = useCallback(() => {
    const hasContent = steps.some(s => s.latex.trim());
    if (!hasContent) return;
    setSubmitted(true);
    emitChange(steps, true);
    onComplete(true); // Math responses are self-assessed; always mark complete
  }, [steps, emitChange, onComplete]);

  const handleEdit = useCallback(() => {
    setSubmitted(false);
    emitChange(steps, false);
  }, [steps, emitChange]);

  // ── Render ──

  return (
    <div className="space-y-4">
      {/* Question / Prompt */}
      <div className="space-y-1">
        {block.title && (
          <p className="text-sm text-white font-medium flex items-center gap-2">
            <Calculator className="w-4 h-4 text-purple-400 shrink-0" />
            {block.title}
          </p>
        )}
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
          {block.content}
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className="group flex flex-col md:flex-row gap-2 items-start"
          >
            {/* Reorder buttons */}
            <div className="flex flex-col gap-0.5 pt-1.5 shrink-0">
              <button
                type="button"
                onClick={() => moveStep(index, -1)}
                disabled={index === 0 || submitted}
                className="p-0.5 text-gray-500 hover:text-purple-400 disabled:opacity-20 transition"
                title="Move step up"
                aria-label={`Move step ${index + 1} up`}
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => moveStep(index, 1)}
                disabled={index === steps.length - 1 || submitted}
                className="p-0.5 text-gray-500 hover:text-purple-400 disabled:opacity-20 transition"
                title="Move step down"
                aria-label={`Move step ${index + 1} down`}
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Label input (combobox-style) */}
            <div className="shrink-0 w-28">
              <label className="sr-only" htmlFor={`step-label-${index}`}>
                Step {index + 1} label
              </label>
              <input
                id={`step-label-${index}`}
                list={`step-labels-${index}`}
                value={step.label}
                onChange={e => updateStep(index, 'label', e.target.value)}
                disabled={submitted}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-purple-300 font-medium placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
                placeholder="Label"
              />
              <datalist id={`step-labels-${index}`}>
                {stepLabels.map((lbl, i) => (
                  <option key={i} value={lbl} />
                ))}
              </datalist>
            </div>

            {/* LaTeX input */}
            <div className="flex-1 min-w-0">
              <label className="sr-only" htmlFor={`step-latex-${index}`}>
                Step {index + 1} LaTeX input
              </label>
              <input
                id={`step-latex-${index}`}
                ref={el => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                value={step.latex}
                onChange={e => updateStep(index, 'latex', e.target.value)}
                onFocus={e => {
                  focusedInputRef.current = { index, el: e.currentTarget };
                }}
                onKeyDown={e => {
                  if (e.key === 'Tab' && !e.shiftKey && index < steps.length - 1) {
                    // Natural tab will move to next input — no need to prevent
                  }
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                disabled={submitted}
                placeholder="Enter LaTeX (e.g. F = ma)"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
              />
            </div>

            {/* KaTeX preview */}
            <div
              className="flex-1 min-w-0 bg-white/5 rounded-lg p-2 min-h-[36px] flex items-center overflow-x-auto"
              aria-live="polite"
              aria-label={`Preview for step ${index + 1}`}
            >
              {step.latex.trim() ? (
                <div
                  className="text-white w-full katex-preview"
                  dangerouslySetInnerHTML={{ __html: renderLatex(step.latex) }}
                />
              ) : (
                <span className="text-gray-600 text-xs italic">
                  Preview will appear here
                </span>
              )}
            </div>

            {/* Delete button */}
            {!submitted && steps.length > 1 && (
              <button
                type="button"
                onClick={() => removeStep(index)}
                className="p-1.5 text-gray-500 hover:text-red-400 transition shrink-0 opacity-0 group-hover:opacity-100"
                title="Remove this step"
                aria-label={`Remove step ${index + 1}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Step button */}
      {!submitted && steps.length < maxSteps && (
        <button
          type="button"
          onClick={addStep}
          className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-xs font-medium transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Step
        </button>
      )}

      {/* Symbol Toolbar */}
      {block.showLatexHelp && !submitted && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">
            Insert Symbol
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 overflow-x-auto pb-1">
            {SYMBOL_GROUPS.map(group => (
              <div key={group.label} className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500 mr-1 shrink-0">
                  {group.label}
                </span>
                {group.symbols.map(sym => (
                  <button
                    key={sym.latex}
                    type="button"
                    onClick={() => insertSymbol(sym.latex)}
                    title={`${sym.title} — inserts ${sym.latex}`}
                    className="px-1.5 py-0.5 text-xs bg-white/5 hover:bg-purple-500/20 text-gray-300 hover:text-white rounded-full transition whitespace-nowrap"
                  >
                    {sym.display}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit / Edit */}
      <div className="flex items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!steps.some(s => s.latex.trim())}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shrink-0"
          >
            Submit
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-green-400 font-bold">Submitted</span>
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-purple-400 transition"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MathResponseBlock;

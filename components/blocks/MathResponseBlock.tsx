import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, X, ChevronUp, ChevronDown, Pencil, Calculator } from 'lucide-react';
import katex from 'katex';
import { LessonBlock } from '../../types';
import { BlockText } from '../../lib/blockText';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface MathStep {
  label: string;
  latex: string;
  input?: string; // natural math input (what student typed)
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
  readOnly?: boolean;
}

// ──────────────────────────────────────────────
// Natural Math → LaTeX Converter
// ──────────────────────────────────────────────

// Detect plain English text lines — monotonic: once a 4+ char word exists, stays detected.
// This prevents flicker where detection toggles as the student types mid-sentence.
function isPlainTextLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 4) return false;
  if (/[=^_{}()\[\]/\\]/.test(trimmed)) return false;
  if (/[\u0370-\u03FF\u00B2\u00B3\u00D7\u00F7\u00B1\u2248\u2260\u2265\u2264\u2192]/.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return false;
  // Require at least one word 4+ chars — clearly English, not a variable name.
  // Once a student types "writing" or "force" etc., detection is stable.
  return tokens.some(t => t.length >= 4);
}

// Normalize LaTeX command boundaries: \SigmaF → \Sigma F
// KaTeX parses \SigmaF as one unknown command; we split at known command boundaries.
const KNOWN_LATEX_COMMANDS = new Set([
  'alpha','beta','gamma','delta','epsilon','zeta','eta','theta','iota','kappa',
  'lambda','mu','nu','xi','pi','rho','sigma','tau','upsilon','phi','chi','psi','omega',
  'Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa',
  'Lambda','Mu','Nu','Xi','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega',
  'times','div','cdot','pm','approx','neq','geq','leq','rightarrow','leftarrow',
  'infty','sqrt','frac','text','sin','cos','tan','log','ln','vec','hat','bar',
  'dot','ddot','partial','nabla','sum','prod','int','oint','lim','max','min',
  'circ','perp','angle','parallel',
]);

function normalizeLatexCommands(s: string): string {
  return s.replace(/\\([a-zA-Z]+)/g, (_match, word) => {
    if (KNOWN_LATEX_COMMANDS.has(word)) return `\\${word}`;
    // Try to find a known command prefix (longest match first)
    for (let len = word.length - 1; len >= 2; len--) {
      if (KNOWN_LATEX_COMMANDS.has(word.slice(0, len))) {
        return `\\${word.slice(0, len)} ${word.slice(len)}`;
      }
    }
    return `\\${word}`;
  });
}

function naturalToLatex(input: string): string {
  if (!input.trim()) return '';

  // Explicit text prefix: "// some comment" → \text{some comment}
  if (input.trimStart().startsWith('//')) {
    const text = input.trimStart().slice(2).trim();
    return text ? `\\text{${text}}` : '';
  }

  // Inline comment: "F = ma // because Newton" → F = ma \text{ because Newton}
  const commentIdx = input.indexOf('//');
  if (commentIdx > 0) {
    const mathPart = input.slice(0, commentIdx).trim();
    const textPart = input.slice(commentIdx + 2).trim();
    const mathLatex = mathPart ? naturalToLatex(mathPart) : '';
    const textLatex = textPart ? `\\text{ ${textPart}}` : '';
    return mathLatex + textLatex;
  }

  // Auto-detect English text lines (no math indicators, has a 4+ char word)
  if (isPlainTextLine(input)) {
    return `\\text{${input.trim()}}`;
  }

  // If input already contains LaTeX commands, normalize boundaries then pass through
  // e.g. \SigmaF → \Sigma F so KaTeX doesn't see an unknown command
  if (input.includes('\\')) return normalizeLatexCommands(input);

  let s = input;

  // 1. Unicode Greek → LaTeX (trailing space terminates command name, matches operator convention)
  const greekMap: [string, string][] = [
    ['\u03B8', '\\theta '], ['\u0398', '\\Theta '],
    ['\u03B1', '\\alpha '], ['\u03B2', '\\beta '], ['\u03B3', '\\gamma '],
    ['\u0394', '\\Delta '], ['\u03B4', '\\delta '],
    ['\u03BC', '\\mu '], ['\u03C9', '\\omega '], ['\u03A9', '\\Omega '],
    ['\u03C0', '\\pi '], ['\u03C3', '\\sigma '], ['\u03A3', '\\Sigma '],
    ['\u03BB', '\\lambda '], ['\u03C1', '\\rho '], ['\u03C4', '\\tau '], ['\u03C6', '\\phi '],
    ['\u221E', '\\infty '],
  ];
  for (const [char, latex] of greekMap) {
    s = s.split(char).join(latex);
  }

  // 2. Unicode operators → LaTeX
  s = s.split('\u00D7').join('\\times ');
  s = s.split('\u00F7').join('\\div ');
  s = s.split('\u00B7').join('\\cdot ');
  s = s.split('\u00B1').join('\\pm ');
  s = s.split('\u2248').join('\\approx ');
  s = s.split('\u2260').join('\\neq ');
  s = s.split('\u2265').join('\\geq ');
  s = s.split('\u2264').join('\\leq ');
  s = s.split('\u2192').join('\\rightarrow ');
  s = s.split('\u00B2').join('^{2}');
  s = s.split('\u00B3').join('^{3}');

  // 3. Text operator shortcuts
  s = s.replace(/>=/g, '\\geq ');
  s = s.replace(/<=/g, '\\leq ');
  s = s.replace(/!=/g, '\\neq ');
  s = s.replace(/->/g, '\\rightarrow ');

  // 4. Trig/log functions
  s = s.replace(/\b(sin|cos|tan|log|ln)\b/g, '\\$1');

  // 5. sqrt(expr)
  s = s.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');

  // 6. Units BEFORE fractions (protect m/s etc. from becoming fractions)
  const unitPatterns: [RegExp, string][] = [
    [/([\d.]+)\s*m\/s\^2/g, '$1\\text{ m/s}^{2}'],
    [/([\d.]+)\s*m\/s(?!\^)/g, '$1\\text{ m/s}'],
    [/([\d.]+)\s*rad\/s\^2/g, '$1\\text{ rad/s}^{2}'],
    [/([\d.]+)\s*rad\/s(?!\^)/g, '$1\\text{ rad/s}'],
    [/([\d.]+)\s*km\/h/g, '$1\\text{ km/h}'],
    [/([\d.]+)\s*kg\b/g, '$1\\text{ kg}'],
    [/([\d.]+)\s*N\b/g, '$1\\text{ N}'],
    [/([\d.]+)\s*J\b/g, '$1\\text{ J}'],
    [/([\d.]+)\s*W\b(?![a-z])/g, '$1\\text{ W}'],
    [/([\d.]+)\s*Hz\b/g, '$1\\text{ Hz}'],
    [/([\d.]+)\s*Pa\b/g, '$1\\text{ Pa}'],
    [/([\d.]+)\s*m\b(?![\w/])/g, '$1\\text{ m}'],
    [/([\d.]+)\s*s\b(?![\w/])/g, '$1\\text{ s}'],
  ];
  for (const [re, repl] of unitPatterns) {
    s = s.replace(re, repl);
  }

  // 7. Fractions
  // Parenthesized: (expr)/(expr)
  s = s.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
  // Simple: token/token (not inside \text{})
  s = s.replace(/(?<![\\{])([\w.]+)\/([\w.]+)(?![^{]*\})/g, (_match, a, b) => {
    // Don't convert unit-like patterns that weren't caught above
    if (/^(m|km|rad)$/.test(a) && /^(s|h)$/.test(b)) return _match;
    return `\\frac{${a}}{${b}}`;
  });

  // 8. Exponents
  s = s.replace(/\^\(([^)]+)\)/g, '^{$1}');
  s = s.replace(/\^([\d.]+)/g, '^{$1}');
  s = s.replace(/\^([a-zA-Z])/g, '^{$1}');

  // 9. Subscripts
  s = s.replace(/_\(([^)]+)\)/g, '_{$1}');
  s = s.replace(/_(\d+)/g, '_{$1}');
  s = s.replace(/_([a-zA-Z])/g, '_{$1}');

  // 10. Multiplication: * → \cdot
  s = s.replace(/\*/g, '\\cdot ');

  return s;
}

// ──────────────────────────────────────────────
// KaTeX preview helper
// ──────────────────────────────────────────────

function renderLatex(latex: string): string {
  if (!latex.trim()) return '';
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: true });
  } catch {
    return '<span class="text-red-400 text-xs">Could not render — check your expression</span>';
  }
}

// ──────────────────────────────────────────────
// Toolbar definitions
// ──────────────────────────────────────────────

interface ToolbarButton {
  display: string;
  insert: string;
  title: string;
}

const TOOLBAR_GROUPS: { label: string; buttons: ToolbarButton[] }[] = [
  {
    label: 'Operations',
    buttons: [
      { display: '+', insert: ' + ', title: 'Addition' },
      { display: '\u2212', insert: ' - ', title: 'Subtraction' },
      { display: '\u00D7', insert: ' \u00D7 ', title: 'Multiplication' },
      { display: '\u00F7', insert: ' \u00F7 ', title: 'Division' },
      { display: '=', insert: ' = ', title: 'Equals' },
      { display: '\u00B1', insert: '\u00B1', title: 'Plus-minus' },
      { display: '\u2248', insert: ' \u2248 ', title: 'Approximately' },
      { display: '\u2260', insert: ' \u2260 ', title: 'Not equal' },
      { display: '\u2265', insert: ' \u2265 ', title: 'Greater or equal' },
      { display: '\u2264', insert: ' \u2264 ', title: 'Less or equal' },
      { display: '\u2192', insert: ' \u2192 ', title: 'Arrow' },
    ],
  },
  {
    label: 'Greek',
    buttons: [
      { display: '\u03B8', insert: '\u03B8', title: 'Theta (angle)' },
      { display: '\u0394', insert: '\u0394', title: 'Delta (change)' },
      { display: '\u03BC', insert: '\u03BC', title: 'Mu' },
      { display: '\u03C9', insert: '\u03C9', title: 'Omega' },
      { display: '\u03B1', insert: '\u03B1', title: 'Alpha' },
      { display: '\u03A3', insert: '\u03A3', title: 'Sigma (sum)' },
      { display: '\u03C0', insert: '\u03C0', title: 'Pi' },
      { display: '\u03BB', insert: '\u03BB', title: 'Lambda' },
      { display: '\u03C4', insert: '\u03C4', title: 'Tau (torque)' },
    ],
  },
  {
    label: 'Units',
    buttons: [
      { display: 'm/s', insert: ' m/s', title: 'Meters per second' },
      { display: 'm/s\u00B2', insert: ' m/s^2', title: 'Meters per second squared' },
      { display: 'N', insert: ' N', title: 'Newtons' },
      { display: 'kg', insert: ' kg', title: 'Kilograms' },
      { display: 'J', insert: ' J', title: 'Joules' },
      { display: 'W', insert: ' W', title: 'Watts' },
      { display: 'm', insert: ' m', title: 'Meters' },
      { display: 's', insert: ' s', title: 'Seconds' },
      { display: 'Hz', insert: ' Hz', title: 'Hertz' },
    ],
  },
];

// ──────────────────────────────────────────────
// Structure definitions (open inline forms)
// ──────────────────────────────────────────────

type StructureType = 'fraction' | 'sqrt' | 'power' | 'subscript';

interface StructureConfig {
  label: string;
  display: string;
  title: string;
  fields: { key: string; label: string; placeholder: string }[];
  build: (values: Record<string, string>) => string;
}

const STRUCTURES: Record<StructureType, StructureConfig> = {
  fraction: {
    label: 'Fraction',
    display: 'a/b',
    title: 'Insert a fraction',
    fields: [
      { key: 'top', label: 'Top', placeholder: 'numerator' },
      { key: 'bottom', label: 'Bottom', placeholder: 'denominator' },
    ],
    build: v => `(${v.top || '?'})/(${v.bottom || '?'})`,
  },
  sqrt: {
    label: 'Root',
    display: '\u221Ax',
    title: 'Insert a square root',
    fields: [
      { key: 'value', label: 'Value', placeholder: 'expression' },
    ],
    build: v => `sqrt(${v.value || '?'})`,
  },
  power: {
    label: 'Exponent',
    display: 'x\u00B2',
    title: 'Insert an exponent',
    fields: [
      { key: 'base', label: 'Base', placeholder: 'x' },
      { key: 'exp', label: 'Power', placeholder: '2' },
    ],
    build: v => `${v.base || '?'}^(${v.exp || '?'})`,
  },
  subscript: {
    label: 'Subscript',
    display: 'x\u2081',
    title: 'Insert a subscript',
    fields: [
      { key: 'variable', label: 'Variable', placeholder: 'v' },
      { key: 'sub', label: 'Subscript', placeholder: 'i' },
    ],
    build: v => `${v.variable || '?'}_(${v.sub || '?'})`,
  },
};

const STRUCTURE_KEYS: StructureType[] = ['fraction', 'sqrt', 'power', 'subscript'];

// ──────────────────────────────────────────────
// Physics formula templates
// ──────────────────────────────────────────────

const TEMPLATES: { display: string; insert: string; title: string; category: string }[] = [
  // Kinematics
  { display: 'v = \u0394x/\u0394t', insert: 'v = (x_f - x_i)/(t_f - t_i)', title: 'Average Velocity', category: 'Kinematics' },
  { display: 'a = \u0394v/\u0394t', insert: 'a = (v_f - v_i)/(t_f - t_i)', title: 'Average Acceleration', category: 'Kinematics' },
  { display: 'x = x\u2080 + v\u2080t + \u00BDat\u00B2', insert: 'x = x_0 + v_0 \u00D7 t + (1)/(2) \u00D7 a \u00D7 t^2', title: 'Position (constant accel)', category: 'Kinematics' },
  { display: 'v = v\u2080 + at', insert: 'v = v_0 + a \u00D7 t', title: 'Velocity (constant accel)', category: 'Kinematics' },
  { display: 'v\u00B2 = v\u2080\u00B2 + 2a\u0394x', insert: 'v^2 = v_0^2 + 2 \u00D7 a \u00D7 \u0394x', title: 'Velocity squared (no time)', category: 'Kinematics' },

  // Forces
  { display: '\u03A3F = ma', insert: '\u03A3F = m \u00D7 a', title: "Newton's Second Law", category: 'Forces' },
  { display: 'F\u0066 = \u03BCF\u2099', insert: 'F_f = \u03BC \u00D7 F_N', title: 'Friction', category: 'Forces' },
  { display: 'F\u0067 = mg', insert: 'F_g = m \u00D7 g', title: 'Weight', category: 'Forces' },
  { display: 'F\u209B = -kx', insert: 'F_s = -k \u00D7 x', title: "Hooke's Law", category: 'Forces' },

  // Energy
  { display: 'KE = \u00BDmv\u00B2', insert: 'KE = (1)/(2) \u00D7 m \u00D7 v^2', title: 'Kinetic Energy', category: 'Energy' },
  { display: 'PE\u0067 = mgh', insert: 'PE_g = m \u00D7 g \u00D7 h', title: 'Gravitational PE', category: 'Energy' },
  { display: 'PE\u209B = \u00BDkx\u00B2', insert: 'PE_s = (1)/(2) \u00D7 k \u00D7 x^2', title: 'Spring PE', category: 'Energy' },
  { display: 'W = Fd cos\u03B8', insert: 'W = F \u00D7 d \u00D7 cos(\u03B8)', title: 'Work', category: 'Energy' },
  { display: 'P = W/\u0394t', insert: 'P = W/\u0394t', title: 'Power', category: 'Energy' },

  // Momentum
  { display: 'p = mv', insert: 'p = m \u00D7 v', title: 'Momentum', category: 'Momentum' },
  { display: 'J = \u03A3F\u0394t', insert: 'J = \u03A3F \u00D7 \u0394t', title: 'Impulse', category: 'Momentum' },
  { display: '\u03A3p\u1d62 = \u03A3p\u0066', insert: '\u03A3p_i = \u03A3p_f', title: 'Conservation of Momentum', category: 'Momentum' },

  // Rotation
  { display: '\u03C4 = rF sin\u03B8', insert: '\u03C4 = r \u00D7 F \u00D7 sin(\u03B8)', title: 'Torque', category: 'Rotation' },
  { display: 'v = r\u03C9', insert: 'v = r \u00D7 \u03C9', title: 'Tangential Velocity', category: 'Rotation' },
  { display: 'a\u2099 = v\u00B2/r', insert: 'a_c = v^2/r', title: 'Centripetal Acceleration', category: 'Rotation' },
  { display: '\u03A3\u03C4 = I\u03B1', insert: '\u03A3\u03C4 = I \u00D7 \u03B1', title: "Newton's Second Law (Rotation)", category: 'Rotation' },
  { display: 'a = \u03B1r', insert: 'a = \u03B1 \u00D7 r', title: 'Tangential Acceleration', category: 'Rotation' },

  // Waves & Sound
  { display: 'v = f\u03BB', insert: 'v = f \u00D7 \u03BB', title: 'Wave Speed', category: 'Waves' },
  { display: 'T = 1/f', insert: 'T = 1/f', title: 'Period', category: 'Waves' },

  // Gravity
  { display: 'F\u0067 = Gm\u2081m\u2082/r\u00B2', insert: 'F_g = G \u00D7 (m_1 \u00D7 m_2)/(r^2)', title: 'Universal Gravitation', category: 'Gravity' },

  // Electricity
  { display: 'F\u2091 = kq\u2081q\u2082/r\u00B2', insert: 'F_e = k \u00D7 (q_1 \u00D7 q_2)/(r^2)', title: "Coulomb's Law", category: 'Electricity' },
  { display: 'V = IR', insert: 'V = I \u00D7 R', title: "Ohm's Law", category: 'Electricity' },
  { display: 'P = IV', insert: 'P = I \u00D7 V', title: 'Electrical Power', category: 'Electricity' },
];

// ──────────────────────────────────────────────
// Structure Form (inline mini-form for fractions, etc.)
// ──────────────────────────────────────────────

const StructureForm: React.FC<{
  type: StructureType;
  onInsert: (text: string) => void;
  onClose: () => void;
}> = ({ type, onInsert, onClose }) => {
  const config = STRUCTURES[type];
  const [values, setValues] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const handleInsert = () => {
    onInsert(config.build(values));
    onClose();
  };

  return (
    <div className="flex items-center gap-2 bg-[var(--panel-bg)] border border-purple-500/30 rounded-lg px-3 py-2">
      <span className="text-xs text-purple-300 font-medium shrink-0">
        {config.label}:
      </span>
      {config.fields.map((field, i) => (
        <React.Fragment key={field.key}>
          {i > 0 && type === 'fraction' && (
            <span className="text-[var(--text-muted)] text-sm font-bold">/</span>
          )}
          <div className="flex flex-col gap-0.5">
            <label
              className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider"
              htmlFor={`struct-${type}-${field.key}`}
            >
              {field.label}
            </label>
            <input
              id={`struct-${type}-${field.key}`}
              ref={i === 0 ? firstRef : null}
              type="text"
              placeholder={field.placeholder}
              value={values[field.key] || ''}
              onChange={e =>
                setValues(prev => ({ ...prev, [field.key]: e.target.value }))
              }
              onKeyDown={e => {
                if (e.key === 'Enter') handleInsert();
                if (e.key === 'Escape') onClose();
              }}
              className="w-24 bg-[var(--panel-bg)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50"
            />
          </div>
        </React.Fragment>
      ))}
      <button
        type="button"
        onClick={handleInsert}
        className="ml-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition"
      >
        Insert
      </button>
      <button
        type="button"
        onClick={onClose}
        className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
        aria-label="Close structure form"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

const MathResponseBlock: React.FC<MathResponseBlockProps> = ({
  block,
  onComplete,
  savedResponse,
  onResponseChange,
  readOnly,
}) => {
  const maxSteps = block.maxSteps ?? 10;
  const stepLabels =
    block.stepLabels ?? ['Given:', 'Find:', 'Step 1:', 'Step 2:', 'Step 3:', 'Step 4:'];

  // Initialize steps — use 'input' if available, fall back to 'latex' for old data
  const [steps, setSteps] = useState<MathStep[]>(
    savedResponse?.steps?.length
      ? savedResponse.steps.map(s => ({
          label: s.label,
          latex: s.latex,
          input: s.input ?? s.latex,
        }))
      : [{ label: stepLabels[0] || 'Step 1:', latex: '', input: '' }]
  );
  const [submitted, setSubmitted] = useState(savedResponse?.submitted ?? false);
  const [activeStructure, setActiveStructure] = useState<StructureType | null>(
    null
  );

  // Track which input is focused for symbol insertion
  const focusedInputRef = useRef<{ index: number; el: HTMLInputElement | null }>(
    { index: 0, el: null }
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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

  const updateStepInput = useCallback(
    (index: number, value: string) => {
      setSteps(prev => {
        // Convert each line separately (all steps are list-mode)
        const latex = value
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => naturalToLatex(line))
          .join(' \\\\ ');
        const next = prev.map((s, i) =>
          i === index ? { ...s, input: value, latex } : s
        );
        emitChange(next, false);
        return next;
      });
    },
    [emitChange]
  );

  const updateStepLabel = useCallback(
    (index: number, value: string) => {
      setSteps(prev => {
        const next = prev.map((s, i) =>
          i === index ? { ...s, label: value } : s
        );
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
      const next = [...prev, { label: nextLabel, latex: '', input: '' }];
      emitChange(next, false);
      return next;
    });
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

  // ── Insert text at cursor position ──

  const insertAtCursor = useCallback(
    (text: string) => {
      const idx = focusedInputRef.current.index;
      const el =
        focusedInputRef.current.el ?? inputRefs.current[steps.length - 1];
      if (!el) {
        const lastIdx = steps.length - 1;
        updateStepInput(lastIdx, (steps[lastIdx].input || '') + text);
        return;
      }

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const before = el.value.slice(0, start);
      const after = el.value.slice(end);
      const newValue = before + text + after;

      const stepIndex = inputRefs.current.indexOf(el);
      const actualIndex = stepIndex >= 0 ? stepIndex : idx;
      updateStepInput(actualIndex, newValue);

      const cursorPos = start + text.length;
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [steps, updateStepInput]
  );

  const insertNotePrefix = useCallback(() => {
    const idx = focusedInputRef.current.index;
    const el =
      focusedInputRef.current.el ?? inputRefs.current[steps.length - 1];
    if (!el) {
      const lastIdx = steps.length - 1;
      updateStepInput(lastIdx, '// ' + (steps[lastIdx].input || ''));
      return;
    }

    const cursor = el.selectionStart ?? el.value.length;
    const val = el.value;
    // Find start of current line
    const lineStart = val.lastIndexOf('\n', cursor - 1) + 1;
    const newValue = val.slice(0, lineStart) + '// ' + val.slice(lineStart);

    const stepIndex = inputRefs.current.indexOf(el);
    const actualIndex = stepIndex >= 0 ? stepIndex : idx;
    updateStepInput(actualIndex, newValue);

    const cursorPos = cursor + 3; // account for inserted "// "
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }, [steps, updateStepInput]);

  // ── Submit / Edit ──

  const handleSubmit = useCallback(() => {
    const hasContent = steps.some(s => (s.input || s.latex).trim());
    if (!hasContent) return;
    setSubmitted(true);
    emitChange(steps, true);
    onComplete(true); // Math responses are self-assessed
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
          <div className="text-sm text-[var(--text-primary)] font-medium flex items-center gap-2">
            <Calculator className="w-4 h-4 text-purple-400 shrink-0" />
            <BlockText text={block.title} />
          </div>
        )}
        <BlockText text={block.content} tag="p" className="text-sm text-[var(--text-secondary)] leading-relaxed" />
      </div>

      {/* Read-only display: just rendered LaTeX per step */}
      {readOnly && (
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="space-y-1">
              <span className="text-xs text-purple-300 font-medium">
                {step.label}
              </span>
              <div className="bg-[var(--surface-glass)] rounded-lg px-3 py-2 overflow-x-auto">
                {step.latex.trim() ? (
                  <div className="space-y-1">
                    {step.latex.split(' \\\\ ').map((line, li) => {
                      const isNote = /^\\text\{.*\}$/.test(line.trim());
                      return (
                        <div
                          key={li}
                          className={`katex-preview flex items-center gap-2 ${isNote ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}
                        >
                          <span className={`text-[10px] select-none ${isNote ? 'text-blue-400/60' : 'text-[var(--text-muted)]'}`}>{isNote ? '\u2014' : '\u2022'}</span>
                          <div
                            dangerouslySetInnerHTML={{
                              __html: renderLatex(line.trim()),
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[var(--text-muted)] text-xs italic">No response</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editable steps (hidden in readOnly mode) */}
      {!readOnly && <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index} className="group space-y-1">
            {/* Input row */}
            <div className="flex gap-2 items-start">
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5 pt-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveStep(index, -1)}
                  disabled={index === 0 || submitted}
                  className="p-0.5 text-[var(--text-muted)] hover:text-purple-400 disabled:opacity-20 transition"
                  title="Move step up"
                  aria-label={`Move step ${index + 1} up`}
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(index, 1)}
                  disabled={index === steps.length - 1 || submitted}
                  className="p-0.5 text-[var(--text-muted)] hover:text-purple-400 disabled:opacity-20 transition"
                  title="Move step down"
                  aria-label={`Move step ${index + 1} down`}
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Label input */}
              <div className="shrink-0 w-28">
                <label className="sr-only" htmlFor={`step-label-${index}`}>
                  Step {index + 1} label
                </label>
                <input
                  id={`step-label-${index}`}
                  list={`step-labels-${index}`}
                  value={step.label}
                  onChange={e => updateStepLabel(index, e.target.value)}
                  disabled={submitted}
                  className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-purple-300 font-medium placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition"
                  placeholder="Label"
                />
                <datalist id={`step-labels-${index}`}>
                  {stepLabels.map((lbl, i) => (
                    <option key={i} value={lbl} />
                  ))}
                </datalist>
              </div>

              {/* Natural math input — all steps use textarea with per-line bullet rendering */}
              <div className="flex-1 min-w-0">
                <label className="sr-only" htmlFor={`step-input-${index}`}>
                  Step {index + 1} math input
                </label>
                <textarea
                  id={`step-input-${index}`}
                  ref={el => {
                    inputRefs.current[index] = el as unknown as HTMLInputElement;
                  }}
                  value={step.input ?? step.latex}
                  onChange={e => updateStepInput(index, e.target.value)}
                  onFocus={e => {
                    focusedInputRef.current = {
                      index,
                      el: e.currentTarget as unknown as HTMLInputElement,
                    };
                  }}
                  onKeyDown={e => {
                    if (
                      (e.ctrlKey || e.metaKey) &&
                      e.key === 'Enter'
                    ) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  disabled={submitted}
                  rows={3}
                  placeholder={
                    step.label.toLowerCase().includes('given')
                      ? 'List known values, one per line:\nv_i = 10 m/s\na = 2 m/s^2\nt = 5 s'
                      : step.label.toLowerCase().includes('find')
                      ? 'List what you need to find, one per line:\nv_f = ?\nd = ?'
                      : 'Type math naturally — one expression per line\ne.g. v = d/t\n// add a note like this'
                  }
                  className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition resize-y"
                />
              </div>

              {/* Delete button */}
              {!submitted && steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-red-400 transition shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Remove this step"
                  aria-label={`Remove step ${index + 1}`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* KaTeX preview (below input, indented to align) */}
            <div className="ml-10">
              {step.latex.trim() ? (
                <div
                  className="bg-[var(--surface-glass)] rounded-lg px-3 py-2 overflow-x-auto"
                  aria-live="polite"
                  aria-label={`Preview for step ${index + 1}`}
                >
                  <div className="space-y-1">
                    {step.latex.split(' \\\\ ').map((line, li) => {
                      const isNote = /^\\text\{.*\}$/.test(line.trim());
                      return (
                        <div
                          key={li}
                          className={`katex-preview flex items-center gap-2 ${isNote ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}
                        >
                          <span className={`text-[10px] select-none ${isNote ? 'text-blue-400/60' : 'text-[var(--text-muted)]'}`}>{isNote ? '\u2014' : '\u2022'}</span>
                          <div
                            dangerouslySetInnerHTML={{
                              __html: renderLatex(line.trim()),
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-[var(--text-muted)] text-xs italic px-3 py-1">
                  Preview appears here as you type
                </p>
              )}
            </div>
          </div>
        ))}
      </div>}

      {/* Add Step button */}
      {!readOnly && !submitted && steps.length < maxSteps && (
        <button
          type="button"
          onClick={addStep}
          className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-xs font-medium transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Step
        </button>
      )}

      {/* Math Keyboard */}
      {block.showLatexHelp !== false && !readOnly && !submitted && (
        <div className="space-y-2.5 border-t border-[var(--border)] pt-3">
          {/* Structure buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mr-1 shrink-0">
              Build
            </span>
            {STRUCTURE_KEYS.map(type => {
              const config = STRUCTURES[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setActiveStructure(
                      activeStructure === type ? null : type
                    )
                  }
                  className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium ${
                    activeStructure === type
                      ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                      : 'bg-[var(--surface-glass)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-purple-500/20 hover:text-[var(--text-primary)]'
                  }`}
                  title={config.title}
                >
                  {config.display}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => insertNotePrefix()}
              className="px-2.5 py-1.5 text-xs rounded-lg border transition font-medium bg-[var(--surface-glass)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-blue-500/20 hover:text-[var(--text-primary)]"
              title="Add a text note (won't render as math)"
            >
              Aa
            </button>
          </div>

          {/* Structure form (appears when a structure button is active) */}
          {activeStructure && (
            <StructureForm
              type={activeStructure}
              onInsert={insertAtCursor}
              onClose={() => setActiveStructure(null)}
            />
          )}

          {/* Symbol groups */}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {TOOLBAR_GROUPS.map(group => (
              <div key={group.label} className="flex items-center gap-1">
                <span className="text-[10px] text-[var(--text-muted)] mr-1 shrink-0 uppercase tracking-wider">
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-0.5">
                  {group.buttons.map((btn, i) => (
                    <button
                      key={`${btn.display}-${i}`}
                      type="button"
                      onClick={() => insertAtCursor(btn.insert)}
                      title={btn.title}
                      className="px-1.5 py-0.5 text-xs bg-[var(--surface-glass)] hover:bg-purple-500/20 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition whitespace-nowrap"
                    >
                      {btn.display}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Templates (grouped by category) */}
          <div className="space-y-1.5">
            {Array.from(new Set(TEMPLATES.map(t => t.category))).map(cat => (
              <div key={cat} className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-[var(--text-muted)] mr-1 shrink-0 uppercase tracking-wider w-20">
                  {cat}
                </span>
                {TEMPLATES.filter(t => t.category === cat).map((tmpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => insertAtCursor(tmpl.insert)}
                    title={tmpl.title}
                    className="px-2 py-0.5 text-xs bg-[var(--surface-glass)] hover:bg-purple-500/20 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg border border-[var(--border)] transition whitespace-nowrap"
                  >
                    {tmpl.display}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit / Edit (hidden in readOnly mode) */}
      {!readOnly && (
      <div className="flex items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!steps.some(s => (s.input || s.latex).trim())}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shrink-0"
          >
            Submit
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-green-400 font-bold">
              Submitted
            </span>
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] hover:text-purple-400 transition"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default MathResponseBlock;

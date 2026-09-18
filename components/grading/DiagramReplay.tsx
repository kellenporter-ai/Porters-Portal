import React, { useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HtmlActivitySymbol {
  id: string;
  type?: string;
  x: number;
  y: number;
  rotation?: number;
  [key: string]: unknown;
}

export interface HtmlActivityPanelState {
  symbols?: HtmlActivitySymbol[];
  [key: string]: unknown;
}

export type HtmlActivityState = Record<string, HtmlActivityPanelState | undefined>;

export interface DiagramReplayProps {
  /** The full __htmlActivity block response (keys: init1/init2/final1/final2). */
  state: HtmlActivityState;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DIAGRAM_CANVAS_SIZE = 600;

const PANEL_LABELS: Record<string, string> = {
  init1: 'Initial 1',
  init2: 'Initial 2',
  final1: 'Final 1',
  final2: 'Final 2',
};

const PANEL_ORDER = ['init1', 'init2', 'final1', 'final2'];

// Per-symbol-type rendering parameters. Colors use CSS custom properties so
// both light and dark themes are respected.
const TYPE_COLORS: Record<string, string> = {
  battery: 'var(--danger, #e11d48)',
  resistor: 'var(--accent-primary, #8b5cf6)',
  wire: 'var(--text-muted, #6b7280)',
  switch: 'var(--warning, #d97706)',
  lightbulb: 'var(--warning, #d97706)',
  lamp: 'var(--warning, #d97706)',
  ammeter: 'var(--info, #2563eb)',
  voltmeter: 'var(--info, #2563eb)',
};

const TYPE_SHAPES: Record<string, 'circle' | 'rect' | 'diamond' | 'line'> = {
  battery: 'rect',
  resistor: 'rect',
  wire: 'line',
  switch: 'line',
  lightbulb: 'circle',
  lamp: 'circle',
  ammeter: 'circle',
  voltmeter: 'circle',
};

function getSymbolType(sym: HtmlActivitySymbol): string {
  return (sym.type || '').toLowerCase();
}

function symbolColor(sym: HtmlActivitySymbol): string {
  return TYPE_COLORS[getSymbolType(sym)] || 'var(--text-secondary, #4b5563)';
}

function symbolShape(sym: HtmlActivitySymbol): 'circle' | 'rect' | 'diamond' | 'line' {
  return TYPE_SHAPES[getSymbolType(sym)] || 'rect';
}

// ─── Symbol renderer ─────────────────────────────────────────────────────────

function SymbolGlyph({ sym }: { sym: HtmlActivitySymbol }) {
  const cx = sym.x;
  const cy = sym.y;
  const rot = sym.rotation || 0;
  const color = symbolColor(sym);
  const shape = symbolShape(sym);
  // Symbols are drawn around a local origin and translated/rotated to (x, y).
  const transform = `translate(${cx} ${cy}) rotate(${rot})`;

  let body: React.ReactNode;
  switch (shape) {
    case 'circle':
      body = <circle cx={0} cy={0} r={14} fill="none" stroke={color} strokeWidth={2} />;
      break;
    case 'line':
      body = <line x1={-16} y1={0} x2={16} y2={0} stroke={color} strokeWidth={2.5} strokeLinecap="round" />;
      break;
    case 'diamond':
      body = <polygon points="0,-14 14,0 0,14 -14,0" fill="none" stroke={color} strokeWidth={2} />;
      break;
    default:
      body = <rect x={-14} y={-10} width={28} height={20} rx={3} fill="none" stroke={color} strokeWidth={2} />;
      break;
  }

  return (
    <g transform={transform} data-symbol-id={sym.id} data-symbol-type={sym.type}>
      {body}
      <title>{sym.type ? `${sym.type} (${Math.round(cx)}, ${Math.round(cy)})` : `symbol (${Math.round(cx)}, ${Math.round(cy)})`}</title>
    </g>
  );
}

// ─── Panel renderer ──────────────────────────────────────────────────────────

function DiagramPanel({ panelKey, panelState }: { panelKey: string; panelState: HtmlActivityPanelState }) {
  const symbols = panelState?.symbols;
  const hasSymbols = Array.isArray(symbols) && symbols.length > 0;
  return (
    <figure className="m-0">
      <figcaption className="text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
        {PANEL_LABELS[panelKey] || panelKey}
        {hasSymbols && (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--text-muted)]">
            {symbols!.length} symbol{symbols!.length !== 1 ? 's' : ''}
          </span>
        )}
      </figcaption>
      {hasSymbols ? (
        <svg
          viewBox={`0 0 ${DIAGRAM_CANVAS_SIZE} ${DIAGRAM_CANVAS_SIZE}`}
          role="img"
          aria-label={`${PANEL_LABELS[panelKey] || panelKey} diagram with ${symbols!.length} placed symbols`}
          className="w-full h-auto border border-[var(--border)] rounded-lg bg-[var(--panel-bg)]"
        >
          {/* Grid lines for spatial reference */}
          {Array.from({ length: 7 }, (_, i) => {
            const pos = (i * DIAGRAM_CANVAS_SIZE) / 6;
            return (
              <React.Fragment key={i}>
                <line x1={pos} y1={0} x2={pos} y2={DIAGRAM_CANVAS_SIZE} stroke="var(--border)" strokeWidth={0.5} />
                <line x1={0} y1={pos} x2={DIAGRAM_CANVAS_SIZE} y2={pos} stroke="var(--border)" strokeWidth={0.5} />
              </React.Fragment>
            );
          })}
          {symbols!.map(sym => (
            <SymbolGlyph key={sym.id || `${sym.x}-${sym.y}`} sym={sym} />
          ))}
        </svg>
      ) : (
        <p className="text-xs text-[var(--text-muted)] italic">No symbols placed</p>
      )}
    </figure>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * Read-only SVG replay of a student's __htmlActivity response.
 * Renders each panel (init1/init2/final1/final2) with its placed symbols at
 * their stored x/y/rotation positions so teachers can see the actual layout
 * of the circuit / force / motion diagram, not just symbol counts.
 */
const DiagramReplay: React.FC<DiagramReplayProps> = ({ state }) => {
  const panels = useMemo(
    () =>
      PANEL_ORDER.filter(key => state && state[key] != null).map(key => ({
        key,
        panelState: state[key] as HtmlActivityPanelState,
      })),
    [state],
  );

  if (panels.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {panels.map(({ key, panelState }) => (
        <DiagramPanel key={key} panelKey={key} panelState={panelState} />
      ))}
    </div>
  );
};

export default DiagramReplay;

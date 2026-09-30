import React from 'react';
import katex from 'katex';

/**
 * Shared read-only replay renderers for rich block responses.
 *
 * Extracted from components/grading/StudentResponsePanel.tsx so both the
 * teacher grading view and the student "My Work" tab render rich block
 * responses (drawing, math steps, bar chart) identically. Purely
 * presentational — no state, no callbacks.
 */

export interface MathStep {
  label: string;
  latex: string;
  input?: string;
}

export interface BarChartSection {
  value: number;
  labelHTML: string;
}

export interface BarChartData {
  initial?: BarChartSection[];
  delta?: BarChartSection[];
  final?: BarChartSection[];
}

export function MathStepsReplay({ steps }: { steps: MathStep[] }): React.ReactNode {
  return (
    <div className="mt-1 space-y-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2 bg-[var(--surface-glass)] rounded px-2 py-1">
          <span className="text-xs text-[var(--text-tertiary)] font-bold shrink-0 mt-0.5">{step.label}</span>
          {step.latex ? (
            <span
              className="text-xs text-[var(--text-secondary)]"
              dangerouslySetInnerHTML={{
                __html: (() => { try { return katex.renderToString(step.latex, { throwOnError: false }); } catch { return step.input || step.latex; } })(),
              }}
            />
          ) : (
            <span className="text-xs text-[var(--text-secondary)]">{step.input || '—'}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function BarChartReplay({ chartData }: { chartData: BarChartData }): React.ReactNode {
  const sections = ['initial', 'delta', 'final'] as const;
  return (
    <div className="mt-1 space-y-1">
      {sections.map(section => {
        const bars = chartData[section];
        if (!bars || bars.every(b => b.value === 0)) return null;
        return (
          <div key={section} className="bg-[var(--surface-glass)] rounded px-2 py-1">
            <span className="text-xs text-[var(--text-tertiary)] font-bold uppercase">{section}</span>
            <div className="flex gap-2 mt-0.5">
              {bars.map((bar, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="text-[11.5px] text-[var(--text-secondary)] font-mono">{bar.value}</div>
                  <div
                    className="w-6 rounded-t"
                    style={{
                      height: Math.max(4, Math.abs(bar.value) * 3),
                      backgroundColor: bar.value >= 0 ? '#22c55e' : '#ef4444',
                      opacity: 0.7,
                    }}
                  />
                  <div
                    className="text-xs text-[var(--text-tertiary)] truncate max-w-[40px]"
                    dangerouslySetInnerHTML={{ __html: bar.labelHTML || `${i + 1}` }}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface DrawingReplayProps {
  elements: Array<Record<string, unknown>>;
  canvasHeight?: number;
  blockId?: string;
}

export function DrawingReplay({ elements, canvasHeight, blockId }: DrawingReplayProps): React.ReactNode {
  let maxX = 800, maxY = canvasHeight ?? 400;
  for (const el of elements) {
    const pts: { x: number; y: number }[] = [];
    if (el.type === 'stroke' && Array.isArray(el.points)) pts.push(...(el.points as { x: number; y: number }[]));
    if (el.type === 'arrow' || el.type === 'shape') {
      if (el.start) pts.push(el.start as { x: number; y: number });
      if (el.end) pts.push(el.end as { x: number; y: number });
    }
    if (el.type === 'text' && el.position) {
      const pos = el.position as { x: number; y: number };
      const fontSize = Number(el.fontSize || 14);
      const textLen = String(el.text || '').length;
      const estWidth = textLen * fontSize * 0.6;
      pts.push(pos);
      pts.push({ x: pos.x + estWidth, y: pos.y + fontSize });
    }
    for (const p of pts) {
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const vbW = Math.ceil(maxX + 20);
  const vbH = Math.ceil(maxY + 20);

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full max-w-2xl h-auto bg-white rounded mt-1 border border-[var(--border)]">
      {elements.map((el, i) => {
        if (el.type === 'arrow') {
          const sx = el.start as { x: number; y: number }, ex = el.end as { x: number; y: number };
          const markerId = `ah-${blockId ?? 'replay'}-${i}`;
          return (
            <g key={i}>
              <defs>
                <marker id={markerId} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill={String(el.color || '#000')} />
                </marker>
              </defs>
              <line x1={sx.x} y1={sx.y} x2={ex.x} y2={ex.y} stroke={String(el.color || '#000')} strokeWidth="3" markerEnd={`url(#${markerId})`} />
              {el.label1 ? <text x={(sx.x + ex.x) / 2} y={(sx.y + ex.y) / 2 - 8} textAnchor="middle" fill={String(el.color || '#000')} fontSize="12" fontWeight="bold">{String(el.label1)}</text> : null}
            </g>
          );
        }
        if (el.type === 'stroke') {
          const pts = el.points as { x: number; y: number }[];
          if (!pts || pts.length < 2) return null;
          const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
          return <path key={i} d={d} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill="none" strokeLinecap="round" />;
        }
        if (el.type === 'shape') {
          const s = el.start as { x: number; y: number }, e = el.end as { x: number; y: number };
          if (el.shape === 'circle') {
            const rx = Math.abs(e.x - s.x) / 2, ry = Math.abs(e.y - s.y) / 2;
            return <ellipse key={i} cx={s.x + rx} cy={s.y + ry} rx={rx} ry={ry} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill={String(el.fill || 'none')} fillOpacity={Number(el.fillOpacity || 0)} />;
          }
          if (el.shape === 'rectangle') return <rect key={i} x={Math.min(s.x, e.x)} y={Math.min(s.y, e.y)} width={Math.abs(e.x - s.x)} height={Math.abs(e.y - s.y)} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} fill={String(el.fill || 'none')} fillOpacity={Number(el.fillOpacity || 0)} />;
          if (el.shape === 'line') return <line key={i} x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={String(el.color || '#000')} strokeWidth={Number(el.width || 2)} />;
        }
        if (el.type === 'text') {
          const pos = el.position as { x: number; y: number };
          return <text key={i} x={pos.x} y={pos.y} fill={String(el.color || '#000')} fontSize={Number(el.fontSize || 14)}>{String(el.text || '')}</text>;
        }
        return null;
      })}
    </svg>
  );
}

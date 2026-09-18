import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraphingPoint {
  x: number;
  y: number;
}

export interface GraphingViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface GraphingReplayProps {
  /** The student's raw block response for a GRAPHING block. */
  response: unknown;
  /** The GRAPHING lesson block (carries axis labels / viewport hints). */
  block?: unknown;
}

// ─── Response normalization ──────────────────────────────────────────────────

interface NormalizedGraph {
  points: GraphingPoint[];
  line: { slope: number; intercept: number } | null;
  viewport: GraphingViewport;
  xLabel: string;
  yLabel: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function asViewport(v: unknown): GraphingViewport | null {
  if (v == null || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const nums = [o.xMin, o.xMax, o.yMin, o.yMax];
  if (!nums.every(isFiniteNumber)) return null;
  return { xMin: nums[0], xMax: nums[1], yMin: nums[2], yMax: nums[3] };
}

function asPoints(v: unknown): GraphingPoint[] {
  if (!Array.isArray(v)) return [];
  const out: GraphingPoint[] = [];
  for (const p of v) {
    if (p == null || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    if (isFiniteNumber(o.x) && isFiniteNumber(o.y)) out.push({ x: o.x, y: o.y });
  }
  return out;
}

function asLine(v: unknown): { slope: number; intercept: number } | null {
  if (v == null || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (isFiniteNumber(o.slope) && isFiniteNumber(o.intercept)) {
    return { slope: o.slope, intercept: o.intercept };
  }
  return null;
}

/**
 * Tolerant extraction of the student's graph from whatever shape the stored
 * response has. Handles the canonical `{points, line, viewport}` shape plus
 * common legacy aliases.
 */
export function normalizeGraphingResponse(response: unknown, block?: unknown): NormalizedGraph {
  const r = (response ?? {}) as Record<string, unknown>;
  const b = (block ?? {}) as Record<string, unknown>;

  let points = asPoints(r.points ?? r.plottedPoints ?? r.dataPoints);
  let line = asLine(r.line ?? r.bestFitLine ?? r.trendline);

  // Some graphing blocks embed the interactive response under `graph` / `answer`.
  if (points.length === 0 && line == null) {
    for (const key of ['graph', 'answer', 'response', 'state']) {
      const inner = r[key];
      if (inner != null && typeof inner === 'object') {
        const io = inner as Record<string, unknown>;
        points = asPoints(io.points ?? io.plottedPoints ?? io.dataPoints);
        line = asLine(io.line ?? io.bestFitLine ?? io.trendline);
        if (points.length > 0 || line != null) break;
      }
    }
  }

  const viewport =
    asViewport(r.viewport) ??
    asViewport(b.viewport) ??
    (isFiniteNumber(b.xMin) && isFiniteNumber(b.xMax) && isFiniteNumber(b.yMin) && isFiniteNumber(b.yMax)
      ? { xMin: b.xMin as number, xMax: b.xMax as number, yMin: b.yMin as number, yMax: b.yMax as number }
      : null) ??
    (() => {
      // Derive a symmetric viewport from the data when none is stored.
      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      const ext = (vals: number[], fallback: number): number =>
        Math.max(fallback, ...vals.map(v => Math.abs(v)), 1) * 1.2;
      return { xMin: -ext(xs, 10), xMax: ext(xs, 10), yMin: -ext(ys, 10), yMax: ext(ys, 10) };
    })();

  // Clamp viewport so xMin < xMax and yMin < yMax.
  const fixed: GraphingViewport = {
    xMin: Math.min(viewport.xMin, viewport.xMax - 1),
    xMax: Math.max(viewport.xMax, viewport.xMin + 1),
    yMin: Math.min(viewport.yMin, viewport.yMax - 1),
    yMax: Math.max(viewport.yMax, viewport.yMin + 1),
  };

  const xLabel = String(r.xAxisLabel ?? b.xAxisLabel ?? b.xLabel ?? 'x');
  const yLabel = String(r.yAxisLabel ?? b.yAxisLabel ?? b.yLabel ?? 'y');

  return { points, line, viewport: fixed, xLabel, yLabel };
}

// ─── Coordinate mapping ──────────────────────────────────────────────────────

export function toSvg(
  p: GraphingPoint,
  viewport: GraphingViewport,
  width: number,
  height: number,
  pad: number,
): GraphingPoint {
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return {
    x: pad + ((p.x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * innerW,
    y: height - pad - ((p.y - viewport.yMin) / (viewport.yMax - viewport.yMin)) * innerH,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

const SVG_W = 480;
const SVG_H = 360;
const PAD = 36;

/**
 * Read-only static reconstruction of a student's GRAPHING response: plotted
 * data points and the drawn best-fit line rendered on labelled axes, using
 * CSS custom properties for theme compliance. LibraryTab's graphing renderer
 * is canvas/SVG-coupled to its interactive editing state, so this is a
 * faithful static reconstruction rather than a fork of that component.
 */
const GraphingReplay: React.FC<GraphingReplayProps> = ({ response, block }) => {
  const graph = normalizeGraphingResponse(response, block);
  const hasContent = graph.points.length > 0 || graph.line != null;
  if (!hasContent) return null;

  const vp = graph.viewport;
  const origin = toSvg({ x: 0, y: 0 }, vp, SVG_W, SVG_H, PAD);

  // Best-fit line endpoints clipped across the viewport.
  let lineNode: React.ReactNode = null;
  if (graph.line) {
    const { slope, intercept } = graph.line;
    const yAt = (x: number) => slope * x + intercept;
    const candidates: GraphingPoint[] = [
      { x: vp.xMin, y: yAt(vp.xMin) },
      { x: vp.xMax, y: yAt(vp.xMax) },
    ];
    // If the line crosses the vertical bounds inside the viewport, use those.
    if (slope !== 0) {
      for (const yBound of [vp.yMin, vp.yMax]) {
        const xAt = (yBound - intercept) / slope;
        if (xAt > vp.xMin && xAt < vp.xMax) candidates.push({ x: xAt, y: yBound });
      }
    }
    if (candidates.length >= 2) {
      const [a, bpt] = [candidates[0], candidates[candidates.length - 1]];
      const aSvg = toSvg(a, vp, SVG_W, SVG_H, PAD);
      const bSvg = toSvg(bpt, vp, SVG_W, SVG_H, PAD);
      lineNode = (
        <line
          x1={aSvg.x} y1={aSvg.y} x2={bSvg.x} y2={bSvg.y}
          stroke="var(--accent-primary, #8b5cf6)"
          strokeWidth={2}
          strokeDasharray="6 4"
          aria-label={`Best-fit line y = ${slope}x + ${intercept}`}
        />
      );
    }
  }

  // Axis tick values.
  const xTicks: number[] = [];
  const yTicks: number[] = [];
  for (let i = 0; i <= 8; i++) {
    xTicks.push(vp.xMin + ((vp.xMax - vp.xMin) * i) / 8);
    yTicks.push(vp.yMin + ((vp.yMax - vp.yMin) * i) / 8);
  }

  const fmt = (n: number): string => {
    const rounded = Math.round(n * 100) / 100;
    return String(rounded);
  };

  return (
    <figure className="m-0 mt-1">
      <figcaption className="text-[11.5px] text-[var(--text-muted)] mb-1">
        Plotted graph — {graph.points.length} point{graph.points.length !== 1 ? 's' : ''}
        {graph.line ? `, best-fit line y = ${fmt(graph.line.slope)}x + ${fmt(graph.line.intercept)}` : ''}
      </figcaption>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-label={`Graph with ${graph.points.length} plotted points${graph.line ? ' and a best-fit line' : ''}`}
        className="w-full max-w-xl h-auto border border-[var(--border)] rounded-lg bg-[var(--panel-bg)]"
      >
        {/* Frame */}
        <rect x={PAD} y={PAD} width={SVG_W - PAD * 2} height={SVG_H - PAD * 2} fill="none" stroke="var(--border)" strokeWidth={1} />

        {/* Grid */}
        {xTicks.map((t, i) => {
          const p = toSvg({ x: t, y: vp.yMin }, vp, SVG_W, SVG_H, PAD);
          return <line key={`gx${i}`} x1={p.x} y1={PAD} x2={p.x} y2={SVG_H - PAD} stroke="var(--border)" strokeWidth={0.5} />;
        })}
        {yTicks.map((t, i) => {
          const p = toSvg({ x: vp.xMin, y: t }, vp, SVG_W, SVG_H, PAD);
          return <line key={`gy${i}`} x1={PAD} y1={p.y} x2={SVG_W - PAD} y2={p.y} stroke="var(--border)" strokeWidth={0.5} />;
        })}

        {/* Axes through origin when visible */}
        {vp.yMin < 0 && vp.yMax > 0 && (
          <line x1={PAD} y1={origin.y} x2={SVG_W - PAD} y2={origin.y} stroke="var(--border-strong)" strokeWidth={1.5} />
        )}
        {vp.xMin < 0 && vp.xMax > 0 && (
          <line x1={origin.x} y1={PAD} x2={origin.x} y2={SVG_H - PAD} stroke="var(--border-strong)" strokeWidth={1.5} />
        )}

        {/* Axis labels */}
        <text x={SVG_W - PAD} y={SVG_H - 10} textAnchor="end" fill="var(--text-secondary)" fontSize={11}>{graph.xLabel}</text>
        <text x={12} y={PAD - 6} fill="var(--text-secondary)" fontSize={11}>{graph.yLabel}</text>

        {/* Tick labels (sparse) */}
        {xTicks.filter((_, i) => i % 2 === 0).map((t, i) => {
          const p = toSvg({ x: t, y: vp.yMin }, vp, SVG_W, SVG_H, PAD);
          return (
            <text key={`xt${i}`} x={p.x} y={SVG_H - PAD + 14} textAnchor="middle" fill="var(--text-muted)" fontSize={9}>
              {fmt(t)}
            </text>
          );
        })}
        {yTicks.filter((_, i) => i % 2 === 0).map((t, i) => {
          const p = toSvg({ x: vp.xMin, y: t }, vp, SVG_W, SVG_H, PAD);
          return (
            <text key={`yt${i}`} x={PAD - 6} y={p.y + 3} textAnchor="end" fill="var(--text-muted)" fontSize={9}>
              {fmt(t)}
            </text>
          );
        })}

        {/* Best-fit line under points */}
        {lineNode}

        {/* Plotted points */}
        {graph.points.map((p, i) => {
          const sp = toSvg(p, vp, SVG_W, SVG_H, PAD);
          return (
            <g key={i}>
              <circle cx={sp.x} cy={sp.y} r={4} fill="var(--accent-primary, #8b5cf6)" fillOpacity={0.9} />
              <title>{`(${fmt(p.x)}, ${fmt(p.y)})`}</title>
            </g>
          );
        })}
      </svg>
    </figure>
  );
};

export default GraphingReplay;

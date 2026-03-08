import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Pencil, Eraser, ArrowUpRight, Square, Type, Undo2, Redo2, Trash2,
  Circle, Minus, Check, Edit3, MousePointer2, Keyboard, GripHorizontal,
  Copy, ClipboardPaste, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown
} from 'lucide-react';
import { LessonBlock } from '../../types';

// ──────────────────────────────────────────────
// Data types
// ──────────────────────────────────────────────

type DrawingElement =
  | { type: 'stroke'; points: { x: number; y: number }[]; color: string; width: number }
  | { type: 'arrow'; start: { x: number; y: number }; end: { x: number; y: number }; label1: string; label2: string; color: string; isComponent: boolean }
  | { type: 'shape'; shape: 'circle' | 'rectangle' | 'line'; start: { x: number; y: number }; end: { x: number; y: number }; color: string; width: number; fill?: string; fillOpacity?: number }
  | { type: 'text'; position: { x: number; y: number }; text: string; color: string; fontSize: number };

interface DrawingResponse {
  elements: DrawingElement[];
  submitted: boolean;
}

interface DrawingBlockProps {
  block: LessonBlock;
  onComplete: (correct: boolean) => void;
  savedResponse?: DrawingResponse;
  onResponseChange?: (response: unknown) => void;
}

type Tool = 'select' | 'arrow' | 'pen' | 'shape' | 'text' | 'eraser';
type ShapeType = 'circle' | 'rectangle' | 'line';

const PEN_WIDTHS = [2, 4, 6];

const ARROW_COLOR = '#557A45';

// ──────────────────────────────────────────────
// Geometry helpers
// ──────────────────────────────────────────────

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function snapAngle(startX: number, startY: number, endX: number, endY: number): { x: number; y: number } {
  const dx = endX - startX;
  const dy = endY - startY;
  const dist = Math.hypot(dx, dy);
  let angle = Math.atan2(dy, dx);
  const snap = Math.PI / 4;
  angle = Math.round(angle / snap) * snap;
  return { x: startX + dist * Math.cos(angle), y: startY + dist * Math.sin(angle) };
}

function hitTestElement(pos: { x: number; y: number }, el: DrawingElement, tolerance = 15): boolean {
  switch (el.type) {
    case 'stroke': {
      for (let i = 0; i < el.points.length - 1; i++) {
        if (distToSegment(pos, el.points[i], el.points[i + 1]) < tolerance) return true;
      }
      return false;
    }
    case 'arrow': {
      return distToSegment(pos, el.start, el.end) < tolerance;
    }
    case 'shape': {
      if (el.shape === 'line') {
        return distToSegment(pos, el.start, el.end) < tolerance;
      }
      const cx = (el.start.x + el.end.x) / 2;
      const cy = (el.start.y + el.end.y) / 2;
      const hw = Math.abs(el.end.x - el.start.x) / 2 + tolerance;
      const hh = Math.abs(el.end.y - el.start.y) / 2 + tolerance;
      return Math.abs(pos.x - cx) < hw && Math.abs(pos.y - cy) < hh;
    }
    case 'text': {
      return Math.abs(pos.x - el.position.x) < 60 && Math.abs(pos.y - el.position.y) < 20;
    }
  }
}

function getElementBounds(el: DrawingElement): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case 'stroke': {
      if (el.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      el.points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'arrow':
      return { x: Math.min(el.start.x, el.end.x), y: Math.min(el.start.y, el.end.y), w: Math.abs(el.end.x - el.start.x), h: Math.abs(el.end.y - el.start.y) };
    case 'shape':
      return { x: Math.min(el.start.x, el.end.x), y: Math.min(el.start.y, el.end.y), w: Math.abs(el.end.x - el.start.x), h: Math.abs(el.end.y - el.start.y) };
    case 'text':
      return { x: el.position.x, y: el.position.y, w: 80, h: 20 };
  }
}

/** Check if an element's bounding box intersects a selection rectangle */
function elementInRect(el: DrawingElement, rect: { x: number; y: number; w: number; h: number }): boolean {
  const b = getElementBounds(el);
  const rx = Math.min(rect.x, rect.x + rect.w);
  const ry = Math.min(rect.y, rect.y + rect.h);
  const rw = Math.abs(rect.w);
  const rh = Math.abs(rect.h);
  return !(b.x + b.w < rx || b.x > rx + rw || b.y + b.h < ry || b.y > ry + rh);
}

/** Deep-clone an element with an offset */
function cloneElement(el: DrawingElement, dx: number, dy: number): DrawingElement {
  switch (el.type) {
    case 'stroke':
      return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    case 'arrow':
      return { ...el, start: { x: el.start.x + dx, y: el.start.y + dy }, end: { x: el.end.x + dx, y: el.end.y + dy } };
    case 'shape':
      return { ...el, start: { x: el.start.x + dx, y: el.start.y + dy }, end: { x: el.end.x + dx, y: el.end.y + dy } };
    case 'text':
      return { ...el, position: { x: el.position.x + dx, y: el.position.y + dy } };
  }
}

// ──────────────────────────────────────────────
// Canvas rendering helpers
// ──────────────────────────────────────────────

function drawArrowhead(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, color: string) {
  const headLen = 15;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function renderElementToCanvas(ctx: CanvasRenderingContext2D, el: DrawingElement) {
  switch (el.type) {
    case 'stroke': {
      if (el.points.length < 2) return;
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.points[i].x, el.points[i].y);
      }
      ctx.stroke();
      break;
    }
    case 'arrow': {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      if (el.isComponent) {
        ctx.setLineDash([6, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(el.start.x, el.start.y);
      ctx.lineTo(el.end.x, el.end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawArrowhead(ctx, el.start, el.end, el.color);
      break;
    }
    case 'shape': {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);

      // Fill first if set
      if (el.fill && el.shape !== 'line') {
        ctx.save();
        ctx.globalAlpha = el.fillOpacity ?? 0.3;
        ctx.fillStyle = el.fill;
        if (el.shape === 'rectangle') {
          ctx.fillRect(el.start.x, el.start.y, el.end.x - el.start.x, el.end.y - el.start.y);
        } else if (el.shape === 'circle') {
          const rx = Math.abs(el.end.x - el.start.x) / 2;
          const ry = Math.abs(el.end.y - el.start.y) / 2;
          const cx = (el.start.x + el.end.x) / 2;
          const cy = (el.start.y + el.end.y) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Stroke
      if (el.shape === 'line') {
        ctx.beginPath();
        ctx.moveTo(el.start.x, el.start.y);
        ctx.lineTo(el.end.x, el.end.y);
        ctx.stroke();
      } else if (el.shape === 'rectangle') {
        ctx.strokeRect(el.start.x, el.start.y, el.end.x - el.start.x, el.end.y - el.start.y);
      } else if (el.shape === 'circle') {
        const rx = Math.abs(el.end.x - el.start.x) / 2;
        const ry = Math.abs(el.end.y - el.start.y) / 2;
        const cx = (el.start.x + el.end.x) / 2;
        const cy = (el.start.y + el.end.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    // text elements are rendered as HTML overlays, not on canvas
    case 'text':
      break;
  }
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

const DrawingBlock: React.FC<DrawingBlockProps> = ({ block, onComplete, savedResponse, onResponseChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [elements, setElements] = useState<DrawingElement[]>(savedResponse?.elements ?? []);
  const [submitted, setSubmitted] = useState(savedResponse?.submitted ?? false);

  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [penColor, setPenColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(4);
  const [activeShape, setActiveShape] = useState<ShapeType>('line');

  // Fill state
  const [fillEnabled, setFillEnabled] = useState(false);
  const [fillColor, setFillColor] = useState('#007aff');
  const [fillOpacity, setFillOpacity] = useState(0.3);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  // Multi-selection & dragging
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [dragMode, setDragMode] = useState<'move' | 'resize' | 'select-box' | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Which arrow index is being resized (only one at a time)
  const resizeTargetRef = useRef<number | null>(null);

  // Selection box (rubber band)
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);

  // Clipboard
  const clipboardRef = useRef<DrawingElement[]>([]);

  // Text placement popup
  const [textPlacement, setTextPlacement] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState('');

  // Tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);

  const [canvasWidth, setCanvasWidth] = useState(800);
  const [userHeight, setUserHeight] = useState<number | null>(null);
  const canvasHeight = userHeight ?? (block.canvasHeight ?? 400);
  const drawingMode = block.drawingMode ?? 'free';

  // Resize handle state
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Undo/Redo history
  const historyRef = useRef<DrawingElement[][]>([savedResponse?.elements ?? []]);
  const historyIdxRef = useRef(0);

  // Shape resize corner tracking: which corner of a shape is being dragged
  // 'tl' = top-left, 'tr' = top-right, 'bl' = bottom-left, 'br' = bottom-right
  const resizeCornerRef = useRef<'tl' | 'tr' | 'bl' | 'br' | null>(null);

  const shiftHeld = useRef(false);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  /** Push a snapshot to the undo history, clearing any redo stack ahead */
  const commitToHistory = useCallback((snapshot: DrawingElement[]) => {
    const idx = historyIdxRef.current + 1;
    historyRef.current = historyRef.current.slice(0, idx);
    historyRef.current.push(JSON.parse(JSON.stringify(snapshot)));
    historyIdxRef.current = idx;
  }, []);

  // Pending commit flag — set true before setElements for permanent actions
  const pendingCommitRef = useRef(false);
  useEffect(() => {
    if (pendingCommitRef.current) {
      pendingCommitRef.current = false;
      commitToHistory(elements);
    }
  }, [elements, commitToHistory]);

  // Load background image
  useEffect(() => {
    if (block.backgroundImage) {
      const img = new Image();
      img.src = block.backgroundImage;
      img.onload = () => {
        bgImageRef.current = img;
      };
    }
  }, [block.backgroundImage]);

  // Sync response upstream
  useEffect(() => {
    onResponseChange?.({ elements, submitted });
  }, [elements, submitted, onResponseChange]);

  // Track shift key
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeld.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ──────────────────────────────────────────
  // Canvas coordinate helper
  // ──────────────────────────────────────────

  const getCanvasCoords = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      const touch = (e as TouchEvent).touches[0] || (e as TouchEvent).changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  // ──────────────────────────────────────────
  // Canvas rendering
  // ──────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Background image
    if (bgImageRef.current) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Mode-specific background elements
    if (drawingMode === 'point_model') {
      // Dashed crosshair axes
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(canvas.width, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center black dot
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.fill();
    } else if (drawingMode === 'extended_body') {
      // Light crosshair guides only — no preset shape.
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(canvas.width, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw all elements
    elements.forEach((el, idx) => {
      renderElementToCanvas(ctx, el);
      // Selection highlight for multi-select
      if (selectedIndices.has(idx)) {
        const bounds = getElementBounds(el);
        ctx.save();
        ctx.strokeStyle = '#007aff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
        ctx.setLineDash([]);
        ctx.restore();

        // Draw resize handles for shapes
        if (el.type === 'shape') {
          const hs = 5; // handle half-size
          const corners = [
            { x: el.start.x, y: el.start.y },
            { x: el.end.x, y: el.start.y },
            { x: el.start.x, y: el.end.y },
            { x: el.end.x, y: el.end.y },
          ];
          ctx.save();
          corners.forEach(c => {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#007aff';
            ctx.lineWidth = 1.5;
            ctx.fillRect(c.x - hs, c.y - hs, hs * 2, hs * 2);
            ctx.strokeRect(c.x - hs, c.y - hs, hs * 2, hs * 2);
          });
          ctx.restore();
        }
      }
    });

    // Draw active stroke preview
    if (activeTool === 'pen' && currentStroke.length > 1) {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
    }

    // Draw active shape/arrow preview
    if ((activeTool === 'arrow' || activeTool === 'shape') && dragStart && dragEnd) {
      if (activeTool === 'arrow') {
        ctx.strokeStyle = ARROW_COLOR;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        ctx.lineTo(dragEnd.x, dragEnd.y);
        ctx.stroke();
        drawArrowhead(ctx, dragStart, dragEnd, ARROW_COLOR);
      } else {
        // Fill preview
        if (fillEnabled && activeShape !== 'line') {
          ctx.save();
          ctx.globalAlpha = fillOpacity;
          ctx.fillStyle = fillColor;
          if (activeShape === 'rectangle') {
            ctx.fillRect(dragStart.x, dragStart.y, dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
          } else if (activeShape === 'circle') {
            const rx = Math.abs(dragEnd.x - dragStart.x) / 2;
            const ry = Math.abs(dragEnd.y - dragStart.y) / 2;
            const ecx = (dragStart.x + dragEnd.x) / 2;
            const ecy = (dragStart.y + dragEnd.y) / 2;
            ctx.beginPath();
            ctx.ellipse(ecx, ecy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        if (activeShape === 'line') {
          ctx.beginPath();
          ctx.moveTo(dragStart.x, dragStart.y);
          ctx.lineTo(dragEnd.x, dragEnd.y);
          ctx.stroke();
        } else if (activeShape === 'rectangle') {
          ctx.strokeRect(dragStart.x, dragStart.y, dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
        } else if (activeShape === 'circle') {
          const rx = Math.abs(dragEnd.x - dragStart.x) / 2;
          const ry = Math.abs(dragEnd.y - dragStart.y) / 2;
          const ecx = (dragStart.x + dragEnd.x) / 2;
          const ecy = (dragStart.y + dragEnd.y) / 2;
          ctx.beginPath();
          ctx.ellipse(ecx, ecy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Draw selection box (rubber band)
    if (selectionBox) {
      ctx.save();
      ctx.strokeStyle = '#007aff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.fillStyle = 'rgba(0, 122, 255, 0.08)';
      const sx = selectionBox.start.x;
      const sy = selectionBox.start.y;
      const sw = selectionBox.end.x - sx;
      const sh = selectionBox.end.y - sy;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }, [elements, currentStroke, dragStart, dragEnd, activeTool, penColor, penWidth, activeShape, drawingMode, selectedIndices, selectionBox, fillEnabled, fillColor, fillOpacity]);

  useEffect(() => { redraw(); }, [redraw]);

  // ──────────────────────────────────────────
  // ResizeObserver for responsive canvas
  // ──────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setCanvasWidth(width);
        }
      }
    });
    observer.observe(container);

    // Initial size
    setCanvasWidth(container.clientWidth || 800);

    return () => observer.disconnect();
  }, []);

  // Update canvas dimensions when width changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    redraw();
  }, [canvasWidth, canvasHeight]);

  // ──────────────────────────────────────────
  // Element mutation helpers
  // ──────────────────────────────────────────

  const moveElements = useCallback((indices: Set<number>, dx: number, dy: number) => {
    setElements(prev => {
      const next = [...prev];
      indices.forEach(index => {
        const el = { ...next[index] };
        switch (el.type) {
          case 'stroke':
            el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            break;
          case 'arrow':
            el.start = { x: el.start.x + dx, y: el.start.y + dy };
            el.end = { x: el.end.x + dx, y: el.end.y + dy };
            break;
          case 'shape':
            el.start = { x: el.start.x + dx, y: el.start.y + dy };
            el.end = { x: el.end.x + dx, y: el.end.y + dy };
            break;
          case 'text':
            el.position = { x: el.position.x + dx, y: el.position.y + dy };
            break;
        }
        next[index] = el as DrawingElement;
      });
      return next;
    });
  }, []);

  const resizeArrow = useCallback((index: number, newEnd: { x: number; y: number }) => {
    setElements(prev => {
      const next = [...prev];
      const el = next[index];
      if (el.type === 'arrow') {
        next[index] = { ...el, end: newEnd };
      }
      return next;
    });
  }, []);

  /** Resize a shape by updating one corner while keeping the opposite fixed */
  const resizeShape = useCallback((index: number, corner: 'tl' | 'tr' | 'bl' | 'br', pos: { x: number; y: number }) => {
    setElements(prev => {
      const next = [...prev];
      const el = next[index];
      if (el.type !== 'shape') return prev;
      const s = { ...el.start };
      const e = { ...el.end };
      switch (corner) {
        case 'tl': s.x = pos.x; s.y = pos.y; break;
        case 'tr': e.x = pos.x; s.y = pos.y; break;
        case 'bl': s.x = pos.x; e.y = pos.y; break;
        case 'br': e.x = pos.x; e.y = pos.y; break;
      }
      next[index] = { ...el, start: s, end: e };
      return next;
    });
  }, []);

  // ──────────────────────────────────────────
  // Pointer handlers
  // ──────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (submitted) return;
    e.preventDefault();
    const pos = getCanvasCoords(e as React.MouseEvent);
    const isShift = shiftHeld.current;

    // Close any open pickers
    setShowColorPicker(false);
    setShowFillPicker(false);
    setShowWidthPicker(false);
    setShowShapePicker(false);

    if (activeTool === 'select') {
      // Check if clicking near a shape's corner handle for resize
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === 'shape' && selectedIndices.has(i)) {
          const corners: { corner: 'tl' | 'tr' | 'bl' | 'br'; x: number; y: number }[] = [
            { corner: 'tl', x: el.start.x, y: el.start.y },
            { corner: 'tr', x: el.end.x, y: el.start.y },
            { corner: 'bl', x: el.start.x, y: el.end.y },
            { corner: 'br', x: el.end.x, y: el.end.y },
          ];
          for (const c of corners) {
            if (Math.hypot(pos.x - c.x, pos.y - c.y) < 12) {
              resizeTargetRef.current = i;
              resizeCornerRef.current = c.corner;
              setDragMode('resize');
              setIsDrawing(true);
              return;
            }
          }
        }
      }
      // Check if clicking near arrowhead for resize (single arrow only)
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === 'arrow' && Math.hypot(pos.x - el.end.x, pos.y - el.end.y) < 18) {
          resizeTargetRef.current = i;
          resizeCornerRef.current = null;
          setSelectedIndices(new Set([i]));
          setDragMode('resize');
          setIsDrawing(true);
          return;
        }
      }
      // Check if clicking on any element for move
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hitTestElement(pos, elements[i])) {
          if (isShift) {
            // Shift-click: toggle element in/out of selection
            setSelectedIndices(prev => {
              const next = new Set(prev);
              if (next.has(i)) next.delete(i); else next.add(i);
              return next;
            });
          } else if (!selectedIndices.has(i)) {
            // Click on unselected element: select only it
            setSelectedIndices(new Set([i]));
          }
          // Start move for all selected
          setDragMode('move');
          setDragOffset(pos);
          setIsDrawing(true);
          return;
        }
      }
      // Clicked empty space — start selection box or deselect
      if (!isShift) {
        setSelectedIndices(new Set());
      }
      // Start rubber band selection
      setDragMode('select-box');
      setSelectionBox({ start: pos, end: pos });
      setIsDrawing(true);
    } else if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentStroke([pos]);
    } else if (activeTool === 'eraser') {
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hitTestElement(pos, elements[i], 20)) {
          pendingCommitRef.current = true;
          setElements(prev => prev.filter((_, idx) => idx !== i));
          setSelectedIndices(prev => {
            const next = new Set<number>();
            prev.forEach(idx => {
              if (idx < i) next.add(idx);
              else if (idx > i) next.add(idx - 1);
            });
            return next;
          });
          break;
        }
      }
    } else if (activeTool === 'arrow') {
      let start = pos;
      if (drawingMode === 'point_model') {
        const canvas = canvasRef.current;
        if (canvas) start = { x: canvas.width / 2, y: canvas.height / 2 };
      }
      setIsDrawing(true);
      setDragStart(start);
      setDragEnd(pos);
    } else if (activeTool === 'shape') {
      setIsDrawing(true);
      setDragStart(pos);
      setDragEnd(pos);
    } else if (activeTool === 'text') {
      setTextPlacement(pos);
      setTextInput('');
    }
  }, [submitted, activeTool, getCanvasCoords, elements, selectedIndices, drawingMode]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (submitted) return;
    e.preventDefault();
    const pos = getCanvasCoords(e as React.MouseEvent);

    // Tooltip on hover over arrows
    if (!isDrawing && activeTool === 'select') {
      let found = false;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === 'arrow' && Math.hypot(pos.x - el.end.x, pos.y - el.end.y) < 20) {
          const len = Math.round(Math.hypot(el.end.x - el.start.x, el.end.y - el.start.y));
          const dx = el.end.x - el.start.x;
          const dy = -(el.end.y - el.start.y);
          let theta = Math.atan2(dy, dx) * (180 / Math.PI);
          if (theta < 0) theta += 360;
          theta = Math.round(theta * 10) / 10;
          setTooltip({ x: el.end.x, y: el.end.y, text: `Length: ${len}px, \u03B8: ${theta}\u00B0` });
          found = true;
          break;
        }
      }
      if (!found) setTooltip(null);
    }

    if (!isDrawing) return;

    if (activeTool === 'select' && dragMode === 'move' && selectedIndices.size > 0) {
      const dx = pos.x - dragOffset.x;
      const dy = pos.y - dragOffset.y;
      moveElements(selectedIndices, dx, dy);
      setDragOffset(pos);
    } else if (activeTool === 'select' && dragMode === 'resize' && resizeTargetRef.current !== null) {
      const el = elements[resizeTargetRef.current];
      if (el.type === 'arrow') {
        let end = pos;
        if (shiftHeld.current) {
          end = snapAngle(el.start.x, el.start.y, pos.x, pos.y);
        }
        resizeArrow(resizeTargetRef.current, end);
      } else if (el.type === 'shape' && resizeCornerRef.current) {
        resizeShape(resizeTargetRef.current, resizeCornerRef.current, pos);
      }
    } else if (activeTool === 'select' && dragMode === 'select-box') {
      setSelectionBox(prev => prev ? { ...prev, end: pos } : null);
    } else if (activeTool === 'pen') {
      setCurrentStroke(prev => [...prev, pos]);
    } else if (activeTool === 'arrow') {
      let end = pos;
      if (shiftHeld.current && dragStart) {
        end = snapAngle(dragStart.x, dragStart.y, pos.x, pos.y);
      }
      setDragEnd(end);
    } else if (activeTool === 'shape') {
      if (shiftHeld.current && dragStart) {
        if (activeShape === 'line') {
          // Snap line to 0°/45°/90° etc.
          setDragEnd(snapAngle(dragStart.x, dragStart.y, pos.x, pos.y));
        } else {
          // Constrain to regular shape (square / circle)
          const dx = pos.x - dragStart.x;
          const dy = pos.y - dragStart.y;
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          setDragEnd({
            x: dragStart.x + size * Math.sign(dx || 1),
            y: dragStart.y + size * Math.sign(dy || 1),
          });
        }
      } else {
        setDragEnd(pos);
      }
    }
  }, [isDrawing, submitted, activeTool, getCanvasCoords, elements, selectedIndices, dragMode, dragOffset, moveElements, resizeArrow, resizeShape, dragStart]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || submitted) return;
    e.preventDefault();

    if (activeTool === 'select') {
      if (dragMode === 'select-box' && selectionBox) {
        // Complete rubber band selection
        const rect = {
          x: selectionBox.start.x,
          y: selectionBox.start.y,
          w: selectionBox.end.x - selectionBox.start.x,
          h: selectionBox.end.y - selectionBox.start.y,
        };
        // Only select if box is meaningful size
        if (Math.abs(rect.w) > 5 || Math.abs(rect.h) > 5) {
          const newSel = new Set<number>();
          elements.forEach((el, idx) => {
            if (elementInRect(el, rect)) newSel.add(idx);
          });
          if (shiftHeld.current) {
            // Add to existing selection
            setSelectedIndices(prev => {
              const merged = new Set(prev);
              newSel.forEach(i => merged.add(i));
              return merged;
            });
          } else {
            setSelectedIndices(newSel);
          }
        }
        setSelectionBox(null);
      }
      // Commit move/resize to history if elements were modified
      if (dragMode === 'move' || dragMode === 'resize') {
        pendingCommitRef.current = true;
        // Force a re-snapshot by touching elements
        setElements(prev => [...prev]);
      }
      setDragMode(null);
      resizeTargetRef.current = null;
      resizeCornerRef.current = null;
    } else if (activeTool === 'pen' && currentStroke.length > 1) {
      pendingCommitRef.current = true;
      setElements(prev => [...prev, { type: 'stroke', points: currentStroke, color: penColor, width: penWidth }]);
      setCurrentStroke([]);
    } else if (activeTool === 'arrow' && dragStart && dragEnd) {
      const dist = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
      if (dist > 10) {
        pendingCommitRef.current = true;
        setElements(prev => [...prev, {
          type: 'arrow',
          start: dragStart,
          end: dragEnd,
          label1: '',
          label2: '',
          color: ARROW_COLOR,
          isComponent: false,
        }]);
      }
    } else if (activeTool === 'shape' && dragStart && dragEnd) {
      const dist = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
      if (dist > 5) {
        pendingCommitRef.current = true;
        const newShape: DrawingElement = {
          type: 'shape', shape: activeShape,
          start: dragStart, end: dragEnd,
          color: penColor, width: penWidth,
        };
        // Apply fill if enabled and shape supports it
        if (fillEnabled && activeShape !== 'line') {
          (newShape as { fill?: string; fillOpacity?: number }).fill = fillColor;
          (newShape as { fill?: string; fillOpacity?: number }).fillOpacity = fillOpacity;
        }
        setElements(prev => [...prev, newShape]);
      }
    }

    setIsDrawing(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDrawing, submitted, activeTool, currentStroke, dragStart, dragEnd, penColor, penWidth, activeShape, selectionBox, dragMode, elements, fillEnabled, fillColor, fillOpacity, commitToHistory]);

  // ──────────────────────────────────────────
  // Text confirm
  // ──────────────────────────────────────────

  const confirmText = useCallback(() => {
    if (!textPlacement || !textInput.trim()) { setTextPlacement(null); return; }
    pendingCommitRef.current = true;
    setElements(prev => [...prev, {
      type: 'text',
      position: textPlacement,
      text: textInput,
      color: penColor,
      fontSize: 16,
    }]);
    setTextPlacement(null);
    setTextInput('');
  }, [textPlacement, textInput, penColor]);

  // ──────────────────────────────────────────
  // Arrow label updates
  // ──────────────────────────────────────────

  const updateArrowLabel = useCallback((index: number, field: 'label1' | 'label2', value: string) => {
    setElements(prev => {
      const next = [...prev];
      const el = next[index];
      if (el.type === 'arrow') {
        next[index] = { ...el, [field]: value };
      }
      return next;
    });
  }, []);

  const deleteElement = useCallback((index: number) => {
    pendingCommitRef.current = true;
    setElements(prev => prev.filter((_, i) => i !== index));
    setSelectedIndices(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      });
      return next;
    });
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedIndices.size === 0) return;
    pendingCommitRef.current = true;
    setElements(prev => prev.filter((_, i) => !selectedIndices.has(i)));
    setSelectedIndices(new Set());
  }, [selectedIndices]);

  // ──────────────────────────────────────────
  // Layer ordering
  // ──────────────────────────────────────────

  const bringToFront = useCallback(() => {
    if (selectedIndices.size === 0) return;
    pendingCommitRef.current = true;
    setElements(prev => {
      const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
      const selected = sorted.map(i => prev[i]);
      const rest = prev.filter((_, i) => !selectedIndices.has(i));
      const combined = [...rest, ...selected];
      // Update selection indices to point to new positions
      const newSel = new Set<number>();
      for (let i = 0; i < selected.length; i++) newSel.add(rest.length + i);
      setTimeout(() => setSelectedIndices(newSel), 0);
      return combined;
    });
  }, [selectedIndices]);

  const sendToBack = useCallback(() => {
    if (selectedIndices.size === 0) return;
    pendingCommitRef.current = true;
    setElements(prev => {
      const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
      const selected = sorted.map(i => prev[i]);
      const rest = prev.filter((_, i) => !selectedIndices.has(i));
      const combined = [...selected, ...rest];
      const newSel = new Set<number>();
      for (let i = 0; i < selected.length; i++) newSel.add(i);
      setTimeout(() => setSelectedIndices(newSel), 0);
      return combined;
    });
  }, [selectedIndices]);

  const moveUp = useCallback(() => {
    if (selectedIndices.size === 0) return;
    const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
    // If the topmost selected is already at the end, can't move up
    setElements(prev => {
      if (sorted[sorted.length - 1] >= prev.length - 1) return prev;
      pendingCommitRef.current = true;
      const next = [...prev];
      const newSel = new Set<number>();
      // Move from top to bottom to avoid overlap
      for (let i = sorted.length - 1; i >= 0; i--) {
        const idx = sorted[i];
        if (idx < next.length - 1 && !selectedIndices.has(idx + 1)) {
          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
          newSel.add(idx + 1);
        } else {
          newSel.add(idx);
        }
      }
      setTimeout(() => setSelectedIndices(newSel), 0);
      return next;
    });
  }, [selectedIndices]);

  const moveDown = useCallback(() => {
    if (selectedIndices.size === 0) return;
    const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
    // If the bottommost selected is already at 0, can't move down
    setElements(prev => {
      if (sorted[0] <= 0) return prev;
      pendingCommitRef.current = true;
      const next = [...prev];
      const newSel = new Set<number>();
      // Move from bottom to top to avoid overlap
      for (let i = 0; i < sorted.length; i++) {
        const idx = sorted[i];
        if (idx > 0 && !selectedIndices.has(idx - 1)) {
          [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
          newSel.add(idx - 1);
        } else {
          newSel.add(idx);
        }
      }
      setTimeout(() => setSelectedIndices(newSel), 0);
      return next;
    });
  }, [selectedIndices]);

  // ──────────────────────────────────────────
  // Apply color/fill changes to selected elements
  // ──────────────────────────────────────────

  const applyStrokeColorToSelected = useCallback((color: string) => {
    if (selectedIndices.size === 0) return;
    pendingCommitRef.current = true;
    setElements(prev => {
      const next = [...prev];
      selectedIndices.forEach(idx => {
        const el = next[idx];
        if (el.type === 'stroke' || el.type === 'shape' || el.type === 'text') {
          next[idx] = { ...el, color };
        }
        // Arrows use their own fixed color, but let users override
        if (el.type === 'arrow') {
          next[idx] = { ...el, color };
        }
      });
      return next;
    });
  }, [selectedIndices]);

  const applyFillToSelected = useCallback((fill: string | undefined, opacity: number | undefined) => {
    if (selectedIndices.size === 0) return;
    pendingCommitRef.current = true;
    setElements(prev => {
      const next = [...prev];
      selectedIndices.forEach(idx => {
        const el = next[idx];
        if (el.type === 'shape' && el.shape !== 'line') {
          next[idx] = {
            ...el,
            fill: fill ?? el.fill,
            fillOpacity: opacity ?? el.fillOpacity,
          } as typeof el;
        }
      });
      return next;
    });
  }, [selectedIndices]);

  const removeFillFromSelected = useCallback(() => {
    if (selectedIndices.size === 0) return;
    pendingCommitRef.current = true;
    setElements(prev => {
      const next = [...prev];
      selectedIndices.forEach(idx => {
        const el = next[idx];
        if (el.type === 'shape') {
          const { fill: _f, fillOpacity: _fo, ...rest } = el as typeof el & { fill?: string; fillOpacity?: number };
          next[idx] = rest as typeof el;
        }
      });
      return next;
    });
  }, [selectedIndices]);

  // ──────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snapshot = historyRef.current[historyIdxRef.current];
    setElements(JSON.parse(JSON.stringify(snapshot)));
    setSelectedIndices(new Set());
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snapshot = historyRef.current[historyIdxRef.current];
    setElements(JSON.parse(JSON.stringify(snapshot)));
    setSelectedIndices(new Set());
  }, []);

  const handleClear = useCallback(() => {
    pendingCommitRef.current = true;
    setElements([]);
    setSelectedIndices(new Set());
    setShowClearConfirm(false);
  }, []);

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    onResponseChange?.({ elements, submitted: true });
    onComplete(true);
  }, [elements, onComplete, onResponseChange]);

  const handleEdit = useCallback(() => {
    setSubmitted(false);
    onResponseChange?.({ elements, submitted: false });
  }, [elements, onResponseChange]);

  // ──────────────────────────────────────────
  // Copy / Paste
  // ──────────────────────────────────────────

  const handleCopy = useCallback(() => {
    if (selectedIndices.size === 0) return;
    clipboardRef.current = Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map(i => elements[i]);
  }, [elements, selectedIndices]);

  const handlePaste = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    pendingCommitRef.current = true;
    const offset = 20;
    const pasted = clipboardRef.current.map(el => cloneElement(el, offset, offset));
    setElements(prev => {
      const newElements = [...prev, ...pasted];
      // Select the pasted elements
      const newIndices = new Set<number>();
      for (let i = prev.length; i < newElements.length; i++) newIndices.add(i);
      // Have to set outside to avoid stale closure
      setTimeout(() => setSelectedIndices(newIndices), 0);
      return newElements;
    });
  }, []);

  // ──────────────────────────────────────────
  // Keyboard shortcuts
  // ──────────────────────────────────────────

  // Toggle component/dashed for all selected arrows
  const toggleComponent = useCallback(() => {
    if (selectedIndices.size === 0) return;
    setElements(prev => {
      const next = [...prev];
      selectedIndices.forEach(idx => {
        const el = next[idx];
        if (el.type === 'arrow') {
          next[idx] = { ...el, isComponent: !el.isComponent };
        }
      });
      return next;
    });
  }, [selectedIndices]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (submitted) return;
      if (textPlacement) return;
      // Don't hijack when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        switch (key) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) handleRedo(); else handleUndo();
            return;
          case 'y': e.preventDefault(); handleRedo(); return;
          case 'c': e.preventDefault(); handleCopy(); return;
          case 'v': e.preventDefault(); handlePaste(); return;
          case 'a':
            e.preventDefault();
            setSelectedIndices(new Set(elements.map((_, i) => i)));
            setActiveTool('select');
            return;
        }
      }

      switch (key) {
        case 'v': if (!mod) setActiveTool('select'); break;
        case 'a': if (!mod) setActiveTool('arrow'); break;
        case 'p': setActiveTool('pen'); break;
        case 's': setActiveTool('shape'); break;
        case 't': setActiveTool('text'); break;
        case 'e': setActiveTool('eraser'); break;
        case 'c': if (!mod) toggleComponent(); break;
        case '?': setShowShortcuts(v => !v); break;
        case ']': if (e.shiftKey) bringToFront(); else moveUp(); break;
        case '[': if (e.shiftKey) sendToBack(); else moveDown(); break;
        case 'delete':
        case 'backspace':
          if (selectedIndices.size > 0) {
            e.preventDefault();
            deleteSelected();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitted, textPlacement, handleUndo, handleRedo, handleCopy, handlePaste, selectedIndices, deleteSelected, toggleComponent, elements, bringToFront, sendToBack, moveUp, moveDown]);

  // ──────────────────────────────────────────
  // Cursor style
  // ──────────────────────────────────────────

  const cursorStyle = (() => {
    if (submitted) return 'default';
    switch (activeTool) {
      case 'select': return 'default';
      case 'pen': return 'crosshair';
      case 'arrow': return 'crosshair';
      case 'shape': return 'crosshair';
      case 'text': return 'text';
      case 'eraser': return 'pointer';
      default: return 'crosshair';
    }
  })();

  // ──────────────────────────────────────────
  // Toolbar button helper
  // ──────────────────────────────────────────

  const ToolBtn: React.FC<{ tool: Tool; icon: React.ReactNode; label: string; shortcut: string }> = ({ tool, icon, label, shortcut }) => (
    <button
      onClick={() => {
        setActiveTool(tool);
        setShowColorPicker(false);
        setShowFillPicker(false);
        setShowWidthPicker(false);
        setShowShapePicker(false);
      }}
      style={{
        padding: '6px 8px',
        borderRadius: '6px',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
        background: activeTool === tool ? '#007aff' : 'transparent',
        color: activeTool === tool ? '#ffffff' : '#555',
      }}
      onMouseEnter={(e) => { if (activeTool !== tool) e.currentTarget.style.background = '#e8e8e8'; }}
      onMouseLeave={(e) => { if (activeTool !== tool) e.currentTarget.style.background = 'transparent'; }}
      aria-label={label}
      title={`${label} (${shortcut})`}
    >
      {icon}
    </button>
  );

  // ──────────────────────────────────────────
  // Mode hint & axis labels for point_model
  // ──────────────────────────────────────────

  const modeHint = drawingMode === 'point_model'
    ? 'Draw forces acting on the point object'
    : drawingMode === 'extended_body'
      ? 'Draw your object using shapes, then add force arrows at their points of application'
      : null;

  // ──────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Title / prompt */}
      {block.title && (
        <p style={{ fontSize: '14px', fontWeight: 600, color: '#222', margin: '0 0 4px 0' }}>{block.title}</p>
      )}
      {block.content && (
        <p style={{ fontSize: '14px', color: '#444', lineHeight: 1.6, margin: '0 0 4px 0' }}>{block.content}</p>
      )}
      {block.instructions && (
        <p style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', margin: '0 0 4px 0' }}>{block.instructions}</p>
      )}
      {modeHint && (
        <p style={{ fontSize: '12px', color: '#007aff', fontStyle: 'italic', margin: '0 0 4px 0' }}>{modeHint}</p>
      )}

      {/* Toolbar */}
      {!submitted && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px',
            background: '#f0f0f0',
            border: '1px solid #ddd',
            borderRadius: '10px',
            padding: '6px 10px',
          }}
        >
          <ToolBtn tool="select" icon={<MousePointer2 size={16} />} label="Select" shortcut="V" />
          <ToolBtn tool="arrow" icon={<ArrowUpRight size={16} />} label="Arrow" shortcut="A" />
          <ToolBtn tool="pen" icon={<Pencil size={16} />} label="Pen" shortcut="P" />

          {/* Shape tool with sub-picker */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setActiveTool('shape'); setShowShapePicker(v => !v); setShowColorPicker(false); setShowFillPicker(false); setShowWidthPicker(false); }}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
                background: activeTool === 'shape' ? '#007aff' : 'transparent',
                color: activeTool === 'shape' ? '#ffffff' : '#555',
              }}
              aria-label="Shape"
              title="Shape (S)"
            >
              <Square size={16} />
            </button>
            {showShapePicker && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
                padding: '4px', display: 'flex', gap: '2px', zIndex: 20,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                <button onClick={() => { setActiveShape('circle'); setShowShapePicker(false); }}
                  style={{ padding: '4px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: activeShape === 'circle' ? '#e0ecff' : 'transparent' }}
                  aria-label="Circle" title="Circle">
                  <Circle size={16} color="#555" />
                </button>
                <button onClick={() => { setActiveShape('rectangle'); setShowShapePicker(false); }}
                  style={{ padding: '4px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: activeShape === 'rectangle' ? '#e0ecff' : 'transparent' }}
                  aria-label="Rectangle" title="Rectangle">
                  <Square size={16} color="#555" />
                </button>
                <button onClick={() => { setActiveShape('line'); setShowShapePicker(false); }}
                  style={{ padding: '4px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: activeShape === 'line' ? '#e0ecff' : 'transparent' }}
                  aria-label="Line" title="Line">
                  <Minus size={16} color="#555" />
                </button>
              </div>
            )}
          </div>

          <ToolBtn tool="text" icon={<Type size={16} />} label="Text" shortcut="T" />
          <ToolBtn tool="eraser" icon={<Eraser size={16} />} label="Eraser" shortcut="E" />

          <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />

          {/* Stroke color: color wheel + quick presets */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowColorPicker(v => !v); setShowFillPicker(false); setShowWidthPicker(false); setShowShapePicker(false); }}
              style={{
                padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent',
              }}
              aria-label="Stroke color"
              title="Stroke Color"
            >
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #bbb', backgroundColor: penColor }} />
            </button>
            {showColorPicker && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                background: '#fff', border: '1px solid #ddd', borderRadius: '10px',
                padding: '10px', zIndex: 20, width: '180px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px', fontWeight: 500 }}>Stroke Color</div>
                <input
                  type="color"
                  value={penColor}
                  onChange={e => { setPenColor(e.target.value); applyStrokeColorToSelected(e.target.value); }}
                  style={{ width: '100%', height: '32px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }}
                  title="Pick any color"
                />
                <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {['#000000', '#FF3B30', '#007aff', '#34C759', '#FF9500', '#AF52DE', '#8B4513', '#ffffff'].map(c => (
                    <button
                      key={c}
                      onClick={() => { setPenColor(c); applyStrokeColorToSelected(c); setShowColorPicker(false); }}
                      style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        border: penColor === c ? '2px solid #007aff' : c === '#ffffff' ? '2px solid #ddd' : '2px solid transparent',
                        backgroundColor: c, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fill color + opacity */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowFillPicker(v => !v); setShowColorPicker(false); setShowWidthPicker(false); setShowShapePicker(false); }}
              style={{
                padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '3px', background: 'transparent',
              }}
              aria-label="Fill color"
              title="Fill Color & Opacity"
            >
              <div style={{
                width: '16px', height: '16px', borderRadius: '3px',
                border: fillEnabled ? '2px solid #007aff' : '2px solid #bbb',
                backgroundColor: fillEnabled ? fillColor : 'transparent',
                opacity: fillEnabled ? fillOpacity : 0.4,
              }} />
              <span style={{ fontSize: '10px', color: fillEnabled ? '#007aff' : '#999', fontWeight: 600 }}>Fill</span>
            </button>
            {showFillPicker && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                background: '#fff', border: '1px solid #ddd', borderRadius: '10px',
                padding: '10px', zIndex: 20, width: '200px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                {/* Enable/disable toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '12px', color: '#555' }}>
                  <input
                    type="checkbox"
                    checked={fillEnabled}
                    onChange={e => {
                      setFillEnabled(e.target.checked);
                      if (selectedIndices.size > 0) {
                        if (e.target.checked) {
                          applyFillToSelected(fillColor, fillOpacity);
                        } else {
                          removeFillFromSelected();
                        }
                      }
                    }}
                    style={{ accentColor: '#007aff' }}
                  />
                  Enable fill
                </label>
                {fillEnabled && (
                  <>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 500 }}>Fill Color</div>
                    <input
                      type="color"
                      value={fillColor}
                      onChange={e => { setFillColor(e.target.value); applyFillToSelected(e.target.value, undefined); }}
                      style={{ width: '100%', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }}
                    />
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {['#007aff', '#FF3B30', '#34C759', '#FF9500', '#AF52DE', '#FFD60A', '#f5f5f5', '#000000'].map(c => (
                        <button
                          key={c}
                          onClick={() => { setFillColor(c); applyFillToSelected(c, undefined); }}
                          style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            border: fillColor === c ? '2px solid #007aff' : '2px solid transparent',
                            backgroundColor: c, cursor: 'pointer',
                          }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 500 }}>
                        Opacity: {Math.round(fillOpacity * 100)}%
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(fillOpacity * 100)}
                        onChange={e => { const v = Number(e.target.value) / 100; setFillOpacity(v); applyFillToSelected(undefined, v); }}
                        style={{ width: '100%', accentColor: '#007aff' }}
                      />
                      {/* Preview */}
                      <div style={{
                        marginTop: '6px', height: '24px', borderRadius: '4px',
                        border: '1px solid #ddd', position: 'relative', overflow: 'hidden',
                      }}>
                        {/* Checkerboard background for transparency */}
                        <div style={{
                          position: 'absolute', inset: 0,
                          backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                          backgroundSize: '8px 8px',
                          backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                        }} />
                        <div style={{
                          position: 'absolute', inset: 0,
                          backgroundColor: fillColor,
                          opacity: fillOpacity,
                        }} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Width picker */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowWidthPicker(v => !v); setShowColorPicker(false); setShowFillPicker(false); setShowShapePicker(false); }}
              style={{
                padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '11px', fontFamily: 'monospace', color: '#555', background: 'transparent',
              }}
              aria-label="Stroke width"
              title="Width"
            >
              {penWidth}px
            </button>
            {showWidthPicker && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
                padding: '4px', display: 'flex', gap: '2px', zIndex: 20,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                {PEN_WIDTHS.map(w => (
                  <button
                    key={w}
                    onClick={() => { setPenWidth(w); setShowWidthPicker(false); }}
                    style={{
                      padding: '4px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      fontSize: '11px', fontFamily: 'monospace',
                      background: penWidth === w ? '#e0ecff' : 'transparent',
                      color: penWidth === w ? '#007aff' : '#555',
                    }}
                    aria-label={`${w}px width`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />

          {/* Copy / Paste */}
          <button
            onClick={handleCopy}
            disabled={selectedIndices.size === 0}
            style={{
              padding: '6px 8px', borderRadius: '6px', border: 'none',
              cursor: selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555', opacity: selectedIndices.size === 0 ? 0.3 : 1,
            }}
            aria-label="Copy"
            title="Copy (Ctrl+C)"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={handlePaste}
            disabled={clipboardRef.current.length === 0}
            style={{
              padding: '6px 8px', borderRadius: '6px', border: 'none',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555',
            }}
            aria-label="Paste"
            title="Paste (Ctrl+V)"
          >
            <ClipboardPaste size={16} />
          </button>

          {/* Layer controls */}
          <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />
          <button
            onClick={bringToFront}
            disabled={selectedIndices.size === 0}
            style={{
              padding: '6px 4px', borderRadius: '6px', border: 'none',
              cursor: selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555', opacity: selectedIndices.size === 0 ? 0.3 : 1,
            }}
            aria-label="Bring to front"
            title="Bring to Front"
          >
            <ArrowUpToLine size={14} />
          </button>
          <button
            onClick={moveUp}
            disabled={selectedIndices.size === 0}
            style={{
              padding: '6px 4px', borderRadius: '6px', border: 'none',
              cursor: selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555', opacity: selectedIndices.size === 0 ? 0.3 : 1,
            }}
            aria-label="Move up one layer"
            title="Move Up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={moveDown}
            disabled={selectedIndices.size === 0}
            style={{
              padding: '6px 4px', borderRadius: '6px', border: 'none',
              cursor: selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555', opacity: selectedIndices.size === 0 ? 0.3 : 1,
            }}
            aria-label="Move down one layer"
            title="Move Down"
          >
            <ArrowDown size={14} />
          </button>
          <button
            onClick={sendToBack}
            disabled={selectedIndices.size === 0}
            style={{
              padding: '6px 4px', borderRadius: '6px', border: 'none',
              cursor: selectedIndices.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555', opacity: selectedIndices.size === 0 ? 0.3 : 1,
            }}
            aria-label="Send to back"
            title="Send to Back"
          >
            <ArrowDownToLine size={14} />
          </button>

          <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={historyIdxRef.current <= 0}
            style={{
              padding: '6px 8px', borderRadius: '6px', border: 'none',
              cursor: historyIdxRef.current <= 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555',
              opacity: historyIdxRef.current <= 0 ? 0.3 : 1,
            }}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>

          {/* Redo */}
          <button
            onClick={handleRedo}
            disabled={historyIdxRef.current >= historyRef.current.length - 1}
            style={{
              padding: '6px 8px', borderRadius: '6px', border: 'none',
              cursor: historyIdxRef.current >= historyRef.current.length - 1 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555',
              opacity: historyIdxRef.current >= historyRef.current.length - 1 ? 0.3 : 1,
            }}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 size={16} />
          </button>

          {/* Clear */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={elements.length === 0}
              style={{
                padding: '6px 8px', borderRadius: '6px', border: 'none',
                cursor: elements.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', color: '#555', opacity: elements.length === 0 ? 0.3 : 1,
              }}
              aria-label="Clear all"
              title="Clear all"
            >
              <Trash2 size={16} />
            </button>
            {showClearConfirm && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
                padding: '12px', zIndex: 20, width: '180px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                <p style={{ fontSize: '12px', color: '#555', margin: '0 0 8px 0' }}>Clear the entire canvas?</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleClear} style={{
                    flex: 1, padding: '4px 8px', background: '#FDECEA', color: '#d32f2f',
                    border: '1px solid #FECDD2', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
                  }}>Clear</button>
                  <button onClick={() => setShowClearConfirm(false)} style={{
                    flex: 1, padding: '4px 8px', background: '#f5f5f5', color: '#555',
                    border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setShowShortcuts(v => !v)}
              style={{
                padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showShortcuts ? '#007aff' : 'transparent',
                color: showShortcuts ? '#ffffff' : '#999',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { if (!showShortcuts) e.currentTarget.style.background = '#e8e8e8'; }}
              onMouseLeave={(e) => { if (!showShortcuts) e.currentTarget.style.background = 'transparent'; }}
              aria-label="Keyboard shortcuts"
              title="Shortcuts (?)"
            >
              <Keyboard size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Canvas + Overlay container */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          border: '1px solid #ddd',
          borderRadius: '10px',
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        <canvas
          ref={canvasRef}
          height={canvasHeight}
          style={{ display: 'block', width: '100%', cursor: cursorStyle, touchAction: 'none' }}
          role="img"
          aria-label={block.title ? `Drawing canvas: ${block.title}` : 'Drawing canvas for force diagram'}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />

        {/* HTML Overlay layer */}
        <div
          ref={overlayRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {/* Axis labels for point_model */}
          {drawingMode === 'point_model' && (
            <>
              <span style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', color: '#999', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px' }}>+y</span>
              <span style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', color: '#999', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px' }}>-y</span>
              <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#999', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px' }}>+x</span>
              <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#999', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px' }}>-x</span>
            </>
          )}

          {/* Arrow force labels (HTML overlays with subscript inputs) */}
          {elements.map((el, idx) => {
            if (el.type !== 'arrow') return null;

            // Position label near arrowhead
            const canvas = canvasRef.current;
            if (!canvas) return null;
            const scaleX = 100 / canvas.width;
            const scaleY = 100 / canvas.height;

            const labelX = el.end.x * scaleX;
            const labelY = el.end.y * scaleY;

            // Offset the label away from the arrow direction
            const isPointingDown = (el.end.y - el.start.y) > 0;
            const offsetY = isPointingDown ? 1.5 : -5;

            return (
              <div
                key={`label-${idx}`}
                style={{
                  position: 'absolute',
                  left: `${labelX}%`,
                  top: `${labelY}%`,
                  transform: `translate(-50%, ${offsetY > 0 ? '8px' : 'calc(-100% - 8px)'})`,
                  background: 'rgba(255, 255, 255, 0.92)',
                  backdropFilter: 'blur(4px)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontFamily: 'Arial, sans-serif',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  whiteSpace: 'nowrap',
                  zIndex: 5,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  border: selectedIndices.has(idx) ? '1.5px solid #007aff' : '1px solid rgba(0,0,0,0.05)',
                  pointerEvents: submitted ? 'none' : 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                {/* Delete button */}
                {!submitted && (
                  <button
                    onClick={() => deleteElement(idx)}
                    style={{
                      position: 'absolute',
                      top: '-7px',
                      right: '-7px',
                      width: '18px',
                      height: '18px',
                      backgroundColor: '#FF3B30',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      fontSize: '13px',
                      lineHeight: '16px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      display: 'none',
                      zIndex: 10,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      padding: 0,
                    }}
                    className="force-delete-btn"
                    aria-label="Delete arrow"
                  >
                    &times;
                  </button>
                )}
                <span style={{ color: '#557A45', fontWeight: 'bold' }}>F</span>
                <input
                  value={el.label1}
                  onChange={(e) => updateArrowLabel(idx, 'label1', e.target.value)}
                  disabled={submitted}
                  placeholder="_"
                  style={{
                    width: '35px',
                    border: 'none',
                    borderBottom: '2px solid #007aff',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '15px',
                    background: 'transparent',
                    outline: 'none',
                    padding: '2px 0',
                    margin: '0 2px',
                    color: '#007aff',
                  }}
                />
                <span style={{ fontSize: '13px', color: '#666', fontWeight: 'normal' }}>on</span>
                <input
                  value={el.label2}
                  onChange={(e) => updateArrowLabel(idx, 'label2', e.target.value)}
                  disabled={submitted}
                  placeholder="_"
                  style={{
                    width: '35px',
                    border: 'none',
                    borderBottom: '2px solid #FF3B30',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '15px',
                    background: 'transparent',
                    outline: 'none',
                    padding: '2px 0',
                    margin: '0 2px',
                    color: '#FF3B30',
                  }}
                />
              </div>
            );
          })}

          {/* Text elements as HTML overlays */}
          {elements.map((el, idx) => {
            if (el.type !== 'text') return null;
            const canvas = canvasRef.current;
            if (!canvas) return null;
            const scaleX = 100 / canvas.width;
            const scaleY = 100 / canvas.height;
            return (
              <div
                key={`text-${idx}`}
                style={{
                  position: 'absolute',
                  left: `${el.position.x * scaleX}%`,
                  top: `${el.position.y * scaleY}%`,
                  color: el.color,
                  fontSize: `${el.fontSize}px`,
                  fontFamily: 'Arial, sans-serif',
                  fontWeight: 500,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                {el.text}
              </div>
            );
          })}

          {/* Tooltip */}
          {tooltip && (() => {
            const canvas = canvasRef.current;
            if (!canvas) return null;
            const scaleX = 100 / canvas.width;
            const scaleY = 100 / canvas.height;
            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${(tooltip.x + 20) * scaleX}%`,
                  top: `${(tooltip.y + 20) * scaleY}%`,
                  background: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid #007aff',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#333',
                  zIndex: 20,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  whiteSpace: 'nowrap',
                }}
              >
                {tooltip.text}
              </div>
            );
          })()}
        </div>

        {/* Shortcuts help overlay */}
        {showShortcuts && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'rgba(255,255,255,0.97)', border: '1px solid #ddd', borderRadius: '12px',
            padding: '20px 24px', zIndex: 40, width: '280px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '14px', color: '#222' }}>Keyboard Shortcuts</span>
              <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '18px' }}>&times;</button>
            </div>
            {[
              ['V', 'Select tool'],
              ['A', 'Arrow / Force'],
              ['P', 'Pen'],
              ['S', 'Shape'],
              ['T', 'Text'],
              ['E', 'Eraser'],
              ['C', 'Toggle component (dashed)'],
              ['Del', 'Delete selected'],
              ['Ctrl+C', 'Copy selected'],
              ['Ctrl+V', 'Paste'],
              ['Ctrl+A', 'Select all'],
              ['Ctrl+Z', 'Undo'],
              ['Ctrl+Shift+Z', 'Redo'],
              ['Shift', 'Snap angles / regular shapes'],
              ['Shift+Click', 'Add to selection'],
              [']', 'Move up one layer'],
              ['[', 'Move down one layer'],
              ['}', 'Bring to front'],
              ['{', 'Send to back'],
              ['?', 'Toggle this panel'],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '13px' }}>
                <kbd style={{ background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', padding: '1px 6px', fontFamily: 'monospace', fontSize: '12px', color: '#333' }}>{key}</kbd>
                <span style={{ color: '#666' }}>{desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Text input popup */}
        {textPlacement && (
          <div
            style={{
              position: 'absolute',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '12px',
              zIndex: 30,
              width: '200px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              left: `${Math.min(textPlacement.x / (canvasRef.current?.width ?? 800) * 100, 70)}%`,
              top: `${Math.min(textPlacement.y / (canvasRef.current?.height ?? 400) * 100, 75)}%`,
            }}
          >
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Type label..."
              style={{
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
                padding: '6px 8px',
                fontSize: '14px',
                color: '#333',
                outline: 'none',
                marginBottom: '8px',
                boxSizing: 'border-box',
              }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmText(); if (e.key === 'Escape') setTextPlacement(null); }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={confirmText} style={{
                flex: 1, padding: '4px 8px', background: '#e0ecff', color: '#007aff',
                border: '1px solid #b3d4ff', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
              }}>Add</button>
              <button onClick={() => setTextPlacement(null)} style={{
                flex: 1, padding: '4px 8px', background: '#f5f5f5', color: '#555',
                border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Resize handle */}
      {!submitted && (
        <div
          style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            height: '16px', cursor: 'row-resize', userSelect: 'none',
            borderRadius: '0 0 8px 8px', background: isResizing ? '#e8e8e8' : '#f5f5f5',
            border: '1px solid #ddd', borderTop: 'none',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = '#e8e8e8'; }}
          onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = '#f5f5f5'; }}
          onMouseDown={e => {
            e.preventDefault();
            resizeRef.current = { startY: e.clientY, startH: canvasHeight };
            setIsResizing(true);

            const onMove = (ev: MouseEvent) => {
              if (!resizeRef.current) return;
              const newH = Math.max(200, Math.min(1000, resizeRef.current.startH + (ev.clientY - resizeRef.current.startY)));
              setUserHeight(newH);
            };
            const onUp = () => {
              resizeRef.current = null;
              setIsResizing(false);
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          title="Drag to resize canvas"
        >
          <GripHorizontal size={14} color="#999" />
        </div>
      )}

      {/* Submit / Submitted state */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={elements.length === 0}
            style={{
              padding: '8px 20px',
              background: elements.length === 0 ? '#b3d4ff' : '#007aff',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: elements.length === 0 ? 'not-allowed' : 'pointer',
              opacity: elements.length === 0 ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
          >
            Submit Drawing
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#34C759' }}>
              <Check size={16} />
              Submitted
            </div>
            <button
              onClick={handleEdit}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', background: '#f5f5f5', color: '#555',
                border: '1px solid #ddd', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
              }}
            >
              <Edit3 size={14} />
              Edit
            </button>
          </>
        )}
      </div>

      {/* Style tag for hover-based delete button visibility */}
      <style>{`
        .force-label-container:hover .force-delete-btn,
        div:hover > .force-delete-btn {
          display: block !important;
        }
      `}</style>
    </div>
  );
};

export default DrawingBlock;

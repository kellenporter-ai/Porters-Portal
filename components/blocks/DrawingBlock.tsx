import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Pencil, Eraser, ArrowUpRight, Square, Type, Undo2, Trash2,
  Circle, Minus, Check, Edit3, MousePointer2
} from 'lucide-react';
import { LessonBlock } from '../../types';

// ──────────────────────────────────────────────
// Data types
// ──────────────────────────────────────────────

type DrawingElement =
  | { type: 'stroke'; points: { x: number; y: number }[]; color: string; width: number }
  | { type: 'arrow'; start: { x: number; y: number }; end: { x: number; y: number }; label1: string; label2: string; color: string; isComponent: boolean }
  | { type: 'shape'; shape: 'circle' | 'rectangle' | 'line'; start: { x: number; y: number }; end: { x: number; y: number }; color: string; width: number }
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

const PEN_COLORS = [
  { value: '#FF3B30', label: 'Red' },
  { value: '#007aff', label: 'Blue' },
  { value: '#34C759', label: 'Green' },
  { value: '#000000', label: 'Black' },
  { value: '#FF9500', label: 'Orange' },
  { value: '#AF52DE', label: 'Purple' },
];

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

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  // Selection & dragging
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'resize' | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Text placement popup
  const [textPlacement, setTextPlacement] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState('');

  // Tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);

  const [canvasWidth, setCanvasWidth] = useState(800);
  const canvasHeight = block.canvasHeight ?? 400;
  const drawingMode = block.drawingMode ?? 'free';

  const shiftHeld = useRef(false);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

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
      // Centered rectangle
      const w = 120;
      const h = 80;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    }

    // Draw all elements
    elements.forEach((el, idx) => {
      renderElementToCanvas(ctx, el);
      // Selection highlight
      if (idx === selectedIndex) {
        const bounds = getElementBounds(el);
        ctx.save();
        ctx.strokeStyle = '#007aff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
        ctx.setLineDash([]);
        ctx.restore();
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
  }, [elements, currentStroke, dragStart, dragEnd, activeTool, penColor, penWidth, activeShape, drawingMode, selectedIndex]);

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

  const moveElement = useCallback((index: number, dx: number, dy: number) => {
    setElements(prev => {
      const next = [...prev];
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

  // ──────────────────────────────────────────
  // Pointer handlers
  // ──────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (submitted) return;
    e.preventDefault();
    const pos = getCanvasCoords(e as React.MouseEvent);

    // Close any open pickers
    setShowColorPicker(false);
    setShowWidthPicker(false);
    setShowShapePicker(false);

    if (activeTool === 'select') {
      // Check if clicking near arrowhead for resize
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === 'arrow' && Math.hypot(pos.x - el.end.x, pos.y - el.end.y) < 18) {
          setSelectedIndex(i);
          setDragMode('resize');
          setIsDrawing(true);
          return;
        }
      }
      // Check if clicking on any element for move
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hitTestElement(pos, elements[i])) {
          setSelectedIndex(i);
          setDragMode('move');
          setDragOffset(pos);
          setIsDrawing(true);
          return;
        }
      }
      // Clicked empty space — deselect
      setSelectedIndex(null);
      setDragMode(null);
    } else if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentStroke([pos]);
    } else if (activeTool === 'eraser') {
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hitTestElement(pos, elements[i], 20)) {
          setElements(prev => prev.filter((_, idx) => idx !== i));
          if (selectedIndex === i) setSelectedIndex(null);
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
  }, [submitted, activeTool, getCanvasCoords, elements, selectedIndex, drawingMode]);

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

    if (activeTool === 'select' && dragMode === 'move' && selectedIndex !== null) {
      const dx = pos.x - dragOffset.x;
      const dy = pos.y - dragOffset.y;
      moveElement(selectedIndex, dx, dy);
      setDragOffset(pos);
    } else if (activeTool === 'select' && dragMode === 'resize' && selectedIndex !== null) {
      let end = pos;
      if (shiftHeld.current) {
        const el = elements[selectedIndex];
        if (el.type === 'arrow') {
          end = snapAngle(el.start.x, el.start.y, pos.x, pos.y);
        }
      }
      resizeArrow(selectedIndex, end);
    } else if (activeTool === 'pen') {
      setCurrentStroke(prev => [...prev, pos]);
    } else if (activeTool === 'arrow') {
      let end = pos;
      if (shiftHeld.current && dragStart) {
        end = snapAngle(dragStart.x, dragStart.y, pos.x, pos.y);
      }
      setDragEnd(end);
    } else if (activeTool === 'shape') {
      setDragEnd(pos);
    }
  }, [isDrawing, submitted, activeTool, getCanvasCoords, elements, selectedIndex, dragMode, dragOffset, moveElement, resizeArrow, dragStart]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || submitted) return;
    e.preventDefault();

    if (activeTool === 'select') {
      setDragMode(null);
    } else if (activeTool === 'pen' && currentStroke.length > 1) {
      setElements(prev => [...prev, { type: 'stroke', points: currentStroke, color: penColor, width: penWidth }]);
      setCurrentStroke([]);
    } else if (activeTool === 'arrow' && dragStart && dragEnd) {
      const dist = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
      if (dist > 10) {
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
        setElements(prev => [...prev, {
          type: 'shape', shape: activeShape,
          start: dragStart, end: dragEnd,
          color: penColor, width: penWidth,
        }]);
      }
    }

    setIsDrawing(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDrawing, submitted, activeTool, currentStroke, dragStart, dragEnd, penColor, penWidth, activeShape]);

  // ──────────────────────────────────────────
  // Text confirm
  // ──────────────────────────────────────────

  const confirmText = useCallback(() => {
    if (!textPlacement || !textInput.trim()) { setTextPlacement(null); return; }
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
    setElements(prev => prev.filter((_, i) => i !== index));
    if (selectedIndex === index) setSelectedIndex(null);
  }, [selectedIndex]);

  // ──────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────

  const handleUndo = useCallback(() => {
    setElements(prev => prev.slice(0, -1));
    setSelectedIndex(null);
  }, []);

  const handleClear = useCallback(() => {
    setElements([]);
    setSelectedIndex(null);
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
  // Keyboard shortcuts
  // ──────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (submitted) return;
      if (textPlacement) return;
      // Don't hijack when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'v': setActiveTool('select'); break;
        case 'a': setActiveTool('arrow'); break;
        case 'p': setActiveTool('pen'); break;
        case 's': setActiveTool('shape'); break;
        case 't': setActiveTool('text'); break;
        case 'e': setActiveTool('eraser'); break;
        case 'z':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleUndo(); }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitted, textPlacement, handleUndo]);

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
      ? 'Draw forces at their points of application'
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
              onClick={() => { setActiveTool('shape'); setShowShapePicker(v => !v); setShowColorPicker(false); setShowWidthPicker(false); }}
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

          {/* Color picker */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowColorPicker(v => !v); setShowWidthPicker(false); setShowShapePicker(false); }}
              style={{
                padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent',
              }}
              aria-label="Pick color"
              title="Color"
            >
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #bbb', backgroundColor: penColor }} />
            </button>
            {showColorPicker && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
                padding: '6px', display: 'flex', gap: '4px', zIndex: 20,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                {PEN_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { setPenColor(c.value); setShowColorPicker(false); }}
                    style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      border: penColor === c.value ? '2px solid #007aff' : '2px solid #ddd',
                      backgroundColor: c.value, cursor: 'pointer', transform: penColor === c.value ? 'scale(1.15)' : 'scale(1)',
                      transition: 'all 0.15s',
                    }}
                    aria-label={c.label}
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Width picker */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowWidthPicker(v => !v); setShowColorPicker(false); setShowShapePicker(false); }}
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

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={elements.length === 0}
            style={{
              padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: elements.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: '#555', opacity: elements.length === 0 ? 0.3 : 1,
            }}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
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
            // Convert from canvas coords to percentage-based positioning
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
                  border: '1px solid rgba(0,0,0,0.05)',
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

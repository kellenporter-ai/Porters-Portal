import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Pencil, Eraser, ArrowUpRight, Square, Type, Undo2, Trash2,
  Circle, Minus, Check, X, Edit3
} from 'lucide-react';
import { LessonBlock } from '../../types';

// ──────────────────────────────────────────────
// Data types
// ──────────────────────────────────────────────

type DrawingElement =
  | { type: 'stroke'; points: { x: number; y: number }[]; color: string; width: number }
  | { type: 'arrow'; start: { x: number; y: number }; end: { x: number; y: number }; label: string; magnitude: string; color: string }
  | { type: 'shape'; shape: 'circle' | 'rectangle' | 'line'; start: { x: number; y: number }; end: { x: number; y: number }; color: string; width: number }
  | { type: 'text'; position: { x: number; y: number }; text: string; color: string };

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

type Tool = 'pen' | 'eraser' | 'arrow' | 'shape' | 'text';
type ShapeType = 'circle' | 'rectangle' | 'line';

const COLORS = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f59e0b', label: 'Orange' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#ffffff', label: 'White' },
];

const WIDTHS = [2, 4, 6, 8];

// ──────────────────────────────────────────────
// Helper: draw an arrowhead
// ──────────────────────────────────────────────

function drawArrowhead(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, color: string) {
  const headLen = 14;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// ──────────────────────────────────────────────
// Helper: distance from point to line segment
// ──────────────────────────────────────────────

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

const DrawingBlock: React.FC<DrawingBlockProps> = ({ block, onComplete, savedResponse, onResponseChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [elements, setElements] = useState<DrawingElement[]>(savedResponse?.elements ?? []);
  const [submitted, setSubmitted] = useState(savedResponse?.submitted ?? false);

  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [activeWidth, setActiveWidth] = useState(4);
  const [activeShape, setActiveShape] = useState<ShapeType>('line');

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  // Arrow label popup
  const [arrowPopup, setArrowPopup] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [arrowLabel, setArrowLabel] = useState('');
  const [arrowMagnitude, setArrowMagnitude] = useState('');

  // Text placement
  const [textPlacement, setTextPlacement] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState('');

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);

  const canvasHeight = block.canvasHeight ?? 400;
  const drawingMode = block.drawingMode ?? 'free';

  const bgImageRef = useRef<HTMLImageElement | null>(null);

  // Load background image
  useEffect(() => {
    if (block.backgroundImage) {
      const img = new Image();
      img.src = block.backgroundImage;
      img.onload = () => {
        bgImageRef.current = img;
        redraw();
      };
    }
  }, [block.backgroundImage]);

  // Sync response upstream
  useEffect(() => {
    onResponseChange?.({ elements, submitted });
  }, [elements, submitted]);

  // ──────────────────────────────────────────
  // Canvas coordinate helper
  // ──────────────────────────────────────────

  const getCanvasCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      const touch = e.touches[0] || (e as React.TouchEvent).changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  // ──────────────────────────────────────────
  // Rendering
  // ──────────────────────────────────────────

  const renderElement = useCallback((ctx: CanvasRenderingContext2D, el: DrawingElement) => {
    switch (el.type) {
      case 'stroke': {
        if (el.points.length < 2) return;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
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
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(el.start.x, el.start.y);
        ctx.lineTo(el.end.x, el.end.y);
        ctx.stroke();
        drawArrowhead(ctx, el.start, el.end, el.color);
        // Label
        if (el.label) {
          const mx = (el.start.x + el.end.x) / 2;
          const my = (el.start.y + el.end.y) / 2;
          ctx.font = '13px sans-serif';
          ctx.fillStyle = el.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          let labelText = el.label;
          if (el.magnitude) labelText += ` (${el.magnitude})`;
          ctx.fillText(labelText, mx, my - 6);
        }
        break;
      }
      case 'shape': {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.width;
        ctx.lineCap = 'round';
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
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'text': {
        ctx.font = '16px sans-serif';
        ctx.fillStyle = el.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(el.text, el.position.x, el.position.y);
        break;
      }
    }
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Background image
    if (bgImageRef.current) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    // Mode-specific background elements
    if (drawingMode === 'point_model') {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a855f750';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.stroke();
    } else if (drawingMode === 'extended_body') {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const w = 100;
      const h = 70;
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      ctx.fillStyle = '#a855f710';
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    }

    // Draw all elements
    elements.forEach(el => renderElement(ctx, el));

    // Draw active stroke
    if (activeTool === 'pen' && currentStroke.length > 1) {
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = activeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
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
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        ctx.lineTo(dragEnd.x, dragEnd.y);
        ctx.stroke();
        drawArrowhead(ctx, dragStart, dragEnd, activeColor);
      } else {
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = activeWidth;
        ctx.lineCap = 'round';
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
          const cx = (dragStart.x + dragEnd.x) / 2;
          const cy = (dragStart.y + dragEnd.y) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }, [elements, currentStroke, dragStart, dragEnd, activeTool, activeColor, activeWidth, activeShape, drawingMode, renderElement]);

  useEffect(() => { redraw(); }, [redraw]);

  // Resize canvas to match container width
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const width = container.clientWidth;
      canvas.width = width;
      canvas.height = canvasHeight;
      redraw();
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasHeight]);

  // ──────────────────────────────────────────
  // Pointer handlers
  // ──────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (submitted) return;
    e.preventDefault();
    const pos = getCanvasCoords(e);

    if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentStroke([pos]);
    } else if (activeTool === 'eraser') {
      // Find and remove the closest element
      let closestIdx = -1;
      let closestDist = 20; // tolerance in px
      elements.forEach((el, idx) => {
        if (el.type === 'stroke') {
          for (let i = 0; i < el.points.length - 1; i++) {
            const d = distToSegment(pos, el.points[i], el.points[i + 1]);
            if (d < closestDist) { closestDist = d; closestIdx = idx; }
          }
        } else if (el.type === 'arrow') {
          const d = distToSegment(pos, el.start, el.end);
          if (d < closestDist) { closestDist = d; closestIdx = idx; }
        } else if (el.type === 'shape') {
          if (el.shape === 'line') {
            const d = distToSegment(pos, el.start, el.end);
            if (d < closestDist) { closestDist = d; closestIdx = idx; }
          } else {
            const cx = (el.start.x + el.end.x) / 2;
            const cy = (el.start.y + el.end.y) / 2;
            const d = Math.hypot(pos.x - cx, pos.y - cy);
            if (d < Math.max(Math.abs(el.end.x - el.start.x), Math.abs(el.end.y - el.start.y)) / 2 + closestDist) {
              closestDist = 0;
              closestIdx = idx;
            }
          }
        } else if (el.type === 'text') {
          const d = Math.hypot(pos.x - el.position.x, pos.y - el.position.y);
          if (d < closestDist + 20) { closestDist = d; closestIdx = idx; }
        }
      });
      if (closestIdx >= 0) {
        setElements(prev => prev.filter((_, i) => i !== closestIdx));
      }
    } else if (activeTool === 'arrow' || activeTool === 'shape') {
      setIsDrawing(true);
      setDragStart(pos);
      setDragEnd(pos);
    } else if (activeTool === 'text') {
      setTextPlacement(pos);
      setTextInput('');
    }
  }, [submitted, activeTool, getCanvasCoords, elements, activeColor, activeWidth]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || submitted) return;
    e.preventDefault();
    const pos = getCanvasCoords(e);

    if (activeTool === 'pen') {
      setCurrentStroke(prev => [...prev, pos]);
    } else if (activeTool === 'arrow' || activeTool === 'shape') {
      setDragEnd(pos);
    }
  }, [isDrawing, submitted, activeTool, getCanvasCoords]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || submitted) return;
    e.preventDefault();

    if (activeTool === 'pen' && currentStroke.length > 1) {
      setElements(prev => [...prev, { type: 'stroke', points: currentStroke, color: activeColor, width: activeWidth }]);
      setCurrentStroke([]);
    } else if (activeTool === 'arrow' && dragStart && dragEnd) {
      const dist = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
      if (dist > 10) {
        // Snap to center in point_model mode
        let start = dragStart;
        if (drawingMode === 'point_model') {
          const canvas = canvasRef.current;
          if (canvas) {
            start = { x: canvas.width / 2, y: canvas.height / 2 };
          }
        }
        setArrowPopup({ start, end: dragEnd });
        setArrowLabel('');
        setArrowMagnitude('');
      }
    } else if (activeTool === 'shape' && dragStart && dragEnd) {
      const dist = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
      if (dist > 5) {
        setElements(prev => [...prev, {
          type: 'shape', shape: activeShape,
          start: dragStart, end: dragEnd,
          color: activeColor, width: activeWidth,
        }]);
      }
    }

    setIsDrawing(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDrawing, submitted, activeTool, currentStroke, dragStart, dragEnd, activeColor, activeWidth, activeShape, drawingMode]);

  // ──────────────────────────────────────────
  // Arrow label confirm
  // ──────────────────────────────────────────

  const confirmArrow = useCallback(() => {
    if (!arrowPopup) return;
    setElements(prev => [...prev, {
      type: 'arrow',
      start: arrowPopup.start,
      end: arrowPopup.end,
      label: arrowLabel,
      magnitude: arrowMagnitude,
      color: activeColor,
    }]);
    setArrowPopup(null);
  }, [arrowPopup, arrowLabel, arrowMagnitude, activeColor]);

  // ──────────────────────────────────────────
  // Text confirm
  // ──────────────────────────────────────────

  const confirmText = useCallback(() => {
    if (!textPlacement || !textInput.trim()) { setTextPlacement(null); return; }
    setElements(prev => [...prev, {
      type: 'text',
      position: textPlacement,
      text: textInput,
      color: activeColor,
    }]);
    setTextPlacement(null);
    setTextInput('');
  }, [textPlacement, textInput, activeColor]);

  // ──────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────

  const handleUndo = useCallback(() => {
    setElements(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setElements([]);
    setShowClearConfirm(false);
  }, []);

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    onResponseChange?.({ elements, submitted: true });
    onComplete(true); // Drawing blocks are self-assessed by the teacher
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
      if (arrowPopup || textPlacement) return; // Don't hijack when typing in popups
      switch (e.key.toLowerCase()) {
        case 'p': setActiveTool('pen'); break;
        case 'e': setActiveTool('eraser'); break;
        case 'a': setActiveTool('arrow'); break;
        case 's': setActiveTool('shape'); break;
        case 't': setActiveTool('text'); break;
        case 'z':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleUndo(); }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitted, arrowPopup, textPlacement, handleUndo]);

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
      className={`p-2 rounded-lg transition-all ${activeTool === tool ? 'bg-purple-600/40 text-purple-300 ring-1 ring-purple-500/50' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
      aria-label={label}
      title={`${label} (${shortcut})`}
    >
      {icon}
    </button>
  );

  // ──────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────

  const modeHint = drawingMode === 'point_model'
    ? 'Draw forces acting on the point object'
    : drawingMode === 'extended_body'
      ? 'Draw forces at their points of application'
      : null;

  return (
    <div className="space-y-3">
      {/* Title / prompt */}
      {block.title && (
        <p className="text-sm text-white font-medium">{block.title}</p>
      )}
      {block.content && (
        <p className="text-sm text-gray-300 leading-relaxed">{block.content}</p>
      )}
      {block.instructions && (
        <p className="text-xs text-gray-500 italic">{block.instructions}</p>
      )}
      {modeHint && (
        <p className="text-xs text-purple-400/80 italic">{modeHint}</p>
      )}

      {/* Toolbar */}
      {!submitted && (
        <div className="flex flex-wrap items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-2">
          <ToolBtn tool="pen" icon={<Pencil className="w-4 h-4" />} label="Pen" shortcut="P" />
          <ToolBtn tool="eraser" icon={<Eraser className="w-4 h-4" />} label="Eraser" shortcut="E" />
          <ToolBtn tool="arrow" icon={<ArrowUpRight className="w-4 h-4" />} label="Arrow" shortcut="A" />

          {/* Shape tool with sub-picker */}
          <div className="relative">
            <button
              onClick={() => { setActiveTool('shape'); setShowShapePicker(v => !v); setShowColorPicker(false); setShowWidthPicker(false); }}
              className={`p-2 rounded-lg transition-all ${activeTool === 'shape' ? 'bg-purple-600/40 text-purple-300 ring-1 ring-purple-500/50' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              aria-label="Shape"
              title="Shape (S)"
            >
              <Square className="w-4 h-4" />
            </button>
            {showShapePicker && (
              <div className="absolute top-full left-0 mt-1 bg-black/90 border border-white/10 rounded-lg p-1 flex gap-1 z-20">
                <button onClick={() => { setActiveShape('circle'); setShowShapePicker(false); }} className={`p-1.5 rounded ${activeShape === 'circle' ? 'bg-purple-600/40' : 'hover:bg-white/10'}`} aria-label="Circle" title="Circle">
                  <Circle className="w-4 h-4 text-gray-300" />
                </button>
                <button onClick={() => { setActiveShape('rectangle'); setShowShapePicker(false); }} className={`p-1.5 rounded ${activeShape === 'rectangle' ? 'bg-purple-600/40' : 'hover:bg-white/10'}`} aria-label="Rectangle" title="Rectangle">
                  <Square className="w-4 h-4 text-gray-300" />
                </button>
                <button onClick={() => { setActiveShape('line'); setShowShapePicker(false); }} className={`p-1.5 rounded ${activeShape === 'line' ? 'bg-purple-600/40' : 'hover:bg-white/10'}`} aria-label="Line" title="Line">
                  <Minus className="w-4 h-4 text-gray-300" />
                </button>
              </div>
            )}
          </div>

          <ToolBtn tool="text" icon={<Type className="w-4 h-4" />} label="Text" shortcut="T" />

          <div className="w-px h-6 bg-white/10 mx-1" />

          {/* Color picker */}
          <div className="relative">
            <button
              onClick={() => { setShowColorPicker(v => !v); setShowWidthPicker(false); setShowShapePicker(false); }}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Pick color"
              title="Color"
            >
              <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: activeColor }} />
            </button>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 bg-black/90 border border-white/10 rounded-lg p-2 flex gap-1.5 z-20">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { setActiveColor(c.value); setShowColorPicker(false); }}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${activeColor === c.value ? 'border-purple-400 scale-110' : 'border-white/20 hover:border-white/50'}`}
                    style={{ backgroundColor: c.value }}
                    aria-label={c.label}
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Width picker */}
          <div className="relative">
            <button
              onClick={() => { setShowWidthPicker(v => !v); setShowColorPicker(false); setShowShapePicker(false); }}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all text-xs font-mono"
              aria-label="Stroke width"
              title="Width"
            >
              {activeWidth}px
            </button>
            {showWidthPicker && (
              <div className="absolute top-full left-0 mt-1 bg-black/90 border border-white/10 rounded-lg p-1 flex gap-1 z-20">
                {WIDTHS.map(w => (
                  <button
                    key={w}
                    onClick={() => { setActiveWidth(w); setShowWidthPicker(false); }}
                    className={`px-2 py-1 rounded text-xs font-mono transition-all ${activeWidth === w ? 'bg-purple-600/40 text-purple-300' : 'text-gray-400 hover:bg-white/10'}`}
                    aria-label={`${w}px width`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-white/10 mx-1" />

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={elements.length === 0}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Clear */}
          <div className="relative">
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={elements.length === 0}
              className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Clear all"
              title="Clear all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {showClearConfirm && (
              <div className="absolute top-full right-0 mt-1 bg-black/90 border border-white/10 rounded-lg p-3 z-20 w-48">
                <p className="text-xs text-gray-300 mb-2">Clear the entire canvas?</p>
                <div className="flex gap-2">
                  <button onClick={handleClear} className="flex-1 px-2 py-1 bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded text-xs transition-all">Clear</button>
                  <button onClick={() => setShowClearConfirm(false)} className="flex-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs transition-all">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="relative border border-white/10 rounded-xl overflow-hidden">
        <canvas
          ref={canvasRef}
          height={canvasHeight}
          className="w-full touch-none cursor-crosshair"
          style={{ display: 'block' }}
          role="img"
          aria-label={block.title ? `Drawing canvas: ${block.title}` : 'Drawing canvas'}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />

        {/* Arrow label popup */}
        {arrowPopup && (
          <div
            className="absolute bg-black/90 border border-white/10 rounded-lg p-3 z-30 space-y-2 w-56"
            style={{
              left: Math.min(arrowPopup.end.x, (containerRef.current?.clientWidth ?? 300) - 240),
              top: Math.min(arrowPopup.end.y, canvasHeight - 120),
            }}
          >
            <p className="text-xs text-gray-400">Label this force</p>
            <input
              type="text"
              value={arrowLabel}
              onChange={e => setArrowLabel(e.target.value)}
              placeholder='e.g. F_g, F_N'
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-gray-600 outline-none focus:border-purple-500/50"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmArrow(); if (e.key === 'Escape') setArrowPopup(null); }}
            />
            <input
              type="text"
              value={arrowMagnitude}
              onChange={e => setArrowMagnitude(e.target.value)}
              placeholder="Magnitude (optional)"
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-gray-600 outline-none focus:border-purple-500/50"
              onKeyDown={e => { if (e.key === 'Enter') confirmArrow(); if (e.key === 'Escape') setArrowPopup(null); }}
            />
            <div className="flex gap-2">
              <button onClick={confirmArrow} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded text-xs transition-all">
                <Check className="w-3 h-3" /> Add
              </button>
              <button onClick={() => setArrowPopup(null)} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs transition-all">
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Text input popup */}
        {textPlacement && (
          <div
            className="absolute bg-black/90 border border-white/10 rounded-lg p-3 z-30 space-y-2 w-52"
            style={{
              left: Math.min(textPlacement.x, (containerRef.current?.clientWidth ?? 300) - 220),
              top: Math.min(textPlacement.y, canvasHeight - 80),
            }}
          >
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Type label..."
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-gray-600 outline-none focus:border-purple-500/50"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmText(); if (e.key === 'Escape') setTextPlacement(null); }}
            />
            <div className="flex gap-2">
              <button onClick={confirmText} className="flex-1 px-2 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded text-xs transition-all">Add</button>
              <button onClick={() => setTextPlacement(null)} className="flex-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs transition-all">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Submit / Submitted state */}
      <div className="flex items-center gap-3">
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={elements.length === 0}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all"
          >
            Submit Drawing
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-green-400">
              <Check className="w-4 h-4" />
              Submitted
            </div>
            <button
              onClick={handleEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-gray-300 text-xs rounded-lg transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default DrawingBlock;

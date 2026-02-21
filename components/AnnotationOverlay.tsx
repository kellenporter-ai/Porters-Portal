
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Pen, Eraser, Undo2, Trash2, Palette, Minus } from 'lucide-react';

interface AnnotationOverlayProps {
  /** Attach overlay to this container ref */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Called when annotations change (e.g., for potential save) */
  onAnnotationsChange?: (hasAnnotations: boolean) => void;
}

type Tool = 'pen' | 'eraser';
type StrokePoint = { x: number; y: number };
interface Stroke {
  points: StrokePoint[];
  color: string;
  width: number;
  tool: Tool;
}

const PEN_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffffff'];
const PEN_WIDTHS = [2, 4, 6, 8];

const AnnotationOverlay: React.FC<AnnotationOverlayProps> = ({ containerRef, onAnnotationsChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#ef4444');
  const [penWidth, setPenWidth] = useState(4);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);

  const strokesRef = useRef<Stroke[]>([]);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<StrokePoint[]>([]);

  // Resize canvas to match container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    redrawAll();
  }, [containerRef]);

  useEffect(() => {
    if (!isActive) return;
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isActive, resizeCanvas, containerRef]);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,0)' : stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const getCanvasPoint = useCallback((e: React.MouseEvent | React.TouchEvent): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isActive) return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    if (!point) return;
    isDrawingRef.current = true;
    currentStrokeRef.current = [point];
  }, [isActive, getCanvasPoint]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || !isActive) return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    if (!point) return;
    currentStrokeRef.current.push(point);

    // Draw current stroke in real-time
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points = currentStrokeRef.current;
    if (points.length < 2) return;

    ctx.beginPath();
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = tool === 'eraser' ? penWidth * 4 : penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const prev = points[points.length - 2];
    const curr = points[points.length - 1];
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }, [isActive, getCanvasPoint, tool, color, penWidth]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentStrokeRef.current.length > 1) {
      strokesRef.current.push({
        points: [...currentStrokeRef.current],
        color,
        width: tool === 'eraser' ? penWidth * 4 : penWidth,
        tool,
      });
      onAnnotationsChange?.(strokesRef.current.length > 0);
    }
    currentStrokeRef.current = [];
  }, [color, penWidth, tool, onAnnotationsChange]);

  const handleUndo = useCallback(() => {
    strokesRef.current.pop();
    redrawAll();
    onAnnotationsChange?.(strokesRef.current.length > 0);
  }, [redrawAll, onAnnotationsChange]);

  const handleClearAll = useCallback(() => {
    strokesRef.current = [];
    redrawAll();
    onAnnotationsChange?.(false);
  }, [redrawAll, onAnnotationsChange]);

  const toggleAnnotation = useCallback(() => {
    setIsActive(prev => !prev);
    setShowColorPicker(false);
    setShowWidthPicker(false);
  }, []);

  return (
    <>
      {/* Toggle button — always visible in HUD */}
      <button
        onClick={toggleAnnotation}
        className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border uppercase font-bold tracking-widest transition-colors cursor-pointer ${
          isActive
            ? 'text-red-300 bg-red-500/20 border-red-500/30 hover:bg-red-500/30'
            : 'text-purple-300 bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20'
        }`}
        title="Annotate"
      >
        <Pen className="w-3 h-3" />
        {isActive ? 'Clear Annotations' : 'Annotate'}
      </button>

      {/* Canvas overlay */}
      {isActive && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-30"
          style={{ cursor: tool === 'eraser' ? 'crosshair' : 'crosshair', touchAction: 'none' }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />
      )}

      {/* Annotation toolbar */}
      {isActive && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#1a1b26]/95 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl">
          {/* Pen */}
          <button
            onClick={() => setTool('pen')}
            className={`p-2 rounded-lg transition ${tool === 'pen' ? 'bg-purple-600/40 text-purple-300' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
            title="Pen"
          >
            <Pen className="w-4 h-4" />
          </button>

          {/* Eraser */}
          <button
            onClick={() => setTool('eraser')}
            className={`p-2 rounded-lg transition ${tool === 'eraser' ? 'bg-purple-600/40 text-purple-300' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
            title="Eraser"
          >
            <Eraser className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-white/10" />

          {/* Color picker */}
          <div className="relative">
            <button
              onClick={() => { setShowColorPicker(!showColorPicker); setShowWidthPicker(false); }}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition"
              title="Color"
            >
              <Palette className="w-4 h-4" />
              <div className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            </button>
            {showColorPicker && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex gap-1.5 bg-[#1a1b26] border border-white/10 rounded-lg p-2 shadow-lg">
                {PEN_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => { setColor(c); setShowColorPicker(false); }}
                    className={`w-6 h-6 rounded-full border-2 transition ${color === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Width picker */}
          <div className="relative">
            <button
              onClick={() => { setShowWidthPicker(!showWidthPicker); setShowColorPicker(false); }}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition"
              title="Line width"
            >
              <Minus className="w-4 h-4" />
            </button>
            {showWidthPicker && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex gap-2 bg-[#1a1b26] border border-white/10 rounded-lg p-2 shadow-lg">
                {PEN_WIDTHS.map(w => (
                  <button
                    key={w}
                    onClick={() => { setPenWidth(w); setShowWidthPicker(false); }}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg transition ${penWidth === w ? 'bg-purple-600/30 border border-purple-500/30' : 'hover:bg-white/5'}`}
                  >
                    <div className="rounded-full bg-white" style={{ width: w * 2, height: w * 2 }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-white/10" />

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={strokesRef.current.length === 0}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-30 transition"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Clear all */}
          <button
            onClick={handleClearAll}
            disabled={strokesRef.current.length === 0}
            className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition"
            title="Clear all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};

export default AnnotationOverlay;

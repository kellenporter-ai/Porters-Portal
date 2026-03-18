
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Maximize2, Minimize2, TrendingUp, MessageSquare, GripHorizontal } from 'lucide-react';

interface PhysicsToolsProps {
    onToggleChat?: () => void;
    hasUnreadChat?: boolean;
}

type ToolType = 'GRAPHER';

const TOOL_CONFIG: Record<ToolType, { src: string; label: string; icon: React.ReactNode; color: string; hoverBg: string; iconBg: string; iconText: string }> = {
    GRAPHER: {
        src: '/tools/grapher.html',
        label: 'AP Physics Grapher Pro',
        icon: <TrendingUp className="w-4 h-4" />,
        color: 'purple',
        hoverBg: 'hover:bg-purple-600',
        iconBg: 'bg-purple-600/20',
        iconText: 'text-purple-400',
    },
};

/* ── Drag constants ────────────────────────────────────────── */
const POS_KEY = 'portersPortal_toolBtnPos';
const DRAG_THRESHOLD = 5;

const PhysicsTools: React.FC<PhysicsToolsProps> = ({ onToggleChat, hasUnreadChat }) => {
    const [activeTool, setActiveTool] = useState<ToolType | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);

    /* ── Draggable position (null = default bottom-right) ──── */
    const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
        try {
            const s = localStorage.getItem(POS_KEY);
            if (s) {
                const p = JSON.parse(s);
                if (typeof p?.x === 'number' && typeof p?.y === 'number') {
                    return {
                        x: Math.max(0, Math.min(window.innerWidth - 60, p.x)),
                        y: Math.max(0, Math.min(window.innerHeight - 60, p.y)),
                    };
                }
            }
        } catch { /* ignore corrupt data */ }
        return null;
    });
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{
        sx: number; sy: number;   // pointer start
        px: number; py: number;   // element start
        moved: boolean;
        pointerId: number;
    } | null>(null);
    const skipClick = useRef(false);

    // Persist position to localStorage
    useEffect(() => {
        if (position) localStorage.setItem(POS_KEY, JSON.stringify(position));
    }, [position]);

    // Clamp to viewport on window resize
    useEffect(() => {
        const onResize = () => {
            setPosition(p => {
                if (!p) return p;
                return {
                    x: Math.max(0, Math.min(window.innerWidth - 60, p.x)),
                    y: Math.max(0, Math.min(window.innerHeight - 60, p.y)),
                };
            });
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    /* ── Pointer event handlers ────────────────────────────── */
    const onPtrDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragRef.current = {
            sx: e.clientX, sy: e.clientY,
            px: position?.x ?? rect.left,
            py: position?.y ?? rect.top,
            moved: false,
            pointerId: e.pointerId,
        };
    }, [position]);

    const onPtrMove = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (!d.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            d.moved = true;
            setIsDragging(true);
            containerRef.current?.setPointerCapture(d.pointerId);
        }
        if (d.moved) {
            const el = containerRef.current;
            const w = el?.offsetWidth ?? 48, h = el?.offsetHeight ?? 200;
            setPosition({
                x: Math.max(0, Math.min(window.innerWidth - w, d.px + dx)),
                y: Math.max(0, Math.min(window.innerHeight - h, d.py + dy)),
            });
        }
    }, []);

    const onPtrUp = useCallback(() => {
        skipClick.current = dragRef.current?.moved ?? false;
        dragRef.current = null;
        setIsDragging(false);
    }, []);

    const onPtrCancel = useCallback(() => {
        dragRef.current = null;
        setIsDragging(false);
    }, []);

    /** Wraps onClick handlers to swallow clicks that followed a drag */
    const guard = (fn: () => void) => () => {
        if (skipClick.current) { skipClick.current = false; return; }
        fn();
    };

    /** Double-click the grip to snap back to default bottom-right */
    const resetPosition = () => {
        setPosition(null);
        localStorage.removeItem(POS_KEY);
    };

    const toggleTool = (tool: ToolType) => {
        if (activeTool === tool) {
            setActiveTool(null);
        } else {
            setActiveTool(tool);
            setIsMinimized(false);
        }
    };

    /* ── Render: floating buttons (no active tool) ─────────── */
    if (!activeTool) {
        const style: React.CSSProperties = position
            ? { left: position.x, top: position.y }
            : { right: 24, bottom: 24 };

        const btnBase = (hoverClasses: string) =>
            `bg-[var(--surface-glass-heavy)] ${isDragging ? '' : hoverClasses} text-[var(--text-primary)] p-3 rounded-full shadow-lg backdrop-blur-md border border-[var(--border-strong)] transition-all group relative ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`;

        return (
            <div
                ref={containerRef}
                className={`fixed z-50 flex flex-col gap-3 items-end select-none touch-none group/toolbar ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={style}
                onPointerDown={onPtrDown}
                onPointerMove={onPtrMove}
                onPointerUp={onPtrUp}
                onPointerCancel={onPtrCancel}
            >
                {/* Drag grip — visible on hover, double-click to reset */}
                <div
                    className={`flex justify-center w-full opacity-0 group-hover/toolbar:opacity-100 transition-opacity duration-200 -mb-1 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onDoubleClick={resetPosition}
                    title="Drag to move · Double-click to reset"
                >
                    <GripHorizontal className="w-5 h-3 text-[var(--text-tertiary)]" />
                </div>

                <button
                    onClick={guard(() => toggleTool('GRAPHER'))}
                    className={btnBase('hover:bg-purple-600 hover:scale-110')}
                    title="Physics Grapher"
                >
                    <TrendingUp className="w-6 h-6" />
                    {!isDragging && (
                        <span className="absolute right-full mr-2 bg-[var(--panel-bg)] px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
                            Grapher Pro
                        </span>
                    )}
                </button>

                {onToggleChat && (
                    <button
                        onClick={guard(onToggleChat)}
                        className={btnBase('hover:bg-[#5865F2] hover:scale-110')}
                        title="Class Chat"
                    >
                        <MessageSquare className="w-6 h-6" />
                        {hasUnreadChat && (
                            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-[#0f0720] animate-pulse" />
                        )}
                        {!isDragging && (
                            <span className="absolute right-full mr-2 bg-[var(--panel-bg)] px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
                                Class Comms
                            </span>
                        )}
                    </button>
                )}
            </div>
        );
    }

    /* ── Render: active tool window ────────────────────────── */
    const config = TOOL_CONFIG[activeTool];

    return (
        <div className={`fixed z-50 bg-[var(--surface-raised)] border border-[var(--border-strong)] shadow-2xl transition-all duration-300 overflow-hidden flex flex-col ${isMinimized ? 'w-64 h-12 bottom-6 right-6 rounded-xl' : 'inset-4 md:inset-10 rounded-2xl'}`}>
            <div className="bg-[var(--surface-raised)] p-3 flex justify-between items-center border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${config.iconBg} ${config.iconText}`}>
                        {config.icon}
                    </div>
                    <span className="font-bold text-[var(--text-primary)] text-sm">{config.label}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsMinimized(!isMinimized)} className="p-1.5 hover:bg-[var(--surface-glass-heavy)] rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition">
                        {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setActiveTool(null)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-[var(--text-tertiary)] hover:text-red-400 transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <div className="flex-1 bg-white relative">
                    <iframe
                        src={config.src}
                        className="w-full h-full border-none"
                        title={config.label}
                        sandbox="allow-scripts allow-same-origin allow-modals allow-downloads allow-forms"
                    />
                </div>
            )}
        </div>
    );
};

export default PhysicsTools;

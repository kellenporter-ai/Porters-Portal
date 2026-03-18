
import React, { useState, useEffect } from 'react';
import { X, Maximize2, Minimize2, TrendingUp } from 'lucide-react';

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

const PhysicsTools: React.FC<PhysicsToolsProps> = () => {
    const [activeTool, setActiveTool] = useState<ToolType | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);

    // Listen for sidebar Grapher shortcut
    useEffect(() => {
        const handler = () => {
            setActiveTool('GRAPHER');
            setIsMinimized(false);
        };
        window.addEventListener('porters:openGrapher', handler);
        return () => window.removeEventListener('porters:openGrapher', handler);
    }, []);

    /* ── No active tool: render nothing (toolbar moved to sidebar) ── */
    if (!activeTool) return null;

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


import React, { useState } from 'react';
import { X, PenTool, Maximize2, Minimize2, BarChart2, TrendingUp, MessageSquare } from 'lucide-react';

interface PhysicsToolsProps {
    onToggleChat?: () => void;
}

type ToolType = 'FORCE' | 'BAR' | 'GRAPHER';

const TOOL_CONFIG: Record<ToolType, { src: string; label: string; icon: React.ReactNode; color: string; hoverBg: string; iconBg: string; iconText: string }> = {
    FORCE: {
        src: '/tools/force-diagram.html',
        label: 'Free Body Diagram Builder',
        icon: <PenTool className="w-4 h-4" />,
        color: 'green',
        hoverBg: 'hover:bg-green-600',
        iconBg: 'bg-green-600/20',
        iconText: 'text-green-400',
    },
    BAR: {
        src: '/tools/bar-chart.html',
        label: 'Conservation of Energy (LOL) Chart',
        icon: <BarChart2 className="w-4 h-4" />,
        color: 'blue',
        hoverBg: 'hover:bg-blue-600',
        iconBg: 'bg-blue-600/20',
        iconText: 'text-blue-400',
    },
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

const PhysicsTools: React.FC<PhysicsToolsProps> = ({ onToggleChat }) => {
    const [activeTool, setActiveTool] = useState<ToolType | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);

    const toggleTool = (tool: ToolType) => {
        if (activeTool === tool) {
            setActiveTool(null);
        } else {
            setActiveTool(tool);
            setIsMinimized(false);
        }
    };

    if (!activeTool) {
        return (
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end">
                <button 
                    onClick={() => toggleTool('GRAPHER')}
                    className="bg-white/10 hover:bg-purple-600 text-white p-3 rounded-full shadow-lg backdrop-blur-md border border-white/20 transition-all hover:scale-110 group relative"
                    title="Physics Grapher"
                >
                    <TrendingUp className="w-6 h-6" />
                    <span className="absolute right-full mr-2 bg-black/80 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">Grapher Pro</span>
                </button>
                <button 
                    onClick={() => toggleTool('BAR')}
                    className="bg-white/10 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg backdrop-blur-md border border-white/20 transition-all hover:scale-110 group relative"
                    title="LOL Diagrams"
                >
                    <BarChart2 className="w-6 h-6" />
                    <span className="absolute right-full mr-2 bg-black/80 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">LOL Charts</span>
                </button>
                <button 
                    onClick={() => toggleTool('FORCE')}
                    className="bg-white/10 hover:bg-green-600 text-white p-3 rounded-full shadow-lg backdrop-blur-md border border-white/20 transition-all hover:scale-110 group relative"
                    title="Force Diagrams"
                >
                    <PenTool className="w-6 h-6" />
                    <span className="absolute right-full mr-2 bg-black/80 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">Force Diagram</span>
                </button>
                {onToggleChat && (
                    <button 
                        onClick={onToggleChat}
                        className="bg-white/10 hover:bg-[#5865F2] text-white p-3 rounded-full shadow-lg backdrop-blur-md border border-white/20 transition-all hover:scale-110 group relative"
                        title="Class Chat"
                    >
                        <MessageSquare className="w-6 h-6" />
                        <span className="absolute right-full mr-2 bg-black/80 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">Class Comms</span>
                    </button>
                )}
            </div>
        );
    }

    const config = TOOL_CONFIG[activeTool];

    return (
        <div className={`fixed z-50 bg-[#1e1e1e] border border-white/20 shadow-2xl transition-all duration-300 overflow-hidden flex flex-col ${isMinimized ? 'w-64 h-12 bottom-6 right-6 rounded-xl' : 'inset-4 md:inset-10 rounded-2xl'}`}>
            <div className="bg-[#2d2d2d] p-3 flex justify-between items-center border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${config.iconBg} ${config.iconText}`}>
                        {config.icon}
                    </div>
                    <span className="font-bold text-white text-sm">{config.label}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsMinimized(!isMinimized)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition">
                        {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setActiveTool(null)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition">
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

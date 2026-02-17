import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Assignment, TelemetryMetrics } from '../types';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, BookOpen, Clock, PlayCircle, AlertTriangle } from 'lucide-react';
import { createInitialMetrics } from '../lib/telemetry';
import katex from 'katex';

interface StudyMaterialProps {
    assignment: Assignment;
    onComplete: (metrics: TelemetryMetrics) => void;
}

interface ReadingSection { title: string; content: string; }
interface ReadingMaterial { title: string; description?: string; sections: ReadingSection[]; estimatedMinutes?: number; }

/**
 * Renders study material text with math formatting, bullets, and paragraphs.
 * Handles: $...$ LaTeX, garbled AI math, bullets, bold, paragraphs.
 */
function renderContent(raw: string): string {
    let text = raw;

    // Step 1: Clean garbled AI duplicates — patterns like "W=Fd W=Fd" or "K K" 
    // Strip duplicate variable definitions: "Ug U g ​" → "Ug"
    text = text.replace(/([A-Z][a-z]?)\s+\1(?:\s+[a-z])?\s*​*/g, '$1');
    
    // Strip zero-width chars and invisible Unicode
    text = text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');

    // Step 2: Handle explicit LaTeX $...$ and $$...$$ delimiters
    text = text.replace(/\$\$([^$]+)\$\$/g, (_m, tex) => {
        try {
            return `<div class="my-3 text-center">${katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true })}</div>`;
        } catch { return `<code class="math-block">${tex}</code>`; }
    });
    text = text.replace(/\$([^$]+)\$/g, (_m, tex) => {
        try {
            return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: false });
        } catch { return `<code class="math-inline">${tex}</code>`; }
    });

    // Step 3: Style remaining equation-like text as highlighted code
    // Match patterns like: W=Fdcostheta, K=frac12mv2, Ug=mgy, P=Fv, etc.
    text = text.replace(
        /(?<![a-z])([A-Z][a-z]*(?:_?\{?[a-z]*\}?)?)\s*=\s*([-−]?(?:frac|sqrt|Delta|\\)?[\w\d{}()^_/\\.,×·±≠≤≥∞]+(?:\s*[+\-−*/×·]\s*[-−]?(?:frac|sqrt|Delta|\\)?[\w\d{}()^_/\\.,×·±≠≤≥∞]+)*)(?![a-zA-Z])/g,
        (_m, lhs, rhs) => `<code class="math-inline">${lhs} = ${rhs}</code>`
    );

    // Step 4: Paragraph breaks
    text = text.replace(/\\n\\n|\n\n/g, '</p><p class="mt-3">');

    // Step 5: Bullet points
    text = text.replace(/(?:^|\n)\*\s+(.+)/g, '<li class="ml-4 list-disc">$1</li>');
    text = text.replace(/(?:^|\n)-\s+(.+)/g, '<li class="ml-4 list-disc">$1</li>');
    text = text.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="my-2 space-y-1">$1</ul>');

    // Step 6: Numbered lists (1. 2. 3.)
    text = text.replace(/(?:^|\n)(\d+)\.\s+(.+)/g, '<li class="ml-4" value="$1">$2</li>');

    // Step 7: Line breaks
    text = text.replace(/\\n|\n/g, '<br/>');

    // Step 8: Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');

    return `<p>${text}</p>`;
}

const StudyMaterial: React.FC<StudyMaterialProps> = ({ assignment, onComplete }) => {
    const [material, setMaterial] = useState<ReadingMaterial | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmpty, setIsEmpty] = useState(false);

    // Engagement tracking
    const metricsRef = useRef<TelemetryMetrics>(createInitialMetrics());
    const lastInteractionRef = useRef<number>(Date.now());
    const onCompleteRef = useRef(onComplete);
    const [isActive, setIsActive] = useState(true);
    const [displayTime, setDisplayTime] = useState(0);

    useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

    const handleInteraction = useCallback(() => {
        lastInteractionRef.current = Date.now();
        if (!isActive) setIsActive(true);
    }, [isActive]);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            if (now - lastInteractionRef.current < 60000) {
                metricsRef.current.engagementTime += 1;
                setDisplayTime(metricsRef.current.engagementTime);
                if (!isActive) setIsActive(true);
            } else {
                if (isActive) setIsActive(false);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isActive]);

    useEffect(() => {
        const events = ['mousemove', 'keydown', 'scroll', 'click'];
        events.forEach(ev => window.addEventListener(ev, handleInteraction));
        return () => { events.forEach(ev => window.removeEventListener(ev, handleInteraction)); };
    }, [handleInteraction]);

    useEffect(() => {
        return () => { onCompleteRef.current(metricsRef.current); };
    }, []);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const snap = await getDoc(doc(db, 'reading_materials', assignment.id));
                if (snap.exists()) {
                    setMaterial(snap.data() as ReadingMaterial);
                } else {
                    setIsEmpty(true);
                }
            } catch (err) {
                console.error('Failed to load reading material:', err);
                setIsEmpty(true);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [assignment.id]);

    // Pre-render all section content
    const renderedSections = useMemo(() => {
        if (!material) return [];
        return material.sections.map(s => ({
            title: s.title,
            html: renderContent(s.content),
        }));
    }, [material]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                <p className="text-gray-400 text-sm">Loading study material...</p>
            </div>
        );
    }

    if (isEmpty || !material) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <BookOpen className="w-12 h-12 text-gray-600" />
                <p className="text-gray-400 font-bold">No Study Material Available</p>
                <p className="text-gray-600 text-sm text-center max-w-sm">
                    Your teacher hasn&apos;t uploaded reading material for this resource yet.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-black/20 border border-white/10 rounded-2xl overflow-hidden relative">
            {/* HUD */}
            <div className="bg-black/40 backdrop-blur-md px-4 py-2 flex justify-between items-center border-b border-white/5 z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 text-sm font-bold ${isActive ? 'text-green-400' : 'text-yellow-500'}`}>
                        {isActive ? <PlayCircle className="w-4 h-4" /> : <Clock className="w-4 h-4 animate-pulse" />}
                        {isActive ? 'Reading Active' : 'Away (Paused)'}
                    </div>
                    <div className="text-xs text-gray-400 font-mono bg-black/40 px-2 py-1 rounded">
                        TIME: {Math.floor(displayTime / 60)}m {displayTime % 60}s
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {material.estimatedMinutes && (
                        <span className="text-[10px] text-gray-500 font-mono">~{material.estimatedMinutes} min read</span>
                    )}
                    {!isActive && (
                        <div className="flex items-center gap-2 text-[10px] text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full border border-yellow-500/20 uppercase font-bold tracking-widest">
                            <AlertTriangle className="w-3 h-3" /> Scroll to earn XP
                        </div>
                    )}
                </div>
            </div>

            {/* Reading Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar" onScroll={handleInteraction}>
                <div className="max-w-3xl mx-auto px-6 py-8">
                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-white mb-2">{material.title}</h1>
                        {material.description && (
                            <p className="text-sm text-gray-400 leading-relaxed">{material.description}</p>
                        )}
                    </div>

                    <div className="space-y-10">
                        {renderedSections.map((section, idx) => (
                            <div key={idx} className="group">
                                <h2 className="text-lg font-bold text-purple-300 mb-4 flex items-center gap-3">
                                    <span className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                                    {section.title}
                                </h2>
                                <div
                                    className="study-content text-sm text-gray-300 leading-relaxed pl-10"
                                    dangerouslySetInnerHTML={{ __html: section.html }}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 mb-4 text-center">
                        <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 text-xs font-bold px-4 py-2 rounded-full border border-emerald-500/20">
                            <BookOpen className="w-3.5 h-3.5" />
                            Keep reading to earn engagement XP
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudyMaterial;

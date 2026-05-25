import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Assignment, TelemetryMetrics } from '../types';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, BookOpen, Clock, PlayCircle, AlertTriangle } from 'lucide-react';
import { createInitialMetrics } from '../lib/telemetry';
import { renderReadingContent } from '../lib/renderReadingContent';
import { reportError } from '../lib/errorReporting';

interface StudyMaterialProps {
    assignment: Assignment;
    onComplete?: (metrics: TelemetryMetrics) => void;
    /** When true, skips engagement tracking and renders content only. */
    readOnly?: boolean;
}

interface ReadingSection { title: string; content: string; }
interface ReadingMaterial {
    title: string;
    description?: string;
    sections?: ReadingSection[];
    estimatedMinutes?: number;
    htmlContent?: string;
    storageUrl?: string;
    storagePath?: string;
}



const StudyMaterial: React.FC<StudyMaterialProps> = ({ assignment, onComplete, readOnly = false }) => {
    const [material, setMaterial] = useState<ReadingMaterial | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmpty, setIsEmpty] = useState(false);

    // Engagement tracking (skipped in readOnly mode)
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
        if (readOnly) return;
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
    }, [isActive, readOnly]);

    useEffect(() => {
        if (readOnly) return;
        const events = ['mousemove', 'keydown', 'scroll', 'click'];
        events.forEach(ev => window.addEventListener(ev, handleInteraction));
        return () => { events.forEach(ev => window.removeEventListener(ev, handleInteraction)); };
    }, [handleInteraction, readOnly]);

    useEffect(() => {
        if (readOnly) return;
        return () => { onCompleteRef.current?.(metricsRef.current); };
    }, [readOnly]);

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
                reportError(err, { component: 'StudyMaterial' });
                setIsEmpty(true);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [assignment.id]);

    // Pre-render all section content
    const renderedSections = useMemo(() => {
        if (!material || material.htmlContent) return [];
        return (material.sections || []).map(s => ({
            title: s.title,
            html: renderReadingContent(s.content),
        }));
    }, [material]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 className="w-8 h-8 text-purple-600 dark:text-purple-400 animate-spin" />
                <p className="text-[var(--text-tertiary)] text-sm">Loading study material...</p>
            </div>
        );
    }

    if (isEmpty || !material) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <BookOpen className="w-12 h-12 text-[var(--text-muted)]" />
                <p className="text-[var(--text-tertiary)] font-bold">No Study Material Available</p>
                <p className="text-[var(--text-muted)] text-sm text-center max-w-sm">
                    Your teacher hasn&apos;t uploaded reading material for this resource yet.
                </p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-full overflow-hidden relative ${readOnly ? '' : 'bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl'}`}>
            {/* HUD — hidden in readOnly mode */}
            {!readOnly && (
                <div className="bg-[var(--panel-bg)] backdrop-blur-md px-4 py-2 flex justify-between items-center border-b border-[var(--border)] z-20 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 text-sm font-bold ${isActive ? 'text-green-600 dark:text-green-400' : 'text-yellow-500'}`}>
                            {isActive ? <PlayCircle className="w-4 h-4" /> : <Clock className="w-4 h-4 animate-pulse" />}
                            {isActive ? 'Reading Active' : 'Away (Paused)'}
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)] font-mono bg-[var(--panel-bg)] px-2 py-1 rounded">
                            TIME: {Math.floor(displayTime / 60)}m {displayTime % 60}s
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {material.estimatedMinutes && (
                            <span className="text-[11.5px] text-[var(--text-muted)] font-mono">~{material.estimatedMinutes} min read</span>
                        )}
                        {!isActive && (
                            <div className="flex items-center gap-2 text-[11.5px] text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full border border-yellow-500/20 uppercase font-bold tracking-widest">
                                <AlertTriangle className="w-3 h-3" /> Scroll to earn XP
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Reading Content */}
            {material.htmlContent || material.storageUrl ? (
                <div className="flex-1 overflow-hidden bg-white">
                    <iframe
                        src={material.storageUrl || URL.createObjectURL(new Blob([material.htmlContent!], { type: 'text/html' }))}
                        className="w-full h-full border-none"
                        title="Study Material"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar" onScroll={readOnly ? undefined : handleInteraction}>
                    <div className="max-w-3xl mx-auto px-6 py-8">
                        <div className="mb-8">
                            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">{material.title}</h1>
                            {material.description && (
                                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">{material.description}</p>
                            )}
                        </div>

                        <div className="space-y-10">
                            {renderedSections.map((section, idx) => (
                                <div key={idx} className="group">
                                    <h2 className="text-lg font-bold text-purple-300 mb-4 flex items-center gap-3">
                                        <span className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                                        {section.title}
                                    </h2>
                                    <div
                                        className="study-content text-sm text-[var(--text-secondary)] leading-relaxed pl-10"
                                        dangerouslySetInnerHTML={{ __html: section.html }}
                                    />
                                </div>
                            ))}
                        </div>

                        {!readOnly && (
                            <div className="mt-12 mb-4 text-center">
                                <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-4 py-2 rounded-full border border-emerald-500/20">
                                    <BookOpen className="w-3.5 h-3.5" />
                                    Keep reading to earn engagement XP
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudyMaterial;

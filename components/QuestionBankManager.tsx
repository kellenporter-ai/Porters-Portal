import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Assignment } from '../types';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Upload, Copy, CheckCircle2, Loader2, FileJson, AlertTriangle, Trash2, Database, ChevronRight, Search, Plus, XCircle, Zap, BookOpen } from 'lucide-react';
import { useToast } from './ToastProvider';
import Modal from './Modal';

interface ReadingSection { title: string; content: string; }
interface ReadingMaterial { title: string; description?: string; sections: ReadingSection[]; estimatedMinutes?: number; }

interface QuestionBankManagerProps {
    assignment: Assignment;
    isOpen: boolean;
    onClose: () => void;
}

interface BankQuestion {
    id: string; tier: number; xp: number; type: string;
    bloomsLevel: string; stem: string; context?: string | null;
    options: { id: string; text: string }[];
    correctAnswer: string | string[]; explanation: string;
    linkedFollowUp?: any;
}

const TIER_COLORS: Record<number, { text: string; bg: string; border: string }> = {
    1: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    2: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    3: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
};

const TYPE_LABELS: Record<string, string> = {
    multiple_choice: 'MC', multiple_select: 'Multi-Select', ranking: 'Ranking',
    qualitative_reasoning: 'Qualitative', linked_mc: 'Linked MC', troubleshooting: 'Troubleshoot',
    conflicting_contentions: 'Conflicting', whats_wrong: "What's Wrong", working_backwards: 'Backwards',
};

const PROMPT_TEMPLATE = (title: string, classType: string, description: string) => `You are an expert educational assessment designer. I need you to generate a question bank of 150 questions for the following resource. I will attach the resource content below this prompt.

RESOURCE: ${title}
CLASS: ${classType}
${description ? `DESCRIPTION: ${description}` : ""}

Generate questions organized into 3 Bloom's Taxonomy tiers. Use a MIXTURE of the following question formats across all tiers:

QUESTION FORMATS:
1. Multiple Choice — 4 options, 1 correct
2. Multiple Select — 4 options, 2-3 correct
3. Ranking Task — 4 items to order correctly
4. Conflicting Contentions — Two students disagree, who is correct and why
5. Linked Multiple Choice — Two connected questions where part B depends on part A
6. Qualitative Reasoning — Conceptual MC requiring deep understanding
7. Troubleshooting Task — Identify the error in a scenario
8. What's Wrong Task — Find the flaw in given reasoning/solution
9. Working Backwards Task — Given the answer, determine what produced it

TIER DISTRIBUTION (50 questions each):
- TIER 1 (Remember & Understand) — 50 questions, +10 XP each
- TIER 2 (Apply & Analyze) — 50 questions, +25 XP each  
- TIER 3 (Evaluate & Create) — 50 questions, +50 XP each

OUTPUT FORMAT — Respond with ONLY a valid JSON array. Each question object:
{
  "id": "t1q001" (tier + question number),
  "tier": 1, 2, or 3,
  "xp": 10, 25, or 50 (matching tier),
  "type": "multiple_choice" | "multiple_select" | "ranking" | "qualitative_reasoning" | "linked_mc" | "troubleshooting" | "conflicting_contentions" | "whats_wrong" | "working_backwards",
  "bloomsLevel": "Remember" | "Understand" | "Apply" | "Analyze" | "Evaluate" | "Create",
  "stem": "The question text",
  "context": "Optional scenario/context text" or null,
  "options": [{"id": "a", "text": "..."}, {"id": "b", "text": "..."}, {"id": "c", "text": "..."}, {"id": "d", "text": "..."}],
  "correctAnswer": "b" (for MC) OR ["a","c"] (for multiple_select) OR ["c","a","d","b"] (for ranking, in correct order),
  "explanation": "Why this is the correct answer",
  "linkedFollowUp": null OR (only for linked_mc) {"stem": "...", "options": [...], "correctAnswer": "...", "explanation": "..."}
}

IMPORTANT:
- All questions MUST be specific to the resource content I attached
- Distractors must be plausible and educational
- Vary question formats within each tier (use all 9 types)
- Output ONLY the JSON array — no markdown fences, no commentary
- Generate exactly 150 questions (50 per tier) if possible
- If you hit your output limit, end the JSON array cleanly with ] so I can parse what you generated.`;

const READING_PROMPT_TEMPLATE = (title: string, classType: string, description: string) => `You are an expert educational content creator. I need you to create comprehensive study material for students who are working through a practice set. This reading material should teach the underlying concepts so students understand the material before or while working on practice problems. I will attach the practice set content below this prompt.

PRACTICE SET: ${title}
CLASS: ${classType}
${description ? `DESCRIPTION: ${description}` : ""}

Create detailed reading material that covers all the concepts, formulas, principles, and background knowledge a student needs to succeed on this practice set.

OUTPUT FORMAT — Respond with ONLY a valid JSON object:
{
  "title": "Study Guide: ${title}",
  "description": "A brief 1-2 sentence overview of what this reading covers",
  "estimatedMinutes": 15,
  "sections": [
    {
      "title": "Section title",
      "content": "Detailed explanation text. Use clear language appropriate for the class level. Include definitions, examples, step-by-step explanations, key formulas, common misconceptions, and practical applications. Make it thorough but readable."
    }
  ]
}

GUIDELINES:
- Create 8-15 sections that logically progress through the material
- Each section should be 150-400 words — substantial enough to actually teach the concept
- Include worked examples where applicable
- Define key vocabulary and terminology
- Address common student misconceptions
- Use clear, direct language appropriate for the class level
- The total reading should take approximately 10-20 minutes
- CRITICAL: For ALL math expressions, you MUST use LaTeX notation wrapped in dollar signs. Examples: $W = Fd\\cos\\theta$, $K = \\frac{1}{2}mv^2$, $U_g = mgy$
- Use double dollar signs for display equations on their own line: $$E_i + W_{ext} = E_f$$
- NEVER write bare math like "K=frac12mv2" or "W=Fdcostheta" — always wrap in $...$
- Every variable, formula, and equation must be in LaTeX dollar-sign delimiters
- Use bullet points (* at line start) for lists
- Use **bold** for key terms on first introduction
- Output ONLY the JSON object — no markdown fences, no commentary`;

type Tab = 'manage' | 'add' | 'reading';

const QuestionBankManager: React.FC<QuestionBankManagerProps> = ({ assignment, isOpen, onClose }) => {
    const toast = useToast();
    const fileRef = useRef<HTMLInputElement>(null);

    // Bank state
    const [questions, setQuestions] = useState<BankQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // UI state
    const [tab, setTab] = useState<Tab>(assignment.category === 'Practice Set' ? 'reading' : 'manage');
    const [filterTier, setFilterTier] = useState<number | null>(null);
    const [filterType, setFilterType] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Upload state
    const [pendingQuestions, setPendingQuestions] = useState<BankQuestion[] | null>(null);
    const [pendingTiers, setPendingTiers] = useState<Record<number, number>>({});
    const [parseError, setParseError] = useState<string | null>(null);
    const [appendMode, setAppendMode] = useState(true);

    // Reading material state
    const [readingMaterial, setReadingMaterial] = useState<ReadingMaterial | null>(null);
    const [pendingReading, setPendingReading] = useState<ReadingMaterial | null>(null);
    const [readingParseError, setReadingParseError] = useState<string | null>(null);
    const [copiedReading, setCopiedReading] = useState(false);
    const readingFileRef = useRef<HTMLInputElement>(null);
    const isPracticeSet = assignment.category === 'Practice Set';

    // Load existing bank and reading material
    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            setIsLoading(true);
            try {
                const snap = await getDoc(doc(db, 'question_banks', assignment.id));
                if (snap.exists()) {
                    setQuestions(snap.data().questions || []);
                } else {
                    setQuestions([]);
                }
                // Load reading material
                const readSnap = await getDoc(doc(db, 'reading_materials', assignment.id));
                if (readSnap.exists()) {
                    setReadingMaterial(readSnap.data() as ReadingMaterial);
                } else {
                    setReadingMaterial(null);
                }
            } catch (err) {
                console.error('Failed to load bank:', err);
                setQuestions([]);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [isOpen, assignment.id]);

    // Save bank to Firestore
    const saveBank = async (updated: BankQuestion[]) => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'question_banks', assignment.id), {
                assignmentId: assignment.id,
                title: assignment.title,
                classType: assignment.classType,
                questions: updated,
                questionCount: updated.length,
                updatedAt: new Date().toISOString(),
            });
            setQuestions(updated);
        } catch (err: any) {
            toast.error('Failed to save: ' + (err.message || 'Unknown error'));
        } finally {
            setIsSaving(false);
        }
    };

    // Delete single question
    const handleDelete = async (qId: string) => {
        const updated = questions.filter(q => q.id !== qId);
        await saveBank(updated);
        toast.success('Question removed.');
        if (expandedId === qId) setExpandedId(null);
    };

    // Clear entire bank
    const handleClearAll = async () => {
        try {
            await deleteDoc(doc(db, 'question_banks', assignment.id));
            setQuestions([]);
            toast.success('Question bank cleared.');
        } catch (err: any) {
            toast.error('Failed to clear bank.');
        }
    };

    // Copy prompt
    const handleCopyPrompt = () => {
        navigator.clipboard.writeText(PROMPT_TEMPLATE(assignment.title, assignment.classType, assignment.description));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Prompt copied!');
    };

    // Copy reading prompt
    const handleCopyReadingPrompt = () => {
        navigator.clipboard.writeText(READING_PROMPT_TEMPLATE(assignment.title, assignment.classType, assignment.description));
        setCopiedReading(true);
        setTimeout(() => setCopiedReading(false), 2000);
        toast.success('Reading prompt copied!');
    };

    // Reading material file parse
    const handleReadingFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setReadingParseError(null);
        setPendingReading(null);
        try {
            const text = await file.text();
            // Strip markdown fences and sanitize control chars inside JSON strings
            let cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
            // Fix literal newlines/tabs inside JSON string values (common AI output issue)
            cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (ch) => {
                if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
                return '';
            });
            let parsed;
            try { parsed = JSON.parse(cleaned); } catch {
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) parsed = JSON.parse(match[0]);
                else throw new Error('No JSON object found.');
            }
            if (!parsed.title || !parsed.sections || !Array.isArray(parsed.sections)) {
                throw new Error('Missing required fields: title and sections array.');
            }
            const invalidSections = parsed.sections.filter((s: any) => !s.title || !s.content);
            if (invalidSections.length > 0) {
                throw new Error(`${invalidSections.length} section(s) missing title or content.`);
            }
            setPendingReading(parsed as ReadingMaterial);
        } catch (err: any) {
            setReadingParseError(err.message || 'Parse failed.');
        }
        if (readingFileRef.current) readingFileRef.current.value = '';
    };

    // Upload reading material
    const handleUploadReading = async () => {
        if (!pendingReading) return;
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'reading_materials', assignment.id), {
                ...pendingReading,
                assignmentId: assignment.id,
                updatedAt: new Date().toISOString(),
            });
            setReadingMaterial(pendingReading);
            setPendingReading(null);
            toast.success(`Study material uploaded: ${pendingReading.sections.length} sections!`);
        } catch (err: any) {
            toast.error('Failed to save: ' + (err.message || 'Unknown error'));
        } finally {
            setIsSaving(false);
        }
    };

    // Delete reading material
    const handleDeleteReading = async () => {
        setIsSaving(true);
        try {
            await deleteDoc(doc(db, 'reading_materials', assignment.id));
            setReadingMaterial(null);
            toast.success('Study material removed.');
        } catch (err: any) {
            toast.error('Failed to delete.');
        } finally {
            setIsSaving(false);
        }
    };

    // File parse
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParseError(null);
        setPendingQuestions(null);
        try {
            const text = await file.text();
            // Strip markdown fences and sanitize control chars inside JSON strings
            let cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
            cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (ch) => {
                if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
                return '';
            });
            let parsed;
            try { parsed = JSON.parse(cleaned); } catch {
                // Try to find array within the text
                const match = cleaned.match(/\[[\s\S]*\]/);
                if (match) {
                    try { parsed = JSON.parse(match[0]); } catch {
                        // Handle truncated JSON — find last complete object
                        const arrText = match[0];
                        let lastValid = null;
                        for (let i = arrText.length - 1; i > 0; i--) {
                            if (arrText[i] === '}') {
                                try {
                                    lastValid = JSON.parse(arrText.slice(0, i + 1) + ']');
                                    break;
                                } catch { /* keep searching */ }
                            }
                        }
                        if (lastValid) parsed = lastValid;
                        else throw new Error('Could not recover any valid questions from truncated JSON.');
                    }
                } else {
                    // No brackets found — try treating entire text as truncated array
                    let recovered = null;
                    const withBracket = '[' + cleaned;
                    for (let i = withBracket.length - 1; i > 0; i--) {
                        if (withBracket[i] === '}') {
                            try {
                                recovered = JSON.parse(withBracket.slice(0, i + 1) + ']');
                                break;
                            } catch { /* keep searching */ }
                        }
                    }
                    if (recovered) parsed = recovered;
                    else throw new Error('No JSON array found in file.');
                }
            }
            if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Must be a non-empty JSON array.');
            
            // Filter out questions missing required fields instead of rejecting all
            const valid = parsed.filter((q: any) => q.id && q.tier && q.type && q.stem && q.options && q.correctAnswer);
            const skipped = parsed.length - valid.length;
            
            if (valid.length === 0) {
                setParseError('All questions are missing required fields (id, tier, type, stem, options, correctAnswer).');
                return;
            }

            const tiers: Record<number, number> = {};
            valid.forEach((q: any) => { tiers[q.tier] = (tiers[q.tier] || 0) + 1; });
            setPendingQuestions(valid);
            setPendingTiers(tiers);
            if (skipped > 0) {
                toast.success(`Parsed ${valid.length} questions (${skipped} skipped — missing fields).`);
            }
        } catch (err: any) {
            setParseError(err.message || 'Parse failed.');
        }
        if (fileRef.current) fileRef.current.value = '';
    };

    // Upload / append
    const handleUpload = async () => {
        if (!pendingQuestions) return;
        let updated: BankQuestion[];
        if (appendMode && questions.length > 0) {
            // Re-id incoming to avoid duplicates
            const existingIds = new Set(questions.map(q => q.id));
            const reIded = pendingQuestions.map((q, i) => ({
                ...q,
                id: existingIds.has(q.id) ? `${q.id}_${Date.now()}_${i}` : q.id,
            }));
            updated = [...questions, ...reIded];
        } else {
            updated = pendingQuestions;
        }
        await saveBank(updated);
        toast.success(`${appendMode ? 'Added' : 'Replaced with'} ${pendingQuestions.length} questions. Total: ${updated.length}`);
        setPendingQuestions(null);
        setTab('manage');
    };

    // Filtered questions
    const filtered = useMemo(() => {
        let result = questions;
        if (filterTier) result = result.filter(q => q.tier === filterTier);
        if (filterType) result = result.filter(q => q.type === filterType);
        if (searchText) {
            const s = searchText.toLowerCase();
            result = result.filter(q => q.stem.toLowerCase().includes(s) || q.id.toLowerCase().includes(s));
        }
        return result;
    }, [questions, filterTier, filterType, searchText]);

    // Tier counts
    const tierCounts = useMemo(() => {
        const c: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
        questions.forEach(q => { c[q.tier] = (c[q.tier] || 0) + 1; });
        return c;
    }, [questions]);

    // Type counts
    const typeCounts = useMemo(() => {
        const c: Record<string, number> = {};
        questions.forEach(q => { c[q.type] = (c[q.type] || 0) + 1; });
        return c;
    }, [questions]);

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Question Bank Manager" maxWidth="max-w-3xl">
            <div className="text-gray-100">
                {/* Header stats */}
                <div className="flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl p-4 mb-4">
                    <Database className="w-5 h-5 text-purple-400 shrink-0" />
                    <div className="flex-1">
                        <span className="text-white font-bold text-sm">{assignment.title}</span>
                        <div className="text-xs mt-1">
                            {isLoading ? (
                                <span className="text-gray-500">Loading...</span>
                            ) : questions.length > 0 ? (
                                <span className="text-emerald-400">{questions.length} questions loaded</span>
                            ) : (
                                <span className="text-yellow-400">No question bank yet</span>
                            )}
                        </div>
                    </div>
                    {questions.length > 0 && !isLoading && (
                        <div className="flex gap-2">
                            {[1, 2, 3].map(t => (
                                <div key={t} className={`text-center px-3 py-1.5 rounded-lg ${TIER_COLORS[t].bg} ${TIER_COLORS[t].border} border`}>
                                    <div className={`text-sm font-bold ${TIER_COLORS[t].text}`}>{tierCounts[t]}</div>
                                    <div className="text-[8px] text-gray-500 uppercase font-bold">T{t}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                    {!isPracticeSet && (
                        <button onClick={() => setTab('manage')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${tab === 'manage' ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                            <Database className="w-3.5 h-3.5 inline mr-1.5" />Manage Bank ({questions.length})
                        </button>
                    )}
                    {!isPracticeSet && (
                        <button onClick={() => setTab('add')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${tab === 'add' ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                            <Plus className="w-3.5 h-3.5 inline mr-1.5" />{questions.length > 0 ? 'Add More' : 'Create Bank'}
                        </button>
                    )}
                    <button onClick={() => setTab('reading')}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${tab === 'reading' ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                        <BookOpen className="w-3.5 h-3.5 inline mr-1.5" />Study Material {readingMaterial ? `(${readingMaterial.sections.length}§)` : ''}
                    </button>
                </div>

                {/* MANAGE TAB */}
                {tab === 'manage' && (
                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto" /></div>
                        ) : questions.length === 0 ? (
                            <div className="py-12 text-center">
                                <Database className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                                <p className="text-gray-500 text-sm font-bold">No questions yet</p>
                                <p className="text-gray-600 text-xs mt-1">Switch to the &ldquo;Create Bank&rdquo; tab to get started.</p>
                            </div>
                        ) : (<>
                            {/* Filters */}
                            <div className="flex gap-2 flex-wrap items-center">
                                <div className="relative flex-1 min-w-[150px]">
                                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input value={searchText} onChange={e => setSearchText(e.target.value)}
                                        placeholder="Search questions..." className="w-full pl-9 pr-3 py-2 bg-black/30 border border-white/10 rounded-lg text-xs text-white placeholder-gray-600 outline-none focus:border-purple-500/50" />
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => setFilterTier(null)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition ${!filterTier ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>All</button>
                                    {[1, 2, 3].map(t => (
                                        <button key={t} onClick={() => setFilterTier(filterTier === t ? null : t)}
                                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition ${filterTier === t ? `${TIER_COLORS[t].bg} ${TIER_COLORS[t].text} ${TIER_COLORS[t].border} border` : 'text-gray-500 hover:text-gray-300'}`}>
                                            T{t} ({tierCounts[t]})
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Type filter chips */}
                            {Object.keys(typeCounts).length > 1 && (
                                <div className="flex gap-1 flex-wrap">
                                    {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                                        <button key={type} onClick={() => setFilterType(filterType === type ? null : type)}
                                            className={`px-2 py-1 rounded-lg text-[9px] font-bold transition ${filterType === type ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}>
                                            {TYPE_LABELS[type] || type} ({count})
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Question list */}
                            <div className="max-h-[350px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                {filtered.length === 0 ? (
                                    <p className="text-gray-600 text-xs text-center py-8">No questions match your filters.</p>
                                ) : filtered.map(q => {
                                    const tc = TIER_COLORS[q.tier] || TIER_COLORS[1];
                                    const isExp = expandedId === q.id;
                                    return (
                                        <div key={q.id} className={`rounded-xl border transition ${isExp ? `${tc.border} ${tc.bg}` : 'border-white/5 bg-white/[0.02] hover:border-white/10'}`}>
                                            <div className="flex items-start gap-2.5 p-3 cursor-pointer" onClick={() => setExpandedId(isExp ? null : q.id)}>
                                                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[9px] font-black ${tc.bg} ${tc.text}`}>T{q.tier}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                                        <span className="text-[8px] text-gray-600 font-mono">{q.id}</span>
                                                        <span className="text-[8px] text-gray-600">·</span>
                                                        <span className="text-[8px] text-gray-500">{TYPE_LABELS[q.type] || q.type}</span>
                                                        <span className="text-[8px] text-yellow-500 font-bold ml-auto flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{q.xp}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-300 leading-snug line-clamp-2">{q.stem}</p>
                                                </div>
                                                <ChevronRight className={`w-3.5 h-3.5 text-gray-600 shrink-0 mt-1 transition-transform ${isExp ? 'rotate-90' : ''}`} />
                                            </div>
                                            {isExp && (
                                                <div className="px-3 pb-3 space-y-2">
                                                    {q.context && <div className="text-[10px] text-gray-500 italic bg-black/20 rounded-lg p-2">{q.context}</div>}
                                                    <div className="space-y-1">
                                                        {q.options.map(opt => {
                                                            const isCorrect = Array.isArray(q.correctAnswer) ? q.correctAnswer.includes(opt.id) : q.correctAnswer === opt.id;
                                                            return (
                                                                <div key={opt.id} className={`flex items-start gap-2 text-[11px] px-2 py-1.5 rounded-lg ${isCorrect ? 'bg-emerald-500/10 text-emerald-300' : 'text-gray-400'}`}>
                                                                    <span className="font-mono font-bold text-[10px] mt-0.5 shrink-0">{opt.id.toUpperCase()}.</span>
                                                                    <span>{opt.text}</span>
                                                                    {isCorrect && <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto shrink-0 mt-0.5" />}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 bg-black/20 rounded-lg p-2">
                                                        <span className="font-bold text-gray-400">Explanation: </span>{q.explanation}
                                                    </div>
                                                    {q.linkedFollowUp && (
                                                        <div className="text-[10px] text-blue-300/70 bg-blue-500/5 border border-blue-500/20 rounded-lg p-2">
                                                            <span className="font-bold">Follow-up: </span>{q.linkedFollowUp.stem}
                                                        </div>
                                                    )}
                                                    <button onClick={() => handleDelete(q.id)} disabled={isSaving}
                                                        className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition">
                                                        <Trash2 className="w-3 h-3" /> Delete Question
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Showing count + clear all */}
                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <span className="text-[10px] text-gray-600">Showing {filtered.length} of {questions.length}</span>
                                <button onClick={handleClearAll} disabled={isSaving}
                                    className="text-[10px] font-bold text-red-400/60 hover:text-red-400 transition flex items-center gap-1">
                                    <Trash2 className="w-3 h-3" /> Clear Entire Bank
                                </button>
                            </div>
                        </>)}
                    </div>
                )}

                {/* ADD TAB */}
                {tab === 'add' && (
                    <div className="space-y-5">
                        {/* Step 1: Prompt */}
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                                Generate with AI
                            </h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Copy the prompt, paste into ChatGPT/Gemini/Claude with your resource content (PDF, notes, etc).
                            </p>
                            <button onClick={handleCopyPrompt}
                                className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${copied ? 'bg-emerald-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}>
                                {copied ? <><CheckCircle2 className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy AI Prompt</>}
                            </button>
                        </div>

                        {/* Step 2: Upload */}
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                                Upload JSON
                            </h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Save the AI output as <code className="bg-black/40 px-1 py-0.5 rounded text-purple-300 text-[10px]">.json</code> and upload here.
                            </p>
                            <label className="flex items-center justify-center gap-3 py-3 border-2 border-dashed border-white/15 rounded-xl hover:border-purple-500/50 hover:bg-purple-500/5 transition cursor-pointer">
                                <FileJson className="w-4 h-4 text-gray-400" />
                                <span className="text-xs text-gray-400 font-medium">Choose .json file</span>
                                <input ref={fileRef} type="file" accept=".json,.txt" onChange={handleFileSelect} className="hidden" />
                            </label>
                        </div>

                        {/* Parse Error */}
                        {parseError && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-red-300/70 text-xs">{parseError}</p>
                            </div>
                        )}

                        {/* Preview pending upload */}
                        {pendingQuestions && (
                            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    <span className="text-emerald-400 font-bold text-sm">{pendingQuestions.length} questions parsed</span>
                                </div>
                                <div className="flex gap-3">
                                    {[1, 2, 3].map(tier => (
                                        <div key={tier} className="flex-1 bg-black/30 rounded-lg p-2 text-center">
                                            <div className="text-base font-bold text-white">{pendingTiers[tier] || 0}</div>
                                            <div className="text-[8px] text-gray-500 uppercase font-bold">Tier {tier}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Append vs Replace */}
                                {questions.length > 0 && (
                                    <div className="flex gap-2">
                                        <button onClick={() => setAppendMode(true)}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition border ${appendMode ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}>
                                            <Plus className="w-3 h-3 inline mr-1" />Append to existing ({questions.length} + {pendingQuestions.length})
                                        </button>
                                        <button onClick={() => setAppendMode(false)}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition border ${!appendMode ? 'bg-red-500/20 border-red-500/30 text-red-300' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}>
                                            <XCircle className="w-3 h-3 inline mr-1" />Replace all
                                        </button>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <button onClick={handleUpload} disabled={isSaving}
                                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 text-sm">
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                        {isSaving ? 'Saving...' : `Upload ${pendingQuestions.length} Questions`}
                                    </button>
                                    <button onClick={() => setPendingQuestions(null)} className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl transition">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* READING TAB */}
                {tab === 'reading' && (
                    <div className="space-y-5">
                        {/* Current reading status */}
                        {readingMaterial ? (
                            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-emerald-400" />
                                        <span className="text-emerald-400 font-bold text-sm">{readingMaterial.title}</span>
                                    </div>
                                    <button onClick={handleDeleteReading} disabled={isSaving}
                                        className="text-[10px] font-bold text-red-400/60 hover:text-red-400 transition flex items-center gap-1">
                                        <Trash2 className="w-3 h-3" /> Remove
                                    </button>
                                </div>
                                {readingMaterial.description && (
                                    <p className="text-xs text-gray-400">{readingMaterial.description}</p>
                                )}
                                <div className="flex gap-2 text-[10px] text-gray-500">
                                    <span>{readingMaterial.sections.length} sections</span>
                                    {readingMaterial.estimatedMinutes && (
                                        <><span>·</span><span>~{readingMaterial.estimatedMinutes} min read</span></>
                                    )}
                                </div>
                                <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                    {readingMaterial.sections.map((s, i) => (
                                        <div key={i} className="text-[11px] text-gray-400 bg-black/20 px-3 py-2 rounded-lg flex items-center gap-2">
                                            <span className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                            <span className="truncate">{s.title}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="py-6 text-center">
                                <BookOpen className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                                <p className="text-gray-500 text-sm font-bold">No study material yet</p>
                                <p className="text-gray-600 text-xs mt-1">Upload reading material so students can study while working on this resource.</p>
                            </div>
                        )}

                        {/* Generate prompt */}
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                                Generate with AI
                            </h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Copy the prompt, paste into ChatGPT/Gemini/Claude with your resource content. The AI will create reading material students can study for engagement XP.
                            </p>
                            <button onClick={handleCopyReadingPrompt}
                                className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${copiedReading ? 'bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
                                {copiedReading ? <><CheckCircle2 className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Study Material Prompt</>}
                            </button>
                        </div>

                        {/* Upload reading JSON */}
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                                Upload Study Material JSON
                            </h4>
                            <label className="flex items-center justify-center gap-3 py-3 border-2 border-dashed border-white/15 rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition cursor-pointer">
                                <FileJson className="w-4 h-4 text-gray-400" />
                                <span className="text-xs text-gray-400 font-medium">Choose .json file</span>
                                <input ref={readingFileRef} type="file" accept=".json,.txt" onChange={handleReadingFileSelect} className="hidden" />
                            </label>
                        </div>

                        {/* Reading parse error */}
                        {readingParseError && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-red-300/70 text-xs">{readingParseError}</p>
                            </div>
                        )}

                        {/* Reading preview */}
                        {pendingReading && (
                            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    <span className="text-emerald-400 font-bold text-sm">{pendingReading.title}</span>
                                </div>
                                <p className="text-xs text-gray-400">{pendingReading.sections.length} sections · ~{pendingReading.estimatedMinutes || '?'} min read</p>
                                <div className="flex gap-2">
                                    <button onClick={handleUploadReading} disabled={isSaving}
                                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 text-sm">
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                        {isSaving ? 'Saving...' : 'Upload Study Material'}
                                    </button>
                                    <button onClick={() => setPendingReading(null)} className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl transition">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Saving indicator */}
                {isSaving && (
                    <div className="flex items-center justify-center gap-2 py-2 text-xs text-purple-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default QuestionBankManager;

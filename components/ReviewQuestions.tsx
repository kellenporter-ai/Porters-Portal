import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Assignment } from '../types';
import { db, callAwardQuestionXP } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Loader2, Zap, CheckCircle2, XCircle, Brain, ChevronRight, Star, ArrowUpDown, Lightbulb, Lock, RefreshCw } from 'lucide-react';
import { useToast } from './ToastProvider';
import { dataService } from '../services/dataService';

interface ReviewQuestionsProps {
    assignment: Assignment;
}

interface QuestionOption { id: string; text: string; }
interface LinkedFollowUp { stem: string; options: QuestionOption[]; correctAnswer: string; explanation: string; }
interface ReviewQuestion {
    id: string; tier: 1 | 2 | 3; xp: number; type: string; bloomsLevel: string;
    stem: string; context?: string | null; options: QuestionOption[];
    correctAnswer: string | string[]; explanation: string; linkedFollowUp?: LinkedFollowUp | null;
}
interface AnswerState { selected: string | string[] | null; linkedSelected?: string | null; submitted: boolean; correct: boolean; xpAwarded: boolean; }

const TIER_LABELS: Record<number, { name: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
    1: { name: 'Remember & Understand', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <Brain className="w-4 h-4" /> },
    2: { name: 'Apply & Analyze', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: <Lightbulb className="w-4 h-4" /> },
    3: { name: 'Evaluate & Create', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: <Star className="w-4 h-4" /> },
};

const TYPE_LABELS: Record<string, string> = {
    multiple_choice: 'Multiple Choice', multiple_select: 'Select All That Apply', ranking: 'Ranking Task',
    qualitative_reasoning: 'Qualitative Reasoning', linked_mc: 'Linked Questions', troubleshooting: 'Troubleshooting',
    conflicting_contentions: 'Conflicting Contentions', whats_wrong: "What's Wrong?", working_backwards: 'Working Backwards',
};

const QUESTIONS_PER_TIER = 3;

function pickRandom<T>(arr: T[], n: number): T[] {
    const a = [...arr];
    // Fisher-Yates shuffle (unbiased)
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
}

const ReviewQuestions: React.FC<ReviewQuestionsProps> = ({ assignment }) => {
    const toast = useToast();
    const [allQuestions, setAllQuestions] = useState<ReviewQuestion[]>([]);
    const [selectedQuestions, setSelectedQuestions] = useState<ReviewQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [bankEmpty, setBankEmpty] = useState(false);
    const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
    const [activeTier, setActiveTier] = useState<number>(1);
    const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
    const [answeredBefore, setAnsweredBefore] = useState<Set<string>>(new Set());

    const metricsRef = useRef<{ engagementTime: number }>({ engagementTime: 0 });
    const lastInteractionRef = useRef<number>(Date.now());

    // Increment engagement time every second while user is active
    useEffect(() => {
        const interval = setInterval(() => {
            if (Date.now() - lastInteractionRef.current < 60000) {
                metricsRef.current.engagementTime += 1;
            }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Track user interactions to detect active/away
    useEffect(() => {
        const handleInteraction = () => { lastInteractionRef.current = Date.now(); };
        const events = ['mousemove', 'keydown', 'scroll', 'click'];
        events.forEach(ev => window.addEventListener(ev, handleInteraction));
        return () => events.forEach(ev => window.removeEventListener(ev, handleInteraction));
    }, []);

    // Submit engagement time on unmount — NO XP awarded
    useEffect(() => {
        return () => {
            const time = metricsRef.current.engagementTime;
            if (time >= 5) {
                const uid = getAuth().currentUser?.uid;
                if (uid) {
                    dataService.submitReviewEngagement(uid, assignment.id, assignment.title, assignment.classType, time).catch(() => {});
                }
            }
        };
    }, [assignment.id, assignment.title, assignment.classType]);

    const selectNewBatch = useCallback((pool: ReviewQuestion[]) => {
        const t1 = pickRandom(pool.filter(q => q.tier === 1), QUESTIONS_PER_TIER);
        const t2 = pickRandom(pool.filter(q => q.tier === 2), QUESTIONS_PER_TIER);
        const t3 = pickRandom(pool.filter(q => q.tier === 3), QUESTIONS_PER_TIER);
        setSelectedQuestions([...t1, ...t2, ...t3]);
        setAnswers({});
        setExpandedQuestion(null);
    }, []);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            setBankEmpty(false);
            try {
                const snap = await getDoc(doc(db, 'question_banks', assignment.id));
                if (!snap.exists()) { setBankEmpty(true); return; }
                const questions = (snap.data().questions || []) as ReviewQuestion[];
                setAllQuestions(questions);
                selectNewBatch(questions);
            } catch (err) {
                console.error('Failed to load question bank:', err);
                setBankEmpty(true);
                return;
            } finally {
                setIsLoading(false);
            }

            // Load progress separately — failure here should NOT hide questions
            try {
                const uid = getAuth().currentUser?.uid;
                if (uid) {
                    const progSnap = await getDoc(
                        doc(db, 'review_progress', `${uid}_${assignment.id}`)
                    );
                    if (progSnap.exists()) {
                        setAnsweredBefore(new Set(progSnap.data().answeredQuestions || []));
                    }
                }
            } catch (err) {
                console.warn('Could not load review progress:', err);
            }
        };
        load();
    }, [assignment.id, selectNewBatch]);

    const handleNewSet = () => { if (allQuestions.length > 0) selectNewBatch(allQuestions); };

    const handleSelect = (qId: string, optionId: string, type: string) => {
        const current = answers[qId];
        if (current?.submitted) return;
        if (type === 'multiple_select' || type === 'ranking') {
            const prev = (current?.selected as string[]) || [];
            const next = prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId];
            setAnswers(a => ({ ...a, [qId]: { ...a[qId], selected: next, submitted: false, correct: false, xpAwarded: false } }));
        } else {
            setAnswers(a => ({ ...a, [qId]: { selected: optionId, submitted: false, correct: false, xpAwarded: false } }));
        }
    };

    const handleLinkedSelect = (qId: string, optionId: string) => {
        if (answers[qId]?.submitted) return;
        setAnswers(a => ({ ...a, [qId]: { ...a[qId], linkedSelected: optionId } }));
    };

    const handleSubmit = async (question: ReviewQuestion) => {
        const answer = answers[question.id];
        if (!answer?.selected) return;
        let isCorrect = false;
        if (question.type === 'multiple_select' || question.type === 'ranking') {
            const sel = answer.selected as string[];
            const cor = question.correctAnswer as string[];
            isCorrect = sel.length === cor.length && sel.every((s, i) => s === cor[i]);
        } else if (question.type === 'linked_mc') {
            isCorrect = answer.selected === question.correctAnswer &&
                (!question.linkedFollowUp || answer.linkedSelected === question.linkedFollowUp.correctAnswer);
        } else {
            isCorrect = answer.selected === question.correctAnswer;
        }

        if (isCorrect) {
            if (answeredBefore.has(question.id)) {
                setAnswers(a => ({ ...a, [question.id]: { ...a[question.id], submitted: true, correct: true, xpAwarded: false } }));
                toast.success('Correct! (XP already claimed for this question)');
            } else {
                // Set submitted+correct immediately for UI feedback
                setAnswers(a => ({ ...a, [question.id]: { ...a[question.id], submitted: true, correct: true, xpAwarded: false } }));
                try {
                    const result = await callAwardQuestionXP({ assignmentId: assignment.id, questionId: question.id, xpAmount: question.xp, classType: assignment.classType });
                    const data = result.data as { awarded: boolean };
                    if (data.awarded) {
                        toast.success(`+${question.xp} XP earned!`);
                        // Set xpAwarded in a single atomic update with all flags
                        setAnswers(a => ({ ...a, [question.id]: { ...a[question.id], submitted: true, correct: true, xpAwarded: true } }));
                        setAnsweredBefore(prev => new Set([...prev, question.id]));
                    } else {
                        toast.success('Correct! (XP already claimed)');
                    }
                } catch (err) { console.error('XP award error:', err); }
            }
        } else {
            setAnswers(a => ({ ...a, [question.id]: { ...a[question.id], submitted: true, correct: false, xpAwarded: false } }));
        }
    };

    const tierQuestions = useMemo(() => selectedQuestions.filter(q => q.tier === activeTier), [selectedQuestions, activeTier]);
    const totalXPEarned = useMemo(() => Object.entries(answers).filter(([, a]) => a.correct && a.xpAwarded).reduce((sum, [qId]) => sum + (selectedQuestions.find(q => q.id === qId)?.xp || 0), 0), [answers, selectedQuestions]);
    const totalPossibleXP = useMemo(() => selectedQuestions.reduce((sum, q) => sum + q.xp, 0), [selectedQuestions]);
    const allAnswered = useMemo(() => selectedQuestions.length > 0 && selectedQuestions.every(q => answers[q.id]?.submitted), [selectedQuestions, answers]);

    if (isLoading) {
        return (<div className="flex flex-col items-center justify-center py-20 gap-4"><Loader2 className="w-8 h-8 text-purple-400 animate-spin" /><p className="text-gray-400 text-sm">Loading questions...</p></div>);
    }
    if (bankEmpty) {
        return (<div className="flex flex-col items-center justify-center py-20 gap-4"><Brain className="w-12 h-12 text-gray-600" /><p className="text-gray-400 font-bold">No Questions Available</p><p className="text-gray-600 text-sm text-center max-w-sm">Your teacher hasn&apos;t uploaded review questions for this resource yet.</p></div>);
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <span className="font-bold text-white text-sm">Conceptual Review</span>
                    <span className="text-[10px] bg-white/10 text-gray-400 px-2 py-0.5 rounded-full font-mono">{allQuestions.length} in bank</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" /><span className="text-sm font-bold text-yellow-400">{totalXPEarned}</span><span className="text-[10px] text-gray-500">/ {totalPossibleXP} XP</span></div>
                    <button onClick={handleNewSet} className="flex items-center gap-1.5 text-[10px] font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg border border-purple-500/30 transition"><RefreshCw className="w-3 h-3" /> New Set</button>
                </div>
            </div>
            <div className="flex gap-2 px-4 py-3 border-b border-white/5 bg-black/20">
                {[1, 2, 3].map(tier => { const t = TIER_LABELS[tier]; const tQs = selectedQuestions.filter(q => q.tier === tier); const ans = tQs.filter(q => answers[q.id]?.submitted).length; const cor = tQs.filter(q => answers[q.id]?.correct).length; return (
                    <button key={tier} onClick={() => setActiveTier(tier)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTier === tier ? `${t.bg} ${t.color} ${t.border} border` : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                        {t.icon}<span className="hidden sm:inline">{t.name}</span><span className="sm:hidden">Tier {tier}</span>
                        {ans > 0 && <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${cor === tQs.length ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-gray-400'}`}>{cor}/{tQs.length}</span>}
                    </button>);
                })}
            </div>
            {allAnswered && (
                <div className="px-4 py-3 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
                    <span className="text-sm text-purple-300 font-bold">Set complete!</span>
                    <button onClick={handleNewSet} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> New Questions</button>
                </div>
            )}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {tierQuestions.map((question, idx) => {
                    const answer = answers[question.id]; const isExpanded = expandedQuestion === question.id; const isSubmitted = answer?.submitted; const isCorrect = answer?.correct; const ts = TIER_LABELS[question.tier];
                    return (
                        <div key={question.id} className={`rounded-2xl border transition-all ${isSubmitted ? isCorrect ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5' : isExpanded ? `${ts.border} ${ts.bg}` : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                            <button onClick={() => setExpandedQuestion(isExpanded ? null : question.id)} className="w-full p-4 flex items-start gap-3 text-left">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${isSubmitted ? isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500/20 text-red-400' : `${ts.bg} ${ts.color}`}`}>
                                    {isSubmitted ? (isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />) : idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${ts.color}`}>{question.bloomsLevel}</span>
                                        <span className="text-[9px] text-gray-600">·</span>
                                        <span className="text-[9px] text-gray-500 font-mono">{TYPE_LABELS[question.type] || question.type}</span>
                                        <span className="text-[9px] text-yellow-500 font-bold ml-auto flex items-center gap-0.5"><Zap className="w-3 h-3" />{question.xp} XP</span>
                                    </div>
                                    <p className="text-sm text-gray-200 font-medium leading-snug">{question.stem}</p>
                                </div>
                                <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 mt-1 ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-3">
                                    {question.context && <div className="bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-gray-400 italic leading-relaxed">{question.context}</div>}
                                    {question.type === 'ranking' ? <RankingInput question={question} answer={answer} onSelect={handleSelect} />
                                     : question.type === 'multiple_select' ? <MultiSelectInput question={question} answer={answer} onSelect={handleSelect} />
                                     : <MCInput question={question} answer={answer} onSelect={handleSelect} />}
                                    {question.type === 'linked_mc' && question.linkedFollowUp && (
                                        <div className="mt-3 pt-3 border-t border-white/10">
                                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Follow-Up</p>
                                            <p className="text-sm text-gray-200 font-medium mb-3">{question.linkedFollowUp.stem}</p>
                                            <div className="space-y-2">{question.linkedFollowUp.options.map(opt => {
                                                const isSel = answer?.linkedSelected === opt.id; const show = isSubmitted; const right = opt.id === question.linkedFollowUp!.correctAnswer;
                                                return (<button key={opt.id} onClick={() => handleLinkedSelect(question.id, opt.id)} disabled={isSubmitted}
                                                    className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${show ? (right ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : isSel ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-white/5 text-gray-500') : isSel ? 'border-purple-500/50 bg-purple-500/10 text-white' : 'border-white/10 hover:border-white/20 text-gray-300'}`}>
                                                    <span className="font-mono font-bold mr-2 text-xs">{opt.id.toUpperCase()}.</span> {opt.text}</button>);
                                            })}</div>
                                        </div>
                                    )}
                                    {!isSubmitted ? (
                                        <button onClick={() => handleSubmit(question)} disabled={!answer?.selected || (Array.isArray(answer?.selected) && answer.selected.length === 0)}
                                            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition">Submit Answer</button>
                                    ) : (
                                        <div className={`p-4 rounded-xl border ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                                            <div className="flex items-center gap-2 mb-2">{isCorrect ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}<span className={`font-bold text-sm ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>{isCorrect ? `Correct! +${question.xp} XP` : 'Incorrect'}</span></div>
                                            <p className="text-xs text-gray-400 leading-relaxed">{question.explanation}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                {tierQuestions.length === 0 && <div className="text-center py-12 text-gray-500 italic"><Lock className="w-8 h-8 mx-auto mb-2 opacity-20" />No questions for this tier.</div>}
            </div>
        </div>
    );
};

const MCInput: React.FC<{ question: ReviewQuestion; answer?: AnswerState; onSelect: (q: string, o: string, t: string) => void }> = ({ question, answer, onSelect }) => (
    <div className="space-y-2">{question.options.map(opt => {
        const sel = answer?.selected === opt.id; const show = answer?.submitted; const right = opt.id === question.correctAnswer;
        return (<button key={opt.id} onClick={() => onSelect(question.id, opt.id, question.type)} disabled={answer?.submitted}
            className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${show ? (right ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : sel ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-white/5 text-gray-500') : sel ? 'border-purple-500/50 bg-purple-500/10 text-white' : 'border-white/10 hover:border-white/20 text-gray-300'}`}>
            <span className="font-mono font-bold mr-2 text-xs">{opt.id.toUpperCase()}.</span> {opt.text}</button>);
    })}</div>
);

const MultiSelectInput: React.FC<{ question: ReviewQuestion; answer?: AnswerState; onSelect: (q: string, o: string, t: string) => void }> = ({ question, answer, onSelect }) => {
    const selected = (answer?.selected as string[]) || []; const correctIds = question.correctAnswer as string[];
    return (<div className="space-y-2"><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Select all that apply</p>{question.options.map(opt => {
        const isSel = selected.includes(opt.id); const show = answer?.submitted; const right = correctIds.includes(opt.id);
        return (<button key={opt.id} onClick={() => onSelect(question.id, opt.id, 'multiple_select')} disabled={answer?.submitted}
            className={`w-full text-left p-3 rounded-xl border text-sm transition-all flex items-center gap-3 ${show ? (right ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : isSel ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-white/5 text-gray-500') : isSel ? 'border-purple-500/50 bg-purple-500/10 text-white' : 'border-white/10 hover:border-white/20 text-gray-300'}`}>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSel ? 'border-purple-500 bg-purple-500' : 'border-gray-600'}`}>{isSel && <CheckCircle2 className="w-3 h-3 text-white" />}</div>
            <span><span className="font-mono font-bold mr-1 text-xs">{opt.id.toUpperCase()}.</span> {opt.text}</span></button>);
    })}</div>);
};

const RankingInput: React.FC<{ question: ReviewQuestion; answer?: AnswerState; onSelect: (q: string, o: string, t: string) => void }> = ({ question, answer, onSelect }) => {
    const selected = (answer?.selected as string[]) || []; const show = answer?.submitted; const correctOrder = question.correctAnswer as string[];
    return (<div className="space-y-2">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Click in order (first to last)</p>
        {selected.length > 0 && <div className="flex gap-1 flex-wrap mb-2">{selected.map((id, i) => {
            const opt = question.options.find(o => o.id === id); const rightPos = show && correctOrder[i] === id;
            return (<span key={id} className={`text-[10px] font-bold px-2 py-1 rounded-lg ${show ? (rightPos ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30') : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'}`}>{i + 1}. {opt?.text.slice(0, 30)}{(opt?.text.length || 0) > 30 ? '...' : ''}</span>);
        })}</div>}
        {question.options.map(opt => {
            const isSel = selected.includes(opt.id); const pos = selected.indexOf(opt.id);
            return (<button key={opt.id} onClick={() => onSelect(question.id, opt.id, 'ranking')} disabled={answer?.submitted}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all flex items-center gap-3 ${isSel ? 'border-purple-500/50 bg-purple-500/10 text-purple-300 opacity-60' : 'border-white/10 hover:border-white/20 text-gray-300'}`}>
                {isSel ? <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-xs font-bold flex items-center justify-center">{pos + 1}</span> : <span className="w-6 h-6 rounded-full border-2 border-gray-600 text-xs flex items-center justify-center text-gray-600">?</span>}
                {opt.text}</button>);
        })}
    </div>);
};

export default ReviewQuestions;

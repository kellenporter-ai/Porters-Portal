import React, { useState, useEffect, useRef } from 'react';
import { BossQuizEvent, BossQuestionBank, BossType, BossModifierType, BossModifier, BOSS_MODIFIER_DEFS, DefaultClassTypes } from '../../types';
import { Plus, Trash2, Check, X, Copy, Upload, FileJson } from 'lucide-react';
import BossAvatar from './BossAvatar';
import SectionPicker from '../SectionPicker';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import Modal from '../Modal';

interface QuizBossFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingQuizBoss: BossQuizEvent | null;
  questionBanks: BossQuestionBank[];
  availableSections: string[];
}

interface QuizQuestion {
  id: string;
  stem: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  damageBonus: number;
  bankId?: string;
}

interface QuizBossFormState {
  bossName: string;
  description: string;
  maxHp: number;
  classType: string;
  damagePerCorrect: number;
  rewardXp: number;
  rewardFlux: number;
  rewardItemRarity: string;
  deadline: string;
  questions: QuizQuestion[];
  targetSections: string[];
  bossType: BossType;
  bossHue: number;
}

const emptyForm = (): QuizBossFormState => {
  const defaultDeadline = new Date();
  defaultDeadline.setDate(defaultDeadline.getDate() + 7);
  return {
    bossName: '',
    description: '',
    maxHp: 1000,
    classType: 'GLOBAL',
    damagePerCorrect: 50,
    rewardXp: 500,
    rewardFlux: 100,
    rewardItemRarity: '',
    deadline: defaultDeadline.toISOString().slice(0, 16),
    questions: [],
    targetSections: [],
    bossType: 'BRUTE',
    bossHue: 0,
  };
};

const QUIZ_BOSS_PROMPT = (bossName: string, classType: string) =>
`You are an expert educational assessment designer. Generate quiz boss questions for a gamified LMS.

BOSS: "${bossName || 'Quiz Boss'}"
CLASS: ${classType || 'General'}

Generate 15-30 multiple choice questions across 3 difficulty tiers.

TIER DISTRIBUTION:
- EASY (5-10 questions): Recall and basic comprehension
- MEDIUM (5-10 questions): Application and analysis
- HARD (5-10 questions): Evaluation and synthesis

OUTPUT FORMAT — Respond with ONLY a valid JSON array:
[
  {
    "id": "q001",
    "stem": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "difficulty": "EASY",
    "damageBonus": 0
  }
]

RULES:
- "correctAnswer" is the 0-based INDEX of the correct option (0=A, 1=B, 2=C, 3=D)
- "damageBonus" should be 0 for EASY, 25 for MEDIUM, 50 for HARD
- Each question must have exactly 4 options
- Distractors must be plausible and educational
- Questions must be specific to the class material
- Output ONLY the JSON array — no markdown fences, no commentary`;

const QuizBossFormModal: React.FC<QuizBossFormModalProps> = ({
  isOpen,
  onClose,
  editingQuizBoss,
  questionBanks,
  availableSections,
}) => {
  const toast = useToast();
  const [quizBossForm, setQuizBossForm] = useState<QuizBossFormState>(emptyForm());
  const [formModifiers, setFormModifiers] = useState<BossModifier[]>([]);
  const [promptCopied, setPromptCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const quizFileRef = useRef<HTMLInputElement>(null);

  // Initialize form from editingQuizBoss on open
  useEffect(() => {
    if (isOpen) {
      if (editingQuizBoss) {
        setQuizBossForm({
          bossName: editingQuizBoss.bossName,
          description: editingQuizBoss.description,
          maxHp: editingQuizBoss.maxHp,
          classType: editingQuizBoss.classType || 'GLOBAL',
          damagePerCorrect: editingQuizBoss.damagePerCorrect || 50,
          rewardXp: editingQuizBoss.rewards?.xp || 500,
          rewardFlux: editingQuizBoss.rewards?.flux || 100,
          rewardItemRarity: editingQuizBoss.rewards?.itemRarity || '',
          deadline: editingQuizBoss.deadline ? editingQuizBoss.deadline.slice(0, 16) : '',
          questions: editingQuizBoss.questions.map(q => ({ ...q, damageBonus: q.damageBonus || 0 })),
          targetSections: editingQuizBoss.targetSections || [],
          bossType: editingQuizBoss.bossAppearance?.bossType || 'BRUTE',
          bossHue: editingQuizBoss.bossAppearance?.hue ?? 0,
        });
        setFormModifiers(editingQuizBoss.modifiers || []);
      } else {
        setQuizBossForm(emptyForm());
        setFormModifiers([]);
      }
      setImportError(null);
      setPromptCopied(false);
    }
  }, [isOpen, editingQuizBoss]);

  // --- Question CRUD ---
  const addQuizQuestion = () => {
    setQuizBossForm(prev => ({
      ...prev,
      questions: [...prev.questions, {
        id: Math.random().toString(36).substring(2, 10),
        stem: '', options: ['', '', '', ''], correctAnswer: 0,
        difficulty: 'MEDIUM' as const, damageBonus: 0,
      }],
    }));
  };

  const updateQuizQuestion = (idx: number, field: string, value: unknown) => {
    setQuizBossForm(prev => {
      const questions = [...prev.questions];
      questions[idx] = { ...questions[idx], [field]: value };
      return { ...prev, questions };
    });
  };

  const updateQuizOption = (qIdx: number, optIdx: number, value: string) => {
    setQuizBossForm(prev => {
      const questions = [...prev.questions];
      const options = [...questions[qIdx].options];
      options[optIdx] = value;
      questions[qIdx] = { ...questions[qIdx], options };
      return { ...prev, questions };
    });
  };

  const removeQuizQuestion = (idx: number) => {
    setQuizBossForm(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  // --- JSON Import ---
  const handleImportQuizQuestions = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      let cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
      cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ch => ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : '');
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            let lastValid = null;
            for (let i = match[0].length - 1; i > 0; i--) {
              if (match[0][i] === '}') {
                try {
                  lastValid = JSON.parse(match[0].slice(0, i + 1) + ']');
                  break;
                } catch { /* keep searching */ }
              }
            }
            if (lastValid) parsed = lastValid;
            else throw new Error('Could not parse JSON.');
          }
        } else {
          throw new Error('No JSON array found.');
        }
      }
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Must be a non-empty JSON array.');
      const valid = parsed.filter((q: Record<string, unknown>) => q.stem && q.options && q.correctAnswer !== undefined);
      if (valid.length === 0) throw new Error('No valid questions found.');
      const imported: QuizQuestion[] = valid.map((q: Record<string, unknown>) => ({
        id: (q.id as string) || Math.random().toString(36).substring(2, 10),
        stem: q.stem as string,
        options: (q.options as string[]).slice(0, 4),
        correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
        difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty as string) ? q.difficulty : 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD',
        damageBonus: typeof q.damageBonus === 'number' ? q.damageBonus : 0,
      }));
      const skipped = parsed.length - valid.length;
      setQuizBossForm(prev => ({ ...prev, questions: [...prev.questions, ...imported] }));
      toast.success(`Imported ${imported.length} questions${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
      toast.error('Failed to import questions.');
    }
    if (quizFileRef.current) quizFileRef.current.value = '';
  };

  // --- Import from Question Bank ---
  const importBankToBoss = (bank: BossQuestionBank) => {
    const imported: QuizQuestion[] = bank.questions.map(q => ({
      ...q,
      damageBonus: q.damageBonus || 0,
      bankId: bank.id,
      id: Math.random().toString(36).substring(2, 10),
    }));
    setQuizBossForm(prev => ({ ...prev, questions: [...prev.questions, ...imported] }));
    toast.success(`Imported ${imported.length} questions from "${bank.name}"`);
  };

  // --- Modifier Management ---
  const toggleModifier = (type: BossModifierType) => {
    setFormModifiers(prev => {
      const exists = prev.find(m => m.type === type);
      if (exists) return prev.filter(m => m.type !== type);
      const def = BOSS_MODIFIER_DEFS[type];
      return [...prev, { type, ...(def.hasValue ? { value: def.defaultValue } : {}) }];
    });
  };

  const updateModifierValue = (type: BossModifierType, value: number) => {
    setFormModifiers(prev => prev.map(m => m.type === type ? { ...m, value } : m));
  };

  // --- Copy AI Prompt ---
  const handleCopyQuizPrompt = () => {
    const prompt = QUIZ_BOSS_PROMPT(quizBossForm.bossName, quizBossForm.classType);
    navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2500);
    toast.success('Prompt copied to clipboard!');
  };

  // --- Save / Deploy ---
  const handleSaveQuizBoss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quizBossForm.questions.length === 0) {
      toast.error('Add at least one question.');
      return;
    }
    try {
      const usedBankIds = [...new Set(quizBossForm.questions.map(q => q.bankId).filter(Boolean))] as string[];
      const quizData: Record<string, unknown> = {
        id: editingQuizBoss?.id || Math.random().toString(36).substring(2, 12),
        bossName: quizBossForm.bossName,
        description: quizBossForm.description,
        maxHp: quizBossForm.maxHp,
        currentHp: editingQuizBoss?.currentHp ?? quizBossForm.maxHp,
        classType: quizBossForm.classType,
        isActive: editingQuizBoss?.isActive ?? true,
        deadline: new Date(quizBossForm.deadline).toISOString(),
        damagePerCorrect: quizBossForm.damagePerCorrect,
        questions: quizBossForm.questions.map(q => ({
          id: q.id,
          stem: q.stem,
          options: q.options.filter(o => o.trim()),
          correctAnswer: q.correctAnswer,
          difficulty: q.difficulty,
          ...(q.damageBonus > 0 ? { damageBonus: q.damageBonus } : {}),
          ...(q.bankId ? { bankId: q.bankId } : {}),
        })),
        rewards: {
          xp: quizBossForm.rewardXp,
          flux: quizBossForm.rewardFlux,
          ...(quizBossForm.rewardItemRarity ? { itemRarity: quizBossForm.rewardItemRarity } : {}),
        },
        ...(quizBossForm.targetSections.length > 0 ? { targetSections: quizBossForm.targetSections } : {}),
        bossAppearance: { bossType: quizBossForm.bossType, hue: quizBossForm.bossHue },
        ...(formModifiers.length > 0 ? { modifiers: formModifiers } : {}),
        ...(usedBankIds.length > 0 ? { questionBankIds: usedBankIds } : {}),
      };
      await dataService.saveBossQuiz(quizData as unknown as BossQuizEvent);
      toast.success(editingQuizBoss ? 'Quiz boss updated.' : 'Quiz boss deployed!');
      onClose();
    } catch (err) {
      toast.error('Failed to save quiz boss.');
    }
  };

  // --- Save Draft (inactive) ---
  const handleSaveDraft = async () => {
    if (quizBossForm.questions.length === 0) {
      toast.error('Add at least one question.');
      return;
    }
    const usedBankIds = [...new Set(quizBossForm.questions.map(q => q.bankId).filter(Boolean))] as string[];
    const quizData: Record<string, unknown> = {
      id: Math.random().toString(36).substring(2, 12),
      bossName: quizBossForm.bossName,
      description: quizBossForm.description,
      maxHp: quizBossForm.maxHp,
      currentHp: quizBossForm.maxHp,
      classType: quizBossForm.classType,
      isActive: false,
      deadline: quizBossForm.deadline ? new Date(quizBossForm.deadline).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString(),
      damagePerCorrect: quizBossForm.damagePerCorrect,
      questions: quizBossForm.questions.map(q => ({
        id: q.id,
        stem: q.stem,
        options: q.options.filter(o => o.trim()),
        correctAnswer: q.correctAnswer,
        difficulty: q.difficulty,
        ...(q.damageBonus > 0 ? { damageBonus: q.damageBonus } : {}),
        ...(q.bankId ? { bankId: q.bankId } : {}),
      })),
      rewards: {
        xp: quizBossForm.rewardXp,
        flux: quizBossForm.rewardFlux,
        ...(quizBossForm.rewardItemRarity ? { itemRarity: quizBossForm.rewardItemRarity } : {}),
      },
      ...(quizBossForm.targetSections.length > 0 ? { targetSections: quizBossForm.targetSections } : {}),
      bossAppearance: { bossType: quizBossForm.bossType, hue: quizBossForm.bossHue },
      ...(formModifiers.length > 0 ? { modifiers: formModifiers } : {}),
      ...(usedBankIds.length > 0 ? { questionBankIds: usedBankIds } : {}),
    };
    await dataService.saveBossQuiz(quizData as unknown as BossQuizEvent);
    toast.success('Quiz boss saved as draft (inactive).');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingQuizBoss ? 'Edit Quiz Boss' : 'Deploy Quiz Boss'} maxWidth="max-w-2xl">
      <form onSubmit={handleSaveQuizBoss} className="space-y-4 text-gray-100 p-2 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Boss Name</label>
          <input value={quizBossForm.bossName} onChange={e => setQuizBossForm({ ...quizBossForm, bossName: e.target.value })} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" placeholder="e.g. The Knowledge Sphinx" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Description</label>
          <textarea value={quizBossForm.description} onChange={e => setQuizBossForm({ ...quizBossForm, description: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white resize-none h-16" placeholder="A mythical beast that can only be defeated by knowledge..." />
        </div>

        {/* Boss Appearance Editor */}
        <div className="border border-white/10 rounded-xl p-4 bg-black/20">
          <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-3">Boss Appearance</label>
          <div className="flex items-start gap-4">
            {/* Live preview */}
            <div className="flex-shrink-0 w-24 h-32 bg-black/40 rounded-xl border border-white/5 flex items-center justify-center p-1">
              <BossAvatar bossType={quizBossForm.bossType} hue={quizBossForm.bossHue} />
            </div>
            {/* Controls */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-[9px] text-gray-500 mb-1">Boss Type</label>
                <div className="flex gap-2">
                  {(['BRUTE', 'PHANTOM', 'SERPENT'] as BossType[]).map(type => (
                    <button key={type} type="button" onClick={() => setQuizBossForm({ ...quizBossForm, bossType: type })}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                        quizBossForm.bossType === type
                          ? 'bg-amber-600/20 border-amber-500/40 text-amber-400'
                          : 'bg-black/30 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                      }`}>
                      {type.charAt(0) + type.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 mb-1">Color Hue: {quizBossForm.bossHue}&deg;</label>
                <input type="range" min="0" max="360" value={quizBossForm.bossHue}
                  onChange={e => setQuizBossForm({ ...quizBossForm, bossHue: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{ background: 'linear-gradient(to right, hsl(0,80%,50%), hsl(60,80%,50%), hsl(120,80%,50%), hsl(180,80%,50%), hsl(240,80%,50%), hsl(300,80%,50%), hsl(360,80%,50%))' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Max HP</label>
            <input type="number" value={quizBossForm.maxHp} onChange={e => setQuizBossForm({ ...quizBossForm, maxHp: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-bold text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Dmg Per Correct</label>
            <input type="number" value={quizBossForm.damagePerCorrect} onChange={e => setQuizBossForm({ ...quizBossForm, damagePerCorrect: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-bold text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Target Class</label>
            <select value={quizBossForm.classType} onChange={e => setQuizBossForm({ ...quizBossForm, classType: e.target.value, targetSections: [] })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-bold text-sm">
              <option value="GLOBAL">All Classes</option>
              {Object.values(DefaultClassTypes).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <SectionPicker availableSections={availableSections} selectedSections={quizBossForm.targetSections} onChange={s => setQuizBossForm({ ...quizBossForm, targetSections: s })} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Deadline</label>
            <input type="datetime-local" value={quizBossForm.deadline} onChange={e => setQuizBossForm({ ...quizBossForm, deadline: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-bold text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[9px] text-gray-500 mb-1 px-1">Reward XP</label>
              <input type="number" value={quizBossForm.rewardXp} onChange={e => setQuizBossForm({ ...quizBossForm, rewardXp: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-sm font-bold" />
            </div>
            <div>
              <label className="block text-[9px] text-gray-500 mb-1 px-1">Flux</label>
              <input type="number" value={quizBossForm.rewardFlux} onChange={e => setQuizBossForm({ ...quizBossForm, rewardFlux: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-sm font-bold" />
            </div>
            <div>
              <label className="block text-[9px] text-gray-500 mb-1 px-1">Loot</label>
              <select value={quizBossForm.rewardItemRarity} onChange={e => setQuizBossForm({ ...quizBossForm, rewardItemRarity: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-xs font-bold">
                <option value="">None</option>
                <option value="UNCOMMON">Uncommon</option>
                <option value="RARE">Rare</option>
                <option value="UNIQUE">Unique</option>
              </select>
            </div>
          </div>
        </div>

        {/* Modifiers */}
        <div className="border border-white/10 rounded-xl p-4 bg-black/20">
          <label className="block text-[10px] font-bold text-pink-400 uppercase tracking-widest mb-3">Boss Modifiers ({formModifiers.length} active)</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.entries(BOSS_MODIFIER_DEFS) as [BossModifierType, typeof BOSS_MODIFIER_DEFS[BossModifierType]][]).map(([type, def]) => {
              const active = formModifiers.find(m => m.type === type);
              return (
                <div key={type} className={`rounded-lg border p-2 cursor-pointer transition-all ${active ? 'border-pink-500/40 bg-pink-500/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}>
                  <button type="button" onClick={() => toggleModifier(type)} className="w-full text-left">
                    <div className="text-[10px] font-bold text-white">{def.name}</div>
                    <div className="text-[9px] text-gray-500 leading-tight">{def.description}</div>
                  </button>
                  {active && def.hasValue && (
                    <div className="flex items-center gap-1 mt-1">
                      <input type="number" value={active.value ?? def.defaultValue}
                        onChange={e => updateModifierValue(type, parseInt(e.target.value) || 0)}
                        className="w-16 bg-black/40 border border-white/10 rounded p-1 text-white text-[10px] font-bold"
                      />
                      <span className="text-[9px] text-gray-500">{def.unit}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Import from Question Banks */}
        {questionBanks.length > 0 && (
        <div className="border border-white/10 rounded-xl p-4 bg-black/20">
          <label className="block text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3">Import from Question Banks</label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {questionBanks.filter(b => b.classType === quizBossForm.classType || b.classType === 'GLOBAL' || quizBossForm.classType === 'GLOBAL').map(bank => (
              <div key={bank.id} className="flex items-center justify-between p-2 rounded-lg border border-white/5 bg-black/20">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white">{bank.name}</span>
                  <span className="text-[10px] text-gray-500 ml-2">{bank.questions.length} questions</span>
                </div>
                <button type="button" onClick={() => importBankToBoss(bank)}
                  className="px-2 py-1 bg-purple-600/20 text-purple-400 rounded text-[10px] font-bold hover:bg-purple-600/30 transition flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Import All
                </button>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Questions */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <label className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Questions ({quizBossForm.questions.length})</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleCopyQuizPrompt} className={`text-xs px-3 py-1 rounded-lg transition font-bold flex items-center gap-1 ${promptCopied ? 'bg-green-600/20 text-green-400' : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'}`}>
                {promptCopied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy AI Prompt</>}
              </button>
              <label className="text-xs bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg hover:bg-blue-600/30 transition font-bold flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" /> Import JSON
                <input ref={quizFileRef} type="file" accept=".json,.txt" onChange={handleImportQuizQuestions} className="hidden" />
              </label>
              <button type="button" onClick={addQuizQuestion} className="text-xs bg-amber-600/20 text-amber-400 px-3 py-1 rounded-lg hover:bg-amber-600/30 transition font-bold flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Manual
              </button>
            </div>
          </div>

          {importError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400 flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" />
              {importError}
              <button type="button" onClick={() => setImportError(null)} className="ml-auto text-red-500 hover:text-red-300"><X className="w-3 h-3" /></button>
            </div>
          )}

          {quizBossForm.questions.length === 0 && (
            <div className="text-center py-6 space-y-2">
              <FileJson className="w-8 h-8 mx-auto text-gray-600 opacity-30" />
              <p className="text-xs text-gray-600">No questions yet.</p>
              <p className="text-[10px] text-gray-700">Use <span className="text-purple-400">Copy AI Prompt</span> → paste into ChatGPT/Claude → save JSON → <span className="text-blue-400">Import JSON</span></p>
            </div>
          )}

          {quizBossForm.questions.map((q, qIdx) => (
            <div key={q.id} className="bg-black/30 rounded-xl border border-white/5 p-4 mb-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-[9px] text-gray-500 mb-1">Question #{qIdx + 1}</label>
                  <textarea
                    value={q.stem}
                    onChange={e => updateQuizQuestion(qIdx, 'stem', e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-sm resize-none h-14"
                    placeholder="e.g. What is the acceleration due to gravity on Earth?"
                    required
                  />
                </div>
                <button type="button" onClick={() => removeQuizQuestion(qIdx)} className="text-gray-600 hover:text-red-400 mt-4"><Trash2 className="w-4 h-4" /></button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuizQuestion(qIdx, 'correctAnswer', optIdx)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                        q.correctAnswer === optIdx ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-gray-600 text-transparent hover:border-gray-400'
                      }`}
                      title="Mark as correct answer"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <input
                      value={opt}
                      onChange={e => updateQuizOption(qIdx, optIdx, e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg p-1.5 text-white text-xs"
                      placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={q.difficulty}
                  onChange={e => updateQuizQuestion(qIdx, 'difficulty', e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg p-1.5 text-white text-xs font-bold"
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
                <div className="flex items-center gap-1">
                  <label className="text-[9px] text-gray-500">Bonus Dmg:</label>
                  <input
                    type="number"
                    value={q.damageBonus}
                    onChange={e => updateQuizQuestion(qIdx, 'damageBonus', parseInt(e.target.value) || 0)}
                    className="w-16 bg-black/40 border border-white/10 rounded-lg p-1.5 text-white text-xs font-bold"
                    min={0}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          {!editingQuizBoss && (
            <button type="button" onClick={handleSaveDraft}
              className="flex-1 bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition">
              Save Draft
            </button>
          )}
          <button type="submit" className={`${editingQuizBoss ? 'w-full' : 'flex-[2]'} bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:bg-amber-700`}>
            {editingQuizBoss ? 'Update Quiz Boss' : 'Deploy Quiz Boss'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default QuizBossFormModal;

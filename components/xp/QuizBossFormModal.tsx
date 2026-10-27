import React, { useEffect, useRef, useState } from 'react';
import { BossEvent, BossQuestionBank, BossQuizQuestion, BossType } from '../../types';
import { Check, Copy, FileJson, Plus, Trash2, Upload, X } from 'lucide-react';
import BossAvatar from './BossAvatar';
import SectionPicker from '../SectionPicker';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { useClassConfig } from '../../lib/AppDataContext';
import Modal from '../Modal';
import { reportError } from '../../lib/errorReporting';

interface QuizBossFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingQuizBoss: BossEvent | null;
  questionBanks: BossQuestionBank[];
  availableSections: string[];
}

export type QuizQuestion = BossQuizQuestion & { damageBonus: number };

export interface QuizBossFormState {
  bossName: string;
  description: string;
  maxHp: number;
  classType: string;
  damagePerCorrect: number;
  rewardXp: number;
  rewardFlux: number;
  rewardItemRarity: string;
  deadline: string;
  scheduledAt: string;
  questions: QuizQuestion[];
  targetSections: string[];
  bossType: BossType;
  bossHue: number;
}

export const emptyQuizBossForm = (): QuizBossFormState => {
  const deadline = new Date(Date.now() + 7 * 86400000);
  return {
    bossName: '', description: '', maxHp: 1000, classType: 'GLOBAL',
    damagePerCorrect: 50, rewardXp: 500, rewardFlux: 100, rewardItemRarity: '',
    deadline: deadline.toISOString().slice(0, 16), scheduledAt: '', questions: [],
    targetSections: [], bossType: 'BRUTE', bossHue: 0,
  };
};

/** Preserve legacy and unknown fields while replacing only fields the engine uses. */
export function buildBossSavePayload(
  formState: QuizBossFormState,
  existingBoss: BossEvent | null,
  isDraft = false,
  id?: string,
): BossEvent {
  const usedBankIds = [...new Set(formState.questions.map(q => q.bankId).filter(Boolean))] as string[];
  return {
    ...existingBoss,
    id: existingBoss?.id || id || Math.random().toString(36).substring(2, 12),
    mode: 'QUIZ',
    bossName: formState.bossName,
    description: formState.description,
    maxHp: formState.maxHp,
    currentHp: existingBoss?.currentHp ?? formState.maxHp,
    classType: formState.classType,
    isActive: isDraft ? false : (existingBoss?.isActive ?? true),
    deadline: formState.deadline
      ? new Date(formState.deadline).toISOString()
      : new Date(Date.now() + 7 * 86400000).toISOString(),
    scheduledAt: formState.scheduledAt ? new Date(formState.scheduledAt).toISOString() : null,
    damagePerCorrect: formState.damagePerCorrect,
    questions: formState.questions.map(({ damageBonus, ...question }) => ({
      ...question,
      options: question.options.filter(option => option.trim()),
      ...(damageBonus > 0 ? { damageBonus } : {}),
    })),
    rewards: {
      xp: formState.rewardXp,
      flux: formState.rewardFlux,
      ...(formState.rewardItemRarity
        ? { itemRarity: formState.rewardItemRarity as BossEvent['rewards']['itemRarity'] }
        : {}),
    },
    targetSections: formState.targetSections,
    bossAppearance: { bossType: formState.bossType, hue: formState.bossHue },
    ...(usedBankIds.length > 0
      ? { questionBankIds: usedBankIds }
      : existingBoss ? { questionBankIds: [] } : {}),
  } as BossEvent;
}

export function normalizeImportedQuestion(question: Record<string, unknown>): QuizQuestion {
  return {
    ...question,
    id: (question.id as string) || Math.random().toString(36).substring(2, 10),
    stem: (question.stem as string) || '',
    options: ((question.options as string[]) || ['', '', '', '']).slice(0, 4),
    correctAnswer: typeof question.correctAnswer === 'number' ? question.correctAnswer : 0,
    difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(question.difficulty as string)
      ? question.difficulty : 'MEDIUM') as BossQuizQuestion['difficulty'],
    damageBonus: typeof question.damageBonus === 'number' ? question.damageBonus : 0,
  } as QuizQuestion;
}

const inputClass = 'w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-2 text-[var(--text-primary)] font-bold text-sm';
const labelClass = 'block text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase mb-1 px-1';

const QuizBossFormModal: React.FC<QuizBossFormModalProps> = ({
  isOpen, onClose, editingQuizBoss, questionBanks, availableSections,
}) => {
  const toast = useToast();
  const { classConfigs } = useClassConfig();
  const classOptions = classConfigs.length > 0
    ? classConfigs.map(config => config.className)
    : ['AP Physics', 'Honors Physics', 'Physics', 'Forensic Science'];
  const [form, setForm] = useState<QuizBossFormState>(emptyQuizBossForm);
  const [importError, setImportError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(editingQuizBoss ? {
      bossName: editingQuizBoss.bossName,
      description: editingQuizBoss.description,
      maxHp: editingQuizBoss.maxHp,
      classType: editingQuizBoss.classType || 'GLOBAL',
      damagePerCorrect: editingQuizBoss.damagePerCorrect || 50,
      rewardXp: editingQuizBoss.rewards?.xp ?? 500,
      rewardFlux: editingQuizBoss.rewards?.flux ?? 100,
      rewardItemRarity: editingQuizBoss.rewards?.itemRarity || '',
      deadline: editingQuizBoss.deadline?.slice(0, 16) || '',
      scheduledAt: editingQuizBoss.scheduledAt?.slice(0, 16) || '',
      questions: (editingQuizBoss.questions || []).map(question => ({
        ...question, damageBonus: question.damageBonus || 0,
      })),
      targetSections: editingQuizBoss.targetSections || [],
      bossType: editingQuizBoss.bossAppearance?.bossType || 'BRUTE',
      bossHue: editingQuizBoss.bossAppearance?.hue ?? 0,
    } : emptyQuizBossForm());
    setImportError(null);
    setPromptCopied(false);
  }, [isOpen, editingQuizBoss]);

  const update = <K extends keyof QuizBossFormState>(key: K, value: QuizBossFormState[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
  };
  const updateQuestion = (index: number, changes: Partial<QuizQuestion>) => {
    update('questions', form.questions.map((question, i) => i === index ? { ...question, ...changes } : question));
  };

  const importQuestions = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const cleaned = (await file.text()).replace(/```json\s*|```\s*/g, '').trim();
      const parsed: unknown = JSON.parse(cleaned);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Must be a non-empty JSON array.');
      const valid = parsed.filter((question: Record<string, unknown>) =>
        question.stem && Array.isArray(question.options) && question.correctAnswer !== undefined);
      if (valid.length === 0) throw new Error('No valid questions found.');
      const imported = valid.map(normalizeImportedQuestion);
      update('questions', [...form.questions, ...imported]);
      toast.success(`Imported ${imported.length} questions${parsed.length - valid.length > 0 ? ` (${parsed.length - valid.length} skipped)` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed.';
      setImportError(message);
      toast.error('Failed to import questions.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const importBank = (bank: BossQuestionBank) => {
    const imported = bank.questions.map(question => ({
      ...question,
      damageBonus: question.damageBonus || 0,
      bankId: bank.id,
      id: Math.random().toString(36).substring(2, 10),
    }));
    update('questions', [...form.questions, ...imported]);
    toast.success(`Imported ${imported.length} questions from "${bank.name}"`);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(
        `Generate 15-30 multiple choice questions for "${form.bossName || 'Quiz Boss'}" (${form.classType}). Return only a JSON array with id, stem, four options, correctAnswer as a zero-based index, difficulty, damageBonus, and topicId.`,
      );
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
      toast.success('Prompt copied to clipboard!');
    } catch (error) {
      reportError(error, { component: 'QuizBossFormModal' });
      toast.error('Failed to copy prompt.');
    }
  };

  const save = async (isDraft: boolean) => {
    if (isSaving) return;
    if (form.questions.length === 0) {
      toast.error('Add at least one question.');
      return;
    }
    setIsSaving(true);
    try {
      await dataService.saveBossEvent(buildBossSavePayload(form, editingQuizBoss, isDraft));
      toast.success(isDraft ? 'Quiz boss saved as draft (inactive).' : editingQuizBoss ? 'Quiz boss updated.' : 'Quiz boss deployed!');
      onClose();
    } catch (error) {
      reportError(error, { component: 'QuizBossFormModal' });
      toast.error(error instanceof Error ? `Save failed: ${error.message}` : 'Failed to save quiz boss.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingQuizBoss ? 'Edit Quiz Boss' : 'Deploy Quiz Boss'} maxWidth="max-w-4xl w-[95vw]">
      <form onSubmit={event => { event.preventDefault(); void save(false); }} className="text-[var(--text-primary)] p-3 max-h-[85vh] overflow-y-auto space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label htmlFor="boss-name" className={labelClass}>Boss Name</label>
            <input id="boss-name" value={form.bossName} onChange={event => update('bossName', event.target.value)} required className={inputClass} placeholder="The Knowledge Sphinx" />
          </div>
          <div>
            <label htmlFor="boss-class" className={labelClass}>Target Class</label>
            <select id="boss-class" value={form.classType} onChange={event => setForm(previous => ({ ...previous, classType: event.target.value, targetSections: [] }))} className={inputClass}>
              <option value="GLOBAL">All Classes</option>
              {classOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="boss-description" className={labelClass}>Description</label>
          <textarea id="boss-description" value={form.description} onChange={event => update('description', event.target.value)} className={`${inputClass} resize-none h-16`} />
        </div>

        <fieldset className="border border-[var(--border)] rounded-xl p-3 bg-[var(--panel-bg)]">
          <legend className="px-1 text-[11.5px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Boss Appearance</legend>
          <div className="flex items-start gap-3">
            <div className="w-16 h-20 border border-[var(--border)] rounded-lg flex items-center justify-center"><BossAvatar bossType={form.bossType} hue={form.bossHue} /></div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap gap-1">
                {(['BRUTE', 'PHANTOM', 'SERPENT', 'SKELETON', 'GOLEM', 'SLIME', 'ORC'] as BossType[]).map(type => (
                  <button key={type} type="button" aria-pressed={form.bossType === type} onClick={() => update('bossType', type)} className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${form.bossType === type ? 'bg-amber-600/20 border-amber-500/40 text-amber-600 dark:text-amber-400' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>{type}</button>
                ))}
              </div>
              <label htmlFor="boss-hue" className="text-[11.5px] text-[var(--text-muted)]">Hue: {form.bossHue} degrees</label>
              <input id="boss-hue" type="range" min="0" max="360" value={form.bossHue} onChange={event => update('bossHue', Number(event.target.value))} className="w-full" />
            </div>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['maxHp', 'Max HP'], ['damagePerCorrect', 'Dmg / Correct'],
            ['rewardXp', 'Reward XP'], ['rewardFlux', 'Reward Flux'],
          ] as const).map(([key, label]) => (
            <div key={key}><label htmlFor={key} className={labelClass}>{label}</label><input id={key} type="number" min="0" value={form[key]} onChange={event => update(key, Number(event.target.value))} className={inputClass} /></div>
          ))}
        </div>

        <SectionPicker availableSections={availableSections} selectedSections={form.targetSections} onChange={sections => update('targetSections', sections)} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label htmlFor="scheduled-at" className={labelClass}>Scheduled At</label><input id="scheduled-at" type="datetime-local" value={form.scheduledAt} onChange={event => update('scheduledAt', event.target.value)} className={inputClass} /></div>
          <div><label htmlFor="deadline" className={labelClass}>Deadline</label><input id="deadline" type="datetime-local" value={form.deadline} onChange={event => update('deadline', event.target.value)} className={inputClass} /></div>
          <div><label htmlFor="reward-rarity" className={labelClass}>Reward Item Rarity</label><select id="reward-rarity" value={form.rewardItemRarity} onChange={event => update('rewardItemRarity', event.target.value)} className={inputClass}><option value="">None</option><option value="UNCOMMON">Uncommon</option><option value="RARE">Rare</option><option value="UNIQUE">Unique</option></select></div>
        </div>

        {questionBanks.length > 0 && (
          <section className="border border-[var(--border)] rounded-xl p-3 bg-[var(--panel-bg)]">
            <h3 className="text-[11.5px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-2">Import from Question Banks</h3>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {questionBanks.filter(bank => bank.classType === form.classType || bank.classType === 'GLOBAL' || form.classType === 'GLOBAL').map(bank => (
                <div key={bank.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[var(--border)]">
                  <span className="text-xs font-bold">{bank.name} <span className="font-normal text-[var(--text-muted)]">({bank.questions.length})</span></span>
                  <button type="button" onClick={() => importBank(bank)} className="px-2 py-1 bg-purple-600/20 text-purple-600 dark:text-purple-400 rounded text-[11.5px] font-bold"><Plus className="w-3 h-3 inline" /> Import All</button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="border border-[var(--border)] rounded-xl p-3 bg-[var(--panel-bg)]">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-[11.5px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Questions ({form.questions.length})</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyPrompt()} className="text-xs px-3 py-1 rounded-lg font-bold bg-purple-600/20 text-purple-600 dark:text-purple-400">{promptCopied ? <Check className="w-3 h-3 inline" /> : <Copy className="w-3 h-3 inline" />} {promptCopied ? 'Copied!' : 'Copy AI Prompt'}</button>
              <label className="text-xs bg-blue-600/20 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-lg font-bold cursor-pointer"><Upload className="w-3 h-3 inline" /> Import JSON<input ref={fileRef} type="file" accept=".json,.txt" onChange={importQuestions} className="hidden" /></label>
              <button type="button" onClick={() => update('questions', [...form.questions, normalizeImportedQuestion({})])} className="text-xs bg-amber-600/20 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-lg font-bold"><Plus className="w-3 h-3 inline" /> Add Manual</button>
            </div>
          </div>
          {importError && <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2"><X className="w-4 h-4" />{importError}<button type="button" aria-label="Dismiss import error" onClick={() => setImportError(null)} className="ml-auto"><X className="w-3 h-3" /></button></div>}
          {form.questions.length === 0 && <div className="text-center py-6"><FileJson className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-30" /><p className="text-xs text-[var(--text-muted)]">No questions yet. Import JSON or add one manually.</p></div>}
          {form.questions.map((question, index) => (
            <fieldset key={question.id} className="rounded-xl border border-[var(--border)] p-4 mb-3 space-y-3">
              <legend className="px-1 text-[11.5px] text-[var(--text-muted)]">Question {index + 1}</legend>
              <div className="flex items-start gap-2">
                <textarea aria-label={`Question ${index + 1} text`} value={question.stem} onChange={event => updateQuestion(index, { stem: event.target.value })} required className={`${inputClass} resize-none h-16`} />
                <button type="button" aria-label={`Remove question ${index + 1}`} onClick={() => update('questions', form.questions.filter((_, i) => i !== index))} className="text-[var(--text-muted)] hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <button type="button" aria-label={`Mark option ${optionIndex + 1} correct for question ${index + 1}`} aria-pressed={question.correctAnswer === optionIndex} onClick={() => updateQuestion(index, { correctAnswer: optionIndex })} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${question.correctAnswer === optionIndex ? 'border-green-500 bg-green-500/20 text-green-600 dark:text-green-400' : 'border-gray-600 text-transparent'}`}><Check className="w-3 h-3" /></button>
                    <input aria-label={`Question ${index + 1} option ${optionIndex + 1}`} value={option} onChange={event => updateQuestion(index, { options: question.options.map((value, i) => i === optionIndex ? event.target.value : value) })} required className={inputClass} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[11.5px] text-[var(--text-muted)]">Difficulty <select value={question.difficulty} onChange={event => updateQuestion(index, { difficulty: event.target.value as BossQuizQuestion['difficulty'] })} className={inputClass}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
                <label className="text-[11.5px] text-[var(--text-muted)]">Bonus Damage <input type="number" min="0" value={question.damageBonus} onChange={event => updateQuestion(index, { damageBonus: Number(event.target.value) })} className={`${inputClass} w-24`} /></label>
              </div>
            </fieldset>
          ))}
        </section>

        <div className="flex gap-3 sticky bottom-0 bg-[var(--bg)]/80 backdrop-blur-md p-3 -mx-3 -mb-3 border-t border-[var(--border)]">
          {!editingQuizBoss && <button type="button" onClick={() => void save(true)} disabled={isSaving} className="flex-1 bg-[var(--surface-glass)] border border-[var(--border)] py-3 rounded-xl font-bold disabled:opacity-50">{isSaving ? 'Saving...' : 'Save Draft'}</button>}
          <button type="submit" disabled={isSaving} className="flex-[2] bg-amber-600 text-white font-bold py-3 rounded-xl hover:bg-amber-700 disabled:opacity-50">{isSaving ? 'Saving...' : editingQuizBoss ? 'Update Quiz Boss' : 'Deploy Quiz Boss'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default QuizBossFormModal;

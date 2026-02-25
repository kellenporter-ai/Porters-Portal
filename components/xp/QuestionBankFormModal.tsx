import React, { useState, useEffect, useRef } from 'react';
import { BossQuestionBank, DefaultClassTypes } from '../../types';
import { Plus, Trash2, Check, X, Upload, FileJson } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import Modal from '../Modal';

interface QuestionBankFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingBank: BossQuestionBank | null;
}

interface BankQuestion {
  id: string;
  stem: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  damageBonus: number;
}

interface BankFormState {
  name: string;
  classType: string;
  description: string;
  questions: BankQuestion[];
}

const emptyForm: BankFormState = {
  name: '',
  classType: 'GLOBAL',
  description: '',
  questions: [],
};

const QuestionBankFormModal: React.FC<QuestionBankFormModalProps> = ({ isOpen, onClose, editingBank }) => {
  const toast = useToast();
  const [bankForm, setBankForm] = useState<BankFormState>(emptyForm);
  const [bankImportError, setBankImportError] = useState<string | null>(null);
  const bankFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (editingBank) {
        setBankForm({
          name: editingBank.name,
          classType: editingBank.classType,
          description: editingBank.description || '',
          questions: editingBank.questions.map(q => ({ ...q, damageBonus: q.damageBonus || 0 })),
        });
      } else {
        setBankForm(emptyForm);
      }
      setBankImportError(null);
    }
  }, [isOpen, editingBank]);

  const handleImportBankQuestions = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBankImportError(null);
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
      const imported: BankQuestion[] = valid.map((q: Record<string, unknown>) => ({
        id: (q.id as string) || Math.random().toString(36).substring(2, 10),
        stem: q.stem as string,
        options: (q.options as string[]).slice(0, 4),
        correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
        difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty as string) ? q.difficulty : 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD',
        damageBonus: typeof q.damageBonus === 'number' ? q.damageBonus : 0,
      }));
      const skipped = parsed.length - valid.length;
      setBankForm(prev => ({ ...prev, questions: [...prev.questions, ...imported] }));
      toast.success(`Imported ${imported.length} questions${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
    } catch (err) {
      setBankImportError(err instanceof Error ? err.message : 'Import failed.');
      toast.error('Failed to import questions.');
    }
    if (bankFileRef.current) bankFileRef.current.value = '';
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bankForm.questions.length === 0) { toast.error('Add at least one question.'); return; }
    try {
      const now = new Date().toISOString();
      const bank: BossQuestionBank = {
        id: editingBank?.id || Math.random().toString(36).substring(2, 12),
        name: bankForm.name,
        classType: bankForm.classType,
        description: bankForm.description,
        questions: bankForm.questions.map(q => ({
          id: q.id, stem: q.stem, options: q.options.filter(o => o.trim()),
          correctAnswer: q.correctAnswer, difficulty: q.difficulty,
          ...(q.damageBonus > 0 ? { damageBonus: q.damageBonus } : {}),
        })),
        createdAt: editingBank?.createdAt || now,
        updatedAt: now,
      };
      await dataService.saveBossQuestionBank(bank);
      toast.success(editingBank ? 'Question bank updated.' : 'Question bank created!');
      onClose();
    } catch { toast.error('Failed to save question bank.'); }
  };

  const addQuestion = () => {
    setBankForm(prev => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          id: Math.random().toString(36).substring(2, 10),
          stem: '',
          options: ['', '', '', ''],
          correctAnswer: 0,
          difficulty: 'MEDIUM' as const,
          damageBonus: 0,
        },
      ],
    }));
  };

  const updateQuestionField = (qIdx: number, field: string, value: unknown) => {
    const qs = [...bankForm.questions];
    qs[qIdx] = { ...qs[qIdx], [field]: value };
    setBankForm({ ...bankForm, questions: qs });
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    const qs = [...bankForm.questions];
    const opts = [...qs[qIdx].options];
    opts[optIdx] = value;
    qs[qIdx] = { ...qs[qIdx], options: opts };
    setBankForm({ ...bankForm, questions: qs });
  };

  const removeQuestion = (qIdx: number) => {
    setBankForm(prev => ({ ...prev, questions: prev.questions.filter((_, i) => i !== qIdx) }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingBank ? 'Edit Question Bank' : 'New Question Bank'} maxWidth="max-w-2xl">
      <form onSubmit={handleSaveBank} className="space-y-4 text-gray-100 p-2 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Bank Name</label>
          <input value={bankForm.name} onChange={e => setBankForm({ ...bankForm, name: e.target.value })} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" placeholder="e.g. AP Physics Unit 3 Questions" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Class</label>
            <select value={bankForm.classType} onChange={e => setBankForm({ ...bankForm, classType: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold text-sm">
              <option value="GLOBAL">All Classes</option>
              {Object.values(DefaultClassTypes).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Description</label>
            <input value={bankForm.description} onChange={e => setBankForm({ ...bankForm, description: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm" placeholder="Optional description" />
          </div>
        </div>

        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <label className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Questions ({bankForm.questions.length})</label>
            <div className="flex items-center gap-2">
              <label className="text-xs bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg hover:bg-blue-600/30 transition font-bold flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" /> Import JSON
                <input ref={bankFileRef} type="file" accept=".json,.txt" onChange={handleImportBankQuestions} className="hidden" />
              </label>
              <button type="button" onClick={addQuestion} className="text-xs bg-purple-600/20 text-purple-400 px-3 py-1 rounded-lg hover:bg-purple-600/30 transition font-bold flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Manual
              </button>
            </div>
          </div>

          {bankImportError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400 flex items-center gap-2 mb-3">
              <X className="w-4 h-4 flex-shrink-0" /> {bankImportError}
              <button type="button" onClick={() => setBankImportError(null)} className="ml-auto text-red-500 hover:text-red-300"><X className="w-3 h-3" /></button>
            </div>
          )}

          {bankForm.questions.length === 0 && (
            <div className="text-center py-6">
              <FileJson className="w-8 h-8 mx-auto text-gray-600 opacity-30" />
              <p className="text-xs text-gray-600 mt-2">No questions yet. Import JSON or add manually.</p>
            </div>
          )}

          {bankForm.questions.map((q, qIdx) => (
            <div key={q.id} className="bg-black/30 rounded-xl border border-white/5 p-3 mb-2 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <textarea value={q.stem} onChange={e => updateQuestionField(qIdx, 'stem', e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-xs resize-none h-12" placeholder={`Question #${qIdx + 1}`} required />
                </div>
                <button type="button" onClick={() => removeQuestion(qIdx)} className="text-gray-600 hover:text-red-400 mt-2"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-1.5">
                    <button type="button" onClick={() => updateQuestionField(qIdx, 'correctAnswer', optIdx)}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${q.correctAnswer === optIdx ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-gray-600 text-transparent hover:border-gray-400'}`}>
                      <Check className="w-2.5 h-2.5" />
                    </button>
                    <input value={opt} onChange={e => updateOption(qIdx, optIdx, e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg p-1 text-white text-[11px]" placeholder={`Option ${String.fromCharCode(65 + optIdx)}`} required />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <select value={q.difficulty} onChange={e => updateQuestionField(qIdx, 'difficulty', e.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                  className="bg-black/40 border border-white/10 rounded-lg p-1 text-white text-[10px] font-bold">
                  <option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
                </select>
                <div className="flex items-center gap-1">
                  <label className="text-[9px] text-gray-500">Bonus:</label>
                  <input type="number" value={q.damageBonus} onChange={e => updateQuestionField(qIdx, 'damageBonus', parseInt(e.target.value) || 0)}
                    className="w-14 bg-black/40 border border-white/10 rounded p-1 text-white text-[10px] font-bold" min={0} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button type="submit" className="w-full bg-purple-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:bg-purple-700">
          {editingBank ? 'Update Question Bank' : 'Create Question Bank'}
        </button>
      </form>
    </Modal>
  );
};

export default QuestionBankFormModal;

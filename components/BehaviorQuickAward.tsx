
import React, { useState, useMemo, useRef } from 'react';
import { User, BehaviorCategory, DEFAULT_BEHAVIOR_CATEGORIES } from '../types';
import { Award, Search, X, Zap, Users } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useToast } from './ToastProvider';

const COLOR_MAP: Record<string, { bg: string; border: string; hoverBorder: string; hoverBg: string }> = {
  blue:   { bg: 'bg-blue-500/5',   border: 'border-blue-500/20',   hoverBorder: 'hover:border-blue-500/40',   hoverBg: 'hover:bg-blue-500/10' },
  green:  { bg: 'bg-green-500/5',  border: 'border-green-500/20',  hoverBorder: 'hover:border-green-500/40',  hoverBg: 'hover:bg-green-500/10' },
  amber:  { bg: 'bg-amber-500/5',  border: 'border-amber-500/20',  hoverBorder: 'hover:border-amber-500/40',  hoverBg: 'hover:bg-amber-500/10' },
  purple: { bg: 'bg-purple-500/5', border: 'border-purple-500/20', hoverBorder: 'hover:border-purple-500/40', hoverBg: 'hover:bg-purple-500/10' },
  pink:   { bg: 'bg-pink-500/5',   border: 'border-pink-500/20',   hoverBorder: 'hover:border-pink-500/40',   hoverBg: 'hover:bg-pink-500/10' },
  orange: { bg: 'bg-orange-500/5', border: 'border-orange-500/20', hoverBorder: 'hover:border-orange-500/40', hoverBg: 'hover:bg-orange-500/10' },
};

interface BehaviorQuickAwardProps {
  students: User[];
  isOpen: boolean;
  onClose: () => void;
}

const BehaviorQuickAward: React.FC<BehaviorQuickAwardProps> = ({ students, isOpen, onClose }) => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<User[]>([]);
  const [awarding, setAwarding] = useState(false);
  const categories = DEFAULT_BEHAVIOR_CATEGORIES;

  const filtered = useMemo(() => {
    if (!search) return students.slice(0, 20);
    return students.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20);
  }, [students, search]);

  const toggleStudent = (student: User) => {
    setSelectedStudents(prev => {
      if (prev.some(s => s.id === student.id)) return prev.filter(s => s.id !== student.id);
      return [...prev, student];
    });
  };

  const isSelected = (id: string) => selectedStudents.some(s => s.id === id);

  const lastAwardRef = useRef(0);
  const handleAward = async (cat: BehaviorCategory) => {
    if (selectedStudents.length === 0) return;
    const now = Date.now();
    if (now - lastAwardRef.current < 1500) return;
    lastAwardRef.current = now;

    setAwarding(true);
    try {
      const results = await Promise.allSettled(
        selectedStudents.map(student =>
          dataService.awardBehavior({
            studentId: student.id,
            studentName: student.name,
            categoryId: cat.id,
            categoryName: cat.name,
            xpAmount: cat.xpAmount,
            fluxAmount: cat.fluxAmount,
            classType: student.classType || 'AP Physics',
            awardedBy: 'admin',
            timestamp: new Date().toISOString(),
          })
        )
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      if (succeeded > 0) {
        toast.success(`${cat.icon} +${cat.xpAmount} XP awarded to ${succeeded} student${succeeded !== 1 ? 's' : ''} for ${cat.name}!`);
      }
      if (failed > 0) {
        toast.error(`Failed to award ${failed} student${failed !== 1 ? 's' : ''}.`);
      }
      setSelectedStudents([]);
      setSearch('');
    } catch {
      toast.error('Failed to award.');
    } finally {
      setAwarding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[var(--backdrop)] backdrop-blur-sm" />
      <div className="relative bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" /> Quick Award
          </h3>
          <button onClick={onClose} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {selectedStudents.length === 0 ? (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search students... (select one or more)"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl py-3 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-amber-500/50 transition"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                {filtered.map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggleStudent(s)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition group ${isSelected(s.id) ? 'bg-amber-500/10 border border-amber-500/30' : 'hover:bg-[var(--surface-glass)] border border-transparent'}`}
                  >
                    {s.avatarUrl ? (
                      <img src={s.avatarUrl} alt="" loading="lazy" className="w-8 h-8 rounded-full border border-[var(--border)] object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-400">{s.name.charAt(0)}</div>
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-amber-300 transition">{s.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{s.classType}</div>
                    </div>
                    {isSelected(s.id) && <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center"><X className="w-3 h-3 text-white" /></div>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mb-5 p-3 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">{selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''} selected</span>
                  </div>
                  <button onClick={() => setSelectedStudents([])} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">Change</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStudents.map(s => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg text-[10px] font-bold text-purple-300">
                      {s.avatarUrl && <img src={s.avatarUrl} alt="" className="w-4 h-4 rounded-full" />}
                      {s.name}
                      <button onClick={() => toggleStudent(s)} className="text-[var(--text-muted)] hover:text-red-400 transition"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">Select Behavior</p>
              <div className="grid grid-cols-2 gap-2">
                {categories.map(cat => {
                  const colors = COLOR_MAP[cat.color] || COLOR_MAP.blue;
                  return (
                  <button
                    key={cat.id}
                    onClick={() => handleAward(cat)}
                    disabled={awarding}
                    className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 ${colors.bg} ${colors.border} ${colors.hoverBorder} ${colors.hoverBg}`}
                  >
                    <div className="text-2xl mb-1">{cat.icon}</div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">{cat.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-purple-400 font-bold flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{cat.xpAmount} XP</span>
                      <span className="text-[10px] text-cyan-400 font-bold">+{cat.fluxAmount} Flux</span>
                    </div>
                  </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BehaviorQuickAward;

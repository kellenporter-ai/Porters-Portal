
import React, { useState, useMemo } from 'react';
import { User, BehaviorCategory, DEFAULT_BEHAVIOR_CATEGORIES } from '../types';
import { Award, Search, X, Zap } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useToast } from './ToastProvider';

interface BehaviorQuickAwardProps {
  students: User[];
  isOpen: boolean;
  onClose: () => void;
}

const BehaviorQuickAward: React.FC<BehaviorQuickAwardProps> = ({ students, isOpen, onClose }) => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [awarding, setAwarding] = useState(false);
  const categories = DEFAULT_BEHAVIOR_CATEGORIES;

  const filtered = useMemo(() => {
    if (!search) return students.slice(0, 20);
    return students.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20);
  }, [students, search]);

  const handleAward = async (cat: BehaviorCategory) => {
    if (!selectedStudent) return;
    setAwarding(true);
    try {
      await dataService.awardBehavior({
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        categoryId: cat.id,
        categoryName: cat.name,
        xpAmount: cat.xpAmount,
        fluxAmount: cat.fluxAmount,
        classType: selectedStudent.classType || 'AP Physics',
        awardedBy: 'admin',
        timestamp: new Date().toISOString(),
      });
      toast.success(`${cat.icon} +${cat.xpAmount} XP awarded to ${selectedStudent.name} for ${cat.name}!`);
      setSelectedStudent(null);
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#1a1b26] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" /> Quick Award
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {!selectedStudent ? (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search for a student..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 transition"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                {filtered.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStudent(s)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-white/5 transition group"
                  >
                    {s.avatarUrl ? (
                      <img src={s.avatarUrl} alt="" className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-400">{s.name.charAt(0)}</div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-white group-hover:text-amber-300 transition">{s.name}</div>
                      <div className="text-[10px] text-gray-500">{s.classType}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5 p-3 bg-white/5 border border-white/10 rounded-xl">
                {selectedStudent.avatarUrl ? (
                  <img src={selectedStudent.avatarUrl} alt="" className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-sm font-bold text-purple-400">{selectedStudent.name.charAt(0)}</div>
                )}
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">{selectedStudent.name}</div>
                  <div className="text-[10px] text-gray-500">{selectedStudent.classType}</div>
                </div>
                <button onClick={() => setSelectedStudent(null)} className="text-xs text-gray-500 hover:text-white transition">Change</button>
              </div>

              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-3">Select Behavior</p>
              <div className="grid grid-cols-2 gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleAward(cat)}
                    disabled={awarding}
                    className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 bg-${cat.color}-500/5 border-${cat.color}-500/20 hover:border-${cat.color}-500/40 hover:bg-${cat.color}-500/10`}
                  >
                    <div className="text-2xl mb-1">{cat.icon}</div>
                    <div className="text-sm font-bold text-white">{cat.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-purple-400 font-bold flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{cat.xpAmount} XP</span>
                      <span className="text-[10px] text-cyan-400 font-bold">+{cat.fluxAmount} Flux</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BehaviorQuickAward;

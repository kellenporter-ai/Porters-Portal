import React, { useState, useMemo } from 'react';
import { User } from '../../types';
import { useAppData } from '../../lib/AppDataContext';
import { Search, ChevronDown, Filter, Users } from 'lucide-react';
import Modal from '../Modal';
import { useToast } from '../ToastProvider';

interface AdjustXPModalProps {
    user: User | null;
    onClose: () => void;
    onAdjust: (user: User, amount: number) => void;
    /** When provided, enables bulk mode toggle with access to full student list */
    allStudents?: User[];
}

const QUICK_AMOUNTS = [+10, +50, +100, -10, -50, -100];

const AdjustXPModal: React.FC<AdjustXPModalProps> = ({ user, onClose, onAdjust, allStudents }) => {
    const toast = useToast();
    const { classConfigs } = useAppData();
    const classOptions = classConfigs.length > 0 ? classConfigs.map(c => c.className) : ['AP Physics', 'Honors Physics', 'Forensic Science'];
    const [adjustAmount, setAdjustAmount] = useState(50);
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkSearch, setBulkSearch] = useState('');
    const [bulkFilterClass, setBulkFilterClass] = useState('All Classes');
    const [applying, setApplying] = useState(false);

    const filteredStudents = useMemo(() => {
        if (!allStudents) return [];
        return allStudents.filter(s => {
            const matchesSearch = !bulkSearch || s.name.toLowerCase().includes(bulkSearch.toLowerCase());
            const matchesClass = bulkFilterClass === 'All Classes' || s.classType === bulkFilterClass || s.enrolledClasses?.includes(bulkFilterClass);
            return matchesSearch && matchesClass;
        });
    }, [allStudents, bulkSearch, bulkFilterClass]);

    const toggleStudent = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(filteredStudents.map(s => s.id)));
    };

    const selectNone = () => setSelectedIds(new Set());

    const handleApplySingle = () => {
        if (!user) return;
        onAdjust(user, adjustAmount);
        setAdjustAmount(50);
    };

    const handleApplyBulk = async () => {
        if (!allStudents || selectedIds.size === 0) return;
        setApplying(true);
        const targets = allStudents.filter(s => selectedIds.has(s.id));
        const results = await Promise.allSettled(
            targets.map(student => Promise.resolve(onAdjust(student, adjustAmount)))
        );
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            toast.error(`${failures.length} of ${targets.length} adjustments failed.`);
        }
        setApplying(false);
        setSelectedIds(new Set());
        setBulkMode(false);
        onClose();
    };

    if (!user && !bulkMode) return null;
    if (bulkMode && !allStudents) return null;

    return (
        <Modal isOpen={!!user || bulkMode} onClose={() => { setBulkMode(false); onClose(); }} title={bulkMode ? "Bulk XP Adjustment" : "Manual XP Adjustment"} maxWidth={bulkMode ? "max-w-2xl" : undefined}>
            <div className="space-y-6">
                {/* Mode toggle */}
                {allStudents && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setBulkMode(false)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${!bulkMode ? 'bg-purple-600 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                        >
                            Single Operative
                        </button>
                        <button
                            onClick={() => setBulkMode(true)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition border flex items-center justify-center gap-1.5 ${bulkMode ? 'bg-purple-600 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                        >
                            <Users className="w-3.5 h-3.5" /> Bulk Award
                        </button>
                    </div>
                )}

                {/* Single user header */}
                {!bulkMode && user && (
                    <div className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                        <img src={user.avatarUrl} className="w-14 h-14 rounded-2xl border border-white/10" alt={user.name} loading="lazy" />
                        <div>
                            <h3 className="font-bold text-white text-lg">{user.name}</h3>
                            <p className="text-xs text-gray-500">{user.email}</p>
                            <div className="text-[10px] font-black text-purple-400 mt-1 uppercase tracking-tighter">Current: {user.gamification?.xp || 0} XP</div>
                        </div>
                    </div>
                )}

                {/* Bulk selection */}
                {bulkMode && allStudents && (
                    <div className="space-y-3">
                        <div className="flex gap-2 items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search students..."
                                    value={bulkSearch}
                                    onChange={e => setBulkSearch(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                />
                            </div>
                            <div className="relative">
                                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                <select
                                    value={bulkFilterClass}
                                    onChange={e => setBulkFilterClass(e.target.value)}
                                    className="bg-black/40 border border-white/10 rounded-xl py-2 pl-8 pr-8 text-sm text-white font-bold appearance-none focus:outline-none focus:border-purple-500/50"
                                >
                                    <option>All Classes</option>
                                    {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{selectedIds.size} selected</span>
                            <div className="flex gap-2">
                                <button onClick={selectAll} className="text-[10px] text-purple-400 hover:text-purple-300 font-bold transition">Select All ({filteredStudents.length})</button>
                                <button onClick={selectNone} className="text-[10px] text-gray-500 hover:text-gray-300 font-bold transition">Clear</button>
                            </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 border border-white/5 rounded-xl p-2 bg-black/20">
                            {filteredStudents.map(s => (
                                <label key={s.id} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg cursor-pointer transition ${selectedIds.has(s.id) ? 'bg-purple-500/10 border border-purple-500/20' : 'hover:bg-white/5 border border-transparent'}`}>
                                    <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleStudent(s.id)} className="rounded bg-black/40 border-white/10 text-purple-600" />
                                    <img src={s.avatarUrl} className="w-7 h-7 rounded-lg border border-white/10" alt={s.name} loading="lazy" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-white truncate">{s.name}</div>
                                        <div className="text-[10px] text-gray-500">{s.classType} — {s.gamification?.xp || 0} XP</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* Quick amounts */}
                <div className="grid grid-cols-3 gap-2">
                    {QUICK_AMOUNTS.map(val => (
                        <button
                            key={val}
                            onClick={() => setAdjustAmount(val)}
                            className={`py-3 rounded-xl font-black transition-all border ${
                                adjustAmount === val
                                ? (val > 0 ? 'bg-green-600 border-green-500 text-white' : 'bg-red-600 border-red-500 text-white')
                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            {val > 0 ? `+${val}` : val}
                        </button>
                    ))}
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">Precise Adjustment</label>
                    <input
                        type="number"
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-4 text-center text-2xl font-black text-white focus:outline-none focus:border-purple-500/50"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)}
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => { setBulkMode(false); onClose(); }}
                        className="flex-1 py-4 bg-white/5 border border-white/10 text-gray-400 font-bold rounded-2xl hover:bg-white/10 transition"
                    >
                        Cancel
                    </button>
                    {bulkMode ? (
                        <button
                            onClick={handleApplyBulk}
                            disabled={selectedIds.size === 0 || applying}
                            className="flex-1 py-4 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-500 transition shadow-xl shadow-purple-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Users className="w-4 h-4" />
                            {applying ? 'Applying...' : `Apply to ${selectedIds.size} Operative${selectedIds.size !== 1 ? 's' : ''}`}
                        </button>
                    ) : (
                        <button
                            onClick={handleApplySingle}
                            className="flex-1 py-4 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-500 transition shadow-xl shadow-purple-900/20"
                        >
                            Apply Protocol
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default AdjustXPModal;

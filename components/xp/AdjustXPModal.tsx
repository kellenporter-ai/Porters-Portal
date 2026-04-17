import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User } from '../../types';
import { useClassConfig } from '../../lib/AppDataContext';
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
    const { classConfigs } = useClassConfig();
    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);
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
        if (!mountedRef.current) return;
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
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${!bulkMode ? 'bg-purple-600 border-purple-500 text-white' : 'bg-[var(--surface-glass)] border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'}`}
                        >
                            Single Operative
                        </button>
                        <button
                            onClick={() => setBulkMode(true)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition border flex items-center justify-center gap-1.5 ${bulkMode ? 'bg-purple-600 border-purple-500 text-white' : 'bg-[var(--surface-glass)] border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'}`}
                        >
                            <Users className="w-3.5 h-3.5" /> Bulk Award
                        </button>
                    </div>
                )}

                {/* Single user header */}
                {!bulkMode && user && (
                    <div className="flex items-center gap-4 bg-[var(--panel-bg)] p-4 rounded-2xl border border-[var(--border)]">
                        <img src={user.avatarUrl} className="w-14 h-14 rounded-2xl border border-[var(--border)]" alt={user.name} loading="lazy" />
                        <div>
                            <h3 className="font-bold text-[var(--text-primary)] text-lg">{user.name}</h3>
                            <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
                            <div className="text-[11.5px] font-black text-[var(--accent-text)] mt-1 uppercase tracking-tighter">Current: {user.gamification?.xp || 0} XP</div>
                        </div>
                    </div>
                )}

                {/* Bulk selection */}
                {bulkMode && allStudents && (
                    <div className="space-y-3">
                        <div className="flex gap-2 items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    placeholder="Search students..."
                                    aria-label="Search students"
                                    value={bulkSearch}
                                    onChange={e => setBulkSearch(e.target.value)}
                                    className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50"
                                />
                            </div>
                            <div className="relative">
                                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)]" />
                                <select
                                    value={bulkFilterClass}
                                    onChange={e => setBulkFilterClass(e.target.value)}
                                    className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl py-2 pl-8 pr-8 text-sm text-[var(--text-primary)] font-bold appearance-none focus:outline-none focus:border-purple-500/50"
                                >
                                    <option>All Classes</option>
                                    {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[11.5px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{selectedIds.size} selected</span>
                            <div className="flex gap-2">
                                <button onClick={selectAll} className="text-[11.5px] text-[var(--accent-text)] hover:text-purple-300 font-bold transition">Select All ({filteredStudents.length})</button>
                                <button onClick={selectNone} className="text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] font-bold transition">Clear</button>
                            </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 border border-[var(--border)] rounded-xl p-2 bg-[var(--panel-bg)]">
                            {filteredStudents.map(s => (
                                <label key={s.id} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg cursor-pointer transition ${selectedIds.has(s.id) ? 'bg-purple-500/10 border border-purple-500/20' : 'hover:bg-[var(--surface-glass)] border border-transparent'}`}>
                                    <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleStudent(s.id)} className="rounded bg-[var(--panel-bg)] border-[var(--border)] text-purple-600" />
                                    <img src={s.avatarUrl} className="w-7 h-7 rounded-lg border border-[var(--border)]" alt={s.name} loading="lazy" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-[var(--text-primary)] truncate">{s.name}</div>
                                        <div className="text-[11.5px] text-[var(--text-muted)]">{s.classType} — {s.gamification?.xp || 0} XP</div>
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
                                : 'bg-[var(--surface-glass)] border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)]'
                            }`}
                        >
                            {val > 0 ? `+${val}` : val}
                        </button>
                    ))}
                </div>

                <div className="space-y-2">
                    <label className="text-[11.5px] font-bold text-[var(--text-muted)] uppercase tracking-widest px-1">Precise Adjustment</label>
                    <input
                        type="number"
                        className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl py-4 px-4 text-center text-2xl font-black text-[var(--text-primary)] focus:outline-none focus:border-purple-500/50"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)}
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => { setBulkMode(false); onClose(); }}
                        className="flex-1 py-4 bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-tertiary)] font-bold rounded-2xl hover:bg-[var(--surface-glass-heavy)] transition"
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

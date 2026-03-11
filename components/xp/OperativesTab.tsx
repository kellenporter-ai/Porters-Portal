import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User } from '../../types';
import { useClassConfig } from '../../lib/AppDataContext';
import { Search, Plus, ChevronDown, ChevronUp, Filter, Briefcase, Pencil, Check, X, Lock, Unlock } from 'lucide-react';
import { calculateGearScore } from '../../lib/gamification';

interface OperativesTabProps {
  students: User[];
  onAdjustXP: (user: User) => void;
  onInspect: (user: User) => void;
  onSaveCodename: (userId: string, codename: string) => void;
  onSaveCodenameLocked: (userId: string, locked: boolean) => void;
}

const OperativesTab: React.FC<OperativesTabProps> = ({
  students,
  onAdjustXP,
  onInspect,
  onSaveCodename,
  onSaveCodenameLocked,
}) => {
  const { classConfigs } = useClassConfig();
  const classOptions = classConfigs.length > 0 ? classConfigs.map(c => c.className) : ['AP Physics', 'Honors Physics', 'Forensic Science'];
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('All Classes');
  const [filterSection, setFilterSection] = useState('All Sections');
  const [sortCol, setSortCol] = useState<string>('xp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editingCodename, setEditingCodename] = useState<string | null>(null);
  const [codenameValue, setCodenameValue] = useState('');

  const handleOperativesSort = useCallback((col: string) => {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir('asc');
      return col;
    });
  }, []);

  const OpSortHeader = ({ label, col, className }: { label: string; col: string; className?: string }) => (
    <th className={`cursor-pointer select-none group pb-4 ${className ?? ''}`} onClick={() => handleOperativesSort(col)}>
      <div className={`flex items-center gap-1 ${className?.includes('text-center') ? 'justify-center' : className?.includes('text-right') ? 'justify-end' : 'justify-start'}`}>
        <span>{label}</span>
        <span className="flex flex-col gap-px">
          <ChevronUp  className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === col && sortDir === 'asc'  ? 'text-purple-400' : 'text-gray-600 group-hover:text-gray-400'} transition`} />
          <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === col && sortDir === 'desc' ? 'text-purple-400' : 'text-gray-600 group-hover:text-gray-400'} transition`} />
        </span>
      </div>
    </th>
  );

  const getAggregateGearScore = (student: User): number => {
    const profiles = student.gamification?.classProfiles;
    if (profiles && Object.keys(profiles).length > 0) {
      return Object.values(profiles).reduce((sum, p) => sum + calculateGearScore(p.equipped), 0);
    }
    return calculateGearScore(student.gamification?.equipped);
  };

  const availableSections = useMemo(() => {
    const sections = new Set<string>();
    students.forEach(s => {
      if (s.classSections) Object.values(s.classSections).forEach(v => { if (v) sections.add(v); });
      else if (s.section) sections.add(s.section);
    });
    return Array.from(sections).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = filterClass === 'All Classes' || s.classType === filterClass || s.enrolledClasses?.includes(filterClass);
        const studentSections = s.classSections ? Object.values(s.classSections) : [];
        const matchesSection = filterSection === 'All Sections' || s.section === filterSection || studentSections.includes(filterSection);
        return matchesSearch && matchesClass && matchesSection;
      })
      .sort((a, b) => {
        switch (sortCol) {
          case 'name':  return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
          case 'class': return sortDir === 'asc' ? (a.classType || '').localeCompare(b.classType || '') : (b.classType || '').localeCompare(a.classType || '');
          case 'level': { const av = a.gamification?.level || 1; const bv = b.gamification?.level || 1; return sortDir === 'asc' ? av - bv : bv - av; }
          case 'flux':  { const av = a.gamification?.currency || 0; const bv = b.gamification?.currency || 0; return sortDir === 'asc' ? av - bv : bv - av; }
          case 'gear':  { const av = getAggregateGearScore(a); const bv = getAggregateGearScore(b); return sortDir === 'asc' ? av - bv : bv - av; }
          case 'xp': default: {
            const av = filterClass !== 'All Classes' ? (a.gamification?.classXp?.[filterClass] || 0) : (a.gamification?.xp || 0);
            const bv = filterClass !== 'All Classes' ? (b.gamification?.classXp?.[filterClass] || 0) : (b.gamification?.xp || 0);
            return sortDir === 'asc' ? av - bv : bv - av;
          }
        }
      });
  }, [students, searchTerm, filterClass, filterSection, sortCol, sortDir]);

  const handleSaveCodename = (userId: string) => {
    onSaveCodename(userId, codenameValue.trim().slice(0, 24));
    setEditingCodename(null);
  };

  const handleToggleCodenameLocked = (userId: string, currentLocked: boolean) => {
    onSaveCodenameLocked(userId, !currentLocked);
  };

  const listParentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredStudents.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 56,
    overscan: 10,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-purple-500/50 transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">
            {filteredStudents.length} operatives
          </span>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white text-sm font-bold appearance-none focus:outline-none focus:border-purple-500/50"
            >
              <option>All Classes</option>
              {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
          {availableSections.length > 0 && (
            <div className="relative">
              <select
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-bold appearance-none focus:outline-none focus:border-purple-500/50"
              >
                <option>All Sections</option>
                {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        {/* Fixed header */}
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-white/5">
              <OpSortHeader label="Operative" col="name" className="pl-4" />
              <OpSortHeader label="Class" col="class" />
              <OpSortHeader label="Level" col="level" className="text-center" />
              <OpSortHeader label={filterClass !== 'All Classes' ? "Class XP" : "XP"} col="xp" className="text-center" />
              <OpSortHeader label="Flux" col="flux" className="text-center" />
              <OpSortHeader label="Gear" col="gear" className="text-center" />
              <th className="pb-4 text-right pr-4">Actions</th>
            </tr>
          </thead>
        </table>
        {/* Virtualized rows */}
        <div ref={listParentRef} className="max-h-[600px] overflow-auto">
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const student = filteredStudents[virtualRow.index];
              const level = student.gamification?.level || 1;
              const flux = student.gamification?.currency || 0;
              const classes = student.enrolledClasses || (student.classType ? [student.classType] : []);
              return (
                <div
                  key={student.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute top-0 left-0 w-full flex items-center hover:bg-white/5 transition-colors border-b border-white/5"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div className="flex-[2] py-3 pl-4">
                    <div className="flex items-center gap-3">
                      <img src={student.avatarUrl} className="w-9 h-9 rounded-lg border border-white/10" alt={student.name} loading="lazy" />
                      <div>
                        <div className="font-bold text-sm text-gray-200">{student.name}</div>
                        {editingCodename === student.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={codenameValue}
                              onChange={e => setCodenameValue(e.target.value)}
                              maxLength={24}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveCodename(student.id);
                                if (e.key === 'Escape') setEditingCodename(null);
                              }}
                              className="bg-black/60 border border-purple-500/30 rounded px-1.5 py-0.5 text-[10px] text-white font-mono w-28 focus:outline-none focus:border-purple-500"
                            />
                            <button onClick={() => handleSaveCodename(student.id)} className="text-green-400 hover:text-green-300" title="Save">
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setEditingCodename(null)} className="text-gray-500 hover:text-gray-300" title="Cancel">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingCodename(student.id); setCodenameValue(student.gamification?.codename || ''); }}
                              className="text-[10px] font-mono text-gray-500 uppercase hover:text-purple-400 transition flex items-center gap-1 group/cn"
                            >
                              {student.gamification?.codename || 'UNASSIGNED'}
                              <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/cn:opacity-100 transition" />
                            </button>
                            <button
                              onClick={() => handleToggleCodenameLocked(student.id, !!student.gamification?.codenameLocked)}
                              className={`transition ${student.gamification?.codenameLocked ? 'text-red-400 hover:text-red-300' : 'text-gray-600 hover:text-gray-400'}`}
                              title={student.gamification?.codenameLocked ? 'Codename locked — click to unlock' : 'Click to lock codename'}
                            >
                              {student.gamification?.codenameLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 py-3">
                    <div className="flex flex-wrap gap-1">
                      {classes.map(c => (
                        <span key={c} className="text-[9px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20 font-bold">{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className="w-16 py-3 text-center">
                    <span className="text-lg font-black text-white">{level}</span>
                  </div>
                  <div className="w-20 py-3 text-center">
                    <span className="text-sm font-bold text-gray-300">
                      {(filterClass !== 'All Classes' ? (student.gamification?.classXp?.[filterClass] || 0) : (student.gamification?.xp || 0)).toLocaleString()}
                    </span>
                  </div>
                  <div className="w-16 py-3 text-center">
                    <span className="text-sm font-bold text-cyan-400">{flux}</span>
                  </div>
                  <div className="w-16 py-3 text-center">
                    <span className="text-sm font-bold text-yellow-400">{getAggregateGearScore(student)}</span>
                  </div>
                  <div className="w-40 py-3 text-right pr-4">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => onInspect(student)}
                        className="px-2.5 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                      >
                        <Briefcase className="w-3 h-3" /> Inventory
                      </button>
                      <button
                        onClick={() => onAdjustXP(student)}
                        className="px-2.5 py-1.5 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition border border-green-500/20 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> XP
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperativesTab;

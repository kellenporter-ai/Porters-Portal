
import React, { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { User, ClassType, DefaultClassTypes, ClassConfig, WhitelistedUser, getUserSectionForClass } from '../types';
import { ChevronDown, ChevronUp, CheckSquare, Square, Trash2, UserPlus, UserX, Settings, Loader2, Plus, X, Mail, ShieldCheck, ShieldAlert, HelpCircle, Upload, FileText, AlertTriangle, Zap } from 'lucide-react';
import Modal from './Modal';
import { dataService } from '../services/dataService';
import { reportError } from '../lib/errorReporting';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import BehaviorQuickAward from './BehaviorQuickAward';

interface UserManagementProps {
  users: User[];
  whitelistedEmails: WhitelistedUser[];
  classConfigs: ClassConfig[];
  onWhitelist: (email: string, classType: ClassType) => void;
}

interface VirtualizedStudentRowsProps {
  classStudents: User[];
  isUncategorized: boolean;
  selectedUsers: Set<string>;
  toggleUser: (id: string) => void;
  editingSectionId: string | null;
  setEditingSectionId: (id: string | null) => void;
  sectionInput: string;
  setSectionInput: (v: string) => void;
  customSectionInput: string;
  setCustomSectionInput: (v: string) => void;
  knownSections: string[];
  handleSetSection: (studentId: string, section: string, classType?: string) => void;
  handleRemoveSingleUserFromClass: (user: User, classType: string) => void;
  handleDeleteUser: (userId: string, name: string) => void;
  classType: string;
}

const VirtualizedStudentRowsInner: React.FC<VirtualizedStudentRowsProps> = ({
  classStudents, isUncategorized, selectedUsers, toggleUser,
  editingSectionId, setEditingSectionId, sectionInput, setSectionInput,
  customSectionInput, setCustomSectionInput, knownSections, handleSetSection,
  handleRemoveSingleUserFromClass, handleDeleteUser, classType,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: classStudents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  if (classStudents.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--text-muted)] italic text-sm">
        {isUncategorized ? "No restricted operatives found." : "No students registered in this roster yet."}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="max-h-[480px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const student = classStudents[virtualRow.index];
          return (
            <div
              key={student.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={`flex items-center hover:bg-[var(--surface-glass)] transition group border-b border-[var(--border)] absolute top-0 left-0 w-full ${selectedUsers.has(student.id) ? 'bg-purple-500/10' : ''}`}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="p-4 text-center w-12 shrink-0">
                <button onClick={() => toggleUser(student.id)} className="text-[var(--text-muted)] hover:text-purple-400 transition" aria-label={selectedUsers.has(student.id) ? 'Deselect student' : 'Select student'}>
                  {selectedUsers.has(student.id) ? (
                    <CheckSquare className="w-4 h-4 text-purple-500" />
                  ) : (
                    <Square className="w-4 h-4 group-hover:text-[var(--text-tertiary)]" />
                  )}
                </button>
              </div>
              <div className="p-4 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <img src={student.avatarUrl} alt={student.name} loading="lazy" className="w-8 h-8 rounded-full border border-[var(--border)]" />
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--text-secondary)] text-sm truncate">{student.name}</div>
                    <div className="text-[11.5px] text-[var(--text-muted)] font-mono truncate">{student.email}</div>
                  </div>
                </div>
              </div>
              <div className="p-4 text-center w-36 shrink-0">
                {editingSectionId === student.id ? (
                  <div className="flex flex-col items-center gap-2">
                    {(student.enrolledClasses?.length ? student.enrolledClasses : [student.classType].filter(Boolean)).map(cls => {
                      if (!cls) return null;
                      const currentSec = student.classSections?.[cls] || (student.section && (student.classType === cls) ? student.section : '');
                      return (
                        <div key={cls} className="flex items-center gap-1.5 text-[11.5px]">
                          <span className="text-[var(--text-muted)] font-mono whitespace-nowrap text-[11.5px]" title={cls}>{cls}</span>
                          <select
                            value={currentSec}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '__custom__') { setSectionInput('__custom__'); setCustomSectionInput(''); }
                              else handleSetSection(student.id, val, cls);
                            }}
                            className="bg-[var(--panel-bg)] border border-purple-500/50 rounded-lg px-1.5 py-1 text-[11px] text-[var(--text-primary)] font-bold focus:outline-none min-w-[100px]"
                          >
                            <option value="">None</option>
                            {knownSections.map(s => <option key={s} value={s}>{s}</option>)}
                            <option value="__custom__">+ New</option>
                          </select>
                        </div>
                      );
                    })}
                    {sectionInput === '__custom__' && (
                      <div className="flex gap-1">
                        <input
                          value={customSectionInput}
                          onChange={e => setCustomSectionInput(e.target.value)}
                          placeholder="e.g. Period 2"
                          className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)] w-24 focus:outline-none focus:border-purple-500/50"
                          onKeyDown={e => { if (e.key === 'Enter' && customSectionInput.trim()) { const classes = student.enrolledClasses?.length ? student.enrolledClasses : [student.classType].filter(Boolean); if (classes[0]) handleSetSection(student.id, customSectionInput.trim(), classes[0]); }}}
                          autoFocus
                        />
                        <button onClick={() => { if (customSectionInput.trim()) { const classes = student.enrolledClasses?.length ? student.enrolledClasses : [student.classType].filter(Boolean); if (classes[0]) handleSetSection(student.id, customSectionInput.trim(), classes[0]); }}} className="text-green-600 dark:text-green-400 hover:text-green-300 p-1" aria-label="Add custom section"><Plus className="w-3 h-3" /></button>
                      </div>
                    )}
                    <button onClick={() => { setEditingSectionId(null); setSectionInput(''); setCustomSectionInput(''); }} className="text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">Done</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingSectionId(student.id); setSectionInput(''); setCustomSectionInput(''); }}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition text-wrap ${(student.classSections && Object.keys(student.classSections).length > 0) || student.section ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20' : 'bg-[var(--surface-glass)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'}`}
                  >
                    {student.classSections && Object.keys(student.classSections).length > 0
                      ? [...new Set(Object.values(student.classSections).filter(Boolean))].join(', ') || 'Assign'
                      : student.section || 'Assign'}
                  </button>
                )}
              </div>
              <div className="p-4 text-center w-32 shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <span className={`text-[11.5px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border inline-flex items-center gap-1.5 ${student.isWhitelisted ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'}`}>
                    {student.isWhitelisted ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                    {student.isWhitelisted ? 'Authorized' : 'Restricted'}
                  </span>
                  {!student.isWhitelisted && (
                    <span className="text-[8px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/30">PENDING</span>
                  )}
                </div>
              </div>
              <div className="p-2 text-center w-16 shrink-0 flex items-center justify-center">
                <button
                  onClick={() => isUncategorized ? handleDeleteUser(student.id, student.name) : handleRemoveSingleUserFromClass(student, classType)}
                  className="text-[var(--text-muted)] hover:text-red-400 transition p-2 rounded-lg hover:bg-[var(--surface-glass)] min-w-[32px] min-h-[32px] flex items-center justify-center"
                  title={isUncategorized ? "Permanently Delete" : "Remove from this Class"}
                  aria-label={isUncategorized ? "Permanently delete student" : "Remove student from class"}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
const VirtualizedStudentRows = React.memo(VirtualizedStudentRowsInner);

const UserManagement: React.FC<UserManagementProps> = ({
  users,
  whitelistedEmails,
  classConfigs,
  onWhitelist
}) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [targetClass, setTargetClass] = useState<ClassType>(DefaultClassTypes.AP_PHYSICS);
  const [isWhitelistOpen, setIsWhitelistOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [showBulkAward, setShowBulkAward] = useState(false);
  const [classSort, setClassSort] = useState<Record<string, { col: string; dir: 'asc' | 'desc' }>>({});

  const handleClassSort = (type: string, col: string) => {
    setClassSort(prev => {
      const cur = prev[type] || { col: 'name', dir: 'asc' };
      return { ...prev, [type]: { col, dir: cur.col === col ? (cur.dir === 'asc' ? 'desc' : 'asc') : 'asc' } };
    });
  };

  // Whitelist Form
  const [newEmail, setNewEmail] = useState('');
  const [newClass, setNewClass] = useState<ClassType>(DefaultClassTypes.AP_PHYSICS);
  const [newSection, setNewSection] = useState('');

  // Group Form
  const [groupName, setGroupName] = useState('');
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);
  const [groupFeatures, setGroupFeatures] = useState({
      evidenceLocker: false,
      leaderboard: true,
      bossFights: true
  });
  const [groupXpPerMinute, setGroupXpPerMinute] = useState<number>(10);

  // CSV Import
  const [whitelistMode, setWhitelistMode] = useState<'single' | 'csv'>('single');
  const [csvResults, setCsvResults] = useState<{ email: string; classType: string; section: string; status: 'pending' | 'success' | 'duplicate' | 'invalid' }[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // Section management
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionInput, setSectionInput] = useState('');
  const [customSectionInput, setCustomSectionInput] = useState('');

  // Include ALL student users so 'ghost' accounts can be managed
  const students = users.filter(u => u.role === 'STUDENT');

  // Collect all known sections across students (from both legacy and classSections)
  const knownSections = useMemo(() => {
    const sections = new Set<string>();
    students.forEach(s => {
      if (s.classSections) Object.values(s.classSections).forEach(v => { if (v) sections.add(v); });
      if (s.section) sections.add(s.section);
    });
    return Array.from(sections).sort();
  }, [students]);

  const handleSetSection = async (studentId: string, section: string, classType?: string) => {
    try {
      if (classType) {
        await dataService.updateUserClassSection(studentId, classType, section);
      } else {
        await dataService.updateUserSection(studentId, section);
      }
      setEditingSectionId(null);
      setSectionInput('');
      setCustomSectionInput('');
      toast.success(`Section updated to ${section || 'none'}${classType ? ` for ${classType}` : ''}`);
    } catch {
      toast.error('Failed to update section');
    }
  };

  const handleBulkSetSection = async (section: string, classType?: string) => {
    if (selectedUsers.size === 0) return;
    const ok = await confirm({
      title: 'Bulk Section Update',
      message: `Set section to "${section || 'none'}" for ${selectedUsers.size} selected students${classType ? ` in ${classType}` : ''}?`,
      confirmLabel: 'Update',
    });
    if (!ok) return;
    try {
      await Promise.all(Array.from(selectedUsers).map(id =>
        classType ? dataService.updateUserClassSection(id, classType, section) : dataService.updateUserSection(id, section)
      ));
      setSelectedUsers(new Set());
      toast.success(`Set ${selectedUsers.size} students to ${section}${classType ? ` for ${classType}` : ''}`);
    } catch {
      toast.error('Failed to bulk update sections');
    }
  };
  
  // Identify Whitelisted emails that DON'T have a user record yet
  const pendingInvites = useMemo(() => {
    return whitelistedEmails.filter(w => !users.some(u => u.email.toLowerCase() === w.email.toLowerCase()));
  }, [whitelistedEmails, users]);

  // Combine Default Types and Custom Configs, ensuring UNCATEGORIZED is included but at the end
  const availableClasses = useMemo(() => {
    const curriculumClasses = Array.from(new Set([
        ...Object.values(DefaultClassTypes).filter(c => c !== DefaultClassTypes.UNCATEGORIZED),
        ...classConfigs.map(c => c.className)
    ])).sort();
    
    return [...curriculumClasses, DefaultClassTypes.UNCATEGORIZED];
  }, [classConfigs]);

  const toggleSelectAll = (classType: ClassType) => {
    // Select all students who are in this class view
    const classStudents = students.filter(s => s.enrolledClasses?.includes(classType) || (classType === DefaultClassTypes.UNCATEGORIZED && (s.enrolledClasses?.length === 0 || !s.enrolledClasses)));
    const allSelected = classStudents.every(s => selectedUsers.has(s.id));
    const newSelected = new Set(selectedUsers);
    classStudents.forEach(s => {
      if (allSelected) newSelected.delete(s.id);
      else newSelected.add(s.id);
    });
    setSelectedUsers(newSelected);
  };

  const toggleUser = (id: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedUsers(newSelected);
  };

  const handleEnroll = async () => {
    if (selectedUsers.size === 0) return;
    const ok = await confirm({
      title: 'Bulk Class Enrollment',
      message: `Grant ${targetClass} access to ${selectedUsers.size} selected students?`,
      confirmLabel: 'Enroll',
    });
    if (!ok) return;
    const updates = (Array.from(selectedUsers) as string[]).map(async (userId) => {
        const user = users.find(u => u.id === userId);
        if (user) {
            const current = user.enrolledClasses || [];
            // If moving from Uncategorized to a real class, remove Uncategorized
            const updated = Array.from(new Set([
                ...current.filter(c => c !== DefaultClassTypes.UNCATEGORIZED), 
                targetClass
            ]));
            await dataService.updateUserEnrolledClasses(userId, updated);
        }
    });
    await Promise.all(updates);
    setSelectedUsers(new Set());
    toast.success(`Enrolled ${selectedUsers.size} students in ${targetClass}`);
  };

  const handleRemoveFromClass = async (classTypeToRemove: string) => {
      if (selectedUsers.size > 0) {
          if(!await confirm({ message: `Remove ${selectedUsers.size} students from ${classTypeToRemove}? Students with no remaining classes will lose system access.`, confirmLabel: "Remove" })) return;
          const updates = (Array.from(selectedUsers) as string[]).map(async (userId) => {
              const user = users.find(u => u.id === userId);
              if (user) {
                  const current = user.enrolledClasses || [];
                  const updated = current.filter(c => c !== classTypeToRemove);
                  await dataService.updateUserEnrolledClasses(userId, updated);
              }
          });
          await Promise.all(updates);
          setSelectedUsers(new Set());
      }
  };

  const handleRemoveSingleUserFromClass = async (user: User, classType: string) => {
      if (await confirm({ message: `Remove ${user.name} from ${classType}? If this is their only class, their system access will be revoked.`, confirmLabel: "Remove" })) {
          const current = user.enrolledClasses || [];
          const updated = current.filter(c => c !== classType);
          await dataService.updateUserEnrolledClasses(user.id, updated);
      }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
      if (await confirm({ title: "Permanent Deletion", message: `PERMANENTLY delete account for ${name}? This will remove all data and logs for this operative.`, confirmLabel: "Delete Forever" })) {
          await dataService.removeUser(userId);
      }
  };

  const handleDeleteGroup = async (classType: ClassType) => {
    if (classType === DefaultClassTypes.UNCATEGORIZED) return;
    if (await confirm({ message: `Delete group config ${classType}? Students will remain but the group settings will be lost.`, confirmLabel: "Delete Config" })) {
         dataService.deleteClassConfig(classType);
    }
  };

  const handleCancelInvite = async (email: string) => {
      if(await confirm({ message: `Cancel invite for ${email}? Access will be revoked immediately.`, confirmLabel: "Revoke" })) {
          await dataService.removeFromWhitelist(email);
      }
  };
  
  const handleEditGroup = (classType: ClassType, config?: ClassConfig) => {
      if (classType === DefaultClassTypes.UNCATEGORIZED) return;
      setGroupName(classType);
      setIsEditingGroup(true);
      if (config) {
          setGroupFeatures(config.features);
          setGroupXpPerMinute(config.xpPerMinute || 10);
      } else {
          setGroupFeatures({ evidenceLocker: false, leaderboard: true, bossFights: true });
          setGroupXpPerMinute(10);
      }
      setIsGroupModalOpen(true);
  };

  const handleWhitelistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onWhitelist(newEmail, newClass);
    // Store section in whitelist doc if provided (class-aware)
    if (newSection.trim()) {
        dataService.updateWhitelistSection(newEmail, newSection.trim(), newClass);
    }
    setNewEmail('');
    setNewSection('');
    setIsWhitelistOpen(false);
  };

  const handleCsvParse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      // Skip header row if it looks like one
      const startIdx = lines[0]?.toLowerCase().includes('email') ? 1 : 0;
      const existingEmails = new Set(whitelistedEmails.map(w => w.email.toLowerCase()));
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      const parsed = lines.slice(startIdx).map(line => {
        // Support comma or tab separated
        const parts = line.includes('\t') ? line.split('\t') : line.split(',');
        const email = (parts[0] || '').trim().toLowerCase();
        const classType = (parts[1] || '').trim() || DefaultClassTypes.AP_PHYSICS;
        const section = (parts[2] || '').trim();
        
        let status: 'pending' | 'duplicate' | 'invalid' = 'pending';
        if (!emailRegex.test(email)) status = 'invalid';
        else if (existingEmails.has(email)) status = 'duplicate';
        
        return { email, classType, section, status };
      }).filter(r => r.email.length > 0);
      
      setCsvResults(parsed);
    };
    reader.readAsText(file);
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  };

  const handleCsvImport = async () => {
    const toImport = csvResults.filter(r => r.status === 'pending');
    if (toImport.length === 0) return;
    setIsImporting(true);
    let successCount = 0;
    for (const row of toImport) {
      try {
        await dataService.addToWhitelist(row.email, row.classType);
        if (row.section) {
          await dataService.updateWhitelistSection(row.email, row.section, row.classType);
        }
        row.status = 'success';
        successCount++;
      } catch {
        row.status = 'invalid';
      }
    }
    setCsvResults([...csvResults]);
    setIsImporting(false);
    toast.success(`${successCount} operative${successCount !== 1 ? 's' : ''} imported successfully.`);
    if (csvResults.every(r => r.status === 'success' || r.status === 'duplicate')) {
      setTimeout(() => {
        setIsWhitelistOpen(false);
        setCsvResults([]);
        setWhitelistMode('single');
      }, 1500);
    }
  };

  const handleGroupSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!groupName) return;

      setIsSubmittingGroup(true);
      try {
          await dataService.saveClassConfig({
              id: groupName,
              className: groupName,
              features: groupFeatures,
              xpPerMinute: groupXpPerMinute
          });
          setGroupName('');
          setIsGroupModalOpen(false);
          setIsEditingGroup(false);
      } catch (error) {
          reportError(error, { component: 'UserManagement' });
          toast.error("Failed to save class configuration.");
      } finally {
          setIsSubmittingGroup(false);
      }
  }

  const renderClassSection = (type: ClassType) => {
    const isUncategorized = type === DefaultClassTypes.UNCATEGORIZED;
    // Filter by enrolledClasses array, or catch "ghosts" in Uncategorized
    const sort = classSort[type] || { col: 'name', dir: 'asc' };
    const classStudents = [...students.filter(s =>
        (s.enrolledClasses?.includes(type)) ||
        (isUncategorized && (!s.enrolledClasses || s.enrolledClasses.length === 0))
    )].sort((a, b) => {
        switch (sort.col) {
            case 'section': { const av = getUserSectionForClass(a, type) || ''; const bv = getUserSectionForClass(b, type) || ''; return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
            case 'status': { const av = a.isWhitelisted ? 1 : 0; const bv = b.isWhitelisted ? 1 : 0; return sort.dir === 'asc' ? av - bv : bv - av; }
            case 'lastSeen': { const av = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0; const bv = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0; return sort.dir === 'asc' ? av - bv : bv - av; }
            case 'xp': { const av = a.gamification?.classXp?.[type] || 0; const bv = b.gamification?.classXp?.[type] || 0; return sort.dir === 'asc' ? av - bv : bv - av; }
            case 'name': default: return sort.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
    });
    const config = classConfigs.find(c => c.className === type);

    return (
      <div key={type} className={`mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ${isUncategorized ? 'opacity-90' : ''}`}>
        <div className={`backdrop-blur-md border-t border-x border-[var(--border)] p-4 rounded-t-2xl flex justify-between items-center ${isUncategorized ? 'bg-orange-500/10' : 'bg-[var(--surface-glass)]'}`}>
          <div className="flex items-center gap-4">
            <h3 className={`font-bold text-lg tracking-wide ${isUncategorized ? 'text-orange-300' : 'text-[var(--text-primary)]'}`}>
                {isUncategorized && <HelpCircle className="w-5 h-5 inline mr-2 mb-1" />}
                {type}
            </h3>
            <span className={`border text-[11.5px] font-bold px-3 py-1 rounded-full ${isUncategorized ? 'bg-orange-500/20 text-orange-200 border-orange-500/30' : 'bg-[var(--accent-muted)] text-purple-200 border-purple-500/30'}`}>
              {classStudents.length} Registered
            </span>
            {!isUncategorized && (
                <button 
                    onClick={() => handleEditGroup(type, config)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--surface-glass-heavy)] transition"
                    title="Edit Class Configuration"
                    aria-label="Edit class configuration"
                >
                    <Settings className="w-4 h-4" />
                </button>
            )}
          </div>
          <div className="flex gap-2 items-center">
              {selectedUsers.size > 0 && Array.from(selectedUsers).some(id => classStudents.find(u => u.id === id)) && (
                <>
                  <div className="flex items-center gap-1">
                    <select
                      onChange={e => { if (e.target.value) handleBulkSetSection(e.target.value, type); e.target.value = ''; }}
                      className="bg-[var(--panel-bg)] border border-purple-500/30 text-purple-600 dark:text-purple-400 text-[11px] font-bold px-2 py-1.5 rounded-lg appearance-none focus:outline-none cursor-pointer"
                      defaultValue=""
                    >
                      <option value="" disabled>Assign Section...</option>
                      <option value="">No Section</option>
                      {knownSections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => handleRemoveFromClass(type)}
                    className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition flex items-center gap-2"
                  >
                      <UserX className="w-3 h-3" /> Remove Selected
                  </button>
                  <button
                    onClick={() => setShowBulkAward(true)}
                    className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition flex items-center gap-2"
                  >
                      <Zap className="w-3 h-3" /> Award XP
                  </button>
                </>
              )}
              {!isUncategorized && (
                <button 
                    onClick={() => handleDeleteGroup(type)}
                    className="text-xs text-[var(--text-muted)] hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-[var(--surface-glass)] transition flex items-center gap-2"
                >
                    <Trash2 className="w-3 h-3" />
                    Config
                </button>
              )}
          </div>
        </div>
        
        <div className="bg-[var(--surface-glass)] backdrop-blur-sm border border-[var(--border)] rounded-b-2xl overflow-hidden">
          {/* Column headers */}
          <div className="bg-[var(--panel-bg)] border-b border-[var(--border)] text-[11.5px] uppercase font-bold text-[var(--text-tertiary)] flex items-center">
            <div className="w-12 p-4 text-center shrink-0">
              {classStudents.length > 0 && (
                  <button onClick={() => toggleSelectAll(type)} className="hover:text-purple-400 transition" aria-label="Select all students">
                    <Square className="w-4 h-4" />
                  </button>
              )}
            </div>
            <div
              className="flex-1 p-4 cursor-pointer select-none group focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded"
              onClick={() => handleClassSort(type, 'name')}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClassSort(type, 'name'); } }}
              role="columnheader"
              tabIndex={0}
              aria-sort={(classSort[type] || { col: 'name', dir: 'asc' }).col === 'name' ? ((classSort[type] || { col: 'name', dir: 'asc' }).dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              aria-label="Sort by operative name"
            >
              <div className="flex items-center gap-1">
                <span>Operative</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${(classSort[type] || { col: 'name', dir: 'asc' }).col === 'name' && (classSort[type] || { col: 'name', dir: 'asc' }).dir === 'asc' ? 'text-purple-600 dark:text-purple-400' : 'text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${(classSort[type] || { col: 'name', dir: 'asc' }).col === 'name' && (classSort[type] || { col: 'name', dir: 'asc' }).dir === 'desc' ? 'text-purple-600 dark:text-purple-400' : 'text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)]'} transition`} />
                </span>
              </div>
            </div>
            <div
              className="w-36 p-4 text-center shrink-0 cursor-pointer select-none group focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded"
              onClick={() => handleClassSort(type, 'section')}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClassSort(type, 'section'); } }}
              role="columnheader"
              tabIndex={0}
              aria-sort={(classSort[type] || { col: 'name', dir: 'asc' }).col === 'section' ? ((classSort[type] || { col: 'name', dir: 'asc' }).dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              aria-label="Sort by section"
            >
              <div className="flex items-center gap-1 justify-center">
                <span>Section</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${(classSort[type] || { col: 'name', dir: 'asc' }).col === 'section' && (classSort[type] || { col: 'name', dir: 'asc' }).dir === 'asc' ? 'text-purple-600 dark:text-purple-400' : 'text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${(classSort[type] || { col: 'name', dir: 'asc' }).col === 'section' && (classSort[type] || { col: 'name', dir: 'asc' }).dir === 'desc' ? 'text-purple-600 dark:text-purple-400' : 'text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)]'} transition`} />
                </span>
              </div>
            </div>
            <div
              className="w-32 p-4 text-center shrink-0 cursor-pointer select-none group focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none rounded"
              onClick={() => handleClassSort(type, 'status')}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClassSort(type, 'status'); } }}
              role="columnheader"
              tabIndex={0}
              aria-sort={(classSort[type] || { col: 'name', dir: 'asc' }).col === 'status' ? ((classSort[type] || { col: 'name', dir: 'asc' }).dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              aria-label="Sort by system status"
            >
              <div className="flex items-center gap-1 justify-center">
                <span>System Status</span>
                <span className="flex flex-col gap-px" aria-hidden="true">
                  <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${(classSort[type] || { col: 'name', dir: 'asc' }).col === 'status' && (classSort[type] || { col: 'name', dir: 'asc' }).dir === 'asc' ? 'text-purple-600 dark:text-purple-400' : 'text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)]'} transition`} />
                  <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${(classSort[type] || { col: 'name', dir: 'asc' }).col === 'status' && (classSort[type] || { col: 'name', dir: 'asc' }).dir === 'desc' ? 'text-purple-600 dark:text-purple-400' : 'text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)]'} transition`} />
                </span>
              </div>
            </div>
            <div className="w-16 p-4 text-center shrink-0">Action</div>
          </div>
          {/* Virtualized student rows */}
          <VirtualizedStudentRows
            classStudents={classStudents}
            isUncategorized={isUncategorized}
            selectedUsers={selectedUsers}
            toggleUser={toggleUser}
            editingSectionId={editingSectionId}
            setEditingSectionId={setEditingSectionId}
            sectionInput={sectionInput}
            setSectionInput={setSectionInput}
            customSectionInput={customSectionInput}
            setCustomSectionInput={setCustomSectionInput}
            knownSections={knownSections}
            handleSetSection={handleSetSection}
            handleRemoveSingleUserFromClass={handleRemoveSingleUserFromClass}
            handleDeleteUser={handleDeleteUser}
            classType={type}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">User Management</h1>
            <p className="text-[var(--text-tertiary)]">Manage rosters, permissions, and active invitations.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <button 
                onClick={() => {
                    setGroupName('');
                    setGroupFeatures({ evidenceLocker: false, leaderboard: true, bossFights: true });
                    setIsEditingGroup(false);
                    setIsGroupModalOpen(true);
                }}
                className="bg-[var(--surface-glass-heavy)] hover:bg-[var(--surface-glass-heavy)] text-[var(--text-primary)] px-4 py-3 rounded-xl border border-[var(--border)] transition font-bold flex items-center justify-center gap-2"
            >
                <Settings className="w-4 h-4" />
                Class Config
            </button>
            <button 
                onClick={() => setIsWhitelistOpen(true)}
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] transition font-bold flex items-center justify-center gap-2"
            >
                <UserPlus className="w-4 h-4" />
                Invite Student
            </button>
        </div>
      </div>

      {/* PENDING INVITES TRACKER */}
      {pendingInvites.length > 0 && (
          <div className="bg-amber-900/10 border border-amber-500/30 rounded-2xl overflow-hidden animate-in zoom-in-95">
              <div className="bg-amber-500/20 px-6 py-3 flex items-center justify-between">
                  <h3 className="text-amber-200 font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                      <Mail className="w-4 h-4" /> Pending Class Invitations ({pendingInvites.length})
                  </h3>
                  <span className="text-[11.5px] text-amber-600 dark:text-amber-400 font-bold italic">Awaiting first login...</span>
              </div>
              <div className="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pendingInvites.map(invite => (
                      <div key={invite.email} className="bg-[var(--panel-bg)] p-3 rounded-xl flex items-center justify-between border border-[var(--border)] group hover:border-amber-500/30 transition">
                          <div className="min-w-0">
                              <p className="text-[var(--text-secondary)] text-xs font-bold truncate">{invite.email}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <ShieldCheck className="w-3 h-3 text-amber-500" />
                                <span className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-tighter">{(invite.classTypes || [invite.classType]).join(', ')} Access</span>
                              </div>
                          </div>
                          <button 
                            onClick={() => handleCancelInvite(invite.email)}
                            className="p-1.5 text-[var(--text-muted)] hover:text-red-400 transition hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100"
                            title="Cancel Invitation"
                            aria-label="Cancel invitation"
                          >
                              <Trash2 className="w-3.5 h-3.5" />
                          </button>
                      </div>
                  ))}
              </div>
          </div>
      )}

      <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] p-4 rounded-xl flex flex-col md:flex-row items-center justify-between sticky top-0 z-20 shadow-xl gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <span className="font-bold text-[var(--text-secondary)] text-sm whitespace-nowrap hidden md:inline">Bulk Enrollment:</span>
          <div className="relative w-full sm:w-auto">
            <select 
              value={targetClass}
              onChange={(e) => setTargetClass(e.target.value as ClassType)}
              className="w-full sm:w-auto appearance-none bg-[var(--panel-bg)] border border-[var(--border-strong)] text-[var(--text-secondary)] py-2 pl-4 pr-10 rounded-lg text-sm font-medium focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 cursor-pointer"
            >
              {availableClasses.filter(c => c !== DefaultClassTypes.UNCATEGORIZED).map(c => <option key={c} value={c}>Apply {c} Access</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          </div>
          <button 
            onClick={handleEnroll}
            disabled={selectedUsers.size === 0}
            className="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> 
            <span className="hidden sm:inline">Grant Access to Selected</span>
            <span className="inline sm:hidden">Grant Access</span>
          </button>
        </div>
        <div className="text-xs text-[var(--text-muted)] font-mono text-center md:text-right w-full md:w-auto">
          {selectedUsers.size} SELECTION ACTIVE
        </div>
      </div>

      <div className="pb-12">
        {availableClasses.map(c => renderClassSection(c))}
      </div>

      <Modal isOpen={isWhitelistOpen} onClose={() => { setIsWhitelistOpen(false); setCsvResults([]); setWhitelistMode('single'); }} title="New Operative Invitation" maxWidth="max-w-lg">
        {/* Tab Switcher */}
        <div className="flex gap-1 bg-[var(--panel-bg)] rounded-xl p-1 mb-4 border border-[var(--border)]">
          <button
            onClick={() => { setWhitelistMode('single'); setCsvResults([]); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${whitelistMode === 'single' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
          ><UserPlus className="w-3.5 h-3.5" /> Single</button>
          <button
            onClick={() => setWhitelistMode('csv')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${whitelistMode === 'csv' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
          ><Upload className="w-3.5 h-3.5" /> CSV Import</button>
        </div>

        {whitelistMode === 'single' ? (
          <form onSubmit={handleWhitelistSubmit} className="space-y-4">
            <div>
                <label className="block text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1 px-1">Authorized Gmail</label>
                <input 
                    type="email" 
                    required 
                    className="w-full p-3 border border-[var(--border)] rounded-xl bg-[var(--panel-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="student@gmail.com"
                />
            </div>
            <div>
                <label className="block text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1 px-1">Initial Class Assignment</label>
                <select 
                    className="w-full p-3 border border-[var(--border)] rounded-xl bg-[var(--panel-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all appearance-none"
                    value={newClass}
                    onChange={e => setNewClass(e.target.value as ClassType)}
                >
                    {availableClasses.filter(c => c !== DefaultClassTypes.UNCATEGORIZED).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1 px-1">Section / Period (Optional)</label>
                <input 
                    type="text"
                    className="w-full p-3 border border-[var(--border)] rounded-xl bg-[var(--panel-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    value={newSection}
                    onChange={e => setNewSection(e.target.value)}
                    placeholder="e.g. Period 3, Block A"
                />
            </div>
            <p className="text-[11.5px] text-[var(--text-tertiary)] bg-[var(--panel-bg)] p-3 rounded-lg border border-[var(--border)]">
                Invitation puts the email on a secure whitelist. The student will be automatically placed in their class upon their first Google login.
            </p>
            <button type="submit" className="w-full bg-purple-600 text-white py-4 rounded-2xl font-bold hover:bg-purple-700 transition shadow-xl shadow-purple-200">Whitelist Email</button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-[var(--panel-bg)] border border-dashed border-[var(--border-strong)] rounded-2xl p-6 text-center">
              <input type="file" ref={csvFileRef} accept=".csv,.tsv,.txt" onChange={handleCsvParse} className="hidden" />
              {csvResults.length === 0 ? (
                <>
                  <Upload className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                  <button
                    onClick={() => csvFileRef.current?.click()}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition"
                  >Select CSV File</button>
                  <p className="text-[11.5px] text-[var(--text-muted)] mt-3">Expected format: <code className="bg-[var(--panel-bg)] px-1.5 py-0.5 rounded">email, class, section</code></p>
                  <p className="text-[11.5px] text-[var(--text-muted)] mt-1">Header row is auto-detected and skipped. Section column is optional.</p>
                  <div className="mt-3 bg-[var(--panel-bg)] rounded-lg p-3 text-left">
                    <p className="text-[11.5px] text-[var(--text-muted)] font-mono leading-relaxed">
                      email,class,section<br/>
                      john@gmail.com,AP Physics,Period 3<br/>
                      jane@gmail.com,Honors Physics,Period 1<br/>
                      alex@gmail.com,Forensic Science,
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <FileText className="w-8 h-8 text-[var(--accent-text)] mx-auto mb-2" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">{csvResults.length} records parsed</p>
                  <button onClick={() => { setCsvResults([]); }} className="text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition mt-1 underline">Clear & pick another file</button>
                </>
              )}
            </div>

            {csvResults.length > 0 && (
              <>
                <div className="max-h-64 overflow-y-auto custom-scrollbar border border-[var(--border)] rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[var(--surface-raised)]">
                      <tr className="border-b border-[var(--border)] text-[11.5px] uppercase text-[var(--text-muted)] font-bold">
                        <th className="p-2 pl-3">Email</th>
                        <th className="p-2">Class</th>
                        <th className="p-2">Section</th>
                        <th className="p-2 text-right pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {csvResults.map((row, idx) => (
                        <tr key={idx} className={row.status === 'invalid' ? 'bg-red-500/5' : row.status === 'duplicate' ? 'bg-yellow-500/5' : row.status === 'success' ? 'bg-green-500/5' : ''}>
                          <td className="p-2 pl-3 text-[var(--text-secondary)] font-mono truncate max-w-[160px]">{row.email}</td>
                          <td className="p-2 text-[var(--text-tertiary)]">{row.classType}</td>
                          <td className="p-2 text-[var(--text-muted)]">{row.section || '—'}</td>
                          <td className="p-2 pr-3 text-right">
                            <span className={`text-[11.5px] font-bold uppercase px-2 py-0.5 rounded ${
                              row.status === 'pending' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                              row.status === 'success' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                              row.status === 'duplicate' ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                              'bg-red-500/20 text-red-600 dark:text-red-400'
                            }`}>{row.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-[11.5px] text-[var(--text-muted)]">
                  <div className="flex gap-3">
                    <span className="text-blue-600 dark:text-blue-400">{csvResults.filter(r => r.status === 'pending').length} ready</span>
                    <span className="text-yellow-600 dark:text-yellow-400">{csvResults.filter(r => r.status === 'duplicate').length} duplicates</span>
                    <span className="text-red-600 dark:text-red-400">{csvResults.filter(r => r.status === 'invalid').length} invalid</span>
                    {csvResults.some(r => r.status === 'success') && <span className="text-green-600 dark:text-green-400">{csvResults.filter(r => r.status === 'success').length} imported</span>}
                  </div>
                </div>

                {csvResults.filter(r => r.status === 'duplicate').length > 0 && (
                  <div className="flex items-start gap-2 text-[11.5px] text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Duplicate emails are already on the whitelist and will be skipped.
                  </div>
                )}

                <button
                  onClick={handleCsvImport}
                  disabled={isImporting || csvResults.filter(r => r.status === 'pending').length === 0}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2"
                >
                  {isImporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                  ) : (
                    <>Import {csvResults.filter(r => r.status === 'pending').length} Operatives</>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </Modal>

      <BehaviorQuickAward
        students={users}
        isOpen={showBulkAward}
        onClose={() => setShowBulkAward(false)}
        preSelectedStudents={users.filter(u => selectedUsers.has(u.id))}
      />

      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title={isEditingGroup ? "Edit Class Node Config" : "Initialize New Class Node"}>
          <form onSubmit={handleGroupSubmit} className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
                  <input 
                      type="text" 
                      required 
                      className="w-full p-3 border border-[var(--border)] rounded-xl bg-[var(--panel-bg)] text-[var(--text-primary)]"
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      placeholder="e.g. AP Physics Period 4"
                  />
                  {isEditingGroup && <p className="text-[11.5px] text-orange-600 mt-2 font-bold uppercase">System Note: Rename creates a new config branch.</p>}
              </div>
              <div className="border-t border-[var(--border)] pt-4">
                  <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">Modular Feature Access</label>
                  <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500" checked={groupFeatures.evidenceLocker} onChange={e => setGroupFeatures({...groupFeatures, evidenceLocker: e.target.checked})} />
                          <span className="text-sm text-gray-700 font-medium group-hover:text-purple-600 transition">Evidence Log (Weekly Portfolio)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500" checked={groupFeatures.leaderboard} onChange={e => setGroupFeatures({...groupFeatures, leaderboard: e.target.checked})} />
                          <span className="text-sm text-gray-700 font-medium group-hover:text-purple-600 transition">Global XP Leaderboards</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500" checked={groupFeatures.bossFights} onChange={e => setGroupFeatures({...groupFeatures, bossFights: e.target.checked})} />
                          <span className="text-sm text-gray-700 font-medium group-hover:text-purple-600 transition">Boss Fights</span>
                      </label>
                  </div>
              </div>
              <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">XP Per Minute of Engagement</label>
                  <div className="flex items-center gap-3">
                      <input 
                          type="number" min={1} max={100} 
                          value={groupXpPerMinute} 
                          onChange={e => setGroupXpPerMinute(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                          className="w-24 p-3 border border-[var(--border)] rounded-xl bg-[var(--panel-bg)] text-[var(--text-primary)] text-center font-bold"
                      />
                      <span className="text-xs text-[var(--text-muted)]">XP per minute (default: 10, max: 100)</span>
                  </div>
              </div>
              <button 
                  type="submit" 
                  disabled={isSubmittingGroup}
                  className={`w-full bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 transition flex items-center justify-center gap-2 ${isSubmittingGroup ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                  {isSubmittingGroup ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> ESTABLISHING PROTOCOL...</>
                  ) : (
                      isEditingGroup ? "Update Terminal Configuration" : "Initialize Class Node"
                  )}
              </button>
          </form>
      </Modal>
    </div>
  );
};

export default UserManagement;

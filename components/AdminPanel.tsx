import React, { useState, useMemo } from 'react';
import { Assignment, Submission, AssignmentStatus, DefaultClassTypes, ClassConfig, ResourceCategory, User } from '../types';
import { Plus, Archive, Eye, Trash2, Edit2, PlayCircle, Clock, ChevronDown, ChevronRight, BookOpen, Layers, Target, FlaskConical, Newspaper, Video, MonitorPlay, Brain, CalendarClock, FileText, Rocket } from 'lucide-react';
import QuestionBankManager from './QuestionBankManager';
import { dataService } from '../services/dataService';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

interface AdminPanelProps {
  assignments: Assignment[];
  submissions: Submission[];
  classConfigs: ClassConfig[];
  users: User[];
  onCreateAssignment: (assignment: Partial<Assignment>) => Promise<void>;
  onDeleteAssignment?: (id: string) => void;
  onPreviewAssignment?: (id: string) => void;
  availableSections?: string[];
  onNavigate?: (tab: string) => void;
}

const CATEGORIES: ResourceCategory[] = ['Textbook', 'Simulation', 'Lab Guide', 'Practice Set', 'Article', 'Video Lesson', 'Supplemental'];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Textbook': <BookOpen className="w-4 h-4" />,
  'Simulation': <PlayCircle className="w-4 h-4" />,
  'Lab Guide': <FlaskConical className="w-4 h-4" />,
  'Practice Set': <Target className="w-4 h-4" />,
  'Article': <Newspaper className="w-4 h-4" />,
  'Video Lesson': <Video className="w-4 h-4" />,
  'Supplemental': <Layers className="w-4 h-4" />
};

const AdminPanel: React.FC<AdminPanelProps> = ({ assignments, submissions, classConfigs, onPreviewAssignment, onNavigate }) => {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [filterClass, setFilterClass] = useState<string>('All Classes');
  const [filterCategory, setFilterCategory] = useState<string>('All Categories');
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [qbAssignment, setQbAssignment] = useState<Assignment | null>(null);

  const availableClasses = useMemo<string[]>(() => {
    const defaults = Object.values(DefaultClassTypes).filter((c): c is string => c !== DefaultClassTypes.UNCATEGORIZED);
    const configs = (classConfigs || []).map((c: ClassConfig) => c.className);
    return Array.from(new Set(['All Classes', ...defaults, ...configs]));
  }, [classConfigs]);

  const filteredAssignments = useMemo<Assignment[]>(() => {
    return assignments.filter(a => {
        const classMatch = filterClass === 'All Classes' || a.classType === filterClass;
        const categoryMatch = filterCategory === 'All Categories' || a.category === filterCategory;
        return classMatch && categoryMatch;
    });
  }, [assignments, filterClass, filterCategory]);

  const groupedAssignments = useMemo<Record<string, Assignment[]>>(() => {
    const groups: Record<string, Assignment[]> = {};
    filteredAssignments.forEach((a: Assignment) => {
        // Group by Class First if All Classes is selected, else just Unit
        const groupKey = filterClass === 'All Classes'
            ? `${a.classType.toUpperCase()} — ${a.unit || 'Unassigned'}`
            : (a.unit || 'Unassigned');

        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(a);
    });

    return Object.keys(groups).sort().reduce((obj, key) => {
        obj[key] = groups[key];
        return obj;
    }, {} as Record<string, Assignment[]>);
  }, [filteredAssignments, filterClass]);

  const handleQuickDeploy = async (assign: Assignment) => {
    await dataService.updateAssignmentStatus(assign.id, AssignmentStatus.ACTIVE);
    toast.success(`"${assign.title}" deployed.`);
  };

  const toggleStatus = async (assign: Assignment) => {
    const newStatus = assign.status === AssignmentStatus.ACTIVE ? AssignmentStatus.ARCHIVED : AssignmentStatus.ACTIVE;
    await dataService.updateAssignmentStatus(assign.id, newStatus);
  };

  // Explicitly type engagementLogs to Submission[]
  const engagementLogs: Submission[] = useMemo(() => {
    const rawSubs = Array.isArray(submissions) ? submissions : [];
    return [...rawSubs].sort((a, b) => {
      const dateA = new Date(a.submittedAt || 0).getTime();
      const dateB = new Date(b.submittedAt || 0).getTime();
      return dateB - dateA;
    });
  }, [submissions]);

  const getStatusBadge = (assign: Assignment) => {
    if (assign.status === AssignmentStatus.DRAFT) {
      return <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Draft</span>;
    }
    if (assign.scheduledAt && new Date(assign.scheduledAt) > new Date()) {
      return <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1"><CalendarClock className="w-3 h-3" />{new Date(assign.scheduledAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
    }
    return null;
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Admin System</h1>
          <p className="text-gray-400">Resource deployment and operational oversight.</p>
        </div>
        <button onClick={() => onNavigate?.('Resource Editor')} className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-2xl shadow-xl transition-all font-bold flex items-center gap-2">
          <Plus className="w-5 h-5" /> Resource Editor
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-wrap items-center gap-4">
                <div className="relative">
                    <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="bg-black/20 text-white text-xs font-bold py-2 pl-3 pr-8 rounded-lg border border-white/10 appearance-none focus:outline-none">
                        {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                </div>
                <div className="relative">
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="bg-black/20 text-white text-xs font-bold py-2 pl-3 pr-8 rounded-lg border border-white/10 appearance-none focus:outline-none">
                        <option value="All Categories">All Categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                </div>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 h-[600px] overflow-y-auto custom-scrollbar text-white">
                {(Object.entries(groupedAssignments) as [string, Assignment[]][]).map(([unit, items]) => (
                    <div key={unit} className="mb-6 last:mb-0">
                        <div className="w-full flex items-center gap-3 py-2 mb-2 group">
                            <button onClick={() => { const n = new Set(expandedUnits); n.has(unit) ? n.delete(unit) : n.add(unit); setExpandedUnits(n); }} className="text-gray-400 hover:text-white transition">
                              {expandedUnits.has(unit) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500 truncate">{unit}</h3>
                            <div className="h-[1px] flex-1 bg-white/5 group-hover:bg-white/10 transition"></div>
                        </div>
                        {!expandedUnits.has(unit) && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                {items.map((assign: Assignment) => {
                                    const badge = getStatusBadge(assign);
                                    return (
                                    <div key={assign.id} className={`p-4 rounded-2xl border transition group flex justify-between items-center ${assign.status === AssignmentStatus.ARCHIVED ? 'bg-white/2 border-white/5 opacity-60' : assign.status === AssignmentStatus.DRAFT ? 'bg-blue-900/10 border-blue-500/20' : 'bg-white/5 border-white/10 hover:border-purple-500/50'}`}>
                                        <div className="flex items-center gap-4 min-w-0 pr-4 flex-1">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${assign.status === AssignmentStatus.DRAFT ? 'bg-blue-500/20 text-blue-400' : assign.status === AssignmentStatus.ACTIVE ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-500'}`}>
                                                {assign.status === AssignmentStatus.DRAFT ? <FileText className="w-4 h-4" /> : CATEGORY_ICONS[assign.category || 'Supplemental']}
                                            </div>
                                            <div className="truncate flex-1">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <h4 className="font-bold text-gray-200 text-sm truncate flex-1">{assign.title}</h4>
                                                    {badge}
                                                    <span className="text-[9px] text-gray-500 uppercase font-mono px-2 py-0.5 bg-black/40 rounded border border-white/5 flex-shrink-0 whitespace-nowrap">
                                                        {assign.classType}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500 truncate mt-0.5">{assign.description}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition duration-200 shrink-0">
                                            {assign.status === AssignmentStatus.DRAFT && (
                                                <button onClick={() => handleQuickDeploy(assign)} className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition" title="Deploy Now"><Rocket className="w-4 h-4" /></button>
                                            )}
                                            <button onClick={() => setQbAssignment(assign)} className="p-2 text-purple-400 hover:bg-purple-500/20 rounded-lg transition" title="Question Bank"><Brain className="w-4 h-4" /></button>
                                            <button onClick={() => onPreviewAssignment?.(assign.id)} className="p-2 text-indigo-400 hover:bg-indigo-500/20 rounded-lg transition"><MonitorPlay className="w-4 h-4" /></button>
                                            <button onClick={() => onNavigate?.('Resource Editor')} className="p-2 text-gray-300 hover:bg-white/10 rounded-lg transition" title="Edit in Resource Editor"><Edit2 className="w-4 h-4" /></button>
                                            <button onClick={() => toggleStatus(assign)} className="p-2 text-yellow-400 hover:bg-yellow-500/20 rounded-lg transition">{assign.status === AssignmentStatus.ACTIVE ? <Archive className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                                            <button onClick={async () => { if(await confirm({ message: "Delete this resource permanently?", confirmLabel: "Delete" })) await dataService.deleteAssignment(assign.id); }} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition" title="Delete resource" aria-label="Delete resource"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>

        <div className="lg:col-span-4">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 h-[710px] flex flex-col">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6"><Clock className="w-4 h-4 text-blue-400" /> Engagement Log</h3>
                <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                    {engagementLogs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                            <Clock className="w-10 h-10 text-gray-700 mb-3" />
                            <p className="text-gray-500 text-sm">No engagement data yet</p>
                            <p className="text-gray-600 text-xs mt-1">Activity will appear here as students complete resources.</p>
                        </div>
                    )}
                    {engagementLogs.map((sub: Submission) => (
                        <div key={sub.id} className="bg-black/40 border border-white/5 p-4 rounded-2xl hover:bg-black/60 transition group">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="font-bold text-gray-200 text-xs block truncate">{sub.userName}</span>
                                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-tight line-clamp-1">{sub.assignmentTitle}</span>
                                </div>
                                <span className="text-[10px] font-bold text-blue-400 bg-blue-900/30 px-2 py-1 rounded-full">{Math.round(sub.score)} XP</span>
                            </div>
                            <div className="text-[9px] text-gray-600 mt-2 border-t border-white/5 pt-2 flex justify-between">
                                <span>{Math.round(sub.metrics.engagementTime / 60)}m active</span>
                                <span className="opacity-0 group-hover:opacity-100 transition">{new Date(sub.submittedAt || '').toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      {qbAssignment && (
        <QuestionBankManager
          assignment={qbAssignment}
          isOpen={!!qbAssignment}
          onClose={() => setQbAssignment(null)}
        />
      )}
    </div>
  );
};

export default AdminPanel;

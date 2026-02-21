import React, { useState, useMemo } from 'react';
import { Assignment, Submission, AssignmentStatus, DefaultClassTypes, ClassConfig, ResourceCategory, User, getSectionsForClass, LessonBlock } from '../types';
import { Plus, Archive, Eye, Trash2, Edit2, Loader2, PlayCircle, Clock, ChevronDown, ChevronRight, BookOpen, Layers, Target, FlaskConical, Newspaper, Video, MonitorPlay, Brain, CheckCircle, CalendarClock, FileText, Rocket } from 'lucide-react';
import Modal from './Modal';
import QuestionBankManager from './QuestionBankManager';
import SectionPicker from './SectionPicker';
import LessonBlockEditor from './LessonBlockEditor';
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

const AdminPanel: React.FC<AdminPanelProps> = ({ assignments, submissions, classConfigs, users, onCreateAssignment, onPreviewAssignment, availableSections = [] }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filterClass, setFilterClass] = useState<string>('All Classes');
  const [filterCategory, setFilterCategory] = useState<string>('All Categories');
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [qbAssignment, setQbAssignment] = useState<Assignment | null>(null);

  const [newAssignment, setNewAssignment] = useState<Partial<Assignment>>({
    title: '',
    description: '',
    status: AssignmentStatus.ACTIVE,
    unit: 'Unit 1: Overview',
    category: 'Textbook',
    htmlContent: '',
    resources: [],
    lessonBlocks: []
  });

  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set([DefaultClassTypes.AP_PHYSICS]));
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [isUploadingMain, setIsUploadingMain] = useState(false);

  const students = useMemo(() => users.filter(u => u.role === 'STUDENT'), [users]);

  // Fix: Explicitly type availableClasses to string[] to resolve Property 'map' does not exist on type 'unknown' error
  const availableClasses = useMemo<string[]>(() => {
    const defaults = Object.values(DefaultClassTypes).filter((c): c is string => c !== DefaultClassTypes.UNCATEGORIZED);
    const configs = (classConfigs || []).map((c: ClassConfig) => c.className);
    return Array.from(new Set(['All Classes', ...defaults, ...configs]));
  }, [classConfigs]);

  // Compute sections filtered by the first selected target class
  const classSections = useMemo(() => {
    const firstClass = Array.from(selectedClasses)[0];
    if (!firstClass) return availableSections;
    const perClass = getSectionsForClass(students, firstClass);
    return perClass.length > 0 ? perClass : availableSections;
  }, [selectedClasses, students, availableSections]);

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

  const handleDeploy = async (status: AssignmentStatus, scheduledAt?: string) => {
    if (selectedClasses.size === 0) { toast.error("Select a target class."); return; }
    setIsSubmitting(true);
    try {
        const sectionPayload = selectedSections.length > 0 ? { targetSections: selectedSections } : {};
        const schedPayload = scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {};
        const payload = { ...newAssignment, status, ...sectionPayload, ...schedPayload };
        if (isEditing && newAssignment.id) {
            await onCreateAssignment({ ...payload, classType: Array.from(selectedClasses)[0] });
        } else {
            await Promise.all(Array.from(selectedClasses).map(className =>
                onCreateAssignment({ ...payload, classType: className })
            ));
        }
        setIsModalOpen(false);
        setIsEditing(false);
        setScheduleDate('');
        toast.success(status === AssignmentStatus.DRAFT ? 'Draft saved.' : scheduledAt ? 'Deployment scheduled.' : 'Resource deployed.');
    } catch (err) { console.error(err); } finally { setIsSubmitting(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleDeploy(AssignmentStatus.ACTIVE);
  };

  const handleQuickDeploy = async (assign: Assignment) => {
    await dataService.updateAssignmentStatus(assign.id, AssignmentStatus.ACTIVE);
    toast.success(`"${assign.title}" deployed.`);
  };

  const handleEdit = (assignment: Assignment) => {
      setNewAssignment(assignment);
      setSelectedClasses(new Set([assignment.classType]));
      setSelectedSections(assignment.targetSections || []);
      setScheduleDate(assignment.scheduledAt ? assignment.scheduledAt.slice(0, 16) : '');
      setIsEditing(true);
      setIsModalOpen(true);
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
        <button onClick={() => { setNewAssignment({ title: '', description: '', status: AssignmentStatus.ACTIVE, unit: 'Unit 1: Overview', category: 'Textbook', htmlContent: '', contentUrl: '', resources: [], lessonBlocks: [] }); setSelectedSections([]); setScheduleDate(''); setIsEditing(false); setIsModalOpen(true); }} className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-2xl shadow-xl transition-all font-bold flex items-center gap-2">
          <Plus className="w-5 h-5" /> Deploy Resource
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
                                            <button onClick={() => handleEdit(assign)} className="p-2 text-gray-300 hover:bg-white/10 rounded-lg transition"><Edit2 className="w-4 h-4" /></button>
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Modify Resource" : "Configure Deployment"} maxWidth="max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
                    <input required className="w-full p-3 border border-white/10 rounded-xl bg-black/30 text-white placeholder-gray-500" value={newAssignment.title} onChange={e => setNewAssignment({...newAssignment, title: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit</label>
                    <input required className="w-full p-3 border border-white/10 rounded-xl bg-black/30 text-white placeholder-gray-500" value={newAssignment.unit} onChange={e => setNewAssignment({...newAssignment, unit: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
                    <select value={newAssignment.category} onChange={(e) => setNewAssignment({...newAssignment, category: e.target.value as ResourceCategory})} className="w-full p-3 border border-white/10 rounded-xl bg-black/30 text-white placeholder-gray-500">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Target Classes</label>
                <div className="flex flex-wrap gap-2">
                    {availableClasses.filter(c => c !== 'All Classes').map(c => (
                        <button key={c} type="button" onClick={() => { const s = new Set(selectedClasses); s.has(c) ? (s.size > 1 && s.delete(c)) : s.add(c); setSelectedClasses(s); setSelectedSections([]); }} className={`px-4 py-2 rounded-xl border text-xs font-bold transition ${selectedClasses.has(c) ? 'bg-purple-600 border-purple-600 text-white' : 'bg-black/30 border-white/10 text-gray-400'}`}>{c}</button>
                    ))}
                </div>
            </div>
            <SectionPicker availableSections={classSections} selectedSections={selectedSections} onChange={setSelectedSections} />
            <div className="bg-purple-900/20 border border-purple-500/30 p-5 rounded-2xl">
                <label className="block text-sm font-bold text-purple-300 mb-2">HTML Interactive Upload</label>
                <input type="file" accept=".html,.htm" className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-purple-600 file:text-white" onChange={async (e) => { if(e.target.files?.[0]) { setIsUploadingMain(true); try { const url = await dataService.uploadHtmlResource(e.target.files[0]); setNewAssignment({...newAssignment, contentUrl: url}); toast.success('File uploaded!'); } catch (err) { toast.error('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error')); } finally { setIsUploadingMain(false); } } }} />
                {isUploadingMain && <div className="flex items-center gap-2 mt-2 text-purple-300 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</div>}
                {!isUploadingMain && newAssignment.contentUrl && (
                    <div className="flex items-center gap-2 mt-2 text-emerald-400 text-xs"><CheckCircle className="w-4 h-4" /> Resource uploaded</div>
                )}
            </div>
            {/* Lesson Block Editor */}
            <div className="bg-indigo-900/20 border border-indigo-500/30 p-5 rounded-2xl">
                <LessonBlockEditor
                  blocks={(newAssignment.lessonBlocks || []) as LessonBlock[]}
                  onChange={(blocks) => setNewAssignment({ ...newAssignment, lessonBlocks: blocks })}
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description <span className="text-gray-600">(optional)</span></label>
                <textarea className="w-full p-3 border border-white/10 rounded-xl bg-black/30 text-white placeholder-gray-500 resize-none h-20" placeholder="Brief description for AI prompts and student context..." value={newAssignment.description} onChange={e => setNewAssignment({...newAssignment, description: e.target.value})} />
            </div>

            {/* Schedule */}
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Schedule Deployment <span className="text-gray-600">(optional — leave blank for immediate)</span></label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="w-full p-3 border border-white/10 rounded-xl bg-black/30 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDeploy(AssignmentStatus.DRAFT)}
                  className="flex-1 bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2 transition"
                >
                  <FileText className="w-4 h-4" /> Save Draft
                </button>
                {scheduleDate ? (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDeploy(AssignmentStatus.ACTIVE, scheduleDate)}
                    className="flex-[2] bg-amber-600 hover:bg-amber-500 text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2 transition"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CalendarClock className="w-4 h-4" /> Schedule Deployment</>}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-[2] bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2 transition"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Commit Deployment"}
                  </button>
                )}
            </div>
        </form>
      </Modal>

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

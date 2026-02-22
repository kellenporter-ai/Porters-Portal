import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Assignment, Submission, AssignmentStatus, DefaultClassTypes, ClassConfig, ResourceCategory, User, BugReport } from '../types';
import { Plus, Archive, Eye, Trash2, Edit2, PlayCircle, Clock, ChevronDown, ChevronRight, BookOpen, Layers, Target, FlaskConical, Newspaper, Video, MonitorPlay, Brain, CalendarClock, FileText, Rocket, ArrowUp, ArrowDown, GripVertical, Save, ListOrdered, Bug, Clipboard, CheckCircle, Sparkles, Wrench, Lightbulb, Pencil, X as XIcon, Check } from 'lucide-react';
import QuestionBankManager from './QuestionBankManager';
import { dataService } from '../services/dataService';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

/** Sort unit keys according to a unitOrder array. Unordered units go last alphabetically. */
export function sortUnitKeys(unitNames: string[], unitOrder?: string[]): string[] {
  if (!unitOrder || unitOrder.length === 0) return [...unitNames].sort();
  const orderMap = new Map(unitOrder.map((u, i) => [u, i]));
  return [...unitNames].sort((a, b) => {
    const aIdx = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aIdx === bIdx) return a.localeCompare(b);
    return aIdx - bIdx;
  });
}

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
  const [showUnitOrder, setShowUnitOrder] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

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

  // Get the unitOrder for the current class filter
  const activeClassConfig = useMemo(() => {
    if (filterClass === 'All Classes') return null;
    return classConfigs.find(c => c.className === filterClass) || null;
  }, [classConfigs, filterClass]);

  // All units for the currently filtered class (for the unit order panel)
  const classUnits = useMemo(() => {
    if (filterClass === 'All Classes') return [];
    const units = new Set<string>();
    assignments.filter(a => a.classType === filterClass).forEach(a => units.add(a.unit || 'Unassigned'));
    return sortUnitKeys(Array.from(units), activeClassConfig?.unitOrder);
  }, [assignments, filterClass, activeClassConfig]);

  const groupedAssignments = useMemo<Record<string, Assignment[]>>(() => {
    const groups: Record<string, Assignment[]> = {};
    filteredAssignments.forEach((a: Assignment) => {
        const groupKey = filterClass === 'All Classes'
            ? `${a.classType.toUpperCase()} — ${a.unit || 'Unassigned'}`
            : (a.unit || 'Unassigned');

        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(a);
    });

    const sortedKeys = filterClass === 'All Classes'
      ? Object.keys(groups).sort()
      : sortUnitKeys(Object.keys(groups), activeClassConfig?.unitOrder);

    return sortedKeys.reduce((obj, key) => {
        obj[key] = groups[key];
        return obj;
    }, {} as Record<string, Assignment[]>);
  }, [filteredAssignments, filterClass, activeClassConfig]);

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

  // Unit ordering handlers
  const startUnitOrder = useCallback(() => {
    setPendingOrder([...classUnits]);
    setShowUnitOrder(true);
  }, [classUnits]);

  const moveUnit = useCallback((idx: number, direction: 'up' | 'down') => {
    setPendingOrder(prev => {
      if (!prev) return prev;
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }, []);

  const saveUnitOrder = useCallback(async () => {
    if (!pendingOrder || !activeClassConfig) return;
    setIsSavingOrder(true);
    try {
      await dataService.saveClassConfig({ ...activeClassConfig, unitOrder: pendingOrder });
      toast.success('Unit order saved.');
      setShowUnitOrder(false);
      setPendingOrder(null);
    } catch {
      toast.error('Failed to save unit order.');
    } finally {
      setIsSavingOrder(false);
    }
  }, [pendingOrder, activeClassConfig, toast]);

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
                {filterClass !== 'All Classes' && classUnits.length > 1 && (
                    <button
                      onClick={startUnitOrder}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 rounded-lg transition cursor-pointer ml-auto"
                    >
                      <ListOrdered className="w-3.5 h-3.5" /> Unit Order
                    </button>
                )}
            </div>

            {/* Unit Ordering Panel */}
            {showUnitOrder && pendingOrder && (
              <div className="bg-white/5 backdrop-blur-md border border-purple-500/20 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-purple-400" />
                    Reorder Units — {filterClass}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setShowUnitOrder(false); setPendingOrder(null); }}
                      className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveUnitOrder}
                      disabled={isSavingOrder}
                      className="flex items-center gap-1.5 text-xs font-bold text-green-300 bg-green-500/15 hover:bg-green-500/25 border border-green-500/20 px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-40"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingOrder ? 'Saving...' : 'Save Order'}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {pendingOrder.map((unit, idx) => (
                    <div key={unit} className="flex items-center gap-2 bg-black/20 border border-white/5 rounded-xl px-3 py-2 group hover:border-purple-500/20 transition">
                      <GripVertical className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                      <span className="text-xs font-bold text-gray-300 truncate flex-1">{unit}</span>
                      <span className="text-[9px] text-gray-600 font-mono shrink-0">#{idx + 1}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          onClick={() => moveUnit(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition disabled:opacity-20 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveUnit(idx, 'down')}
                          disabled={idx === pendingOrder.length - 1}
                          className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition disabled:opacity-20 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

        <RightPanel
          engagementLogs={engagementLogs}
          toast={toast}
          confirm={confirm}
        />
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

// ──────────────────────────────────────────────
// Right Panel: Engagement Log + Bug Reports + AI Lab
// ──────────────────────────────────────────────

type RightTab = 'LOG' | 'BUGS' | 'AI';
type AIMode = 'create' | 'fix' | 'discover';

const CATEGORY_BADGES: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  feature: { label: 'Feature', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  other: { label: 'Other', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

const RightPanel: React.FC<{
  engagementLogs: Submission[];
  toast: ReturnType<typeof useToast>;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}> = ({ engagementLogs, toast, confirm }) => {
  const [tab, setTab] = useState<RightTab>('LOG');
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [editingReport, setEditingReport] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedBugs, setSelectedBugs] = useState<Set<string>>(new Set());
  const [aiMode, setAiMode] = useState<AIMode>('fix');
  const [aiContext, setAiContext] = useState('');

  // Subscribe to bug reports
  useEffect(() => {
    const unsub = dataService.subscribeToBugReports(setBugReports);
    return unsub;
  }, []);

  const visibleReports = useMemo(() => {
    return bugReports.filter(r => showResolved || !r.resolved);
  }, [bugReports, showResolved]);

  const toggleBugSelect = useCallback((id: string) => {
    setSelectedBugs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const startEdit = useCallback((report: BugReport) => {
    setEditingReport(report.id!);
    setEditText(report.description);
  }, []);

  const saveEdit = useCallback(async (reportId: string) => {
    await dataService.updateBugReport(reportId, { description: editText });
    setEditingReport(null);
    setEditText('');
    toast.success('Report updated.');
  }, [editText, toast]);

  const resolveReport = useCallback(async (id: string) => {
    await dataService.resolveBugReport(id);
    setSelectedBugs(prev => { const n = new Set(prev); n.delete(id); return n; });
    toast.success('Report resolved.');
  }, [toast]);

  const deleteReport = useCallback(async (id: string) => {
    if (await confirm({ message: 'Delete this report permanently?', confirmLabel: 'Delete' })) {
      await dataService.deleteBugReport(id);
      setSelectedBugs(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, [confirm]);

  // Generate AI prompts
  const generatePrompt = useCallback(() => {
    const selected = bugReports.filter(r => selectedBugs.has(r.id!));

    if (aiMode === 'fix') {
      const bugList = selected.length > 0
        ? selected.map((r, i) =>
          `${i + 1}. [${r.category.toUpperCase()}] ${r.description}${r.userName ? ` (reported by ${r.userName})` : ''}`
        ).join('\n')
        : '(No specific reports selected — analyze the codebase for common issues)';

      return `You are working on "Porter Portal", an educational platform built with React 19, TypeScript, Tailwind CSS, and Firebase Firestore.

The following bug reports and feature requests have been filed by users:

${bugList}
${aiContext ? `\nAdditional context from the admin:\n${aiContext}\n` : ''}
Please analyze these issues, identify the root causes in the codebase, and implement fixes. For each fix:
1. Explain what the issue is and where in the code it occurs
2. Make the minimal, targeted change needed
3. Ensure the fix doesn't introduce regressions
4. Build and verify the changes compile cleanly`;
    }

    if (aiMode === 'create') {
      return `You are working on "Porter Portal", an educational platform built with React 19, TypeScript, Tailwind CSS, and Firebase Firestore.

I need you to help create new educational content. The platform supports two content formats:

═══ FORMAT 1: LESSON BLOCKS (JSON) ═══
Output a JSON array of block objects for the Resource Editor's "Paste JSON" import.

Available block types and required fields:

Content blocks:
- {"type":"SECTION_HEADER", "icon":"📚", "title":"Section Name", "subtitle":"Optional subtitle"}
- {"type":"TEXT", "content":"Plain text content"}
- {"type":"IMAGE", "url":"https://...", "caption":"Caption", "alt":"Description"}
- {"type":"VIDEO", "url":"https://youtube.com/watch?v=...", "caption":"Caption"}
- {"type":"OBJECTIVES", "title":"Learning Objectives", "items":["Obj 1","Obj 2"]}
- {"type":"DIVIDER"}
- {"type":"EXTERNAL_LINK", "title":"Link Title", "url":"https://...", "content":"Description", "buttonLabel":"Open", "openInNewTab":true}
- {"type":"INFO_BOX", "variant":"tip|warning|note", "content":"Box content"}

Interactive blocks:
- {"type":"VOCABULARY", "term":"Word", "definition":"Definition"}
- {"type":"VOCAB_LIST", "terms":[{"term":"Word1","definition":"Def1"}]}
- {"type":"ACTIVITY", "icon":"⚡", "title":"Activity Name", "instructions":"Do this..."}
- {"type":"CHECKLIST", "content":"Checklist title", "items":["Step 1","Step 2"]}
- {"type":"SORTING", "title":"Sort Title", "instructions":"Sort these", "leftLabel":"Category A", "rightLabel":"Category B", "sortItems":[{"text":"Item","correct":"left|right"}]}
- {"type":"DATA_TABLE", "title":"Table Title", "columns":[{"key":"col1","label":"Name","editable":true}], "trials":3}
- {"type":"BAR_CHART", "title":"Chart Title", "barCount":3, "initialLabel":"Initial", "finalLabel":"Final", "deltaLabel":"Change", "height":300}

Question blocks:
- {"type":"MC", "content":"Question?", "options":["A","B","C","D"], "correctAnswer":0}
- {"type":"SHORT_ANSWER", "content":"Question?", "acceptedAnswers":["answer1","answer2"]}
- {"type":"RANKING", "content":"Put in order:", "items":["First","Second","Third"]}

Rules: Start with SECTION_HEADER, use OBJECTIVES near top, add TEXT between interactive elements, include INFO_BOX for callouts, add DIVIDER between sections, include 2-3 question blocks.

═══ FORMAT 2: STANDALONE HTML ACTIVITY ═══
Create a single HTML file that integrates with the Proctor Bridge Protocol via postMessage:
- Include PortalBridge snippet: init(), save(state, currentQuestion), answer(questionId, correct, attempts), complete(score, total, correct)
- Self-contained (inline CSS + JS), dark theme (#0f0720 bg), mobile-responsive
- Call PortalBridge.answer() when students answer (awards XP), PortalBridge.complete() when finished

${aiContext ? `Here is what I want to create:\n${aiContext}\n\n` : ''}Make the content engaging, educationally sound, and well-structured.`;
    }

    // discover mode
    return `You are working on "Porter Portal", an educational platform built with React 19, TypeScript, Tailwind CSS, and Firebase Firestore.

Please analyze the codebase and suggest improvements, new features, or optimizations. Focus on:

1. UX improvements that would benefit students and administrators
2. Performance optimizations for large class sizes
3. Missing features that similar educational platforms typically have
4. Code quality improvements and potential bug areas
5. Accessibility improvements
${aiContext ? `\nThe admin has these specific areas of interest:\n${aiContext}\n` : ''}
For each suggestion, briefly describe the feature/improvement, the expected benefit, and the approximate complexity (small/medium/large). Prioritize suggestions by impact.`;
  }, [aiMode, selectedBugs, bugReports, aiContext]);

  const copyPrompt = useCallback(() => {
    const prompt = generatePrompt();
    navigator.clipboard.writeText(prompt);
    toast.success('Prompt copied to clipboard!');
  }, [generatePrompt, toast]);

  return (
    <div className="lg:col-span-4">
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 h-[710px] flex flex-col">
        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-4 bg-black/20 rounded-xl p-1 border border-white/5">
          {([
            { key: 'LOG' as RightTab, icon: <Clock className="w-3.5 h-3.5" />, label: 'Activity' },
            { key: 'BUGS' as RightTab, icon: <Bug className="w-3.5 h-3.5" />, label: 'Reports' },
            { key: 'AI' as RightTab, icon: <Sparkles className="w-3.5 h-3.5" />, label: 'AI Lab' },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                tab === t.key
                  ? 'bg-purple-600/50 text-white shadow-lg'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Engagement Log */}
        {tab === 'LOG' && (
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
        )}

        {/* Bug Reports */}
        {tab === 'BUGS' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                {visibleReports.length} report{visibleReports.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                {selectedBugs.size > 0 && (
                  <button
                    onClick={() => { setTab('AI'); setAiMode('fix'); }}
                    className="flex items-center gap-1 text-[10px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded-lg hover:bg-purple-500/20 transition cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> AI Fix ({selectedBugs.size})
                  </button>
                )}
                <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={e => setShowResolved(e.target.checked)}
                    className="w-3 h-3 rounded accent-purple-500"
                  />
                  Resolved
                </label>
              </div>
            </div>
            <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar flex-1">
              {visibleReports.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Bug className="w-10 h-10 text-gray-700 mb-3" />
                  <p className="text-gray-500 text-sm">No reports yet</p>
                  <p className="text-gray-600 text-xs mt-1">Bug reports and feature requests will appear here.</p>
                </div>
              )}
              {visibleReports.map(report => {
                const badge = CATEGORY_BADGES[report.category];
                const isSelected = selectedBugs.has(report.id!);
                const isEditing = editingReport === report.id;
                return (
                  <div
                    key={report.id}
                    className={`bg-black/30 border rounded-xl p-3 transition ${
                      report.resolved ? 'border-green-500/10 opacity-50' :
                      isSelected ? 'border-purple-500/30 bg-purple-500/5' : 'border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      {!report.resolved && (
                        <button
                          onClick={() => toggleBugSelect(report.id!)}
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition cursor-pointer ${
                            isSelected ? 'bg-purple-600 border-purple-500' : 'border-white/20 hover:border-purple-500/50'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${badge.color}`}>{badge.label}</span>
                          <span className="text-[10px] text-gray-500 truncate">{report.userName}</span>
                          {report.resolved && <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />}
                        </div>
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              rows={3}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition resize-none"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <button onClick={() => saveEdit(report.id!)} className="flex items-center gap-1 text-[10px] font-bold text-green-300 bg-green-500/10 px-2 py-1 rounded-lg hover:bg-green-500/20 transition cursor-pointer">
                                <Check className="w-3 h-3" /> Save
                              </button>
                              <button onClick={() => setEditingReport(null)} className="text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded-lg transition cursor-pointer">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-300 leading-relaxed">{report.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                      <span className="text-[9px] text-gray-600 font-mono">
                        {new Date(report.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                      {!report.resolved && !isEditing && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(report)} className="p-1 text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 rounded transition cursor-pointer" title="Edit description">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => resolveReport(report.id!)} className="p-1 text-gray-500 hover:text-green-400 hover:bg-green-500/10 rounded transition cursor-pointer" title="Mark resolved">
                            <CheckCircle className="w-3 h-3" />
                          </button>
                          <button onClick={() => deleteReport(report.id!)} className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer" title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Lab */}
        {tab === 'AI' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Mode selector */}
            <div className="flex items-center gap-1 mb-4 bg-black/20 rounded-lg p-1 border border-white/5">
              {([
                { key: 'fix' as AIMode, icon: <Wrench className="w-3 h-3" />, label: 'Fix Bugs' },
                { key: 'create' as AIMode, icon: <BookOpen className="w-3 h-3" />, label: 'Create' },
                { key: 'discover' as AIMode, icon: <Lightbulb className="w-3 h-3" />, label: 'Discover' },
              ]).map(m => (
                <button
                  key={m.key}
                  onClick={() => setAiMode(m.key)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                    aiMode === m.key
                      ? 'bg-purple-600/40 text-purple-200'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              {/* Mode description */}
              <div className="bg-black/20 border border-white/5 rounded-xl p-3">
                {aiMode === 'fix' && (
                  <div className="text-xs text-gray-400">
                    <p className="font-bold text-gray-300 mb-1 flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5 text-amber-400" /> Bug Fix Mode</p>
                    <p>Select bug reports from the Reports tab, add context below, then copy the prompt to share with an AI assistant for fixes.</p>
                    {selectedBugs.size > 0 && (
                      <div className="mt-2 bg-purple-500/10 border border-purple-500/20 rounded-lg p-2">
                        <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">{selectedBugs.size} report{selectedBugs.size !== 1 ? 's' : ''} selected</span>
                        <div className="mt-1 space-y-1">
                          {bugReports.filter(r => selectedBugs.has(r.id!)).map(r => (
                            <div key={r.id} className="flex items-center gap-2 text-[10px] text-gray-400">
                              <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${CATEGORY_BADGES[r.category].color}`}>{r.category}</span>
                              <span className="truncate">{r.description.slice(0, 60)}{r.description.length > 60 ? '...' : ''}</span>
                              <button onClick={() => toggleBugSelect(r.id!)} className="ml-auto shrink-0 p-0.5 text-gray-600 hover:text-red-400 transition cursor-pointer">
                                <XIcon className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {aiMode === 'create' && (
                  <div className="text-xs text-gray-400">
                    <p className="font-bold text-gray-300 mb-1 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-blue-400" /> Content Creation Mode</p>
                    <p>Describe the lesson content you want to create. The prompt will include all supported block types and formatting guidance for the AI.</p>
                  </div>
                )}
                {aiMode === 'discover' && (
                  <div className="text-xs text-gray-400">
                    <p className="font-bold text-gray-300 mb-1 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-yellow-400" /> Feature Discovery Mode</p>
                    <p>Describe areas of interest or let the AI analyze the codebase for improvements, new features, and optimizations.</p>
                  </div>
                )}
              </div>

              {/* Context input */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">
                  {aiMode === 'fix' ? 'Additional Context' : aiMode === 'create' ? 'What to Create' : 'Areas of Interest'}
                </label>
                <textarea
                  value={aiContext}
                  onChange={e => setAiContext(e.target.value)}
                  rows={4}
                  placeholder={
                    aiMode === 'fix' ? 'Add any extra context about the bugs or how to reproduce them...'
                    : aiMode === 'create' ? 'Describe the lesson content, topic, grade level, or specific blocks you want...'
                    : 'Describe areas you want the AI to focus on, or leave blank for a general analysis...'
                  }
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition resize-none"
                />
              </div>

              {/* Prompt preview */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Generated Prompt Preview</label>
                <div className="bg-black/40 border border-white/5 rounded-xl p-3 max-h-48 overflow-y-auto custom-scrollbar">
                  <pre className="text-[10px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{generatePrompt()}</pre>
                </div>
              </div>
            </div>

            {/* Copy button */}
            <button
              onClick={copyPrompt}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm transition cursor-pointer shadow-lg"
            >
              <Clipboard className="w-4 h-4" /> Copy Prompt to Clipboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

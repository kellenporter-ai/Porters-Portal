
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Type, HelpCircle, MessageSquare,
  BookOpen, ListChecks, Info, Eye, GripVertical, Copy, Heading,
  Image, Play, Target, Minus, ExternalLink, Code, List, Zap,
  ArrowUpDown, Table, BarChart3, Link, Upload, Save, X,
  ChevronRight, Settings, Loader2, CalendarClock, FileText, CheckCircle, Rocket, Clock, Shield, Brain,
  PenTool, Calculator
} from 'lucide-react';
import {
  DndContext, closestCenter, DragEndEvent, DragStartEvent, DragOverlay,
  useSensor, useSensors, PointerSensor, KeyboardSensor,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDebounce } from '../lib/rateLimiting';
import { LessonBlock, BlockType, Assignment, AssignmentStatus, DefaultClassTypes, ClassConfig, ResourceCategory, User, Rubric, getSectionsForClass } from '../types';
import { parseRubricMarkdown, validateRubric } from '../lib/rubricParser';
import LessonBlocks from './LessonBlocks';
import SectionPicker from './SectionPicker';

import { lazyWithRetry } from '../lib/lazyWithRetry';
const RubricViewer = lazyWithRetry(() => import('./RubricViewer'));
const QuestionBankManager = lazyWithRetry(() => import('./QuestionBankManager'));
import { dataService } from '../services/dataService';
import { reportError } from '../lib/errorReporting';
import { useToast } from './ToastProvider';
import InlineBlockEditor, { inputClass, textareaClass, labelClass } from './lesson-editor/InlineBlockEditor';
import ResourceSidebar from './lesson-editor/ResourceSidebar';

interface LessonEditorPageProps {
  assignments: Assignment[];
  onClose: () => void;
  initialAssignmentId?: string;
  classConfigs?: ClassConfig[];
  users?: User[];
  availableSections?: string[];
  onCreateAssignment?: (assignment: Partial<Assignment>) => Promise<void>;
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode; description: string; category: string }[] = [
  { type: 'TEXT', label: 'Text', icon: <Type className="w-4 h-4" />, description: 'Plain text content', category: 'Content' },
  { type: 'SECTION_HEADER', label: 'Section Header', icon: <Heading className="w-4 h-4" />, description: 'Section title & subtitle', category: 'Content' },
  { type: 'IMAGE', label: 'Image', icon: <Image className="w-4 h-4" />, description: 'Image with caption', category: 'Content' },
  { type: 'VIDEO', label: 'Video', icon: <Play className="w-4 h-4" />, description: 'YouTube embed', category: 'Content' },
  { type: 'OBJECTIVES', label: 'Objectives', icon: <Target className="w-4 h-4" />, description: 'Learning objectives', category: 'Content' },
  { type: 'DIVIDER', label: 'Divider', icon: <Minus className="w-4 h-4" />, description: 'Separator line', category: 'Content' },
  { type: 'EXTERNAL_LINK', label: 'External Link', icon: <ExternalLink className="w-4 h-4" />, description: 'Styled link card', category: 'Content' },
  { type: 'EMBED', label: 'Embed', icon: <Code className="w-4 h-4" />, description: 'iFrame embed', category: 'Content' },
  { type: 'INFO_BOX', label: 'Info Box', icon: <Info className="w-4 h-4" />, description: 'Tip, warning, or note', category: 'Content' },
  { type: 'VOCABULARY', label: 'Vocabulary', icon: <BookOpen className="w-4 h-4" />, description: 'Term & definition', category: 'Interactive' },
  { type: 'VOCAB_LIST', label: 'Vocab List', icon: <List className="w-4 h-4" />, description: 'Multiple terms', category: 'Interactive' },
  { type: 'ACTIVITY', label: 'Activity', icon: <Zap className="w-4 h-4" />, description: 'Activity instructions', category: 'Interactive' },
  { type: 'CHECKLIST', label: 'Checklist', icon: <ListChecks className="w-4 h-4" />, description: 'Task list', category: 'Interactive' },
  { type: 'SORTING', label: 'Sorting', icon: <ArrowUpDown className="w-4 h-4" />, description: 'Categorize items', category: 'Interactive' },
  { type: 'DATA_TABLE', label: 'Data Table', icon: <Table className="w-4 h-4" />, description: 'Editable table', category: 'Interactive' },
  { type: 'BAR_CHART', label: 'Bar Chart', icon: <BarChart3 className="w-4 h-4" />, description: 'Interactive chart', category: 'Interactive' },
  { type: 'MC', label: 'Multiple Choice', icon: <HelpCircle className="w-4 h-4" />, description: 'Question with options', category: 'Questions' },
  { type: 'SHORT_ANSWER', label: 'Short Answer', icon: <MessageSquare className="w-4 h-4" />, description: 'Free-text question', category: 'Questions' },
  { type: 'RANKING', label: 'Ranking', icon: <GripVertical className="w-4 h-4" />, description: 'Reorder items', category: 'Questions' },
  { type: 'LINKED', label: 'Linked Question', icon: <Link className="w-4 h-4" />, description: 'Follow-up question', category: 'Questions' },
  // Tools
  { type: 'DRAWING', label: 'Drawing', icon: <PenTool className="w-4 h-4" />, description: 'Sketch & label diagrams', category: 'Tools' },
  { type: 'MATH_RESPONSE', label: 'Math Response', icon: <Calculator className="w-4 h-4" />, description: 'Step-by-step math work', category: 'Tools' },
];

const generateId = () => `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createEmptyBlock = (type: BlockType): LessonBlock => {
  const base: LessonBlock = { id: generateId(), type, content: '' };
  switch (type) {
    case 'MC': return { ...base, options: ['', ''], correctAnswer: 0 };
    case 'SHORT_ANSWER': return { ...base, acceptedAnswers: [''] };
    case 'VOCABULARY': return { ...base, term: '', definition: '' };
    case 'CHECKLIST': return { ...base, items: [''] };
    case 'INFO_BOX': return { ...base, variant: 'note' };
    case 'SECTION_HEADER': return { ...base, icon: '📚', title: '', subtitle: '' };
    case 'IMAGE': return { ...base, url: '', caption: '', alt: '' };
    case 'VIDEO': return { ...base, url: '', caption: '' };
    case 'OBJECTIVES': return { ...base, title: 'Learning Objectives', items: [''] };
    case 'DIVIDER': return base;
    case 'EXTERNAL_LINK': return { ...base, title: '', url: '', buttonLabel: 'Open', openInNewTab: true };
    case 'EMBED': return { ...base, url: '', caption: '', height: 500 };
    case 'VOCAB_LIST': return { ...base, terms: [{ term: '', definition: '' }] };
    case 'ACTIVITY': return { ...base, icon: '⚡', title: '', instructions: '' };
    case 'SORTING': return { ...base, title: '', instructions: '', leftLabel: 'Category A', rightLabel: 'Category B', sortItems: [{ text: '', correct: 'left' }] };
    case 'DATA_TABLE': return { ...base, title: '', columns: [{ key: 'col1', label: 'Column 1', editable: true }], trials: 3 };
    case 'BAR_CHART': return { ...base, title: '', height: 450 };
    case 'RANKING': return { ...base, items: [''] };
    case 'LINKED': return { ...base, linkedBlockId: '', acceptedAnswers: [''] };
    case 'DRAWING': return { ...base, title: '', instructions: '', drawingMode: 'free', canvasHeight: 400 };
    case 'MATH_RESPONSE': return { ...base, title: '', maxSteps: 10, stepLabels: ['Given:', 'Find:', 'Step 1:', 'Step 2:', 'Step 3:'], showLatexHelp: true };
    default: return base;
  }
};

// ──────────────────────────────────────────────
// Inline block type palette (for "+" buttons)
// ──────────────────────────────────────────────
const BlockTypePalette: React.FC<{ onSelect: (type: BlockType) => void; onClose: () => void }> = ({ onSelect, onClose }) => {
  const categories = ['Content', 'Interactive', 'Questions', 'Tools'];
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-[#1a1b26] border border-white/10 rounded-2xl shadow-2xl p-3 z-50 w-[480px] max-h-[50vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      {categories.map(cat => (
        <div key={cat} className="mb-2 last:mb-0">
          <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest px-2 mb-1">{cat}</div>
          <div className="grid grid-cols-2 gap-1">
            {BLOCK_TYPES.filter(bt => bt.category === cat).map(bt => (
              <button key={bt.type} type="button" onClick={() => { onSelect(bt.type); onClose(); }} className="flex items-center gap-2 p-2 rounded-lg text-left hover:bg-white/5 transition group">
                <span className="text-gray-500 group-hover:text-purple-400 transition">{bt.icon}</span>
                <div>
                  <div className="text-[11px] font-bold text-gray-300">{bt.label}</div>
                  <div className="text-[9px] text-gray-600">{bt.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ──────────────────────────────────────────────
// Inline "+" insert button
// ──────────────────────────────────────────────
const InsertButton: React.FC<{ onInsert: (type: BlockType) => void }> = ({ onInsert }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center justify-center py-1 group">
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/5 group-hover:bg-purple-500/20 transition" />
      <button type="button" onClick={() => setOpen(!open)} className="relative z-10 w-7 h-7 rounded-full bg-[#1a1b26] border border-white/10 hover:border-purple-500/40 hover:bg-purple-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
        <Plus className="w-3.5 h-3.5 text-gray-500 group-hover:text-purple-400" />
      </button>
      {open && <BlockTypePalette onSelect={onInsert} onClose={() => setOpen(false)} />}
    </div>
  );
};

// ──────────────────────────────────────────────
// Compact block summary (collapsed view in scrollable editor)
// ──────────────────────────────────────────────
const getBlockSummary = (block: LessonBlock): string => {
  switch (block.type) {
    case 'TEXT': return block.content.slice(0, 80) || 'Empty text';
    case 'MC': return block.content.slice(0, 60) || 'Multiple choice question';
    case 'SHORT_ANSWER': return block.content.slice(0, 60) || 'Short answer question';
    case 'VOCABULARY': return block.term || 'Vocabulary term';
    case 'CHECKLIST': return block.content || `${(block.items || []).length} items`;
    case 'INFO_BOX': return `${block.variant}: ${block.content.slice(0, 50)}`;
    case 'SECTION_HEADER': return `${block.icon || ''} ${block.title || 'Section'}`.trim();
    case 'IMAGE': return block.caption || block.alt || 'Image';
    case 'VIDEO': return block.caption || 'Video';
    case 'OBJECTIVES': return block.title || 'Objectives';
    case 'DIVIDER': return '─────';
    case 'EXTERNAL_LINK': return block.title || 'Link';
    case 'EMBED': return block.caption || 'Embed';
    case 'VOCAB_LIST': return `${(block.terms || []).length} terms`;
    case 'ACTIVITY': return block.title || 'Activity';
    case 'SORTING': return block.title || 'Sorting activity';
    case 'DATA_TABLE': return block.title || 'Data table';
    case 'BAR_CHART': return block.title || 'Bar chart';
    case 'RANKING': return block.content.slice(0, 60) || 'Ranking question';
    case 'LINKED': return block.content.slice(0, 60) || 'Linked question';
    case 'DRAWING': return block.title || 'Drawing';
    case 'MATH_RESPONSE': return block.title || 'Math response';
    default: return block.type;
  }
};

const getBlockTypeInfo = (type: BlockType) => BLOCK_TYPES.find(bt => bt.type === type);

const CATEGORIES: ResourceCategory[] = ['Textbook', 'Simulation', 'Lab Guide', 'Practice Set', 'Article', 'Video Lesson', 'Supplemental'];

// ──────────────────────────────────────────────
// Smart Unit Selector (combobox)
// ──────────────────────────────────────────────
const UnitSelector: React.FC<{ value: string; onChange: (val: string) => void; existingUnits: string[] }> = ({ value, onChange, existingUnits }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = existingUnits.filter(u => u.toLowerCase().includes(filter.toLowerCase()));
  const showCreate = filter && !existingUnits.some(u => u.toLowerCase() === filter.toLowerCase());

  return (
    <div ref={ref} className="relative">
      <label className={labelClass}>Unit</label>
      <input type="text" value={value} onChange={e => { onChange(e.target.value); setFilter(e.target.value); }} onFocus={() => { setIsOpen(true); setFilter(''); }} placeholder="Select or type a unit..." className={inputClass} />
      {isOpen && existingUnits.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1a1b26] border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
          {filtered.map(unit => (
            <button key={unit} type="button" onClick={() => { onChange(unit); setIsOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-purple-500/10 transition ${value === unit ? 'text-purple-300 bg-purple-500/5' : 'text-gray-300'}`}>
              {unit}
            </button>
          ))}
          {filtered.length === 0 && !showCreate && <div className="px-4 py-2 text-xs text-gray-500 italic">No matching units</div>}
          {showCreate && (
            <button type="button" onClick={() => { onChange(filter); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 transition flex items-center gap-2">
              <Plus className="w-3 h-3" /> Create &quot;{filter}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────
// Sortable Block Row (drag-and-drop wrapper)
// ──────────────────────────────────────────────

interface SortableBlockRowProps {
  id: string;
  children: (dragHandleProps: Record<string, unknown>) => React.ReactNode;
}

const SortableBlockRow: React.FC<SortableBlockRowProps> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
};

// ──────────────────────────────────────────────
// Main Lesson Editor Page
// ──────────────────────────────────────────────

const LessonEditorPage: React.FC<LessonEditorPageProps> = ({ assignments, onClose, initialAssignmentId, classConfigs = [], users = [], availableSections = [], onCreateAssignment }) => {
  const toast = useToast();

  // All assignments grouped by unit (sidebar shows everything now)
  const assignmentsByUnit = useMemo(() => {
    const groups: Record<string, Assignment[]> = {};
    assignments.sort((a, b) => a.title.localeCompare(b.title)).forEach(a => {
      const unit = a.unit || 'Unassigned';
      if (!groups[unit]) groups[unit] = [];
      groups[unit].push(a);
    });
    return groups;
  }, [assignments]);

  const availableClasses = useMemo<string[]>(() => {
    const defaults = Object.values(DefaultClassTypes).filter((c): c is string => c !== DefaultClassTypes.UNCATEGORIZED);
    const configs = (classConfigs || []).map((c: ClassConfig) => c.className);
    return Array.from(new Set([...defaults, ...configs]));
  }, [classConfigs]);

  const students = useMemo(() => users.filter(u => u.role === 'STUDENT'), [users]);

  const [selectedId, setSelectedId] = useState<string | null>(initialAssignmentId || null);
  const [isNewResource, setIsNewResource] = useState(false);
  const [blocks, setBlocks] = useState<LessonBlock[]>([]);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showQuestionBank, setShowQuestionBank] = useState(false);

  // Auto-save to Firestore
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Resource settings state
  const [resTitle, setResTitle] = useState('');
  const [resUnit, setResUnit] = useState('Unit 1: Overview');
  const [resCategory, setResCategory] = useState<ResourceCategory>('Textbook');
  const [resDescription, setResDescription] = useState('');
  const [resContentUrl, setResContentUrl] = useState<string | null>(null);
  const [resClasses, setResClasses] = useState<Set<string>>(new Set([availableClasses[0] || DefaultClassTypes.AP_PHYSICS]));
  const [resSections, setResSections] = useState<string[]>([]);
  const [resScheduleDate, setResScheduleDate] = useState('');
  const [resDueDate, setResDueDate] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAssessment, setIsAssessment] = useState(false);
  const [assessmentConfig, setAssessmentConfig] = useState({ allowResubmission: true, maxAttempts: 0, showScoreOnSubmit: true, lockNavigation: true });
  const [rubricMarkdown, setRubricMarkdown] = useState('');
  const [parsedRubric, setParsedRubric] = useState<Rubric | null>(null);
  const [rubricErrors, setRubricErrors] = useState<string[]>([]);

  const classSections = useMemo(() => {
    const firstClass = Array.from(resClasses)[0];
    if (!firstClass) return availableSections;
    const perClass = getSectionsForClass(students, firstClass);
    return perClass.length > 0 ? perClass : availableSections;
  }, [resClasses, students, availableSections]);

  // Warn on page unload if unsaved changes exist
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Debounced auto-save to localStorage
  const autoSaveKey = selectedId ? `lessonEditor_${selectedId}` : isNewResource ? 'lessonEditor_new' : null;

  const performAutoSave = useDebounce(() => {
    if (!autoSaveKey) return;
    try {
      const draft = { blocks, resTitle, resUnit, resCategory, resDescription, resSections, resScheduleDate, resDueDate, savedAt: new Date().toISOString() };
      localStorage.setItem(autoSaveKey, JSON.stringify(draft));
      setLastSavedAt(new Date());
    } catch { /* localStorage full — silently skip */ }
  }, 2000);

  // Trigger auto-save when content changes
  useEffect(() => {
    if (hasUnsavedChanges && autoSaveKey) performAutoSave();
  }, [hasUnsavedChanges, blocks, resTitle, resUnit, resCategory, resDescription, resSections, resScheduleDate, resDueDate, autoSaveKey, performAutoSave]);

  // Restore draft from localStorage on initial load
  useEffect(() => {
    if (!autoSaveKey) return;
    try {
      const raw = localStorage.getItem(autoSaveKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      // Only restore if it has blocks and was saved recently (within 24h)
      if (draft.savedAt && Date.now() - new Date(draft.savedAt).getTime() < 86400000 && draft.blocks?.length) {
        setBlocks(draft.blocks);
        if (draft.resTitle) setResTitle(draft.resTitle);
        if (draft.resUnit) setResUnit(draft.resUnit);
        if (draft.resCategory) setResCategory(draft.resCategory);
        if (draft.resDescription) setResDescription(draft.resDescription);
        setLastSavedAt(new Date(draft.savedAt));
        setHasUnsavedChanges(true);
      }
    } catch { /* corrupt data — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveKey]);

  // Clean localStorage after successful server save
  const clearAutoSave = useCallback(() => {
    if (autoSaveKey) localStorage.removeItem(autoSaveKey);
  }, [autoSaveKey]);

  const existingUnits = useMemo(() => {
    const units = new Set<string>();
    assignments.forEach(a => {
      if (resClasses.has(a.classType) && a.unit) units.add(a.unit);
    });
    return Array.from(units).sort();
  }, [assignments, resClasses]);

  const selectedAssignment = useMemo(() =>
    assignments.find(a => a.id === selectedId) || null,
  [assignments, selectedId]);

  // Load assignment data when selecting
  const selectResource = useCallback((id: string) => {
    const assignment = assignments.find(a => a.id === id);
    if (assignment) {
      setSelectedId(id);
      setIsNewResource(false);
      setBlocks(assignment.lessonBlocks || []);
      setResTitle(assignment.title);
      setResUnit(assignment.unit || 'Unit 1: Overview');
      setResCategory((assignment.category || 'Textbook') as ResourceCategory);
      setResDescription(assignment.description || '');
      setResContentUrl(assignment.contentUrl || null);
      setResClasses(new Set([assignment.classType]));
      setResSections(assignment.targetSections || []);
      setResScheduleDate(assignment.scheduledAt ? assignment.scheduledAt.slice(0, 16) : '');
      setResDueDate(assignment.dueDate ? assignment.dueDate.slice(0, 16) : '');
      setIsAssessment(assignment.isAssessment || false);
      setAssessmentConfig({ allowResubmission: true, maxAttempts: 0, showScoreOnSubmit: true, lockNavigation: true, ...assignment.assessmentConfig });
      setRubricMarkdown(assignment.rubric?.rawMarkdown || '');
      setParsedRubric(assignment.rubric || null);
      setRubricErrors([]);
      setExpandedBlock(null);
      setPreviewMode(false);
      setHasUnsavedChanges(false);
      setAutoSaveStatus('idle');
      setAutoSavedAt(null);
      setShowSettings(false);
      setShowQuestionBank(false);
    }
  }, [assignments]);

  const startNewResource = useCallback(() => {
    setSelectedId(null);
    setIsNewResource(true);
    setBlocks([]);
    setResTitle('');
    setResUnit('Unit 1: Overview');
    setResCategory('Textbook');
    setResDescription('');
    setResContentUrl(null);
    setResClasses(new Set([availableClasses[0] || DefaultClassTypes.AP_PHYSICS]));
    setResSections([]);
    setResScheduleDate('');
    setResDueDate('');
    setIsAssessment(false);
    setAssessmentConfig({ allowResubmission: true, maxAttempts: 0, showScoreOnSubmit: true, lockNavigation: true });
    setRubricMarkdown('');
    setParsedRubric(null);
    setRubricErrors([]);
    setExpandedBlock(null);
    setPreviewMode(false);
    setHasUnsavedChanges(false);
    setShowSettings(true);
    setShowQuestionBank(false);
  }, [availableClasses]);

  // Initialize with initialAssignmentId
  React.useEffect(() => {
    if (initialAssignmentId) selectResource(initialAssignmentId);
  }, [initialAssignmentId, selectResource]);

  const updateBlocks = useCallback((newBlocks: LessonBlock[]) => {
    setBlocks(newBlocks);
    setHasUnsavedChanges(true);
  }, []);

  const insertBlock = useCallback((index: number, type: BlockType) => {
    const newBlock = createEmptyBlock(type);
    const next = [...blocks];
    next.splice(index, 0, newBlock);
    updateBlocks(next);
    setExpandedBlock(newBlock.id);
  }, [blocks, updateBlocks]);

  const removeBlock = useCallback((index: number) => {
    updateBlocks(blocks.filter((_, i) => i !== index));
  }, [blocks, updateBlocks]);

  const moveBlock = useCallback((index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    updateBlocks(next);
  }, [blocks, updateBlocks]);

  const duplicateBlock = useCallback((index: number) => {
    const dup = { ...blocks[index], id: generateId() };
    const next = [...blocks];
    next.splice(index + 1, 0, dup);
    updateBlocks(next);
  }, [blocks, updateBlocks]);

  // ── Drag-and-drop reordering ──
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const blockIds = useMemo(() => blocks.map(b => b.id), [blocks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveBlockId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveBlockId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    updateBlocks(arrayMove(blocks, oldIndex, newIndex));
  }, [blocks, updateBlocks]);

  const activeBlock = activeBlockId ? blocks.find(b => b.id === activeBlockId) : null;

  const buildPayload = useCallback((status: AssignmentStatus, scheduledAt?: string): Partial<Assignment> => {
    const base: Partial<Assignment> = {
      title: resTitle,
      description: resDescription,
      unit: resUnit,
      category: resCategory,
      status,
      lessonBlocks: blocks,
      contentUrl: resContentUrl,
      isAssessment,
      assessmentConfig: isAssessment ? assessmentConfig : undefined,
      rubric: isAssessment && parsedRubric ? parsedRubric : undefined,
    };
    if (resSections.length > 0) base.targetSections = resSections;
    if (scheduledAt) base.scheduledAt = new Date(scheduledAt).toISOString();
    if (resDueDate) base.dueDate = new Date(resDueDate).toISOString();
    if (selectedAssignment?.id && !isNewResource) base.id = selectedAssignment.id;
    return base;
  }, [resTitle, resDescription, resUnit, resCategory, blocks, resContentUrl, resSections, resDueDate, selectedAssignment, isNewResource, isAssessment, assessmentConfig, parsedRubric]);

  // Debounced auto-save to Firestore (10s) for existing assignments only
  const performFirestoreAutoSave = useDebounce(() => {
    if (!mountedRef.current) return;
    if (isNewResource || !selectedAssignment) return;
    if (!hasUnsavedChanges) return;

    setAutoSaveStatus('saving');
    const payload = buildPayload(selectedAssignment.status);
    dataService.addAssignment({ ...selectedAssignment, ...payload } as Assignment)
      .then(() => {
        if (!mountedRef.current) return;
        const now = new Date();
        setAutoSaveStatus('saved');
        setAutoSavedAt(now);
        setHasUnsavedChanges(false);
        setLastSavedAt(now);
        clearAutoSave();
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setAutoSaveStatus('idle');
        toast.error('Auto-save failed — save manually.');
        reportError(err, { component: 'LessonEditorPage', action: 'firestoreAutoSave' });
      });
  }, 10000);

  // Trigger Firestore auto-save when content changes on existing assignments
  useEffect(() => {
    if (hasUnsavedChanges && selectedAssignment && !isNewResource) {
      setAutoSaveStatus('idle'); // reset while debounce timer runs
      performFirestoreAutoSave();
    }
  }, [hasUnsavedChanges, blocks, resTitle, resUnit, resCategory, resDescription, resSections, resScheduleDate, resDueDate, selectedAssignment, isNewResource, performFirestoreAutoSave]);

  const handleDeploy = useCallback(async (status: AssignmentStatus, scheduledAt?: string) => {
    if (!resTitle.trim()) { toast.error('Title is required.'); return; }
    if (resClasses.size === 0) { toast.error('Select a target class.'); return; }
    setIsSaving(true);
    try {
      const payload = buildPayload(status, scheduledAt);
      if (onCreateAssignment) {
        if (selectedAssignment?.id && !isNewResource) {
          // Update existing resource in its current class
          await onCreateAssignment({ ...payload, classType: selectedAssignment.classType });
          // Deploy to any additional classes as new resources
          const additionalClasses = Array.from(resClasses).filter(c => c !== selectedAssignment.classType);
          if (additionalClasses.length > 0) {
            const { id: _id, ...payloadWithoutId } = payload;
            await Promise.all(additionalClasses.map(className =>
              onCreateAssignment!({ ...payloadWithoutId, classType: className })
            ));
            toast.success(`Also deployed to ${additionalClasses.length} additional class${additionalClasses.length > 1 ? 'es' : ''}.`);
          }
        } else {
          await Promise.all(Array.from(resClasses).map(className =>
            onCreateAssignment!({ ...payload, classType: className })
          ));
        }
      } else {
        for (const className of Array.from(resClasses)) {
          if (selectedAssignment?.id && !isNewResource && className === selectedAssignment.classType) {
            await dataService.addAssignment({ ...selectedAssignment, ...payload, classType: className } as Assignment);
          } else {
            const { id: _id, ...payloadWithoutId } = payload;
            await dataService.addAssignment({ ...payloadWithoutId, classType: className } as Assignment);
          }
        }
      }
      toast.success(status === AssignmentStatus.DRAFT ? 'Draft saved.' : scheduledAt ? 'Deployment scheduled.' : 'Resource deployed!');
      setHasUnsavedChanges(false);
      setIsNewResource(false);
      clearAutoSave();
    } catch (err) {
      toast.error('Save failed.');
      reportError(err, { component: 'LessonEditorPage' });
    } finally {
      setIsSaving(false);
    }
  }, [resTitle, resClasses, buildPayload, onCreateAssignment, selectedAssignment, isNewResource, toast, clearAutoSave]);

  const handleSave = useCallback(async () => {
    if (!selectedAssignment && !isNewResource) return;
    if (isNewResource) {
      await handleDeploy(AssignmentStatus.ACTIVE);
      return;
    }
    setIsSaving(true);
    try {
      const payload = buildPayload(selectedAssignment!.status);
      await dataService.addAssignment({ ...selectedAssignment, ...payload } as Assignment);
      toast.success('Saved!');
      setHasUnsavedChanges(false);
      setAutoSaveStatus('idle');
      setAutoSavedAt(null);
      clearAutoSave();
    } catch (err) {
      toast.error('Failed to save.');
      reportError(err, { component: 'LessonEditorPage' });
    } finally {
      setIsSaving(false);
    }
  }, [selectedAssignment, isNewResource, handleDeploy, buildPayload, toast, clearAutoSave]);

  const handleJsonImport = useCallback(() => {
    setJsonError('');
    try {
      const parsed = JSON.parse(jsonText);
      let imported: LessonBlock[];
      if (Array.isArray(parsed)) imported = parsed;
      else if (parsed?.blocks && Array.isArray(parsed.blocks)) imported = parsed.blocks;
      else { setJsonError('JSON must be an array of blocks or { blocks: [...] }'); return; }
      imported = imported.map(b => {
        if (!b.type) throw new Error('Block missing "type" field');
        return { ...b, id: b.id || generateId(), content: b.content ?? '' };
      });
      updateBlocks([...blocks, ...imported]);
      setShowJsonImport(false);
      setJsonText('');
      toast.success(`${imported.length} blocks imported!`);
    } catch (e: unknown) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }, [jsonText, blocks, updateBlocks, toast]);

  // Resource management actions (moved from Admin Panel)
  const handleQuickDeploy = useCallback(async (id: string) => {
    try {
      await dataService.updateAssignmentStatus(id, AssignmentStatus.ACTIVE);
      toast.success('Resource deployed!');
    } catch { toast.error('Deploy failed.'); }
  }, [toast]);

  const handleArchive = useCallback(async (id: string, currentStatus: AssignmentStatus) => {
    try {
      const newStatus = currentStatus === AssignmentStatus.ARCHIVED ? AssignmentStatus.ACTIVE : AssignmentStatus.ARCHIVED;
      await dataService.updateAssignmentStatus(id, newStatus);
      toast.success(newStatus === AssignmentStatus.ARCHIVED ? 'Archived.' : 'Restored.');
    } catch { toast.error('Status change failed.'); }
  }, [toast]);

  const handleDeleteResource = useCallback(async (id: string) => {
    if (!window.confirm('Delete this resource permanently?')) return;
    try {
      await dataService.deleteAssignment(id);
      if (selectedId === id) { setSelectedId(null); setIsNewResource(false); }
      toast.success('Resource deleted.');
    } catch { toast.error('Delete failed.'); }
  }, [selectedId, toast]);

  const isEditing = selectedAssignment !== null || isNewResource;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0f0720] flex flex-col">
      {/* Top bar */}
      <div className="bg-black/40 backdrop-blur-md border-b border-white/10 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-400" /> Resource Editor
          </h1>
          {isEditing && (
            <span className="text-xs text-gray-400 bg-white/5 px-3 py-1 rounded-lg border border-white/10 flex items-center gap-2">
              {isNewResource ? 'New Resource' : resTitle}
              {autoSaveStatus === 'saving' && (
                <span className="text-purple-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Auto-saving...</span>
              )}
              {autoSaveStatus !== 'saving' && hasUnsavedChanges && <span className="text-amber-400">*unsaved</span>}
              {autoSaveStatus === 'saved' && !hasUnsavedChanges && autoSavedAt && (
                <span className="text-emerald-400/70 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Auto-saved {autoSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {autoSaveStatus !== 'saved' && lastSavedAt && !hasUnsavedChanges && (
                <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {lastSavedAt && hasUnsavedChanges && autoSaveStatus !== 'saving' && (
                <span className="text-gray-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Draft {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <>
              <button type="button" onClick={() => setShowJsonImport(!showJsonImport)} className="flex items-center gap-1.5 text-[10px] text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg border border-purple-500/20 uppercase font-bold tracking-wider transition">
                <Upload className="w-3 h-3" /> Paste JSON
              </button>
              <button type="button" onClick={() => setPreviewMode(!previewMode)} className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg border uppercase font-bold tracking-wider transition ${previewMode ? 'text-purple-300 bg-purple-500/20 border-purple-500/30' : 'text-gray-300 bg-white/5 border-white/10 hover:text-white'}`}>
                <Eye className="w-3 h-3" /> {previewMode ? 'Edit' : 'Preview'}
              </button>
              <button type="button" onClick={handleSave} disabled={isSaving || !hasUnsavedChanges} className="flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 px-3 py-1.5 rounded-lg border border-emerald-500/20 uppercase font-bold tracking-wider transition">
                <Save className="w-3 h-3" /> {isSaving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
          <div className="w-px h-6 bg-white/10" />
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>
      </div>

      {/* JSON Import Panel */}
      {showJsonImport && (
        <div className="bg-black/60 border-b border-white/10 px-6 py-4 shrink-0">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="text-xs text-gray-400">Paste a JSON array of blocks or <code className="text-purple-300">{"{ blocks: [...] }"}</code></div>
            <textarea value={jsonText} onChange={e => { setJsonText(e.target.value); setJsonError(''); }} placeholder='[{"type":"TEXT","content":"Hello"}]' className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-xs font-mono text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition min-h-[120px]" />
            {jsonError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{jsonError}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={handleJsonImport} disabled={!jsonText.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition">Import</button>
              <button type="button" onClick={() => { setShowJsonImport(false); setJsonText(''); setJsonError(''); }} className="px-4 py-2 text-gray-400 hover:text-white text-xs transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <ResourceSidebar
          assignments={assignments}
          assignmentsByUnit={assignmentsByUnit}
          selectedId={selectedId}
          onSelectResource={selectResource}
          onStartNew={startNewResource}
          onQuickDeploy={handleQuickDeploy}
          onArchive={handleArchive}
          onDelete={handleDeleteResource}
          availableClasses={availableClasses}
          classConfigs={classConfigs}
        />
        {/* Main editor area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {!isEditing ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <BookOpen className="w-16 h-16 text-gray-700 mb-4" />
              <h2 className="text-xl font-bold text-gray-400 mb-2">Select or Create a Resource</h2>
              <p className="text-sm text-gray-600 max-w-md mb-6">Choose a resource from the sidebar to edit, or create a new one.</p>
              <button onClick={startNewResource} className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 transition shadow-xl">
                <Plus className="w-5 h-5" /> New Resource
              </button>
            </div>
          ) : previewMode ? (
            <div className="flex flex-col h-full">
              {/* HTML preview iframe (if resource has HTML content) */}
              {resContentUrl && (
                <div className={`relative bg-white ${blocks.length > 0 ? 'flex-[3]' : 'flex-1'}`}>
                  <iframe
                    src={resContentUrl}
                    className="w-full h-full border-none bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    title="Resource Preview"
                  />
                </div>
              )}
              {/* Lesson blocks preview */}
              {blocks.length > 0 && (
                <div className={`${resContentUrl ? 'flex-[2] border-t border-white/10 overflow-y-auto p-6' : 'flex-1 overflow-y-auto p-6'}`}>
                  <LessonBlocks blocks={blocks} showSidebar />
                </div>
              )}
              {/* Empty state */}
              {!resContentUrl && blocks.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                  No content to preview. Add blocks or upload HTML.
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto p-6 pb-32">
              {/* Resource Settings — collapsible header */}
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="w-full flex items-center justify-between px-4 py-2.5 mb-4 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.05] transition cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Settings className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest shrink-0">Settings</span>
                  {!showSettings && resTitle && (
                    <span className="text-xs text-gray-500 truncate ml-2">{resTitle} — {resUnit} — {Array.from(resClasses).join(', ')}</span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>
              {showSettings && (
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 mb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className={labelClass}>Title</label><input type="text" value={resTitle} onChange={e => { setResTitle(e.target.value); setHasUnsavedChanges(true); }} placeholder="Resource title..." className={inputClass} /></div>
                    <UnitSelector value={resUnit} onChange={(val) => { setResUnit(val); setHasUnsavedChanges(true); }} existingUnits={existingUnits} />
                    <div><label className={labelClass}>Category</label><select value={resCategory} onChange={e => { setResCategory(e.target.value as ResourceCategory); setHasUnsavedChanges(true); }} className={inputClass}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  </div>

                  <div>
                    <label className={labelClass}>Target Classes</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {availableClasses.map(c => (
                        <button key={c} type="button" onClick={() => { const s = new Set(resClasses); s.has(c) ? (s.size > 1 && s.delete(c)) : s.add(c); setResClasses(s); setResSections([]); setHasUnsavedChanges(true); }} className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition ${resClasses.has(c) ? 'bg-purple-600 border-purple-600 text-white' : 'bg-black/30 border-white/10 text-gray-400'}`}>{c}</button>
                      ))}
                    </div>
                  </div>

                  <SectionPicker availableSections={classSections} selectedSections={resSections} onChange={(s) => { setResSections(s); setHasUnsavedChanges(true); }} />

                  <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-xl">
                    <label className="block text-[11px] font-bold text-purple-300 mb-2">HTML Interactive Upload</label>
                    <input type="file" accept=".html,.htm" className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-purple-600 file:text-white file:text-xs" onChange={async (e) => { if(e.target.files?.[0]) { setIsUploading(true); try { const url = await dataService.uploadHtmlResource(e.target.files[0]); setResContentUrl(url); setHasUnsavedChanges(true); toast.success('File uploaded!'); } catch (err) { toast.error('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error')); } finally { setIsUploading(false); } } }} />
                    {isUploading && <div className="flex items-center gap-2 mt-2 text-purple-300 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</div>}
                    {!isUploading && resContentUrl && <div className="flex items-center gap-2 mt-2 text-emerald-400 text-xs"><CheckCircle className="w-3.5 h-3.5" /> Resource uploaded</div>}
                  </div>

                  <div><label className={labelClass}>Description <span className="text-gray-600">(optional)</span></label><textarea value={resDescription} onChange={e => { setResDescription(e.target.value); setHasUnsavedChanges(true); }} placeholder="Brief description..." className={`${textareaClass} h-16`} /></div>

                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Schedule <span className="text-gray-600">(optional)</span></label><input type="datetime-local" value={resScheduleDate} onChange={e => { setResScheduleDate(e.target.value); setHasUnsavedChanges(true); }} className={inputClass} /></div>
                    <div><label className={labelClass}>Due Date <span className="text-gray-600">(optional)</span></label><input type="datetime-local" value={resDueDate} onChange={e => { setResDueDate(e.target.value); setHasUnsavedChanges(true); }} className={inputClass} /></div>
                  </div>

                  {/* Assessment Mode */}
                  <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div
                        className={`w-10 h-5 rounded-full transition-colors ${isAssessment ? 'bg-red-600' : 'bg-gray-700'} relative`}
                        onClick={() => { setIsAssessment(prev => !prev); setHasUnsavedChanges(true); }}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${isAssessment ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-red-400" /> Assessment Mode
                      </span>
                    </label>
                    {isAssessment && (
                      <div className="mt-3 space-y-2 pl-2 border-l-2 border-red-500/30">
                        <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                          <input type="checkbox" checked={assessmentConfig.allowResubmission} onChange={e => { setAssessmentConfig(prev => ({ ...prev, allowResubmission: e.target.checked })); setHasUnsavedChanges(true); }} className="rounded bg-black/40 border-white/20 text-purple-500" />
                          Allow resubmission
                        </label>
                        {assessmentConfig.allowResubmission && (
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-gray-400">Max attempts:</label>
                            <input type="number" min={0} value={assessmentConfig.maxAttempts} onChange={e => { setAssessmentConfig(prev => ({ ...prev, maxAttempts: parseInt(e.target.value) || 0 })); setHasUnsavedChanges(true); }} className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white" />
                            <span className="text-[10px] text-gray-500">0 = unlimited</span>
                          </div>
                        )}
                        <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                          <input type="checkbox" checked={assessmentConfig.showScoreOnSubmit} onChange={e => { setAssessmentConfig(prev => ({ ...prev, showScoreOnSubmit: e.target.checked })); setHasUnsavedChanges(true); }} className="rounded bg-black/40 border-white/20 text-purple-500" />
                          Show score on submit
                        </label>

                        {/* Rubric Import */}
                        <div className="mt-2 pt-2 border-t border-white/5">
                          <label className="text-[11px] text-gray-300 font-bold flex items-center gap-1.5 mb-1.5">
                            <BookOpen className="w-3 h-3 text-amber-400" /> Assessment Rubric
                          </label>
                          <textarea
                            value={rubricMarkdown}
                            onChange={e => {
                              const val = e.target.value;
                              setRubricMarkdown(val);
                              setHasUnsavedChanges(true);
                              if (val.trim()) {
                                const parsed = parseRubricMarkdown(val);
                                const errors = validateRubric(parsed);
                                setParsedRubric(errors.length === 0 ? parsed : null);
                                setRubricErrors(errors);
                              } else {
                                setParsedRubric(null);
                                setRubricErrors([]);
                              }
                            }}
                            placeholder="Paste rubric markdown here..."
                            rows={4}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white placeholder-gray-600 font-mono resize-y focus:outline-none focus:border-purple-500/50 transition"
                          />
                          {rubricErrors.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {rubricErrors.map((err, i) => (
                                <div key={i} className="text-[10px] text-red-400">{err}</div>
                              ))}
                            </div>
                          )}
                          {parsedRubric && (
                            <div className="mt-1 text-[10px] text-green-400">
                              Rubric parsed: {parsedRubric.questions.length} question{parsedRubric.questions.length !== 1 ? 's' : ''}, {parsedRubric.questions.reduce((acc, q) => acc + q.skills.length, 0)} skill{parsedRubric.questions.reduce((acc, q) => acc + q.skills.length, 0) !== 1 ? 's' : ''}
                            </div>
                          )}
                          {parsedRubric && (
                            <details className="mt-2">
                              <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-300 transition">
                                Preview rubric
                              </summary>
                              <div className="mt-2 max-h-64 overflow-y-auto custom-scrollbar">
                                <React.Suspense fallback={<div className="text-[10px] text-gray-500">Loading preview...</div>}>
                                  <RubricViewer rubric={parsedRubric} mode="view" />
                                </React.Suspense>
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Review Questions */}
                  {selectedAssignment && !isNewResource && (
                    <button
                      type="button"
                      onClick={() => setShowQuestionBank(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-teal-900/20 border border-teal-500/30 rounded-xl hover:bg-teal-900/30 transition"
                    >
                      <Brain aria-hidden="true" className="w-4 h-4 text-teal-400" />
                      <div className="text-left">
                        <div className="text-xs font-bold text-teal-300">Review Questions</div>
                        <div className="text-[10px] text-gray-400">Manage the conceptual review question bank for this resource</div>
                      </div>
                    </button>
                  )}

                  {/* Deploy Actions */}
                  <div className="flex gap-2 pt-1">
                    <button type="button" disabled={isSaving} onClick={() => handleDeploy(AssignmentStatus.DRAFT)} className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 py-3 rounded-xl font-bold text-xs transition">
                      <FileText className="w-3.5 h-3.5" /> Save Draft
                    </button>
                    {resScheduleDate ? (
                      <button type="button" disabled={isSaving} onClick={() => handleDeploy(AssignmentStatus.ACTIVE, resScheduleDate)} className="flex-[2] flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl font-bold text-xs transition">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CalendarClock className="w-3.5 h-3.5" /> Schedule</>}
                      </button>
                    ) : (
                      <button type="button" disabled={isSaving} onClick={() => handleDeploy(AssignmentStatus.ACTIVE)} className="flex-[2] flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-xl font-bold text-xs transition">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Rocket className="w-3.5 h-3.5" /> Deploy</>}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Block editor */}
              <div className="space-y-0">
                <InsertButton onInsert={(type) => insertBlock(0, type)} />

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
                    {blocks.map((block, index) => {
                      const typeInfo = getBlockTypeInfo(block.type);
                      const isExpanded = expandedBlock === block.id;

                      return (
                        <React.Fragment key={block.id}>
                          <SortableBlockRow id={block.id}>
                            {(dragHandleProps) => (
                              <div className={`border rounded-2xl transition-all ${isExpanded ? 'bg-white/5 border-purple-500/30 shadow-lg shadow-purple-500/5' : 'bg-white/[0.02] border-white/5 hover:border-white/15'}`}>
                                <div className="w-full flex items-center gap-3 px-4 py-3 text-left">
                                  <div
                                    {...dragHandleProps}
                                    className="cursor-grab active:cursor-grabbing p-1 -ml-2 text-gray-600 hover:text-purple-400 transition touch-none"
                                    title="Drag to reorder"
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </div>
                                  <button type="button" onClick={() => setExpandedBlock(isExpanded ? null : block.id)} className="flex items-center gap-3 flex-1 min-w-0">
                                    <span className="text-gray-500">{typeInfo?.icon}</span>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24 shrink-0">{typeInfo?.label}</span>
                                    <span className="text-xs text-gray-400 truncate flex-1">{getBlockSummary(block)}</span>
                                  </button>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} className="p-1 text-gray-600 hover:text-white disabled:opacity-20 transition"><ChevronUp className="w-3.5 h-3.5" /></button>
                                    <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="p-1 text-gray-600 hover:text-white disabled:opacity-20 transition"><ChevronDown className="w-3.5 h-3.5" /></button>
                                    <button type="button" onClick={() => duplicateBlock(index)} className="p-1 text-gray-600 hover:text-blue-400 transition"><Copy className="w-3.5 h-3.5" /></button>
                                    <button type="button" onClick={() => removeBlock(index)} className="p-1 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                  <button type="button" onClick={() => setExpandedBlock(isExpanded ? null : block.id)} className="p-0">
                                    <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                  </button>
                                </div>

                                {isExpanded && (
                                  <div className="px-4 pb-4 border-t border-white/5 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <InlineBlockEditor block={block} allBlocks={blocks} onUpdate={(updated) => { const next = [...blocks]; next[index] = updated; updateBlocks(next); }} />
                                  </div>
                                )}
                              </div>
                            )}
                          </SortableBlockRow>

                          <InsertButton onInsert={(type) => insertBlock(index + 1, type)} />
                        </React.Fragment>
                      );
                    })}
                  </SortableContext>

                  <DragOverlay>
                    {activeBlock ? (() => {
                      const typeInfo = getBlockTypeInfo(activeBlock.type);
                      return (
                        <div className="border border-purple-500/40 rounded-2xl bg-[#0f0720]/95 backdrop-blur-sm shadow-xl shadow-purple-500/10">
                          <div className="w-full flex items-center gap-3 px-4 py-3 text-left">
                            <div className="p-1 -ml-2 text-purple-400">
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-gray-500">{typeInfo?.icon}</span>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24 shrink-0">{typeInfo?.label}</span>
                            <span className="text-xs text-gray-400 truncate flex-1">{getBlockSummary(activeBlock)}</span>
                          </div>
                        </div>
                      );
                    })() : null}
                  </DragOverlay>
                </DndContext>

                {blocks.length === 0 && (
                  <div className="text-center py-12 text-gray-600">
                    <p className="text-sm mb-2">No blocks yet. Click the <Plus className="w-4 h-4 inline" /> button above to add your first block.</p>
                    <p className="text-xs">Or paste JSON to import blocks in bulk.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Question Bank Manager Modal */}
      {selectedAssignment && showQuestionBank && (
        <React.Suspense fallback={null}>
          <QuestionBankManager
            assignment={selectedAssignment}
            isOpen={showQuestionBank}
            onClose={() => setShowQuestionBank(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
};


export default LessonEditorPage;

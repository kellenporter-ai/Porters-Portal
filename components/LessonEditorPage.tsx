
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Type, HelpCircle, MessageSquare,
  BookOpen, ListChecks, Info, Eye, GripVertical, Copy, Heading,
  Image, Play, Target, Minus, ExternalLink, Code, List, Zap,
  ArrowUpDown, Table, BarChart3, Link, Upload, Save, X,
  ChevronRight, Layers, Search, Settings, Loader2, CalendarClock, FileText, CheckCircle, Rocket
} from 'lucide-react';
import { LessonBlock, BlockType, Assignment, AssignmentStatus, DefaultClassTypes, ClassConfig, ResourceCategory, User, getSectionsForClass } from '../types';
import LessonBlocks from './LessonBlocks';
import SectionPicker from './SectionPicker';
import { dataService } from '../services/dataService';
import { useToast } from './ToastProvider';
import { sortUnitKeys } from './AdminPanel';

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
    case 'BAR_CHART': return { ...base, title: '', barCount: 3, initialLabel: 'Initial', finalLabel: 'Final', deltaLabel: 'Change', height: 300 };
    case 'RANKING': return { ...base, items: [''] };
    case 'LINKED': return { ...base, linkedBlockId: '', acceptedAnswers: [''] };
    default: return base;
  }
};

// ──────────────────────────────────────────────
// AI Prompt generators
// ──────────────────────────────────────────────

// AI prompts are now consolidated in the Admin Panel's AI Lab


// ──────────────────────────────────────────────
// Inline block type palette (for "+" buttons)
// ──────────────────────────────────────────────
const BlockTypePalette: React.FC<{ onSelect: (type: BlockType) => void; onClose: () => void }> = ({ onSelect, onClose }) => {
  const categories = ['Content', 'Interactive', 'Questions'];
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
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set(Object.keys(assignmentsByUnit)));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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

  const classSections = useMemo(() => {
    const firstClass = Array.from(resClasses)[0];
    if (!firstClass) return availableSections;
    const perClass = getSectionsForClass(students, firstClass);
    return perClass.length > 0 ? perClass : availableSections;
  }, [resClasses, students, availableSections]);

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
      setExpandedBlock(null);
      setPreviewMode(false);
      setHasUnsavedChanges(false);
      setShowSettings(false);
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
    setExpandedBlock(null);
    setPreviewMode(false);
    setHasUnsavedChanges(false);
    setShowSettings(true);
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

  const buildPayload = useCallback((status: AssignmentStatus, scheduledAt?: string): Partial<Assignment> => {
    const base: Partial<Assignment> = {
      title: resTitle,
      description: resDescription,
      unit: resUnit,
      category: resCategory,
      status,
      lessonBlocks: blocks,
      contentUrl: resContentUrl,
    };
    if (resSections.length > 0) base.targetSections = resSections;
    if (scheduledAt) base.scheduledAt = new Date(scheduledAt).toISOString();
    if (resDueDate) base.dueDate = new Date(resDueDate).toISOString();
    if (selectedAssignment?.id && !isNewResource) base.id = selectedAssignment.id;
    return base;
  }, [resTitle, resDescription, resUnit, resCategory, blocks, resContentUrl, resSections, resDueDate, selectedAssignment, isNewResource]);

  const handleDeploy = useCallback(async (status: AssignmentStatus, scheduledAt?: string) => {
    if (!resTitle.trim()) { toast.error('Title is required.'); return; }
    if (resClasses.size === 0) { toast.error('Select a target class.'); return; }
    setIsSaving(true);
    try {
      const payload = buildPayload(status, scheduledAt);
      if (onCreateAssignment) {
        if (selectedAssignment?.id && !isNewResource) {
          await onCreateAssignment({ ...payload, classType: Array.from(resClasses)[0] });
        } else {
          await Promise.all(Array.from(resClasses).map(className =>
            onCreateAssignment!({ ...payload, classType: className })
          ));
        }
      } else {
        // Fallback: direct save via dataService
        for (const className of Array.from(resClasses)) {
          await dataService.addAssignment({ ...payload, classType: className } as Assignment);
        }
      }
      toast.success(status === AssignmentStatus.DRAFT ? 'Draft saved.' : scheduledAt ? 'Deployment scheduled.' : 'Resource deployed!');
      setHasUnsavedChanges(false);
      setIsNewResource(false);
    } catch (err) {
      toast.error('Save failed.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [resTitle, resClasses, buildPayload, onCreateAssignment, selectedAssignment, isNewResource, toast]);

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
    } catch (err) {
      toast.error('Failed to save.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [selectedAssignment, isNewResource, handleDeploy, buildPayload, toast]);

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

  const filteredUnits = useMemo(() => {
    if (!searchFilter) return assignmentsByUnit;
    const lower = searchFilter.toLowerCase();
    const result: Record<string, Assignment[]> = {};
    Object.entries(assignmentsByUnit).forEach(([unit, items]) => {
      const filtered = items.filter(a => a.title.toLowerCase().includes(lower) || unit.toLowerCase().includes(lower));
      if (filtered.length > 0) result[unit] = filtered;
    });
    return result;
  }, [assignmentsByUnit, searchFilter]);

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
            <span className="text-xs text-gray-400 bg-white/5 px-3 py-1 rounded-lg border border-white/10">
              {isNewResource ? 'New Resource' : resTitle}
              {hasUnsavedChanges && <span className="ml-2 text-amber-400">*unsaved</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowJsonImport(!showJsonImport)} className="flex items-center gap-1.5 text-[10px] text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg border border-purple-500/20 uppercase font-bold tracking-wider transition">
            <Upload className="w-3 h-3" /> Paste JSON
          </button>
          {isEditing && (
            <>
              <button type="button" onClick={() => setShowSettings(!showSettings)} className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg border uppercase font-bold tracking-wider transition ${showSettings ? 'text-amber-300 bg-amber-500/20 border-amber-500/30' : 'text-gray-300 bg-white/5 border-white/10 hover:text-white'}`}>
                <Settings className="w-3 h-3" /> Settings
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
        <div className="w-72 border-r border-white/10 bg-black/20 flex flex-col shrink-0">
          <div className="p-3 border-b border-white/5 space-y-2">
            <button onClick={startNewResource} className="w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg">
              <Plus className="w-4 h-4" /> New Resource
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input type="text" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} placeholder="Search resources..." className="w-full pl-9 pr-3 py-2 bg-black/30 border border-white/10 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {(() => {
              const firstClass = Array.from(resClasses)[0];
              const unitOrder = classConfigs?.find(c => c.className === firstClass)?.unitOrder;
              const sortedKeys = sortUnitKeys(Object.keys(filteredUnits), unitOrder);
              return sortedKeys.map(k => [k, filteredUnits[k]] as [string, Assignment[]]);
            })().map(([unit, items]) => (
              <div key={unit}>
                <button onClick={() => setExpandedUnits(prev => { const n = new Set(prev); n.has(unit) ? n.delete(unit) : n.add(unit); return n; })} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5 rounded-lg transition">
                  {expandedUnits.has(unit) ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate flex-1">{unit}</span>
                  <span className="text-[9px] text-gray-600 font-mono">{items.length}</span>
                </button>
                {expandedUnits.has(unit) && items.map(a => {
                  const hasBlocks = a.lessonBlocks && a.lessonBlocks.length > 0;
                  const hasHtml = !!a.contentUrl;
                  return (
                    <button key={a.id} onClick={() => selectResource(a.id)} className={`w-full flex items-center gap-2 px-3 py-2 ml-2 rounded-lg text-left transition text-[11px] ${selectedId === a.id ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}>
                      <Layers className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate flex-1">{a.title}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasBlocks && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1 rounded font-mono">{a.lessonBlocks!.length}b</span>}
                        {hasHtml && <span className="text-[8px] text-cyan-400 bg-cyan-500/10 px-1 rounded font-mono">html</span>}
                        {a.status === AssignmentStatus.DRAFT && <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1 rounded font-mono">draft</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
            {Object.keys(filteredUnits).length === 0 && (
              <div className="text-center py-8 text-gray-600 text-xs">No resources found</div>
            )}
          </div>
        </div>

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
            <div className="max-w-3xl mx-auto p-8">
              <LessonBlocks blocks={blocks} showSidebar />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto p-6 pb-32">
              {/* Resource Settings Panel */}
              {showSettings && (
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 mb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Settings className="w-3.5 h-3.5" /> Resource Settings</h3>
                    <button type="button" onClick={() => setShowSettings(false)} className="text-gray-600 hover:text-gray-300 transition"><X className="w-4 h-4" /></button>
                  </div>

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

                {blocks.map((block, index) => {
                  const typeInfo = getBlockTypeInfo(block.type);
                  const isExpanded = expandedBlock === block.id;

                  return (
                    <React.Fragment key={block.id}>
                      <div className={`border rounded-2xl transition-all ${isExpanded ? 'bg-white/5 border-purple-500/30 shadow-lg shadow-purple-500/5' : 'bg-white/[0.02] border-white/5 hover:border-white/15'}`}>
                        <button type="button" onClick={() => setExpandedBlock(isExpanded ? null : block.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                          <span className="text-gray-500">{typeInfo?.icon}</span>
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24 shrink-0">{typeInfo?.label}</span>
                          <span className="text-xs text-gray-400 truncate flex-1">{getBlockSummary(block)}</span>
                          <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} className="p-1 text-gray-600 hover:text-white disabled:opacity-20 transition"><ChevronUp className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="p-1 text-gray-600 hover:text-white disabled:opacity-20 transition"><ChevronDown className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => duplicateBlock(index)} className="p-1 text-gray-600 hover:text-blue-400 transition"><Copy className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => removeBlock(index)} className="p-1 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                          <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-white/5 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                            <InlineBlockEditor block={block} allBlocks={blocks} onUpdate={(updated) => { const next = [...blocks]; next[index] = updated; updateBlocks(next); }} />
                          </div>
                        )}
                      </div>

                      <InsertButton onInsert={(type) => insertBlock(index + 1, type)} />
                    </React.Fragment>
                  );
                })}

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
    </div>
  );
};

// ──────────────────────────────────────────────
// Inline block editor (reuses input styling)
// ──────────────────────────────────────────────
const inputClass = "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition";
const textareaClass = "w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition";
const labelClass = "text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-1";

const InlineBlockEditor: React.FC<{ block: LessonBlock; allBlocks: LessonBlock[]; onUpdate: (b: LessonBlock) => void }> = ({ block, allBlocks, onUpdate }) => {
  switch (block.type) {
    case 'TEXT':
      return <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Enter text content..." className={`${textareaClass} min-h-[80px]`} rows={3} />;
    case 'SECTION_HEADER':
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div><label className={labelClass}>Icon</label><input type="text" value={block.icon || ''} onChange={e => onUpdate({ ...block, icon: e.target.value })} placeholder="📚" className={inputClass} /></div>
            <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Section title..." className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Subtitle</label><input type="text" value={block.subtitle || ''} onChange={e => onUpdate({ ...block, subtitle: e.target.value })} placeholder="Optional subtitle..." className={inputClass} /></div>
        </div>
      );
    case 'IMAGE':
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Image URL</label><input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} placeholder="https://..." className={inputClass} /></div>
          {block.url && <img src={block.url} alt={block.alt || ''} className="max-h-32 rounded-lg border border-white/10 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />}
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Caption</label><input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} placeholder="Caption..." className={inputClass} /></div>
            <div><label className={labelClass}>Alt Text</label><input type="text" value={block.alt || ''} onChange={e => onUpdate({ ...block, alt: e.target.value })} placeholder="Describe..." className={inputClass} /></div>
          </div>
        </div>
      );
    case 'VIDEO':
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>YouTube URL</label><input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} placeholder="https://youtube.com/watch?v=..." className={inputClass} /></div>
          <div><label className={labelClass}>Caption</label><input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} placeholder="Caption..." className={inputClass} /></div>
        </div>
      );
    case 'OBJECTIVES': {
      const items = block.items || [''];
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <Target className="w-4 h-4 text-emerald-400 mt-2 shrink-0" />
              <input type="text" value={item} onChange={e => { const n = [...items]; n[idx] = e.target.value; onUpdate({ ...block, items: n }); }} placeholder={`Objective ${idx + 1}`} className={`flex-1 ${inputClass}`} />
              {items.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, items: items.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, items: [...items, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
        </div>
      );
    }
    case 'DIVIDER':
      return <div className="text-xs text-gray-500 italic">Horizontal divider — no configuration needed.</div>;
    case 'EXTERNAL_LINK':
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>URL</label><input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Description</label><input type="text" value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Button Label</label><input type="text" value={block.buttonLabel || ''} onChange={e => onUpdate({ ...block, buttonLabel: e.target.value })} className={inputClass} /></div>
            <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={block.openInNewTab ?? true} onChange={e => onUpdate({ ...block, openInNewTab: e.target.checked })} /> New tab</label></div>
          </div>
        </div>
      );
    case 'EMBED':
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Embed URL</label><input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Caption</label><input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Height (px)</label><input type="number" value={block.height || 500} onChange={e => onUpdate({ ...block, height: parseInt(e.target.value) || 500 })} className={inputClass} /></div>
          </div>
        </div>
      );
    case 'INFO_BOX':
      return (
        <div className="space-y-2">
          <div className="flex gap-2">{(['tip', 'warning', 'note'] as const).map(v => <button key={v} type="button" onClick={() => onUpdate({ ...block, variant: v })} className={`px-3 py-1 rounded-lg border text-xs font-bold capitalize transition ${block.variant === v ? (v === 'tip' ? 'bg-green-500/20 border-green-500/30 text-green-400' : v === 'warning' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-blue-500/20 border-blue-500/30 text-blue-400') : 'bg-black/30 border-white/10 text-gray-400'}`}>{v}</button>)}</div>
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Content..." className={textareaClass} rows={2} />
        </div>
      );
    case 'MC': {
      const options = block.options || ['', ''];
      return (
        <div className="space-y-2">
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Question..." className={textareaClass} rows={2} />
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <button type="button" onClick={() => onUpdate({ ...block, correctAnswer: idx })} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${block.correctAnswer === idx ? 'border-green-500 bg-green-500' : 'border-gray-600'}`}>{block.correctAnswer === idx && <div className="w-2 h-2 bg-white rounded-full" />}</button>
              <input type="text" value={opt} onChange={e => { const n = [...options]; n[idx] = e.target.value; onUpdate({ ...block, options: n }); }} placeholder={`Option ${String.fromCharCode(65 + idx)}`} className={`flex-1 ${inputClass}`} />
              {options.length > 2 && <button type="button" onClick={() => { const n = options.filter((_, i) => i !== idx); onUpdate({ ...block, options: n, correctAnswer: block.correctAnswer === idx ? 0 : (block.correctAnswer || 0) > idx ? (block.correctAnswer || 0) - 1 : block.correctAnswer }); }} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          {options.length < 6 && <button type="button" onClick={() => onUpdate({ ...block, options: [...options, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Option</button>}
        </div>
      );
    }
    case 'SHORT_ANSWER': {
      const answers = block.acceptedAnswers || [''];
      return (
        <div className="space-y-2">
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Question..." className={textareaClass} rows={2} />
          <label className={labelClass}>Accepted Answers</label>
          {answers.map((ans, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={ans} onChange={e => { const n = [...answers]; n[idx] = e.target.value; onUpdate({ ...block, acceptedAnswers: n }); }} placeholder={`Answer ${idx + 1}`} className={`flex-1 ${inputClass}`} />
              {answers.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: answers.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: [...answers, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Answer</button>
        </div>
      );
    }
    case 'VOCABULARY':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelClass}>Term</label><input type="text" value={block.term || ''} onChange={e => onUpdate({ ...block, term: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Definition</label><input type="text" value={block.definition || ''} onChange={e => onUpdate({ ...block, definition: e.target.value })} className={inputClass} /></div>
        </div>
      );
    case 'VOCAB_LIST': {
      const terms = block.terms || [{ term: '', definition: '' }];
      return (
        <div className="space-y-2">
          {terms.map((t, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={t.term} onChange={e => { const n = [...terms]; n[idx] = { ...n[idx], term: e.target.value }; onUpdate({ ...block, terms: n }); }} placeholder="Term" className={`flex-1 ${inputClass}`} />
              <input type="text" value={t.definition} onChange={e => { const n = [...terms]; n[idx] = { ...n[idx], definition: e.target.value }; onUpdate({ ...block, terms: n }); }} placeholder="Definition" className={`flex-1 ${inputClass}`} />
              {terms.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, terms: terms.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, terms: [...terms, { term: '', definition: '' }] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Term</button>
        </div>
      );
    }
    case 'CHECKLIST': {
      const items = block.items || [''];
      return (
        <div className="space-y-2">
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Checklist title..." className={textareaClass} rows={1} />
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2"><div className="w-5 h-5 rounded border-2 border-gray-600 shrink-0 mt-1.5" />
              <input type="text" value={item} onChange={e => { const n = [...items]; n[idx] = e.target.value; onUpdate({ ...block, items: n }); }} placeholder={`Item ${idx + 1}`} className={`flex-1 ${inputClass}`} />
              {items.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, items: items.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, items: [...items, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Item</button>
        </div>
      );
    }
    case 'ACTIVITY':
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div><label className={labelClass}>Icon</label><input type="text" value={block.icon || ''} onChange={e => onUpdate({ ...block, icon: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Instructions</label><textarea value={block.instructions || ''} onChange={e => onUpdate({ ...block, instructions: e.target.value })} className={`${textareaClass} min-h-[60px]`} rows={2} /></div>
        </div>
      );
    case 'SORTING': {
      const sortItems = block.sortItems || [{ text: '', correct: 'left' as const }];
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Instructions</label><textarea value={block.instructions || ''} onChange={e => onUpdate({ ...block, instructions: e.target.value })} className={textareaClass} rows={1} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Left Category</label><input type="text" value={block.leftLabel || ''} onChange={e => onUpdate({ ...block, leftLabel: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Right Category</label><input type="text" value={block.rightLabel || ''} onChange={e => onUpdate({ ...block, rightLabel: e.target.value })} className={inputClass} /></div>
          </div>
          {sortItems.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={item.text} onChange={e => { const n = [...sortItems]; n[idx] = { ...n[idx], text: e.target.value }; onUpdate({ ...block, sortItems: n }); }} placeholder={`Item ${idx + 1}`} className={`flex-1 ${inputClass}`} />
              <select value={item.correct} onChange={e => { const n = [...sortItems]; n[idx] = { ...n[idx], correct: e.target.value as 'left' | 'right' }; onUpdate({ ...block, sortItems: n }); }} className={`w-28 ${inputClass}`}><option value="left">{block.leftLabel || 'Left'}</option><option value="right">{block.rightLabel || 'Right'}</option></select>
              {sortItems.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, sortItems: sortItems.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, sortItems: [...sortItems, { text: '', correct: 'left' }] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Item</button>
        </div>
      );
    }
    case 'DATA_TABLE': {
      const columns = block.columns || [{ key: 'col1', label: 'Column 1', editable: true }];
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Rows</label><input type="number" value={block.trials || 3} onChange={e => onUpdate({ ...block, trials: parseInt(e.target.value) || 3 })} className={inputClass} /></div>
          </div>
          {columns.map((col, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={col.label} onChange={e => { const n = [...columns]; n[idx] = { ...n[idx], label: e.target.value }; onUpdate({ ...block, columns: n }); }} placeholder="Label" className={`flex-1 ${inputClass}`} />
              <input type="text" value={col.unit || ''} onChange={e => { const n = [...columns]; n[idx] = { ...n[idx], unit: e.target.value }; onUpdate({ ...block, columns: n }); }} placeholder="Unit" className={`w-20 ${inputClass}`} />
              {columns.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, columns: columns.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, columns: [...columns, { key: `col${columns.length + 1}`, label: '', editable: true }] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Column</button>
        </div>
      );
    }
    case 'BAR_CHART':
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Bars</label><input type="number" value={block.barCount || 3} onChange={e => onUpdate({ ...block, barCount: parseInt(e.target.value) || 3 })} className={inputClass} /></div>
            <div><label className={labelClass}>Height (px)</label><input type="number" value={block.height || 300} onChange={e => onUpdate({ ...block, height: parseInt(e.target.value) || 300 })} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className={labelClass}>Initial</label><input type="text" value={block.initialLabel || ''} onChange={e => onUpdate({ ...block, initialLabel: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Delta</label><input type="text" value={block.deltaLabel || ''} onChange={e => onUpdate({ ...block, deltaLabel: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Final</label><input type="text" value={block.finalLabel || ''} onChange={e => onUpdate({ ...block, finalLabel: e.target.value })} className={inputClass} /></div>
          </div>
        </div>
      );
    case 'RANKING': {
      const items = block.items || [''];
      return (
        <div className="space-y-2">
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Ranking question..." className={textareaClass} rows={2} />
          <label className={labelClass}>Items (in correct order)</label>
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="text-xs font-mono text-gray-600 mt-2 w-5 text-right">{idx + 1}.</span>
              <input type="text" value={item} onChange={e => { const n = [...items]; n[idx] = e.target.value; onUpdate({ ...block, items: n }); }} className={`flex-1 ${inputClass}`} />
              {items.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, items: items.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, items: [...items, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Item</button>
        </div>
      );
    }
    case 'LINKED': {
      const linkable = allBlocks.filter(b => b.id !== block.id && ['MC', 'SHORT_ANSWER', 'RANKING'].includes(b.type));
      const answers = block.acceptedAnswers || [''];
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Reference Block</label><select value={block.linkedBlockId || ''} onChange={e => onUpdate({ ...block, linkedBlockId: e.target.value })} className={inputClass}><option value="">Select...</option>{linkable.map(b => <option key={b.id} value={b.id}>{b.type}: {(b.content || '').slice(0, 40)}</option>)}</select></div>
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Follow-up question..." className={textareaClass} rows={2} />
          <label className={labelClass}>Accepted Answers</label>
          {answers.map((ans, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={ans} onChange={e => { const n = [...answers]; n[idx] = e.target.value; onUpdate({ ...block, acceptedAnswers: n }); }} className={`flex-1 ${inputClass}`} />
              {answers.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: answers.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: [...answers, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Answer</button>
        </div>
      );
    }
    default:
      return <div className="text-xs text-gray-500 italic">Unknown block type: {block.type}</div>;
  }
};

export default LessonEditorPage;

import React, { useState, useMemo, useCallback } from 'react';
import { Assignment, AssignmentStatus, ClassConfig, ResourceCategory } from '../../types';
import {
  Plus, ChevronDown, ChevronRight, Search, Filter, ArrowUpDown,
  ChevronUp, Rocket, Archive, Eye, Trash2, CalendarClock, Layers,
  BookOpen, PlayCircle, FlaskConical, Target, Newspaper, Video, Shield
} from 'lucide-react';
import { sortUnitKeys } from '../AdminPanel';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';

function formatCompactDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays <= 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Textbook': <BookOpen className="w-3 h-3" />,
  'Simulation': <PlayCircle className="w-3 h-3" />,
  'Lab Guide': <FlaskConical className="w-3 h-3" />,
  'Practice Set': <Target className="w-3 h-3" />,
  'Article': <Newspaper className="w-3 h-3" />,
  'Video Lesson': <Video className="w-3 h-3" />,
  'Supplemental': <Layers className="w-3 h-3" />,
};

const CATEGORIES: ResourceCategory[] = ['Textbook', 'Simulation', 'Lab Guide', 'Practice Set', 'Article', 'Video Lesson', 'Supplemental'];

interface ResourceSidebarProps {
  assignments: Assignment[];
  assignmentsByUnit: Record<string, Assignment[]>;
  selectedId: string | null;
  onSelectResource: (id: string) => void;
  onStartNew: () => void;
  onQuickDeploy: (id: string) => void;
  onArchive: (id: string, status: AssignmentStatus) => void;
  onDelete: (id: string) => void;
  availableClasses: string[];
  classConfigs?: ClassConfig[];
}

const ResourceSidebar: React.FC<ResourceSidebarProps> = ({
  assignments,
  assignmentsByUnit,
  selectedId,
  onSelectResource,
  onStartNew,
  onQuickDeploy,
  onArchive,
  onDelete,
  availableClasses,
  classConfigs,
}) => {
  const toast = useToast();

  // Internal state (moved from parent)
  const [searchFilter, setSearchFilter] = useState('');
  const [filterClass, setFilterClass] = useState<string>('All Classes');
  const [filterCategory, setFilterCategory] = useState<string>('All Categories');
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set(Object.keys(assignmentsByUnit)));
  const [showUnitOrder, setShowUnitOrder] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [hoverResourceId, setHoverResourceId] = useState<string | null>(null);
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(new Set());
  const [expandedAllClassUnits, setExpandedAllClassUnits] = useState<Set<string>>(new Set());

  // Computed: filtered units for single-class view
  const filteredUnits = useMemo(() => {
    const result: Record<string, Assignment[]> = {};
    const lower = searchFilter.toLowerCase();
    Object.entries(assignmentsByUnit).forEach(([unit, items]) => {
      const filtered = items.filter(a => {
        if (searchFilter && !a.title.toLowerCase().includes(lower) && !unit.toLowerCase().includes(lower)) return false;
        if (filterClass !== 'All Classes' && a.classType !== filterClass) return false;
        if (filterCategory !== 'All Categories' && a.category !== filterCategory) return false;
        return true;
      });
      if (filtered.length > 0) result[unit] = filtered;
    });
    return result;
  }, [assignmentsByUnit, searchFilter, filterClass, filterCategory]);

  // Computed: all-classes grouped view: class -> unit -> assignments
  const filteredByClass = useMemo(() => {
    if (filterClass !== 'All Classes') return null;
    const lower = searchFilter.toLowerCase();
    const result: Record<string, Record<string, Assignment[]>> = {};
    assignments.forEach(a => {
      if (filterCategory !== 'All Categories' && a.category !== filterCategory) return;
      const unit = a.unit || 'Unassigned';
      if (searchFilter && !a.title.toLowerCase().includes(lower) && !unit.toLowerCase().includes(lower)) return;
      const cls = a.classType || 'Uncategorized';
      if (!result[cls]) result[cls] = {};
      if (!result[cls][unit]) result[cls][unit] = [];
      result[cls][unit].push(a);
    });
    Object.values(result).forEach(units =>
      Object.values(units).forEach(items =>
        items.sort((a, b) => a.title.localeCompare(b.title))
      )
    );
    return result;
  }, [assignments, searchFilter, filterClass, filterCategory]);

  // Computed: sidebar unit order from classConfigs
  const sidebarUnitOrder = useMemo(() => {
    if (filterClass === 'All Classes') return undefined;
    return classConfigs?.find(c => c.className === filterClass)?.unitOrder;
  }, [filterClass, classConfigs]);

  // Save unit order handler
  const handleSaveUnitOrder = useCallback(async () => {
    if (!pendingOrder || filterClass === 'All Classes') return;
    setIsSavingOrder(true);
    try {
      const existing = classConfigs?.find(c => c.className === filterClass);
      if (existing) {
        await dataService.saveClassConfig({ ...existing, unitOrder: pendingOrder });
      } else {
        await dataService.saveClassConfig({ id: filterClass, className: filterClass, unitOrder: pendingOrder, features: { evidenceLocker: false, leaderboard: false, physicsTools: false, communications: false, dungeons: true, pvpArena: true, bossFights: true } } as ClassConfig);
      }
      toast.success('Unit order saved!');
      setPendingOrder(null);
      setShowUnitOrder(false);
    } catch { toast.error('Failed to save unit order.'); }
    finally { setIsSavingOrder(false); }
  }, [pendingOrder, filterClass, classConfigs, toast]);

  return (
    <div className="w-80 border-r border-white/10 bg-black/20 flex flex-col shrink-0">
      {/* Top controls */}
      <div className="p-3 border-b border-white/5 space-y-2">
        <button onClick={onStartNew} className="w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg cursor-pointer">
          <Plus className="w-4 h-4" /> New Resource
        </button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input type="text" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} placeholder="Search resources..." className="w-full pl-9 pr-3 py-2 bg-black/30 border border-white/10 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition" />
        </div>
        {/* Class & Category Filters */}
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 font-bold focus:outline-none focus:border-purple-500/50 transition cursor-pointer"
          >
            <option value="All Classes">All Classes</option>
            {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 font-bold focus:outline-none focus:border-purple-500/50 transition cursor-pointer"
          >
            <option value="All Categories">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* Unit Order button */}
        {filterClass !== 'All Classes' && Object.keys(filteredUnits).length > 1 && (
          <button
            onClick={() => {
              if (!showUnitOrder) {
                const keys = sortUnitKeys(Object.keys(filteredUnits), sidebarUnitOrder);
                setPendingOrder(keys);
              }
              setShowUnitOrder(!showUnitOrder);
            }}
            className={`w-full flex items-center justify-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
              showUnitOrder ? 'text-amber-300 bg-amber-500/20 border-amber-500/30' : 'text-gray-400 bg-white/5 border-white/10 hover:text-white'
            }`}
          >
            <ArrowUpDown className="w-3 h-3" /> Reorder Units
          </button>
        )}
      </div>

      {/* Unit Order Panel */}
      {showUnitOrder && pendingOrder && (
        <div className="border-b border-white/5 p-3 bg-amber-500/5 space-y-2">
          <div className="text-[9px] font-bold text-amber-300 uppercase tracking-widest">Unit Order — {filterClass}</div>
          <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
            {pendingOrder.map((unit, idx) => (
              <div key={unit} className="flex items-center gap-1.5 bg-black/30 border border-white/5 rounded-lg px-2 py-1.5">
                <span className="text-[9px] text-gray-600 font-mono w-4 text-right">{idx + 1}</span>
                <span className="text-[10px] text-gray-300 truncate flex-1">{unit}</span>
                <button
                  disabled={idx === 0}
                  onClick={() => { const n = [...pendingOrder]; [n[idx], n[idx - 1]] = [n[idx - 1], n[idx]]; setPendingOrder(n); }}
                  className="p-0.5 text-gray-600 hover:text-white disabled:opacity-20 transition cursor-pointer"
                ><ChevronUp className="w-3 h-3" /></button>
                <button
                  disabled={idx === pendingOrder.length - 1}
                  onClick={() => { const n = [...pendingOrder]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; setPendingOrder(n); }}
                  className="p-0.5 text-gray-600 hover:text-white disabled:opacity-20 transition cursor-pointer"
                ><ChevronDown className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveUnitOrder} disabled={isSavingOrder} className="flex-1 text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 py-1.5 rounded-lg hover:bg-amber-500/30 transition cursor-pointer disabled:opacity-40">
              {isSavingOrder ? 'Saving...' : 'Save Order'}
            </button>
            <button onClick={() => { setShowUnitOrder(false); setPendingOrder(null); }} className="text-[10px] text-gray-500 hover:text-white px-3 py-1.5 rounded-lg transition cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Resource list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {filterClass === 'All Classes' && filteredByClass ? (
          // All Classes view: class -> unit -> resources
          Object.keys(filteredByClass).sort().length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-xs">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No resources match filters
            </div>
          ) : (
            Object.keys(filteredByClass).sort().map(cls => {
              const clsUnits = filteredByClass[cls];
              const isClassCollapsed = collapsedClasses.has(cls);
              const total = Object.values(clsUnits).reduce((s, items) => s + items.length, 0);
              return (
                <div key={cls} className="mb-1">
                  {/* Class header */}
                  <button
                    onClick={() => setCollapsedClasses(prev => { const n = new Set(prev); n.has(cls) ? n.delete(cls) : n.add(cls); return n; })}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-purple-500/10 rounded-lg transition cursor-pointer"
                  >
                    {isClassCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-purple-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                    <span className="text-[11px] font-bold text-purple-300 truncate flex-1">{cls}</span>
                    <span className="text-[9px] text-purple-500/70 font-mono shrink-0">{total}</span>
                  </button>
                  {/* Units within this class */}
                  {!isClassCollapsed && (
                    <div className="ml-2 space-y-0.5 border-l border-purple-500/10 pl-1">
                      {sortUnitKeys(Object.keys(clsUnits), classConfigs?.find(c => c.className === cls)?.unitOrder).map(unit => {
                        const items = clsUnits[unit];
                        const compositeKey = `${cls}::${unit}`;
                        const isUnitExpanded = expandedAllClassUnits.has(compositeKey);
                        return (
                          <div key={unit}>
                            <button
                              onClick={() => setExpandedAllClassUnits(prev => { const n = new Set(prev); n.has(compositeKey) ? n.delete(compositeKey) : n.add(compositeKey); return n; })}
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5 rounded-lg transition cursor-pointer"
                            >
                              {isUnitExpanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate flex-1">{unit}</span>
                              <span className="text-[9px] text-gray-600 font-mono">{items.length}</span>
                            </button>
                            {isUnitExpanded && items.map(a => {
                              const hasBlocks = a.lessonBlocks && a.lessonBlocks.length > 0;
                              const hasHtml = !!a.contentUrl;
                              const isHovered = hoverResourceId === a.id;
                              const isDraft = a.status === AssignmentStatus.DRAFT;
                              const isArchived = a.status === AssignmentStatus.ARCHIVED;
                              const isScheduled = !!a.scheduledAt && new Date(a.scheduledAt) > new Date();
                              const catIcon = a.category ? CATEGORY_ICONS[a.category] : null;
                              const compactDate = a.createdAt ? formatCompactDate(a.createdAt) : null;
                              const isNew = a.createdAt ? (Date.now() - new Date(a.createdAt).getTime()) < 48 * 60 * 60 * 1000 : false;
                              return (
                                <div
                                  key={a.id}
                                  onMouseEnter={() => setHoverResourceId(a.id)}
                                  onMouseLeave={() => setHoverResourceId(null)}
                                  className={`relative ml-2 rounded-lg transition ${isArchived ? 'opacity-50' : ''} ${
                                    selectedId === a.id ? 'bg-purple-500/20 border border-purple-500/30'
                                    : a.isAssessment ? 'bg-red-500/5 border border-red-500/20 hover:bg-red-500/10'
                                    : 'hover:bg-white/5 border border-transparent'
                                  }`}
                                >
                                  <button
                                    onClick={() => onSelectResource(a.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] cursor-pointer ${selectedId === a.id ? 'text-purple-300' : a.isAssessment ? 'text-red-300 hover:text-red-200' : 'text-gray-400 hover:text-gray-200'}`}
                                  >
                                    {a.isAssessment ? <Shield className="w-3 h-3 shrink-0 text-red-400" /> : catIcon ? <span className="shrink-0 text-gray-500">{catIcon}</span> : <Layers className="w-3.5 h-3.5 shrink-0" />}
                                    <span className="truncate flex-1">{a.title}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {a.isAssessment && <span className="text-[7px] bg-red-500/20 text-red-400 px-1 rounded font-bold border border-red-500/30">ASSESS</span>}
                                      {isNew && <span className="text-[7px] bg-green-500/20 text-green-400 px-1 rounded font-bold">NEW</span>}
                                      {compactDate && <span className="text-[8px] text-gray-600 font-mono">{compactDate}</span>}
                                      {hasBlocks && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1 rounded font-mono">{a.lessonBlocks!.length}b</span>}
                                      {hasHtml && <span className="text-[8px] text-cyan-400 bg-cyan-500/10 px-1 rounded font-mono">html</span>}
                                      {isDraft && <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1 rounded font-mono">draft</span>}
                                      {isArchived && <span className="text-[8px] text-gray-500 bg-gray-500/10 px-1 rounded font-mono">arch</span>}
                                      {isScheduled && <span className="text-[8px] text-amber-400 bg-amber-500/10 px-1 rounded font-mono"><CalendarClock className="w-2.5 h-2.5 inline" /></span>}
                                    </div>
                                  </button>
                                  {isHovered && (
                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-[#1a1b26]/95 border border-white/10 rounded-lg px-1 py-0.5 shadow-xl z-10">
                                      {isDraft && (
                                        <button onClick={(e) => { e.stopPropagation(); onQuickDeploy(a.id); }} className="p-1 text-gray-500 hover:text-emerald-400 transition cursor-pointer" title="Quick Deploy">
                                          <Rocket className="w-3 h-3" />
                                        </button>
                                      )}
                                      <button onClick={(e) => { e.stopPropagation(); onArchive(a.id, a.status); }} className="p-1 text-gray-500 hover:text-amber-400 transition cursor-pointer" title={isArchived ? 'Restore' : 'Archive'}>
                                        {isArchived ? <Eye className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); onDelete(a.id); }} className="p-1 text-gray-500 hover:text-red-400 transition cursor-pointer" title="Delete">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          // Single-class view (existing behaviour)
          <>
            {(() => {
              const sortedKeys = sortUnitKeys(Object.keys(filteredUnits), sidebarUnitOrder);
              return sortedKeys.map(k => [k, filteredUnits[k]] as [string, Assignment[]]);
            })().map(([unit, items]) => (
              <div key={unit}>
                <button onClick={() => setExpandedUnits(prev => { const n = new Set(prev); n.has(unit) ? n.delete(unit) : n.add(unit); return n; })} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5 rounded-lg transition cursor-pointer">
                  {expandedUnits.has(unit) ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate flex-1">{unit}</span>
                  <span className="text-[9px] text-gray-600 font-mono">{items.length}</span>
                </button>
                {expandedUnits.has(unit) && items.map(a => {
                  const hasBlocks = a.lessonBlocks && a.lessonBlocks.length > 0;
                  const hasHtml = !!a.contentUrl;
                  const isHovered = hoverResourceId === a.id;
                  const isDraft = a.status === AssignmentStatus.DRAFT;
                  const isArchived = a.status === AssignmentStatus.ARCHIVED;
                  const isScheduled = !!a.scheduledAt && new Date(a.scheduledAt) > new Date();
                  const catIcon = a.category ? CATEGORY_ICONS[a.category] : null;
                  const compactDate = a.createdAt ? formatCompactDate(a.createdAt) : null;
                  const isNew = a.createdAt ? (Date.now() - new Date(a.createdAt).getTime()) < 48 * 60 * 60 * 1000 : false;
                  return (
                    <div
                      key={a.id}
                      onMouseEnter={() => setHoverResourceId(a.id)}
                      onMouseLeave={() => setHoverResourceId(null)}
                      className={`relative ml-2 rounded-lg transition ${isArchived ? 'opacity-50' : ''} ${
                        selectedId === a.id ? 'bg-purple-500/20 border border-purple-500/30'
                        : a.isAssessment ? 'bg-red-500/5 border border-red-500/20 hover:bg-red-500/10'
                        : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <button
                        onClick={() => onSelectResource(a.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] cursor-pointer ${selectedId === a.id ? 'text-purple-300' : a.isAssessment ? 'text-red-300 hover:text-red-200' : 'text-gray-400 hover:text-gray-200'}`}
                      >
                        {a.isAssessment ? <Shield className="w-3 h-3 shrink-0 text-red-400" /> : catIcon ? <span className="shrink-0 text-gray-500">{catIcon}</span> : <Layers className="w-3.5 h-3.5 shrink-0" />}
                        <span className="truncate flex-1">{a.title}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {a.isAssessment && <span className="text-[7px] bg-red-500/20 text-red-400 px-1 rounded font-bold border border-red-500/30">ASSESS</span>}
                          {isNew && <span className="text-[7px] bg-green-500/20 text-green-400 px-1 rounded font-bold">NEW</span>}
                          {compactDate && <span className="text-[8px] text-gray-600 font-mono">{compactDate}</span>}
                          {hasBlocks && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1 rounded font-mono">{a.lessonBlocks!.length}b</span>}
                          {hasHtml && <span className="text-[8px] text-cyan-400 bg-cyan-500/10 px-1 rounded font-mono">html</span>}
                          {isDraft && <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1 rounded font-mono">draft</span>}
                          {isArchived && <span className="text-[8px] text-gray-500 bg-gray-500/10 px-1 rounded font-mono">arch</span>}
                          {isScheduled && <span className="text-[8px] text-amber-400 bg-amber-500/10 px-1 rounded font-mono"><CalendarClock className="w-2.5 h-2.5 inline" /></span>}
                        </div>
                      </button>
                      {isHovered && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-[#1a1b26]/95 border border-white/10 rounded-lg px-1 py-0.5 shadow-xl z-10">
                          {isDraft && (
                            <button onClick={(e) => { e.stopPropagation(); onQuickDeploy(a.id); }} className="p-1 text-gray-500 hover:text-emerald-400 transition cursor-pointer" title="Quick Deploy">
                              <Rocket className="w-3 h-3" />
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); onArchive(a.id, a.status); }} className="p-1 text-gray-500 hover:text-amber-400 transition cursor-pointer" title={isArchived ? 'Restore' : 'Archive'}>
                            {isArchived ? <Eye className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); onDelete(a.id); }} className="p-1 text-gray-500 hover:text-red-400 transition cursor-pointer" title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {Object.keys(filteredUnits).length === 0 && (
              <div className="text-center py-8 text-gray-600 text-xs">
                <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No resources match filters
              </div>
            )}
          </>
        )}
      </div>
      {/* Sidebar footer stats */}
      <div className="border-t border-white/5 px-3 py-2 text-[9px] text-gray-600 flex items-center justify-between">
        {filterClass === 'All Classes' && filteredByClass ? (
          <>
            <span>{Object.values(filteredByClass).reduce((sum, units) => sum + Object.values(units).reduce((s, items) => s + items.length, 0), 0)} resources</span>
            <span>{Object.keys(filteredByClass).length} classes</span>
          </>
        ) : (
          <>
            <span>{Object.values(filteredUnits).reduce((sum, items) => sum + items.length, 0)} resources</span>
            <span>{Object.keys(filteredUnits).length} units</span>
          </>
        )}
      </div>
    </div>
  );
};

export default ResourceSidebar;

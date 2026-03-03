
import React, { useState, useMemo } from 'react';
import { Assignment, ClassConfig, Submission } from '../../types';
import { ChevronRight, ChevronDown, Play, BookOpen, FlaskConical, Target, Newspaper, Video, Layers, CheckCircle2, Clock, GraduationCap, Search, X, Calendar, ArrowUpDown } from 'lucide-react';
import { sortUnitKeys } from '../AdminPanel';

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Textbook': <BookOpen className="w-5 h-5" />,
  'Simulation': <Play className="w-5 h-5 fill-current" />,
  'Lab Guide': <FlaskConical className="w-5 h-5" />,
  'Practice Set': <Target className="w-5 h-5" />,
  'Article': <Newspaper className="w-5 h-5" />,
  'Video Lesson': <Video className="w-5 h-5" />,
  'Supplemental': <Layers className="w-5 h-5" />,
  'Lesson': <GraduationCap className="w-5 h-5" />,
};

/** Badge-sized (w-2.5 h-2.5) icon variants for use inside category badge pills. */
const CATEGORY_BADGE_ICONS: Record<string, React.ReactNode> = {
  'Textbook': <BookOpen className="w-2.5 h-2.5" />,
  'Simulation': <Play className="w-2.5 h-2.5 fill-current" />,
  'Lab Guide': <FlaskConical className="w-2.5 h-2.5" />,
  'Practice Set': <Target className="w-2.5 h-2.5" />,
  'Article': <Newspaper className="w-2.5 h-2.5" />,
  'Video Lesson': <Video className="w-2.5 h-2.5" />,
  'Supplemental': <Layers className="w-2.5 h-2.5" />,
  'Lesson': <GraduationCap className="w-2.5 h-2.5" />,
};

/** Tailwind classes for the colored category badge pill. Fallback applied when key is missing. */
const CATEGORY_COLORS: Record<string, string> = {
  'Textbook':     'bg-blue-500/15 text-blue-400 border-blue-500/25',
  'Simulation':   'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'Lab Guide':    'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Practice Set': 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  'Article':      'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  'Video Lesson': 'bg-pink-500/15 text-pink-400 border-pink-500/25',
  'Supplemental': 'bg-gray-500/15 text-gray-400 border-gray-500/25',
  'Lesson':       'bg-purple-500/15 text-purple-400 border-purple-500/25',
};

/** Tailwind classes for the left icon square on unstarted resources (bg + text + hover shadow). */
const CATEGORY_ICON_COLORS: Record<string, string> = {
  'Textbook':     'bg-blue-500/10 text-blue-400 group-hover:shadow-blue-500/20',
  'Simulation':   'bg-emerald-500/10 text-emerald-400 group-hover:shadow-emerald-500/20',
  'Lab Guide':    'bg-amber-500/10 text-amber-400 group-hover:shadow-amber-500/20',
  'Practice Set': 'bg-orange-500/10 text-orange-400 group-hover:shadow-orange-500/20',
  'Article':      'bg-cyan-500/10 text-cyan-400 group-hover:shadow-cyan-500/20',
  'Video Lesson': 'bg-pink-500/10 text-pink-400 group-hover:shadow-pink-500/20',
  'Supplemental': 'bg-gray-500/10 text-gray-400 group-hover:shadow-gray-500/20',
  'Lesson':       'bg-purple-500/10 text-purple-400 group-hover:shadow-purple-500/20',
};

type EnrichedAssignment = Assignment & { lastEngagement: string | null; engagementTime: number };

/** Simple fuzzy match: checks if all query tokens appear somewhere in the text (in any order). */
function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every(token => lower.includes(token));
}

interface ResourcesTabProps {
  unitGroups: Record<string, EnrichedAssignment[]>;
  expandedUnits: Set<string>;
  onToggleUnit: (unit: string) => void;
  practiceCompletion: Record<string, { completed: boolean; totalCompletions: number; bestScore: number | null; completedAt: string | null }>;
  onStartAssignment?: (id: string) => void;
  classConfigs?: ClassConfig[];
  activeClass: string;
  submissions?: Submission[];
}

const ResourcesTab: React.FC<ResourcesTabProps> = ({ unitGroups, expandedUnits, onToggleUnit, practiceCompletion, onStartAssignment, classConfigs, activeClass, submissions = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alpha' | 'type'>('newest');

  const sortItems = (items: EnrichedAssignment[]): EnrichedAssignment[] => {
    const sorted = [...items];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
      case 'oldest':
        return sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
          return dateA - dateB;
        });
      case 'alpha':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'type':
        return sorted.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.title.localeCompare(b.title));
      default:
        return sorted;
    }
  };

  const filteredUnitGroups = useMemo(() => {
    if (!searchQuery.trim()) return unitGroups;
    const q = searchQuery.trim();
    const filtered: Record<string, EnrichedAssignment[]> = {};
    for (const [unit, items] of Object.entries(unitGroups)) {
      // If the entire unit name fuzzy-matches, include all its items
      if (fuzzyMatch(unit, q)) {
        filtered[unit] = items;
        continue;
      }
      const matches = items.filter(r => {
        const searchable = [r.title, r.description || '', r.category || '', unit].join(' ');
        return fuzzyMatch(searchable, q);
      });
      if (matches.length > 0) filtered[unit] = matches;
    }
    return filtered;
  }, [unitGroups, searchQuery]);

  /** Renders a single resource card. Extracted so it can be used in both normal and "By Type" render paths. */
  const renderResourceCard = (resource: EnrichedAssignment) => {
    const hasDue = !!resource.dueDate;
    const dueDate = resource.dueDate ? new Date(resource.dueDate) : null;
    const now = new Date();
    const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000) : Infinity;
    const dueColor = daysUntilDue <= 0 ? 'text-red-400' : daysUntilDue <= 2 ? 'text-yellow-400' : 'text-gray-500';
    const engMin = Math.floor(resource.engagementTime / 60);
    const isSubstantial = engMin >= 5;
    const completion = practiceCompletion[resource.id];
    const isModuleCompleted = completion?.completed;
    const hasLessonBlocks = resource.lessonBlocks && resource.lessonBlocks.length > 0;
    const isLessonOnly = hasLessonBlocks && !resource.contentUrl;

    // Assessment submission status for dashboard cards
    const assessmentSubs = resource.isAssessment
      ? submissions.filter(s => s.assignmentId === resource.id && s.isAssessment).sort((a, b) => (b.attemptNumber || 0) - (a.attemptNumber || 0))
      : [];
    const latestSub = assessmentSubs[0] || null;
    const assessmentConfig = resource.assessmentConfig || {};
    const maxAttempts = assessmentConfig.maxAttempts || 0;
    const isUnlimitedAttempts = maxAttempts === 0;
    const canStillRetake = latestSub && assessmentConfig.allowResubmission !== false &&
      (isUnlimitedAttempts || (latestSub.attemptNumber || 1) < maxAttempts);

    return (
      <div
        key={resource.id}
        className={`border hover:border-purple-500/40 p-4 rounded-xl transition-all cursor-pointer group flex items-center gap-4 ${
          resource.isAssessment
            ? 'bg-red-500/5 border-red-500/25 ring-1 ring-red-500/10 hover:border-red-400/50'
            : `bg-white/5 ${isModuleCompleted ? 'border-green-500/20' : hasLessonBlocks ? 'border-indigo-500/10' : 'border-white/5'}`
        }`}
        onClick={() => onStartAssignment && onStartAssignment(resource.id)}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
          resource.isAssessment && !isModuleCompleted && !isSubstantial && !resource.lastEngagement
            ? 'bg-red-500/15 text-red-400 ring-2 ring-red-500/25 group-hover:scale-110 shadow-lg group-hover:shadow-red-500/20' :
          isModuleCompleted ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30' :
          isSubstantial ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30' :
          resource.lastEngagement ? 'bg-green-500/10 text-green-400' :
          isLessonOnly ? 'bg-indigo-500/10 text-indigo-400 group-hover:scale-110 shadow-lg group-hover:shadow-indigo-500/20' :
          `${CATEGORY_ICON_COLORS[resource.category || ''] ?? 'bg-purple-500/10 text-purple-400 group-hover:shadow-purple-500/20'} group-hover:scale-110 shadow-lg`
        }`}>
          {isModuleCompleted ? <CheckCircle2 className="w-6 h-6" /> :
            isSubstantial ? <CheckCircle2 className="w-6 h-6" /> :
            resource.lastEngagement ? <CheckCircle2 className="w-5 h-5 opacity-60" /> :
            isLessonOnly ? <GraduationCap className="w-6 h-6" /> :
            CATEGORY_ICONS[resource.category || 'Supplemental']}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {(() => {
              const badgeLabel = isLessonOnly ? 'Lesson' : (resource.category ?? 'Supplemental');
              const badgeColors = CATEGORY_COLORS[badgeLabel] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/25';
              return (
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border flex items-center gap-0.5 flex-shrink-0 ${badgeColors}`}>
                  {CATEGORY_BADGE_ICONS[badgeLabel]}
                  {badgeLabel}
                </span>
              );
            })()}
            {resource.isAssessment && (
              <span className="text-[9px] bg-red-600/80 text-white px-1.5 py-0.5 rounded-full uppercase tracking-widest font-bold">
                Assessment
              </span>
            )}
            <h4 className="font-bold text-white text-sm truncate">{resource.title}</h4>
            {isModuleCompleted && (
              <span className="text-[8px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20 flex items-center gap-0.5 flex-shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5" />
                COMPLETED{(completion?.totalCompletions || 0) > 1 ? ` (${completion.totalCompletions}x)` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-500 truncate">{resource.description}</p>
          </div>
          {/* Assessment submission status row */}
          {resource.isAssessment && latestSub && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {(() => {
                const effectiveScore = latestSub.rubricGrade?.overallPercentage ?? latestSub.assessmentScore?.percentage ?? latestSub.score ?? 0;
                const hasScore = latestSub.rubricGrade || latestSub.assessmentScore;
                return hasScore && assessmentConfig.showScoreOnSubmit !== false ? (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                    effectiveScore >= 80 ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : effectiveScore >= 60 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    Score: {effectiveScore}%
                  </span>
                ) : null;
              })()}
              <span className="text-[9px] text-gray-500 font-bold">
                {isUnlimitedAttempts
                  ? `Attempt ${latestSub.attemptNumber || 1}`
                  : `Attempt ${latestSub.attemptNumber || 1} of ${maxAttempts}`
                }
              </span>
              {canStillRetake && (
                <span className="text-[9px] text-purple-400 font-bold flex items-center gap-0.5">
                  <Play className="w-2.5 h-2.5 fill-current" /> Retake available
                </span>
              )}
              {!canStillRetake && (
                <span className="text-[9px] text-gray-500 font-bold">
                  {assessmentConfig.allowResubmission === false ? 'No retakes allowed' : 'No retakes left'}
                </span>
              )}
              {latestSub.flaggedAsAI && (
                <span className="text-[9px] text-purple-400 font-bold">Flagged</span>
              )}
            </div>
          )}
          {resource.isAssessment && !latestSub && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[9px] text-red-400 font-bold flex items-center gap-0.5">
                <Target className="w-2.5 h-2.5" /> Not yet submitted
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 mt-1">
            {resource.createdAt && (
              <span className="text-[9px] text-gray-500 font-bold flex items-center gap-0.5">
                <Calendar size={10} /> Posted {formatRelativeDate(resource.createdAt)}
              </span>
            )}
            {resource.lastEngagement && (
              <span className="text-[9px] text-green-500 font-bold">{engMin}m engaged</span>
            )}
            {isModuleCompleted && completion?.bestScore != null && completion.bestScore > 0 && (
              <span className="text-[9px] text-amber-400 font-bold">Best: {completion.bestScore}%</span>
            )}
            {hasLessonBlocks && (
              <span className="text-[9px] text-indigo-400 font-bold flex items-center gap-0.5">
                <GraduationCap className="w-3 h-3" /> {resource.lessonBlocks!.length} blocks
              </span>
            )}
            {hasDue && (
              <span className={`text-[9px] font-bold flex items-center gap-0.5 ${dueColor}`}>
                <Clock className="w-3 h-3" />
                {daysUntilDue <= 0 ? 'Overdue' : daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${daysUntilDue}d`}
              </span>
            )}
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition">
          <Play className="w-4 h-4 text-purple-400 fill-current" />
        </div>
      </div>
    );
  };

  return (
    <div key="resources" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search resources by title, description, or unit..."
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-20 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition"
          aria-label="Search resources"
        />
        {searchQuery && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">
              {Object.values(filteredUnitGroups).reduce((a, b) => a + b.length, 0)} results
            </span>
            <button onClick={() => setSearchQuery('')} className="text-gray-500 hover:text-white transition" aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-1.5 mb-3">
        <ArrowUpDown size={12} className="text-gray-500" />
        {(['newest', 'oldest', 'alpha', 'type'] as const).map(option => (
          <button
            key={option}
            onClick={() => setSortBy(option)}
            className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
              sortBy === option
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            {option === 'newest' ? 'Newest' : option === 'oldest' ? 'Oldest' : option === 'alpha' ? 'A-Z' : 'By Type'}
          </button>
        ))}
      </div>

      {Object.entries(filteredUnitGroups).length === 0 ? (
        <div className="text-center py-20 text-gray-500 italic">
          {searchQuery ? `No resources matching "${searchQuery}".` : 'No resources released for this class node.'}
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const unitOrder = classConfigs?.find(c => c.className === activeClass)?.unitOrder;
            const sortedKeys = sortUnitKeys(Object.keys(filteredUnitGroups), unitOrder);
            return sortedKeys.map(unit => [unit, filteredUnitGroups[unit]] as [string, typeof filteredUnitGroups[string]]);
          })().map(([unit, items]) => (
            <div key={unit} className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
              <button onClick={() => onToggleUnit(unit)} className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition">
                <div className="flex items-center gap-3">
                  {expandedUnits.has(unit) ? <ChevronDown className="w-4 h-4 text-purple-400" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  <span className="font-bold text-sm text-gray-300 uppercase tracking-wider">{unit}</span>
                </div>
                <span className="text-[10px] bg-white/5 text-gray-500 px-2 py-0.5 rounded-full font-mono">{items.length} Files</span>
              </button>

              {expandedUnits.has(unit) && (
                <div className="grid grid-cols-1 gap-2 p-3 pt-0 animate-in slide-in-from-top-2 duration-300">
                  {(() => {
                    const sortedItems = sortItems(items);
                    if (sortBy !== 'type') {
                      return sortedItems.map(resource => renderResourceCard(resource));
                    }
                    // "By Type" mode: insert thin category sub-headers between type groups
                    const result: React.ReactNode[] = [];
                    let lastCategory: string | null = null;
                    sortedItems.forEach(resource => {
                      const isLessonOnly = !!(resource.lessonBlocks && resource.lessonBlocks.length > 0 && !resource.contentUrl);
                      const category = isLessonOnly ? 'Lesson' : (resource.category || 'Supplemental');
                      if (category !== lastCategory) {
                        result.push(
                          <div key={`subheader-${category}`} className="flex items-center gap-2 py-1.5 px-2">
                            <div className="h-px flex-1 bg-gray-800" />
                            <span className="text-[8px] text-gray-600 font-bold tracking-wider uppercase">{category}</span>
                            <div className="h-px flex-1 bg-gray-800" />
                          </div>
                        );
                        lastCategory = category;
                      }
                      result.push(renderResourceCard(resource));
                    });
                    return result;
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResourcesTab;

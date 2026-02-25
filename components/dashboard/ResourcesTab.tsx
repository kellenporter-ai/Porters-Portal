
import React from 'react';
import { Assignment, ClassConfig } from '../../types';
import { ChevronRight, ChevronDown, Play, BookOpen, FlaskConical, Target, Newspaper, Video, Layers, CheckCircle2, Clock, GraduationCap } from 'lucide-react';
import { sortUnitKeys } from '../AdminPanel';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Textbook': <BookOpen className="w-5 h-5" />,
  'Simulation': <Play className="w-5 h-5 fill-current" />,
  'Lab Guide': <FlaskConical className="w-5 h-5" />,
  'Practice Set': <Target className="w-5 h-5" />,
  'Article': <Newspaper className="w-5 h-5" />,
  'Video Lesson': <Video className="w-5 h-5" />,
  'Supplemental': <Layers className="w-5 h-5" />
};

type EnrichedAssignment = Assignment & { lastEngagement: string | null; engagementTime: number };

interface ResourcesTabProps {
  unitGroups: Record<string, EnrichedAssignment[]>;
  expandedUnits: Set<string>;
  onToggleUnit: (unit: string) => void;
  practiceCompletion: Record<string, { completed: boolean; totalCompletions: number; bestScore: number | null; completedAt: string | null }>;
  onStartAssignment?: (id: string) => void;
  classConfigs?: ClassConfig[];
  activeClass: string;
}

const ResourcesTab: React.FC<ResourcesTabProps> = ({ unitGroups, expandedUnits, onToggleUnit, practiceCompletion, onStartAssignment, classConfigs, activeClass }) => {
  return (
    <div key="resources" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      {Object.entries(unitGroups).length === 0 ? (
        <div className="text-center py-20 text-gray-500 italic">No resources released for this class node.</div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const unitOrder = classConfigs?.find(c => c.className === activeClass)?.unitOrder;
            const sortedKeys = sortUnitKeys(Object.keys(unitGroups), unitOrder);
            return sortedKeys.map(unit => [unit, unitGroups[unit]] as [string, typeof unitGroups[string]]);
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
                  {items.map(resource => {
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

                    return (
                      <div
                        key={resource.id}
                        className={`bg-white/5 border hover:border-purple-500/40 p-4 rounded-xl transition-all cursor-pointer group flex items-center gap-4 ${isModuleCompleted ? 'border-green-500/20' : hasLessonBlocks ? 'border-indigo-500/10' : 'border-white/5'}`}
                        onClick={() => onStartAssignment && onStartAssignment(resource.id)}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                          isModuleCompleted ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30' :
                          isSubstantial ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30' :
                          resource.lastEngagement ? 'bg-green-500/10 text-green-400' :
                          isLessonOnly ? 'bg-indigo-500/10 text-indigo-400 group-hover:scale-110 shadow-lg group-hover:shadow-indigo-500/20' :
                          'bg-purple-500/10 text-purple-400 group-hover:scale-110 shadow-lg group-hover:shadow-purple-500/20'
                        }`}>
                          {isModuleCompleted ? <CheckCircle2 className="w-6 h-6" /> :
                            isSubstantial ? <CheckCircle2 className="w-6 h-6" /> :
                            resource.lastEngagement ? <CheckCircle2 className="w-5 h-5 opacity-60" /> :
                            isLessonOnly ? <GraduationCap className="w-6 h-6" /> :
                            CATEGORY_ICONS[resource.category || 'Supplemental']}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${isLessonOnly ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-black/40 text-gray-500 border-white/5'}`}>{isLessonOnly ? 'Lesson' : resource.category}</span>
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
                          <div className="flex items-center gap-3 mt-1">
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
                  })}
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

import React, { useState } from 'react';
import { Rubric, RubricGrade, AISuggestedGrade, RUBRIC_TIER_COLORS } from '../types';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

interface RubricViewerProps {
  rubric: Rubric;
  mode: 'view' | 'results' | 'grade';
  rubricGrade?: RubricGrade;
  aiSuggestedGrade?: AISuggestedGrade;
  onGradeChange?: (questionId: string, skillId: string, tierIndex: number) => void;
  className?: string;
  /** When true, render a compact variant optimized for side-by-side grading panels */
  compact?: boolean;
}

const RubricViewer: React.FC<RubricViewerProps> = ({ rubric, mode, rubricGrade, aiSuggestedGrade, onGradeChange, className = '', compact = false }) => {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(rubric.questions[0]?.id || null);

  const getSelectedTier = (questionId: string, skillId: string): number | null => {
    return rubricGrade?.grades?.[questionId]?.[skillId]?.selectedTier ?? null;
  };

  const getAISuggestion = (questionId: string, skillId: string) => {
    if (!aiSuggestedGrade || aiSuggestedGrade.status !== 'pending_review') return null;
    return aiSuggestedGrade.grades?.[questionId]?.[skillId] ?? null;
  };

  const handleTierClick = (questionId: string, skillId: string, tierIndex: number) => {
    if (mode !== 'grade' || !onGradeChange) return;
    onGradeChange(questionId, skillId, tierIndex);
  };

  // In grade mode, descriptors are always visible — no toggle needed
  const showDescriptorsAlways = mode === 'grade';

  return (
    <div className={`space-y-3 ${className}`}>
      {rubric.questions.map((question) => {
        const isQuestionExpanded = expandedQuestion === question.id;

        // Determine the grade color for the question header based on selected tiers
        const selectedTiers = question.skills
          .map(s => getSelectedTier(question.id, s.id))
          .filter((t): t is number => t !== null);
        const hasGrade = selectedTiers.length > 0;
        // Use the lowest tier (most conservative) to represent the question's grade level
        const representativeTier = hasGrade ? Math.min(...selectedTiers) : null;
        const tierLabel = representativeTier !== null ? question.skills[0]?.tiers[representativeTier]?.label : null;
        const headerColors = tierLabel ? RUBRIC_TIER_COLORS[tierLabel] : null;

        // Check if any skill in this question has an AI suggestion
        const hasAISuggestionInQuestion = question.skills.some(s => getAISuggestion(question.id, s.id) !== null);

        return (
          <div key={question.id} className={`border rounded-xl overflow-hidden transition-colors ${headerColors ? headerColors.border : 'border-white/10'}`}>
            {/* Question header */}
            <button
              type="button"
              onClick={() => setExpandedQuestion(isQuestionExpanded ? null : question.id)}
              className={`w-full flex items-center gap-2 ${compact ? 'px-3 py-2' : 'px-4 py-3'} transition text-left ${
                headerColors
                  ? `${headerColors.bg} hover:brightness-125`
                  : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {isQuestionExpanded ? (
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${headerColors ? headerColors.text : 'text-gray-500'}`} />
              ) : (
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${headerColors ? headerColors.text : 'text-gray-500'}`} />
              )}
              <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold ${headerColors ? headerColors.text : 'text-white'}`}>{question.questionLabel}</span>
              {hasAISuggestionInQuestion && !hasGrade && (
                <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              )}
              <span className={`text-[10px] ml-auto shrink-0 ${headerColors ? headerColors.text + ' opacity-70' : 'text-gray-500'}`}>
                {question.skills.length} skill{question.skills.length !== 1 ? 's' : ''}
              </span>
            </button>

            {isQuestionExpanded && (
              <div className={`${compact ? 'p-2 space-y-2' : 'p-3 space-y-3'}`}>
                {question.skills.map((skill) => {
                  const selectedTier = getSelectedTier(question.id, skill.id);
                  const isSkillExpanded = expandedSkill === skill.id;
                  const aiSuggestion = getAISuggestion(question.id, skill.id);

                  return (
                    <div key={skill.id} className={`bg-black/20 rounded-lg border overflow-hidden ${
                      aiSuggestion && selectedTier === aiSuggestion.suggestedTier
                        ? 'border-amber-500/20'
                        : 'border-white/5'
                    }`}>
                      {/* Skill text */}
                      <div className={`${compact ? 'px-2 py-1.5' : 'px-3 py-2'} border-b border-white/5`}>
                        <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-gray-300 italic leading-relaxed`}>{skill.skillText}</p>
                      </div>

                      {/* Tier quick-select strip (always visible) */}
                      <div className="grid grid-cols-5 gap-px bg-white/5">
                        {skill.tiers.map((tier, tierIdx) => {
                          const colors = RUBRIC_TIER_COLORS[tier.label];
                          const isSelected = selectedTier === tierIdx;
                          const isAISuggested = aiSuggestion?.suggestedTier === tierIdx;
                          const isClickable = mode === 'grade';

                          return (
                            <button
                              key={tier.label}
                              type="button"
                              disabled={mode === 'view'}
                              onClick={() => handleTierClick(question.id, skill.id, tierIdx)}
                              className={`
                                relative flex flex-col items-center px-1.5 py-2 transition-all text-center
                                ${isSelected
                                  ? `${colors.solid} text-white shadow-lg ring-2 ring-white/20`
                                  : isAISuggested && !isSelected
                                    ? `${colors.bg} ${colors.text} ring-1 ring-amber-400/40`
                                    : `bg-black/30 ${colors.text} hover:${colors.bg}`
                                }
                                ${isClickable ? 'cursor-pointer' : 'cursor-default'}
                              `}
                            >
                              {isAISuggested && !isSelected && (
                                <Sparkles className="absolute top-0.5 right-0.5 w-2 h-2 text-amber-400" />
                              )}
                              <span className="text-[9px] font-bold uppercase tracking-wider">{tier.label}</span>
                              <span className={`text-[9px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                                {tier.percentage}%
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* AI rationale — shown when there's an AI suggestion for this skill */}
                      {aiSuggestion && (
                        <div className={`${compact ? 'px-2 py-1.5' : 'px-3 py-2'} bg-amber-500/5 border-t border-amber-500/10`}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                            <span className="text-[9px] font-bold text-amber-400">AI Rationale</span>
                            <span className={`text-[8px] ml-auto px-1.5 py-0.5 rounded-full font-bold ${
                              aiSuggestion.confidence >= 0.75 ? 'bg-green-500/20 text-green-400'
                              : aiSuggestion.confidence >= 0.5 ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                            }`}>
                              {Math.round(aiSuggestion.confidence * 100)}% confident
                            </span>
                          </div>
                          <p className="text-[9px] text-amber-400/70 leading-relaxed">{aiSuggestion.rationale}</p>
                        </div>
                      )}

                      {/* Tier descriptors — always visible in grade mode, toggleable otherwise */}
                      {showDescriptorsAlways ? (
                        <div className={`${compact ? 'px-2 pb-2 pt-1.5 space-y-1' : 'px-3 pb-3 pt-2 space-y-1.5'}`}>
                          {skill.tiers.map((tier, tierIdx) => {
                            const colors = RUBRIC_TIER_COLORS[tier.label];
                            const isSelected = selectedTier === tierIdx;

                            return (
                              <div
                                key={tier.label}
                                className={`rounded-lg ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} border text-[10px] leading-relaxed transition-all ${
                                  isSelected
                                    ? `${colors.bg} ${colors.border} ${colors.text} ring-1 ring-white/10`
                                    : 'border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-400'
                                } cursor-pointer`}
                                onClick={() => handleTierClick(question.id, skill.id, tierIdx)}
                              >
                                <span className={`font-bold ${isSelected ? colors.text : 'text-gray-400'}`}>
                                  {tier.label} ({tier.percentage}%):
                                </span>{' '}
                                {tier.descriptor}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <>
                          {/* Legacy toggle for view/results mode */}
                          {(selectedTier !== null || mode === 'view') && (
                            <button
                              type="button"
                              onClick={() => setExpandedSkill(isSkillExpanded ? null : skill.id)}
                              className="w-full px-3 py-1.5 text-left hover:bg-white/5 transition flex items-center gap-1"
                            >
                              <ChevronRight className={`w-2.5 h-2.5 text-gray-600 transition-transform ${isSkillExpanded ? 'rotate-90' : ''}`} />
                              <span className="text-[9px] text-gray-500">
                                {isSkillExpanded ? 'Hide' : 'Show'} tier descriptions
                              </span>
                            </button>
                          )}

                          {isSkillExpanded && (
                            <div className="px-3 pb-3 space-y-1.5">
                              {skill.tiers.map((tier, tierIdx) => {
                                const colors = RUBRIC_TIER_COLORS[tier.label];
                                const isSelected = selectedTier === tierIdx;

                                return (
                                  <div
                                    key={tier.label}
                                    className={`rounded-lg px-3 py-2 border text-[10px] leading-relaxed transition-all ${
                                      isSelected
                                        ? `${colors.bg} ${colors.border} ${colors.text}`
                                        : 'border-white/5 text-gray-500'
                                    }`}
                                    onClick={() => handleTierClick(question.id, skill.id, tierIdx)}
                                  >
                                    <span className={`font-bold ${isSelected ? colors.text : 'text-gray-400'}`}>
                                      {tier.label} ({tier.percentage}%):
                                    </span>{' '}
                                    {tier.descriptor}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RubricViewer;

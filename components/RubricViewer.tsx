import React, { useState } from 'react';
import { Rubric, RubricGrade, RUBRIC_TIER_COLORS } from '../types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface RubricViewerProps {
  rubric: Rubric;
  mode: 'view' | 'results' | 'grade';
  rubricGrade?: RubricGrade;
  onGradeChange?: (questionId: string, skillId: string, tierIndex: number) => void;
  className?: string;
}

const RubricViewer: React.FC<RubricViewerProps> = ({ rubric, mode, rubricGrade, onGradeChange, className = '' }) => {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(rubric.questions[0]?.id || null);

  const getSelectedTier = (questionId: string, skillId: string): number | null => {
    return rubricGrade?.grades?.[questionId]?.[skillId]?.selectedTier ?? null;
  };

  const handleTierClick = (questionId: string, skillId: string, tierIndex: number) => {
    if (mode !== 'grade' || !onGradeChange) return;
    onGradeChange(questionId, skillId, tierIndex);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {rubric.questions.map((question) => {
        const isQuestionExpanded = expandedQuestion === question.id;

        return (
          <div key={question.id} className="border border-white/10 rounded-xl overflow-hidden">
            {/* Question header */}
            <button
              type="button"
              onClick={() => setExpandedQuestion(isQuestionExpanded ? null : question.id)}
              className="w-full flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 transition text-left"
            >
              {isQuestionExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              )}
              <span className="text-xs font-bold text-white">{question.questionLabel}</span>
              <span className="text-[10px] text-gray-500 ml-auto shrink-0">
                {question.skills.length} skill{question.skills.length !== 1 ? 's' : ''}
              </span>
            </button>

            {isQuestionExpanded && (
              <div className="p-3 space-y-3">
                {question.skills.map((skill) => {
                  const selectedTier = getSelectedTier(question.id, skill.id);
                  const isSkillExpanded = expandedSkill === skill.id;

                  return (
                    <div key={skill.id} className="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
                      {/* Skill text */}
                      <div className="px-3 py-2 border-b border-white/5">
                        <p className="text-[11px] text-gray-300 italic leading-relaxed">{skill.skillText}</p>
                      </div>

                      {/* Tier buttons */}
                      <div className="grid grid-cols-5 gap-px bg-white/5">
                        {skill.tiers.map((tier, tierIdx) => {
                          const colors = RUBRIC_TIER_COLORS[tier.label];
                          const isSelected = selectedTier === tierIdx;
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
                                  : `bg-black/30 ${colors.text} hover:${colors.bg}`
                                }
                                ${isClickable ? 'cursor-pointer' : mode === 'view' ? 'cursor-default' : 'cursor-default'}
                              `}
                            >
                              <span className="text-[9px] font-bold uppercase tracking-wider">{tier.label}</span>
                              <span className={`text-[9px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                                {tier.percentage}%
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Expandable descriptor for selected tier */}
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
                                } ${mode === 'grade' ? 'cursor-pointer hover:border-white/20' : ''}`}
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


import React, { useState, useMemo } from 'react';
import { SpecializationId } from '../../types';
import {
  SKILL_TREES_V2,
  SKILL_NODES_V2,
  canUnlockSkillV2,
  getActiveSynergiesV2,
  specIsInSynergyV2,
  SPEC_COLORS_V2,
  SPECIALIZATIONS,
  getTrialBossForSpec,
} from '../../lib/specializations';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { useConfirm } from '../ConfirmDialog';
import { Lock, CheckCircle2, Zap, AlertTriangle, Sparkles, Sword, Shield, Crosshair, Brain } from 'lucide-react';

// ========================================
// COMPONENT
// ========================================

interface SkillTreePanelProps {
  specialization?: SpecializationId;
  skillPoints: number;
  unlockedSkills: string[];
  level?: number;
  onStartTrial?: (specId: SpecializationId) => void;
}

const SkillTreePanel: React.FC<SkillTreePanelProps> = ({
  specialization,
  skillPoints,
  unlockedSkills,
  level = 1,
  onStartTrial,
}) => {
  const [selectedSpec, setSelectedSpec] = useState<SpecializationId | null>(specialization || null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [showTrialInfo, setShowTrialInfo] = useState<SpecializationId | null>(null);
  const toast = useToast();
  const { confirm } = useConfirm();

  const hasChosen = !!specialization;
  const activeSpec = selectedSpec || 'JUGGERNAUT';
  const treeNodes = SKILL_NODES_V2.filter(n => n.specialization === activeSpec);
  const tiers = [1, 2, 3, 4];

  // Synergy state — pure client-side derivation from unlockedSkills
  const activeSynergies = useMemo(() => getActiveSynergiesV2(unlockedSkills), [unlockedSkills]);

  const handleUnlock = async (skillId: string) => {
    if (unlocking) return;

    // If this is the first skill unlock, confirm specialization choice
    if (!hasChosen) {
      const specName = SKILL_TREES_V2[activeSpec].name;
      const confirmed = await confirm({
        title: 'Permanent Specialization',
        message: `You are about to commit to the ${specName} specialization. This choice is PERMANENT and cannot be changed. Are you sure?`,
        confirmLabel: `Commit to ${specName}`,
        cancelLabel: 'Go Back',
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    setUnlocking(skillId);
    try {
      await dataService.unlockSkill(skillId, activeSpec);
      sfx.skillUnlock();
      toast.success('Skill unlocked!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlock');
    }
    setUnlocking(null);
  };

  const handleSelectSpec = (specId: SpecializationId) => {
    if (hasChosen && specialization !== specId) return;
    setSelectedSpec(specId);
    setShowTrialInfo(null);
  };

  const handleStartTrial = (specId: SpecializationId) => {
    if (!onStartTrial) {
      toast.info('Trial battles are not yet available.');
      return;
    }
    onStartTrial(specId);
  };

  const specDef = SPECIALIZATIONS[activeSpec];
  const isLocked = hasChosen && specialization !== activeSpec;
  const canChoose = !hasChosen && level >= specDef.unlockLevel;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[var(--text-primary)]">Combat Specialization</h3>
          <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
            {hasChosen
              ? 'Your specialization defines your combat role and available skills.'
              : 'Choose a combat specialization to unlock skill trees and role bonuses.'}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5">
          <Zap className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{skillPoints} SP</span>
        </div>
      </div>

      {/* Permanence warning banner */}
      {!hasChosen && (
        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-300">Choose Carefully</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400/70 mt-0.5">
              Selecting a specialization is <span className="font-bold text-amber-300">permanent</span>. Once you unlock your first skill, you will not be able to change your specialization. Browse all eight trees before deciding.
            </p>
          </div>
        </div>
      )}

      {/* Locked specialization indicator */}
      {hasChosen && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-xs text-[var(--text-secondary)]">
            Specialization locked:{" "}
            <span className="font-bold text-[var(--text-primary)]">
              {SKILL_TREES_V2[specialization!].icon} {SKILL_TREES_V2[specialization!].name}
            </span>
          </span>
        </div>
      )}

      {/* Spec selector — 4×2 grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {(Object.entries(SKILL_TREES_V2) as [SpecializationId, typeof SKILL_TREES_V2[SpecializationId]][]).map(([key, spec]) => {
          const isSelected = activeSpec === key;
          const isLockedChoice = hasChosen && specialization !== key;
          const hasSynergy = specIsInSynergyV2(key, activeSynergies);
          const specInfo = SPECIALIZATIONS[key];
          const meetsLevel = level >= specInfo.unlockLevel;
          const colors = SPEC_COLORS_V2[key];

          return (
            <button
              key={key}
              onClick={() => !isLockedChoice && meetsLevel && handleSelectSpec(key)}
              disabled={isLockedChoice || !meetsLevel}
              className={`relative p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? `border-white/30 bg-gradient-to-br ${colors.gradient} bg-opacity-10`
                  : isLockedChoice
                  ? 'border-[var(--border)] bg-[var(--surface-glass)] opacity-40 cursor-not-allowed'
                  : !meetsLevel
                  ? 'border-[var(--border)] bg-[var(--surface-glass)] opacity-50 cursor-not-allowed'
                  : 'border-[var(--border)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] cursor-pointer'
              } ${hasSynergy ? `ring-2 ${colors.ring}` : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{spec.icon}</span>
                <span className="font-bold text-sm text-[var(--text-primary)]">{spec.name}</span>
                {isLockedChoice && <Lock className="w-3 h-3 text-gray-500 ml-auto" />}
                {!meetsLevel && !isLockedChoice && (
                  <span className="ml-auto text-[9px] font-bold text-gray-500">Lv.{specInfo.unlockLevel}</span>
                )}
                {hasSynergy && (
                  <span
                    className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/10 border border-white/20 animate-pulse motion-reduce:animate-none"
                    title="This tree is in synergy with another active tree"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-white/80" />
                    <span className="text-[8px] font-bold text-white/80 leading-none">SYNC</span>
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-[var(--text-tertiary)] mt-1 line-clamp-2">{spec.description}</p>
              {!hasChosen && isSelected && meetsLevel && (
                <p className="text-[11.5px] text-amber-600 dark:text-amber-400/60 mt-1 font-bold">Browsing — not committed</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Active synergy panel */}
      {activeSynergies.length > 0 && (
        <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-white/60" />
            <span className="text-[11.5px] font-mono text-[var(--text-muted)] uppercase tracking-widest">Active Synergies</span>
          </div>
          {activeSynergies.map(syn => (
            <div
              key={syn.label}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10"
            >
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{syn.label}</span>
              <span className={`text-[11px] font-bold whitespace-nowrap ${syn.color}`}>{syn.bonus}</span>
            </div>
          ))}
          <p className="text-[11.5px] text-[var(--text-muted)] mt-1 leading-relaxed">
            Synergy bonuses are earned by having unlocked skills in multiple specializations. Bonuses are display-only and informational.
          </p>
        </div>
      )}

      {/* Spec detail card (when browsing or locked in) */}
      <div className={`p-4 rounded-xl border ${isLocked ? 'opacity-50' : ''} bg-gradient-to-br from-[var(--surface-glass)] to-transparent`}
        style={{ borderColor: SPEC_COLORS_V2[activeSpec].hex + '40' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span>{SKILL_TREES_V2[activeSpec].icon}</span>
              {SKILL_TREES_V2[activeSpec].name}
            </h4>
            <p className="text-[11.5px] text-[var(--text-tertiary)] mt-1">{specDef.description}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${SPEC_COLORS_V2[activeSpec].bg} ${SPEC_COLORS_V2[activeSpec].text} border border-current opacity-60`}>
              {specDef.baseRole}
            </span>
          </div>
        </div>

        {/* Base bonuses */}
        <div className="mt-3 flex flex-wrap gap-2">
          {specDef.bonuses.map((bonus, i) => (
            <div key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${SPEC_COLORS_V2[activeSpec].bg} border border-current opacity-40`}>
              {bonus.type === 'DAMAGE_BOOST' && <Sword className="w-3 h-3" />}
              {bonus.type === 'ARMOR_BOOST' && <Shield className="w-3 h-3" />}
              {bonus.type === 'CRIT_BOOST' && <Crosshair className="w-3 h-3" />}
              {bonus.type === 'HEALING_BOOST' && <Crosshair className="w-3 h-3" />}
              {bonus.type === 'HINT_BOOST' && <Brain className="w-3 h-3" />}
              {bonus.type === 'SPEED_BOOST' && <Zap className="w-3 h-3" />}
              <span className={`text-[11px] font-bold ${SPEC_COLORS_V2[activeSpec].text}`}>
                {bonus.type.replace('_', ' ')} {bonus.value > 0 && bonus.value < 1 ? `+${(bonus.value * 100).toFixed(0)}%` : `+${bonus.value}`}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">({bonus.condition})</span>
            </div>
          ))}
        </div>

        {/* Trial boss info (only when not yet chosen) */}
        {!hasChosen && canChoose && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11.5px] font-bold text-[var(--text-secondary)]">Unlock Challenge</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Defeat the trial boss to permanently unlock this specialization.
                </p>
              </div>
              <button
                onClick={() => setShowTrialInfo(showTrialInfo === activeSpec ? null : activeSpec)}
                className="px-3 py-1.5 rounded-lg bg-[var(--surface-glass-heavy)] border border-[var(--border)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              >
                {showTrialInfo === activeSpec ? 'Hide' : 'View Trial'}
              </button>
            </div>

            {showTrialInfo === activeSpec && (
              <div className="mt-2 p-3 rounded-lg bg-black/20 border border-[var(--border)]">
                {(() => {
                  const trial = getTrialBossForSpec(activeSpec);
                  if (!trial) return <p className="text-[11px] text-[var(--text-muted)]">No trial available.</p>;
                  return (
                    <>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{trial.name}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{trial.description}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-glass-heavy)] text-[var(--text-muted)]">
                          HP: {trial.maxHp}
                        </span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-glass-heavy)] text-[var(--text-muted)]">
                          Dmg/Answer: {trial.damagePerCorrect}
                        </span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-glass-heavy)] text-[var(--text-muted)]">
                          Min Accuracy: {(trial.requiredToPass.minAccuracy * 100).toFixed(0)}%
                        </span>
                      </div>
                      <button
                        onClick={() => handleStartTrial(activeSpec)}
                        className={`mt-3 w-full py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r ${SPEC_COLORS_V2[activeSpec].gradient} hover:opacity-90 transition`}
                      >
                        Start Trial
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skill nodes */}
      <div className="space-y-4">
        {tiers.map(tier => {
          const tierNodes = treeNodes.filter(n => n.tier === tier);
          return (
            <div key={tier}>
              <p className="text-[11.5px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">Tier {tier}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tierNodes.map(node => {
                  const isUnlocked = unlockedSkills.includes(node.id);
                  const canUnlock = !isUnlocked && canUnlockSkillV2(node.id, unlockedSkills) && skillPoints >= node.cost;
                  const isUnlockable = canUnlockSkillV2(node.id, unlockedSkills);

                  return (
                    <div
                      key={node.id}
                      className={`relative p-3 rounded-xl border transition-all ${
                        isUnlocked
                          ? 'border-green-500/30 bg-green-500/10'
                          : canUnlock
                          ? 'border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 cursor-pointer'
                          : 'border-[var(--border)] bg-[var(--surface-glass)] opacity-50'
                      }`}
                      onClick={() => canUnlock && handleUnlock(node.id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{node.icon}</span>
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">{node.name}</span>
                        {isUnlocked && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400 ml-auto" />}
                        {!isUnlocked && !isUnlockable && <Lock className="w-3 h-3 text-gray-600 ml-auto" />}
                      </div>
                      <p className="text-[11.5px] text-[var(--text-tertiary)]">{node.description}</p>
                      {!isUnlocked && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[11.5px] font-mono text-[var(--text-muted)]">
                            Cost: {node.cost} SP
                          </span>
                          {node.effect.condition && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-glass-heavy)] text-[var(--text-muted)]">
                              {node.effect.condition}
                            </span>
                          )}
                        </div>
                      )}
                      {unlocking === node.id && (
                        <div className="absolute inset-0 bg-[var(--backdrop)] rounded-xl flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SkillTreePanel;

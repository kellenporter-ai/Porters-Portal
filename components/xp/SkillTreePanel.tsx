
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
  SPECIALIZATION_IDENTITY,
  SPEC_PROFILES,
  getSkillIdentityEffect,
  getSkillRank,
  getTrialBossForSpec,
} from '../../lib/specializations';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { useConfirm } from '../ConfirmDialog';
import { useT, useInterpolate } from '../../lib/i18n';
import { Lock, CheckCircle2, Zap, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';

// ========================================
// COMPONENT
// ========================================

interface SkillTreePanelProps {
  specialization?: SpecializationId;
  skillPoints: number;
  unlockedSkills: string[];
  level?: number;
  onStartTrial?: (specId: SpecializationId) => void;
  /** Respec callable. Returns the server payload (soft errors, never throws). */
  onRespec?: (specId: SpecializationId) => Promise<{
    success?: boolean;
    cost?: number;
    remainingFlux?: number;
    specialization?: string;
    error?: 'INSUFFICIENT_FLUX' | 'NO_SPECIALIZATION' | 'SAME_SPECIALIZATION' | 'FIGHT_IN_PROGRESS';
    balance?: number;
    message?: string;
  } | void>;
  /** Flux cost of a respec, mirrored from the server constant. */
  respecCost?: number;
  /** Current Flux balance, for the "can I afford this" hint. */
  fluxBalance?: number;
}

const SkillTreePanel: React.FC<SkillTreePanelProps> = ({
  specialization,
  skillPoints,
  unlockedSkills,
  level = 1,
  onStartTrial,
  onRespec,
  respecCost = 250,
  fluxBalance = 0,
}) => {
  const [selectedSpec, setSelectedSpec] = useState<SpecializationId | null>(
    (specialization && SKILL_TREES_V2[specialization]) ? specialization : null
  );
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [showTrialInfo, setShowTrialInfo] = useState<SpecializationId | null>(null);
  const toast = useToast();
  const { confirm } = useConfirm();
  const t = useT();
  const interpolate = useInterpolate();

  const hasChosen = !!(specialization && SKILL_TREES_V2[specialization]);
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
        title: t('skills.permSpecTitle'),
        message: interpolate('skills.permSpecMsg', { spec: specName }),
        confirmLabel: interpolate('skills.commitTo', { spec: specName }),
        cancelLabel: t('skills.goBack'),
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    setUnlocking(skillId);
    try {
      await dataService.unlockSkill(skillId, activeSpec);
      sfx.skillUnlock();
      toast.success(t('skills.unlocked'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('skills.unlockFailed'));
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
      toast.info(t('skills.trialUnavailable'));
      return;
    }
    onStartTrial(specId);
  };

  const [respecTarget, setRespecTarget] = useState<SpecializationId | null>(null);
  const [respecBusy, setRespecBusy] = useState(false);

  const handleRespec = async (specId: SpecializationId) => {
    if (respecBusy || !onRespec) return;
    if (specId === specialization) {
      toast.info(t('skills.respecSame'));
      return;
    }
    const specName = SKILL_TREES_V2[specId].name;
    const confirmed = await confirm({
      title: t('skills.respecTitle'),
      message: interpolate('skills.respecMsg', { cost: respecCost, spec: specName }),
      confirmLabel: interpolate('skills.respecConfirm', { cost: respecCost }),
      cancelLabel: t('skills.goBack'),
      variant: 'warning',
    });
    if (!confirmed) return;

    setRespecBusy(true);
    try {
      const result = await onRespec(specId);
      if (result?.error) {
        if (result.error === 'FIGHT_IN_PROGRESS') {
          toast.error(t('skills.respecFight'));
        } else if (result.error === 'INSUFFICIENT_FLUX') {
          toast.error(interpolate('skills.respecShort', { shortfall: (result.cost || respecCost) - (result.balance || 0) }));
        } else if (result.error === 'SAME_SPECIALIZATION') {
          toast.info(t('skills.respecSame'));
        } else {
          toast.error(t('skills.respecFailed'));
        }
        return;
      }
      setSelectedSpec(specId);
      setRespecTarget(null);
      if (result?.success) {
        toast.success(interpolate('skills.respecDone', { spec: specName }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('skills.respecFailed'));
    } finally {
      setRespecBusy(false);
    }
  };

  const specDef = SPECIALIZATIONS[activeSpec];
  const isLocked = hasChosen && specialization !== activeSpec;
  const canChoose = !hasChosen && level >= specDef.unlockLevel;
  const skillRank = getSkillRank(unlockedSkills, activeSpec);
  const identity = SPECIALIZATION_IDENTITY[activeSpec];
  const formatIdentityEffect = (rank: number): string => {
    const value = getSkillIdentityEffect(activeSpec, rank);
    return identity.kind === 'HEAL'
      ? interpolate('skill.effectHeal', { value, attempt: value * 2 })
      : interpolate('skill.effectDamage', { value: value.toFixed(2) });
  };

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

      {/* Permanence warning banner — respec now exists, so the copy must not
          claim the choice is permanent. */}
      {!hasChosen && (
        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-300">Choose Carefully</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400/70 mt-0.5">
              Your first choice is free. If you change your mind later you can respec for{' '}
              <span className="font-bold text-amber-300">{respecCost} Flux</span>, and you keep every skill point you earned.
            </p>
          </div>
        </div>
      )}

      {/* Locked specialization indicator */}
      {hasChosen && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-xs text-[var(--text-secondary)]">
              Current specialization:{" "}
              <span className="font-bold text-[var(--text-primary)]">
                {SKILL_TREES_V2[specialization!].icon} {SKILL_TREES_V2[specialization!].name}
              </span>
            </span>
          </div>

          {/* Respec — only rendered when the caller wired the callable */}
          {onRespec && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl">
              <RefreshCw className="w-4 h-4 text-cyan-600 dark:text-cyan-400 flex-shrink-0" />
              <span className="text-xs text-[var(--text-secondary)] flex-1 min-w-[12rem]">
                {interpolate('skills.respecHint', { cost: respecCost })}
                {fluxBalance < respecCost && (
                  <span className="text-red-600 dark:text-red-400 font-bold ml-1">
                    {interpolate('skills.respecShort', { shortfall: respecCost - fluxBalance })}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={respecBusy}
                onClick={() => setRespecTarget(respecTarget ? null : activeSpec)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-600/30 transition disabled:opacity-50"
              >
                {t('skills.respecOpen')}
              </button>
            </div>
          )}

          {respecTarget && onRespec && (
            <div className="p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-2">
              <p className="text-xs font-bold text-cyan-700 dark:text-cyan-400">
                {interpolate('skills.respecPick', { cost: respecCost })}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {(Object.entries(SKILL_TREES_V2) as [SpecializationId, typeof SKILL_TREES_V2[SpecializationId]][])
                  .filter(([key]) => key !== specialization)
                  .map(([key, spec]) => {
                    const profile = SPEC_PROFILES[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={respecBusy}
                        onClick={() => void handleRespec(key)}
                        className="text-left px-3 py-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] hover:border-cyan-500/50 transition disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-[var(--text-primary)]">
                            {spec.icon} {spec.name}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--surface-glass)] text-[var(--text-muted)]">
                            {t(`skills.diff.${profile.difficulty}`)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mb-1">
                          <span className="font-bold">{t('skills.triggerLabel')}</span> {profile.trigger}
                        </p>
                        <p className="text-[11px] text-green-600 dark:text-green-400">
                          <span className="font-bold">+ </span>{profile.strength}
                        </p>
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          <span className="font-bold">- </span>{profile.weakness}
                        </p>
                      </button>
                    );
                  })}
              </div>
              <button
                type="button"
                onClick={() => setRespecTarget(null)}
                className="text-[11px] text-[var(--text-muted)] underline"
              >
                {t('skills.goBack')}
              </button>
            </div>
          )}
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
              {isSelected && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[10.5px] text-[var(--text-secondary)]">
                    <span className="font-bold">{t('skills.triggerLabel')}</span> {SPEC_PROFILES[key].trigger}
                  </p>
                  <p className="text-[10.5px] text-green-600 dark:text-green-400">
                    <span className="font-bold">+ </span>{SPEC_PROFILES[key].strength}
                  </p>
                  <p className="text-[10.5px] text-amber-600 dark:text-amber-400">
                    <span className="font-bold">- </span>{SPEC_PROFILES[key].weakness}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
                    {t(`skills.diff.${SPEC_PROFILES[key].difficulty}`)}
                  </p>
                </div>
              )}
              {!hasChosen && isSelected && meetsLevel && (
                <p className="text-[11.5px] text-amber-600 dark:text-amber-400/60 mt-1 font-bold">Browsing — not committed</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Active synergy milestones */}
      {activeSynergies.length > 0 && (
        <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-white/60" />
            <span className="text-[11.5px] font-mono text-[var(--text-muted)] uppercase tracking-widest">Active Connections</span>
          </div>
          {activeSynergies.map(syn => (
            <div
              key={syn.label}
              className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10"
            >
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{syn.label}</span>
            </div>
          ))}
          <p className="text-[11.5px] text-[var(--text-muted)] mt-1 leading-relaxed">
            These milestones connect specialization themes. Combat effects come only from the rank header below.
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
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${SPEC_COLORS_V2[activeSpec].bg} ${SPEC_COLORS_V2[activeSpec].text} border border-current opacity-60`}>
              {specDef.baseRole}
            </span>
          </div>
        </div>

        <section
          aria-label={interpolate('skill.rankHeader', { rank: skillRank })}
          className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-glass)] p-3 space-y-2"
        >
          <h5 className="text-sm font-bold text-[var(--text-primary)]">
            {interpolate('skill.rankHeader', { rank: skillRank })}
          </h5>
          <p className="text-[11.5px] text-[var(--text-secondary)]">{t(identity.triggerKey)}</p>
          {skillRank === 0 ? (
            <p className="text-[11.5px] text-[var(--text-tertiary)]">{t('skill.rankZero')}</p>
          ) : (
            <dl className="grid grid-cols-1 gap-2 text-[11.5px] sm:grid-cols-[auto_1fr] sm:gap-x-3">
              <dt className="font-bold text-[var(--text-secondary)]">
                {interpolate('skill.current', { rank: skillRank })}
              </dt>
              <dd className="text-[var(--text-primary)]">{formatIdentityEffect(skillRank)}</dd>
              {skillRank < 6 && (
                <>
                  <dt className="font-bold text-[var(--text-secondary)]">
                    {interpolate('skill.next', { rank: skillRank + 1 })}
                  </dt>
                  <dd className="text-[var(--text-primary)]">{formatIdentityEffect(skillRank + 1)}</dd>
                </>
              )}
              <dt className="font-bold text-[var(--text-secondary)]">{t('skill.max')}</dt>
              <dd className="text-[var(--text-primary)]">{formatIdentityEffect(6)}</dd>
            </dl>
          )}
        </section>

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
                        {t('skills.startTrial')}
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
              <p className="text-[11.5px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">{interpolate('skills.tier', { tier })}</p>
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
                        <div className="mt-1 space-y-1">
                          <span className="text-[11.5px] font-mono text-[var(--text-muted)]">
                            {interpolate('skills.cost', { cost: node.cost })}
                          </span>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            {interpolate('skill.nodeAdvance', {
                              spec: SKILL_TREES_V2[activeSpec].name,
                              rank: Math.min(6, skillRank + 1),
                            })}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            {interpolate('skill.rankGain', {
                              from: formatIdentityEffect(skillRank),
                              to: formatIdentityEffect(Math.min(6, skillRank + 1)),
                            })}
                          </p>
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

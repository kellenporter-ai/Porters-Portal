
import React, { useState, useMemo } from 'react';
import { SpecializationType } from '../../types';
import { SKILL_TREES, SKILL_NODES, canUnlockSkill } from '../../lib/achievements';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { useConfirm } from '../ConfirmDialog';
import { Lock, CheckCircle2, Zap, AlertTriangle, Sparkles } from 'lucide-react';

// ========================================
// SYNERGY DEFINITIONS
// ========================================

type SynergyPairKey = `${SpecializationType}×${SpecializationType}`;

interface SynergyDefinition {
  specs: [SpecializationType, SpecializationType];
  label: string;
  bonus: string;
  color: string; // tailwind text color class for the bonus
}

const SYNERGY_DEFINITIONS: SynergyDefinition[] = [
  {
    specs: ['THEORIST', 'EXPERIMENTALIST'],
    label: 'Theorist × Experimentalist',
    bonus: '+10% experiment XP',
    color: 'text-cyan-700 dark:text-cyan-400',
  },
  {
    specs: ['THEORIST', 'ANALYST'],
    label: 'Theorist × Analyst',
    bonus: '+5% accuracy bonus',
    color: 'text-blue-400',
  },
  {
    specs: ['THEORIST', 'DIPLOMAT'],
    label: 'Theorist × Diplomat',
    bonus: '+8% group quest XP',
    color: 'text-purple-400',
  },
  {
    specs: ['EXPERIMENTALIST', 'ANALYST'],
    label: 'Experimentalist × Analyst',
    bonus: '+10% lab score bonus',
    color: 'text-yellow-400',
  },
  {
    specs: ['EXPERIMENTALIST', 'DIPLOMAT'],
    label: 'Experimentalist × Diplomat',
    bonus: '+5% Flux from crafting',
    color: 'text-emerald-400',
  },
  {
    specs: ['ANALYST', 'DIPLOMAT'],
    label: 'Analyst × Diplomat',
    bonus: '+8% streak maintenance',
    color: 'text-pink-400',
  },
];

// Build a lookup map: canonical pair key → definition
const SYNERGY_MAP = new Map<SynergyPairKey, SynergyDefinition>();
for (const def of SYNERGY_DEFINITIONS) {
  const [a, b] = def.specs;
  SYNERGY_MAP.set(`${a}×${b}`, def);
}

/**
 * Returns the ordered canonical key for any two specs so map lookups are
 * consistent regardless of argument order.
 */
function synergyKey(a: SpecializationType, b: SpecializationType): SynergyPairKey {
  const order: SpecializationType[] = ['THEORIST', 'EXPERIMENTALIST', 'ANALYST', 'DIPLOMAT'];
  return order.indexOf(a) < order.indexOf(b)
    ? `${a}×${b}`
    : `${b}×${a}`;
}

/**
 * Given the student's unlocked skill IDs, determine which specialization trees
 * have at least one unlocked skill and return the active SynergyDefinitions.
 */
function getActiveSynergies(unlockedSkills: string[]): SynergyDefinition[] {
  const allSpecs: SpecializationType[] = ['THEORIST', 'EXPERIMENTALIST', 'ANALYST', 'DIPLOMAT'];

  // Which specs have at least one unlocked skill?
  const activeSpecs = allSpecs.filter(spec =>
    SKILL_NODES.some(n => n.specialization === spec && unlockedSkills.includes(n.id))
  );

  if (activeSpecs.length < 2) return [];

  const synergies: SynergyDefinition[] = [];
  for (let i = 0; i < activeSpecs.length; i++) {
    for (let j = i + 1; j < activeSpecs.length; j++) {
      const key = synergyKey(activeSpecs[i], activeSpecs[j]);
      const def = SYNERGY_MAP.get(key);
      if (def) synergies.push(def);
    }
  }
  return synergies;
}

/**
 * Returns true if the given spec is part of any active synergy.
 */
function specIsInSynergy(spec: SpecializationType, activeSynergies: SynergyDefinition[]): boolean {
  return activeSynergies.some(s => s.specs.includes(spec));
}

// ========================================
// SPEC DISPLAY COLORS
// ========================================

const SPEC_COLORS: Record<SpecializationType, string> = {
  THEORIST: 'from-blue-500 to-cyan-500',
  EXPERIMENTALIST: 'from-green-500 to-emerald-500',
  ANALYST: 'from-yellow-500 to-orange-500',
  DIPLOMAT: 'from-purple-500 to-pink-500',
};

// Ring glow color for synergy badge per spec
const SPEC_SYNERGY_RING: Record<SpecializationType, string> = {
  THEORIST: 'ring-blue-400/60',
  EXPERIMENTALIST: 'ring-emerald-400/60',
  ANALYST: 'ring-yellow-400/60',
  DIPLOMAT: 'ring-purple-400/60',
};

// ========================================
// COMPONENT
// ========================================

interface SkillTreePanelProps {
  specialization?: SpecializationType;
  skillPoints: number;
  unlockedSkills: string[];
}

const SkillTreePanel: React.FC<SkillTreePanelProps> = ({ specialization, skillPoints, unlockedSkills }) => {
  const [selectedSpec, setSelectedSpec] = useState<SpecializationType | null>(specialization || null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const toast = useToast();
  const { confirm } = useConfirm();

  const hasChosen = !!specialization;
  const activeSpec = selectedSpec || 'THEORIST';
  const treeNodes = SKILL_NODES.filter(n => n.specialization === activeSpec);
  const tiers = [1, 2, 3, 4];

  // Synergy state — pure client-side derivation from unlockedSkills
  const activeSynergies = useMemo(() => getActiveSynergies(unlockedSkills), [unlockedSkills]);

  const handleUnlock = async (skillId: string) => {
    if (unlocking) return;

    // If this is the first skill unlock, confirm specialization choice
    if (!hasChosen) {
      const specName = SKILL_TREES[activeSpec].name;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[var(--text-primary)]">Specialization</h3>
          <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">You earn 1 Skill Point every 2 levels</p>
        </div>
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-bold text-yellow-400">{skillPoints} SP</span>
        </div>
      </div>

      {/* Permanence warning banner */}
      {!hasChosen && (
        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-300">Choose Carefully</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">
              Selecting a specialization is <span className="font-bold text-amber-300">permanent</span>. Once you unlock your first skill, you will not be able to change your specialization. Browse all four trees before deciding.
            </p>
          </div>
        </div>
      )}

      {hasChosen && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-xs text-[var(--text-secondary)]">Specialization locked: <span className="font-bold text-[var(--text-primary)]">{SKILL_TREES[specialization!].icon} {SKILL_TREES[specialization!].name}</span></span>
        </div>
      )}

      {/* Spec selector */}
      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(SKILL_TREES) as [SpecializationType, typeof SKILL_TREES[SpecializationType]][]).map(([key, spec]) => {
          const isSelected = activeSpec === key;
          const isLocked = hasChosen && specialization !== key;
          const hasSynergy = specIsInSynergy(key, activeSynergies);
          return (
            <button
              key={key}
              onClick={() => !isLocked && setSelectedSpec(key)}
              disabled={isLocked}
              className={`relative p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? `border-white/30 bg-gradient-to-br ${SPEC_COLORS[key]} bg-opacity-10`
                  : isLocked
                  ? 'border-[var(--border)] bg-[var(--surface-glass)] opacity-40 cursor-not-allowed'
                  : 'border-[var(--border)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] cursor-pointer'
              } ${hasSynergy ? `ring-2 ${SPEC_SYNERGY_RING[key]}` : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{spec.icon}</span>
                <span className="font-bold text-sm text-[var(--text-primary)]">{spec.name}</span>
                {isLocked && <Lock className="w-3 h-3 text-gray-500 ml-auto" />}
                {/* Synergy glow badge */}
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
              <p className="text-[11.5px] text-[var(--text-tertiary)] mt-1">{spec.description}</p>
              {!hasChosen && isSelected && <p className="text-[11.5px] text-amber-400/60 mt-1 font-bold">Browsing — not committed</p>}
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

      {/* Skill nodes */}
      <div className="space-y-4">
        {tiers.map(tier => {
          const tierNodes = treeNodes.filter(n => n.tier === tier);
          return (
            <div key={tier}>
              <p className="text-[11.5px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">Tier {tier}</p>
              <div className="grid grid-cols-2 gap-2">
                {tierNodes.map(node => {
                  const isUnlocked = unlockedSkills.includes(node.id);
                  const canUnlock = !isUnlocked && canUnlockSkill(node.id, unlockedSkills) && skillPoints >= node.cost;
                  const isUnlockable = canUnlockSkill(node.id, unlockedSkills);

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
                        {isUnlocked && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ml-auto" />}
                        {!isUnlocked && !isUnlockable && <Lock className="w-3 h-3 text-gray-600 ml-auto" />}
                      </div>
                      <p className="text-[11.5px] text-[var(--text-tertiary)]">{node.description}</p>
                      {!isUnlocked && (
                        <div className="mt-1 text-[11.5px] font-mono text-[var(--text-muted)]">
                          Cost: {node.cost} SP
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

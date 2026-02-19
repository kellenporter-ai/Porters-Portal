
import React, { useState } from 'react';
import { SpecializationType } from '../../types';
import { SKILL_TREES, SKILL_NODES, canUnlockSkill } from '../../lib/achievements';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { useConfirm } from '../ConfirmDialog';
import { Lock, CheckCircle2, Zap, AlertTriangle } from 'lucide-react';

interface SkillTreePanelProps {
  specialization?: SpecializationType;
  skillPoints: number;
  unlockedSkills: string[];
}

const SPEC_COLORS: Record<SpecializationType, string> = {
  THEORIST: 'from-blue-500 to-cyan-500',
  EXPERIMENTALIST: 'from-green-500 to-emerald-500',
  ANALYST: 'from-yellow-500 to-orange-500',
  DIPLOMAT: 'from-purple-500 to-pink-500',
};

const SkillTreePanel: React.FC<SkillTreePanelProps> = ({ specialization, skillPoints, unlockedSkills }) => {
  const [selectedSpec, setSelectedSpec] = useState<SpecializationType | null>(specialization || null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const toast = useToast();
  const { confirm } = useConfirm();

  const hasChosen = !!specialization;
  const activeSpec = selectedSpec || 'THEORIST';
  const treeNodes = SKILL_NODES.filter(n => n.specialization === activeSpec);
  const tiers = [1, 2, 3, 4];

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
          <h3 className="text-xl font-bold text-white">Specialization</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">You earn 1 Skill Point every 2 levels</p>
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
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-xs text-gray-300">Specialization locked: <span className="font-bold text-white">{SKILL_TREES[specialization!].icon} {SKILL_TREES[specialization!].name}</span></span>
        </div>
      )}

      {/* Spec selector */}
      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(SKILL_TREES) as [SpecializationType, typeof SKILL_TREES[SpecializationType]][]).map(([key, spec]) => {
          const isSelected = activeSpec === key;
          const isLocked = hasChosen && specialization !== key;
          return (
            <button
              key={key}
              onClick={() => !isLocked && setSelectedSpec(key)}
              disabled={isLocked}
              className={`p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? `border-white/30 bg-gradient-to-br ${SPEC_COLORS[key]} bg-opacity-10`
                  : isLocked
                  ? 'border-white/5 bg-white/2 opacity-40 cursor-not-allowed'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{spec.icon}</span>
                <span className="font-bold text-sm text-white">{spec.name}</span>
                {isLocked && <Lock className="w-3 h-3 text-gray-500 ml-auto" />}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{spec.description}</p>
              {!hasChosen && isSelected && <p className="text-[9px] text-amber-400/60 mt-1 font-bold">Browsing — not committed</p>}
            </button>
          );
        })}
      </div>

      {/* Skill nodes */}
      <div className="space-y-4">
        {tiers.map(tier => {
          const tierNodes = treeNodes.filter(n => n.tier === tier);
          return (
            <div key={tier}>
              <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-2">Tier {tier}</p>
              <div className="grid grid-cols-2 gap-2">
                {tierNodes.map(node => {
                  const isUnlocked = unlockedSkills.includes(node.id);
                  const canUnlock = hasChosen && !isUnlocked && canUnlockSkill(node.id, unlockedSkills) && skillPoints >= node.cost;
                  const isUnlockable = canUnlockSkill(node.id, unlockedSkills);

                  return (
                    <div
                      key={node.id}
                      className={`relative p-3 rounded-xl border transition-all ${
                        isUnlocked
                          ? 'border-green-500/30 bg-green-500/10'
                          : canUnlock
                          ? 'border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 cursor-pointer'
                          : 'border-white/5 bg-white/3 opacity-50'
                      }`}
                      onClick={() => canUnlock && handleUnlock(node.id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{node.icon}</span>
                        <span className="text-xs font-bold text-white truncate">{node.name}</span>
                        {isUnlocked && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ml-auto" />}
                        {!isUnlocked && !isUnlockable && <Lock className="w-3 h-3 text-gray-600 ml-auto" />}
                      </div>
                      <p className="text-[10px] text-gray-400">{node.description}</p>
                      {!isUnlocked && (
                        <div className="mt-1 text-[9px] font-mono text-gray-600">
                          Cost: {node.cost} SP
                        </div>
                      )}
                      {unlocking === node.id && (
                        <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
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

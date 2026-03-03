import React, { useState, useEffect } from 'react';
import { IdleMission, ActiveIdleMission } from '../../types';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Timer, Zap, Star, Lock, CheckCircle2, Clock, Briefcase } from 'lucide-react';
import { calculatePlayerStats, calculateGearScore } from '../../lib/gamification';

interface IdleMissionsPanelProps {
  userId: string;
  classType: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  MEDIUM: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  HARD:   'text-red-400 bg-red-500/10 border-red-500/20',
};

const DURATION_LABEL: Record<number, string> = {
  30:  '30 min',
  60:  '1 hr',
  120: '2 hr',
  240: '4 hr',
};

function formatCountdown(completesAt: string): string {
  const msLeft = new Date(completesAt).getTime() - Date.now();
  if (msLeft <= 0) return 'Ready!';
  const totalSec = Math.floor(msLeft / 1000);
  const hrs  = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function isComplete(completesAt: string): boolean {
  return new Date(completesAt).getTime() <= Date.now();
}

const IdleMissionsPanel: React.FC<IdleMissionsPanelProps> = ({
  userId,
  classType,
}) => {
  const toast = useToast();
  const [missions, setMissions] = useState<IdleMission[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [activeMissions, setActiveMissions] = useState<ActiveIdleMission[]>([]);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerStats, setPlayerStats] = useState({ tech: 10, focus: 10, analysis: 10, charisma: 10 });
  const [gearScore, setGearScore] = useState(0);

  // Subscribe to active missions for this class
  useEffect(() => {
    const unsub = dataService.subscribeToIdleMissions(classType, setMissions);
    return unsub;
  }, [classType]);

  // Subscribe to user doc for active missions, level, stats, gear score
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      const data = snap.data();
      if (!data) return;
      const gam = data.gamification || {};
      setActiveMissions(gam.activeMissions || []);
      setPlayerLevel(gam.level || 1);
      const stats = calculatePlayerStats({ gamification: gam });
      setPlayerStats(stats);
      setGearScore(calculateGearScore(gam.equipped));
    });
    return unsub;
  }, [userId]);

  // Tick every second to update countdowns
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const maxSlots = playerLevel >= 50 ? 3 : playerLevel >= 25 ? 2 : 1;
  const unclaimed = activeMissions.filter(m => !m.claimed);
  const slotsUsed = unclaimed.length;

  const handleDeploy = async (mission: IdleMission) => {
    setLoading(`deploy-${mission.id}`);
    try {
      await dataService.deployIdleMission(mission.id);
      toast.success(`Agent deployed on "${mission.name}"!`);
      // activeMissions auto-refresh via snapshot
    } catch (err: any) {
      toast.error(err?.message || 'Failed to deploy agent.');
    } finally {
      setLoading(null);
    }
  };

  const handleClaim = async (active: ActiveIdleMission) => {
    setLoading(`claim-${active.missionId}`);
    try {
      const res = await dataService.claimIdleMission(active.missionId);
      const bonusText = res.bonusesApplied?.length
        ? ` (${res.bonusesApplied.join(', ')})`
        : '';
      toast.success(
        `Claimed! +${res.xpAwarded} XP, +${res.fluxAwarded} Flux${bonusText}${res.loot ? ' + Loot!' : ''}`
      );
      // activeMissions auto-refresh via snapshot
    } catch (err: any) {
      toast.error(err?.message || 'Failed to claim mission.');
    } finally {
      setLoading(null);
    }
  };

  // Build a map of missionId -> active entry for quick lookup
  const activeMap = new Map<string, ActiveIdleMission>();
  for (const m of activeMissions) {
    if (!m.claimed) activeMap.set(m.missionId, m);
  }

  return (
    <div className="space-y-4">
      {/* Slot indicator */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Briefcase className="w-3.5 h-3.5 text-purple-400" />
          <span>Mission Slots: <span className={slotsUsed >= maxSlots ? 'text-red-400 font-bold' : 'text-white font-bold'}>{slotsUsed}/{maxSlots}</span></span>
        </div>
        {playerLevel < 25 && (
          <span className="text-[10px] text-gray-600">Lv 25 = 2 slots · Lv 50 = 3 slots</span>
        )}
      </div>

      {/* Active missions (in progress or claimable) */}
      {unclaimed.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-purple-400 px-1">Active Deployments</h4>
          {unclaimed.map(active => {
            const ready = isComplete(active.completesAt);
            const isClaiming = loading === `claim-${active.missionId}`;
            return (
              <div key={`${active.missionId}-${active.deployedAt}`}
                className={`rounded-2xl border p-4 flex flex-col gap-3 ${ready ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-black/30'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate">{active.missionName}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">GS {active.gearScore} · {active.classType}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {ready ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-500" />
                    )}
                    <span className={`text-sm font-bold ${ready ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {formatCountdown(active.completesAt)}
                    </span>
                  </div>
                </div>

                {ready && (
                  <button
                    onClick={() => handleClaim(active)}
                    disabled={isClaiming}
                    className="w-full py-2 rounded-xl font-bold text-sm bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    {isClaiming ? 'Claiming...' : 'Claim Rewards'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Available missions */}
      {missions.length === 0 ? (
        <div className="text-gray-500 italic text-center py-12 bg-black/20 rounded-2xl border border-white/5 text-sm">
          No missions available for this class.
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Available Missions</h4>
          {missions.map(mission => {
            const levelLocked = mission.minLevel !== undefined && playerLevel < mission.minLevel;
            const alreadyActive = activeMap.has(mission.id);
            const slotsFull = slotsUsed >= maxSlots;
            const isDeploying = loading === `deploy-${mission.id}`;
            const disabled = levelLocked || alreadyActive || slotsFull || isDeploying;

            // Determine which stat bonuses the player already satisfies
            const statBonuses = mission.statBonuses || [];

            return (
              <div key={mission.id}
                className={`rounded-2xl border p-4 space-y-3 ${alreadyActive ? 'border-purple-500/20 bg-purple-500/5' : levelLocked ? 'border-white/5 bg-black/20 opacity-60' : 'border-white/10 bg-black/30'}`}>

                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{mission.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${DIFFICULTY_COLORS[mission.difficulty] || DIFFICULTY_COLORS.EASY}`}>
                        {mission.difficulty}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{mission.description}</p>
                  </div>
                  <div className="text-[10px] text-gray-600 flex-shrink-0 text-right">
                    <Timer className="w-3 h-3 inline mr-0.5" />
                    {DURATION_LABEL[mission.duration] ?? `${mission.duration}m`}
                  </div>
                </div>

                {/* Requirements */}
                {(mission.minLevel || statBonuses.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {mission.minLevel && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${levelLocked ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-gray-500 bg-white/5 border-white/5'}`}>
                        {levelLocked && <Lock className="w-2.5 h-2.5 inline mr-0.5" />}
                        Lv. {mission.minLevel}+
                      </span>
                    )}
                  </div>
                )}

                {/* Rewards */}
                <div className="flex items-center gap-3 text-[10px] text-gray-500 border-t border-white/5 pt-2">
                  <span className="text-yellow-400 font-bold"><Zap className="w-3 h-3 inline mr-0.5" />{mission.rewards.xp} XP</span>
                  <span className="text-blue-400 font-bold"><Star className="w-3 h-3 inline mr-0.5" />{mission.rewards.flux} Flux</span>
                  {mission.rewards.itemRarity && (
                    <span className="text-purple-400 font-bold">{mission.rewards.itemRarity} Loot</span>
                  )}
                </div>

                {/* Stat bonuses */}
                {statBonuses.length > 0 && (
                  <div className="space-y-1">
                    {statBonuses.map((bonus, i) => {
                      const playerStat = playerStats[bonus.stat] || 10;
                      const qualifies = playerStat >= bonus.threshold;
                      return (
                        <div key={i} className={`text-[10px] px-2 py-1 rounded-lg ${qualifies ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-600 bg-white/5'}`}>
                          {qualifies ? '✓' : '○'} {bonus.description}
                          {!qualifies && <span className="ml-1 text-gray-700">(need {bonus.threshold} {bonus.stat}, have {playerStat})</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Gear score indicator */}
                {gearScore > 0 && (
                  <div className="text-[10px] text-gray-600">
                    Your GS {gearScore} → +{Math.round((gearScore / 1000) * 100)}% reward bonus
                  </div>
                )}

                {/* Action button */}
                {alreadyActive ? (
                  <div className="text-center text-[10px] text-purple-400 font-bold py-1">Agent Deployed</div>
                ) : (
                  <button
                    onClick={() => handleDeploy(mission)}
                    disabled={disabled}
                    className={`w-full py-2 rounded-xl font-bold text-sm transition-colors ${
                      disabled
                        ? 'bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed'
                        : 'bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30'
                    }`}
                  >
                    {isDeploying ? 'Deploying...' : slotsFull ? 'No Slots Available' : levelLocked ? 'Level Required' : 'Deploy Agent'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IdleMissionsPanel;


import React, { useState, useEffect } from 'react';
import { DailyChallenge, DailyChallengeProgress } from '../../types';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { Target, CheckCircle2, Gift, Calendar, Zap } from 'lucide-react';

interface DailyChallengesPanelProps {
  userId: string;
  activeChallenges: DailyChallengeProgress[];
  classType?: string;
}

const DailyChallengesPanel: React.FC<DailyChallengesPanelProps> = ({ userId, activeChallenges, classType }) => {
  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const unsub = dataService.subscribeToDailyChallenges(setChallenges);
    return () => unsub();
  }, []);

  const getProgress = (challengeId: string): DailyChallengeProgress | undefined => {
    return activeChallenges.find(c => c.challengeId === challengeId);
  };

  const handleClaim = async (challengeId: string) => {
    if (claiming) return;
    setClaiming(challengeId);
    try {
      const result = await dataService.claimDailyChallenge(challengeId, classType);
      sfx.dailyReward();
      toast.success(`Claimed! +${result.xpReward} XP${result.fluxReward ? ` +${result.fluxReward} Flux` : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Claim failed');
    }
    setClaiming(null);
  };

  if (challenges.length === 0) return null;

  const dailyChallenges = challenges.filter(c => !c.isWeekly);
  const weeklyChallenges = challenges.filter(c => c.isWeekly);

  const renderChallenge = (challenge: DailyChallenge) => {
    const progress = getProgress(challenge.id);
    const current = progress?.progress || 0;
    const isCompleted = progress?.completed || false;
    const isClaimed = !!progress?.claimedAt;
    const progressPct = Math.min(100, (current / challenge.target) * 100);

    return (
      <div
        key={challenge.id}
        className={`p-3 rounded-xl border transition-all ${
          isClaimed ? 'border-green-500/20 bg-green-500/5 opacity-60' :
          isCompleted ? 'border-yellow-500/30 bg-yellow-500/5' :
          'border-white/10 bg-white/5'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-1.5 rounded-lg ${isCompleted ? 'bg-yellow-500/20' : 'bg-white/5'}`}>
            {isClaimed ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
             isCompleted ? <Gift className="w-4 h-4 text-yellow-400" /> :
             <Target className="w-4 h-4 text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">{challenge.title}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-yellow-400 font-bold">+{challenge.xpReward} XP</span>
                {challenge.fluxReward && (
                  <span className="text-[10px] text-cyan-400 font-bold">+{challenge.fluxReward}</span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{challenge.description}</p>

            {!isClaimed && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 bg-white/5 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isCompleted
                        ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500'
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-600 font-mono">{current}/{challenge.target}</span>
              </div>
            )}

            {isCompleted && !isClaimed && (
              <button
                onClick={() => handleClaim(challenge.id)}
                disabled={!!claiming}
                className="mt-2 px-3 py-1 bg-gradient-to-r from-yellow-600 to-amber-600 text-white text-xs font-bold rounded-lg hover:scale-105 transition-all"
              >
                {claiming === challenge.id ? 'Claiming...' : 'Claim Reward'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        <Calendar className="w-5 h-5 text-purple-400" /> Daily Challenges
      </h3>

      <div className="space-y-2">
        {dailyChallenges.map(renderChallenge)}
      </div>

      {weeklyChallenges.length > 0 && (
        <>
          <h4 className="text-xs font-mono uppercase tracking-widest text-gray-600 mt-4 flex items-center gap-1">
            <Zap className="w-3 h-3 text-cyan-400" /> Weekly Challenge
          </h4>
          <div className="space-y-2">
            {weeklyChallenges.map(renderChallenge)}
          </div>
        </>
      )}
    </div>
  );
};

export default DailyChallengesPanel;

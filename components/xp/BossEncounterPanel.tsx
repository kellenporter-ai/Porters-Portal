
import React, { useState, useEffect } from 'react';
import { BossEncounter } from '../../types';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { Sword, Shield, Clock, Users, Zap, Crosshair } from 'lucide-react';

interface BossEncounterPanelProps {
  userId: string;
  userName: string;
  classType?: string;
}

// Aggregates distributed shard damage for a single boss
function useBossHealth(bossId: string, maxHp: number): number {
  const [currentHp, setCurrentHp] = useState(maxHp);
  useEffect(() => {
    const unsub = dataService.subscribeToBossShards(bossId, (totalDamage) => {
      setCurrentHp(Math.max(0, maxHp - totalDamage));
    });
    return () => unsub();
  }, [bossId, maxHp]);
  return currentHp;
}

// Aggregates distributed damage log for leaderboard
function useBossDamageLog(bossId: string) {
  const [log, setLog] = useState<{ userId: string; userName: string; damage: number; timestamp: string }[]>([]);
  useEffect(() => {
    const unsub = dataService.subscribeToBossDamageLog(bossId, setLog);
    return () => unsub();
  }, [bossId]);
  return log;
}

// Individual boss card that subscribes to its own shards
const BossCard: React.FC<{
  boss: BossEncounter;
  userId: string;
  userName: string;
  attacking: string | null;
  onAttack: (bossId: string) => void;
  lastHit: { bossId: string; damage: number; isCrit?: boolean } | null;
}> = ({ boss, userId, attacking, onAttack, lastHit }) => {
  const currentHp = useBossHealth(boss.id, boss.maxHp);
  const damageLog = useBossDamageLog(boss.id);
  const hpPercent = (currentHp / boss.maxHp) * 100;
  const timeLeft = new Date(boss.deadline).getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600000));

  // Build leaderboard from distributed damage log
  const topDamagers = damageLog.reduce<Record<string, { name: string; total: number }>>((acc, entry) => {
    if (!acc[entry.userId]) acc[entry.userId] = { name: entry.userName, total: 0 };
    acc[entry.userId].total += entry.damage;
    return acc;
  }, {});
  const leaderboard = Object.entries(topDamagers)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 5);

  const myDamage = topDamagers[userId]?.total || 0;
  const isHit = lastHit?.bossId === boss.id;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/40 to-black/60">
      {/* Hit flash */}
      {isHit && (
        <div className="absolute inset-0 bg-red-500/20 animate-ping pointer-events-none" style={{ animationDuration: '0.3s', animationIterationCount: 1 }} />
      )}

      <div className="p-5 space-y-4">
        {/* Boss header */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-black text-red-400">{boss.name}</h4>
            <p className="text-xs text-gray-500">{boss.description}</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            {hoursLeft > 0 ? `${hoursLeft}h left` : 'Expiring soon'}
          </div>
        </div>

        {/* HP bar — driven by distributed shard aggregation */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-red-400 font-mono">{currentHp.toLocaleString()} HP</span>
            <span className="text-gray-600">{boss.maxHp.toLocaleString()}</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-4 overflow-hidden">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${
                hpPercent > 50 ? 'bg-gradient-to-r from-red-600 to-red-500' :
                hpPercent > 25 ? 'bg-gradient-to-r from-orange-600 to-yellow-500' :
                'bg-gradient-to-r from-yellow-600 to-green-500'
              }`}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>

        {/* Damage display */}
        {isHit && lastHit && (
          <div className="text-center animate-bounce">
            <span className={`text-xl font-black ${lastHit.isCrit ? 'text-yellow-400 text-2xl' : 'text-red-400'}`}>
              -{lastHit.damage}{lastHit.isCrit && ' CRIT!'}
            </span>
          </div>
        )}

        {/* My contribution */}
        {myDamage > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Shield className="w-3 h-3" />
            Your total damage: <span className="text-white font-bold">{myDamage}</span>
          </div>
        )}

        {/* Mini leaderboard */}
        {leaderboard.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-gray-600 uppercase tracking-widest">
              <Users className="w-3 h-3" /> Top Attackers
            </div>
            {leaderboard.map(([id, data], idx) => (
              <div key={id} className="flex items-center justify-between text-xs">
                <span className={`${id === userId ? 'text-cyan-400 font-bold' : 'text-gray-400'}`}>
                  #{idx + 1} {data.name}
                </span>
                <span className="text-red-400 font-mono">{data.total} dmg</span>
              </div>
            ))}
          </div>
        )}

        {/* Rewards preview */}
        <div className="flex items-center gap-3 text-[10px] text-gray-500 border-t border-white/5 pt-3">
          <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-400" /> {boss.completionRewards.xp} XP</span>
          <span className="flex items-center gap-1"><span className="text-cyan-400">~</span> {boss.completionRewards.flux} Flux</span>
          {boss.completionRewards.itemRarity && (
            <span className="text-purple-400">{boss.completionRewards.itemRarity} item</span>
          )}
        </div>

        {/* Attack button */}
        <button
          onClick={() => onAttack(boss.id)}
          disabled={!!attacking}
          className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            attacking === boss.id
              ? 'bg-red-500/20 text-red-400 animate-pulse'
              : 'bg-gradient-to-r from-red-600 to-orange-600 text-white hover:scale-[1.02] hover:shadow-lg hover:shadow-red-500/30'
          }`}
        >
          <Crosshair className="w-4 h-4" />
          {attacking === boss.id ? 'Attacking...' : 'Attack!'}
        </button>
        <p className="text-[10px] text-gray-600 text-center">Damage scales with your equipped gear stats</p>
      </div>
    </div>
  );
};

const BossEncounterPanel: React.FC<BossEncounterPanelProps> = ({ userId, userName, classType }) => {
  const [bosses, setBosses] = useState<BossEncounter[]>([]);
  const [attacking, setAttacking] = useState<string | null>(null);
  const [lastHit, setLastHit] = useState<{ bossId: string; damage: number; isCrit?: boolean } | null>(null);
  const toast = useToast();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToBossEncounters((b) => {
        const relevant = b.filter(boss =>
          !boss.classType || boss.classType === classType || boss.classType === 'GLOBAL'
        );
        setBosses(relevant);
      });
    } catch {
      // Firestore permission error — feature not available for this user
    }
    return () => unsub?.();
  }, [classType]);

  const handleAttack = async (bossId: string) => {
    if (attacking) return;
    setAttacking(bossId);
    try {
      // Damage is calculated server-side based on equipped gear stats
      const result = await dataService.dealBossDamage(bossId, userName, classType || '');
      sfx.bossHit();
      setLastHit({ bossId, damage: result.damageDealt, isCrit: result.isCrit });
      setTimeout(() => setLastHit(null), 2000);

      if (result.bossDefeated) {
        sfx.bossDefeated();
        toast.success('Boss defeated! Rewards incoming!');
      } else {
        const critMsg = result.isCrit ? ' CRITICAL HIT!' : '';
        toast.info(`Dealt ${result.damageDealt} damage!${critMsg} (+${result.xpEarned} XP)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Attack failed');
    }
    setAttacking(null);
  };

  if (bosses.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
        <Sword className="w-5 h-5" /> Active Threats
      </h3>

      {bosses.map(boss => (
        <BossCard
          key={boss.id}
          boss={boss}
          userId={userId}
          userName={userName}
          attacking={attacking}
          onAttack={handleAttack}
          lastHit={lastHit}
        />
      ))}
    </div>
  );
};

export default BossEncounterPanel;

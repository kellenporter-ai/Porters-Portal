
import React, { useState, useEffect } from 'react';
import { User, RPGItem, EquipmentSlot } from '../../types';
import { dataService } from '../../services/dataService';
import { getRankDetails, getGearScore, calculatePlayerStats, getAssetColors } from '../../lib/gamification';
import { getEvolutionTier, getActiveSetBonuses } from '../../lib/achievements';
import { getProfileData } from '../../lib/classProfile';
import OperativeAvatar from '../dashboard/OperativeAvatar';
import { X, Shield, Zap, Trophy, Star, Target } from 'lucide-react';

interface PlayerInspectModalProps {
  userId: string;
  classType: string;
  onClose: () => void;
}

const STAT_LABELS = [
  { key: 'tech', label: 'Tech', color: 'text-blue-400', icon: '💻' },
  { key: 'focus', label: 'Focus', color: 'text-green-400', icon: '🧘' },
  { key: 'analysis', label: 'Analysis', color: 'text-yellow-400', icon: '🔬' },
  { key: 'charisma', label: 'Charisma', color: 'text-purple-400', icon: '🎤' },
];

const SLOT_ORDER: EquipmentSlot[] = ['HEAD', 'CHEST', 'HANDS', 'BELT', 'FEET', 'AMULET', 'RING1', 'RING2'];

const PlayerInspectModal: React.FC<PlayerInspectModalProps> = ({ userId, classType, onClose }) => {
  const [player, setPlayer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const user = await dataService.getPublicProfile(userId);
      setPlayer(user);
      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
        <div className="text-gray-400">Player not found</div>
      </div>
    );
  }

  const gam = player.gamification || { xp: 0, level: 1, currency: 0, badges: [], privacyMode: false };
  const isPrivate = player.settings?.privacyMode;
  const displayName = isPrivate ? (gam.codename || 'Unknown Agent') : player.name;
  const level = gam.level || 1;
  const rankDetails = getRankDetails(level);
  const evolutionTier = getEvolutionTier(level);
  const { equipped, appearance } = getProfileData(player, classType);
  const stats = calculatePlayerStats(equipped);
  const gearScore = getGearScore(equipped);
  const classXP = gam.classXp?.[classType] || 0;

  const equippedItems = Object.values(equipped).filter(Boolean) as RPGItem[];
  const activeSets = getActiveSetBonuses(equippedItems);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#12131e]/95 border border-white/10 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-white/5">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-24 h-32 shrink-0">
              <OperativeAvatar equipped={equipped} appearance={appearance} />
            </div>

            <div>
              <h2 className={`text-xl font-black ${isPrivate ? 'text-purple-300 italic' : 'text-white'}`}>
                {displayName}
              </h2>
              <p className={`text-xs font-mono uppercase tracking-widest ${rankDetails.tierColor.split(' ')[1]}`}>
                {rankDetails.rankName}
              </p>
              <p className="text-[10px] text-gray-500 mt-1">{evolutionTier.name} - Level {level}</p>

              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  <span className="text-xs text-cyan-400 font-bold">{classXP.toLocaleString()} XP</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-yellow-400" />
                  <span className="text-xs text-yellow-400 font-bold">{gearScore} GS</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="p-6 border-b border-white/5">
          <h3 className="text-xs font-mono uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-1">
            <Target className="w-3 h-3" /> Stats
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {STAT_LABELS.map(({ key, label, color, icon }) => {
              const value = stats[key as keyof typeof stats] || 0;
              return (
                <div key={key} className="flex items-center gap-2 p-2 bg-white/3 rounded-lg">
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className={`text-sm font-bold ${color} ml-auto`}>{value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Equipment */}
        <div className="p-6 border-b border-white/5">
          <h3 className="text-xs font-mono uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-1">
            <Shield className="w-3 h-3" /> Equipment
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {SLOT_ORDER.map(slot => {
              const item = equipped[slot] as RPGItem | undefined;
              if (!item) {
                return (
                  <div key={slot} className="p-2 bg-white/3 rounded-lg border border-white/5">
                    <div className="text-[10px] text-gray-600 font-mono">{slot}</div>
                    <div className="text-xs text-gray-700 italic">Empty</div>
                  </div>
                );
              }
              const colors = getAssetColors(item.rarity);
              return (
                <div key={slot} className={`p-2 rounded-lg border ${colors.border} ${colors.bg}`}>
                  <div className="text-[10px] text-gray-500 font-mono">{slot}</div>
                  <div className={`text-xs font-bold truncate ${colors.text}`}>{item.name}</div>
                  <div className="text-[9px] text-gray-500">{item.rarity}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Set bonuses */}
        {activeSets.length > 0 && (
          <div className="p-6 border-b border-white/5">
            <h3 className="text-xs font-mono uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-1">
              <Star className="w-3 h-3 text-purple-400" /> Set Bonuses
            </h3>
            {activeSets.map(({ set, activeBonus }) => (
              <div key={set.id} className="p-2 bg-purple-500/5 border border-purple-500/20 rounded-lg mb-1">
                <div className="text-xs font-bold text-purple-400">{set.name}</div>
                <div className="text-[10px] text-gray-400">{activeBonus.label}: {activeBonus.effects.map(e => `+${e.value} ${e.stat}`).join(', ')}</div>
              </div>
            ))}
          </div>
        )}

        {/* Achievements preview */}
        {(gam.unlockedAchievements?.length || 0) > 0 && (
          <div className="p-6">
            <h3 className="text-xs font-mono uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-1">
              <Trophy className="w-3 h-3 text-yellow-400" /> Achievements ({gam.unlockedAchievements?.length})
            </h3>
            <div className="flex flex-wrap gap-1">
              {gam.unlockedAchievements?.slice(0, 12).map((id: string) => (
                <span key={id} className="text-[10px] bg-yellow-500/10 border border-yellow-500/20 rounded px-1.5 py-0.5 text-yellow-400">
                  {id.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerInspectModal;

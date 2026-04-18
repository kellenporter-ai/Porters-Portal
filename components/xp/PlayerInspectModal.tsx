
import React, { useState, useEffect, useRef } from 'react';
import { User, RPGItem, EquipmentSlot } from '../../types';
import { dataService } from '../../services/dataService';
import { getRankDetails, calculateGearScore, calculatePlayerStats, getAssetColors } from '../../lib/gamification';
import { getEvolutionTier, getActiveSetBonuses } from '../../lib/achievements';
import { getClassProfile } from '../../lib/classProfile';
import { useFocusTrap } from '../../lib/useFocusTrap';
import OperativeAvatar from '../dashboard/OperativeAvatar';
import Avatar3D from '../dashboard/Avatar3D';
import ProfileFrame from '../dashboard/ProfileFrame';
import ItemIcon from '../ItemIcon';
import { X, Shield, Zap, Trophy, Star, Target } from 'lucide-react';

interface PlayerInspectModalProps {
  userId: string;
  classType: string;
  onClose: () => void;
}

const STAT_LABELS = [
  { key: 'tech', label: 'Tech', color: 'text-blue-600 dark:text-blue-400', icon: '💻' },
  { key: 'focus', label: 'Focus', color: 'text-green-600 dark:text-green-400', icon: '🧘' },
  { key: 'analysis', label: 'Analysis', color: 'text-yellow-600 dark:text-yellow-400', icon: '🔬' },
  { key: 'charisma', label: 'Charisma', color: 'text-purple-600 dark:text-purple-400', icon: '🎤' },
];

const SLOT_ORDER: EquipmentSlot[] = ['HEAD', 'CHEST', 'HANDS', 'BELT', 'FEET', 'AMULET', 'RING1', 'RING2'];

const PlayerInspectModal: React.FC<PlayerInspectModalProps> = ({ userId, classType, onClose }) => {
  const [player, setPlayer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, !loading);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

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
      <div className="fixed inset-0 bg-[var(--backdrop)] backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="fixed inset-0 bg-[var(--backdrop)] backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
        <div className="text-[var(--text-tertiary)]">Player not found</div>
      </div>
    );
  }

  const gam = player.gamification || { xp: 0, level: 1, currency: 0, badges: [], privacyMode: false };
  const isPrivate = player.settings?.privacyMode;
  const displayName = isPrivate ? (gam.codename || 'Unknown Agent') : player.name;
  const level = gam.level || 1;
  const rankDetails = getRankDetails(level);
  const evolutionTier = getEvolutionTier(level);
  const { equipped, appearance } = getClassProfile(player, classType);
  const stats = calculatePlayerStats({ gamification: { ...gam, equipped } } as any);
  const gearScore = calculateGearScore(equipped);
  const classXP = gam.classXp?.[classType] || 0;

  const equippedItems = Object.values(equipped).filter(Boolean) as RPGItem[];
  const activeSets = getActiveSetBonuses(equippedItems);

  return (
    <div className="fixed inset-0 bg-[var(--backdrop)] backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Player inspection: ${displayName}`}>
      <div
        ref={dialogRef}
        className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-[var(--border)]">
          <button onClick={onClose} className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition" aria-label="Close player inspection">
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            {/* Avatar + Profile Frame */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="w-24 h-32">
                {gam.selectedCharacterModel ? (
                  <Avatar3D
                    characterModelId={gam.selectedCharacterModel}
                    appearance={appearance}
                    activeCosmetics={gam.activeCosmetics}
                    evolutionLevel={gam.level}
                    equipped={equipped}
                    compact
                  />
                ) : (
                  <OperativeAvatar equipped={equipped} appearance={appearance} activeCosmetics={gam.activeCosmetics} />
                )}
              </div>
              <ProfileFrame
                photoUrl={player?.avatarUrl}
                initials={displayName}
                frameId={gam.activeCosmetics?.frame}
                size={40}
              />
            </div>

            <div>
              <h2 className={`text-xl font-black ${isPrivate ? 'text-purple-300 italic' : 'text-[var(--text-primary)]'}`}>
                {displayName}
              </h2>
              <p className={`text-xs font-mono uppercase tracking-widest ${rankDetails.tierColor.split(' ').slice(1).join(' ')}`}>
                {rankDetails.rankName}
              </p>
              <p className="text-[11.5px] text-[var(--text-muted)] mt-1">{evolutionTier.name} - Level {level}</p>

              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-xs text-cyan-700 dark:text-cyan-400 font-bold">{classXP.toLocaleString()} XP</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-xs text-yellow-600 dark:text-yellow-400 font-bold">{gearScore} GS</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
            <Target className="w-3 h-3" /> Stats
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {STAT_LABELS.map(({ key, label, color, icon }) => {
              const value = stats[key as keyof typeof stats] || 0;
              return (
                <div key={key} className="flex items-center gap-2 p-2 bg-[var(--surface-glass)] rounded-lg">
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
                  <span className={`text-sm font-bold ${color} ml-auto`}>{value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Equipment */}
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
            <Shield className="w-3 h-3" /> Equipment
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {SLOT_ORDER.map(slot => {
              const item = equipped[slot] as RPGItem | undefined;
              if (!item) {
                return (
                  <div key={slot} className="p-2 bg-[var(--surface-glass)] rounded-lg border border-[var(--border)]">
                    <div className="text-[11.5px] text-[var(--text-muted)] font-mono">{slot}</div>
                    <div className="text-xs text-[var(--text-muted)] italic">Empty</div>
                  </div>
                );
              }
              const colors = getAssetColors(item.rarity);
              return (
                <div key={slot} className={`p-2 rounded-lg border ${colors.border} ${colors.bg} flex items-center gap-2`}>
                  <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-6 h-6" />
                  <div className="min-w-0">
                    <div className={`text-xs font-bold truncate ${colors.text}`}>{item.name}</div>
                    <div className="text-[11.5px] text-[var(--text-muted)]">{item.rarity}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Set bonuses */}
        {activeSets.length > 0 && (
          <div className="p-6 border-b border-[var(--border)]">
            <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
              <Star className="w-3 h-3 text-purple-600 dark:text-purple-400" /> Set Bonuses
            </h3>
            {activeSets.map(({ set, activeBonus }) => (
              <div key={set.id} className="p-2 bg-purple-500/5 border border-purple-500/20 rounded-lg mb-1">
                <div className="text-xs font-bold text-purple-600 dark:text-purple-400">{set.name}</div>
                <div className="text-[11.5px] text-gray-600 dark:text-gray-400">{activeBonus.label}: {activeBonus.effects.map(e => `+${e.value} ${e.stat}`).join(', ')}</div>
              </div>
            ))}
          </div>
        )}

        {/* Achievements preview */}
        {(gam.unlockedAchievements?.length || 0) > 0 && (
          <div className="p-6">
            <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
              <Trophy className="w-3 h-3 text-yellow-600 dark:text-yellow-400" /> Achievements ({gam.unlockedAchievements?.length})
            </h3>
            <div className="flex flex-wrap gap-1">
              {gam.unlockedAchievements?.slice(0, 12).map((id: string) => (
                <span key={id} className="text-[11.5px] bg-yellow-500/10 border border-yellow-500/20 rounded px-1.5 py-0.5 text-yellow-600 dark:text-yellow-400">
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

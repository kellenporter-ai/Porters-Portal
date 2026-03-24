
import React, { useMemo, useRef, useEffect } from 'react';
import { User, RPGItem, EquipmentSlot } from '../types';
import { getRankDetails, calculateGearScore, calculatePlayerStats, getAssetColors } from '../lib/gamification';
import { getEvolutionTier, getActiveSetBonuses, ACHIEVEMENTS } from '../lib/achievements';
import ItemIcon from './ItemIcon';
import { getClassProfile } from '../lib/classProfile';
import OperativeAvatar from './dashboard/OperativeAvatar';
import Avatar3D from './dashboard/Avatar3D';
import ProfileFrame from './dashboard/ProfileFrame';
import { Shield, Zap, Trophy, Star, Target, Flame, Swords, GraduationCap, Copy, Check } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';

interface ProfileShowcaseProps {
  user: User;
  classType: string;
  onClose: () => void;
}

const STAT_INFO = [
  { key: 'tech', label: 'Tech', color: 'text-blue-400', bg: 'bg-blue-500' },
  { key: 'focus', label: 'Focus', color: 'text-green-400', bg: 'bg-green-500' },
  { key: 'analysis', label: 'Analysis', color: 'text-yellow-400', bg: 'bg-yellow-500' },
  { key: 'charisma', label: 'Charisma', color: 'text-purple-400', bg: 'bg-purple-500' },
];

const SLOT_ORDER: EquipmentSlot[] = ['HEAD', 'CHEST', 'HANDS', 'BELT', 'FEET', 'AMULET', 'RING1', 'RING2'];

const ProfileShowcase: React.FC<ProfileShowcaseProps> = ({ user, classType, onClose }) => {
  const [copied, setCopied] = React.useState(false);
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const gam = user.gamification || { xp: 0, level: 1, currency: 0, badges: [], privacyMode: false };
  const level = gam.level || 1;
  const rankDetails = getRankDetails(level);
  const evolutionTier = getEvolutionTier(level);
  const { equipped, appearance } = getClassProfile(user, classType);
  const stats = calculatePlayerStats({ gamification: { ...gam, equipped } } as any);
  const gearScore = calculateGearScore(equipped);
  const classXP = gam.classXp?.[classType] || 0;
  const isPrivate = user.settings?.privacyMode;
  const displayName = isPrivate ? (gam.codename || 'Unknown Agent') : user.name;

  const equippedItems = Object.values(equipped).filter(Boolean) as RPGItem[];
  const activeSets = getActiveSetBonuses(equippedItems);

  const unlockedAchievements = gam.unlockedAchievements || [];
  const achievementDetails = useMemo(() =>
    ACHIEVEMENTS.filter(a => unlockedAchievements.includes(a.id)),
    [unlockedAchievements]
  );

  const maxStat = Math.max(stats.tech, stats.focus, stats.analysis, stats.charisma, 1);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/profile/${user.id}`);
    setCopied(true);
    timersRef.current.push(setTimeout(() => setCopied(false), 2000));
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`border border-[var(--border)] rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl ${isLight ? 'bg-gradient-to-br from-white to-[#f0eafa]' : 'bg-gradient-to-br from-[#0d0e1a] to-[#1a1b2e]'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Hero section */}
        <div className="relative p-8 border-b border-[var(--border)] overflow-hidden">
          {/* Background glow */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: `radial-gradient(circle at 30% 50%, hsl(${appearance?.hue || 0 + 180}, 70%, 30%), transparent 70%)`
            }}
          />

          <div className="relative flex items-center gap-6">
            {/* Avatar + Profile Frame */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="w-32 h-44">
                {gam.selectedCharacterModel ? (
                  <Avatar3D
                    characterModelId={gam.selectedCharacterModel}
                    appearance={appearance}
                    activeCosmetics={gam.activeCosmetics}
                    evolutionLevel={gam.level}
                  />
                ) : (
                  <OperativeAvatar equipped={equipped} appearance={appearance} activeCosmetics={gam.activeCosmetics} />
                )}
              </div>
              {/* Profile picture with frame cosmetic */}
              <ProfileFrame
                photoUrl={user.avatarUrl}
                initials={displayName}
                frameId={gam.activeCosmetics?.frame}
                size={48}
              />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className={`text-2xl font-black ${isPrivate ? 'text-purple-300 italic' : 'text-[var(--text-primary)]'}`}>
                  {displayName}
                </h1>
                <button
                  onClick={handleCopyLink}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition rounded"
                  title="Copy profile link"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className={`text-sm font-mono uppercase tracking-widest ${rankDetails.tierColor.split(' ').slice(1).join(' ')}`}>
                {rankDetails.rankName}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{evolutionTier.name} — Level {level}</p>

              {/* Quick stats */}
              <div className="flex items-center gap-4 mt-4">
                <div className="text-center">
                  <div className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                    {classXP.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-[var(--text-muted)] font-mono">CLASS XP</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black text-yellow-400">{gearScore}</div>
                  <div className="text-[9px] text-[var(--text-muted)] font-mono">GEAR SCORE</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black text-orange-400">{gam.engagementStreak || 0}w</div>
                  <div className="text-[9px] text-[var(--text-muted)] font-mono">STREAK</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black text-purple-400">{unlockedAchievements.length}</div>
                  <div className="text-[9px] text-[var(--text-muted)] font-mono">BADGES</div>
                </div>
              </div>

              {/* Specialization badge */}
              {gam.specialization && (
                <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg">
                  <span className="text-xs text-[var(--text-secondary)] font-bold">{gam.specialization}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-0 divide-x divide-[var(--border)]">
          {/* Left column: Stats + Equipment */}
          <div className="p-6 space-y-6">
            {/* Stat bars */}
            <div>
              <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
                <Target className="w-3 h-3" /> Combat Stats
              </h3>
              <div className="space-y-2">
                {STAT_INFO.map(({ key, label, color, bg }) => {
                  const value = stats[key as keyof typeof stats] || 0;
                  const pct = (value / maxStat) * 100;
                  return (
                    <div key={key} className="space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
                        <span className={`text-xs font-bold ${color}`}>{value}</span>
                      </div>
                      <div className="w-full bg-[var(--surface-glass)] rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${bg} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Equipment */}
            <div>
              <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Equipment
              </h3>
              <div className="space-y-1.5">
                {SLOT_ORDER.map(slot => {
                  const item = equipped[slot] as RPGItem | undefined;
                  if (!item) return (
                    <div key={slot} className="flex items-center gap-2 p-1.5 bg-white/2 rounded text-xs text-[var(--text-muted)]">
                      <span className="font-mono w-12 text-[10px]">{slot}</span>
                      <span className="italic">Empty</span>
                    </div>
                  );
                  const c = getAssetColors(item.rarity);
                  return (
                    <div key={slot} className={`flex items-center gap-2 p-1.5 rounded border ${c.border} ${c.bg}`}>
                      <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-5 h-5" />
                      <span className={`text-xs font-bold truncate ${c.text}`}>{item.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Set bonuses */}
            {activeSets.length > 0 && (
              <div>
                <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-2 flex items-center gap-1">
                  <Star className="w-3 h-3 text-purple-400" /> Active Sets
                </h3>
                {activeSets.map(({ set, activeBonus }) => (
                  <div key={set.id} className="p-2 bg-purple-500/5 border border-purple-500/20 rounded-lg mb-1 text-xs">
                    <span className="text-purple-400 font-bold">{set.name}</span>
                    <span className="text-[var(--text-muted)] ml-1">— {activeBonus.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column: Achievements + Activity */}
          <div className="p-6 space-y-6">
            {/* Achievement showcase */}
            <div>
              <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
                <Trophy className="w-3 h-3 text-yellow-400" /> Achievements ({unlockedAchievements.length})
              </h3>
              {achievementDetails.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {achievementDetails.slice(0, 12).map(a => (
                    <div key={a.id} className="text-center p-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
                      <div className="text-xl">{a.icon}</div>
                      <div className="text-[9px] text-yellow-400 font-bold truncate mt-0.5">{a.title}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">No achievements yet</p>
              )}
            </div>

            {/* Activity summary */}
            <div>
              <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3">Activity</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-[var(--text-tertiary)]">Engagement Streak:</span>
                  <span className="text-orange-400 font-bold">{gam.engagementStreak || 0} weeks</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Swords className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[var(--text-tertiary)]">Quests Completed:</span>
                  <span className="text-red-400 font-bold">{gam.completedQuests?.length || 0}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <GraduationCap className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-[var(--text-tertiary)]">Tutoring Sessions:</span>
                  <span className="text-green-400 font-bold">{gam.tutoringSessionsCompleted || 0}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[var(--text-tertiary)]">Total XP:</span>
                  <span className="text-cyan-700 dark:text-cyan-400 font-bold">{(gam.xp || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileShowcase;

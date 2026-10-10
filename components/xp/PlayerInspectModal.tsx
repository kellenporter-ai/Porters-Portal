import React, { Suspense, useState, useEffect, useRef } from 'react';
import { User, UserRole, RPGItem, EquipmentSlot } from '../../types';
import { dataService } from '../../services/dataService';
import { reportError } from '../../lib/errorReporting';
import { getRankDetails, calculateGearScore, calculatePlayerStats, getAssetColors } from '../../lib/gamification';
import { getEvolutionTier, getActiveSetBonuses } from '../../lib/achievements';
import { getClassProfile } from '../../lib/classProfile';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { useT } from '../../lib/i18n';
import OperativeAvatar from '../dashboard/OperativeAvatar';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
const Avatar3D = lazyWithRetry(() => import('../dashboard/Avatar3D'));
import ProfileFrame from '../dashboard/ProfileFrame';
import ItemIcon from '../ItemIcon';
import { X, Shield, Zap, Trophy, Star, Target, AlertCircle } from 'lucide-react';

interface PlayerInspectModalProps {
  userId: string;
  classType: string;
  viewerRole: UserRole;
  onClose: () => void;
}

/** Give up on a profile fetch that takes longer than this (never an infinite spinner). */
const INSPECT_FETCH_TIMEOUT_MS = 12000;

const STAT_LABELS = [
  { key: 'tech', label: 'Tech', color: 'text-blue-600 dark:text-blue-400', icon: '💻' },
  { key: 'focus', label: 'Focus', color: 'text-green-600 dark:text-green-400', icon: '🧘' },
  { key: 'analysis', label: 'Analysis', color: 'text-yellow-600 dark:text-yellow-400', icon: '🔬' },
  { key: 'charisma', label: 'Charisma', color: 'text-purple-600 dark:text-purple-400', icon: '🎤' },
];

// Display slots must use normalizeEquipped's canonical keys (RING/WEAPON are
// collapsed from RING1/RING2 and WEAPON1/WEAPON2 — see lib/classProfile.ts).
const SLOT_ORDER = ['HEAD', 'CHEST', 'HANDS', 'BELT', 'FEET', 'AMULET', 'RING', 'WEAPON'] as const;

const PlayerInspectModal: React.FC<PlayerInspectModalProps> = ({ userId, classType, viewerRole, onClose }) => {
  const t = useT();
  const [player, setPlayer] = useState<User | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error' | 'timeout' | 'not-found'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, loadState !== 'loading');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Students can only read peers via /public_profiles (firestore.rules denies
  // users/{uid} reads for non-owners); admins read the full profile.
  const canReadFullProfile = viewerRole === UserRole.ADMIN;

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      setLoadState('loading');
      try {
        const user = await Promise.race([
          dataService.getPublicProfile(userId, canReadFullProfile),
          new Promise<null>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('timeout')), INSPECT_FETCH_TIMEOUT_MS);
          }),
        ]);
        if (cancelled) return;
        if (!user) {
          setLoadState('not-found');
        } else {
          setPlayer(user);
          setLoadState('loaded');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.message === 'timeout') {
          setLoadState('timeout');
        } else {
          reportError(err, { method: 'PlayerInspectModal.load' });
          setLoadState('error');
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [userId, canReadFullProfile, retryKey]);

  const loading = loadState === 'loading';

  if (loading) {
    return (
      <div
        className="fixed inset-0 bg-[var(--backdrop)] backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={t('inspect.loading')}
      >
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <p className="text-sm text-[var(--text-muted)]">{t('inspect.loading')}</p>
      </div>
    );
  }

  if (loadState !== 'loaded') {
    const bodyKey = loadState === 'not-found' ? 'inspect.notFoundBody' : loadState === 'timeout' ? 'inspect.timeoutBody' : 'inspect.errorBody';
    const titleKey = loadState === 'not-found' ? 'inspect.notFoundTitle' : 'inspect.errorTitle';
    return (
      <div
        className="fixed inset-0 bg-[var(--backdrop)] backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
        role="alertdialog"
        aria-modal="true"
        aria-label={t(titleKey)}
      >
        <div
          ref={dialogRef}
          className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl w-full max-w-sm p-6 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[var(--text-primary)]">{t(titleKey)}</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">{t(bodyKey)}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--surface-glass)] text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {t('inspect.close')}
            </button>
            {loadState !== 'not-found' && (
              <button
                type="button"
                onClick={() => setRetryKey(k => k + 1)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-purple-600 text-white hover:bg-purple-500 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {t('inspect.retry')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!player) return null;

  const gam = player.gamification || { xp: 0, level: 1, currency: 0, badges: [], privacyMode: false };
  // Mirror path stores privacy top-level on public_profiles; full profile uses settings.privacyMode
  const isPrivate = player.settings?.privacyMode ?? ((player as any).privacyMode === true || (gam as any).privacyMode === true);
  const displayName = isPrivate ? (gam.codename || t('leaderboard.unknownAgent')) : player.name;
  const level = gam.level || 1;
  const rankDetails = getRankDetails(level);
  const evolutionTier = getEvolutionTier(level);
  const { equipped, appearance } = getClassProfile(player, classType);
  const stats = calculatePlayerStats({ gamification: { ...gam, equipped } } as any);
  const gearScore = calculateGearScore(equipped);
  const totalXP = gam.xp || 0;

  const equippedItems = Object.values(equipped).filter(Boolean) as RPGItem[];
  const activeSets = getActiveSetBonuses(equippedItems);

  return (
    <div className="fixed inset-0 bg-[var(--backdrop)] backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${t('leaderboard.inspect')}: ${displayName}`}>
      <div
        ref={dialogRef}
        className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-[var(--border)]">
          <button onClick={onClose} className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition" aria-label={t('inspect.close')}>
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            {/* Avatar + Profile Frame */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="w-24 h-32" aria-hidden="true">
                {gam.selectedCharacterModel ? (
                  <Suspense fallback={null}>
                    <Avatar3D
                      characterModelId={gam.selectedCharacterModel}
                      appearance={appearance}
                      activeCosmetics={gam.activeCosmetics}
                      evolutionLevel={gam.level}
                      equipped={equipped}
                      compact
                    />
                  </Suspense>
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
                  <Zap className="w-3 h-3 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
                  <span className="text-xs text-cyan-700 dark:text-cyan-400 font-bold">{totalXP.toLocaleString()} XP</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
                  <span className="text-xs text-yellow-600 dark:text-yellow-400 font-bold">{gearScore} GS</span>
                </div>
              </div>

              {!canReadFullProfile && (
                <p className="mt-2 inline-block text-[11.5px] px-2 py-0.5 rounded bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-muted)]">
                  {t('inspect.viewOnly')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        {canReadFullProfile && (
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
            <Target className="w-3 h-3" aria-hidden="true" /> Stats
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {STAT_LABELS.map(({ key, label, color, icon }) => {
              const value = stats[key as keyof typeof stats] || 0;
              return (
                <div key={key} className="flex items-center gap-2 p-2 bg-[var(--surface-glass)] rounded-lg">
                  <span className="text-sm" aria-hidden="true">{icon}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
                  <span className={`text-sm font-bold ${color} ml-auto`}>{value}</span>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Equipment */}
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
            <Shield className="w-3 h-3" aria-hidden="true" /> Equipment
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {SLOT_ORDER.map(slot => {
              const item = equipped[slot as EquipmentSlot] as RPGItem | undefined;
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
              <Star className="w-3 h-3 text-purple-600 dark:text-purple-400" aria-hidden="true" /> Set Bonuses
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
        {canReadFullProfile && (gam.unlockedAchievements?.length || 0) > 0 && (
          <div className="p-6">
            <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-1">
              <Trophy className="w-3 h-3 text-yellow-600 dark:text-yellow-400" aria-hidden="true" /> Achievements ({gam.unlockedAchievements?.length})
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

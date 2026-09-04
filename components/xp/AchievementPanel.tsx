
import React, { useMemo } from 'react';
import { ACHIEVEMENTS, getVisibleAchievements } from '../../lib/achievements';
import { AchievementCategory } from '../../types';
import { Lock, Trophy } from 'lucide-react';
import { MEDALS } from '../../lib/kenneyAssets';
import { useT, useInterpolate } from '../../lib/i18n';

/** Map achievement category to a medal number (1-9) for visual variety */
const CATEGORY_MEDAL: Record<AchievementCategory, number> = {
  PROGRESSION: 1,
  COMBAT: 2,
  SOCIAL: 3,
  COLLECTION: 4,
  DEDICATION: 5,
  MASTERY: 6,
};

interface AchievementPanelProps {
  unlockedAchievements: string[];
  achievementProgress: { [id: string]: number };
}

const CATEGORY_LABELS: Record<AchievementCategory, { labelKey: string; icon: string }> = {
  PROGRESSION: { labelKey: 'badges.catProgression', icon: '📈' },
  COMBAT: { labelKey: 'badges.catCombat', icon: '⚔️' },
  SOCIAL: { labelKey: 'badges.catSocial', icon: '👥' },
  COLLECTION: { labelKey: 'badges.catCollection', icon: '📦' },
  DEDICATION: { labelKey: 'badges.catDedication', icon: '🔥' },
  MASTERY: { labelKey: 'badges.catMastery', icon: '🏆' },
};

const AchievementPanel: React.FC<AchievementPanelProps> = ({ unlockedAchievements, achievementProgress }) => {
  const t = useT();
  const interpolate = useInterpolate();
  const visible = useMemo(() => getVisibleAchievements(unlockedAchievements), [unlockedAchievements]);
  const categories = ['PROGRESSION', 'COMBAT', 'DEDICATION', 'COLLECTION', 'MASTERY', 'SOCIAL'] as AchievementCategory[];
  const totalUnlocked = unlockedAchievements.length;
  const totalAchievements = ACHIEVEMENTS.filter(a => !a.isSecret).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-400" /> {t('badges.title')}
        </h3>
        <span className="text-sm text-[var(--text-tertiary)]">
          {interpolate('badges.unlockedCount', { unlocked: totalUnlocked, total: totalAchievements })}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[var(--surface-glass)] rounded-full h-2">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-500 transition-all duration-500"
          style={{ width: `${(totalUnlocked / totalAchievements) * 100}%` }}
        />
      </div>

      {categories.map(category => {
        const catAchievements = visible.filter(a => a.category === category);
        if (catAchievements.length === 0) return null;
        const catInfo = CATEGORY_LABELS[category];

        return (
          <div key={category}>
            <h4 className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
              <span>{catInfo.icon}</span> {t(catInfo.labelKey)}
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {catAchievements.map(achievement => {
                const isUnlocked = unlockedAchievements.includes(achievement.id);
                const progress = achievementProgress[achievement.id] || 0;
                const progressPct = Math.min(100, (progress / achievement.condition.target) * 100);

                return (
                  <div
                    key={achievement.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      isUnlocked
                        ? 'border-yellow-500/30 bg-yellow-500/5'
                        : 'border-[var(--border)] bg-[var(--surface-glass)]'
                    }`}
                  >
                    {isUnlocked ? (
                      <img
                        src={MEDALS.get('shaded', CATEGORY_MEDAL[achievement.category] || 1)}
                        alt=""
                        className="w-8 h-8 object-contain drop-shadow-lg"
                      />
                    ) : (
                      <span className="text-2xl grayscale opacity-40">
                        {achievement.icon}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isUnlocked ? 'text-yellow-600 dark:text-yellow-400' : 'text-[var(--text-tertiary)]'}`}>
                          {achievement.title}
                        </span>
                        {achievement.isSecret && !isUnlocked && <Lock className="w-3 h-3 text-gray-600" />}
                      </div>
                      <p className="text-[11.5px] text-[var(--text-muted)]">{achievement.description}</p>
                      {!isUnlocked && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 bg-[var(--surface-glass)] rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-[11.5px] text-[var(--text-muted)] font-mono">
                            {interpolate('badges.progress', { current: progress, target: achievement.condition.target })}
                          </span>
                        </div>
                      )}
                    </div>
                    {isUnlocked && (
                      <div className="text-right shrink-0">
                        <div className="text-[11.5px] text-yellow-500 font-bold">{interpolate('badges.xpReward', { xp: achievement.xpReward })}</div>
                        {achievement.fluxReward && (
                          <div className="text-[11.5px] text-cyan-700 dark:text-cyan-400 font-bold">{interpolate('badges.fluxReward', { flux: achievement.fluxReward })}</div>
                        )}
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
  );
};

export default AchievementPanel;

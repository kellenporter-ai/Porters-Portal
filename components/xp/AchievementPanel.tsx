
import React, { useMemo } from 'react';
import { ACHIEVEMENTS, getVisibleAchievements } from '../../lib/achievements';
import { AchievementCategory } from '../../types';
import { Lock, Trophy } from 'lucide-react';
import { MEDALS } from '../../lib/kenneyAssets';

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

const CATEGORY_LABELS: Record<AchievementCategory, { label: string; icon: string }> = {
  PROGRESSION: { label: 'Progression', icon: '📈' },
  COMBAT: { label: 'Missions', icon: '⚔️' },
  SOCIAL: { label: 'Social', icon: '👥' },
  COLLECTION: { label: 'Collection', icon: '📦' },
  DEDICATION: { label: 'Dedication', icon: '🔥' },
  MASTERY: { label: 'Mastery', icon: '🏆' },
};

const AchievementPanel: React.FC<AchievementPanelProps> = ({ unlockedAchievements, achievementProgress }) => {
  const visible = useMemo(() => getVisibleAchievements(unlockedAchievements), [unlockedAchievements]);
  const categories = ['PROGRESSION', 'COMBAT', 'DEDICATION', 'COLLECTION', 'MASTERY', 'SOCIAL'] as AchievementCategory[];
  const totalUnlocked = unlockedAchievements.length;
  const totalAchievements = ACHIEVEMENTS.filter(a => !a.isSecret).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" /> Achievements
        </h3>
        <span className="text-sm text-[var(--text-tertiary)]">
          {totalUnlocked}/{totalAchievements} unlocked
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
              <span>{catInfo.icon}</span> {catInfo.label}
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
                        <span className={`text-sm font-bold ${isUnlocked ? 'text-yellow-400' : 'text-[var(--text-tertiary)]'}`}>
                          {achievement.title}
                        </span>
                        {achievement.isSecret && !isUnlocked && <Lock className="w-3 h-3 text-gray-600" />}
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">{achievement.description}</p>
                      {!isUnlocked && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 bg-[var(--surface-glass)] rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-[var(--text-muted)] font-mono">
                            {progress}/{achievement.condition.target}
                          </span>
                        </div>
                      )}
                    </div>
                    {isUnlocked && (
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-yellow-500 font-bold">+{achievement.xpReward} XP</div>
                        {achievement.fluxReward && (
                          <div className="text-[9px] text-cyan-400 font-bold">+{achievement.fluxReward} Flux</div>
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

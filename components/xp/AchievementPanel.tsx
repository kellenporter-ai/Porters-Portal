
import React, { useMemo } from 'react';
import { ACHIEVEMENTS, getVisibleAchievements } from '../../lib/achievements';
import { AchievementCategory } from '../../types';
import { Lock, Trophy } from 'lucide-react';

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
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" /> Achievements
        </h3>
        <span className="text-sm text-gray-400">
          {totalUnlocked}/{totalAchievements} unlocked
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/5 rounded-full h-2">
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
            <h4 className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
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
                        : 'border-white/5 bg-white/3'
                    }`}
                  >
                    <span className={`text-2xl ${isUnlocked ? '' : 'grayscale opacity-40'}`}>
                      {achievement.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isUnlocked ? 'text-yellow-400' : 'text-gray-400'}`}>
                          {achievement.title}
                        </span>
                        {achievement.isSecret && !isUnlocked && <Lock className="w-3 h-3 text-gray-600" />}
                      </div>
                      <p className="text-[10px] text-gray-500">{achievement.description}</p>
                      {!isUnlocked && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 bg-white/5 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-gray-600 font-mono">
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

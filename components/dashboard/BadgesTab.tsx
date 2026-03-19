import React, { useMemo } from 'react';
import { User } from '../../types';
import { calculateGearScore } from '../../lib/gamification';
import { getClassProfile } from '../../lib/classProfile';
import AchievementPanel from '../xp/AchievementPanel';

interface BadgesTabProps {
  user: User;
  activeClass: string;
}

const BadgesTab: React.FC<BadgesTabProps> = ({ user, activeClass }) => {
  const classProfile = useMemo(() => getClassProfile(user, activeClass), [user, activeClass]);
  const equipped = classProfile.equipped;

  const playerStats = useMemo(() => {
    const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
    const items = Object.values(equipped).filter(Boolean) as { stats: Record<string, number> }[];
    items.forEach(item => {
      if (item.stats) Object.entries(item.stats).forEach(([key, val]) => { base[key as keyof typeof base] += val; });
    });
    return base;
  }, [equipped]);

  const gearScore = useMemo(() => calculateGearScore(equipped), [equipped]);

  const computedProgress = useMemo(() => {
    const gam = user.gamification || {} as any;
    const serverProgress: Record<string, number> = gam.achievementProgress || {};
    const progress: Record<string, number> = { ...serverProgress };
    const totalXp = gam.xp || 0;
    const level = gam.level || 1;
    const inventory = gam.inventory || [];
    const completedQuests = gam.completedQuests || [];
    const streak = gam.engagementStreak || 0;
    const loginStreak = gam.loginStreak || 0;
    const tutoringDone = gam.tutoringSessionsCompleted || 0;
    const bossKills = gam.bossesDefeated || 0;
    const challengesDone = gam.challengesCompleted || 0;
    const craftCount = gam.itemsCrafted || 0;
    const wheelSpins = gam.wheelSpins || 0;

    const setProgress = (id: string, val: number) => {
      if (!progress[id] || val > progress[id]) progress[id] = val;
    };

    // PROGRESSION — XP milestones
    setProgress('first_steps', totalXp);
    setProgress('xp_5k', totalXp);
    setProgress('xp_25k', totalXp);
    setProgress('xp_100k', totalXp);       // Centurion
    setProgress('xp_500k', totalXp);       // Transcendent Mind (secret)
    setProgress('xp_1m', totalXp);         // Ascended Scholar (secret)
    // PROGRESSION — Level milestones
    setProgress('rising_star', level);
    setProgress('veteran', level);
    setProgress('elite', level);
    setProgress('legend', level);
    setProgress('vanguard', level);         // Vanguard
    setProgress('mythic_rank', level);      // secret
    setProgress('paragon', level);          // secret
    setProgress('eternal', level);          // secret
    // COLLECTION
    setProgress('collector_10', inventory.length);
    setProgress('collector_50', inventory.length);
    setProgress('collector_150', inventory.length); // secret
    setProgress('gear_score_100', gearScore);
    setProgress('gear_score_500', gearScore);
    setProgress('gear_score_1000', gearScore);      // secret
    // COMBAT — Quests
    setProgress('first_mission', completedQuests.length);
    setProgress('mission_5', completedQuests.length);
    setProgress('mission_20', completedQuests.length);
    setProgress('mission_50', completedQuests.length); // secret
    // COMBAT — Boss kills
    setProgress('boss_slayer', bossKills);
    setProgress('boss_hunter', bossKills);  // secret
    // DEDICATION — Streaks
    setProgress('streak_3', streak);
    setProgress('streak_8', streak);
    setProgress('streak_16', streak);
    setProgress('streak_30', streak);       // secret
    setProgress('login_7', loginStreak);
    setProgress('login_30', loginStreak);
    setProgress('login_90', loginStreak);   // secret
    setProgress('challenges_10', challengesDone);
    setProgress('challenges_50', challengesDone);
    setProgress('challenges_200', challengesDone); // secret
    // SOCIAL
    setProgress('tutor_1', tutoringDone);
    setProgress('tutor_10', tutoringDone);
    setProgress('tutor_25', tutoringDone);  // secret
    // MASTERY — Stats
    setProgress('tech_50', playerStats.tech);
    setProgress('focus_50', playerStats.focus);
    setProgress('analysis_50', playerStats.analysis);
    setProgress('charisma_50', playerStats.charisma);
    setProgress('tech_100', playerStats.tech);    // secret
    setProgress('focus_100', playerStats.focus);  // secret
    setProgress('analysis_100', playerStats.analysis); // secret
    setProgress('charisma_100', playerStats.charisma); // secret
    // MASTERY — Crafting & Wheel
    setProgress('craft_10', craftCount);
    setProgress('craft_50', craftCount);    // secret
    setProgress('wheel_25', wheelSpins);    // Fortune Seeker

    return progress;
  }, [user, gearScore, playerStats]);

  return (
    <div key="achievements" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      <AchievementPanel
        unlockedAchievements={user.gamification?.unlockedAchievements || []}
        achievementProgress={computedProgress}
      />
    </div>
  );
};

export default BadgesTab;

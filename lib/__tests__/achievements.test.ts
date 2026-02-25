import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  getAchievementsByCategory,
  getVisibleAchievements,
  SKILL_NODES,
  SKILL_TREES,
  getSkillTree,
  canUnlockSkill,
  ITEM_SETS,
  getActiveSetBonuses,
  FORTUNE_WHEEL_PRIZES,
  spinWheel,
  generateDailyChallenges,
  DAILY_LOGIN_REWARDS,
  getLoginReward,
  getStreakMultiplier,
  EVOLUTION_TIERS,
  getEvolutionTier,
} from '../achievements';

// ─── Achievement Definitions ───
describe('ACHIEVEMENTS', () => {
  it('contains 50 achievements', () => {
    expect(ACHIEVEMENTS.length).toBe(50);
  });

  it('has unique IDs', () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every achievement has required fields', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(a.category).toBeTruthy();
      expect(a.condition).toBeDefined();
      expect(a.condition.type).toBeTruthy();
      expect(a.condition.target).toBeGreaterThan(0);
      expect(a.xpReward).toBeGreaterThan(0);
    }
  });

  it('progression achievements are ordered by increasing target', () => {
    const levelAchievements = ACHIEVEMENTS
      .filter(a => a.condition.type === 'LEVEL_REACHED')
      .map(a => a.condition.target);
    for (let i = 1; i < levelAchievements.length; i++) {
      expect(levelAchievements[i]).toBeGreaterThan(levelAchievements[i - 1]);
    }
  });
});

// ─── Category Filtering ───
describe('getAchievementsByCategory', () => {
  it('returns only PROGRESSION achievements', () => {
    const progression = getAchievementsByCategory('PROGRESSION');
    expect(progression.length).toBeGreaterThan(0);
    expect(progression.every(a => a.category === 'PROGRESSION')).toBe(true);
  });

  it('returns only COMBAT achievements', () => {
    const combat = getAchievementsByCategory('COMBAT');
    expect(combat.length).toBeGreaterThan(0);
    expect(combat.every(a => a.category === 'COMBAT')).toBe(true);
  });

  it('all categories have at least one achievement', () => {
    const categories = ['PROGRESSION', 'COMBAT', 'SOCIAL', 'COLLECTION', 'DEDICATION', 'MASTERY'] as const;
    for (const cat of categories) {
      expect(getAchievementsByCategory(cat).length).toBeGreaterThan(0);
    }
  });
});

// ─── Visibility ───
describe('getVisibleAchievements', () => {
  it('hides secret achievements when not unlocked', () => {
    const visible = getVisibleAchievements([]);
    const secretIds = ACHIEVEMENTS.filter(a => a.isSecret).map(a => a.id);
    for (const id of secretIds) {
      expect(visible.find(a => a.id === id)).toBeUndefined();
    }
  });

  it('shows secret achievements when unlocked', () => {
    const secretIds = ACHIEVEMENTS.filter(a => a.isSecret).map(a => a.id);
    const visible = getVisibleAchievements(secretIds);
    for (const id of secretIds) {
      expect(visible.find(a => a.id === id)).toBeDefined();
    }
  });

  it('always shows non-secret achievements', () => {
    const visible = getVisibleAchievements([]);
    const nonSecretCount = ACHIEVEMENTS.filter(a => !a.isSecret).length;
    expect(visible.length).toBe(nonSecretCount);
  });
});

// ─── Skill Trees ───
describe('Skill Trees', () => {
  it('defines all four specializations', () => {
    const specs = Object.keys(SKILL_TREES);
    expect(specs).toContain('THEORIST');
    expect(specs).toContain('EXPERIMENTALIST');
    expect(specs).toContain('ANALYST');
    expect(specs).toContain('DIPLOMAT');
  });

  it('each tree has 6 nodes', () => {
    for (const spec of ['THEORIST', 'EXPERIMENTALIST', 'ANALYST', 'DIPLOMAT'] as const) {
      expect(getSkillTree(spec).length).toBe(6);
    }
  });

  it('all skill nodes have unique IDs', () => {
    const ids = SKILL_NODES.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tier 1 nodes have no prerequisites', () => {
    const tier1 = SKILL_NODES.filter(n => n.tier === 1);
    for (const node of tier1) {
      expect(node.prerequisites).toEqual([]);
    }
  });

  it('tier 4 nodes have prerequisites that exist', () => {
    const tier4 = SKILL_NODES.filter(n => n.tier === 4);
    const allIds = new Set(SKILL_NODES.map(n => n.id));
    for (const node of tier4) {
      for (const prereq of node.prerequisites) {
        expect(allIds.has(prereq)).toBe(true);
      }
    }
  });
});

// ─── canUnlockSkill ───
describe('canUnlockSkill', () => {
  it('allows tier 1 skills with empty unlock list', () => {
    expect(canUnlockSkill('th_1', [])).toBe(true);
    expect(canUnlockSkill('ex_1', [])).toBe(true);
  });

  it('blocks tier 2 skills without prerequisites', () => {
    expect(canUnlockSkill('th_3', [])).toBe(false);
  });

  it('allows tier 2 skills when prerequisites met', () => {
    expect(canUnlockSkill('th_3', ['th_1'])).toBe(true);
  });

  it('blocks tier 3 skills when only one prerequisite met', () => {
    // th_5 requires th_3 and th_4
    expect(canUnlockSkill('th_5', ['th_3'])).toBe(false);
  });

  it('allows tier 3 skills when all prerequisites met', () => {
    expect(canUnlockSkill('th_5', ['th_3', 'th_4'])).toBe(true);
  });

  it('returns false for non-existent skill', () => {
    expect(canUnlockSkill('nonexistent', ['th_1'])).toBe(false);
  });
});

// ─── Item Sets ───
describe('getActiveSetBonuses', () => {
  it('returns empty array with no matching items', () => {
    const result = getActiveSetBonuses([{ baseName: 'Random Item' }]);
    expect(result).toEqual([]);
  });

  it('activates 2-piece bonus when 2 set items equipped', () => {
    const items = [{ baseName: 'Data Gauntlets' }, { baseName: 'Neural Band' }];
    const bonuses = getActiveSetBonuses(items);
    expect(bonuses.length).toBe(1);
    expect(bonuses[0].set.id).toBe('tesla_set');
    expect(bonuses[0].activeBonus.count).toBe(2);
  });

  it('activates 3-piece bonus over 2-piece when all 3 items equipped', () => {
    const items = [
      { baseName: 'Data Gauntlets' },
      { baseName: 'Neural Band' },
      { baseName: 'Circuit Ring' },
    ];
    const bonuses = getActiveSetBonuses(items);
    expect(bonuses.length).toBe(1);
    expect(bonuses[0].activeBonus.count).toBe(3);
  });

  it('can activate multiple sets simultaneously', () => {
    const items = [
      { baseName: 'Data Gauntlets' },
      { baseName: 'Neural Band' },
      { baseName: 'Fiber Helm' },
      { baseName: 'Polymer Vest' },
    ];
    const bonuses = getActiveSetBonuses(items);
    expect(bonuses.length).toBe(2);
    const setIds = bonuses.map(b => b.set.id);
    expect(setIds).toContain('tesla_set');
    expect(setIds).toContain('newton_set');
  });

  it('does not activate with only 1 set item', () => {
    const items = [{ baseName: 'Data Gauntlets' }];
    expect(getActiveSetBonuses(items)).toEqual([]);
  });
});

// ─── Fortune Wheel ───
describe('spinWheel', () => {
  it('always returns a valid prize', () => {
    for (let i = 0; i < 100; i++) {
      const prize = spinWheel();
      expect(FORTUNE_WHEEL_PRIZES).toContainEqual(prize);
    }
  });

  it('all prize weights sum to expected total', () => {
    const totalWeight = FORTUNE_WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
    expect(totalWeight).toBeGreaterThan(0);
  });
});

// ─── Daily Challenges ───
describe('generateDailyChallenges', () => {
  it('returns 3 challenges for a non-Monday', () => {
    // 2026-02-24 is a Tuesday
    const challenges = generateDailyChallenges('2026-02-24');
    expect(challenges.length).toBe(3);
  });

  it('returns 4 challenges on a Monday (includes weekly)', () => {
    // 2026-02-23 is a Monday
    const challenges = generateDailyChallenges('2026-02-23');
    expect(challenges.length).toBe(4);
    const weekly = challenges.find(c => c.id.startsWith('weekly_'));
    expect(weekly).toBeDefined();
  });

  it('is deterministic for same date', () => {
    const a = generateDailyChallenges('2026-01-15');
    const b = generateDailyChallenges('2026-01-15');
    expect(a).toEqual(b);
  });

  it('produces different challenges for different dates', () => {
    const a = generateDailyChallenges('2026-01-15');
    const b = generateDailyChallenges('2026-01-16');
    // At least one challenge should differ (not guaranteed but extremely likely)
    const aIds = a.map(c => c.title);
    const bIds = b.map(c => c.title);
    // We just check they don't both produce identical sets
    expect(aIds.join(',') === bIds.join(',')).toBe(false);
  });

  it('assigns unique IDs to each challenge', () => {
    const challenges = generateDailyChallenges('2026-03-01');
    const ids = challenges.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Daily Login Rewards ───
describe('getLoginReward', () => {
  it('returns day 1 reward for streak of 1', () => {
    const reward = getLoginReward(1);
    expect(reward).toEqual(DAILY_LOGIN_REWARDS[0]);
  });

  it('returns day 7 (weekly bonus) for streak of 7', () => {
    const reward = getLoginReward(7);
    expect(reward).toEqual(DAILY_LOGIN_REWARDS[6]);
    expect(reward.xp).toBe(150);
    expect(reward.flux).toBe(50);
  });

  it('wraps around after day 7', () => {
    const reward8 = getLoginReward(8);
    expect(reward8).toEqual(DAILY_LOGIN_REWARDS[0]);
  });

  it('reward values increase through the week', () => {
    let prevXp = 0;
    for (let day = 1; day <= 7; day++) {
      const reward = getLoginReward(day);
      expect(reward.xp).toBeGreaterThanOrEqual(prevXp);
      prevXp = reward.xp;
    }
  });
});

// ─── Streak Multiplier ───
describe('getStreakMultiplier', () => {
  it('returns 1.0 for streak of 0', () => {
    expect(getStreakMultiplier(0)).toBe(1.0);
  });

  it('returns 1.0 for negative streak', () => {
    expect(getStreakMultiplier(-1)).toBe(1.0);
  });

  it('returns 1.05 for streak of 1-2', () => {
    expect(getStreakMultiplier(1)).toBe(1.05);
    expect(getStreakMultiplier(2)).toBe(1.05);
  });

  it('returns 1.10 for streak of 3-4', () => {
    expect(getStreakMultiplier(3)).toBe(1.10);
    expect(getStreakMultiplier(4)).toBe(1.10);
  });

  it('returns 1.50 for streak of 13+', () => {
    expect(getStreakMultiplier(13)).toBe(1.50);
    expect(getStreakMultiplier(100)).toBe(1.50);
  });

  it('is monotonically increasing', () => {
    let prev = 1.0;
    for (let s = 0; s <= 20; s++) {
      const mult = getStreakMultiplier(s);
      expect(mult).toBeGreaterThanOrEqual(prev);
      prev = mult;
    }
  });
});

// ─── Evolution Tiers ───
describe('getEvolutionTier', () => {
  it('returns Recruit for level 1', () => {
    expect(getEvolutionTier(1).name).toBe('Recruit');
  });

  it('returns Agent for level 10', () => {
    expect(getEvolutionTier(10).name).toBe('Agent');
  });

  it('returns Eternal for level 500', () => {
    expect(getEvolutionTier(500).name).toBe('Eternal');
  });

  it('returns the highest tier at or below current level', () => {
    // Level 74 should be Operative (50), not Lieutenant (75)
    expect(getEvolutionTier(74).name).toBe('Operative');
    expect(getEvolutionTier(75).name).toBe('Lieutenant');
  });

  it('returns Recruit for level 0', () => {
    expect(getEvolutionTier(0).name).toBe('Recruit');
  });

  it('evolution tiers have increasing glow intensity', () => {
    let prevGlow = 0;
    for (const tier of EVOLUTION_TIERS) {
      expect(tier.visualEffects.glowIntensity).toBeGreaterThanOrEqual(prevGlow);
      prevGlow = tier.visualEffects.glowIntensity;
    }
  });
});

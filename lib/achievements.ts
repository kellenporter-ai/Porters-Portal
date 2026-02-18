
import { Achievement, AchievementCategory, SkillNode, SpecializationType, ItemSet, FortuneWheelPrize, DailyChallenge, ChallengeType, EvolutionTier, SeasonalCosmetic } from '../types';

// ========================================
// ACHIEVEMENT DEFINITIONS
// ========================================

export const ACHIEVEMENTS: Achievement[] = [
  // PROGRESSION
  { id: 'first_steps', title: 'First Steps', description: 'Earn your first 100 XP', icon: '🚀', category: 'PROGRESSION', condition: { type: 'XP_TOTAL', target: 100 }, xpReward: 25 },
  { id: 'rising_star', title: 'Rising Star', description: 'Reach Level 5', icon: '⭐', category: 'PROGRESSION', condition: { type: 'LEVEL_REACHED', target: 5 }, xpReward: 100, fluxReward: 50 },
  { id: 'veteran', title: 'Veteran Operative', description: 'Reach Level 10', icon: '🎖️', category: 'PROGRESSION', condition: { type: 'LEVEL_REACHED', target: 10 }, xpReward: 250, fluxReward: 100 },
  { id: 'elite', title: 'Elite Agent', description: 'Reach Level 25', icon: '💎', category: 'PROGRESSION', condition: { type: 'LEVEL_REACHED', target: 25 }, xpReward: 500, fluxReward: 250 },
  { id: 'legend', title: 'Living Legend', description: 'Reach Level 50', icon: '👑', category: 'PROGRESSION', condition: { type: 'LEVEL_REACHED', target: 50 }, xpReward: 1000, fluxReward: 500, isSecret: true },
  { id: 'xp_5k', title: 'Knowledge Seeker', description: 'Accumulate 5,000 total XP', icon: '📚', category: 'PROGRESSION', condition: { type: 'XP_TOTAL', target: 5000 }, xpReward: 150 },
  { id: 'xp_25k', title: 'Scholar Supreme', description: 'Accumulate 25,000 total XP', icon: '🏛️', category: 'PROGRESSION', condition: { type: 'XP_TOTAL', target: 25000 }, xpReward: 500, fluxReward: 200 },

  // COLLECTION
  { id: 'collector_10', title: 'Gear Collector', description: 'Collect 10 items', icon: '📦', category: 'COLLECTION', condition: { type: 'ITEMS_COLLECTED', target: 10 }, xpReward: 50 },
  { id: 'collector_50', title: 'Hoarder', description: 'Collect 50 items', icon: '🗃️', category: 'COLLECTION', condition: { type: 'ITEMS_COLLECTED', target: 50 }, xpReward: 150, fluxReward: 75 },
  { id: 'gear_score_100', title: 'Well Equipped', description: 'Achieve a Gear Score of 100', icon: '🛡️', category: 'COLLECTION', condition: { type: 'GEAR_SCORE', target: 100 }, xpReward: 100 },
  { id: 'gear_score_500', title: 'Walking Arsenal', description: 'Achieve a Gear Score of 500', icon: '⚔️', category: 'COLLECTION', condition: { type: 'GEAR_SCORE', target: 500 }, xpReward: 300, fluxReward: 150, isSecret: true },

  // COMBAT / QUESTS
  { id: 'first_mission', title: 'Field Agent', description: 'Complete your first mission', icon: '🎯', category: 'COMBAT', condition: { type: 'QUESTS_COMPLETED', target: 1 }, xpReward: 50 },
  { id: 'mission_5', title: 'Seasoned Operative', description: 'Complete 5 missions', icon: '🎖️', category: 'COMBAT', condition: { type: 'QUESTS_COMPLETED', target: 5 }, xpReward: 150 },
  { id: 'mission_20', title: 'Mission Master', description: 'Complete 20 missions', icon: '🏆', category: 'COMBAT', condition: { type: 'QUESTS_COMPLETED', target: 20 }, xpReward: 400, fluxReward: 200 },
  { id: 'boss_slayer', title: 'Boss Slayer', description: 'Help defeat 3 bosses', icon: '🐉', category: 'COMBAT', condition: { type: 'BOSS_KILLS', target: 3 }, xpReward: 300, fluxReward: 150 },

  // DEDICATION
  { id: 'streak_3', title: 'Consistent', description: 'Maintain a 3-week engagement streak', icon: '🔥', category: 'DEDICATION', condition: { type: 'STREAK_WEEKS', target: 3 }, xpReward: 75 },
  { id: 'streak_8', title: 'Unstoppable', description: 'Maintain an 8-week engagement streak', icon: '💪', category: 'DEDICATION', condition: { type: 'STREAK_WEEKS', target: 8 }, xpReward: 200, fluxReward: 100 },
  { id: 'streak_16', title: 'Iron Will', description: 'Maintain a 16-week engagement streak', icon: '🏔️', category: 'DEDICATION', condition: { type: 'STREAK_WEEKS', target: 16 }, xpReward: 500, fluxReward: 250, isSecret: true },
  { id: 'login_7', title: 'Daily Devotion', description: 'Log in 7 days in a row', icon: '📅', category: 'DEDICATION', condition: { type: 'LOGIN_STREAK', target: 7 }, xpReward: 100 },
  { id: 'login_30', title: 'Month of Mastery', description: 'Log in 30 days in a row', icon: '🗓️', category: 'DEDICATION', condition: { type: 'LOGIN_STREAK', target: 30 }, xpReward: 300, fluxReward: 150, isSecret: true },
  { id: 'challenges_10', title: 'Challenge Accepted', description: 'Complete 10 daily challenges', icon: '✅', category: 'DEDICATION', condition: { type: 'CHALLENGES_COMPLETED', target: 10 }, xpReward: 100 },

  // SOCIAL
  { id: 'tutor_1', title: 'Helpful Hand', description: 'Complete 1 peer tutoring session', icon: '🤝', category: 'SOCIAL', condition: { type: 'TUTORING_SESSIONS', target: 1 }, xpReward: 75 },
  { id: 'tutor_10', title: 'Mentor', description: 'Complete 10 peer tutoring sessions', icon: '🎓', category: 'SOCIAL', condition: { type: 'TUTORING_SESSIONS', target: 10 }, xpReward: 300, fluxReward: 200 },

  // MASTERY
  { id: 'tech_50', title: 'Tech Wizard', description: 'Reach 50 Tech stat', icon: '💻', category: 'MASTERY', condition: { type: 'STAT_THRESHOLD', target: 50, stat: 'tech' }, xpReward: 100 },
  { id: 'focus_50', title: 'Zen Master', description: 'Reach 50 Focus stat', icon: '🧘', category: 'MASTERY', condition: { type: 'STAT_THRESHOLD', target: 50, stat: 'focus' }, xpReward: 100 },
  { id: 'analysis_50', title: 'Sharp Mind', description: 'Reach 50 Analysis stat', icon: '🔬', category: 'MASTERY', condition: { type: 'STAT_THRESHOLD', target: 50, stat: 'analysis' }, xpReward: 100 },
  { id: 'charisma_50', title: 'Silver Tongue', description: 'Reach 50 Charisma stat', icon: '🎤', category: 'MASTERY', condition: { type: 'STAT_THRESHOLD', target: 50, stat: 'charisma' }, xpReward: 100 },
  { id: 'craft_10', title: 'Artisan', description: 'Craft items 10 times', icon: '🔨', category: 'MASTERY', condition: { type: 'ITEMS_CRAFTED', target: 10 }, xpReward: 100, fluxReward: 50 },
];

export const getAchievementsByCategory = (category: AchievementCategory): Achievement[] =>
  ACHIEVEMENTS.filter(a => a.category === category);

export const getVisibleAchievements = (unlockedIds: string[]): Achievement[] =>
  ACHIEVEMENTS.filter(a => !a.isSecret || unlockedIds.includes(a.id));

// ========================================
// SKILL TREE DEFINITIONS
// ========================================

export const SKILL_TREES: Record<SpecializationType, { name: string; description: string; color: string; icon: string }> = {
  THEORIST: { name: 'Theorist', description: 'Master of physics theory and mathematical modeling', color: 'blue', icon: '🧮' },
  EXPERIMENTALIST: { name: 'Experimentalist', description: 'Expert in lab work and hands-on experimentation', color: 'green', icon: '🔬' },
  ANALYST: { name: 'Analyst', description: 'Data-driven problem solver and pattern recognizer', color: 'yellow', icon: '📊' },
  DIPLOMAT: { name: 'Diplomat', description: 'Collaborative leader who excels in group work', color: 'purple', icon: '🤝' },
};

export const SKILL_NODES: SkillNode[] = [
  // THEORIST TREE
  { id: 'th_1', name: 'Equation Mind', description: '+5 Analysis from equipment', specialization: 'THEORIST', tier: 1, cost: 1, prerequisites: [], effect: { type: 'STAT_BOOST', stat: 'analysis', value: 5 }, icon: '📐' },
  { id: 'th_2', name: 'Deep Thinker', description: '+10% XP from review questions', specialization: 'THEORIST', tier: 1, cost: 1, prerequisites: [], effect: { type: 'XP_MULTIPLIER', value: 0.10 }, icon: '🧠' },
  { id: 'th_3', name: 'Theoretical Framework', description: '+8 Analysis from equipment', specialization: 'THEORIST', tier: 2, cost: 2, prerequisites: ['th_1'], effect: { type: 'STAT_BOOST', stat: 'analysis', value: 8 }, icon: '📏' },
  { id: 'th_4', name: 'Thought Experiment', description: '+15% XP from study materials', specialization: 'THEORIST', tier: 2, cost: 2, prerequisites: ['th_2'], effect: { type: 'XP_MULTIPLIER', value: 0.15 }, icon: '💭' },
  { id: 'th_5', name: 'Unified Theory', description: '+12 Analysis, +5 Tech', specialization: 'THEORIST', tier: 3, cost: 3, prerequisites: ['th_3', 'th_4'], effect: { type: 'STAT_BOOST', stat: 'analysis', value: 12 }, icon: '🌌' },
  { id: 'th_6', name: 'Grand Theorem', description: '+25% XP from all sources', specialization: 'THEORIST', tier: 4, cost: 5, prerequisites: ['th_5'], effect: { type: 'XP_MULTIPLIER', value: 0.25 }, icon: '✨' },

  // EXPERIMENTALIST TREE
  { id: 'ex_1', name: 'Lab Safety', description: '+5 Tech from equipment', specialization: 'EXPERIMENTALIST', tier: 1, cost: 1, prerequisites: [], effect: { type: 'STAT_BOOST', stat: 'tech', value: 5 }, icon: '🥽' },
  { id: 'ex_2', name: 'Hands-On Learning', description: '+10% XP from engagement', specialization: 'EXPERIMENTALIST', tier: 1, cost: 1, prerequisites: [], effect: { type: 'XP_MULTIPLIER', value: 0.10 }, icon: '🔧' },
  { id: 'ex_3', name: 'Precision Tools', description: '+8 Tech from equipment', specialization: 'EXPERIMENTALIST', tier: 2, cost: 2, prerequisites: ['ex_1'], effect: { type: 'STAT_BOOST', stat: 'tech', value: 8 }, icon: '⚙️' },
  { id: 'ex_4', name: 'Data Collection', description: 'Crafting costs 20% less Flux', specialization: 'EXPERIMENTALIST', tier: 2, cost: 2, prerequisites: ['ex_2'], effect: { type: 'FLUX_DISCOUNT', value: 0.20 }, icon: '📋' },
  { id: 'ex_5', name: 'Breakthrough', description: '+12 Tech, crafting improves tier by +1', specialization: 'EXPERIMENTALIST', tier: 3, cost: 3, prerequisites: ['ex_3', 'ex_4'], effect: { type: 'CRAFT_BONUS', value: 1 }, icon: '💡' },
  { id: 'ex_6', name: 'Master Inventor', description: '+20% better craft results', specialization: 'EXPERIMENTALIST', tier: 4, cost: 5, prerequisites: ['ex_5'], effect: { type: 'CRAFT_BONUS', value: 2 }, icon: '🏗️' },

  // ANALYST TREE
  { id: 'an_1', name: 'Pattern Recognition', description: '+5 Focus from equipment', specialization: 'ANALYST', tier: 1, cost: 1, prerequisites: [], effect: { type: 'STAT_BOOST', stat: 'focus', value: 5 }, icon: '🔍' },
  { id: 'an_2', name: 'Streak Amplifier', description: 'Streak bonuses increased by 50%', specialization: 'ANALYST', tier: 1, cost: 1, prerequisites: [], effect: { type: 'STREAK_BONUS', value: 0.50 }, icon: '📈' },
  { id: 'an_3', name: 'Critical Analysis', description: '+8 Focus from equipment', specialization: 'ANALYST', tier: 2, cost: 2, prerequisites: ['an_1'], effect: { type: 'STAT_BOOST', stat: 'focus', value: 8 }, icon: '🎯' },
  { id: 'an_4', name: 'Efficiency Expert', description: '+15% XP from engagement time', specialization: 'ANALYST', tier: 2, cost: 2, prerequisites: ['an_2'], effect: { type: 'XP_MULTIPLIER', value: 0.15 }, icon: '⚡' },
  { id: 'an_5', name: 'Predictive Model', description: '+12 Focus, streak bonus doubled', specialization: 'ANALYST', tier: 3, cost: 3, prerequisites: ['an_3', 'an_4'], effect: { type: 'STREAK_BONUS', value: 1.0 }, icon: '🔮' },
  { id: 'an_6', name: 'Omniscient', description: '+30% XP from all quiz answers', specialization: 'ANALYST', tier: 4, cost: 5, prerequisites: ['an_5'], effect: { type: 'XP_MULTIPLIER', value: 0.30 }, icon: '👁️' },

  // DIPLOMAT TREE
  { id: 'di_1', name: 'Team Player', description: '+5 Charisma from equipment', specialization: 'DIPLOMAT', tier: 1, cost: 1, prerequisites: [], effect: { type: 'STAT_BOOST', stat: 'charisma', value: 5 }, icon: '🤝' },
  { id: 'di_2', name: 'Group Synergy', description: '+20% XP from group quests', specialization: 'DIPLOMAT', tier: 1, cost: 1, prerequisites: [], effect: { type: 'QUEST_BONUS', value: 0.20 }, icon: '👥' },
  { id: 'di_3', name: 'Inspiring Presence', description: '+8 Charisma from equipment', specialization: 'DIPLOMAT', tier: 2, cost: 2, prerequisites: ['di_1'], effect: { type: 'STAT_BOOST', stat: 'charisma', value: 8 }, icon: '✊' },
  { id: 'di_4', name: 'Peer Mentor', description: '+50% tutoring rewards', specialization: 'DIPLOMAT', tier: 2, cost: 2, prerequisites: ['di_2'], effect: { type: 'QUEST_BONUS', value: 0.50 }, icon: '📚' },
  { id: 'di_5', name: 'Natural Leader', description: '+12 Charisma, party size +1', specialization: 'DIPLOMAT', tier: 3, cost: 3, prerequisites: ['di_3', 'di_4'], effect: { type: 'STAT_BOOST', stat: 'charisma', value: 12 }, icon: '🌟' },
  { id: 'di_6', name: 'Commander', description: 'All party members get +10% XP', specialization: 'DIPLOMAT', tier: 4, cost: 5, prerequisites: ['di_5'], effect: { type: 'XP_MULTIPLIER', value: 0.10 }, icon: '👑' },
];

export const getSkillTree = (spec: SpecializationType): SkillNode[] =>
  SKILL_NODES.filter(n => n.specialization === spec);

export const canUnlockSkill = (skillId: string, unlockedSkills: string[]): boolean => {
  const skill = SKILL_NODES.find(n => n.id === skillId);
  if (!skill) return false;
  return skill.prerequisites.every(prereq => unlockedSkills.includes(prereq));
};

// ========================================
// ITEM SET DEFINITIONS
// ========================================

export const ITEM_SETS: ItemSet[] = [
  {
    id: 'tesla_set',
    name: "Tesla's Arsenal",
    description: 'Gear infused with electromagnetic energy',
    itemIds: ['Data Gauntlets', 'Neural Band', 'Circuit Ring'],
    bonuses: [
      { count: 2, label: '2-Piece: Spark', effects: [{ stat: 'tech', value: 10 }] },
      { count: 3, label: '3-Piece: Overcharge', effects: [{ stat: 'tech', value: 25 }, { stat: 'focus', value: 10 }] },
    ],
  },
  {
    id: 'newton_set',
    name: "Newton's Laws",
    description: 'Classical mechanics manifested in gear',
    itemIds: ['Fiber Helm', 'Polymer Vest', 'Mag-Boots'],
    bonuses: [
      { count: 2, label: '2-Piece: Inertia', effects: [{ stat: 'analysis', value: 10 }] },
      { count: 3, label: '3-Piece: Force Field', effects: [{ stat: 'analysis', value: 25 }, { stat: 'charisma', value: 10 }] },
    ],
  },
  {
    id: 'curie_set',
    name: "Curie's Focus",
    description: 'Gear radiating determination and precision',
    itemIds: ['Precision Grips', 'Quantum Chip', 'Focus Band'],
    bonuses: [
      { count: 2, label: '2-Piece: Concentration', effects: [{ stat: 'focus', value: 10 }] },
      { count: 3, label: '3-Piece: Radiance', effects: [{ stat: 'focus', value: 25 }, { stat: 'analysis', value: 10 }] },
    ],
  },
  {
    id: 'diplomat_set',
    name: "Diplomat's Ensemble",
    description: 'Gear designed for collaboration and leadership',
    itemIds: ['Exo-Plate', 'Utility Belt', 'Resonance Core'],
    bonuses: [
      { count: 2, label: '2-Piece: Rapport', effects: [{ stat: 'charisma', value: 10 }] },
      { count: 3, label: '3-Piece: Aura of Command', effects: [{ stat: 'charisma', value: 25 }, { stat: 'tech', value: 10 }] },
    ],
  },
];

export const getActiveSetBonuses = (equippedItems: { baseName: string }[]): { set: ItemSet; activeBonus: ItemSet['bonuses'][0] }[] => {
  const results: { set: ItemSet; activeBonus: ItemSet['bonuses'][0] }[] = [];
  const equippedNames = equippedItems.map(i => i.baseName);

  for (const set of ITEM_SETS) {
    const matchCount = set.itemIds.filter(name => equippedNames.includes(name)).length;
    // Find the highest bonus threshold met
    const activeBonuses = set.bonuses
      .filter(b => matchCount >= b.count)
      .sort((a, b) => b.count - a.count);
    if (activeBonuses.length > 0) {
      results.push({ set, activeBonus: activeBonuses[0] });
    }
  }
  return results;
};

// ========================================
// FORTUNE WHEEL PRIZES
// ========================================

export const FORTUNE_WHEEL_PRIZES: FortuneWheelPrize[] = [
  { id: 'w_xp_50', label: '50 XP', type: 'XP', value: 50, weight: 25, color: '#3b82f6' },
  { id: 'w_xp_100', label: '100 XP', type: 'XP', value: 100, weight: 18, color: '#6366f1' },
  { id: 'w_xp_250', label: '250 XP', type: 'XP', value: 250, weight: 8, color: '#8b5cf6' },
  { id: 'w_flux_10', label: '10 Flux', type: 'FLUX', value: 10, weight: 20, color: '#06b6d4' },
  { id: 'w_flux_25', label: '25 Flux', type: 'FLUX', value: 25, weight: 12, color: '#0891b2' },
  { id: 'w_flux_100', label: '100 Flux', type: 'FLUX', value: 100, weight: 3, color: '#0e7490' },
  { id: 'w_item_common', label: 'Common Item', type: 'ITEM', value: 1, rarity: 'COMMON', weight: 15, color: '#64748b' },
  { id: 'w_item_uncommon', label: 'Uncommon Item', type: 'ITEM', value: 1, rarity: 'UNCOMMON', weight: 8, color: '#22c55e' },
  { id: 'w_item_rare', label: 'Rare Item!', type: 'ITEM', value: 1, rarity: 'RARE', weight: 3, color: '#eab308' },
  { id: 'w_gem', label: 'Random Gem', type: 'GEM', value: 1, weight: 10, color: '#ec4899' },
  { id: 'w_skillpt', label: 'Skill Point', type: 'SKILL_POINT', value: 1, weight: 5, color: '#a855f7' },
  { id: 'w_nothing', label: 'Try Again!', type: 'NOTHING', value: 0, weight: 15, color: '#374151' },
];

export const spinWheel = (): FortuneWheelPrize => {
  const totalWeight = FORTUNE_WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const prize of FORTUNE_WHEEL_PRIZES) {
    roll -= prize.weight;
    if (roll <= 0) return prize;
  }
  return FORTUNE_WHEEL_PRIZES[FORTUNE_WHEEL_PRIZES.length - 1];
};

// ========================================
// DAILY CHALLENGE TEMPLATES
// ========================================

const CHALLENGE_TEMPLATES: Omit<DailyChallenge, 'id' | 'date'>[] = [
  { title: 'XP Hunter', description: 'Earn 200 XP today', type: 'EARN_XP', target: 200, xpReward: 50, fluxReward: 10 },
  { title: 'Resource Explorer', description: 'Complete 2 resources', type: 'COMPLETE_RESOURCE', target: 2, xpReward: 75 },
  { title: 'Quiz Whiz', description: 'Answer 5 review questions correctly', type: 'ANSWER_QUESTIONS', target: 5, xpReward: 60, fluxReward: 15 },
  { title: 'Deep Focus', description: 'Spend 30 minutes engaged with materials', type: 'ENGAGE_MINUTES', target: 30, xpReward: 80 },
  { title: 'Tinkerer', description: 'Craft an item at the Fabrication Terminal', type: 'CRAFT_ITEM', target: 1, xpReward: 40, fluxReward: 5 },
  { title: 'Gear Up', description: 'Equip a new piece of gear', type: 'EQUIP_GEAR', target: 1, xpReward: 30 },
  { title: 'XP Surge', description: 'Earn 500 XP today', type: 'EARN_XP', target: 500, xpReward: 100, fluxReward: 25, isWeekly: true },
  { title: 'Scholar', description: 'Answer 20 review questions correctly this week', type: 'ANSWER_QUESTIONS', target: 20, xpReward: 200, fluxReward: 50, isWeekly: true },
  { title: 'Marathon', description: 'Spend 2 hours engaged this week', type: 'ENGAGE_MINUTES', target: 120, xpReward: 250, fluxReward: 75, isWeekly: true },
];

export const generateDailyChallenges = (date: string): DailyChallenge[] => {
  // Use date as seed for deterministic but varied selection
  const seed = date.split('-').reduce((acc, v) => acc + parseInt(v), 0);
  const dailyTemplates = CHALLENGE_TEMPLATES.filter(t => !t.isWeekly);
  const selected: DailyChallenge[] = [];

  // Pick 3 daily challenges
  for (let i = 0; i < 3; i++) {
    const idx = (seed + i * 7) % dailyTemplates.length;
    selected.push({ ...dailyTemplates[idx], id: `daily_${date}_${i}`, date });
  }

  // On Mondays, also add a weekly challenge
  const dayOfWeek = new Date(date).getDay();
  if (dayOfWeek === 1) {
    const weeklyTemplates = CHALLENGE_TEMPLATES.filter(t => t.isWeekly);
    const wIdx = seed % weeklyTemplates.length;
    selected.push({ ...weeklyTemplates[wIdx], id: `weekly_${date}`, date });
  }

  return selected;
};

// ========================================
// EVOLUTION TIERS
// ========================================

export const EVOLUTION_TIERS: EvolutionTier[] = [
  { level: 1, name: 'Recruit', description: 'Standard-issue operative suit', visualEffects: { glowIntensity: 0.1, particleCount: 0, armorDetail: 'BASIC', wingType: 'NONE', crownType: 'NONE' } },
  { level: 5, name: 'Agent', description: 'Enhanced suit with energy conduits', visualEffects: { glowIntensity: 0.25, particleCount: 2, armorDetail: 'ENHANCED', wingType: 'NONE', crownType: 'NONE' } },
  { level: 15, name: 'Specialist', description: 'Advanced armor plating with integrated systems', visualEffects: { glowIntensity: 0.5, particleCount: 4, armorDetail: 'ADVANCED', wingType: 'NONE', crownType: 'CIRCLET' } },
  { level: 30, name: 'Commander', description: 'Legendary suit with energy wings', visualEffects: { glowIntensity: 0.75, particleCount: 6, armorDetail: 'LEGENDARY', wingType: 'ENERGY', crownType: 'HALO' } },
  { level: 50, name: 'Mythic', description: 'Transcendent form with crystalline wings and crown', visualEffects: { glowIntensity: 1.0, particleCount: 10, armorDetail: 'MYTHIC', wingType: 'PHOENIX', crownType: 'CROWN' } },
];

export const getEvolutionTier = (level: number): EvolutionTier => {
  const sorted = [...EVOLUTION_TIERS].sort((a, b) => b.level - a.level);
  return sorted.find(t => level >= t.level) || EVOLUTION_TIERS[0];
};

// ========================================
// SEASONAL COSMETICS
// ========================================

export const SEASONAL_COSMETICS: SeasonalCosmetic[] = [
  { id: 'winter_frost', name: 'Frost Aura', description: 'Icy particles swirl around your avatar', season: 'WINTER', type: 'PARTICLE', particleColor: '#93c5fd', isAvailable: false, cost: 50 },
  { id: 'winter_frame', name: 'Snowflake Frame', description: 'Crystalline border effect', season: 'WINTER', type: 'FRAME', isAvailable: false, cost: 75 },
  { id: 'spring_bloom', name: 'Cherry Blossom', description: 'Pink petals float around your agent', season: 'SPRING', type: 'PARTICLE', particleColor: '#f9a8d4', isAvailable: false, cost: 50 },
  { id: 'summer_flame', name: 'Solar Flare', description: 'Radiant heat shimmer effect', season: 'SUMMER', type: 'AURA', hueOverride: 30, isAvailable: false, cost: 50 },
  { id: 'fall_leaves', name: 'Autumn Drift', description: 'Golden leaves cascade around you', season: 'FALL', type: 'PARTICLE', particleColor: '#f59e0b', isAvailable: false, cost: 50 },
  { id: 'halloween_shadow', name: 'Shadow Cloak', description: 'Dark ethereal wisps surround your form', season: 'HALLOWEEN', type: 'AURA', hueOverride: 270, isAvailable: false, cost: 100 },
  { id: 'halloween_trail', name: 'Ghost Trail', description: 'Spectral afterimage follows movement', season: 'HALLOWEEN', type: 'TRAIL', particleColor: '#a3e635', isAvailable: false, cost: 75 },
  { id: 'holiday_sparkle', name: 'Holiday Lights', description: 'Twinkling multicolor lights adorn your suit', season: 'HOLIDAY', type: 'PARTICLE', particleColor: '#ef4444', isAvailable: false, cost: 75 },
  { id: 'exam_focus', name: 'Determination Aura', description: 'Focused energy radiates from your core', season: 'EXAM_SEASON', type: 'AURA', hueOverride: 200, isAvailable: false, cost: 30 },
];

// ========================================
// GEM DEFINITIONS
// ========================================

export const GEM_TYPES = [
  { name: 'Ruby', stat: 'tech' as const, color: '#ef4444' },
  { name: 'Emerald', stat: 'focus' as const, color: '#22c55e' },
  { name: 'Sapphire', stat: 'analysis' as const, color: '#3b82f6' },
  { name: 'Amethyst', stat: 'charisma' as const, color: '#a855f7' },
];

export const ENCHANT_COST = 15; // Flux cost to socket a gem
export const SOCKET_COST = 30; // Flux cost to add a socket to an item

// ========================================
// DAILY LOGIN REWARDS
// ========================================

export const DAILY_LOGIN_REWARDS = [
  { day: 1, xp: 25, flux: 5 },
  { day: 2, xp: 30, flux: 5 },
  { day: 3, xp: 40, flux: 10 },
  { day: 4, xp: 50, flux: 10 },
  { day: 5, xp: 75, flux: 15 },
  { day: 6, xp: 100, flux: 20 },
  { day: 7, xp: 150, flux: 50 }, // Weekly bonus
];

export const getLoginReward = (streak: number): { xp: number; flux: number } => {
  const dayIndex = ((streak - 1) % 7);
  return DAILY_LOGIN_REWARDS[dayIndex];
};

// ========================================
// STUDY STREAK MULTIPLIER
// ========================================

export const getStreakMultiplier = (streak: number): number => {
  if (streak <= 0) return 1.0;
  if (streak <= 2) return 1.05; // 5% bonus
  if (streak <= 4) return 1.10; // 10% bonus
  if (streak <= 7) return 1.15; // 15% bonus
  if (streak <= 12) return 1.25; // 25% bonus
  return 1.50; // 50% bonus for 13+ weeks
};

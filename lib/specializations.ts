
import { SpecializationId, SkillNode, Specialization, TrialBoss } from '../types';

// ========================================
// 8 COMBAT SPECIALIZATIONS (Boss Fight RPG System)
// ========================================

export const SPECIALIZATIONS: Record<SpecializationId, Specialization> = {
  JUGGERNAUT: {
    id: 'JUGGERNAUT',
    name: 'Juggernaut',
    description: 'Unstoppable frontline tank. High HP, heavy armor, and sustained damage. Excels at outlasting bosses through raw endurance.',
    baseRole: 'VANGUARD',
    unlockLevel: 10,
    bonuses: [
      { type: 'ARMOR_BOOST', value: 0.20, condition: 'Always active' },
      { type: 'DAMAGE_BOOST', value: 0.10, condition: 'When HP > 75%' },
    ],
  },
  BERSERKER: {
    id: 'BERSERKER',
    name: 'Berserker',
    description: 'High-risk, high-reward damage dealer. Deals massive damage when low on HP, but fragile. Rewards aggressive play.',
    baseRole: 'STRIKER',
    unlockLevel: 10,
    bonuses: [
      { type: 'DAMAGE_BOOST', value: 0.25, condition: 'When HP < 40%' },
      { type: 'CRIT_BOOST', value: 0.15, condition: 'When HP < 25%' },
    ],
  },
  SNIPER: {
    id: 'SNIPER',
    name: 'Sniper',
    description: 'Precision striker. Bonus damage on streaks and timed answers. Dominates when maintaining accuracy.',
    baseRole: 'STRIKER',
    unlockLevel: 10,
    bonuses: [
      { type: 'DAMAGE_BOOST', value: 0.20, condition: 'On streak >= 3' },
      { type: 'CRIT_BOOST', value: 0.10, condition: 'On fast answers (< 50% time)' },
    ],
  },
  SPEEDSTER: {
    id: 'SPEEDSTER',
    name: 'Speedster',
    description: 'Rapid attacker. Reduced retaliation damage, bonus for fast answers. Hard to hit, hits fast.',
    baseRole: 'STRIKER',
    unlockLevel: 10,
    bonuses: [
      { type: 'SPEED_BOOST', value: 0.30, condition: 'Always active' },
      { type: 'DAMAGE_BOOST', value: 0.15, condition: 'On fast answers (< 50% time)' },
    ],
  },
  GUARDIAN: {
    id: 'GUARDIAN',
    name: 'Guardian',
    description: 'Protective tank with ally shielding. Reduces damage taken by the whole party. Essential for team survival.',
    baseRole: 'SENTINEL',
    unlockLevel: 10,
    bonuses: [
      { type: 'ARMOR_BOOST', value: 0.15, condition: 'Always active' },
      { type: 'HEALING_BOOST', value: 0.20, condition: 'When shielding allies' },
    ],
  },
  CLERIC: {
    id: 'CLERIC',
    name: 'Cleric',
    description: 'Healer and support. Restores HP on correct answers, buffs ally damage. Keeps the team fighting longer.',
    baseRole: 'COMMANDER',
    unlockLevel: 10,
    bonuses: [
      { type: 'HEALING_BOOST', value: 0.25, condition: 'On correct answers' },
      { type: 'DAMAGE_BUFF_ALLY', value: 0.10, condition: 'When healing allies' },
    ],
  },
  TACTICIAN: {
    id: 'TACTICIAN',
    name: 'Tactician',
    description: 'Strategic debuffer. Applies vulnerability to bosses, increasing all party damage. Forces multiplier windows.',
    baseRole: 'COMMANDER',
    unlockLevel: 10,
    bonuses: [
      { type: 'DAMAGE_BOOST', value: 0.15, condition: 'After boss phase transition' },
      { type: 'HINT_BOOST', value: 0.20, condition: 'Always active' },
    ],
  },
  SCHOLAR: {
    id: 'SCHOLAR',
    name: 'Scholar',
    description: 'Mastery-focused specialist. Topic mastery advances faster, and high mastery yields massive damage bonuses.',
    baseRole: 'VANGUARD',
    unlockLevel: 10,
    bonuses: [
      { type: 'DAMAGE_BOOST', value: 0.30, condition: 'When topic mastery >= 0.8' },
      { type: 'HINT_BOOST', value: 0.15, condition: 'Always active' },
    ],
  },
};

// ========================================
// SKILL TREES — 6 nodes per spec, tiers 1-4
// ========================================

export const SKILL_TREES_V2: Record<SpecializationId, { name: string; description: string; color: string; icon: string }> = {
  JUGGERNAUT:  { name: 'Juggernaut',  description: 'Unstoppable endurance and raw power', color: 'red',    icon: '🛡️' },
  BERSERKER:   { name: 'Berserker',   description: 'Risk-fueled rage and crit damage',   color: 'orange', icon: '⚔️' },
  SNIPER:      { name: 'Sniper',      description: 'Precision strikes and streak mastery', color: 'green',  icon: '🎯' },
  SPEEDSTER:   { name: 'Speedster',   description: 'Lightning reflexes and evasion',     color: 'cyan',   icon: '⚡' },
  GUARDIAN:    { name: 'Guardian',    description: 'Ally protection and damage soaking', color: 'blue',   icon: '🛡️' },
  CLERIC:      { name: 'Cleric',      description: 'Healing and team empowerment',       color: 'emerald',icon: '✨' },
  TACTICIAN:   { name: 'Tactician',   description: 'Boss debuffs and strategic windows', color: 'purple', icon: '🧠' },
  SCHOLAR:     { name: 'Scholar',     description: 'Topic mastery and knowledge power',  color: 'indigo', icon: '📚' },
};

export const SKILL_NODES_V2: SkillNode[] = [
  // ═══════════════════════════════════════════════════
  // JUGGERNAUT — Tank / Sustained Damage
  // ═══════════════════════════════════════════════════
  { id: 'jug_1', name: 'Iron Skin', description: '+15% Armor from all sources', specialization: 'JUGGERNAUT', tier: 1, cost: 1, prerequisites: [], effect: { type: 'ARMOR_BOOST_TOPIC', value: 0.15 }, icon: '🛡️' },
  { id: 'jug_2', name: 'Heavy Strikes', description: '+8% damage when HP is above 75%', specialization: 'JUGGERNAUT', tier: 1, cost: 1, prerequisites: [], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.08, condition: 'hp_above_75' }, icon: '👊' },
  { id: 'jug_3', name: 'Thick Hide', description: '+20% max HP', specialization: 'JUGGERNAUT', tier: 2, cost: 2, prerequisites: ['jug_1'], effect: { type: 'STAT_BOOST', stat: 'charisma', value: 15 }, icon: '🐻' },
  { id: 'jug_4', name: 'Momentum', description: '+10% damage, stacking +2% per correct answer (max +20%)', specialization: 'JUGGERNAUT', tier: 2, cost: 2, prerequisites: ['jug_2'], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.10, condition: 'stacks_on_hit' }, icon: '📈' },
  { id: 'jug_5', name: 'Unstoppable', description: 'Below 30% HP: +25% armor, +15% damage', specialization: 'JUGGERNAUT', tier: 3, cost: 3, prerequisites: ['jug_3', 'jug_4'], effect: { type: 'BONUS_DAMAGE_LOW_HP', value: 0.15, condition: 'hp_below_30' }, icon: '🔥' },
  { id: 'jug_6', name: 'Colossus', description: '+30% armor, +20% max HP, immune to stun', specialization: 'JUGGERNAUT', tier: 4, cost: 5, prerequisites: ['jug_5'], effect: { type: 'BOSS_DAMAGE_RESIST', value: 0.30 }, icon: '🏔️' },

  // ═══════════════════════════════════════════════════
  // BERSERKER — High Risk / High Reward
  // ═══════════════════════════════════════════════════
  { id: 'ber_1', name: 'Bloodlust', description: '+12% damage when HP < 50%', specialization: 'BERSERKER', tier: 1, cost: 1, prerequisites: [], effect: { type: 'BONUS_DAMAGE_LOW_HP', value: 0.12, condition: 'hp_below_50' }, icon: '🩸' },
  { id: 'ber_2', name: 'Reckless Assault', description: '+10% damage, -5% armor', specialization: 'BERSERKER', tier: 1, cost: 1, prerequisites: [], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.10, condition: 'trade_armor' }, icon: '💀' },
  { id: 'ber_3', name: 'Crimson Rage', description: 'HP < 40%: +20% crit chance', specialization: 'BERSERKER', tier: 2, cost: 2, prerequisites: ['ber_1'], effect: { type: 'CRIT_BOOST_TOPIC', value: 0.20, condition: 'hp_below_40' }, icon: '😤' },
  { id: 'ber_4', name: 'Adrenaline Surge', description: 'Wrong answers deal 50% reduced damage TO YOU', specialization: 'BERSERKER', tier: 2, cost: 2, prerequisites: ['ber_2'], effect: { type: 'BOSS_DAMAGE_RESIST', value: 0.50, condition: 'on_wrong_answer' }, icon: '⚡' },
  { id: 'ber_5', name: 'Execute', description: 'Bosses below 15% HP take +25% damage from you', specialization: 'BERSERKER', tier: 3, cost: 3, prerequisites: ['ber_3', 'ber_4'], effect: { type: 'EXECUTE_THRESHOLD', value: 0.25, condition: 'boss_hp_below_15' }, icon: '☠️' },
  { id: 'ber_6', name: 'Rampage', description: '+35% damage when HP < 25%, lifesteal 10%', specialization: 'BERSERKER', tier: 4, cost: 5, prerequisites: ['ber_5'], effect: { type: 'LIFESTEAL', value: 0.10, condition: 'hp_below_25' }, icon: '🐺' },

  // ═══════════════════════════════════════════════════
  // SNIPER — Precision / Streak Mastery
  // ═══════════════════════════════════════════════════
  { id: 'sni_1', name: 'Steady Aim', description: '+15% damage on streak >= 3', specialization: 'SNIPER', tier: 1, cost: 1, prerequisites: [], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.15, condition: 'streak_3' }, icon: '🎯' },
  { id: 'sni_2', name: 'Quick Draw', description: '+12% damage on fast answers (< 50% time)', specialization: 'SNIPER', tier: 1, cost: 1, prerequisites: [], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.12, condition: 'fast_answer' }, icon: '⏱️' },
  { id: 'sni_3', name: 'Focus Fire', description: 'Streak >= 5: +25% crit chance', specialization: 'SNIPER', tier: 2, cost: 2, prerequisites: ['sni_1'], effect: { type: 'CRIT_BOOST_TOPIC', value: 0.25, condition: 'streak_5' }, icon: '🔥' },
  { id: 'sni_4', name: 'Headshot', description: 'Fast answers have +20% crit chance', specialization: 'SNIPER', tier: 2, cost: 2, prerequisites: ['sni_2'], effect: { type: 'CRIT_BOOST_TOPIC', value: 0.20, condition: 'fast_answer' }, icon: '🧠' },
  { id: 'sni_5', name: 'Perfect Shot', description: 'Streak >= 7: +30% damage, answers < 3s get +20%', specialization: 'SNIPER', tier: 3, cost: 3, prerequisites: ['sni_3', 'sni_4'], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.30, condition: 'streak_7' }, icon: '💎' },
  { id: 'sni_6', name: 'One Shot', description: 'First correct answer each attempt deals +50% damage', specialization: 'SNIPER', tier: 4, cost: 5, prerequisites: ['sni_5'], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.50, condition: 'first_hit' }, icon: '🔫' },

  // ═══════════════════════════════════════════════════
  // SPEEDSTER — Evasion / Fast Answers
  // ═══════════════════════════════════════════════════
  { id: 'spd_1', name: 'Nimble', description: '+20% chance to dodge boss retaliation', specialization: 'SPEEDSTER', tier: 1, cost: 1, prerequisites: [], effect: { type: 'DODGE_CHANCE', value: 0.20 }, icon: '🌪️' },
  { id: 'spd_2', name: 'Rapid Fire', description: '+10% damage, -10% answer time required for "fast" bonus', specialization: 'SPEEDSTER', tier: 1, cost: 1, prerequisites: [], effect: { type: 'SPEED_BOOST', value: 0.10 }, icon: '🔫' },
  { id: 'spd_3', name: 'Blur', description: '+30% dodge chance', specialization: 'SPEEDSTER', tier: 2, cost: 2, prerequisites: ['spd_1'], effect: { type: 'DODGE_CHANCE', value: 0.30 }, icon: '💨' },
  { id: 'spd_4', name: 'Haste', description: 'Fast answers give +15% damage AND +5 HP heal', specialization: 'SPEEDSTER', tier: 2, cost: 2, prerequisites: ['spd_2'], effect: { type: 'LIFESTEAL', value: 0.15, condition: 'fast_answer' }, icon: '⚡' },
  { id: 'spd_5', name: 'Phase Shift', description: 'Dodge refreshes: after dodging, next answer +25% damage', specialization: 'SPEEDSTER', tier: 3, cost: 3, prerequisites: ['spd_3', 'spd_4'], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.25, condition: 'after_dodge' }, icon: '👻' },
  { id: 'spd_6', name: 'Time Warp', description: '+50% dodge, all fast answers +25% damage, +20% speed', specialization: 'SPEEDSTER', tier: 4, cost: 5, prerequisites: ['spd_5'], effect: { type: 'SPEED_BOOST', value: 0.20 }, icon: '⏳' },

  // ═══════════════════════════════════════════════════
  // GUARDIAN — Ally Protection / Party Tank
  // ═══════════════════════════════════════════════════
  { id: 'grd_1', name: 'Aegis', description: '+10% armor, nearby allies +5% armor', specialization: 'GUARDIAN', tier: 1, cost: 1, prerequisites: [], effect: { type: 'ARMOR_BOOST_TOPIC', value: 0.10, condition: 'aura' }, icon: '🛡️' },
  { id: 'grd_2', name: 'Taunt', description: 'Bosses target you +15% more often (if role-based targeting)', specialization: 'GUARDIAN', tier: 1, cost: 1, prerequisites: [], effect: { type: 'BOSS_DAMAGE_RESIST', value: 0.15, condition: 'taunt' }, icon: '📢' },
  { id: 'grd_3', name: 'Bulwark', description: '+20% armor, reflect 10% damage to boss', specialization: 'GUARDIAN', tier: 2, cost: 2, prerequisites: ['grd_1'], effect: { type: 'REFLECT_DAMAGE', value: 0.10 }, icon: '🏰' },
  { id: 'grd_4', name: 'Rescue', description: 'When ally drops below 25% HP, they get +15 armor for 10s', specialization: 'GUARDIAN', tier: 2, cost: 2, prerequisites: ['grd_2'], effect: { type: 'SHIELD_ALLY', value: 0.15, condition: 'ally_low_hp' }, icon: '🚁' },
  { id: 'grd_5', name: 'Fortress', description: 'All allies +15% armor, you +25%', specialization: 'GUARDIAN', tier: 3, cost: 3, prerequisites: ['grd_3', 'grd_4'], effect: { type: 'ARMOR_BOOST_TOPIC', value: 0.25, condition: 'self_and_allies' }, icon: '🏔️' },
  { id: 'grd_6', name: 'Immortal', description: 'Once per attempt, survive a lethal hit at 1 HP', specialization: 'GUARDIAN', tier: 4, cost: 5, prerequisites: ['grd_5'], effect: { type: 'REVIVE_CHANCE', value: 1.0, condition: 'once_per_attempt' }, icon: '💀' },

  // ═══════════════════════════════════════════════════
  // CLERIC — Healing / Team Support
  // ═══════════════════════════════════════════════════
  { id: 'clr_1', name: 'First Aid', description: 'Correct answers heal +5 HP', specialization: 'CLERIC', tier: 1, cost: 1, prerequisites: [], effect: { type: 'LIFESTEAL', value: 5, condition: 'on_correct' }, icon: '💊' },
  { id: 'clr_2', name: 'Inspiration', description: 'Correct answers give nearest ally +3% damage (stacks 3x)', specialization: 'CLERIC', tier: 1, cost: 1, prerequisites: [], effect: { type: 'DAMAGE_BUFF_ALLY', value: 0.03, condition: 'on_correct' }, icon: '✨' },
  { id: 'clr_3', name: 'Renewal', description: 'Heal +10 HP on correct, +3 HP to lowest ally', specialization: 'CLERIC', tier: 2, cost: 2, prerequisites: ['clr_1'], effect: { type: 'AREA_HEAL', value: 3, condition: 'on_correct' }, icon: '🌿' },
  { id: 'clr_4', name: 'Blessing', description: 'Allies within aura get +10% of your heal', specialization: 'CLERIC', tier: 2, cost: 2, prerequisites: ['clr_2'], effect: { type: 'HEALING_BOOST', value: 0.10, condition: 'aura' }, icon: '🙏' },
  { id: 'clr_5', name: 'Sanctuary', description: 'All party members heal +8 HP per correct answer', specialization: 'CLERIC', tier: 3, cost: 3, prerequisites: ['clr_3', 'clr_4'], effect: { type: 'AREA_HEAL', value: 8, condition: 'party' }, icon: '⛪' },
  { id: 'clr_6', name: 'Divine Intervention', description: 'Once per attempt, fully heal all allies when any hits 0 HP', specialization: 'CLERIC', tier: 4, cost: 5, prerequisites: ['clr_5'], effect: { type: 'AREA_HEAL', value: 1.0, condition: 'once_per_attempt_full' }, icon: '👼' },

  // ═══════════════════════════════════════════════════
  // TACTICIAN — Debuffs / Strategic Windows
  // ═══════════════════════════════════════════════════
  { id: 'tac_1', name: 'Scan Weakness', description: '+10% damage after boss phase transition', specialization: 'TACTICIAN', tier: 1, cost: 1, prerequisites: [], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.10, condition: 'phase_transition' }, icon: '🔍' },
  { id: 'tac_2', name: 'Prepared Mind', description: '+15% hint effectiveness', specialization: 'TACTICIAN', tier: 1, cost: 1, prerequisites: [], effect: { type: 'HINT_EFFECTIVENESS', value: 0.15 }, icon: '📖' },
  { id: 'tac_3', name: 'Exploit', description: 'First answer in new phase +25% damage', specialization: 'TACTICIAN', tier: 2, cost: 2, prerequisites: ['tac_1'], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.25, condition: 'first_in_phase' }, icon: '💥' },
  { id: 'tac_4', name: 'Cooldown Reduction', description: 'Consumable cooldowns -20%', specialization: 'TACTICIAN', tier: 2, cost: 2, prerequisites: ['tac_2'], effect: { type: 'COOLDOWN_REDUCTION', value: 0.20 }, icon: '⏱️' },
  { id: 'tac_5', name: 'Vulnerability Scan', description: 'All party +15% damage for 15s after you answer correctly', specialization: 'TACTICIAN', tier: 3, cost: 3, prerequisites: ['tac_3', 'tac_4'], effect: { type: 'DAMAGE_BUFF_ALLY', value: 0.15, condition: 'on_correct_party_buff' }, icon: '📡' },
  { id: 'tac_6', name: 'Checkmate', description: 'Boss below 20% HP: all party +30% damage', specialization: 'TACTICIAN', tier: 4, cost: 5, prerequisites: ['tac_5'], effect: { type: 'DAMAGE_BUFF_ALLY', value: 0.30, condition: 'boss_hp_below_20' }, icon: '♟️' },

  // ═══════════════════════════════════════════════════
  // SCHOLAR — Topic Mastery / Knowledge Power
  // ═══════════════════════════════════════════════════
  { id: 'sch_1', name: 'Deep Study', description: 'Topic mastery advances +20% faster', specialization: 'SCHOLAR', tier: 1, cost: 1, prerequisites: [], effect: { type: 'TOPIC_MASTERY_XP', value: 0.20 }, icon: '📚' },
  { id: 'sch_2', name: 'Applied Knowledge', description: '+15% damage when topic mastery >= 0.6', specialization: 'SCHOLAR', tier: 1, cost: 1, prerequisites: [], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.15, condition: 'mastery_above_60' }, icon: '🧠' },
  { id: 'sch_3', name: 'Mastery Surge', description: 'Topic mastery >= 0.8: +25% damage', specialization: 'SCHOLAR', tier: 2, cost: 2, prerequisites: ['sch_1'], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.25, condition: 'mastery_above_80' }, icon: '📈' },
  { id: 'sch_4', name: 'Cross-Domain', description: 'Skills from 2+ trees unlocked: +10% all damage', specialization: 'SCHOLAR', tier: 2, cost: 2, prerequisites: ['sch_2'], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.10, condition: 'multi_tree' }, icon: '🔗' },
  { id: 'sch_5', name: 'Expertise', description: 'Max mastery in a topic: +35% damage on that topic', specialization: 'SCHOLAR', tier: 3, cost: 3, prerequisites: ['sch_3', 'sch_4'], effect: { type: 'DAMAGE_BOOST_TOPIC', value: 0.35, condition: 'max_mastery' }, icon: '🎓' },
  { id: 'sch_6', name: 'Omniscient', description: 'All topic mastery caps raised. +20% damage, +20% hint effectiveness', specialization: 'SCHOLAR', tier: 4, cost: 5, prerequisites: ['sch_5'], effect: { type: 'HINT_EFFECTIVENESS', value: 0.20 }, icon: '🔮' },
];

// ========================================
// HELPERS
// ========================================

export const getSkillTreeV2 = (spec: SpecializationId): SkillNode[] =>
  SKILL_NODES_V2.filter(n => n.specialization === spec);

export const canUnlockSkillV2 = (skillId: string, unlockedSkills: string[]): boolean => {
  const skill = SKILL_NODES_V2.find(n => n.id === skillId);
  if (!skill) return false;
  return skill.prerequisites.every(prereq => unlockedSkills.includes(prereq));
};

export const getUnlockedSkillsForSpec = (unlockedSkills: string[], spec: SpecializationId): SkillNode[] => {
  const tree = getSkillTreeV2(spec);
  return tree.filter(n => unlockedSkills.includes(n.id));
};

export const getSpecSkillPointsSpent = (unlockedSkills: string[], spec: SpecializationId): number => {
  const tree = getSkillTreeV2(spec);
  return tree
    .filter(n => unlockedSkills.includes(n.id))
    .reduce((sum, n) => sum + n.cost, 0);
};

// ========================================
// TRIAL BOSSES (for specialization unlock)
// ========================================

export const TRIAL_BOSSES: TrialBoss[] = [
  {
    id: 'trial_juggernaut',
    specializationId: 'JUGGERNAUT',
    name: 'The Proving Grounds — Endurance Trial',
    description: 'Survive 10 questions with above 50% HP to prove your resilience.',
    maxHp: 100,
    questions: [], // Populated at runtime from class question bank
    damagePerCorrect: 10,
    modifiers: [],
    phases: [{ name: 'Trial', hpThreshold: 100, dialogue: 'Show me your endurance.', abilityChance: 0, modifiers: [] }],
    requiredToPass: { minAccuracy: 0.70, minQuestionsCorrect: 7, mustSurvive: true },
  },
  {
    id: 'trial_berserker',
    specializationId: 'BERSERKER',
    name: 'The Proving Grounds — Fury Trial',
    description: 'Deal maximum damage while your HP is below 40%. Risk is reward.',
    maxHp: 80,
    questions: [],
    damagePerCorrect: 15,
    modifiers: [{ type: 'SELF_DAMAGE_ON_WRONG', value: 5 }],
    phases: [{ name: 'Trial', hpThreshold: 100, dialogue: 'Embrace the edge.', abilityChance: 0, modifiers: [] }],
    requiredToPass: { minAccuracy: 0.65, minQuestionsCorrect: 6, mustSurvive: true },
  },
  {
    id: 'trial_sniper',
    specializationId: 'SNIPER',
    name: 'The Proving Grounds — Precision Trial',
    description: 'Maintain a streak of 4+ correct answers. Precision is power.',
    maxHp: 80,
    questions: [],
    damagePerCorrect: 12,
    modifiers: [],
    phases: [{ name: 'Trial', hpThreshold: 100, dialogue: 'Do not miss.', abilityChance: 0, modifiers: [] }],
    requiredToPass: { minAccuracy: 0.80, minQuestionsCorrect: 8, mustSurvive: true },
  },
  {
    id: 'trial_speedster',
    specializationId: 'SPEEDSTER',
    name: 'The Proving Grounds — Speed Trial',
    description: 'Answer 70% of questions in under 50% of the time limit.',
    maxHp: 70,
    questions: [],
    damagePerCorrect: 10,
    modifiers: [],
    phases: [{ name: 'Trial', hpThreshold: 100, dialogue: 'Faster. Faster.', abilityChance: 0, modifiers: [] }],
    requiredToPass: { minAccuracy: 0.70, minQuestionsCorrect: 7, mustSurvive: true },
  },
  {
    id: 'trial_guardian',
    specializationId: 'GUARDIAN',
    name: 'The Proving Grounds — Protection Trial',
    description: 'Take hits and survive. Your resilience protects others.',
    maxHp: 120,
    questions: [],
    damagePerCorrect: 8,
    modifiers: [{ type: 'INCREASED_DAMAGE_TAKEN', value: 1.2 }],
    phases: [{ name: 'Trial', hpThreshold: 100, dialogue: 'Stand firm.', abilityChance: 0, modifiers: [] }],
    requiredToPass: { minAccuracy: 0.65, minQuestionsCorrect: 6, mustSurvive: true },
  },
  {
    id: 'trial_cleric',
    specializationId: 'CLERIC',
    name: 'The Proving Grounds — Restoration Trial',
    description: 'Heal yourself back from the brink. Recovery is strength.',
    maxHp: 90,
    questions: [],
    damagePerCorrect: 8,
    modifiers: [{ type: 'SELF_HEAL_ON_CORRECT', value: 3 }],
    phases: [{ name: 'Trial', hpThreshold: 100, dialogue: 'Rise again.', abilityChance: 0, modifiers: [] }],
    requiredToPass: { minAccuracy: 0.70, minQuestionsCorrect: 7, mustSurvive: true },
  },
  {
    id: 'trial_tactician',
    specializationId: 'TACTICIAN',
    name: 'The Proving Grounds — Strategy Trial',
    description: 'Use hints effectively and maintain accuracy above 75%.',
    maxHp: 80,
    questions: [],
    damagePerCorrect: 10,
    modifiers: [],
    phases: [{ name: 'Trial', hpThreshold: 100, dialogue: 'Outthink me.', abilityChance: 0, modifiers: [] }],
    requiredToPass: { minAccuracy: 0.75, minQuestionsCorrect: 7, mustSurvive: true },
  },
  {
    id: 'trial_scholar',
    specializationId: 'SCHOLAR',
    name: 'The Proving Grounds — Knowledge Trial',
    description: 'Demonstrate mastery across multiple topics. Breadth is depth.',
    maxHp: 80,
    questions: [],
    damagePerCorrect: 10,
    modifiers: [],
    phases: [{ name: 'Trial', hpThreshold: 100, dialogue: 'Knowledge is power.', abilityChance: 0, modifiers: [] }],
    requiredToPass: { minAccuracy: 0.80, minQuestionsCorrect: 8, mustSurvive: true },
  },
];

export const getTrialBossForSpec = (specId: SpecializationId): TrialBoss | undefined =>
  TRIAL_BOSSES.find(t => t.specializationId === specId);

// ========================================
// SYNERGIES (cross-spec bonuses)
// ========================================

export interface SpecSynergy {
  specs: [SpecializationId, SpecializationId];
  label: string;
  bonus: string;
  color: string;
}

export const SPEC_SYNERGIES: SpecSynergy[] = [
  { specs: ['JUGGERNAUT', 'GUARDIAN'], label: 'Iron Wall', bonus: '+15% party armor', color: 'text-blue-600 dark:text-blue-400' },
  { specs: ['BERSERKER', 'SNIPER'], label: 'Glass Cannon', bonus: '+20% damage, -10% max HP', color: 'text-red-600 dark:text-red-400' },
  { specs: ['SNIPER', 'SPEEDSTER'], label: 'Hit & Run', bonus: '+15% fast-answer damage', color: 'text-cyan-600 dark:text-cyan-400' },
  { specs: ['CLERIC', 'GUARDIAN'], label: 'Bastion', bonus: '+20% healing received', color: 'text-emerald-600 dark:text-emerald-400' },
  { specs: ['TACTICIAN', 'SCHOLAR'], label: 'Grand Strategy', bonus: '+15% hint effectiveness, +10% phase damage', color: 'text-purple-600 dark:text-purple-400' },
  { specs: ['JUGGERNAUT', 'BERSERKER'], label: 'Unstoppable Rage', bonus: '+10% damage, +10% armor', color: 'text-orange-600 dark:text-orange-400' },
  { specs: ['SPEEDSTER', 'CLERIC'], label: 'Battle Medic', bonus: 'Fast answers heal +5 HP to lowest ally', color: 'text-pink-600 dark:text-pink-400' },
  { specs: ['SNIPER', 'TACTICIAN'], label: 'Calculated Strike', bonus: 'Streak >= 5: all party +10% damage', color: 'text-indigo-600 dark:text-indigo-400' },
];

// Build synergy lookup map
const SYNERGY_MAP_V2 = new Map<string, SpecSynergy>();
for (const def of SPEC_SYNERGIES) {
  const [a, b] = def.specs;
  SYNERGY_MAP_V2.set(`${a}×${b}`, def);
}

export function getSynergyKeyV2(a: SpecializationId, b: SpecializationId): string {
  const order: SpecializationId[] = ['JUGGERNAUT', 'BERSERKER', 'SNIPER', 'SPEEDSTER', 'GUARDIAN', 'CLERIC', 'TACTICIAN', 'SCHOLAR'];
  return order.indexOf(a) < order.indexOf(b) ? `${a}×${b}` : `${b}×${a}`;
}

export function getActiveSynergiesV2(unlockedSkills: string[]): SpecSynergy[] {
  const allSpecs: SpecializationId[] = ['JUGGERNAUT', 'BERSERKER', 'SNIPER', 'SPEEDSTER', 'GUARDIAN', 'CLERIC', 'TACTICIAN', 'SCHOLAR'];
  const activeSpecs = allSpecs.filter(spec =>
    SKILL_NODES_V2.some(n => n.specialization === spec && unlockedSkills.includes(n.id))
  );
  if (activeSpecs.length < 2) return [];
  const synergies: SpecSynergy[] = [];
  for (let i = 0; i < activeSpecs.length; i++) {
    for (let j = i + 1; j < activeSpecs.length; j++) {
      const key = getSynergyKeyV2(activeSpecs[i], activeSpecs[j]);
      const def = SYNERGY_MAP_V2.get(key);
      if (def) synergies.push(def);
    }
  }
  return synergies;
}

export function specIsInSynergyV2(spec: SpecializationId, activeSynergies: SpecSynergy[]): boolean {
  return activeSynergies.some(s => s.specs.includes(spec));
}

// ========================================
// SPEC COLORS (for UI theming)
// ========================================

export const SPEC_COLORS_V2: Record<SpecializationId, { gradient: string; text: string; bg: string; ring: string; hex: string }> = {
  JUGGERNAUT:  { gradient: 'from-red-500 to-orange-600',      text: 'text-red-600 dark:text-red-400',       bg: 'bg-red-500/10',       ring: 'ring-red-400/60',      hex: '#ef4444' },
  BERSERKER:   { gradient: 'from-orange-500 to-red-600',      text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10',    ring: 'ring-orange-400/60',   hex: '#f97316' },
  SNIPER:      { gradient: 'from-green-500 to-emerald-600',   text: 'text-green-600 dark:text-green-400',   bg: 'bg-green-500/10',     ring: 'ring-green-400/60',    hex: '#22c55e' },
  SPEEDSTER:   { gradient: 'from-cyan-500 to-blue-600',       text: 'text-cyan-600 dark:text-cyan-400',     bg: 'bg-cyan-500/10',      ring: 'ring-cyan-400/60',     hex: '#06b6d4' },
  GUARDIAN:    { gradient: 'from-blue-500 to-indigo-600',     text: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-500/10',      ring: 'ring-blue-400/60',     hex: '#3b82f6' },
  CLERIC:      { gradient: 'from-emerald-500 to-green-600',   text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-400/60',   hex: '#10b981' },
  TACTICIAN:   { gradient: 'from-purple-500 to-violet-600',   text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10',    ring: 'ring-purple-400/60',   hex: '#a855f7' },
  SCHOLAR:     { gradient: 'from-indigo-500 to-purple-600',   text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10',    ring: 'ring-indigo-400/60',   hex: '#6366f1' },
};

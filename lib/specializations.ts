
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
  JUGGERNAUT:  { name: 'Juggernaut',  description: 'Endurance forged through challenge', color: 'red',    icon: '🛡️' },
  BERSERKER:   { name: 'Berserker',   description: 'Courage shaped by risk',             color: 'orange', icon: '⚔️' },
  SNIPER:      { name: 'Sniper',      description: 'Focus sharpened through practice',   color: 'green',  icon: '🎯' },
  SPEEDSTER:   { name: 'Speedster',   description: 'Curiosity in swift motion',          color: 'cyan',   icon: '⚡' },
  GUARDIAN:    { name: 'Guardian',    description: 'Steadfast care and resolve',         color: 'blue',   icon: '🛡️' },
  CLERIC:      { name: 'Cleric',      description: 'Renewal through compassion',         color: 'emerald',icon: '✨' },
  TACTICIAN:   { name: 'Tactician',   description: 'Insight developed through strategy', color: 'purple', icon: '🧠' },
  SCHOLAR:     { name: 'Scholar',     description: 'Knowledge gathered through study',   color: 'indigo', icon: '📚' },
};

export const SKILL_NODES_V2: SkillNode[] = [
  { id: 'jug_1', name: 'Iron Skin', description: 'Hardened through repetition.', specialization: 'JUGGERNAUT', tier: 1, cost: 1, prerequisites: [], icon: '🛡️' },
  { id: 'jug_2', name: 'Heavy Strikes', description: 'Resolve sharpened by adversity.', specialization: 'JUGGERNAUT', tier: 1, cost: 1, prerequisites: [], icon: '👊' },
  { id: 'jug_3', name: 'Thick Hide', description: 'Momentum born from persistence.', specialization: 'JUGGERNAUT', tier: 2, cost: 2, prerequisites: ['jug_1'], icon: '🐻' },
  { id: 'jug_4', name: 'Momentum', description: 'A will that refuses to yield.', specialization: 'JUGGERNAUT', tier: 2, cost: 2, prerequisites: ['jug_2'], icon: '📈' },
  { id: 'jug_5', name: 'Unstoppable', description: 'Presence forged through endurance.', specialization: 'JUGGERNAUT', tier: 3, cost: 3, prerequisites: ['jug_3', 'jug_4'], icon: '🔥' },
  { id: 'jug_6', name: 'Colossus', description: 'The underworld answers a steadfast call.', specialization: 'JUGGERNAUT', tier: 4, cost: 5, prerequisites: ['jug_5'], icon: '🏔️' },
  { id: 'ber_1', name: 'Bloodlust', description: 'Energy kindled by a steady rhythm.', specialization: 'BERSERKER', tier: 1, cost: 1, prerequisites: [], icon: '🩸' },
  { id: 'ber_2', name: 'Reckless Assault', description: 'A rhythm that refuses to break.', specialization: 'BERSERKER', tier: 1, cost: 1, prerequisites: [], icon: '💀' },
  { id: 'ber_3', name: 'Crimson Rage', description: 'Intensity sustained through practice.', specialization: 'BERSERKER', tier: 2, cost: 2, prerequisites: ['ber_1'], icon: '😤' },
  { id: 'ber_4', name: 'Adrenaline Surge', description: 'Confidence carried from one challenge to the next.', specialization: 'BERSERKER', tier: 2, cost: 2, prerequisites: ['ber_2'], icon: '⚡' },
  { id: 'ber_5', name: 'Execute', description: 'Focus burning at its brightest.', specialization: 'BERSERKER', tier: 3, cost: 3, prerequisites: ['ber_3', 'ber_4'], icon: '☠️' },
  { id: 'ber_6', name: 'Rampage', description: 'The spirit of competition unleashed.', specialization: 'BERSERKER', tier: 4, cost: 5, prerequisites: ['ber_5'], icon: '🐺' },
  { id: 'sni_1', name: 'Steady Aim', description: 'Attention narrowed to a single point.', specialization: 'SNIPER', tier: 1, cost: 1, prerequisites: [], icon: '🎯' },
  { id: 'sni_2', name: 'Quick Draw', description: 'Precision shaped by deliberate practice.', specialization: 'SNIPER', tier: 1, cost: 1, prerequisites: [], icon: '⏱️' },
  { id: 'sni_3', name: 'Focus Fire', description: 'A wider view refined into clear focus.', specialization: 'SNIPER', tier: 2, cost: 2, prerequisites: ['sni_1'], icon: '🔥' },
  { id: 'sni_4', name: 'Headshot', description: 'Patterns revealed through careful observation.', specialization: 'SNIPER', tier: 2, cost: 2, prerequisites: ['sni_2'], icon: '🧠' },
  { id: 'sni_5', name: 'Perfect Shot', description: 'Preparation meeting the decisive moment.', specialization: 'SNIPER', tier: 3, cost: 3, prerequisites: ['sni_3', 'sni_4'], icon: '💎' },
  { id: 'sni_6', name: 'One Shot', description: 'Quiet precision beneath a silver sky.', specialization: 'SNIPER', tier: 4, cost: 5, prerequisites: ['sni_5'], icon: '🔫' },
  { id: 'spd_1', name: 'Nimble', description: 'Decisiveness practiced with care.', specialization: 'SPEEDSTER', tier: 1, cost: 1, prerequisites: [], icon: '🌪️' },
  { id: 'spd_2', name: 'Rapid Fire', description: 'Fluency built one response at a time.', specialization: 'SPEEDSTER', tier: 1, cost: 1, prerequisites: [], icon: '🔫' },
  { id: 'spd_3', name: 'Blur', description: 'Familiar ideas rising quickly to mind.', specialization: 'SPEEDSTER', tier: 2, cost: 2, prerequisites: ['spd_1'], icon: '💨' },
  { id: 'spd_4', name: 'Haste', description: 'A steady mind inside a fleeting moment.', specialization: 'SPEEDSTER', tier: 2, cost: 2, prerequisites: ['spd_2'], icon: '⚡' },
  { id: 'spd_5', name: 'Phase Shift', description: 'Knowledge carried forward with momentum.', specialization: 'SPEEDSTER', tier: 3, cost: 3, prerequisites: ['spd_3', 'spd_4'], icon: '👻' },
  { id: 'spd_6', name: 'Time Warp', description: 'A swift step along the path of discovery.', specialization: 'SPEEDSTER', tier: 4, cost: 5, prerequisites: ['spd_5'], icon: '⏳' },
  { id: 'grd_1', name: 'Aegis', description: 'Care extended to every attempt.', specialization: 'GUARDIAN', tier: 1, cost: 1, prerequisites: [], icon: '🛡️' },
  { id: 'grd_2', name: 'Taunt', description: 'Reassurance found in steady progress.', specialization: 'GUARDIAN', tier: 1, cost: 1, prerequisites: [], icon: '📢' },
  { id: 'grd_3', name: 'Bulwark', description: 'Resilience built on patient practice.', specialization: 'GUARDIAN', tier: 2, cost: 2, prerequisites: ['grd_1'], icon: '🏰' },
  { id: 'grd_4', name: 'Rescue', description: 'A calm foundation for new challenges.', specialization: 'GUARDIAN', tier: 2, cost: 2, prerequisites: ['grd_2'], icon: '🚁' },
  { id: 'grd_5', name: 'Fortress', description: 'Steadfastness renewed through effort.', specialization: 'GUARDIAN', tier: 3, cost: 3, prerequisites: ['grd_3', 'grd_4'], icon: '🏔️' },
  { id: 'grd_6', name: 'Immortal', description: 'A welcoming flame that endures.', specialization: 'GUARDIAN', tier: 4, cost: 5, prerequisites: ['grd_5'], icon: '💀' },
  { id: 'clr_1', name: 'First Aid', description: 'Gentle attention to each step forward.', specialization: 'CLERIC', tier: 1, cost: 1, prerequisites: [], icon: '💊' },
  { id: 'clr_2', name: 'Inspiration', description: 'A fresh beginning after every challenge.', specialization: 'CLERIC', tier: 1, cost: 1, prerequisites: [], icon: '✨' },
  { id: 'clr_3', name: 'Renewal', description: 'Encouragement woven into the journey.', specialization: 'CLERIC', tier: 2, cost: 2, prerequisites: ['clr_1'], icon: '🌿' },
  { id: 'clr_4', name: 'Blessing', description: 'Composure cultivated through kindness.', specialization: 'CLERIC', tier: 2, cost: 2, prerequisites: ['clr_2'], icon: '🙏' },
  { id: 'clr_5', name: 'Sanctuary', description: 'Hope sustained by persistent effort.', specialization: 'CLERIC', tier: 3, cost: 3, prerequisites: ['clr_3', 'clr_4'], icon: '⛪' },
  { id: 'clr_6', name: 'Divine Intervention', description: 'Compassion at the heart of growth.', specialization: 'CLERIC', tier: 4, cost: 5, prerequisites: ['clr_5'], icon: '👼' },
  { id: 'tac_1', name: 'Scan Weakness', description: 'A thoughtful approach to every challenge.', specialization: 'TACTICIAN', tier: 1, cost: 1, prerequisites: [], icon: '🔍' },
  { id: 'tac_2', name: 'Prepared Mind', description: 'Ideas arranged with purpose.', specialization: 'TACTICIAN', tier: 1, cost: 1, prerequisites: [], icon: '📖' },
  { id: 'tac_3', name: 'Exploit', description: 'A fresh angle on a familiar problem.', specialization: 'TACTICIAN', tier: 2, cost: 2, prerequisites: ['tac_1'], icon: '💥' },
  { id: 'tac_4', name: 'Cooldown Reduction', description: 'Strategy strengthened through rehearsal.', specialization: 'TACTICIAN', tier: 2, cost: 2, prerequisites: ['tac_2'], icon: '⏱️' },
  { id: 'tac_5', name: 'Vulnerability Scan', description: 'Small choices joined into a larger vision.', specialization: 'TACTICIAN', tier: 3, cost: 3, prerequisites: ['tac_3', 'tac_4'], icon: '📡' },
  { id: 'tac_6', name: 'Checkmate', description: 'Insight earned through careful study.', specialization: 'TACTICIAN', tier: 4, cost: 5, prerequisites: ['tac_5'], icon: '♟️' },
  { id: 'sch_1', name: 'Deep Study', description: 'Curiosity given a regular place to grow.', specialization: 'SCHOLAR', tier: 1, cost: 1, prerequisites: [], icon: '📚' },
  { id: 'sch_2', name: 'Applied Knowledge', description: 'New ideas gathered with every page.', specialization: 'SCHOLAR', tier: 1, cost: 1, prerequisites: [], icon: '🧠' },
  { id: 'sch_3', name: 'Mastery Surge', description: 'Understanding layered through exploration.', specialization: 'SCHOLAR', tier: 2, cost: 2, prerequisites: ['sch_1'], icon: '📈' },
  { id: 'sch_4', name: 'Cross-Domain', description: 'Lessons connected across many subjects.', specialization: 'SCHOLAR', tier: 2, cost: 2, prerequisites: ['sch_2'], icon: '🔗' },
  { id: 'sch_5', name: 'Expertise', description: 'A broader view shaped by learning.', specialization: 'SCHOLAR', tier: 3, cost: 3, prerequisites: ['sch_3', 'sch_4'], icon: '🎓' },
  { id: 'sch_6', name: 'Omniscient', description: 'Knowledge shining through careful study.', specialization: 'SCHOLAR', tier: 4, cost: 5, prerequisites: ['sch_5'], icon: '🔮' },
];


export const SKILL_NODE_IDS: Record<SpecializationId, string[]> = {
  JUGGERNAUT: SKILL_NODES_V2.filter(node => node.specialization === 'JUGGERNAUT').map(node => node.id),
  BERSERKER: SKILL_NODES_V2.filter(node => node.specialization === 'BERSERKER').map(node => node.id),
  SNIPER: SKILL_NODES_V2.filter(node => node.specialization === 'SNIPER').map(node => node.id),
  SPEEDSTER: SKILL_NODES_V2.filter(node => node.specialization === 'SPEEDSTER').map(node => node.id),
  GUARDIAN: SKILL_NODES_V2.filter(node => node.specialization === 'GUARDIAN').map(node => node.id),
  CLERIC: SKILL_NODES_V2.filter(node => node.specialization === 'CLERIC').map(node => node.id),
  TACTICIAN: SKILL_NODES_V2.filter(node => node.specialization === 'TACTICIAN').map(node => node.id),
  SCHOLAR: SKILL_NODES_V2.filter(node => node.specialization === 'SCHOLAR').map(node => node.id),
};

/** Mirrors computeSkillRank in functions/src/boss-combat.ts without importing server code. */
export function getSkillRank(unlockedSkills: unknown, spec: SpecializationId): number {
  if (!Array.isArray(unlockedSkills) || !SKILL_NODE_IDS[spec]) return 0;
  const validIds = new Set(SKILL_NODE_IDS[spec]);
  const distinctUnlocked = new Set(unlockedSkills);
  let rank = 0;
  distinctUnlocked.forEach(id => {
    if (typeof id === 'string' && validIds.has(id)) rank += 1;
  });
  return Math.min(rank, 6);
}

/** The per-rank values displayed by the skill panel, mirrored from the combat engine. */
export function getSkillIdentityEffect(spec: SpecializationId, rank: number): number {
  const clampedRank = Math.max(0, Math.min(6, Math.trunc(rank)));
  const identity = SPECIALIZATION_IDENTITY[spec];
  if (identity.kind === 'HEAL') return Math.round(4 * clampedRank / 6);
  return Math.round((1 + (identity.rank6Max - 1) * clampedRank / 6) * 100) / 100;
}

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
// SERVER-MIRRORED RANK METADATA (display only)
// ========================================

export interface SpecializationIdentity {
  rank6Max: number;
  kind: 'DAMAGE' | 'HEAL';
  triggerKey: string;
}

/** Display metadata only. Values mirror the authoritative combat identities. */
export const SPECIALIZATION_IDENTITY: Record<SpecializationId, SpecializationIdentity> = {
  JUGGERNAUT: { rank6Max: 1.18, kind: 'DAMAGE', triggerKey: 'skill.identity.JUGGERNAUT.desc' },
  BERSERKER: { rank6Max: 1.24, kind: 'DAMAGE', triggerKey: 'skill.identity.BERSERKER.desc' },
  SNIPER: { rank6Max: 1.24, kind: 'DAMAGE', triggerKey: 'skill.identity.SNIPER.desc' },
  SPEEDSTER: { rank6Max: 1.24, kind: 'DAMAGE', triggerKey: 'skill.identity.SPEEDSTER.desc' },
  GUARDIAN: { rank6Max: 4, kind: 'HEAL', triggerKey: 'skill.identity.GUARDIAN.desc' },
  CLERIC: { rank6Max: 4, kind: 'HEAL', triggerKey: 'skill.identity.CLERIC.desc' },
  TACTICIAN: { rank6Max: 1.24, kind: 'DAMAGE', triggerKey: 'skill.identity.TACTICIAN.desc' },
  SCHOLAR: { rank6Max: 1.24, kind: 'DAMAGE', triggerKey: 'skill.identity.SCHOLAR.desc' },
};

/**
 * Player-facing summary of each identity's shape, used by the spec picker so a
 * student can choose or respec with actual information rather than a name.
 * Purely descriptive strings; the numbers live in SPECIALIZATION_IDENTITY.
 */
export interface SpecProfile {
  /** When this identity pays out. */
  trigger: string;
  /** Where it is strong. */
  strength: string;
  /** Where it is weak, stated plainly. */
  weakness: string;
  /** How hard it is to play. */
  difficulty: 'Easy' | 'Moderate' | 'Demanding';
}

export const SPEC_PROFILES: Record<SpecializationId, SpecProfile> = {
  JUGGERNAUT: {
    trigger: 'Correct answers while your health is low',
    strength: 'Gets stronger the closer you are to being knocked out, so a bad start does not cost you the fight',
    weakness: 'At full health it does nothing at all. You must take damage before it pays',
    difficulty: 'Easy',
  },
  BERSERKER: {
    trigger: 'Correct answers while the boss is below half health',
    strength: 'The strongest finisher. Ends fights quickly once the boss is worn down',
    weakness: 'Zero help in the first half of the fight, which is where most knockouts happen',
    difficulty: 'Moderate',
  },
  SNIPER: {
    trigger: 'Your first correct answer against an untouched boss',
    strength: 'One big opener hit that can knock a chunk off the bar immediately',
    weakness: 'A single use per boss. Miss the opener and it is wasted',
    difficulty: 'Moderate',
  },
  SPEEDSTER: {
    trigger: 'Each correct answer in a row',
    strength: 'Rewards steady accuracy. Builds to the largest bonus of any identity at a 5 streak',
    weakness: 'Any wrong answer resets it to zero',
    difficulty: 'Demanding',
  },
  GUARDIAN: {
    trigger: 'Correct answers while at full health',
    strength: 'Shields you against the next mistake, adding tolerance to your miss budget',
    weakness: 'Only triggers at full health, so it goes quiet exactly when you are in danger',
    difficulty: 'Easy',
  },
  CLERIC: {
    trigger: 'A correct answer after a wrong one, while hurt',
    strength: 'Recovers health mid-fight, directly extending how many mistakes you can survive',
    weakness: 'Needs you to be both hurt and recovering. A clean run never uses it',
    difficulty: 'Moderate',
  },
  TACTICIAN: {
    trigger: 'Correct answers on revision questions',
    strength: 'Pays you for re-solving questions you previously missed, which is where learning happens',
    weakness: 'Only fires during revision. A short attempt may never trigger it',
    difficulty: 'Moderate',
  },
  SCHOLAR: {
    trigger: 'Correct answers on the hardest questions available',
    strength: 'The largest flat bonus on the questions that matter most academically',
    weakness: 'Nothing on easy or medium questions, which is most of a typical attempt',
    difficulty: 'Demanding',
  },
};

// ========================================
// SYNERGIES (legacy display metadata; not mechanical rank bonuses)
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

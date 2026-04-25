
import { PlayerRole, SpecializationId, SkillNode, BossModifier, BossModifierType } from '../types';

export interface BuildSnapshot {
  role: PlayerRole;
  specialization?: SpecializationId;
  gearScore: number;
  level: number;
  stats: { tech: number; focus: number; analysis: number; charisma: number };
  unlockedSkills: string[];
  bossMaxHp?: number;
  currentHpPercent?: number; // For Berserker/Juggernaut low-HP bonuses
}

export interface DamageContext {
  studentLevel: number;
  questionDifficulty: number;
  topicMastery: number;
  studentBuild: BuildSnapshot;
  isCorrect: boolean;
  timeTakenMs: number;
  maxTimeMs: number;
  streak: number;
  modifiers?: BossModifier[];
}

function hasMod(mods: BossModifier[] | undefined, type: BossModifierType): boolean {
  return !!mods?.some((m) => m.type === type);
}

function modVal(mods: BossModifier[] | undefined, type: BossModifierType, fallback = 0): number {
  const m = mods?.find((m) => m.type === type);
  return m?.value ?? fallback;
}

/**
 * Pokemon-style damage formula adapted for quiz-based boss battles.
 * Topic mastery (horizontal progression) dominates over level (vertical progression).
 */
export function calculateQuestionDamage(ctx: DamageContext): number {
  if (!ctx.isCorrect) return 0;

  const { studentLevel, questionDifficulty, topicMastery, studentBuild, timeTakenMs, maxTimeMs, streak, modifiers } = ctx;

  // Base: small level component (diminishing returns)
  const levelComponent = (2 * studentLevel / 5 + 2);

  // Power: question difficulty
  const power = 10 + questionDifficulty * 5;

  // Attack: topic mastery DOMINATES (horizontal progression)
  const attack = 50 + topicMastery * 100;

  // Defense: question's effective defense
  const defense = 50 + questionDifficulty * 10;

  // Base damage calculation (Pokemon-style)
  let damage = ((levelComponent * power * attack / defense) / 50 + 2);

  // Modifier stack
  let modifier = 1.0;

  // Topic mastery bonus (STAB equivalent)
  if (topicMastery > 0) {
    modifier *= (1 + 0.1 * topicMastery);
  }

  // Speed bonus: fast correct answers
  if (timeTakenMs < maxTimeMs * 0.5) {
    modifier *= 1.2;
  }

  // Critical hit: consecutive correct answers
  if (streak >= 3) {
    modifier *= (1 + 0.1 * Math.min(streak, 10));
  }

  // Role bonuses
  if (studentBuild.role === 'VANGUARD') modifier *= 1.15;
  if (studentBuild.role === 'STRIKER') modifier *= 1.05;

  // Specialization bonuses (all 8 specs)
  const spec = studentBuild.specialization;
  const hpPercent = studentBuild.currentHpPercent ?? 100;
  if (spec === 'JUGGERNAUT') {
    if (hpPercent > 75) modifier *= 1.08; // Heavy Strikes
    if (hpPercent < 30) modifier *= 1.15; // Unstoppable
  }
  if (spec === 'BERSERKER') {
    if (hpPercent < 50) modifier *= 1.12; // Bloodlust
    if (hpPercent < 40) modifier *= 1.20; // Crimson Rage
    if (hpPercent < 25) modifier *= 1.35; // Rampage
  }
  if (spec === 'SNIPER') {
    if (streak >= 3) modifier *= 1.15;  // Steady Aim
    if (streak >= 5) modifier *= 1.25;  // Focus Fire
    if (streak >= 7) modifier *= 1.30;  // Perfect Shot
    if (questionDifficulty >= 3) modifier *= 1.15; // Hard question bonus
  }
  if (spec === 'SPEEDSTER') {
    if (timeTakenMs < maxTimeMs * 0.5) modifier *= 1.15; // Haste
  }
  if (spec === 'GUARDIAN') {
    modifier *= 1.05; // Aegis aura
  }
  if (spec === 'CLERIC') {
    // Healing applied separately, small damage bonus
    modifier *= 1.03;
  }
  if (spec === 'TACTICIAN') {
    // Phase transition bonus applied by caller
    modifier *= 1.05; // Scan Weakness baseline
  }
  if (spec === 'SCHOLAR') {
    if (topicMastery >= 0.6) modifier *= 1.15; // Applied Knowledge
    if (topicMastery >= 0.8) modifier *= 1.25; // Mastery Surge
  }

  // Gear bonus: small, with diminishing returns
  const gearBonus = 1 + (studentBuild.gearScore / 1000) / (1 + studentBuild.gearScore / 2000);
  modifier *= gearBonus;

  // Boss modifiers
  const mods = modifiers || [];
  if (hasMod(mods, 'PLAYER_DAMAGE_BOOST')) {
    damage += modVal(mods, 'PLAYER_DAMAGE_BOOST', 25);
  }

  let stackingBonus = 0;
  if (hasMod(mods, 'DOUBLE_OR_NOTHING')) stackingBonus += 1.0;
  else if (hasMod(mods, 'GLASS_CANNON')) stackingBonus += 1.0;
  if (hasMod(mods, 'LAST_STAND')) {
    // Applied by caller based on HP context
  }
  if (stackingBonus > 0) damage = Math.round(damage * (1 + stackingBonus));

  if (hasMod(mods, 'STREAK_BONUS') && streak > 1) {
    damage += modVal(mods, 'STREAK_BONUS', 10) * (streak - 1);
  }

  // Random variance
  modifier *= (0.9 + Math.random() * 0.2);

  damage = Math.round(damage * modifier);

  // Per-hit cap: 5% of boss max HP (prevents one-shotting, but big numbers still feel big)
  const perHitCap = Math.floor((studentBuild.bossMaxHp || 1000) * 0.05);
  damage = Math.min(damage, perHitCap);

  return Math.max(1, damage);
}

/**
 * Calculate boss retaliation damage when student answers incorrectly.
 */
export function calculateBossRetaliation(
  questionDifficulty: 'EASY' | 'MEDIUM' | 'HARD',
  armorPercent: number,
  modifiers?: BossModifier[],
  enrageMultiplier = 1,
): { playerDamage: number; damageBlocked: number } {
  let baseBossDamage = questionDifficulty === 'HARD' ? 30 : questionDifficulty === 'MEDIUM' ? 20 : 15;

  if (hasMod(modifiers, 'BOSS_DAMAGE_BOOST')) {
    baseBossDamage += modVal(modifiers, 'BOSS_DAMAGE_BOOST', 15);
  }
  if (hasMod(modifiers, 'DOUBLE_OR_NOTHING')) {
    baseBossDamage *= 2;
  }

  baseBossDamage = Math.round(baseBossDamage * enrageMultiplier);

  const rawDamage = baseBossDamage;
  const effectiveArmor = hasMod(modifiers, 'ARMOR_BREAK') || hasMod(modifiers, 'GLASS_CANNON')
    ? 0
    : armorPercent;

  const playerDamage = Math.max(1, Math.round(rawDamage * (1 - effectiveArmor / 100)));
  const damageBlocked = rawDamage - playerDamage;

  return { playerDamage, damageBlocked };
}

/**
 * Compute effective stats from base + gear + skill tree + specialization.
 */
export function deriveEffectiveStats(
  baseStats: { tech: number; focus: number; analysis: number; charisma: number },
  equipped: Record<string, { stats?: Record<string, number> } | null | undefined>,
  unlockedSkills: SkillNode[],
): { tech: number; focus: number; analysis: number; charisma: number; critChance: number; critMultiplier: number; armorPercent: number; maxHp: number } {
  const stats = { ...baseStats };

  // Apply gear stats
  Object.values(equipped).forEach((item) => {
    if (item?.stats) {
      Object.entries(item.stats).forEach(([key, val]) => {
        if (key in stats) {
          (stats as Record<string, number>)[key] += val as number;
        }
      });
    }
  });

  // Apply skill tree effects
  for (const skill of unlockedSkills) {
    if (skill.effect.type === 'STAT_BOOST' && skill.effect.stat) {
      (stats as Record<string, number>)[skill.effect.stat] += skill.effect.value;
    }
  }

  // Derive combat stats
  const critChance = Math.min(0.40, stats.focus * 0.01); // 1% per focus, cap 40%
  const critMultiplier = 2.0 + Math.max(0, (stats.focus - 10) * 0.02); // Base 2x, +0.02 per focus over 10
  const armorPercent = Math.min(0.50, stats.analysis * 0.005); // 0.5% per analysis, cap 50%
  const maxHp = 100 + Math.max(0, (stats.charisma - 10) * 5); // Base 100, +5 per charisma over 10

  return {
    tech: stats.tech,
    focus: stats.focus,
    analysis: stats.analysis,
    charisma: stats.charisma,
    critChance,
    critMultiplier,
    armorPercent,
    maxHp,
  };
}

/**
 * Estimate topic mastery level from historical accuracy.
 */
export function estimateTopicMastery(accuracyHistory: number[]): number {
  if (accuracyHistory.length === 0) return 0;
  const recent = accuracyHistory.slice(-20);
  const accuracy = recent.reduce((a, b) => a + b, 0) / recent.length;
  // Map accuracy to mastery level 0-10
  return Math.min(10, Math.floor(accuracy * 10));
}

/**
 * Select next question difficulty based on recent accuracy.
 */
export function selectDifficultyBias(recentAccuracy: number): number {
  if (recentAccuracy > 0.80) return +2;
  if (recentAccuracy < 0.50) return -1;
  return 0;
}

// Pure, side-effect-free combat math for the async boss redesign.
// Standalone by design: must NOT import from lib/ or other functions modules,
// so it can be tested against compiled output in functions/__tests__.
// All formulas are final per temp/boss-increment1-plan.md — do not "improve".

export interface PlayerStats {
  tech: number;
  focus: number;
  analysis: number;
  charisma: number;
}

export const PLAYER_BASE_STATS: PlayerStats = {
  tech: 10,
  focus: 10,
  analysis: 10,
  charisma: 10,
};

export const EHP_BASELINE = 105.3;
export const BOSS_HP_BASE = 1400;
export const BOSS_HP_EXPONENT = 0.80;
export const HIT_CEILING_FRACTION = 0.45;
export const BOSS_ATTACK_BASE = 42;
export const BOSS_ATTACK_EXPONENT = 0.72;

export const DIFFICULTY_MOD: Record<'EASY' | 'MEDIUM' | 'HARD', number> = {
  EASY: 0.85,
  MEDIUM: 1.0,
  HARD: 1.2,
};

export type Difficulty = keyof typeof DIFFICULTY_MOD;

/** Mirrors lib/gamification.ts deriveCombatStats (standalone copy). */
export function deriveCombatStats(stats: PlayerStats): {
  maxHp: number;
  armorPercent: number;
  critChance: number;
  critMultiplier: number;
} {
  const maxHp = 100 + Math.max(0, stats.charisma - 10) * 5;
  const armorPercent = Math.min(stats.analysis * 0.5, 50);
  const critChance = Math.min(stats.focus * 0.01, 0.4);
  const critMultiplier = 2 + Math.max(0, stats.focus - 10) * 0.02;
  return { maxHp, armorPercent, critChance, critMultiplier };
}

/** Player Power Index. */
export function computePlayerPowerIndex(gearScore: number, stats: PlayerStats): number {
  const techBonus = 1 + Math.max(0, stats.tech - 10) * 0.03;
  return (1 + gearScore / 150) * techBonus;
}

/** Boss max HP for one student's instance. Rounded, minimum 1. */
export function computeBossMaxHp(gearScore: number, stats: PlayerStats): number {
  const ppi = computePlayerPowerIndex(gearScore, stats);
  return Math.max(1, Math.round(BOSS_HP_BASE * Math.pow(ppi, BOSS_HP_EXPONENT)));
}

/** Effective HP used for miss-budget normalization. */
export function computePlayerEhp(combat: { maxHp: number; armorPercent: number }): number {
  const armor = Math.min(Math.max(combat.armorPercent, 0), 50);
  const denom = 1 - armor / 100;
  // Defensive: armor is clamped to 0..50, so denom >= 0.5. Never divide by zero.
  if (denom <= 0) {
    throw new Error('boss-combat: armorPercent produced a non-positive EHP denominator');
  }
  return combat.maxHp / denom;
}

/** Raw boss attack before the player's armor is applied. */
export function computeBossRawAttack(playerEhp: number): number {
  return BOSS_ATTACK_BASE * Math.pow(playerEhp / EHP_BASELINE, BOSS_ATTACK_EXPONENT);
}

/** Flat streak multiplier. streak = consecutive correct answers BEFORE this one. */
export function computeStreakMultiplier(streak: number): number {
  const s = Math.max(0, streak);
  return Math.min(1 + s * 0.05, 1.25);
}

export interface HitInput {
  gearScore: number;
  stats: PlayerStats;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  streak: number;
  /** 0..1, supplied by caller for determinism. */
  rand: number;
  /** 0..1, supplied by caller for determinism. */
  critRoll: number;
  /** This student's boss instance max. */
  bossMaxHp: number;
}

export interface HitResult {
  damage: number;
  isCrit: boolean;
  /** What the raw formula produced, for telemetry/debugging. */
  preCeilingDamage: number;
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 0.9999999999);
}

/** Damage dealt to the boss on a CORRECT answer. */
export function computeCorrectHit(input: HitInput): HitResult {
  const ppi = computePlayerPowerIndex(input.gearScore, input.stats);
  const combat = deriveCombatStats(input.stats);
  const rand = clampUnit(input.rand);
  const critRoll = clampUnit(input.critRoll);
  const streakMultiplier = computeStreakMultiplier(input.streak);

  let preCeilingDamage = Math.round(
    100 * ppi * DIFFICULTY_MOD[input.difficulty] * (0.95 + 0.1 * rand) * streakMultiplier
  );

  const isCrit = critRoll < combat.critChance;
  if (isCrit) {
    preCeilingDamage = Math.round(preCeilingDamage * combat.critMultiplier);
  }

  const ceiling = Math.max(1, Math.floor(input.bossMaxHp * HIT_CEILING_FRACTION));
  const damage = Math.max(1, Math.min(preCeilingDamage, ceiling));

  return { damage, isCrit, preCeilingDamage };
}

export interface BossAttackInput {
  stats: PlayerStats;
  playerEhp: number;
}

export interface BossAttackResult {
  /** Number the UI should display as "boss attacks for X". */
  rawAttack: number;
  /** Armor absorption, displayed as "your armor absorbed Y". */
  absorbed: number;
  /** Actual HP lost. */
  damage: number;
}

/** Damage taken by the player on a WRONG answer. */
export function computeBossAttack(input: BossAttackInput): BossAttackResult {
  const combat = deriveCombatStats(input.stats);
  const armor = Math.min(Math.max(combat.armorPercent, 0), 50);
  const rawAttack = computeBossRawAttack(input.playerEhp);
  const damage = Math.max(1, Math.round(rawAttack * (1 - armor / 100)));
  const absorbed = Math.max(0, Math.round(rawAttack) - damage);
  return { rawAttack: Math.round(rawAttack), absorbed, damage };
}

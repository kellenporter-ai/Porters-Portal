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

// Skill identities (increment 3). Kept standalone like the rest of this module;
// node ids mirror lib/specializations.ts without importing frontend code.
export type SkillIdentityId =
  | 'JUGGERNAUT' | 'BERSERKER' | 'SNIPER' | 'SPEEDSTER'
  | 'GUARDIAN' | 'CLERIC' | 'TACTICIAN' | 'SCHOLAR';

export const SKILL_IDENTITY_VERSION = 1;
export const MAX_SKILL_RANK = 6;
export const HEAL_CAP_PER_ANSWER = 4;
export const HEAL_CAP_PER_ATTEMPT = 8;

/** Map of specialization -> its 6 valid node ids, in tier order. */
export const SKILL_NODE_IDS: Record<SkillIdentityId, readonly string[]> = {
  JUGGERNAUT: ['jug_1', 'jug_2', 'jug_3', 'jug_4', 'jug_5', 'jug_6'],
  BERSERKER: ['ber_1', 'ber_2', 'ber_3', 'ber_4', 'ber_5', 'ber_6'],
  SNIPER: ['sni_1', 'sni_2', 'sni_3', 'sni_4', 'sni_5', 'sni_6'],
  SPEEDSTER: ['spd_1', 'spd_2', 'spd_3', 'spd_4', 'spd_5', 'spd_6'],
  GUARDIAN: ['grd_1', 'grd_2', 'grd_3', 'grd_4', 'grd_5', 'grd_6'],
  CLERIC: ['clr_1', 'clr_2', 'clr_3', 'clr_4', 'clr_5', 'clr_6'],
  TACTICIAN: ['tac_1', 'tac_2', 'tac_3', 'tac_4', 'tac_5', 'tac_6'],
  SCHOLAR: ['sch_1', 'sch_2', 'sch_3', 'sch_4', 'sch_5', 'sch_6'],
};

function isSkillIdentity(value: unknown): value is SkillIdentityId {
  return typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SKILL_NODE_IDS, value);
}

export function computeSkillRank(
  identity: SkillIdentityId,
  unlockedSkills: readonly string[]
): number {
  if (!isSkillIdentity(identity) || !Array.isArray(unlockedSkills)) {
    return 0;
  }

  const validIds = new Set(SKILL_NODE_IDS[identity]);
  const distinctUnlocked = new Set(unlockedSkills);
  let rank = 0;
  for (const id of distinctUnlocked) {
    if (typeof id === 'string' && validIds.has(id)) {
      rank++;
    }
  }
  return Math.min(rank, MAX_SKILL_RANK);
}

export interface IdentityEvalInput {
  identity: SkillIdentityId;
  rank: number;
  correct: boolean;
  streak: number;
  priorStreak: number;
  playerHp: number;
  playerMaxHp: number;
  bossHp: number;
  bossMaxHp: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  isHardestDifficulty: boolean;
  isRevision: boolean;
  healsUsedThisAttempt: number;
}

export interface IdentityEvalResult {
  damageMultiplier: number;
  incomingMultiplier: number;
  healApplied: number;
  critBonus: number;
  identity: SkillIdentityId;
  rank: number;
}

function neutralIdentityResult(
  identity: SkillIdentityId,
  rank: number
): IdentityEvalResult {
  return {
    damageMultiplier: 1,
    incomingMultiplier: 1,
    healApplied: 0,
    critBonus: 0,
    identity,
    rank,
  };
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** Pure, deterministic identity effect evaluation. Malformed input is neutral. */
export function evaluateSkillIdentity(input: IdentityEvalInput): IdentityEvalResult {
  if (!input || typeof input !== 'object') {
    return neutralIdentityResult('JUGGERNAUT', 0);
  }

  const identity = isSkillIdentity(input.identity) ? input.identity : 'JUGGERNAUT';
  const valid = isSkillIdentity(input.identity) &&
    Number.isFinite(input.rank) && input.rank >= 0 && input.rank <= MAX_SKILL_RANK &&
    typeof input.correct === 'boolean' &&
    Number.isInteger(input.streak) && input.streak >= 0 &&
    Number.isInteger(input.priorStreak) && input.priorStreak >= 0 &&
    isNonNegativeFinite(input.playerHp) &&
    Number.isFinite(input.playerMaxHp) && input.playerMaxHp > 0 &&
    isNonNegativeFinite(input.bossHp) &&
    Number.isFinite(input.bossMaxHp) && input.bossMaxHp > 0 &&
    Object.prototype.hasOwnProperty.call(DIFFICULTY_MOD, input.difficulty) &&
    typeof input.isHardestDifficulty === 'boolean' &&
    typeof input.isRevision === 'boolean' &&
    Number.isInteger(input.healsUsedThisAttempt) && input.healsUsedThisAttempt >= 0;

  if (!valid || input.rank === 0) {
    return neutralIdentityResult(identity, 0);
  }

  const rank = input.rank;
  const w = rank / MAX_SKILL_RANK;
  const result = neutralIdentityResult(identity, rank);
  let requestedHeal = 0;

  if (input.correct) {
    switch (identity) {
      case 'JUGGERNAUT': {
        const hpRatio = input.playerHp / input.playerMaxHp;
        if (hpRatio < 0.26) {
          result.damageMultiplier = 1 + w * 0.18;
        } else if (hpRatio < 0.51) {
          result.damageMultiplier = 1 + w * 0.12;
        } else if (hpRatio < 0.76) {
          result.damageMultiplier = 1 + w * 0.06;
        }
        break;
      }
      case 'BERSERKER': {
        const bossRatio = input.bossHp / input.bossMaxHp;
        if (bossRatio <= 0.25) {
          result.damageMultiplier = 1 + w * 0.24;
        } else if (bossRatio <= 0.51) {
          result.damageMultiplier = 1 + w * 0.12;
        }
        break;
      }
      case 'SNIPER':
        if (input.bossHp >= input.bossMaxHp) {
          result.damageMultiplier = 1 + w * 0.24;
        }
        break;
      case 'SPEEDSTER':
        result.damageMultiplier = 1 + w * 0.06 * Math.min(Math.max(input.streak - 1, 0), 4);
        break;
      case 'GUARDIAN':
        if (input.playerHp >= input.playerMaxHp * 0.99) {
          requestedHeal = Math.round(w * HEAL_CAP_PER_ANSWER);
        }
        break;
      case 'CLERIC':
        if (input.priorStreak === 0 && input.playerHp < input.playerMaxHp) {
          requestedHeal = Math.round(w * HEAL_CAP_PER_ANSWER);
        }
        break;
      case 'TACTICIAN':
        if (input.isRevision) {
          result.damageMultiplier = 1 + w * 0.24;
        }
        break;
      case 'SCHOLAR':
        if (input.isHardestDifficulty) {
          result.damageMultiplier = 1 + w * 0.24;
        }
        break;
    }
  }

  const attemptRemaining = Math.max(0, HEAL_CAP_PER_ATTEMPT - input.healsUsedThisAttempt);
  result.healApplied = Math.max(0, Math.min(
    requestedHeal,
    HEAL_CAP_PER_ANSWER,
    attemptRemaining
  ));

  // Guardian's full-HP effect is a shield, so it may exceed current missing HP.
  // Ordinary healing (Cleric) is additionally limited to the player's missing HP.
  if (identity !== 'GUARDIAN') {
    result.healApplied = Math.min(
      result.healApplied,
      Math.max(0, input.playerMaxHp - input.playerHp)
    );
  }

  return result;
}

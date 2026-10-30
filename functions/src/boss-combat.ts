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
export const MIN_MISS_DAMAGE = 22;

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
  /** Skill-node bonus to crit chance; the combined chance is capped at 0.65. */
  critBonus?: number;
  /** Skill-node override that forces a crit independently of the roll. */
  guaranteedCrit?: boolean;
  /** Skill-node multiplier, clamped to 1..1.30 and applied before the ceiling. */
  damageMultiplier?: number;
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

  const critChance = Math.min(combat.critChance + (input.critBonus ?? 0), 0.65);
  const isCrit = input.guaranteedCrit === true || critRoll < critChance;
  if (isCrit) {
    preCeilingDamage = Math.round(preCeilingDamage * combat.critMultiplier);
  }

  const damageMultiplier = Math.min(Math.max(input.damageMultiplier ?? 1, 1), 1.30);
  preCeilingDamage = Math.round(preCeilingDamage * damageMultiplier);

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

/**
 * Skill point cost per node. Every specialization uses the same ladder
 * (1,1,2,2,3,5 = 14 points to max a tree), mirrored from SKILL_NODES_V2 in
 * lib/specializations.ts. Needed server-side so a respec can refund exactly what
 * was spent: skillPoints is a stored counter, not a derived value.
 */
export const SKILL_NODE_COSTS: Record<string, number> = Object.fromEntries(
  Object.values(SKILL_NODE_IDS)
    .flat()
    .map((id) => {
      const tier = Number(id.split('_')[1]);
      const ladder: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 5 };
      return [id, ladder[tier] ?? 0];
    }),
);

/** Total points a student has invested in their currently unlocked nodes. */
export function sumSpentSkillPoints(unlockedSkills: readonly string[] | undefined): number {
  if (!Array.isArray(unlockedSkills)) return 0;
  const seen = new Set<string>();
  let total = 0;
  for (const id of unlockedSkills) {
    if (typeof id !== 'string' || seen.has(id)) continue; // duplicates never double-refund
    seen.add(id);
    total += SKILL_NODE_COSTS[id] ?? 0; // unknown ids refund nothing
  }
  return total;
}

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

// Node-based skill effects (rank redesign). This is additive: the rank-based
// evaluator above remains unchanged for existing callers and saved payloads.
export type NodeCondition =
  | 'ALWAYS' | 'HP_BELOW_50' | 'HP_ABOVE_50' | 'HP_ABOVE_80'
  | 'HP_BELOW_MAX' | 'HP_BELOW_80' | 'HP_ABOVE_ABS_10'
  | 'BOSS_ABOVE_60' | 'BOSS_ABOVE_50' | 'BOSS_BELOW_60' | 'BOSS_BELOW_12'
  | 'STREAK_2' | 'STREAK_3' | 'IS_REVISION' | 'AFTER_MISS'
  | 'HARD_ONLY' | 'FIRST_OF_ATTEMPT' | 'FIRST_MISS_OF_ATTEMPT'
  | 'FIRST_MISS_ON_HARD';

export type NodeKind =
  | 'DAMAGE' | 'CRIT' | 'HEAL' | 'SHIELD'
  | 'STREAK_KEEP' | 'DAMAGE_TAKEN' | 'LETHAL_SAVE' | 'EXECUTE'
  | 'GUARANTEED_CRIT' | 'ATTEMPT_DAMAGE_REDUCTION';

export interface SkillNodeEffect {
  slot: number;
  cost: number;
  kind: NodeKind;
  value: number;
  condition: NodeCondition;
  /** Stable, student-readable name for the answer record and analytics. */
  key: string;
}

export const SKILL_TREE: Record<SkillIdentityId, SkillNodeEffect[]> = {
  JUGGERNAUT: [
    { slot: 1, cost: 1, kind: 'DAMAGE', value: 1.08, condition: 'ALWAYS', key: 'Heavy Hand' },
    { slot: 2, cost: 1, kind: 'STREAK_KEEP', value: 0.5, condition: 'HP_ABOVE_50', key: 'Unbroken' },
    { slot: 3, cost: 2, kind: 'DAMAGE', value: 1.12, condition: 'HP_BELOW_50', key: 'Cornered' },
    { slot: 4, cost: 2, kind: 'HEAL', value: 4, condition: 'HP_BELOW_50', key: 'Stubborn' },
    { slot: 5, cost: 3, kind: 'DAMAGE_TAKEN', value: 0.85, condition: 'ALWAYS', key: 'Thick Skin' },
    { slot: 6, cost: 5, kind: 'LETHAL_SAVE', value: 1, condition: 'HP_ABOVE_ABS_10', key: 'Last Stand' },
  ],
  BERSERKER: [
    { slot: 1, cost: 1, kind: 'DAMAGE', value: 1.08, condition: 'ALWAYS', key: 'Bloodlust' },
    { slot: 2, cost: 1, kind: 'CRIT', value: 0.10, condition: 'HP_BELOW_80', key: 'Reckless' },
    { slot: 3, cost: 2, kind: 'DAMAGE', value: 1.14, condition: 'BOSS_BELOW_60', key: 'Frenzy' },
    { slot: 4, cost: 2, kind: 'HEAL', value: 4, condition: 'HP_BELOW_50', key: 'Siphon' },
    { slot: 5, cost: 3, kind: 'DAMAGE', value: 1.10, condition: 'ALWAYS', key: 'Rampage' },
    { slot: 6, cost: 5, kind: 'EXECUTE', value: 1, condition: 'BOSS_BELOW_12', key: 'Execute' },
  ],
  SNIPER: [
    { slot: 1, cost: 1, kind: 'DAMAGE', value: 1.08, condition: 'ALWAYS', key: 'Keen Eye' },
    { slot: 2, cost: 1, kind: 'CRIT', value: 0.15, condition: 'BOSS_ABOVE_50', key: 'Headshot' },
    { slot: 3, cost: 2, kind: 'DAMAGE', value: 1.14, condition: 'BOSS_ABOVE_60', key: 'High Caliber' },
    { slot: 4, cost: 2, kind: 'GUARANTEED_CRIT', value: 1, condition: 'FIRST_OF_ATTEMPT', key: 'Focus' },
    { slot: 5, cost: 3, kind: 'DAMAGE', value: 1.10, condition: 'HARD_ONLY', key: 'Deadeye' },
    { slot: 6, cost: 5, kind: 'SHIELD', value: 15, condition: 'FIRST_OF_ATTEMPT', key: 'Camouflage' },
  ],
  SPEEDSTER: [
    { slot: 1, cost: 1, kind: 'DAMAGE', value: 1.08, condition: 'ALWAYS', key: 'Quick Strike' },
    { slot: 2, cost: 1, kind: 'STREAK_KEEP', value: 0.5, condition: 'FIRST_MISS_OF_ATTEMPT', key: 'Momentum' },
    { slot: 3, cost: 2, kind: 'DAMAGE', value: 1.12, condition: 'STREAK_2', key: 'Blitz' },
    { slot: 4, cost: 2, kind: 'HEAL', value: 4, condition: 'STREAK_3', key: 'Second Wind' },
    { slot: 5, cost: 3, kind: 'DAMAGE', value: 1.10, condition: 'ALWAYS', key: 'Haste' },
    { slot: 6, cost: 5, kind: 'DAMAGE_TAKEN', value: 0.80, condition: 'STREAK_2', key: 'Evasion' },
  ],
  GUARDIAN: [
    { slot: 1, cost: 1, kind: 'DAMAGE', value: 1.08, condition: 'ALWAYS', key: 'Bastion' },
    { slot: 2, cost: 1, kind: 'SHIELD', value: 2, condition: 'HP_ABOVE_50', key: 'Aegis' },
    { slot: 3, cost: 2, kind: 'DAMAGE', value: 1.12, condition: 'HP_ABOVE_50', key: 'Phalanx' },
    { slot: 4, cost: 2, kind: 'HEAL', value: 3, condition: 'HP_BELOW_MAX', key: 'Mending' },
    { slot: 5, cost: 3, kind: 'DAMAGE_TAKEN', value: 0.85, condition: 'ALWAYS', key: 'Fortify' },
    { slot: 6, cost: 5, kind: 'DAMAGE', value: 1.12, condition: 'HP_BELOW_50', key: 'Retribution' },
  ],
  CLERIC: [
    { slot: 1, cost: 1, kind: 'DAMAGE', value: 1.08, condition: 'ALWAYS', key: 'Smite' },
    { slot: 2, cost: 1, kind: 'HEAL', value: 2, condition: 'ALWAYS', key: 'Blessing' },
    { slot: 3, cost: 2, kind: 'DAMAGE', value: 1.12, condition: 'AFTER_MISS', key: 'Devotion' },
    { slot: 4, cost: 2, kind: 'ATTEMPT_DAMAGE_REDUCTION', value: 0.20, condition: 'AFTER_MISS', key: 'Purify' },
    { slot: 5, cost: 3, kind: 'DAMAGE', value: 1.10, condition: 'ALWAYS', key: 'Zeal' },
    { slot: 6, cost: 5, kind: 'LETHAL_SAVE', value: 1, condition: 'ALWAYS', key: 'Divine Intervention' },
  ],
  TACTICIAN: [
    { slot: 1, cost: 1, kind: 'DAMAGE', value: 1.08, condition: 'ALWAYS', key: 'Calculated' },
    { slot: 2, cost: 1, kind: 'CRIT', value: 0.12, condition: 'IS_REVISION', key: 'Analyze' },
    { slot: 3, cost: 2, kind: 'DAMAGE', value: 1.14, condition: 'IS_REVISION', key: 'Exploit' },
    { slot: 4, cost: 2, kind: 'HEAL', value: 4, condition: 'AFTER_MISS', key: 'Regroup' },
    { slot: 5, cost: 3, kind: 'DAMAGE', value: 1.10, condition: 'ALWAYS', key: 'Mastermind' },
    { slot: 6, cost: 5, kind: 'SHIELD', value: 12, condition: 'FIRST_OF_ATTEMPT', key: 'Contingency' },
  ],
  SCHOLAR: [
    { slot: 1, cost: 1, kind: 'DAMAGE', value: 1.08, condition: 'ALWAYS', key: 'Studious' },
    { slot: 2, cost: 1, kind: 'STREAK_KEEP', value: 0.5, condition: 'FIRST_MISS_ON_HARD', key: 'Recall' },
    { slot: 3, cost: 2, kind: 'DAMAGE', value: 1.14, condition: 'HARD_ONLY', key: 'Mastery' },
    { slot: 4, cost: 2, kind: 'CRIT', value: 0.15, condition: 'STREAK_2', key: 'Insight' },
    { slot: 5, cost: 3, kind: 'DAMAGE', value: 1.10, condition: 'ALWAYS', key: 'Erudite' },
    { slot: 6, cost: 5, kind: 'DAMAGE_TAKEN', value: 0.85, condition: 'HARD_ONLY', key: 'Thesis' },
  ],
};

export interface SkillNodeEvalInput {
  identity: SkillIdentityId;
  ownedNodeIds: readonly string[];
  correct: boolean;
  streak: number;
  priorStreak: number;
  playerHp: number;
  playerMaxHp: number;
  bossHp: number;
  bossMaxHp: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  isRevision: boolean;
  healsUsedThisAttempt: number;
  isFirstOfAttempt: boolean;
  /** Omitted for legacy callers; treated as false. */
  isFirstMissOfAttempt?: boolean;
}

export interface SkillNodeEvalResult {
  damageMultiplier: number;
  critBonus: number;
  damageTakenMultiplier: number;
  heal: number;
  requestedHeal: number;
  shield: number;
  keepStreakOnMiss: boolean;
  lethalSave: boolean;
  execute: boolean;
  guaranteedCrit: boolean;
  attemptDamageReduction: number;
  appliedNodeIds: string[];
  appliedKeys: string[];
}

const SKILL_DAMAGE_MULTIPLIER_CAP = 1.30;
const SKILL_CRIT_BONUS_CAP = 0.25;
const SKILL_DAMAGE_TAKEN_FLOOR = 0.75;
const SKILL_ATTEMPT_DAMAGE_REDUCTION_CAP = 0.50;

function neutralSkillNodeResult(): SkillNodeEvalResult {
  return {
    damageMultiplier: 1,
    critBonus: 0,
    damageTakenMultiplier: 1,
    heal: 0,
    requestedHeal: 0,
    shield: 0,
    keepStreakOnMiss: false,
    lethalSave: false,
    execute: false,
    guaranteedCrit: false,
    attemptDamageReduction: 0,
    appliedNodeIds: [],
    appliedKeys: [],
  };
}

function skillNodeConditionApplies(
  condition: NodeCondition,
  input: SkillNodeEvalInput
): boolean {
  const hpRatio = input.playerHp / input.playerMaxHp;
  const bossRatio = input.bossHp / input.bossMaxHp;
  switch (condition) {
    case 'ALWAYS': return true;
    case 'HP_BELOW_50': return hpRatio < 0.5;
    case 'HP_ABOVE_50': return hpRatio > 0.5;
    case 'HP_ABOVE_80': return hpRatio > 0.8;
    case 'HP_BELOW_MAX': return input.playerHp < input.playerMaxHp;
    case 'HP_BELOW_80': return hpRatio < 0.8;
    case 'HP_ABOVE_ABS_10': return input.playerHp >= 10;
    case 'BOSS_ABOVE_60': return bossRatio > 0.6;
    case 'BOSS_ABOVE_50': return bossRatio > 0.5;
    case 'BOSS_BELOW_60': return bossRatio < 0.6;
    case 'BOSS_BELOW_12': return bossRatio < 0.12;
    case 'STREAK_2': return input.streak >= 2;
    case 'STREAK_3': return input.streak >= 3;
    case 'IS_REVISION': return input.isRevision;
    case 'AFTER_MISS': return input.priorStreak === 0;
    case 'HARD_ONLY': return input.difficulty === 'HARD';
    case 'FIRST_OF_ATTEMPT': return input.isFirstOfAttempt;
    case 'FIRST_MISS_OF_ATTEMPT': return input.isFirstMissOfAttempt === true;
    case 'FIRST_MISS_ON_HARD':
      return input.isFirstMissOfAttempt === true && input.difficulty === 'HARD';
  }
}

/** Pure node evaluator. Unknown ids are ignored; malformed input is neutral. */
export function evaluateSkillNodes(input: SkillNodeEvalInput): SkillNodeEvalResult {
  const result = neutralSkillNodeResult();
  if (!input || typeof input !== 'object' || !isSkillIdentity(input.identity) ||
      !Array.isArray(input.ownedNodeIds)) {
    return result;
  }

  const valid = typeof input.correct === 'boolean' &&
    Number.isInteger(input.streak) && input.streak >= 0 &&
    Number.isInteger(input.priorStreak) && input.priorStreak >= 0 &&
    isNonNegativeFinite(input.playerHp) &&
    Number.isFinite(input.playerMaxHp) && input.playerMaxHp > 0 &&
    isNonNegativeFinite(input.bossHp) &&
    Number.isFinite(input.bossMaxHp) && input.bossMaxHp > 0 &&
    Object.prototype.hasOwnProperty.call(DIFFICULTY_MOD, input.difficulty) &&
    typeof input.isRevision === 'boolean' &&
    Number.isInteger(input.healsUsedThisAttempt) && input.healsUsedThisAttempt >= 0 &&
    typeof input.isFirstOfAttempt === 'boolean' &&
    (input.isFirstMissOfAttempt === undefined ||
      typeof input.isFirstMissOfAttempt === 'boolean');
  if (!valid) return result;

  const owned = new Set(input.ownedNodeIds);
  let requestedHeal = 0;
  const nodes = SKILL_TREE[input.identity];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const nodeId = SKILL_NODE_IDS[input.identity][index];
    if (!owned.has(nodeId) || !skillNodeConditionApplies(node.condition, input)) continue;

    let applied = true;
    switch (node.kind) {
      case 'DAMAGE':
        if (input.correct) result.damageMultiplier *= node.value;
        else applied = false;
        break;
      case 'CRIT':
        if (input.correct) result.critBonus += node.value;
        else applied = false;
        break;
      case 'GUARANTEED_CRIT':
        if (input.correct) result.guaranteedCrit = true;
        else applied = false;
        break;
      case 'HEAL':
        if (input.correct) requestedHeal += node.value;
        else applied = false;
        break;
      case 'SHIELD':
        result.shield += node.value;
        break;
      case 'STREAK_KEEP':
        if (!input.correct) result.keepStreakOnMiss = true;
        else applied = false;
        break;
      case 'DAMAGE_TAKEN':
        result.damageTakenMultiplier *= node.value;
        break;
      case 'ATTEMPT_DAMAGE_REDUCTION':
        if (input.correct) {
          result.attemptDamageReduction = Math.min(
            SKILL_ATTEMPT_DAMAGE_REDUCTION_CAP,
            result.attemptDamageReduction + node.value,
          );
        } else {
          applied = false;
        }
        break;
      case 'LETHAL_SAVE':
        result.lethalSave = true;
        break;
      case 'EXECUTE':
        if (input.correct) result.execute = true;
        else applied = false;
        break;
    }
    if (applied) {
      result.appliedNodeIds.push(nodeId);
      result.appliedKeys.push(node.key);
    }
  }

  // Internal invariants: no combination can exceed the redesign's hard caps.
  result.damageMultiplier = input.correct
    ? Math.min(result.damageMultiplier, SKILL_DAMAGE_MULTIPLIER_CAP)
    : 1;
  result.critBonus = Math.min(result.critBonus, SKILL_CRIT_BONUS_CAP);
  result.damageTakenMultiplier = Math.max(
    result.damageTakenMultiplier,
    SKILL_DAMAGE_TAKEN_FLOOR
  );
  result.heal = Math.max(0, Math.min(
    requestedHeal,
    HEAL_CAP_PER_ANSWER,
    HEAL_CAP_PER_ATTEMPT - input.healsUsedThisAttempt,
    input.playerMaxHp - input.playerHp
  ));
  result.requestedHeal = requestedHeal;
  return result;
}

export interface BossTurnState {
  bossHp: number;
  bossMaxHp: number;
  playerHp: number;
  playerMaxHp: number;
  streak: number;
  healsUsedThisAttempt: number;
  attemptDamageReduction: number;
  lethalSaveUsed: boolean;
  shieldHp: number;
  isFirstOfAttempt: boolean;
  isFirstMissOfAttempt: boolean;
}

export interface BossTurnAnswer {
  correct: boolean;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  isRevision: boolean;
  rand: number;
  critRoll: number;
  gearScore: number;
  stats: PlayerStats;
}

export interface BossTurnResult {
  bossHp: number;
  playerHp: number;
  streak: number;
  healsUsedThisAttempt: number;
  attemptDamageReduction: number;
  lethalSaveUsed: boolean;
  shieldHp: number;
  damageDealt: number;
  damageTaken: number;
  healApplied: number;
  knockback: boolean;
  knockout: boolean;
  victory: boolean;
  executed: boolean;
  lethalSaveConsumed: boolean;
  isCrit: boolean;
  appliedKeys: string[];
  damageMultiplier: number;
  incomingMultiplier: number;
  critBonus: number;
  rank: number;
  healCapped: boolean;
}

function unchangedBossTurn(state: BossTurnState | null | undefined): BossTurnResult {
  return {
    bossHp: state?.bossHp ?? 0,
    playerHp: state?.playerHp ?? 0,
    streak: state?.streak ?? 0,
    healsUsedThisAttempt: state?.healsUsedThisAttempt ?? 0,
    attemptDamageReduction: state?.attemptDamageReduction ?? 0,
    lethalSaveUsed: state?.lethalSaveUsed ?? false,
    shieldHp: state?.shieldHp ?? 0,
    damageDealt: 0,
    damageTaken: 0,
    healApplied: 0,
    knockback: false,
    knockout: false,
    victory: false,
    executed: false,
    lethalSaveConsumed: false,
    isCrit: false,
    appliedKeys: [],
    damageMultiplier: 1,
    incomingMultiplier: 1,
    critBonus: 0,
    rank: 0,
    healCapped: false,
  };
}

function validStats(stats: PlayerStats): boolean {
  return typeof stats === 'object' && stats !== null &&
    isNonNegativeFinite(stats.tech) &&
    isNonNegativeFinite(stats.focus) &&
    isNonNegativeFinite(stats.analysis) &&
    isNonNegativeFinite(stats.charisma);
}

function validBossTurnInput(
  identity: SkillIdentityId | null,
  ownedNodeIds: readonly string[],
  state: BossTurnState,
  answer: BossTurnAnswer,
): boolean {
  return (identity === null || isSkillIdentity(identity)) &&
    Array.isArray(ownedNodeIds) &&
    ownedNodeIds.every((id) => typeof id === 'string') &&
    typeof state === 'object' && state !== null &&
    isNonNegativeFinite(state.bossHp) &&
    Number.isFinite(state.bossMaxHp) && state.bossMaxHp > 0 &&
    state.bossHp <= state.bossMaxHp &&
    isNonNegativeFinite(state.playerHp) &&
    Number.isFinite(state.playerMaxHp) && state.playerMaxHp > 0 &&
    state.playerHp <= state.playerMaxHp &&
    Number.isInteger(state.streak) && state.streak >= 0 &&
    Number.isInteger(state.healsUsedThisAttempt) &&
    state.healsUsedThisAttempt >= 0 && state.healsUsedThisAttempt <= HEAL_CAP_PER_ATTEMPT &&
    isNonNegativeFinite(state.attemptDamageReduction) &&
    state.attemptDamageReduction <= SKILL_ATTEMPT_DAMAGE_REDUCTION_CAP &&
    typeof state.lethalSaveUsed === 'boolean' &&
    isNonNegativeFinite(state.shieldHp) && state.shieldHp <= 20 &&
    typeof state.isFirstOfAttempt === 'boolean' &&
    typeof state.isFirstMissOfAttempt === 'boolean' &&
    typeof answer === 'object' && answer !== null &&
    typeof answer.correct === 'boolean' &&
    Object.prototype.hasOwnProperty.call(DIFFICULTY_MOD, answer.difficulty) &&
    typeof answer.isRevision === 'boolean' &&
    Number.isFinite(answer.rand) &&
    Number.isFinite(answer.critRoll) &&
    isNonNegativeFinite(answer.gearScore) &&
    validStats(answer.stats);
}

/**
 * Resolve one answer without I/O or RNG. Legacy attempt fields are normalized by
 * the caller-facing wrapper below; all other malformed inputs are a no-op.
 */
function resolveNormalizedBossTurn(
  identity: SkillIdentityId | null,
  ownedNodeIds: readonly string[],
  state: BossTurnState,
  answer: BossTurnAnswer,
): BossTurnResult {
  if (!validBossTurnInput(identity, ownedNodeIds, state, answer)) {
    return unchangedBossTurn(state);
  }
  if (identity !== null && !isSkillIdentity(identity)) {
    return resolveNormalizedBossTurn(null, [], state, answer);
  }

  const priorStreak = state.streak;
  const tentativeStreak = answer.correct ? priorStreak + 1 : 0;
  const nodes = evaluateSkillNodes({
    identity: identity ?? 'JUGGERNAUT',
    ownedNodeIds: identity === null ? [] : ownedNodeIds,
    correct: answer.correct,
    streak: tentativeStreak,
    priorStreak,
    playerHp: state.playerHp,
    playerMaxHp: state.playerMaxHp,
    bossHp: state.bossHp,
    bossMaxHp: state.bossMaxHp,
    difficulty: answer.difficulty,
    isRevision: answer.isRevision,
    healsUsedThisAttempt: state.healsUsedThisAttempt,
    isFirstOfAttempt: state.isFirstOfAttempt,
    isFirstMissOfAttempt: state.isFirstMissOfAttempt,
  });
  const finalStreak = !answer.correct && nodes.keepStreakOnMiss
    ? priorStreak
    : tentativeStreak;

  let nextBossHp = state.bossHp;
  let nextPlayerHp = state.playerHp;
  let nextAttemptDR = state.attemptDamageReduction;
  let nextLethalSaveUsed = state.lethalSaveUsed;
  let nextShieldHp = state.shieldHp;
  let damageDealt = 0;
  let damageTaken = 0;
  let knockback = false;
  let knockout = false;
  let victory = false;
  let executed = false;
  let lethalSaveConsumed = false;
  let isCrit = false;

  if (answer.correct) {
    const hit = computeCorrectHit({
      gearScore: answer.gearScore,
      stats: answer.stats,
      difficulty: answer.difficulty,
      streak: priorStreak,
      rand: answer.rand,
      critRoll: answer.critRoll,
      bossMaxHp: state.bossMaxHp,
      critBonus: nodes.critBonus,
      guaranteedCrit: nodes.guaranteedCrit,
      damageMultiplier: nodes.damageMultiplier,
    });
    isCrit = hit.isCrit;
    nextBossHp = Math.max(0, state.bossHp - hit.damage);
    damageDealt = state.bossHp - nextBossHp;
    if (nextBossHp > 0 && nextBossHp / state.bossMaxHp <= 0.12 && nodes.execute) {
      nextBossHp = 0;
      executed = true;
    }
    victory = nextBossHp <= 0;
  } else {
    nextAttemptDR = Math.min(
      SKILL_ATTEMPT_DAMAGE_REDUCTION_CAP,
      state.attemptDamageReduction + nodes.attemptDamageReduction,
    );
    const combat = deriveCombatStats(answer.stats);
    const playerEhp = computePlayerEhp({
      maxHp: state.playerMaxHp,
      armorPercent: combat.armorPercent,
    });
    const attack = computeBossAttack({ stats: answer.stats, playerEhp });
    const combined = nodes.damageTakenMultiplier * (1 - nextAttemptDR);
    const mitigatedDamage = Math.max(
      MIN_MISS_DAMAGE,
      Math.round(attack.damage * combined),
    );
    const absorbed = Math.min(state.shieldHp, mitigatedDamage);
    nextShieldHp = state.shieldHp - absorbed;
    damageTaken = mitigatedDamage - absorbed;
    nextPlayerHp = state.playerHp - damageTaken;

    if (nextPlayerHp <= 0) {
      knockback = true;
      if (nodes.lethalSave && !state.lethalSaveUsed) {
        nextPlayerHp = 1;
        nextLethalSaveUsed = true;
        lethalSaveConsumed = true;
      }
    }
    knockout = nextPlayerHp <= 0;
    nextPlayerHp = Math.max(0, nextPlayerHp);
  }

  const healApplied = nextPlayerHp > 0
    ? Math.max(0, Math.min(
        nodes.heal,
        HEAL_CAP_PER_ANSWER,
        HEAL_CAP_PER_ATTEMPT - state.healsUsedThisAttempt,
        state.playerMaxHp - nextPlayerHp,
      ))
    : 0;
  // The evaluator records requested healing before per-answer/attempt/HP caps.
  // Full HP suppresses its HP-gated heal nodes, so check the pre-answer HP too.
  const healCapped = healApplied === 0 && answer.correct && nodes.requestedHeal > 0;
  nextPlayerHp = Math.min(state.playerMaxHp, Math.max(0, nextPlayerHp + healApplied));
  if (answer.correct) nextShieldHp = Math.min(20, nextShieldHp + nodes.shield);

  return {
    bossHp: nextBossHp,
    playerHp: nextPlayerHp,
    streak: finalStreak,
    healsUsedThisAttempt: Math.min(
      HEAL_CAP_PER_ATTEMPT,
      state.healsUsedThisAttempt + healApplied,
    ),
    attemptDamageReduction: nextAttemptDR,
    lethalSaveUsed: nextLethalSaveUsed,
    shieldHp: nextShieldHp,
    damageDealt,
    damageTaken,
    healApplied,
    knockback,
    knockout,
    victory,
    executed,
    lethalSaveConsumed,
    isCrit,
    appliedKeys: [...nodes.appliedKeys],
    damageMultiplier: nodes.damageMultiplier,
    incomingMultiplier: nodes.damageTakenMultiplier,
    critBonus: nodes.critBonus,
    rank: identity === null ? 0 : computeSkillRank(identity, ownedNodeIds),
    healCapped,
  };
}

export function resolveBossTurn(
  identity: SkillIdentityId | null,
  ownedNodeIds: readonly string[],
  state: BossTurnState,
  answer: BossTurnAnswer,
): BossTurnResult {
  try {
    if (typeof state !== 'object' || state === null) {
      return unchangedBossTurn(state);
    }
    const normalizedState: BossTurnState = {
      ...state,
      attemptDamageReduction: state.attemptDamageReduction ?? 0,
      lethalSaveUsed: state.lethalSaveUsed ?? false,
      shieldHp: state.shieldHp ?? 0,
    };
    return resolveNormalizedBossTurn(identity, ownedNodeIds, normalizedState, answer);
  } catch {
    return unchangedBossTurn(state);
  }
}

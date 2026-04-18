export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type BossTier = 'HARD' | 'NIGHTMARE';

export const QUESTION_DIFFICULTY_CLASSES: Record<QuestionDifficulty, string> = {
  EASY:   'bg-green-500/10 text-green-600 dark:text-green-400',
  MEDIUM: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  HARD:   'bg-red-500/10 text-red-600 dark:text-red-400',
};

export const BOSS_TIER_CLASSES: Record<string, string> = {
  HARD:      'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  NIGHTMARE: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export const DEFAULT_BOSS_TIER_CLASS = 'bg-purple-500/10 text-purple-600 dark:text-purple-400';

export function getDifficultyClasses(difficulty: string): string {
  return QUESTION_DIFFICULTY_CLASSES[difficulty as QuestionDifficulty] ?? QUESTION_DIFFICULTY_CLASSES.MEDIUM;
}

export function getBossTierClasses(tier: string): string {
  return BOSS_TIER_CLASSES[tier] ?? DEFAULT_BOSS_TIER_CLASS;
}

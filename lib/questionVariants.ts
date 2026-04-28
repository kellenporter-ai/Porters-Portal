
import { QuestionTemplate, QuestionVariant, BossQuizQuestion } from '../types';

// ========================================
// ANTI-GAMING: Question Variant Generator
// ========================================
// Generates unique question instances from templates to prevent
// answer memorization and sharing across attempts.

/**
 * Evaluate a simple mathematical formula with given parameters.
 * Supports: +, -, *, /, ^, parentheses
 */
function evaluateFormula(formula: string, params: Record<string, number>): number {
  // Replace parameter names with values
  let expr = formula;
  for (const [key, val] of Object.entries(params)) {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
  }
  // Replace ^ with ** for JS eval
  expr = expr.replace(/\^/g, '**');
  try {
    // eslint-disable-next-line no-eval
    return Number(eval(expr));
  } catch {
    return NaN;
  }
}

/**
 * Format a number for display in question stems.
 */
function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Fill template placeholders with parameter values.
 * E.g. "What is the force on a {mass}kg object..." → "What is the force on a 5kg object..."
 */
function fillTemplate(template: string, params: Record<string, number>): string {
  let result = template;
  for (const [key, val] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), formatNumber(val));
  }
  return result;
}

/**
 * Generate random parameters within defined ranges.
 */
function generateParameters(
  ranges: Record<string, { min: number; max: number; step: number }>
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [key, range] of Object.entries(ranges)) {
    const steps = Math.floor((range.max - range.min) / range.step);
    const step = Math.floor(Math.random() * (steps + 1));
    const value = range.min + step * range.step;
    // Round to avoid floating point issues
    const decimals = String(range.step).split('.')[1]?.length || 0;
    params[key] = Number(value.toFixed(decimals));
  }
  return params;
}

/**
 * Generate a unique question variant from a template.
 */
export function generateVariant(template: QuestionTemplate, seed?: number): QuestionVariant {
  // Use seed for deterministic generation (useful for tests)
  if (seed !== undefined) {
    const originalRandom = Math.random;
    let s = seed;
    Math.random = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const variant = generateVariantInternal(template);
    Math.random = originalRandom;
    return variant;
  }
  return generateVariantInternal(template);
}

function generateVariantInternal(template: QuestionTemplate): QuestionVariant {
  const params = generateParameters(template.parameterRanges);
  const stem = fillTemplate(template.baseStem, params);
  const correctValue = evaluateFormula(template.correctAnswerFormula, params);

  // Generate distractor values from formulas
  const distractorValues = template.distractorFormulas.map(f => evaluateFormula(f, params));

  // Combine correct + distractors, shuffle
  const allOptions = [correctValue, ...distractorValues];
  const shuffled = [...allOptions].sort(() => Math.random() - 0.5);
  const correctAnswer = shuffled.indexOf(correctValue);

  // Format options
  const options = shuffled.map(v => formatNumber(v));

  return {
    id: `${template.id}_v${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    templateId: template.id,
    stem,
    options,
    correctAnswer,
    parameters: params,
    topicId: template.topicId,
    difficulty: template.difficulty,
  };
}

/**
 * Convert a QuestionVariant to a BossQuizQuestion for use in boss fights.
 */
export function variantToBossQuestion(variant: QuestionVariant, overrides?: Partial<BossQuizQuestion>): BossQuizQuestion {
  return {
    id: variant.id,
    stem: variant.stem,
    options: variant.options,
    correctAnswer: variant.correctAnswer,
    difficulty: variant.difficulty,
    topicId: variant.topicId,
    variantParameters: variant.parameters,
    distractorTypes: overrides?.distractorTypes || ['COMMON_ERROR', 'PARTIAL_TRUTH', 'PLAUSIBLE_DISTRACTOR'],
    explanation: overrides?.explanation,
    ...overrides,
  };
}

// ========================================
// ADAPTIVE DIFFICULTY
// ========================================

export interface AdaptiveSelectionConfig {
  targetAccuracy: number;        // Target accuracy (e.g., 0.75)
  accuracyWindow: number;        // Recent answers to consider
  easyThreshold: number;         // Below this → increase difficulty
  hardThreshold: number;         // Above this → decrease difficulty
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveSelectionConfig = {
  targetAccuracy: 0.75,
  accuracyWindow: 10,
  easyThreshold: 0.60,
  hardThreshold: 0.90,
};

/**
 * Calculate recent accuracy from accuracy history.
 */
export function calculateRecentAccuracy(history: number[], window: number): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-window);
  const correct = recent.filter(a => a === 1).length;
  return correct / recent.length;
}

/**
 * Select difficulty for the next question based on recent performance.
 */
export function selectAdaptiveDifficulty(
  accuracyHistory: number[],
  config: AdaptiveSelectionConfig = DEFAULT_ADAPTIVE_CONFIG
): 'EASY' | 'MEDIUM' | 'HARD' {
  const accuracy = calculateRecentAccuracy(accuracyHistory, config.accuracyWindow);

  if (accuracy < config.easyThreshold) {
    // Struggling — give easier questions to build confidence
    return 'EASY';
  }
  if (accuracy > config.hardThreshold) {
    // Excelling — challenge with harder questions
    return 'HARD';
  }
  // In the sweet spot
  return 'MEDIUM';
}

// ========================================
// ANTI-GAMING: QUESTION DEDUPLICATION
// ========================================

/**
 * Track recently used question IDs to prevent repeats across attempts.
 */
export class QuestionDeduplicator {
  private usedIds = new Set<string>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  markUsed(id: string): void {
    this.usedIds.add(id);
    if (this.usedIds.size > this.maxSize) {
      // Remove oldest (FIFO by iteration order)
      const first = this.usedIds.values().next().value;
      if (first) this.usedIds.delete(first);
    }
  }

  isUsed(id: string): boolean {
    return this.usedIds.has(id);
  }

  filterUnused<T extends { id: string }>(questions: T[]): T[] {
    return questions.filter(q => !this.usedIds.has(q.id));
  }

  clear(): void {
    this.usedIds.clear();
  }
}

// ========================================
// DISTRACTOR QUALITY VALIDATION
// ========================================

export interface DistractorQualityReport {
  valid: boolean;
  issues: string[];
  distinctCount: number;
  correctAnswerCollision: boolean;
}

/**
 * Validate that a question's distractors are high quality:
 * - All options are distinct
 * - Correct answer is not duplicated
 * - No obviously wrong answers (too far from correct)
 */
export function validateDistractorQuality(question: BossQuizQuestion): DistractorQualityReport {
  const issues: string[] = [];

  // Check distinctness
  const optionSet = new Set(question.options);
  if (optionSet.size !== question.options.length) {
    issues.push('Duplicate options detected');
  }

  // Check correct answer collision
  const correctOption = question.options[question.correctAnswer];
  const correctCollisions = question.options.filter((o, i) => o === correctOption && i !== question.correctAnswer);
  if (correctCollisions.length > 0) {
    issues.push('Correct answer appears in multiple positions');
  }

  // Check numeric spread (for numeric answers)
  const numericOptions = question.options.map(o => Number(o.replace(/[^0-9.-]/g, ''))).filter(n => !isNaN(n));
  if (numericOptions.length >= 2) {
    const sorted = [...numericOptions].sort((a, b) => a - b);
    const ranges = sorted.slice(1).map((v, i) => v - sorted[i]);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const minRange = Math.min(...ranges);
    if (minRange < avgRange * 0.1) {
      issues.push('Some options are too close together');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    distinctCount: optionSet.size,
    correctAnswerCollision: correctCollisions.length > 0,
  };
}

// ========================================
// TOPIC ROTATION (prevent same-topic spam)
// ========================================

/**
 * Select questions that distribute topics evenly.
 */
export function selectBalancedTopics<T extends { topicId?: string }>(
  questions: T[],
  count: number
): T[] {
  const byTopic: Record<string, T[]> = {};
  for (const q of questions) {
    const tid = q.topicId || 'unknown';
    if (!byTopic[tid]) byTopic[tid] = [];
    byTopic[tid].push(q);
  }

  const topics = Object.keys(byTopic);
  const selected: T[] = [];
  let topicIdx = 0;

  while (selected.length < count && topics.length > 0) {
    const topic = topics[topicIdx % topics.length];
    const pool = byTopic[topic].filter(q => !selected.includes(q));
    if (pool.length > 0) {
      selected.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    topicIdx++;
    // Break if we've cycled through all topics and found nothing new
    if (topicIdx > topics.length * count) break;
  }

  return selected;
}

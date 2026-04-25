
import { BossPreset, BossModifierType, BossAbilityEffect } from '../types';

export const BOSS_PRESETS: BossPreset[] = [
  {
    id: 'quick_check',
    name: 'Quick Check',
    description: 'A brief 5-minute exit ticket boss for rapid formative assessment.',
    mode: 'QUIZ',
    difficultyTier: 'NORMAL',
    modifiers: [],
    phases: [],
    bossAbilities: [],
    damagePerCorrect: 50,
    rewards: { xp: 100, flux: 25 },
    targetUseCase: 'Exit ticket, formative check',
    breakBarConfig: { segments: 2, colors: ['#22c55e', '#ef4444'], transitionAnimations: [] },
    subjectTheme: 'default',
  },
  {
    id: 'weekly_raid',
    name: 'Weekly Raid',
    description: 'A multi-phase boss designed for weekend async practice. Students get 3 attempts.',
    mode: 'QUIZ',
    difficultyTier: 'HARD',
    modifiers: [
      { type: 'STREAK_BONUS' as BossModifierType, value: 15 },
      { type: 'TIME_PRESSURE' as BossModifierType, value: 3 },
    ],
    phases: [
      {
        name: 'Warm-Up',
        hpThreshold: 100,
        modifiers: [],
        dialogue: 'Let\'s see what you\'ve learned this week...',
      },
      {
        name: 'The Gauntlet',
        hpThreshold: 66,
        modifiers: [{ type: 'BOSS_DAMAGE_BOOST' as BossModifierType, value: 10 }],
        dialogue: 'Impressive! But the real challenge begins now.',
      },
      {
        name: 'Final Form',
        hpThreshold: 33,
        modifiers: [
          { type: 'BOSS_DAMAGE_BOOST' as BossModifierType, value: 15 },
          { type: 'CRIT_SURGE' as BossModifierType, value: 15 },
        ],
        dialogue: 'You thought that was hard? Try THIS!',
      },
    ],
    bossAbilities: [
      {
        id: 'raid_aoe',
        name: 'Seismic Slam',
        description: 'All students take damage',
        trigger: 'HP_THRESHOLD',
        triggerValue: 50,
        effect: 'AOE_DAMAGE' as BossAbilityEffect,
        value: 10,
        duration: 0,
      },
    ],
    damagePerCorrect: 40,
    rewards: { xp: 500, flux: 100, itemRarity: 'RARE' },
    targetUseCase: 'Weekend async practice',
    breakBarConfig: { segments: 3, colors: ['#22c55e', '#eab308', '#ef4444'], transitionAnimations: [] },
    subjectTheme: 'physics',
  },
  {
    id: 'final_exam',
    name: 'Final Exam',
    description: 'A grueling 4-phase summative review boss. Only the prepared survive.',
    mode: 'QUIZ',
    difficultyTier: 'NIGHTMARE',
    modifiers: [
      { type: 'DOUBLE_OR_NOTHING' as BossModifierType },
      { type: 'ARMOR_BREAK' as BossModifierType },
      { type: 'TIME_PRESSURE' as BossModifierType, value: 5 },
    ],
    phases: [
      {
        name: 'Foundations',
        hpThreshold: 100,
        modifiers: [],
        dialogue: 'Prove you understand the basics.',
      },
      {
        name: 'Application',
        hpThreshold: 75,
        modifiers: [{ type: 'BOSS_DAMAGE_BOOST' as BossModifierType, value: 10 }],
        dialogue: 'Can you apply what you know?',
      },
      {
        name: 'Synthesis',
        hpThreshold: 50,
        modifiers: [
          { type: 'BOSS_DAMAGE_BOOST' as BossModifierType, value: 15 },
          { type: 'HARD_ONLY' as BossModifierType },
        ],
        dialogue: 'Combine your knowledge!',
      },
      {
        name: 'Mastery',
        hpThreshold: 25,
        modifiers: [
          { type: 'BOSS_DAMAGE_BOOST' as BossModifierType, value: 20 },
          { type: 'DOUBLE_OR_NOTHING' as BossModifierType },
        ],
        dialogue: 'Show me everything you\'ve learned!',
      },
    ],
    bossAbilities: [
      {
        id: 'exam_silence',
        name: 'Brain Fog',
        description: 'Students cannot crit for 3 questions',
        trigger: 'ON_PHASE',
        triggerValue: 2,
        effect: 'SILENCE' as BossAbilityEffect,
        value: 0,
        duration: 3,
      },
      {
        id: 'exam_enrage',
        name: 'Test Anxiety',
        description: 'Boss damage increased',
        trigger: 'ON_PHASE',
        triggerValue: 3,
        effect: 'ENRAGE' as BossAbilityEffect,
        value: 50,
        duration: 5,
      },
    ],
    damagePerCorrect: 35,
    rewards: { xp: 1000, flux: 250, itemRarity: 'UNIQUE' },
    targetUseCase: 'Summative review',
    breakBarConfig: { segments: 4, colors: ['#3b82f6', '#22c55e', '#f97316', '#ef4444'], transitionAnimations: [] },
    subjectTheme: 'forensics',
  },
  {
    id: 'team_builder',
    name: 'Team Builder',
    description: 'A collaborative boss where Commander and Sentinel roles shine.',
    mode: 'QUIZ',
    difficultyTier: 'NORMAL',
    modifiers: [
      { type: 'HEALING_WAVE' as BossModifierType, value: 15 },
      { type: 'SHIELD_WALL' as BossModifierType, value: 3 },
    ],
    phases: [
      {
        name: 'Cooperation',
        hpThreshold: 100,
        modifiers: [],
        dialogue: 'Work together to defeat me!',
      },
      {
        name: 'Unity',
        hpThreshold: 50,
        modifiers: [{ type: 'HEALING_WAVE' as BossModifierType, value: 20 }],
        dialogue: 'Your teamwork is impressive... but is it enough?',
      },
    ],
    bossAbilities: [
      {
        id: 'team_aoe',
        name: 'Group Challenge',
        description: 'All students take damage',
        trigger: 'EVERY_N_QUESTIONS',
        triggerValue: 10,
        effect: 'AOE_DAMAGE' as BossAbilityEffect,
        value: 8,
        duration: 0,
      },
    ],
    damagePerCorrect: 45,
    rewards: { xp: 300, flux: 50 },
    targetUseCase: 'Social collaboration',
    breakBarConfig: { segments: 2, colors: ['#a855f7', '#ef4444'], transitionAnimations: [] },
    subjectTheme: 'chemistry',
  },
];

export function getBossPresetById(id: string): BossPreset | undefined {
  return BOSS_PRESETS.find((p) => p.id === id);
}

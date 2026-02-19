
import { RunewordDefinition } from '../types';

// ========================================
// RUNEWORD DEFINITIONS
// ========================================
// When gems are socketed in the EXACT order listed in `pattern`,
// the item transforms into a Runeword item with massive bonus stats.
// Gem names: Ruby (tech), Emerald (focus), Sapphire (analysis), Amethyst (charisma)

export const RUNEWORD_DEFINITIONS: RunewordDefinition[] = [
  // --- 2-SOCKET RUNEWORDS ---
  {
    id: 'rw_binary',
    name: 'Binary',
    description: 'The fundamental language of machines',
    pattern: ['Ruby', 'Ruby'],
    requiredSockets: 2,
    bonusStats: { tech: 15 },
    lore: 'Two pulses of energy — on, on. The circuit completes itself.',
  },
  {
    id: 'rw_harmony',
    name: 'Harmony',
    description: 'Balance between mind and matter',
    pattern: ['Emerald', 'Sapphire'],
    requiredSockets: 2,
    bonusStats: { focus: 8, analysis: 8 },
    lore: 'Where concentration meets comprehension, understanding follows.',
  },
  {
    id: 'rw_catalyst',
    name: 'Catalyst',
    description: 'Accelerates all reactions without being consumed',
    pattern: ['Ruby', 'Emerald'],
    requiredSockets: 2,
    bonusStats: { tech: 8, focus: 8 },
    lore: 'A spark of innovation ignites sustained brilliance.',
  },
  {
    id: 'rw_resonance',
    name: 'Resonance',
    description: 'Vibrations amplified through perfect alignment',
    pattern: ['Amethyst', 'Amethyst'],
    requiredSockets: 2,
    bonusStats: { charisma: 15 },
    lore: 'Two voices in unison shake the foundations of silence.',
  },
  {
    id: 'rw_enigma',
    name: 'Enigma',
    description: 'A puzzle that rewards the solver',
    pattern: ['Sapphire', 'Amethyst'],
    requiredSockets: 2,
    bonusStats: { analysis: 10, charisma: 6 },
    lore: 'The deepest mysteries reveal themselves to those who ask the right questions.',
  },

  // --- 3-SOCKET RUNEWORDS ---
  {
    id: 'rw_quantum',
    name: 'Quantum Entanglement',
    description: 'Connected across any distance, instantaneously',
    pattern: ['Sapphire', 'Ruby', 'Sapphire'],
    requiredSockets: 3,
    bonusStats: { analysis: 18, tech: 10 },
    bonusEffects: [{ id: 'qe_xp', name: 'Quantum Leap', description: '+5% XP from all sources', value: 0.05, type: 'XP_BOOST' }],
    lore: 'What is measured in one place is instantly known in another.',
  },
  {
    id: 'rw_fusion',
    name: 'Nuclear Fusion',
    description: 'Combining elements to release extraordinary energy',
    pattern: ['Ruby', 'Emerald', 'Ruby'],
    requiredSockets: 3,
    bonusStats: { tech: 20, focus: 10 },
    bonusEffects: [{ id: 'nf_xp', name: 'Fusion Core', description: '+5% XP from engagement', value: 0.05, type: 'XP_BOOST' }],
    lore: 'Under immense pressure, two become one — and light is born.',
  },
  {
    id: 'rw_photosynthesis',
    name: 'Photosynthesis',
    description: 'Converting light into sustaining energy',
    pattern: ['Emerald', 'Emerald', 'Ruby'],
    requiredSockets: 3,
    bonusStats: { focus: 20, tech: 8 },
    bonusEffects: [{ id: 'ps_stat', name: 'Solar Sustenance', description: '+3 to all stats', value: 3, type: 'STAT_BOOST' }],
    lore: 'From nothing but light and patience, life finds a way.',
  },
  {
    id: 'rw_supernova',
    name: 'Supernova',
    description: 'The brilliant death of a star, seeding new creation',
    pattern: ['Ruby', 'Sapphire', 'Amethyst'],
    requiredSockets: 3,
    bonusStats: { tech: 12, analysis: 12, charisma: 12 },
    bonusEffects: [{ id: 'sn_xp', name: 'Stellar Burst', description: '+8% XP from all sources', value: 0.08, type: 'XP_BOOST' }],
    lore: 'In the final moment of collapse, everything scatters outward — brighter than ever.',
  },
  {
    id: 'rw_helix',
    name: 'Double Helix',
    description: 'The spiral code that defines all life',
    pattern: ['Emerald', 'Amethyst', 'Emerald'],
    requiredSockets: 3,
    bonusStats: { focus: 15, charisma: 15 },
    bonusEffects: [{ id: 'dh_stat', name: 'Genetic Blueprint', description: '+4 to Focus and Charisma', value: 4, type: 'STAT_BOOST' }],
    lore: 'Twisted strands of information, perfectly paired, encoding the instructions for greatness.',
  },
  {
    id: 'rw_singularity',
    name: 'Singularity',
    description: 'Where all forces converge into infinite density',
    pattern: ['Amethyst', 'Sapphire', 'Ruby'],
    requiredSockets: 3,
    bonusStats: { tech: 10, focus: 10, analysis: 10, charisma: 10 },
    bonusEffects: [{ id: 'sg_xp', name: 'Event Horizon', description: '+10% XP from all sources', value: 0.10, type: 'XP_BOOST' }],
    lore: 'Beyond this point, nothing escapes — not even light. Only knowledge remains.',
  },
];

/**
 * Check if the gems socketed in an item match any runeword pattern.
 * Gems must match in exact order.
 */
export function checkRunewordMatch(gemNames: string[]): RunewordDefinition | null {
  for (const rw of RUNEWORD_DEFINITIONS) {
    if (rw.pattern.length !== gemNames.length) continue;
    if (rw.pattern.every((gem, idx) => gem === gemNames[idx])) {
      return rw;
    }
  }
  return null;
}

/**
 * Calculate total bonus stats from an active runeword.
 */
export function getRunewordBonusStats(runewordId: string): Record<string, number> {
  const rw = RUNEWORD_DEFINITIONS.find(r => r.id === runewordId);
  if (!rw) return {};
  const stats: Record<string, number> = {};
  if (rw.bonusStats.tech) stats.tech = rw.bonusStats.tech;
  if (rw.bonusStats.focus) stats.focus = rw.bonusStats.focus;
  if (rw.bonusStats.analysis) stats.analysis = rw.bonusStats.analysis;
  if (rw.bonusStats.charisma) stats.charisma = rw.bonusStats.charisma;
  return stats;
}

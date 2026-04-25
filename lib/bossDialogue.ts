
import { BossDialogueEntry, BossDialogueTrigger } from '../types';

export const BOSS_DIALOGUE_DB: BossDialogueEntry[] = [
  // First encounter
  {
    id: 'first_encounter_default',
    triggers: [{ type: 'first_encounter' }],
    text: "So, a new challenger approaches... Let's see what you've learned.",
    emotion: 'neutral',
  },
  {
    id: 'first_encounter_arrogant',
    triggers: [{ type: 'first_encounter', conditions: { bossType: 'BRUTE' } }],
    text: "You think you can defeat me? I've crushed hundreds before you!",
    emotion: 'angry',
  },
  {
    id: 'first_encounter_mysterious',
    triggers: [{ type: 'first_encounter', conditions: { bossType: 'PHANTOM' } }],
    text: "I am the shadow of every concept you fear. Face me... if you dare.",
    emotion: 'mocking',
  },

  // Phase transitions
  {
    id: 'phase_transition_generic',
    triggers: [{ type: 'phase_transition' }],
    text: "You thought that was hard? Try THIS!",
    emotion: 'angry',
  },
  {
    id: 'phase_transition_impressed',
    triggers: [{ type: 'phase_transition', conditions: { phase: 2 } }],
    text: "Impressive... you've made it this far. But I was just warming up!",
    emotion: 'excited',
  },
  {
    id: 'phase_transition_final',
    triggers: [{ type: 'phase_transition', conditions: { phase: 3 } }],
    text: "This is my true power! Show me EVERYTHING you've learned!",
    emotion: 'angry',
  },

  // Student struggling
  {
    id: 'struggling_kinematics',
    triggers: [{ type: 'student_struggling', conditions: { topic: 'kinematics' } }],
    text: "Still having trouble with motion? Remember: velocity has direction, speed does not.",
    emotion: 'mocking',
  },
  {
    id: 'struggling_forces',
    triggers: [{ type: 'student_struggling', conditions: { topic: 'forces' } }],
    text: "Forces are simple: F = ma. Don't overthink it!",
    emotion: 'neutral',
  },
  {
    id: 'struggling_generic',
    triggers: [{ type: 'student_struggling' }],
    text: "Struggling? That's where learning happens. Review your notes and try again!",
    emotion: 'neutral',
  },

  // Student dominating
  {
    id: 'dominating_generic',
    triggers: [{ type: 'student_dominating' }],
    text: "Impressive accuracy! But I've been studying too...",
    emotion: 'impressed',
  },
  {
    id: 'dominating_perfect',
    triggers: [{ type: 'student_dominating', conditions: { streak: 10 } }],
    text: "A perfect streak? You're making me look bad!",
    emotion: 'worried',
  },

  // Ability triggers
  {
    id: 'ability_aoe',
    triggers: [{ type: 'ability_trigger', conditions: { effect: 'AOE_DAMAGE' } }],
    text: "Feel the ground shake! SEISMIC SLAM!",
    emotion: 'angry',
  },
  {
    id: 'ability_heal',
    triggers: [{ type: 'ability_trigger', conditions: { effect: 'HEAL_BOSS' } }],
    text: "Your damage only makes me stronger!",
    emotion: 'mocking',
  },
  {
    id: 'ability_silence',
    triggers: [{ type: 'ability_trigger', conditions: { effect: 'SILENCE' } }],
    text: "Your critical thinking has been SILENCED!",
    emotion: 'mocking',
  },
  {
    id: 'ability_enrage',
    triggers: [{ type: 'ability_trigger', conditions: { effect: 'ENRAGE' } }],
    text: "I'M JUST GETTING STARTED!",
    emotion: 'angry',
  },

  // Knockout
  {
    id: 'knockout_encouraging',
    triggers: [{ type: 'knockout' }],
    text: "You fell this time, but every defeat is a lesson. Study hard and return stronger!",
    emotion: 'neutral',
  },
  {
    id: 'knockout_mocking',
    triggers: [{ type: 'knockout', conditions: { bossType: 'BRUTE' } }],
    text: "Too weak! Hit the books and try again, student!",
    emotion: 'mocking',
  },

  // Victory
  {
    id: 'victory_gracious',
    triggers: [{ type: 'victory' }],
    text: "Well fought... You have proven your mastery. For now.",
    emotion: 'impressed',
  },
  {
    id: 'victory_surprised',
    triggers: [{ type: 'victory', conditions: { attempts: 1 } }],
    text: "Defeated on the first try? You are truly a formidable student!",
    emotion: 'impressed',
  },
  {
    id: 'victory_persistent',
    triggers: [{ type: 'victory', conditions: { attempts: 3 } }],
    text: "You never gave up. That persistence is your true strength.",
    emotion: 'impressed',
  },
];

export function selectDialogue(
  trigger: BossDialogueTrigger,
  context: Record<string, unknown> = {}
): string | null {
  const candidates = BOSS_DIALOGUE_DB.filter((entry) =>
    entry.triggers.some((t) => {
      if (t.type !== trigger) return false;
      if (!t.conditions) return true;
      // Check if all conditions match context
      return Object.entries(t.conditions).every(
        ([key, val]) => context[key] === val
      );
    })
  );

  if (candidates.length === 0) return null;

  // Pick one at random
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return chosen.text;
}

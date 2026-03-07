
// Sound Effects System for Porter's Portal
// Uses Kenney asset pack .ogg files via HTMLAudioElement with
// Web Audio API fallback for synthetic sounds when files aren't loaded.

import {
  INTERFACE_SOUNDS,
  RPG_SOUNDS,
  JINGLES,
  DIGITAL_SOUNDS,
  CASINO_SOUNDS,
  IMPACT_SOUNDS,
} from './kenneyAssets';

// ─── State ───

let _enabled = true;
let _volume = 0.5; // 0.0–1.0
const _audioCache = new Map<string, HTMLAudioElement>();

// ─── Public API: Settings ───

/** Enable or disable all sound effects globally */
export function setSfxEnabled(enabled: boolean) {
  _enabled = enabled;
}

/** Set master volume (0.0–1.0) */
export function setSfxVolume(volume: number) {
  _volume = Math.max(0, Math.min(1, volume));
}

/** Get current volume */
export function getSfxVolume(): number {
  return _volume;
}

// ─── Internal: Audio playback ───

function playFile(path: string, volumeScale = 1.0): void {
  if (!_enabled || _volume === 0) return;
  try {
    // Reuse cached element or create new one
    let audio = _audioCache.get(path);
    if (audio) {
      // If still playing, clone it for overlapping sounds
      if (!audio.paused) {
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = _volume * volumeScale;
        clone.play().catch(() => {});
        return;
      }
      audio.currentTime = 0;
      audio.volume = _volume * volumeScale;
      audio.play().catch(() => {});
    } else {
      audio = new Audio(path);
      audio.volume = _volume * volumeScale;
      audio.preload = 'auto';
      _audioCache.set(path, audio);
      audio.play().catch(() => {});
    }
  } catch {
    // Silent fail — audio not critical
  }
}

/** Play a random choice from an array of sound paths */
function playRandom(paths: string[], volumeScale = 1.0): void {
  const idx = Math.floor(Math.random() * paths.length);
  playFile(paths[idx], volumeScale);
}

// Synthetic tone fallback removed — all sounds now use Kenney .ogg files.

// ─── Preload critical sounds for instant playback ───

const PRELOAD_PATHS = [
  INTERFACE_SOUNDS.click1,
  INTERFACE_SOUNDS.confirm1,
  INTERFACE_SOUNDS.close1,
  INTERFACE_SOUNDS.error1,
  INTERFACE_SOUNDS.open1,
  INTERFACE_SOUNDS.toggle1,
  RPG_SOUNDS.coins1,
  DIGITAL_SOUNDS.powerUp1,
  DIGITAL_SOUNDS.highUp,
];

/** Call once on app mount to preload critical sounds */
export function preloadSounds(): void {
  for (const path of PRELOAD_PATHS) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = 0;
    // Trigger browser to fetch without playing
    audio.load();
    _audioCache.set(path, audio);
  }
}

// ─── Public API: Sound effects ───

export const sfx = {
  // ─── UI / Interface ───

  /** Button click */
  click: () => playRandom([INTERFACE_SOUNDS.click1, INTERFACE_SOUNDS.click2, INTERFACE_SOUNDS.click3], 0.7),

  /** Confirmation action (save, submit, accept) */
  confirm: () => playRandom([INTERFACE_SOUNDS.confirm1, INTERFACE_SOUNDS.confirm2], 0.8),

  /** Modal/panel open */
  modalOpen: () => playFile(INTERFACE_SOUNDS.open1, 0.6),

  /** Modal/panel close */
  modalClose: () => playRandom([INTERFACE_SOUNDS.close1, INTERFACE_SOUNDS.close2], 0.6),

  /** Error feedback */
  error: () => playRandom([INTERFACE_SOUNDS.error1, INTERFACE_SOUNDS.error2], 0.7),

  /** Toggle switch */
  toggle: () => playRandom([INTERFACE_SOUNDS.toggle1, INTERFACE_SOUNDS.toggle2], 0.5),

  /** Tab switch / navigation */
  tabSwitch: () => playFile(INTERFACE_SOUNDS.pluck1, 0.5),

  /** Back / cancel */
  back: () => playFile(INTERFACE_SOUNDS.back1, 0.6),

  /** Item drop (drag and drop) */
  drop: () => playRandom([INTERFACE_SOUNDS.drop1, INTERFACE_SOUNDS.drop2], 0.6),

  /** Hover / rollover (use sparingly) */
  hover: () => playFile(INTERFACE_SOUNDS.scroll1, 0.3),

  // ─── RPG / Gamification ───

  /** XP gain — coin clink */
  xpGain: () => playRandom([RPG_SOUNDS.coins1, RPG_SOUNDS.coins2], 0.6),

  /** Level up — triumphant jingle */
  levelUp: () => playRandom([JINGLES.levelUp1, JINGLES.levelUp2], 0.9),

  /** Loot drop — metallic shimmer */
  lootDrop: () => {
    playFile(RPG_SOUNDS.metalLatch, 0.7);
    setTimeout(() => playFile(DIGITAL_SOUNDS.powerUp1, 0.5), 150);
  },

  /** Quest accepted — book open + confirmation */
  questAccept: () => {
    playFile(RPG_SOUNDS.bookOpen, 0.6);
    setTimeout(() => playFile(INTERFACE_SOUNDS.confirm1, 0.5), 200);
  },

  /** Quest deployed — metal click + descending tone */
  questDeploy: () => {
    playFile(RPG_SOUNDS.metalClick, 0.6);
    setTimeout(() => playFile(DIGITAL_SOUNDS.highDown, 0.5), 100);
  },

  /** Equip item — leather + metal */
  equip: () => {
    playRandom([RPG_SOUNDS.leather1, RPG_SOUNDS.leather2], 0.7);
    setTimeout(() => playFile(RPG_SOUNDS.metalClick, 0.5), 80);
  },

  /** Salvage / disenchant */
  salvage: () => {
    playFile(RPG_SOUNDS.chop, 0.6);
    setTimeout(() => playFile(IMPACT_SOUNDS.mining, 0.5), 100);
  },

  /** Craft complete */
  craft: () => {
    playFile(IMPACT_SOUNDS.metalHeavy, 0.6);
    setTimeout(() => playFile(DIGITAL_SOUNDS.powerUp2, 0.5), 200);
  },

  /** Chat message sent */
  messageSend: () => playFile(INTERFACE_SOUNDS.pluck2, 0.4),

  /** Notification received */
  notification: () => {
    playFile(DIGITAL_SOUNDS.twoTone1, 0.6);
  },

  /** Achievement unlocked — fanfare jingle */
  achievement: () => playFile(JINGLES.achievement, 1.0),

  /** Daily login reward */
  dailyReward: () => playFile(JINGLES.reward1, 0.8),

  /** Fortune wheel spin — casino chips */
  wheelSpin: () => {
    playFile(CASINO_SOUNDS.dieThrow1, 0.7);
  },

  /** Fortune wheel tick (per slot) */
  wheelTick: () => playRandom([CASINO_SOUNDS.chipLay1, CASINO_SOUNDS.chipLay2], 0.4),

  /** Fortune wheel prize reveal */
  wheelPrize: () => {
    playFile(CASINO_SOUNDS.chipsStack, 0.8);
    setTimeout(() => playFile(JINGLES.reward2, 0.7), 200);
  },

  /** Skill tree unlock */
  skillUnlock: () => {
    playFile(DIGITAL_SOUNDS.powerUp3, 0.7);
    setTimeout(() => playFile(DIGITAL_SOUNDS.threeTone1, 0.5), 200);
  },

  /** Boss hit */
  bossHit: () => playRandom([IMPACT_SOUNDS.punch, IMPACT_SOUNDS.metalLight], 0.7),

  /** Boss defeated — epic jingle */
  bossDefeated: () => playRandom([JINGLES.bossDefeat1, JINGLES.bossDefeat2, JINGLES.bossDefeat3], 1.0),

  /** Gem socket — crystalline click */
  gemSocket: () => {
    playFile(IMPACT_SOUNDS.glass, 0.5);
    setTimeout(() => playFile(DIGITAL_SOUNDS.highUp, 0.4), 100);
  },

  /** Party join */
  partyJoin: () => playFile(DIGITAL_SOUNDS.threeTone2, 0.6),

  /** Chest / loot box opening */
  chestOpen: () => {
    playFile(RPG_SOUNDS.creak, 0.6);
    setTimeout(() => playFile(RPG_SOUNDS.lockOpen, 0.5), 200);
    setTimeout(() => playFile(DIGITAL_SOUNDS.powerUp1, 0.5), 450);
  },

  /** Lesson/resource opened — book open */
  lessonOpen: () => playFile(RPG_SOUNDS.bookOpen, 0.5),

  /** Lesson/resource closed — book close */
  lessonClose: () => playFile(RPG_SOUNDS.bookClose, 0.5),

  /** Dungeon entry — door creak + open */
  dungeonEntry: () => {
    playFile(RPG_SOUNDS.creak, 0.6);
    setTimeout(() => playFile(RPG_SOUNDS.doorOpen, 0.6), 300);
  },

  /** Assignment submitted */
  assignmentComplete: () => playRandom([JINGLES.questComplete1, JINGLES.questComplete2], 0.8),

  /** Coin collection (flux/currency) */
  coinCollect: () => playRandom([RPG_SOUNDS.coins1, RPG_SOUNDS.coins2], 0.5),

  /** Purchase / spend currency */
  purchase: () => {
    playFile(CASINO_SOUNDS.chipsHandle1, 0.6);
    setTimeout(() => playFile(INTERFACE_SOUNDS.confirm1, 0.4), 150);
  },
};

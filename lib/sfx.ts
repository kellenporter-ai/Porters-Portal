
// Sound Effects System for Porter's Portal
// Uses Web Audio API to generate synthetic sounds — no audio files needed.

let audioCtx: AudioContext | null = null;
let _enabled = true;

/** Call once when user settings load to enable/disable all sounds */
export function setSfxEnabled(enabled: boolean) {
  _enabled = enabled;
}

function getCtx(): AudioContext {
  if (!audioCtx) {
    const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtxCtor();
  }
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (!_enabled) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Silently fail if audio context not available
  }
}

export const sfx = {
  /** Small XP gain — quick ascending blip */
  xpGain: () => {
    playTone(600, 0.1, 'sine', 0.1);
    setTimeout(() => playTone(900, 0.15, 'sine', 0.08), 80);
  },

  /** Level up — triumphant ascending arpeggio */
  levelUp: () => {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.3, 'triangle', 0.12), i * 120);
    });
  },

  /** Loot drop — shimmering metallic sound */
  lootDrop: () => {
    playTone(1200, 0.15, 'sine', 0.08);
    setTimeout(() => playTone(1500, 0.12, 'sine', 0.06), 100);
    setTimeout(() => playTone(1800, 0.2, 'triangle', 0.05), 180);
  },

  /** Quest accepted — confident two-tone confirmation */
  questAccept: () => {
    playTone(440, 0.15, 'square', 0.06);
    setTimeout(() => playTone(660, 0.2, 'square', 0.06), 120);
  },

  /** Quest deployed — descending urgent tone */
  questDeploy: () => {
    playTone(880, 0.12, 'sawtooth', 0.05);
    setTimeout(() => playTone(660, 0.12, 'sawtooth', 0.05), 100);
    setTimeout(() => playTone(550, 0.2, 'sawtooth', 0.04), 200);
  },

  /** Equip item — mechanical click */
  equip: () => {
    playTone(200, 0.05, 'square', 0.1);
    setTimeout(() => playTone(400, 0.08, 'sine', 0.08), 50);
  },

  /** Salvage/disenchant — breaking/dissolving */
  salvage: () => {
    playTone(300, 0.15, 'sawtooth', 0.06);
    setTimeout(() => playTone(200, 0.2, 'sawtooth', 0.04), 100);
    setTimeout(() => playTone(100, 0.3, 'sawtooth', 0.03), 200);
  },

  /** Craft complete — forge hammer */
  craft: () => {
    playTone(150, 0.08, 'square', 0.1);
    setTimeout(() => playTone(800, 0.2, 'triangle', 0.08), 60);
  },

  /** Error / insufficient funds */
  error: () => {
    playTone(200, 0.15, 'square', 0.08);
    setTimeout(() => playTone(150, 0.2, 'square', 0.06), 120);
  },

  /** Chat message sent */
  messageSend: () => {
    playTone(500, 0.06, 'sine', 0.05);
  },

  /** Notification received */
  notification: () => {
    playTone(800, 0.1, 'sine', 0.06);
    setTimeout(() => playTone(1000, 0.12, 'sine', 0.04), 120);
  },
};

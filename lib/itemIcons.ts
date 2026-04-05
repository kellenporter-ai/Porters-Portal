/**
 * Item Icon Mapping Utility
 *
 * Maps RPGItem visualId + slot + rarity to custom cyberpunk gear icon PNGs.
 * Icons live in /public/assets/items/gear/ and are served as static assets.
 */

import { ItemRarity } from '../types';

// Base path for item icon PNGs (relative to public root)
const ICON_BASE = '/assets/items/gear';

// ─── visualId → icon filename mapping ────────────────────────────────────
// Each visualId from BASE_ITEMS gets a normal icon and an epic variant
// for RARE/UNIQUE rarities.

interface IconVariant {
  normal: string;
  epic?: string; // Used for RARE/UNIQUE rarity
}

const VISUAL_ID_ICONS: Record<string, IconVariant> = {
  // HEAD
  visor:     { normal: 'visor.png',      epic: 'visor_epic.png' },
  helm:      { normal: 'helm.png',       epic: 'helm_epic.png' },
  band:      { normal: 'band.png',       epic: 'band_epic.png' },

  // CHEST
  vest:      { normal: 'vest.png',       epic: 'vest_epic.png' },
  coat:      { normal: 'coat.png',       epic: 'coat_epic.png' },
  plate:     { normal: 'plate.png',      epic: 'plate_epic.png' },

  // HANDS
  gloves:    { normal: 'gloves.png',     epic: 'gloves_epic.png' },
  gauntlets: { normal: 'gauntlets.png',  epic: 'gauntlets_epic.png' },
  grips:     { normal: 'grips.png',      epic: 'grips_epic.png' },

  // FEET
  boots:     { normal: 'boots.png',      epic: 'boots_epic.png' },
  treads:    { normal: 'treads.png',     epic: 'treads_epic.png' },
  stabs:     { normal: 'stabs.png',      epic: 'stabs_epic.png' },

  // BELT
  belt:      { normal: 'belt.png',       epic: 'belt_epic.png' },
  sash:      { normal: 'sash.png',       epic: 'sash_epic.png' },

  // WEAPON
  sword:     { normal: 'sword.png',      epic: 'sword_epic.png' },
  staff:     { normal: 'staff.png',      epic: 'staff_epic.png' },
  baton:     { normal: 'baton.png',      epic: 'baton_epic.png' },
};

// ─── Slot-based fallback icons ───────────────────────────────────────────

const SLOT_FALLBACK_ICONS: Record<string, IconVariant> = {
  HEAD:   { normal: 'visor.png',     epic: 'visor_epic.png' },
  CHEST:  { normal: 'vest.png',      epic: 'vest_epic.png' },
  HANDS:  { normal: 'gloves.png',    epic: 'gloves_epic.png' },
  FEET:   { normal: 'boots.png',     epic: 'boots_epic.png' },
  BELT:   { normal: 'belt.png',      epic: 'belt_epic.png' },
  AMULET: { normal: 'chip.png',      epic: 'chip_rare.png' },
  RING:   { normal: 'ring.png',      epic: 'ring_rare.png' },
  WEAPON: { normal: 'sword.png',     epic: 'sword_epic.png' },
};

// ─── Rarity-specific icons for rings ────────────────────────────────────

const RARITY_RING_ICONS: Record<ItemRarity, string> = {
  COMMON:   'ring.png',
  UNCOMMON: 'ring_uncommon.png',
  RARE:     'ring_rare.png',
  UNIQUE:   'ring_rare.png',
};

const RARITY_FOCUS_BAND_ICONS: Record<ItemRarity, string> = {
  COMMON:   'focus_band.png',
  UNCOMMON: 'focus_band_uncommon.png',
  RARE:     'focus_band_rare.png',
  UNIQUE:   'focus_band_unique.png',
};

// ─── Rarity-specific icons for amulets ──────────────────────────────────

const RARITY_CHIP_ICONS: Record<ItemRarity, string> = {
  COMMON:   'chip.png',
  UNCOMMON: 'chip_uncommon.png',
  RARE:     'chip_rare.png',
  UNIQUE:   'chip_unique.png',
};

const RARITY_CORE_ICONS: Record<ItemRarity, string> = {
  COMMON:   'core.png',
  UNCOMMON: 'core_uncommon.png',
  RARE:     'core_rare.png',
  UNIQUE:   'core_unique.png',
};

// ─── Named unique item icons ────────────────────────────────────────────

const UNIQUE_ICONS: Record<string, string> = {
  "unique_newton's_prism": 'unique_newtons_prism.png',
  "unique_tesla's_coils": 'unique_teslas_coils.png',
  "unique_curie's_determination": 'unique_curies_determination.png',
  "unique_einstein's_relativistic_boots": 'unique_einsteins_boots.png',
  "unique_galileo's_telescope": 'unique_galileos_telescope.png',
  "unique_archimedes'_lever": 'unique_archimedes_lever.png',
};

/**
 * Returns the icon path for an RPG item based on its visualId, slot, and rarity.
 */
export function getItemIconPath(
  visualId: string,
  slot: string,
  rarity: ItemRarity = 'COMMON'
): string {
  const isHighRarity = rarity === 'RARE' || rarity === 'UNIQUE';

  // Named unique items get their own dedicated art
  if (visualId && UNIQUE_ICONS[visualId]) {
    return `${ICON_BASE}/${UNIQUE_ICONS[visualId]}`;
  }

  // Rings get rarity-specific icons
  if (slot === 'RING' || slot === 'RING1' || slot === 'RING2') {
    if (visualId === 'ring') {
      return `${ICON_BASE}/${RARITY_RING_ICONS[rarity]}`;
    }
    if (visualId === 'band') {
      return `${ICON_BASE}/${RARITY_FOCUS_BAND_ICONS[rarity]}`;
    }
  }

  // Amulets get rarity-specific icons
  if (slot === 'AMULET') {
    if (visualId === 'chip') {
      return `${ICON_BASE}/${RARITY_CHIP_ICONS[rarity]}`;
    }
    if (visualId === 'core') {
      return `${ICON_BASE}/${RARITY_CORE_ICONS[rarity]}`;
    }
  }

  // Standard visualId mapping
  const mapping = VISUAL_ID_ICONS[visualId];
  if (mapping) {
    const filename = (isHighRarity && mapping.epic) ? mapping.epic : mapping.normal;
    return `${ICON_BASE}/${filename}`;
  }

  // Slot-based fallback
  const slotFallback = SLOT_FALLBACK_ICONS[slot];
  if (slotFallback) {
    const filename = (isHighRarity && slotFallback.epic) ? slotFallback.epic : slotFallback.normal;
    return `${ICON_BASE}/${filename}`;
  }

  // Ultimate fallback
  return `${ICON_BASE}/sword.png`;
}

/**
 * Item Icon Mapping Utility
 *
 * Maps RPGItem visualId + slot + rarity to Quaternius Ultimate RPG Items icon PNGs.
 * Icons live in /public/assets/items/ and are served as static assets.
 */

import { ItemRarity } from '../types';

// Base path for item icon PNGs (relative to public root)
const ICON_BASE = '/assets/items';

// ─── visualId → icon filename mapping ────────────────────────────────────
// Each visualId from BASE_ITEMS in the server gets a specific icon.
// Golden variants are used for RARE/UNIQUE rarities when available.

interface IconVariant {
  normal: string;
  golden?: string; // Used for RARE/UNIQUE rarity
}

const VISUAL_ID_ICONS: Record<string, IconVariant> = {
  // HEAD
  visor:     { normal: 'Crown2.png',       golden: 'Crown.png' },
  helm:      { normal: 'Crown2.png',       golden: 'Crown.png' },
  band:      { normal: 'Necklace2.png',    golden: 'Necklace3.png' },

  // CHEST
  vest:      { normal: 'Armor_Leather.png', golden: 'Armor_Golden.png' },
  coat:      { normal: 'Armor_Leather.png', golden: 'Armor_Golden.png' },
  plate:     { normal: 'Armor_Metal.png',   golden: 'Armor_Golden.png' },

  // HANDS
  gloves:    { normal: 'Glove.png' },
  gauntlets: { normal: 'Glove.png' },
  grips:     { normal: 'Glove.png' },

  // FEET
  boots:     { normal: 'Dagger.png',        golden: 'Dagger_Golden.png' },
  treads:    { normal: 'Dagger.png',        golden: 'Dagger_Golden.png' },
  stabs:     { normal: 'Dagger.png',        golden: 'Dagger_Golden.png' },

  // BELT
  belt:      { normal: 'Pouch.png',         golden: 'Backpack.png' },
  sash:      { normal: 'Pouch.png' },

  // AMULET
  chip:      { normal: 'Crystal1.png',      golden: 'Crystal4.png' },
  core:      { normal: 'Crystal2.png',      golden: 'Crystal3.png' },

  // RING
  ring:      { normal: 'Ring1.png',         golden: 'Ring5.png' },
  // "band" for RING slot is already mapped above; the slot-based fallback handles it
};

// ─── Slot-based fallback icons ───────────────────────────────────────────
// Used when visualId doesn't match any known mapping.

const SLOT_FALLBACK_ICONS: Record<string, IconVariant> = {
  HEAD:   { normal: 'Crown2.png',        golden: 'Crown.png' },
  CHEST:  { normal: 'Armor_Leather.png', golden: 'Armor_Golden.png' },
  HANDS:  { normal: 'Glove.png' },
  FEET:   { normal: 'Dagger.png',        golden: 'Dagger_Golden.png' },
  BELT:   { normal: 'Pouch.png',         golden: 'Backpack.png' },
  AMULET: { normal: 'Necklace1.png',     golden: 'Necklace3.png' },
  RING:   { normal: 'Ring1.png',         golden: 'Ring5.png' },
};

// ─── Rarity-specific ring icons for visual variety ───────────────────────
const RARITY_RING_ICONS: Record<ItemRarity, string> = {
  COMMON:   'Ring1.png',
  UNCOMMON: 'Ring2.png',
  RARE:     'Ring5.png',
  UNIQUE:   'Ring7.png',
};

const RARITY_CRYSTAL_ICONS: Record<ItemRarity, string> = {
  COMMON:   'Crystal1.png',
  UNCOMMON: 'Crystal2.png',
  RARE:     'Crystal3.png',
  UNIQUE:   'Crystal5.png',
};

/**
 * Returns the icon path for an RPG item based on its visualId, slot, and rarity.
 *
 * @param visualId - The item's visualId string
 * @param slot     - The equipment slot (HEAD, CHEST, etc.)
 * @param rarity   - The item rarity for golden variant selection
 * @returns Absolute path to the icon PNG from public root, or null if no mapping
 */
export function getItemIconPath(
  visualId: string,
  slot: string,
  rarity: ItemRarity = 'COMMON'
): string {
  const isHighRarity = rarity === 'RARE' || rarity === 'UNIQUE';

  // Special case: rings get rarity-specific icons
  if (slot === 'RING' || slot === 'RING1' || slot === 'RING2') {
    if (visualId === 'ring' || visualId === 'band') {
      return `${ICON_BASE}/${RARITY_RING_ICONS[rarity]}`;
    }
  }

  // Special case: amulet chips/cores get rarity-specific crystal icons
  if (slot === 'AMULET' && (visualId === 'chip' || visualId === 'core')) {
    return `${ICON_BASE}/${RARITY_CRYSTAL_ICONS[rarity]}`;
  }

  // Check visualId mapping first
  const mapping = VISUAL_ID_ICONS[visualId];
  if (mapping) {
    const filename = (isHighRarity && mapping.golden) ? mapping.golden : mapping.normal;
    return `${ICON_BASE}/${filename}`;
  }

  // Check unique items (visualId starts with "unique_")
  if (visualId.startsWith('unique_')) {
    // For unique items, use the slot fallback with golden variant
    const fallback = SLOT_FALLBACK_ICONS[slot];
    if (fallback) {
      return `${ICON_BASE}/${fallback.golden || fallback.normal}`;
    }
  }

  // Slot-based fallback
  const slotFallback = SLOT_FALLBACK_ICONS[slot];
  if (slotFallback) {
    const filename = (isHighRarity && slotFallback.golden) ? slotFallback.golden : slotFallback.normal;
    return `${ICON_BASE}/${filename}`;
  }

  // Ultimate fallback
  return `${ICON_BASE}/Star.png`;
}

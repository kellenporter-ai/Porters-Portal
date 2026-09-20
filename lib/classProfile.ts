import { User, RPGItem, EquipmentSlot } from '../types';

/**
 * Defensive normalizer for legacy lowercase slot vocab used by older
 * Cloud Functions (helmet, boots, accessory1, etc.). Maps to the canonical
 * uppercase EquipmentSlot / ItemSlot vocab. Unknown slots are passed through
 * so callers can decide to hide them (e.g. mount).
 */
const SLOT_MAP: Record<string, string> = {
  helmet: 'HEAD',
  head: 'HEAD',
  chest: 'CHEST',
  gloves: 'HANDS',
  hands: 'HANDS',
  boots: 'FEET',
  feet: 'FEET',
  belt: 'BELT',
  weapon: 'WEAPON',
  accessory1: 'RING',
  accessory2: 'AMULET',
  mount: 'MOUNT',
};

export function normalizeSlotKey(slot: string): string {
  if (!slot) return slot;
  const upper = slot.toUpperCase();
  if (upper === 'RING1' || upper === 'RING2') return 'RING';
  if (upper === 'WEAPON1' || upper === 'WEAPON2') return 'WEAPON';
  return SLOT_MAP[slot] || SLOT_MAP[upper.toLowerCase()] || upper;
}

export function normalizeEquipped(equipped: Record<string, RPGItem | undefined> | undefined): Partial<Record<EquipmentSlot, RPGItem>> {
  if (!equipped) return {};
  const out: Partial<Record<EquipmentSlot, RPGItem>> = {};
  for (const [key, item] of Object.entries(equipped)) {
    if (!item) continue;
    const canonical = normalizeSlotKey(key);
    // Skip hidden/unknown slots (e.g. mount) — keep them out of the loadout grid.
    if (canonical === 'MOUNT' || !item.slot) continue;
    const normalizedItem = item.slot && item.slot === canonical ? item : { ...item, slot: canonical as RPGItem['slot'] };
    // First-write-wins for paired slots (RING1/RING2 both map to RING).
    if (!out[canonical as EquipmentSlot]) out[canonical as EquipmentSlot] = normalizedItem;
  }
  return out;
}

/**
 * Resolves the inventory, equipped, and appearance for a specific class.
 * Uses classProfiles[classType] if available, falling back to legacy global fields.
 * This allows gradual migration — old data still works, new data is per-class.
 */
export interface ClassProfile {
    inventory: RPGItem[];
    equipped: Partial<Record<EquipmentSlot, RPGItem>>;
    appearance: { bodyType: 'A' | 'B' | 'C'; hue: number; suitHue?: number; skinTone?: number; hairStyle?: number; hairColor?: number };
}

export function getClassProfile(user: User, classType: string): ClassProfile {
    const gam = user.gamification;
    if (!gam) {
        return {
            inventory: [],
            equipped: {},
            appearance: { bodyType: 'A', hue: 0 },
        };
    }

    // Check for per-class profile first
    const profile = gam.classProfiles?.[classType];
    if (profile) {
        return {
            inventory: profile.inventory || [],
            equipped: normalizeEquipped(profile.equipped),
            appearance: profile.appearance || { bodyType: 'A', hue: 0 },
        };
    }

    // Fallback to legacy global fields
    return {
        inventory: gam.inventory || [],
        equipped: normalizeEquipped(gam.equipped),
        appearance: gam.appearance || { bodyType: 'A', hue: 0 },
    };
}

/**
 * Returns the Firestore path prefix for a class profile.
 * Used by Cloud Functions to read/write the correct sub-document.
 */
export function classProfilePath(classType: string): string {
    return `gamification.classProfiles.${classType}`;
}

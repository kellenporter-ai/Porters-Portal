// Tests for defensive slot-key normalization in lib/classProfile.ts.
// Locks the read-boundary fix for the lowercase/uppercase equipment slot
// vocabulary mismatch (items were invisible in the loadout when CF wrote
// lowercase keys like "boots" and the UI looked up "FEET").
import { describe, it, expect } from 'vitest';
import { normalizeSlotKey, normalizeEquipped, getClassProfile } from '../classProfile';
import type { User, RPGItem } from '../../types';

describe('normalizeSlotKey', () => {
  it('maps legacy lowercase vocab to canonical uppercase', () => {
    expect(normalizeSlotKey('helmet')).toBe('HEAD');
    expect(normalizeSlotKey('chest')).toBe('CHEST');
    expect(normalizeSlotKey('gloves')).toBe('HANDS');
    expect(normalizeSlotKey('boots')).toBe('FEET');
    expect(normalizeSlotKey('belt')).toBe('BELT');
    expect(normalizeSlotKey('weapon')).toBe('WEAPON');
    expect(normalizeSlotKey('accessory1')).toBe('RING');
    expect(normalizeSlotKey('accessory2')).toBe('AMULET');
  });

  it('passes through canonical uppercase', () => {
    expect(normalizeSlotKey('HEAD')).toBe('HEAD');
    expect(normalizeSlotKey('FEET')).toBe('FEET');
    expect(normalizeSlotKey('RING')).toBe('RING');
  });

  it('collapses paired slots to canonical ItemSlot', () => {
    expect(normalizeSlotKey('RING1')).toBe('RING');
    expect(normalizeSlotKey('RING2')).toBe('RING');
    expect(normalizeSlotKey('WEAPON1')).toBe('WEAPON');
    expect(normalizeSlotKey('WEAPON2')).toBe('WEAPON');
  });

  it('uppercases unknown slots', () => {
    expect(normalizeSlotKey('charm')).toBe('CHARM');
  });
});

describe('normalizeEquipped', () => {
  it('rewrites lowercase keys to uppercase and normalizes item.slot', () => {
    const boots = { id: '1', name: 'Agile Stealth Boots', slot: 'boots' } as unknown as RPGItem;
    const helmet = { id: '2', name: 'Tactical Visor', slot: 'helmet' } as unknown as RPGItem;
    const out = normalizeEquipped({ boots, helmet }) as Record<string, RPGItem | undefined>;
    expect(out.FEET?.name).toBe('Agile Stealth Boots');
    expect(out.FEET?.slot).toBe('FEET');
    expect(out.HEAD?.slot).toBe('HEAD');
    expect(out.boots).toBeUndefined();
  });

  it('excludes mount items from the loadout map', () => {
    const mount = { id: '3', name: 'Hover Bike', slot: 'mount' } as unknown as RPGItem;
    const out = normalizeEquipped({ mount }) as Record<string, RPGItem | undefined>;
    expect(out.MOUNT).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('drops items with no slot field', () => {
    const noSlot = { id: '4', name: 'Mystery' } as unknown as RPGItem;
    const out = normalizeEquipped({ CHEST: noSlot }) as Record<string, RPGItem | undefined>;
    expect(out.CHEST).toBeUndefined();
  });

  it('first-write-wins when paired keys collide', () => {
    const ringA = { id: '5', name: 'Ring A', slot: 'RING' } as unknown as RPGItem;
    const ringB = { id: '6', name: 'Ring B', slot: 'RING' } as unknown as RPGItem;
    const out = normalizeEquipped({ RING1: ringA, RING2: ringB }) as Record<string, RPGItem | undefined>;
    expect(out.RING?.name).toBe('Ring A');
  });
});

describe('getClassProfile — defensive normalization', () => {
  const makeUser = (equipped: Record<string, RPGItem>): User => ({
    gamification: {
      classProfiles: {
        'Sandbox Class': { equipped, inventory: [], appearance: { bodyType: 'A', hue: 0 } },
      },
    },
  } as unknown as User);

  it('normalizes legacy lowercase keys from a per-class profile', () => {
    const boots = { id: '1', name: 'Agile Stealth Boots', slot: 'boots' } as unknown as RPGItem;
    const profile = getClassProfile(makeUser({ boots }), 'Sandbox Class');
    expect(profile.equipped.FEET?.name).toBe('Agile Stealth Boots');
    expect((profile.equipped as Record<string, RPGItem | undefined>).boots).toBeUndefined();
  });

  it('returns canonical data unchanged', () => {
    const chest = { id: '2', name: 'Plated Vest', slot: 'CHEST' } as unknown as RPGItem;
    const profile = getClassProfile(makeUser({ CHEST: chest }), 'Sandbox Class');
    expect(profile.equipped.CHEST?.name).toBe('Plated Vest');
  });
});

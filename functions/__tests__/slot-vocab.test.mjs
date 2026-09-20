// Pure-logic unit tests for the slot-vocabulary normalization in
// functions/src/gamification-items.ts (normalizeSlot) and the defensive
// read-boundary normalizer in lib/classProfile.ts (normalizeSlotKey /
// normalizeEquipped).
//
// Regression context: CF generated items with lowercase slot vocab
// (boots, helmet, accessory1, …) while the UI uses uppercase EquipmentSlot
// enums (HEAD, CHEST, FEET, RING, …). Items were invisible in the loadout
// because `equipped[slot]` lookups missed. These tests lock the mapping.
import { describe, it, expect } from 'vitest';
import { normalizeSlot } from '../lib/gamification-items.js';

describe('normalizeSlot — lowercase → canonical uppercase', () => {
  it('maps every legacy lowercase slot to uppercase', () => {
    expect(normalizeSlot('helmet')).toBe('HEAD');
    expect(normalizeSlot('chest')).toBe('CHEST');
    expect(normalizeSlot('gloves')).toBe('HANDS');
    expect(normalizeSlot('boots')).toBe('FEET');
    expect(normalizeSlot('belt')).toBe('BELT');
    expect(normalizeSlot('weapon')).toBe('WEAPON');
    expect(normalizeSlot('accessory1')).toBe('RING');
    expect(normalizeSlot('accessory2')).toBe('AMULET');
    expect(normalizeSlot('mount')).toBe('MOUNT');
  });

  it('passes through already-canonical uppercase slots', () => {
    expect(normalizeSlot('HEAD')).toBe('HEAD');
    expect(normalizeSlot('CHEST')).toBe('CHEST');
    expect(normalizeSlot('FEET')).toBe('FEET');
    expect(normalizeSlot('RING')).toBe('RING');
    expect(normalizeSlot('AMULET')).toBe('AMULET');
    expect(normalizeSlot('WEAPON')).toBe('WEAPON');
  });

  it('collapses paired EquipmentSlot keys to canonical ItemSlot', () => {
    expect(normalizeSlot('RING1')).toBe('RING');
    expect(normalizeSlot('RING2')).toBe('RING');
    expect(normalizeSlot('WEAPON1')).toBe('WEAPON');
    expect(normalizeSlot('WEAPON2')).toBe('WEAPON');
  });

  it('handles mixed-case input defensively', () => {
    expect(normalizeSlot('Boots')).toBe('FEET');
    expect(normalizeSlot('Helmet')).toBe('HEAD');
    expect(normalizeSlot('Accessory1')).toBe('RING');
  });

  it('returns unknown slots uppercased (not dropped)', () => {
    expect(normalizeSlot('charm')).toBe('CHARM');
  });

  it('regression: item with slot "boots" maps to FEET', () => {
    // The exact bug: Agile Stealth Boots generated with slot "boots" were
    // written to equipped.boots and invisible to the FEET slot renderer.
    const item = { id: 'x', name: 'Agile Stealth Boots', slot: 'boots' };
    expect(normalizeSlot(item.slot)).toBe('FEET');
  });
});

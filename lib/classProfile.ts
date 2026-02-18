import { User, RPGItem, EquipmentSlot } from '../types';

/**
 * Resolves the inventory, equipped, and appearance for a specific class.
 * Uses classProfiles[classType] if available, falling back to legacy global fields.
 * This allows gradual migration — old data still works, new data is per-class.
 */
export interface ClassProfile {
    inventory: RPGItem[];
    equipped: Partial<Record<EquipmentSlot, RPGItem>>;
    appearance: { bodyType: 'A' | 'B'; hue: number; skinTone?: number; hairStyle?: number; hairColor?: number };
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
            equipped: profile.equipped || {},
            appearance: profile.appearance || { bodyType: 'A', hue: 0 },
        };
    }

    // Fallback to legacy global fields
    return {
        inventory: gam.inventory || [],
        equipped: gam.equipped || {},
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

/**
 * Hair Model Manifest — DEPRECATED
 *
 * Hair overlays were removed when switching from Quaternius to KayKit characters.
 * KayKit models have built-in hair baked into their texture atlases.
 *
 * This file is kept for backwards compatibility with existing Firestore
 * user profiles that may still have hairStyle values stored.
 * The 2D Classic avatar system uses HAIR_STYLE_NAMES from OperativeAvatar.tsx
 * independently of this file.
 */

export interface HairModelDef {
    id: string;
    name: string;
    modelPath: string;
}

export const HAIR_MODELS: HairModelDef[] = [];

export const getHairModel = (_index: number): HairModelDef | undefined => undefined;

export const HAIR_STYLE_COUNT = 1; // Only "Default" (index 0)

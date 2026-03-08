/**
 * Hair Model Manifest
 *
 * Defines swappable 3D hair overlays for the avatar system.
 * Hair GLBs are from Quaternius Universal Base Characters (CC0).
 * They're positioned at world origin to match character model head placement.
 *
 * hairStyle index 0 = "Default" (use the character model's built-in hair).
 * hairStyle 1+ = overlay from this manifest (hides built-in hair).
 */

export interface HairModelDef {
    id: string;
    name: string;
    /** Path relative to public/ */
    modelPath: string;
}

export const HAIR_MODELS: HairModelDef[] = [
    { id: 'hair_buzzed', name: 'Buzzed', modelPath: '/assets/models/characters/hair/Hair_Buzzed.glb' },
    { id: 'hair_simple', name: 'Simple Part', modelPath: '/assets/models/characters/hair/Hair_SimpleParted.glb' },
    { id: 'hair_long', name: 'Long', modelPath: '/assets/models/characters/hair/Hair_Long.glb' },
    { id: 'hair_beard', name: 'Beard', modelPath: '/assets/models/characters/hair/Hair_Beard.glb' },
];

/** Get hair model by index (1-based; 0 = default/built-in) */
export const getHairModel = (index: number): HairModelDef | undefined =>
    index > 0 ? HAIR_MODELS[index - 1] : undefined;

/** Total selectable styles including "Default" (index 0) */
export const HAIR_STYLE_COUNT = HAIR_MODELS.length + 1;

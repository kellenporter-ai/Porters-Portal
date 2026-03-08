/**
 * Character Model Manifest
 *
 * Defines all 3D character models available in the portal.
 * Models are KayKit Adventurers (CC0) GLB files served from /assets/models/characters/.
 * These use texture atlases — tinting is done via diffuseColor multiplication on
 * per-mesh StandardMaterials (see Avatar3D.tsx).
 *
 * Pricing tiers:
 *   - Free starters: Knight, Barbarian
 *   - Standard (200 Flux): Mage, Ranger, Rogue
 *   - Premium (400 Flux): Rogue Hooded
 */

/** Master kill-switch for all 3D avatar rendering. Set to false to force 2D for everyone. */
export const ENABLE_3D_AVATAR = false;

export interface CharacterModelDef {
    id: string;
    name: string;
    description: string;
    /** Path relative to public/ — served by Vite at runtime */
    modelPath: string;
    /** Approximate file size in KB for loading indicators */
    fileSizeKB: number;
    /** Flux cost — 0 means free default */
    cost: number;
    /** Category for shop filtering */
    category: 'starter' | 'standard' | 'premium';
    /** Display order in selection UI */
    sortOrder: number;
    /** Thumbnail color for fallback display (dominant outfit color) */
    thumbnailColor: string;
    /** Short tag for compact display */
    tag: string;
}

export const CHARACTER_MODELS: CharacterModelDef[] = [
    // === FREE STARTERS ===
    {
        id: 'char_knight',
        name: 'Knight',
        description: 'Armored protector — shield up, visor down',
        modelPath: '/assets/models/characters/Knight.glb',
        fileSizeKB: 333,
        cost: 0,
        category: 'starter',
        sortOrder: 1,
        thumbnailColor: '#7a8b9e',
        tag: 'Free',
    },
    {
        id: 'char_barbarian',
        name: 'Barbarian',
        description: 'Fierce warrior — raw strength, no mercy',
        modelPath: '/assets/models/characters/Barbarian.glb',
        fileSizeKB: 377,
        cost: 0,
        category: 'starter',
        sortOrder: 2,
        thumbnailColor: '#8b6b4a',
        tag: 'Free',
    },
    // === STANDARD (200 Flux) ===
    {
        id: 'char_mage',
        name: 'Mage',
        description: 'Arcane scholar — knowledge is the ultimate weapon',
        modelPath: '/assets/models/characters/Mage.glb',
        fileSizeKB: 344,
        cost: 200,
        category: 'standard',
        sortOrder: 10,
        thumbnailColor: '#5a3d8a',
        tag: '200',
    },
    {
        id: 'char_ranger',
        name: 'Ranger',
        description: 'Wilderness expert — steady aim, sharp eyes',
        modelPath: '/assets/models/characters/Ranger.glb',
        fileSizeKB: 473,
        cost: 200,
        category: 'standard',
        sortOrder: 11,
        thumbnailColor: '#2d6b3f',
        tag: '200',
    },
    {
        id: 'char_rogue',
        name: 'Rogue',
        description: 'Shadow operative — quick hands, quicker mind',
        modelPath: '/assets/models/characters/Rogue.glb',
        fileSizeKB: 399,
        cost: 200,
        category: 'standard',
        sortOrder: 12,
        thumbnailColor: '#4a4a6a',
        tag: '200',
    },
    // === PREMIUM (400 Flux) ===
    {
        id: 'char_rogue_hooded',
        name: 'Shadow Rogue',
        description: 'Elite infiltrator — unseen, unheard, unstoppable',
        modelPath: '/assets/models/characters/Rogue_Hooded.glb',
        fileSizeKB: 372,
        cost: 400,
        category: 'premium',
        sortOrder: 20,
        thumbnailColor: '#2e1a3a',
        tag: '400',
    },
];

/** Default character model for new players */
export const DEFAULT_CHARACTER_MODEL = 'char_knight';

/** Get a character model definition by ID */
export const getCharacterModel = (id: string): CharacterModelDef | undefined =>
    CHARACTER_MODELS.find(m => m.id === id);

/** Get all free starter models */
export const getStarterModels = (): CharacterModelDef[] =>
    CHARACTER_MODELS.filter(m => m.category === 'starter');

/** Get models grouped by category */
export const getModelsByCategory = () => ({
    starter: CHARACTER_MODELS.filter(m => m.category === 'starter'),
    standard: CHARACTER_MODELS.filter(m => m.category === 'standard'),
    premium: CHARACTER_MODELS.filter(m => m.category === 'premium'),
});

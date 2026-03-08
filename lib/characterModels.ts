/**
 * Character Model Manifest
 *
 * Defines all 3D character models available in the portal.
 * Models are GLB files served from /assets/models/characters/.
 *
 * Pricing tiers:
 *   - Free defaults: 3 starter models (one per style family)
 *   - Standard (200 Flux): most Quaternius models
 *   - Premium (400 Flux): suit/dress/alternative styles
 */

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
    // === FREE STARTERS (one male, one female, one stylized) ===
    {
        id: 'char_male_casual',
        name: 'Casual Operative',
        description: 'Standard-issue field operative — relaxed but ready',
        modelPath: '/assets/models/characters/Male_Casual.glb',
        fileSizeKB: 672,
        cost: 0,
        category: 'starter',
        sortOrder: 1,
        thumbnailColor: '#4a90d9',
        tag: 'Free',
    },
    {
        id: 'char_female_casual',
        name: 'Casual Agent',
        description: 'Standard-issue field agent — cool under pressure',
        modelPath: '/assets/models/characters/Female_Casual.glb',
        fileSizeKB: 756,
        cost: 0,
        category: 'starter',
        sortOrder: 2,
        thumbnailColor: '#d94a7b',
        tag: 'Free',
    },
    // === STANDARD (200 Flux) ===
    {
        id: 'char_male_shirt',
        name: 'Field Technician',
        description: 'Lab-ready tech specialist — rolled sleeves, sharp mind',
        modelPath: '/assets/models/characters/Male_Shirt.glb',
        fileSizeKB: 676,
        cost: 200,
        category: 'standard',
        sortOrder: 10,
        thumbnailColor: '#e8e8e8',
        tag: '200',
    },
    {
        id: 'char_male_longsleeve',
        name: 'Recon Specialist',
        description: 'Long-range reconnaissance — built for endurance',
        modelPath: '/assets/models/characters/Male_LongSleeve.glb',
        fileSizeKB: 684,
        cost: 200,
        category: 'standard',
        sortOrder: 11,
        thumbnailColor: '#2d5a27',
        tag: '200',
    },
    {
        id: 'char_female_tanktop',
        name: 'Combat Specialist',
        description: 'Close-quarters combat expert — fast and fierce',
        modelPath: '/assets/models/characters/Female_TankTop.glb',
        fileSizeKB: 716,
        cost: 200,
        category: 'standard',
        sortOrder: 12,
        thumbnailColor: '#d97a4a',
        tag: '200',
    },
    // === PREMIUM (400 Flux) ===
    {
        id: 'char_male_suit',
        name: 'Executive Handler',
        description: 'Black-tie infiltration — the boardroom is the battlefield',
        modelPath: '/assets/models/characters/Male_Suit.glb',
        fileSizeKB: 732,
        cost: 400,
        category: 'premium',
        sortOrder: 20,
        thumbnailColor: '#1a1a2e',
        tag: '400',
    },
    {
        id: 'char_female_dress',
        name: 'Gala Operative',
        description: 'High-society cover — elegant and lethal',
        modelPath: '/assets/models/characters/Female_Dress.glb',
        fileSizeKB: 664,
        cost: 400,
        category: 'premium',
        sortOrder: 21,
        thumbnailColor: '#8b1a8b',
        tag: '400',
    },
    {
        id: 'char_female_alt',
        name: 'Shadow Operative',
        description: 'Alternative tactical gear — stands out from the crowd',
        modelPath: '/assets/models/characters/Female_Alternative.glb',
        fileSizeKB: 688,
        cost: 400,
        category: 'premium',
        sortOrder: 22,
        thumbnailColor: '#2e1a4a',
        tag: '400',
    },
];

/** Default character model for new players */
export const DEFAULT_CHARACTER_MODEL = 'char_male_casual';

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

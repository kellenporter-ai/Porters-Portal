import React, { useId, useMemo } from 'react';

// === CUSTOMIZATION PALETTES (exported for customize modal) ===

export const SKIN_TONES = [
    '#FDDCB5', '#F1C27D', '#E0A370', '#C68642',
    '#A0785A', '#8D5524', '#6B3A2A', '#4A2511',
];

export const HAIR_COLORS = [
    '#1a1a2e', '#4a3728', '#8B6914', '#D4A017',
    '#C0392B', '#D5D5D5', '#3498DB', '#8E44AD',
];

export const HAIR_STYLE_NAMES = [
    'Buzz Cut', 'Short Crop', 'Side Part',
    'Long Flow', 'Ponytail', 'Spiky',
    'Afro', 'Curly Bob', 'Space Buns',
    'Braids', 'Pixie Cut', 'Half Up',
];

import { ActiveCosmetics, AgentCosmeticDef } from '../../types';
import { AGENT_COSMETICS } from '../../lib/gamification';

/** Resolved cosmetic props for a single slot */
interface ResolvedCosmetic {
    id: string;
    color: string;
    secondaryColor: string;
    type: 'AURA' | 'PARTICLE' | 'FRAME' | 'TRAIL';
    intensity: number;
    particleCount: number;
}

interface OperativeAvatarProps {
    equipped: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
    appearance?: {
        bodyType?: 'A' | 'B' | 'C';
        hue?: number;
        suitHue?: number;
        skinTone?: number;
        hairStyle?: number;
        hairColor?: number;
    };
    evolutionLevel?: number;
    /** Multi-equip: per-slot cosmetic IDs */
    activeCosmetics?: ActiveCosmetics;
    /** @deprecated Single cosmetic — kept for backward compat */
    activeCosmetic?: string;
    cosmeticColor?: string;
    cosmeticSecondaryColor?: string;
    cosmeticType?: 'AURA' | 'PARTICLE' | 'FRAME' | 'TRAIL';
    cosmeticIntensity?: number;
    cosmeticParticleCount?: number;
}

const RARITY_COLORS: Record<string, { primary: string; glow: string; particle: string; intensity: number }> = {
    COMMON:   { primary: '#64748b', glow: 'rgba(100,116,139,0.3)', particle: '#94a3b8', intensity: 0.3 },
    UNCOMMON: { primary: '#22c55e', glow: 'rgba(34,197,94,0.4)',   particle: '#4ade80', intensity: 0.5 },
    RARE:     { primary: '#3b82f6', glow: 'rgba(59,130,246,0.5)',  particle: '#60a5fa', intensity: 0.7 },
    UNIQUE:   { primary: '#f59e0b', glow: 'rgba(245,158,11,0.6)',  particle: '#fbbf24', intensity: 0.9 },
};

const getRarityStyle = (item: { rarity?: string } | null | undefined) => {
    if (!item) return null;
    return RARITY_COLORS[item.rarity as string] || RARITY_COLORS.COMMON;
};

// === TEXTURE OVERLAY SYSTEM ===
// Rarity-driven opacity for raster texture overlays on equipped armor
const RARITY_TEXTURE_OPACITY: Record<string, number> = {
    COMMON:   0.12,
    UNCOMMON: 0.20,
    RARE:     0.30,
    UNIQUE:   0.42,
};

const getTextureOpacity = (item: { rarity?: string } | null | undefined): number => {
    if (!item) return 0;
    return RARITY_TEXTURE_OPACITY[item.rarity as string] ?? RARITY_TEXTURE_OPACITY.COMMON;
};

// Base64-encoded tileable texture PNGs (embedded to avoid extra network requests)
const TEXTURE_CARBON_FIBRE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAWCAYAAADafVyIAAAAV0lEQVR4AWPg5uaexcDI8B9Ec3JyFhDCpKpnACmGYWI0kKqe9j4AAi0gBtPEaCBZPYggF1NsAYXBR9gCShPAwPuAkgRA30imJR4tKkaLitGiYrSoIAIDAKy7LKCTTHSAAAAAAElFTkSuQmCC';
const TEXTURE_CARBON_W = 24;
const TEXTURE_CARBON_H = 22;

const TEXTURE_HEXABUMP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAhCAQAAACR61jhAAAArUlEQVR4AY3SQQrCQBBE0b6icxJhFkIWc3Z7SuOnU0iav9PHNISKcTxWLX95XUu26zF1w+iWUZNtNKYzI9kTCKNNxNS8Mt6BCSaFQWBQMYgzaIfNccQ+abSezE8uBq1M/6wfy0QLmyeBkWglzr7nQc6oz3Y9ploMGo5gwGAFxmgGgyEbqpiNsJIBg8IEnHGed4wBIX+ZDjIrZ0znXKAxVvphbKUwCKzSYILOWPUb+kvq4+prG70AAAAASUVORK5CYII=';
const TEXTURE_HEXABUMP_W = 19;
const TEXTURE_HEXABUMP_H = 33;

const TEXTURE_DARK_LEATHER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoBAMAAAB+0KVeAAAAMFBMVEUqKiosLCwuLi4xMTErKystLS0qKiopKSkpKSkzMzMpKSkoKCg3NzcoKCgrKysnJydKwFaoAAAAEHRSTlNcQDIqTjlVanEjY3gcf0eVx2e4NwAAAJNJREFUeAHt0SEKwmAAQOEHDrVYdEmTgwXBoCzZ9l9h8HeT2Wa1CUY9gc3qFTyBJ/EKij+DF7yAwfbVx+Nc5kBoVoUi5mugG2Kh+Ci5UtRJkFWKcctLpVi07ERFeUy6Nk/FaLIH+rflRhHmgwO7xz1XkA1Pvdd2Nq2VMQpjlDHqK0YZo4xRxihjFMYoMEb9/qP/ozcE1oO5SZysbgAAAABJRU5ErkJggg==';;
const TEXTURE_LEATHER_W = 40;
const TEXTURE_LEATHER_H = 40;

const getHairPaths = (style: number, hw: number): { main: string; back?: string; accent?: string } => {
    const cx = 100;
    const L = cx - hw, R = cx + hw;
    switch (style) {
        case 0: // Buzz cut
            return { main: `M${L + 2} 38 Q${L} 28 ${cx} 20 Q${R} 28 ${R - 2} 38 Q${R - 4} 32 ${cx} 24 Q${L + 4} 32 ${L + 2} 38` };
        case 1: // Short crop
            return { main: `M${L} 44 Q${L - 1} 26 ${cx} 20 Q${R + 1} 26 ${R} 44 Q${R - 2} 36 ${cx} 26 Q${L + 2} 36 ${L} 44` };
        case 2: // Side part
            return {
                main: `M${L} 46 Q${L - 2} 26 ${cx - 5} 20 Q${R + 3} 22 ${R + 1} 46 Q${R - 1} 30 ${cx} 26 Q${L + 2} 28 ${L} 46`,
                accent: `M${L - 1} 44 Q${L - 4} 38 ${L - 2} 52`,
            };
        case 3: // Long flowing
            return {
                back: `M${L - 3} 44 Q${L - 6} 55 ${L - 4} 85 Q${L - 2} 92 ${L + 4} 88 L${L + 2} 46 Z`,
                main: `M${L} 46 Q${L - 2} 24 ${cx} 18 Q${R + 2} 24 ${R} 46 Q${R - 2} 30 ${cx} 25 Q${L + 2} 30 ${L} 46`,
                accent: `M${R + 3} 44 Q${R + 6} 55 ${R + 4} 85 Q${R + 2} 92 ${R - 4} 88 L${R - 2} 46 Z`,
            };
        case 4: // High Ponytail — gathered at crown, arcs up then cascades down
            return {
                main: `M${L} 44 Q${L - 1} 26 ${cx} 20 Q${R + 1} 26 ${R} 44 Q${R - 2} 34 ${cx} 26 Q${L + 2} 34 ${L} 44`,
                back: `M${cx} 24 Q${cx + 8} 6 ${cx + 14} 10 Q${cx + 18} 24 ${cx + 12} 52 Q${cx + 8} 76 ${cx + 4} 80 Q${cx + 2} 74 ${cx + 6} 52 Q${cx + 10} 28 ${cx + 6} 14 Z`,
            };
        case 5: // Spiky
            return {
                main: `M${L} 44 Q${L - 1} 28 ${cx} 20 Q${R + 1} 28 ${R} 44 Q${R - 2} 34 ${cx} 26 Q${L + 2} 34 ${L} 44`,
                accent: `M${cx - 12} 32 L${cx - 16} 12 L${cx - 6} 26 L${cx - 4} 8 L${cx + 2} 24 L${cx + 6} 6 L${cx + 8} 26 L${cx + 16} 10 L${cx + 12} 32`,
            };
        case 6: // Afro — large rounded volume (back = big oval behind head, main = crown cap on top)
            return {
                back: `M${cx - 34} 50 Q${cx - 36} 14 ${cx} 10 Q${cx + 36} 14 ${cx + 34} 50 Q${cx + 34} 70 ${cx} 74 Q${cx - 34} 70 ${cx - 34} 50 Z`,
                main: `M${L - 4} 44 Q${L - 6} 24 ${cx} 18 Q${R + 6} 24 ${R + 4} 44 Q${R + 2} 34 ${cx} 24 Q${L - 2} 34 ${L - 4} 44`,
                accent: `M${cx - 8} 14 Q${cx} 6 ${cx + 8} 14`,
            };
        case 7: // Curly Bob — chin-length curly volume
            return {
                back: `M${L - 4} 44 Q${L - 8} 55 ${L - 5} 72 Q${L - 2} 78 ${L + 4} 74 L${L + 2} 46 Z`,
                main: `M${L} 46 Q${L - 3} 24 ${cx} 20 Q${R + 3} 24 ${R} 46 Q${R - 2} 30 ${cx} 26 Q${L + 2} 30 ${L} 46`,
                accent: `M${R + 4} 44 Q${R + 8} 55 ${R + 5} 72 Q${R + 2} 78 ${R - 4} 74 L${R - 2} 46 Z`,
            };
        case 8: // Space Buns — two buns on top
            return {
                main: `M${L} 44 Q${L - 1} 26 ${cx} 20 Q${R + 1} 26 ${R} 44 Q${R - 2} 34 ${cx} 26 Q${L + 2} 34 ${L} 44`,
                accent: `M${cx - 14} 28 Q${cx - 22} 14 ${cx - 14} 10 Q${cx - 6} 6 ${cx - 6} 18 Q${cx - 6} 28 ${cx - 14} 28 Z M${cx + 14} 28 Q${cx + 22} 14 ${cx + 14} 10 Q${cx + 6} 6 ${cx + 6} 18 Q${cx + 6} 28 ${cx + 14} 28 Z`,
            };
        case 9: // Braids — two long braids down (both in back so they render behind the head)
            return {
                main: `M${L} 44 Q${L - 1} 26 ${cx} 20 Q${R + 1} 26 ${R} 44 Q${R - 2} 34 ${cx} 26 Q${L + 2} 34 ${L} 44`,
                back: `M${L - 2} 52 Q${L - 6} 64 ${L - 4} 80 Q${L - 2} 96 ${L - 6} 108 Q${L - 4} 112 ${L} 108 Q${L + 2} 96 ${L} 80 Q${L + 2} 64 ${L - 2} 52 Z M${R + 2} 52 Q${R + 6} 64 ${R + 4} 80 Q${R + 2} 96 ${R + 6} 108 Q${R + 4} 112 ${R} 108 Q${R - 2} 96 ${R} 80 Q${R - 2} 64 ${R + 2} 52 Z`,
            };
        case 10: // Pixie Cut — short asymmetric (left side longer, right short)
            return {
                main: `M${L - 1} 46 Q${L - 3} 24 ${cx} 20 Q${R + 2} 24 ${R} 40 Q${R - 2} 32 ${cx} 26 Q${L + 2} 32 ${L - 1} 46`,
                accent: `M${L - 2} 40 Q${L - 6} 32 ${L - 4} 52 Q${L - 2} 56 ${L} 48 Z`,
            };
        case 11: // Half Up — top gathered, bottom flowing
            return {
                back: `M${L - 3} 44 Q${L - 6} 55 ${L - 4} 80 Q${L - 2} 88 ${L + 4} 84 L${L + 2} 46 Z`,
                main: `M${L} 46 Q${L - 2} 24 ${cx} 18 Q${R + 2} 24 ${R} 46 Q${R - 2} 30 ${cx} 25 Q${L + 2} 30 ${L} 46`,
                accent: `M${R + 3} 44 Q${R + 6} 55 ${R + 4} 80 Q${R + 2} 88 ${R - 4} 84 L${R - 2} 46 Z M${cx - 2} 24 Q${cx + 4} 16 ${cx + 2} 28`,
            };
        default:
            return { main: `M${L} 44 Q${L - 1} 28 ${cx} 22 Q${R + 1} 28 ${R} 44 Q${R - 2} 32 ${cx} 28 Q${L + 2} 32 ${L} 44` };
    }
};

/** Lookup helper: resolve a cosmetic ID to its render props */
const resolveCosmetic = (id: string | undefined): ResolvedCosmetic | null => {
    if (!id) return null;
    const def = AGENT_COSMETICS.find((c: AgentCosmeticDef) => c.id === id);
    if (!def) return null;
    return {
        id: def.id,
        color: def.color,
        secondaryColor: def.secondaryColor || def.color,
        type: def.visualType,
        intensity: def.intensity ?? 0.6,
        particleCount: def.particleCount ?? 8,
    };
};

const OperativeAvatar: React.FC<OperativeAvatarProps> = ({
    equipped,
    appearance,
    evolutionLevel = 1,
    activeCosmetics: multiCosmetics,
    activeCosmetic: legacySingleCosmetic,
    cosmeticColor: legacyColor,
    cosmeticSecondaryColor: legacySecondary,
    cosmeticType: legacyType,
    cosmeticIntensity: legacyIntensity = 0.6,
    cosmeticParticleCount: legacyParticleCount = 8,
}) => {
    // Resolve all active cosmetics from multi-equip or fall back to legacy single-equip
    const auraCosmetic = useMemo(() => resolveCosmetic(multiCosmetics?.aura), [multiCosmetics?.aura]);
    const particleCosmetic = useMemo(() => resolveCosmetic(multiCosmetics?.particle), [multiCosmetics?.particle]);
    const trailCosmetic = useMemo(() => resolveCosmetic(multiCosmetics?.trail), [multiCosmetics?.trail]);

    // Legacy fallback: if no multi-equip, derive from single cosmetic props
    const legacyResolved: ResolvedCosmetic | null = useMemo(() => {
        if (multiCosmetics) return null; // multi-equip takes precedence
        if (!legacySingleCosmetic || !legacyColor) return null;
        return {
            id: legacySingleCosmetic,
            color: legacyColor,
            secondaryColor: legacySecondary || legacyColor,
            type: legacyType || 'AURA',
            intensity: legacyIntensity,
            particleCount: legacyParticleCount,
        };
    }, [multiCosmetics, legacySingleCosmetic, legacyColor, legacySecondary, legacyType, legacyIntensity, legacyParticleCount]);

    // Final resolved per-type (multi-equip OR legacy single)
    const activeAura = auraCosmetic || (legacyResolved?.type === 'AURA' ? legacyResolved : null);
    const activeParticle = particleCosmetic || (legacyResolved?.type === 'PARTICLE' ? legacyResolved : null);
    const activeTrail = trailCosmetic || (legacyResolved?.type === 'TRAIL' ? legacyResolved : null);

    const rawId = useId();
    const uid = rawId.replace(/:/g, '_'); // sanitize for SVG id attrs
    const hue = appearance?.hue || 0;
    const suitHue = appearance?.suitHue ?? hue; // backward compat: fallback to energy hue
    const bodyType = appearance?.bodyType || 'A';
    const isTypeB = bodyType === 'B';
    const isTypeC = bodyType === 'C';
    const skin = SKIN_TONES[appearance?.skinTone ?? 0];
    const hair = HAIR_COLORS[appearance?.hairColor ?? 0];
    const hairStyle = appearance?.hairStyle ?? 1;
    const skinSh = skin + '99';

    const head = equipped?.HEAD;
    const chest = equipped?.CHEST;
    const hands = equipped?.HANDS;
    const feet = equipped?.FEET;
    const belt = equipped?.BELT;
    const amulet = equipped?.AMULET;

    const eqCount = useMemo(() => [head, chest, hands, feet, belt, amulet].filter(Boolean).length, [head, chest, hands, feet, belt, amulet]);
    const hasUnique = useMemo(() => [head, chest, hands, feet, belt, amulet].some(i => i?.rarity === 'UNIQUE'), [head, chest, hands, feet, belt, amulet]);
    const coreInt = Math.min(1, 0.2 + eqCount * 0.13);
    const headW = isTypeB ? 23 : 21;
    const hairPaths = useMemo(() => getHairPaths(hairStyle, headW), [hairStyle, headW]);

    return (
        <svg viewBox="0 0 200 340" className="w-full h-full" style={{ filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.25))' }}>
            <defs>
                <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
                </filter>
                <filter id={`${uid}-soft`} x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur stdDeviation="1.5" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
                </filter>
                <filter id={`${uid}-bloom`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
                </filter>
                <linearGradient id={`${uid}-outfit`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`hsl(${suitHue}, 40%, 22%)`} />
                    <stop offset="100%" stopColor={`hsl(${suitHue}, 35%, 14%)`} />
                </linearGradient>
                <linearGradient id={`${uid}-hl`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={`hsla(${suitHue}, 45%, 35%, 0.2)`} />
                    <stop offset="100%" stopColor="transparent" />
                </linearGradient>
                <linearGradient id={`${uid}-pants`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`hsl(${suitHue}, 35%, 18%)`} />
                    <stop offset="100%" stopColor={`hsl(${suitHue}, 30%, 12%)`} />
                </linearGradient>
                <radialGradient id={`${uid}-face`} cx="45%" cy="40%" r="55%">
                    <stop offset="0%" stopColor={skin} /><stop offset="100%" stopColor={skinSh} />
                </radialGradient>
                <radialGradient id={`${uid}-energy`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={`hsl(${hue + 180}, 100%, 70%)`} stopOpacity={coreInt} />
                    <stop offset="60%" stopColor={`hsl(${hue + 200}, 80%, 50%)`} stopOpacity={coreInt * 0.3} />
                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>
                <linearGradient id={`${uid}-hair`} x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stopColor={hair} /><stop offset="100%" stopColor={hair + 'cc'} />
                </linearGradient>

                {/* Raster texture patterns for equipped armor */}
                <pattern id={`${uid}-tex-carbon`} patternUnits="userSpaceOnUse" width={TEXTURE_CARBON_W} height={TEXTURE_CARBON_H}>
                    <image href={TEXTURE_CARBON_FIBRE} width={TEXTURE_CARBON_W} height={TEXTURE_CARBON_H} />
                </pattern>
                <pattern id={`${uid}-tex-hexabump`} patternUnits="userSpaceOnUse" width={TEXTURE_HEXABUMP_W} height={TEXTURE_HEXABUMP_H}>
                    <image href={TEXTURE_HEXABUMP} width={TEXTURE_HEXABUMP_W} height={TEXTURE_HEXABUMP_H} />
                </pattern>
                <pattern id={`${uid}-tex-leather`} patternUnits="userSpaceOnUse" width={TEXTURE_LEATHER_W} height={TEXTURE_LEATHER_H}>
                    <image href={TEXTURE_DARK_LEATHER} width={TEXTURE_LEATHER_W} height={TEXTURE_LEATHER_H} />
                </pattern>
            </defs>

            {/* Platform shadow */}
            <ellipse cx="100" cy="326" rx="42" ry="5" fill="rgba(0,0,0,0.3)">
                <animate attributeName="rx" values="42;39;42" dur="3.5s" repeatCount="indefinite" />
            </ellipse>

            {/* Body group with breathing */}
            <g>
                <animateTransform attributeName="transform" type="translate" values="0,0;0,-1.5;0,0" dur="3.5s" repeatCount="indefinite" />

                {/* === WINGS (Level 150+) === */}
                {evolutionLevel >= 150 && (
                    <g filter={`url(#${uid}-bloom)`}>
                        <path d={evolutionLevel >= 300
                            ? "M58 105 Q18 60 28 25 Q38 50 52 72 Q32 58 22 38 Q36 56 52 82 Z"
                            : "M60 115 Q32 82 40 55 Q47 72 56 88 Z"}
                              fill={evolutionLevel >= 300 ? 'rgba(251,191,36,0.12)' : 'rgba(139,92,246,0.1)'}
                              stroke={evolutionLevel >= 300 ? '#fbbf24' : '#a78bfa'} strokeWidth="0.5" strokeOpacity="0.4">
                            <animate attributeName="opacity" values="0.8;0.4;0.8" dur="3s" repeatCount="indefinite" />
                        </path>
                        <path d={evolutionLevel >= 300
                            ? "M142 105 Q182 60 172 25 Q162 50 148 72 Q168 58 178 38 Q164 56 148 82 Z"
                            : "M140 115 Q168 82 160 55 Q153 72 144 88 Z"}
                              fill={evolutionLevel >= 300 ? 'rgba(251,191,36,0.12)' : 'rgba(139,92,246,0.1)'}
                              stroke={evolutionLevel >= 300 ? '#fbbf24' : '#a78bfa'} strokeWidth="0.5" strokeOpacity="0.4">
                            <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3s" repeatCount="indefinite" />
                        </path>
                    </g>
                )}

                {/* === LEGS === */}
                <path d={isTypeC
                    ? "M82 200 L80 270 Q80 282 87 282 L94 282 Q98 282 97 276 L94 200"
                    : isTypeB
                    ? "M80 198 L78 272 Q78 282 86 282 L94 282 Q98 282 97 276 L93 198"
                    : "M82 198 L79 270 Q79 282 86 282 L94 282 Q99 282 98 276 L94 198"}
                      fill={`url(#${uid}-pants)`} stroke={`hsl(${suitHue},35%,24%)`} strokeWidth="0.8" />
                <path d={isTypeC
                    ? "M106 200 L104 270 Q104 282 111 282 L118 282 Q122 282 121 276 L120 200"
                    : isTypeB
                    ? "M107 198 L105 272 Q105 282 112 282 L120 282 Q124 282 123 276 L121 198"
                    : "M106 198 L103 270 Q103 282 110 282 L118 282 Q123 282 122 276 L120 198"}
                      fill={`url(#${uid}-pants)`} stroke={`hsl(${suitHue},35%,24%)`} strokeWidth="0.8" />

                {/* === FEET === */}
                {feet ? (() => {
                    const s = getRarityStyle(feet)!;
                    const texOp = getTextureOpacity(feet);
                    return (
                        <g filter={s.intensity > 0.5 ? `url(#${uid}-soft)` : undefined}>
                            <path d="M76 270 L74 282 Q72 292 82 292 L96 292 Q100 292 98 284 L96 270" fill={s.primary} stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.6" />
                            <path d="M102 270 L100 282 Q98 292 108 292 L122 292 Q126 292 124 284 L122 270" fill={s.primary} stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.6" />
                            {/* Dark leather texture overlay on boots */}
                            <path d="M76 270 L74 282 Q72 292 82 292 L96 292 Q100 292 98 284 L96 270" fill={`url(#${uid}-tex-leather)`} opacity={texOp} />
                            <path d="M102 270 L100 282 Q98 292 108 292 L122 292 Q126 292 124 284 L122 270" fill={`url(#${uid}-tex-leather)`} opacity={texOp} />
                            <line x1="78" y1="276" x2="96" y2="276" stroke={s.particle} strokeWidth="1.5" strokeOpacity="0.5" />
                            <line x1="104" y1="276" x2="122" y2="276" stroke={s.particle} strokeWidth="1.5" strokeOpacity="0.5" />
                            {s.intensity >= 0.7 && <>
                                <line x1="80" y1="284" x2="94" y2="284" stroke={s.particle} strokeWidth="0.6" strokeOpacity="0.4">
                                    <animate attributeName="strokeOpacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                                </line>
                                <line x1="106" y1="284" x2="120" y2="284" stroke={s.particle} strokeWidth="0.6" strokeOpacity="0.4">
                                    <animate attributeName="strokeOpacity" values="0.1;0.4;0.1" dur="2s" repeatCount="indefinite" />
                                </line>
                            </>}
                        </g>
                    );
                })() : (
                    <g>
                        <path d="M76 270 L74 282 Q72 290 82 290 L96 290 Q100 290 98 282 L96 270" fill={`hsl(${suitHue},30%,16%)`} stroke={`hsl(${suitHue},28%,22%)`} strokeWidth="0.5" />
                        <path d="M102 270 L100 282 Q98 290 108 290 L122 290 Q126 290 124 282 L122 270" fill={`hsl(${suitHue},30%,16%)`} stroke={`hsl(${suitHue},28%,22%)`} strokeWidth="0.5" />
                    </g>
                )}

                {/* === TORSO === */}
                <path d={isTypeC
                    ? "M70 88 Q100 82 130 88 L122 140 L128 200 Q100 208 72 200 L78 140 Z"
                    : isTypeB
                    ? "M64 88 Q100 82 136 88 L128 200 Q100 206 72 200 Z"
                    : "M68 88 Q100 82 132 88 L126 200 Q100 206 74 200 Z"}
                      fill={`url(#${uid}-outfit)`} stroke={`hsl(${suitHue},38%,27%)`} strokeWidth="1" />
                <path d={isTypeC
                    ? "M70 88 Q100 82 100 88 L100 200 Q86 204 72 200 L78 140 Z"
                    : isTypeB
                    ? "M64 88 Q100 82 100 88 L100 200 Q86 203 72 200 Z"
                    : "M68 88 Q100 82 100 88 L100 200 Q86 204 74 200 Z"}
                      fill={`url(#${uid}-hl)`} />
                {/* Collar V showing skin */}
                <path d="M88 88 L100 105 L112 88" fill={skin} />
                <path d="M86 87 L100 106 L114 87" fill="none" stroke={`hsl(${suitHue},40%,30%)`} strokeWidth="1.2" />
                <line x1="100" y1="106" x2="100" y2="195" stroke={`hsla(${hue + 180},30%,40%,0.08)`} strokeWidth="0.5" />

                {/* === CHEST GEAR === */}
                {chest && (() => {
                    const s = getRarityStyle(chest)!;
                    const texOp = getTextureOpacity(chest);
                    return (
                        <g filter={s.intensity > 0.5 ? `url(#${uid}-soft)` : undefined}>
                            <path d={isTypeC
                                ? "M72 92 Q100 86 128 92 L122 175 Q100 180 78 175 Z"
                                : isTypeB
                                ? "M70 92 Q100 86 130 92 L126 175 Q100 180 74 175 Z"
                                : "M72 92 Q100 86 128 92 L124 175 Q100 180 76 175 Z"}
                                  fill={s.primary} fillOpacity="0.3" stroke={s.primary} strokeWidth="1" strokeOpacity="0.6" />
                            {/* Carbon-fibre texture overlay on chest armor */}
                            <path d={isTypeC
                                ? "M72 92 Q100 86 128 92 L122 175 Q100 180 78 175 Z"
                                : isTypeB
                                ? "M70 92 Q100 86 130 92 L126 175 Q100 180 74 175 Z"
                                : "M72 92 Q100 86 128 92 L124 175 Q100 180 76 175 Z"}
                                  fill={`url(#${uid}-tex-carbon)`} opacity={texOp} />
                            {/* Shoulder plates */}
                            <path d={`M${isTypeC ? 70 : isTypeB ? 64 : 68} 88 Q${isTypeC ? 62 : isTypeB ? 56 : 60} 86 ${isTypeC ? 62 : isTypeB ? 56 : 60} 96 L${isTypeC ? 72 : isTypeB ? 66 : 70} 100`} fill={s.primary} fillOpacity="0.5" stroke={s.particle} strokeWidth="0.5" />
                            <path d={`M${isTypeC ? 130 : isTypeB ? 136 : 132} 88 Q${isTypeC ? 138 : isTypeB ? 144 : 140} 86 ${isTypeC ? 138 : isTypeB ? 144 : 140} 96 L${isTypeC ? 128 : isTypeB ? 134 : 130} 100`} fill={s.primary} fillOpacity="0.5" stroke={s.particle} strokeWidth="0.5" />
                            <line x1="80" y1="115" x2="120" y2="115" stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.3" />
                            <line x1="82" y1="140" x2="118" y2="140" stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.2" />
                            <circle cx="100" cy="120" r="5" fill="none" stroke={s.primary} strokeWidth="1.2" strokeOpacity="0.7" />
                            <circle cx="100" cy="120" r="2" fill={s.particle} fillOpacity="0.7">
                                <animate attributeName="fillOpacity" values="0.7;0.3;0.7" dur="2s" repeatCount="indefinite" />
                            </circle>
                            {s.intensity >= 0.7 && <g>
                                <line x1="88" y1="100" x2="82" y2="165" stroke={s.particle} strokeWidth="0.5" strokeOpacity="0.2" strokeDasharray="3 4">
                                    <animate attributeName="strokeDashoffset" values="0;-14" dur="2s" repeatCount="indefinite" />
                                </line>
                                <line x1="112" y1="100" x2="118" y2="165" stroke={s.particle} strokeWidth="0.5" strokeOpacity="0.2" strokeDasharray="3 4">
                                    <animate attributeName="strokeDashoffset" values="0;-14" dur="2s" repeatCount="indefinite" />
                                </line>
                            </g>}
                        </g>
                    );
                })()}

                {/* === BELT === */}
                {belt ? (() => {
                    const s = getRarityStyle(belt)!;
                    const texOp = getTextureOpacity(belt);
                    return (
                        <g>
                            <rect x="72" y="188" width="56" height="14" rx="3" fill={s.primary} fillOpacity="0.55" stroke={s.primary} strokeWidth="0.8" />
                            {/* Dark leather texture overlay on belt */}
                            <rect x="72" y="188" width="56" height="14" rx="3" fill={`url(#${uid}-tex-leather)`} opacity={texOp} />
                            <rect x="94" y="189" width="12" height="12" rx="2" fill={s.particle} fillOpacity="0.4" />
                            <rect x="74" y="190" width="8" height="10" rx="2" fill={s.primary} fillOpacity="0.3" stroke={s.particle} strokeWidth="0.3" />
                            <rect x="118" y="190" width="8" height="10" rx="2" fill={s.primary} fillOpacity="0.3" stroke={s.particle} strokeWidth="0.3" />
                        </g>
                    );
                })() : <line x1="74" y1="195" x2="126" y2="195" stroke={`hsl(${suitHue},35%,27%)`} strokeWidth="1.5" />}

                {/* === ARMS === */}
                <path d={isTypeC
                    ? "M70 90 L52 94 Q46 96 46 103 L45 155 Q45 160 49 160 L59 160 L66 155 Z"
                    : isTypeB
                    ? "M64 90 L46 94 Q40 96 40 103 L40 155 Q40 160 44 160 L56 160 L64 155 Z"
                    : "M68 90 L50 94 Q44 96 43 103 L42 155 Q42 160 46 160 L58 160 L66 155 Z"}
                      fill={`url(#${uid}-outfit)`} stroke={`hsl(${suitHue},38%,27%)`} strokeWidth="0.8" />
                <path d={isTypeC
                    ? "M130 90 L148 94 Q154 96 154 103 L155 155 Q155 160 151 160 L141 160 L134 155 Z"
                    : isTypeB
                    ? "M136 90 L154 94 Q160 96 160 103 L160 155 Q160 160 156 160 L144 160 L136 155 Z"
                    : "M132 90 L150 94 Q156 96 157 103 L158 155 Q158 160 154 160 L142 160 L134 155 Z"}
                      fill={`url(#${uid}-outfit)`} stroke={`hsl(${suitHue},38%,27%)`} strokeWidth="0.8" />

                {/* === HANDS === */}
                {hands ? (() => {
                    const s = getRarityStyle(hands)!;
                    return (
                        <g filter={s.intensity > 0.5 ? `url(#${uid}-soft)` : undefined}>
                            <path d="M38 148 L38 172 Q38 178 44 178 L58 178 Q62 178 62 172 L62 148" fill={s.primary} fillOpacity="0.5" stroke={s.primary} strokeWidth="0.8" strokeOpacity="0.7" />
                            <path d="M138 148 L138 172 Q138 178 144 178 L158 178 Q162 178 162 172 L162 148" fill={s.primary} fillOpacity="0.5" stroke={s.primary} strokeWidth="0.8" strokeOpacity="0.7" />
                            <line x1="42" y1="170" x2="58" y2="170" stroke={s.particle} strokeWidth="1" strokeOpacity="0.5" />
                            <line x1="142" y1="170" x2="158" y2="170" stroke={s.particle} strokeWidth="1" strokeOpacity="0.5" />
                            {s.intensity >= 0.7 && <>
                                <circle cx="50" cy="168" r="2" fill={s.particle} fillOpacity="0.5"><animate attributeName="fillOpacity" values="0.5;0.2;0.5" dur="1.5s" repeatCount="indefinite" /></circle>
                                <circle cx="150" cy="168" r="2" fill={s.particle} fillOpacity="0.5"><animate attributeName="fillOpacity" values="0.2;0.5;0.2" dur="1.5s" repeatCount="indefinite" /></circle>
                            </>}
                        </g>
                    );
                })() : (
                    <g>
                        <ellipse cx="50" cy="166" rx="7" ry="9" fill={skin} />
                        <ellipse cx="150" cy="166" rx="7" ry="9" fill={skin} />
                    </g>
                )}

                {/* === ENERGY CORE === */}
                {eqCount > 0 && <>
                    <g filter={`url(#${uid}-bloom)`}>
                        <circle cx="100" cy="130" r="6" fill={`url(#${uid}-energy)`}>
                            <animate attributeName="r" values="6;8;6" dur="3s" repeatCount="indefinite" />
                        </circle>
                    </g>
                    <circle cx="100" cy="130" r="2.5" fill={`hsl(${hue + 180},100%,75%)`} fillOpacity={coreInt * 0.7}>
                        <animate attributeName="fillOpacity" values={`${coreInt * 0.7};${coreInt * 0.3};${coreInt * 0.7}`} dur="2s" repeatCount="indefinite" />
                    </circle>
                </>}

                {/* Energy lines (3+ gear) */}
                {eqCount >= 3 && (
                    <line x1="100" y1="108" x2="100" y2="185" stroke={`hsl(${hue + 180},80%,55%)`} strokeWidth="0.5" strokeOpacity="0.15" strokeDasharray="3 5">
                        <animate attributeName="strokeDashoffset" values="0;-16" dur="2s" repeatCount="indefinite" />
                    </line>
                )}

                {/* === NECK (skin) === */}
                <rect x="93" y="72" width="14" height="18" rx="5" fill={skin} />

                {/* === AMULET === */}
                {amulet && (() => {
                    const s = getRarityStyle(amulet)!;
                    return (
                        <g filter={`url(#${uid}-glow)`}>
                            <path d="M92 78 Q100 96 108 78" stroke={s.particle} strokeWidth="0.8" fill="none" strokeOpacity="0.5" />
                            <polygon points="100,90 95,97 100,104 105,97" fill={s.primary} stroke={s.particle} strokeWidth="0.8">
                                <animate attributeName="opacity" values="1;0.7;1" dur="2.5s" repeatCount="indefinite" />
                            </polygon>
                            <circle cx="100" cy="97" r="2" fill={s.particle}>
                                <animate attributeName="r" values="2;2.5;2" dur="2s" repeatCount="indefinite" />
                            </circle>
                        </g>
                    );
                })()}

                {/* === HEAD === */}
                <g>
                    {/* Hair behind head */}
                    {hairPaths.back && <path d={hairPaths.back} fill={`url(#${uid}-hair)`} opacity="0.8" />}

                    {/* Head shape */}
                    <ellipse cx="100" cy="50" rx={headW} ry="28" fill={`url(#${uid}-face)`} stroke={skinSh} strokeWidth="0.5" />

                    {/* Ears */}
                    <ellipse cx={100 - headW - 1} cy="52" rx="4" ry="6" fill={skin} stroke={skinSh} strokeWidth="0.3" />
                    <ellipse cx={100 + headW + 1} cy="52" rx="4" ry="6" fill={skin} stroke={skinSh} strokeWidth="0.3" />

                    {/* === FACE === */}
                    <g>
                        {/* Eyebrows */}
                        <path d="M86 40 Q90 37 96 39" stroke={hair} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                        <path d="M104 39 Q110 37 114 40" stroke={hair} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                        {/* Eye whites */}
                        <ellipse cx="91" cy="47" rx="6" ry="4.5" fill="white" />
                        <ellipse cx="109" cy="47" rx="6" ry="4.5" fill="white" />
                        {/* Irises */}
                        <circle cx="92" cy="47" r="3" fill={`hsl(${hue + 180},70%,45%)`} />
                        <circle cx="110" cy="47" r="3" fill={`hsl(${hue + 180},70%,45%)`} />
                        {/* Pupils */}
                        <circle cx="92" cy="47" r="1.5" fill="#111" />
                        <circle cx="110" cy="47" r="1.5" fill="#111" />
                        {/* Highlights */}
                        <circle cx="93.5" cy="45.5" r="1" fill="white" fillOpacity="0.8" />
                        <circle cx="111.5" cy="45.5" r="1" fill="white" fillOpacity="0.8" />
                        {/* Blink */}
                        <ellipse cx="91" cy="47" rx="6.5" ry="0" fill={skin}>
                            <animate attributeName="ry" values="0;0;0;5;0;0;0;0;0;0;0;0" dur="5s" repeatCount="indefinite" />
                        </ellipse>
                        <ellipse cx="109" cy="47" rx="6.5" ry="0" fill={skin}>
                            <animate attributeName="ry" values="0;0;0;5;0;0;0;0;0;0;0;0" dur="5s" repeatCount="indefinite" />
                        </ellipse>
                        {/* Nose */}
                        <path d="M98 52 Q100 56 102 52" stroke={skinSh} strokeWidth="0.8" fill="none" strokeLinecap="round" />
                        {/* Mouth */}
                        <path d="M95 60 Q100 63 105 60" stroke={skinSh} strokeWidth="0.8" fill="none" strokeLinecap="round" />
                    </g>

                    {/* === HAIR === */}
                    <path d={hairPaths.main} fill={`url(#${uid}-hair)`} />
                    {hairPaths.accent && <path d={hairPaths.accent} fill={`url(#${uid}-hair)`} opacity="0.9" />}

                    {/* === HEAD GEAR === */}
                    {head && (() => {
                        const s = getRarityStyle(head)!;
                        const vid = head.visualId || '';
                        const texOp = getTextureOpacity(head);
                        return (
                            <g filter={s.intensity > 0.5 ? `url(#${uid}-glow)` : `url(#${uid}-soft)`}>
                                {vid.includes('helm') ? <>
                                    <path d={`M${100 - headW - 2} 28 Q100 10 ${100 + headW + 2} 28 L${100 + headW + 4} 62 Q100 72 ${100 - headW - 4} 62 Z`}
                                          fill={s.primary} fillOpacity="0.55" stroke={s.primary} strokeWidth="1.2" />
                                    {/* Hexabump texture overlay on full helmet */}
                                    <path d={`M${100 - headW - 2} 28 Q100 10 ${100 + headW + 2} 28 L${100 + headW + 4} 62 Q100 72 ${100 - headW - 4} 62 Z`}
                                          fill={`url(#${uid}-tex-hexabump)`} opacity={texOp} />
                                    <rect x="80" y="44" width="40" height="8" rx="4" fill={`hsl(${hue + 180},90%,55%)`} fillOpacity="0.85">
                                        <animate attributeName="fillOpacity" values="0.85;0.5;0.85" dur="3s" repeatCount="indefinite" />
                                    </rect>
                                </> : vid.includes('visor') ? <>
                                    <rect x="80" y="42" width="40" height="12" rx="6" fill={`hsla(${hue + 180},80%,50%,0.7)`} stroke={s.primary} strokeWidth="1">
                                        <animate attributeName="fillOpacity" values="0.7;0.4;0.7" dur="2.5s" repeatCount="indefinite" />
                                    </rect>
                                    {/* Hexabump texture overlay on visor */}
                                    <rect x="80" y="42" width="40" height="12" rx="6" fill={`url(#${uid}-tex-hexabump)`} opacity={texOp} />
                                    <line x1="76" y1="48" x2="80" y2="48" stroke={s.primary} strokeWidth="1.5" />
                                    <line x1="120" y1="48" x2="124" y2="48" stroke={s.primary} strokeWidth="1.5" />
                                </> : <>
                                    <rect x="78" y="36" width="44" height="6" rx="3" fill={s.primary} fillOpacity="0.7" stroke={s.particle} strokeWidth="0.5" />
                                    {/* Hexabump texture overlay on headband */}
                                    <rect x="78" y="36" width="44" height="6" rx="3" fill={`url(#${uid}-tex-hexabump)`} opacity={texOp} />
                                    <circle cx="89" cy="47" r="8" fill="none" stroke={s.primary} strokeWidth="1.5" />
                                    <circle cx="111" cy="47" r="8" fill="none" stroke={s.primary} strokeWidth="1.5" />
                                    <circle cx="89" cy="47" r="5.5" fill={s.particle} fillOpacity="0.3">
                                        <animate attributeName="fillOpacity" values="0.3;0.15;0.3" dur="2s" repeatCount="indefinite" />
                                    </circle>
                                    <circle cx="111" cy="47" r="5.5" fill={s.particle} fillOpacity="0.3">
                                        <animate attributeName="fillOpacity" values="0.15;0.3;0.15" dur="2s" repeatCount="indefinite" />
                                    </circle>
                                    <line x1="97" y1="47" x2="103" y2="47" stroke={s.primary} strokeWidth="1.5" />
                                </>}
                            </g>
                        );
                    })()}
                </g>

                {/* === CIRCLET / HALO (Level 50+) === */}
                {evolutionLevel >= 50 && (
                    <g filter={`url(#${uid}-glow)`}>
                        <ellipse cx="100" cy="22" rx="18" ry="4" fill="none"
                                 stroke={evolutionLevel >= 300 ? '#fbbf24' : evolutionLevel >= 100 ? '#a78bfa' : '#60a5fa'}
                                 strokeWidth="1.5" strokeOpacity="0.7">
                            <animate attributeName="strokeOpacity" values="0.7;0.35;0.7" dur="2s" repeatCount="indefinite" />
                        </ellipse>
                        {evolutionLevel >= 100 && (
                            <ellipse cx="100" cy="18" rx="22" ry="5" fill="none"
                                     stroke={evolutionLevel >= 300 ? '#fbbf24' : '#a78bfa'}
                                     strokeWidth="0.8" strokeOpacity="0.35" strokeDasharray="3 3">
                                <animate attributeName="strokeDashoffset" values="0;-12" dur="3s" repeatCount="indefinite" />
                            </ellipse>
                        )}
                        {evolutionLevel >= 300 && [-12, 0, 12].map((x, i) => (
                            <polygon key={i} points={`${100 + x},16 ${97 + x},22 ${103 + x},22`} fill="#fbbf24" fillOpacity="0.6">
                                <animate attributeName="fillOpacity" values="0.6;0.25;0.6" dur={`${1.5 + i * 0.2}s`} repeatCount="indefinite" />
                            </polygon>
                        ))}
                    </g>
                )}

                {/* Unique item aura */}
                {hasUnique && (
                    <g filter={`url(#${uid}-bloom)`}>
                        {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                            const rad = (angle * Math.PI) / 180;
                            const cx = 100 + Math.cos(rad) * 50;
                            const cy = 145 + Math.sin(rad) * 75;
                            return (
                                <circle key={i} cx={cx} cy={cy} r="1.5" fill="#fbbf24" fillOpacity="0.5">
                                    <animate attributeName="cy" values={`${cy};${cy - 18};${cy}`} dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
                                    <animate attributeName="fillOpacity" values="0.5;0;0.5" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
                                </circle>
                            );
                        })}
                    </g>
                )}

                {/* Evolution shoulder accents (10+) */}
                {evolutionLevel >= 10 && <>
                    <line x1="56" y1="90" x2="48" y2="97" stroke={`hsl(${hue + 180},70%,50%)`} strokeWidth="1" strokeOpacity={Math.min(0.5, 0.12 + evolutionLevel * 0.0008)} />
                    <line x1="144" y1="90" x2="152" y2="97" stroke={`hsl(${hue + 180},70%,50%)`} strokeWidth="1" strokeOpacity={Math.min(0.5, 0.12 + evolutionLevel * 0.0008)} />
                </>}

                {/* Evolution particles (10+) */}
                {evolutionLevel >= 10 && (
                    <g filter={`url(#${uid}-soft)`}>
                        {Array.from({ length: Math.min(8, Math.floor(evolutionLevel / 50) + 1) }).map((_, i) => {
                            const count = Math.min(8, Math.floor(evolutionLevel / 50) + 1);
                            const a = (i * 360 / count) * (Math.PI / 180);
                            const px = 100 + Math.cos(a) * (38 + i * 3);
                            const py = 140 + Math.sin(a) * (55 + i * 2);
                            const c = evolutionLevel >= 300 ? '#fbbf24' : evolutionLevel >= 100 ? '#a78bfa' : evolutionLevel >= 50 ? '#60a5fa' : `hsl(${hue + 180},70%,60%)`;
                            return (
                                <circle key={i} cx={px} cy={py} r="1" fill={c} fillOpacity="0.35">
                                    <animate attributeName="cy" values={`${py};${py - 12};${py}`} dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                                    <animate attributeName="fillOpacity" values="0.35;0;0.35" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                                </circle>
                            );
                        })}
                    </g>
                )}

                {/* === AGENT COSMETICS ===
                    Each visual type uses deterministic index-based positioning to avoid
                    Math.random() in render (which causes flicker on every re-render).
                    The cosmetic group is placed after evolution particles so it renders
                    on top, but still within the breathing animation group. */}

                {/* AURA: unique visual per aura ID. Each aura has distinct shape, animation, and layering. */}
                {activeAura && (() => {
                    const cosmeticColor = activeAura.color;
                    const ci = activeAura.intensity;
                    const sc = activeAura.secondaryColor || cosmeticColor;
                    const auraId = activeAura.id;

                    // Ember Aura: flickering flame tongues rising from base
                    if (auraId === 'aura_ember') return (
                        <g filter={`url(#${uid}-bloom)`}>
                            {/* Wide warm base glow */}
                            <ellipse cx="100" cy="165" rx="80" ry="110" fill="none" stroke={cosmeticColor} strokeWidth="22" strokeOpacity={(ci * 0.25).toFixed(2)} style={{ filter: 'blur(12px)' }}>
                                <animate attributeName="strokeOpacity" values={`${(ci * 0.25).toFixed(2)};${(ci * 0.1).toFixed(2)};${(ci * 0.25).toFixed(2)}`} dur="2s" repeatCount="indefinite" />
                            </ellipse>
                            {/* Flame tongues rising asymmetrically */}
                            {[
                                { d: 'M60 220 Q50 160 65 100 Q72 70 60 40', w: 3, dur: '1.6s', delay: '0s' },
                                { d: 'M80 230 Q68 170 78 110 Q85 65 75 20', w: 4, dur: '1.4s', delay: '0.3s' },
                                { d: 'M100 240 Q95 180 100 120 Q105 60 100 10', w: 5, dur: '1.2s', delay: '0.1s' },
                                { d: 'M120 230 Q132 170 122 110 Q115 65 125 20', w: 4, dur: '1.5s', delay: '0.4s' },
                                { d: 'M140 220 Q150 160 135 100 Q128 70 140 40', w: 3, dur: '1.7s', delay: '0.2s' },
                            ].map((f, i) => (
                                <path key={`ef-${i}`} d={f.d} fill="none" stroke={i % 2 === 0 ? cosmeticColor : sc} strokeWidth={f.w} strokeLinecap="round" strokeOpacity={(ci * 0.4).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.4).toFixed(2)};${(ci * 0.12).toFixed(2)};${(ci * 0.4).toFixed(2)}`} dur={f.dur} begin={f.delay} repeatCount="indefinite" />
                                    <animate attributeName="strokeWidth" values={`${f.w};${f.w + 2};${f.w}`} dur={f.dur} begin={f.delay} repeatCount="indefinite" />
                                </path>
                            ))}
                            {/* Rising ember sparks */}
                            {[0,1,2,3,4,5].map(i => {
                                const cx = 70 + i * 12;
                                const cy = 200 - i * 15;
                                return <circle key={`es-${i}`} cx={cx} cy={cy} r={1.5 + (i % 3)} fill={i % 2 === 0 ? sc : cosmeticColor} fillOpacity={(ci * 0.5).toFixed(2)}>
                                    <animate attributeName="cy" values={`${cy};${cy - 40};${cy}`} dur={`${1.8 + i * 0.3}s`} repeatCount="indefinite" />
                                    <animate attributeName="fillOpacity" values={`${(ci * 0.5).toFixed(2)};0;${(ci * 0.5).toFixed(2)}`} dur={`${1.8 + i * 0.3}s`} repeatCount="indefinite" />
                                </circle>;
                            })}
                        </g>
                    );

                    // Frost Aura: crystalline shards radiating outward with icy mist
                    if (auraId === 'aura_frost') return (
                        <g filter={`url(#${uid}-bloom)`}>
                            {/* Icy mist base */}
                            <ellipse cx="100" cy="160" rx="85" ry="115" fill="none" stroke={sc} strokeWidth="28" strokeOpacity={(ci * 0.15).toFixed(2)} style={{ filter: 'blur(16px)' }}>
                                <animate attributeName="rx" values="85;90;85" dur="4s" repeatCount="indefinite" />
                            </ellipse>
                            {/* Crystalline shard rays radiating from center */}
                            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
                                const rad = (angle * Math.PI) / 180;
                                const x1 = 100 + Math.cos(rad) * 30;
                                const y1 = 145 + Math.sin(rad) * 40;
                                const x2 = 100 + Math.cos(rad) * (70 + (i % 3) * 12);
                                const y2 = 145 + Math.sin(rad) * (95 + (i % 3) * 15);
                                return <line key={`fs-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={i % 2 === 0 ? cosmeticColor : sc} strokeWidth={1 + (i % 2)} strokeLinecap="round"
                                    strokeOpacity={(ci * 0.5).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.5).toFixed(2)};${(ci * 0.15).toFixed(2)};${(ci * 0.5).toFixed(2)}`} dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
                                    <animate attributeName="x2" values={`${x2};${x2 + Math.cos(rad) * 5};${x2}`} dur={`${3 + i * 0.2}s`} repeatCount="indefinite" />
                                    <animate attributeName="y2" values={`${y2};${y2 + Math.sin(rad) * 5};${y2}`} dur={`${3 + i * 0.2}s`} repeatCount="indefinite" />
                                </line>;
                            })}
                            {/* Frost ring */}
                            <ellipse cx="100" cy="145" rx="65" ry="88" fill="none" stroke={cosmeticColor} strokeWidth="1.5" strokeOpacity={(ci * 0.4).toFixed(2)} strokeDasharray="4 8">
                                <animate attributeName="strokeDashoffset" values="0;-24" dur="3s" repeatCount="indefinite" />
                            </ellipse>
                        </g>
                    );

                    // Void Aura: dark vortex with swirling rings and inward-pulling particles
                    if (auraId === 'aura_void') return (
                        <g filter={`url(#${uid}-bloom)`}>
                            {/* Dark vortex background */}
                            <ellipse cx="100" cy="150" rx="78" ry="105" fill={sc} fillOpacity={(ci * 0.08).toFixed(2)}>
                                <animate attributeName="rx" values="78;82;78" dur="5s" repeatCount="indefinite" />
                                <animate attributeName="ry" values="105;110;105" dur="5s" repeatCount="indefinite" />
                            </ellipse>
                            {/* Swirling orbit rings at different angles */}
                            {[0, 1, 2].map(i => (
                                <ellipse key={`vr-${i}`} cx="100" cy="150"
                                    rx={55 + i * 18} ry={20 + i * 8}
                                    fill="none" stroke={i % 2 === 0 ? cosmeticColor : sc}
                                    strokeWidth={2 - i * 0.4} strokeOpacity={(ci * (0.5 - i * 0.12)).toFixed(2)}
                                    strokeDasharray={`${6 + i * 2} ${8 + i * 3}`}
                                    transform={`rotate(${-20 + i * 35}, 100, 150)`}>
                                    <animate attributeName="strokeDashoffset" values={`0;${i % 2 === 0 ? -30 : 30}`} dur={`${2.5 + i * 0.5}s`} repeatCount="indefinite" />
                                </ellipse>
                            ))}
                            {/* Inward-spiraling particles */}
                            {[0,1,2,3,4,5].map(i => {
                                const angle = (i * 60) * Math.PI / 180;
                                const cx = 100 + Math.cos(angle) * 72;
                                const cy = 150 + Math.sin(angle) * 95;
                                return <circle key={`vp-${i}`} cx={cx} cy={cy} r={2 - i * 0.15} fill={cosmeticColor} fillOpacity={(ci * 0.45).toFixed(2)}>
                                    <animate attributeName="cx" values={`${cx};100;${cx}`} dur={`${3 + i * 0.4}s`} repeatCount="indefinite" />
                                    <animate attributeName="cy" values={`${cy};150;${cy}`} dur={`${3 + i * 0.4}s`} repeatCount="indefinite" />
                                    <animate attributeName="fillOpacity" values={`${(ci * 0.45).toFixed(2)};0;${(ci * 0.45).toFixed(2)}`} dur={`${3 + i * 0.4}s`} repeatCount="indefinite" />
                                </circle>;
                            })}
                        </g>
                    );

                    // Radiant Aura: brilliant starburst with pulsing concentric rings
                    if (auraId === 'aura_radiant') return (
                        <g filter={`url(#${uid}-bloom)`}>
                            {/* Warm golden glow base */}
                            <ellipse cx="100" cy="145" rx="85" ry="115" fill="none" stroke={sc} strokeWidth="30" strokeOpacity={(ci * 0.18).toFixed(2)} style={{ filter: 'blur(14px)' }}>
                                <animate attributeName="strokeOpacity" values={`${(ci * 0.18).toFixed(2)};${(ci * 0.08).toFixed(2)};${(ci * 0.18).toFixed(2)}`} dur="2.5s" repeatCount="indefinite" />
                            </ellipse>
                            {/* Starburst rays emanating from core */}
                            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => {
                                const rad = (angle * Math.PI) / 180;
                                const len = 60 + (i % 3) * 20;
                                const x1 = 100 + Math.cos(rad) * 15;
                                const y1 = 130 + Math.sin(rad) * 20;
                                const x2 = 100 + Math.cos(rad) * len;
                                const y2 = 130 + Math.sin(rad) * (len * 1.3);
                                return <line key={`rb-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={cosmeticColor} strokeWidth={i % 3 === 0 ? 2.5 : 1.2} strokeLinecap="round"
                                    strokeOpacity={(ci * 0.35).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.35).toFixed(2)};${(ci * 0.08).toFixed(2)};${(ci * 0.35).toFixed(2)}`} dur={`${1.5 + (i % 4) * 0.3}s`} repeatCount="indefinite" />
                                </line>;
                            })}
                            {/* Concentric pulsing rings */}
                            {[35, 55, 75].map((r, i) => (
                                <ellipse key={`rr-${i}`} cx="100" cy="140" rx={r} ry={r * 1.3} fill="none"
                                    stroke={cosmeticColor} strokeWidth="1" strokeOpacity={(ci * (0.4 - i * 0.1)).toFixed(2)}>
                                    <animate attributeName="rx" values={`${r};${r + 6};${r}`} dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                                    <animate attributeName="ry" values={`${r * 1.3};${r * 1.3 + 8};${r * 1.3}`} dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                                    <animate attributeName="strokeOpacity" values={`${(ci * (0.4 - i * 0.1)).toFixed(2)};${(ci * 0.05).toFixed(2)};${(ci * (0.4 - i * 0.1)).toFixed(2)}`} dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                                </ellipse>
                            ))}
                        </g>
                    );

                    // Toxic Aura: bubbling drips rising with toxic cloud
                    if (auraId === 'aura_toxic') return (
                        <g filter={`url(#${uid}-bloom)`}>
                            {/* Toxic cloud */}
                            <ellipse cx="100" cy="170" rx="80" ry="100" fill="none" stroke={cosmeticColor} strokeWidth="20" strokeOpacity={(ci * 0.18).toFixed(2)} style={{ filter: 'blur(14px)' }}>
                                <animate attributeName="ry" values="100;108;100" dur="3.5s" repeatCount="indefinite" />
                            </ellipse>
                            {/* Bubbling orbs rising at various speeds */}
                            {[0,1,2,3,4,5,6,7].map(i => {
                                const cx = 60 + i * 11;
                                const startY = 260 - (i % 3) * 20;
                                const r = 2 + (i % 4) * 1.2;
                                return <circle key={`tb-${i}`} cx={cx} cy={startY} r={r}
                                    fill={i % 2 === 0 ? cosmeticColor : sc} fillOpacity={(ci * 0.4).toFixed(2)}>
                                    <animate attributeName="cy" values={`${startY};${startY - 80 - (i % 3) * 30};${startY}`} dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                                    <animate attributeName="r" values={`${r};${r + 2};0`} dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                                    <animate attributeName="fillOpacity" values={`${(ci * 0.4).toFixed(2)};${(ci * 0.2).toFixed(2)};0`} dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                                </circle>;
                            })}
                            {/* Dripping lines from bottom */}
                            {[75, 100, 125].map((x, i) => (
                                <line key={`td-${i}`} x1={x} y1={280} x2={x} y2={300}
                                    stroke={cosmeticColor} strokeWidth={2} strokeLinecap="round" strokeOpacity={(ci * 0.3).toFixed(2)}>
                                    <animate attributeName="y2" values="280;310;280" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.3).toFixed(2)};0;${(ci * 0.3).toFixed(2)}`} dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
                                </line>
                            ))}
                        </g>
                    );

                    // Blood Moon Aura: pulsing crimson heartbeat with veiny tendrils
                    if (auraId === 'aura_bloodmoon') return (
                        <g filter={`url(#${uid}-bloom)`}>
                            {/* Deep crimson pulse — fast heartbeat rhythm */}
                            <ellipse cx="100" cy="150" rx="80" ry="108" fill={cosmeticColor} fillOpacity={(ci * 0.06).toFixed(2)}>
                                <animate attributeName="fillOpacity" values={`${(ci * 0.06).toFixed(2)};${(ci * 0.15).toFixed(2)};${(ci * 0.06).toFixed(2)};${(ci * 0.12).toFixed(2)};${(ci * 0.06).toFixed(2)}`} dur="1.2s" repeatCount="indefinite" />
                                <animate attributeName="rx" values="80;86;80;84;80" dur="1.2s" repeatCount="indefinite" />
                                <animate attributeName="ry" values="108;116;108;113;108" dur="1.2s" repeatCount="indefinite" />
                            </ellipse>
                            {/* Veiny tendrils radiating outward */}
                            {[
                                'M60 140 Q40 120 25 95', 'M55 180 Q30 195 15 220',
                                'M140 140 Q160 120 175 95', 'M145 180 Q170 195 185 220',
                                'M80 80 Q70 55 55 30', 'M120 80 Q130 55 145 30',
                            ].map((d, i) => (
                                <path key={`bv-${i}`} d={d} fill="none" stroke={i % 2 === 0 ? cosmeticColor : sc}
                                    strokeWidth={1.5} strokeLinecap="round" strokeOpacity={(ci * 0.35).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.35).toFixed(2)};${(ci * 0.08).toFixed(2)};${(ci * 0.35).toFixed(2)};${(ci * 0.15).toFixed(2)};${(ci * 0.35).toFixed(2)}`} dur="1.2s" repeatCount="indefinite" />
                                </path>
                            ))}
                            {/* Orbiting blood droplets */}
                            {[0,1,2,3].map(i => {
                                const angle = (i * 90 + 20) * Math.PI / 180;
                                const cx = 100 + Math.cos(angle) * 65;
                                const cy = 150 + Math.sin(angle) * 88;
                                return <circle key={`bd-${i}`} cx={cx} cy={cy} r={2.5} fill={cosmeticColor} fillOpacity={(ci * 0.5).toFixed(2)}>
                                    <animate attributeName="fillOpacity" values={`${(ci * 0.5).toFixed(2)};${(ci * 0.1).toFixed(2)};${(ci * 0.5).toFixed(2)};${(ci * 0.2).toFixed(2)};${(ci * 0.5).toFixed(2)}`} dur="1.2s" repeatCount="indefinite" />
                                </circle>;
                            })}
                        </g>
                    );

                    // Aurora Aura: horizontal shifting color bands like northern lights
                    if (auraId === 'aura_aurora') return (
                        <g filter={`url(#${uid}-bloom)`}>
                            {/* Horizontal aurora bands at different heights */}
                            {[
                                { y: 40, rx: 75, ry: 12, color: cosmeticColor, dur: '4s' },
                                { y: 80, rx: 82, ry: 15, color: sc, dur: '5s' },
                                { y: 120, rx: 78, ry: 14, color: cosmeticColor, dur: '3.5s' },
                                { y: 165, rx: 85, ry: 16, color: sc, dur: '4.5s' },
                                { y: 210, rx: 72, ry: 11, color: cosmeticColor, dur: '3.8s' },
                                { y: 250, rx: 68, ry: 10, color: sc, dur: '4.2s' },
                            ].map((band, i) => (
                                <ellipse key={`ab-${i}`} cx="100" cy={band.y}
                                    rx={band.rx} ry={band.ry}
                                    fill="none" stroke={band.color}
                                    strokeWidth={8 + (i % 3) * 3} strokeOpacity={(ci * 0.2).toFixed(2)}
                                    style={{ filter: 'blur(6px)' }}>
                                    <animate attributeName="cx" values={`${95 + (i % 2) * 10};${105 - (i % 2) * 10};${95 + (i % 2) * 10}`} dur={band.dur} repeatCount="indefinite" />
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.2).toFixed(2)};${(ci * 0.08).toFixed(2)};${(ci * 0.2).toFixed(2)}`} dur={band.dur} repeatCount="indefinite" />
                                </ellipse>
                            ))}
                            {/* Shimmering sparkle points */}
                            {[0,1,2,3,4].map(i => {
                                const cx = 65 + i * 18;
                                const cy = 60 + i * 40;
                                return <circle key={`as-${i}`} cx={cx} cy={cy} r={1.5} fill={i % 2 === 0 ? cosmeticColor : sc} fillOpacity={(ci * 0.5).toFixed(2)}>
                                    <animate attributeName="fillOpacity" values={`${(ci * 0.5).toFixed(2)};0;${(ci * 0.5).toFixed(2)}`} dur={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
                                </circle>;
                            })}
                        </g>
                    );

                    // Solar Flare Aura: explosive corona with erupting arcs
                    if (auraId === 'aura_solar') return (
                        <g filter={`url(#${uid}-bloom)`}>
                            {/* Intense core glow */}
                            <ellipse cx="100" cy="140" rx="45" ry="60" fill={sc} fillOpacity={(ci * 0.12).toFixed(2)}>
                                <animate attributeName="fillOpacity" values={`${(ci * 0.12).toFixed(2)};${(ci * 0.06).toFixed(2)};${(ci * 0.12).toFixed(2)}`} dur="1.5s" repeatCount="indefinite" />
                            </ellipse>
                            {/* Corona flare arcs erupting outward */}
                            {[
                                'M65 100 Q40 60 55 20', 'M50 155 Q15 140 5 110',
                                'M135 100 Q160 60 145 20', 'M150 155 Q185 140 195 110',
                                'M75 230 Q55 260 40 290', 'M125 230 Q145 260 160 290',
                                'M100 65 Q100 35 100 5', 'M60 200 Q25 210 10 240',
                            ].map((d, i) => (
                                <path key={`sf-${i}`} d={d} fill="none"
                                    stroke={i % 3 === 0 ? sc : cosmeticColor}
                                    strokeWidth={2.5 - (i % 3) * 0.5} strokeLinecap="round"
                                    strokeOpacity={(ci * 0.4).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.4).toFixed(2)};${(ci * 0.08).toFixed(2)};${(ci * 0.4).toFixed(2)}`} dur={`${1.2 + i * 0.25}s`} repeatCount="indefinite" />
                                    <animate attributeName="strokeWidth" values={`${2.5 - (i % 3) * 0.5};${3.5 - (i % 3) * 0.5};${2.5 - (i % 3) * 0.5}`} dur={`${1.2 + i * 0.25}s`} repeatCount="indefinite" />
                                </path>
                            ))}
                            {/* Outer heat shimmer ring */}
                            <ellipse cx="100" cy="145" rx="88" ry="118" fill="none" stroke={cosmeticColor} strokeWidth="3" strokeOpacity={(ci * 0.2).toFixed(2)}>
                                <animate attributeName="rx" values="88;95;88" dur="2s" repeatCount="indefinite" />
                                <animate attributeName="ry" values="118;126;118" dur="2s" repeatCount="indefinite" />
                                <animate attributeName="strokeOpacity" values={`${(ci * 0.2).toFixed(2)};${(ci * 0.06).toFixed(2)};${(ci * 0.2).toFixed(2)}`} dur="2s" repeatCount="indefinite" />
                            </ellipse>
                        </g>
                    );

                    // Fallback: generic aura for any unrecognized ID
                    return (
                        <g filter={`url(#${uid}-bloom)`}>
                            <ellipse cx="100" cy="150" rx="80" ry="108" fill="none" stroke={cosmeticColor} strokeWidth="20" strokeOpacity={(ci * 0.3).toFixed(2)} style={{ filter: 'blur(10px)' }}>
                                <animate attributeName="strokeOpacity" values={`${(ci * 0.3).toFixed(2)};${(ci * 0.1).toFixed(2)};${(ci * 0.3).toFixed(2)}`} dur="3s" repeatCount="indefinite" />
                            </ellipse>
                            <ellipse cx="100" cy="150" rx="90" ry="120" fill="none" stroke={sc} strokeWidth="8" strokeOpacity={(ci * 0.15).toFixed(2)}>
                                <animate attributeName="strokeOpacity" values={`${(ci * 0.15).toFixed(2)};${(ci * 0.05).toFixed(2)};${(ci * 0.15).toFixed(2)}`} dur="4s" repeatCount="indefinite" />
                            </ellipse>
                        </g>
                    );
                })()}

                {/* PARTICLE: floating orbs orbiting/drifting around the agent body.
                    Positions are derived from index and a fixed angle step so they
                    never change between renders. Primary + secondary colors alternate. */}
                {activeParticle && (() => {
                    const pColor = activeParticle.color;
                    const pSecondary = activeParticle.secondaryColor || pColor;
                    const pIntensity = activeParticle.intensity;
                    const pCount = activeParticle.particleCount;
                    return (
                    <g filter={`url(#${uid}-soft)`}>
                        {Array.from({ length: pCount }).map((_, i) => {
                            const totalAngle = 360;
                            const angleDeg = (i * totalAngle) / pCount;
                            const angleRad = (angleDeg * Math.PI) / 180;
                            const orbitRx = 48 + (i % 3) * 6;
                            const orbitRy = 80 + (i % 4) * 8;
                            const cx = 100 + Math.cos(angleRad) * orbitRx;
                            const cy = 145 + Math.sin(angleRad) * orbitRy;
                            const r = 1 + (i % 4) * 0.5;
                            const fill = i % 2 === 0 ? pColor : pSecondary;
                            const dur = 2.5 + i * 0.35;
                            const floatDist = 10 + (i % 3) * 5;
                            return (
                                <circle
                                    key={`cp-${i}`}
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill={fill}
                                    fillOpacity={(pIntensity * 0.55).toFixed(2)}
                                >
                                    <animate
                                        attributeName="cy"
                                        values={`${cy};${cy - floatDist};${cy}`}
                                        dur={`${dur}s`}
                                        repeatCount="indefinite"
                                    />
                                    <animate
                                        attributeName="fillOpacity"
                                        values={`${(pIntensity * 0.55).toFixed(2)};0;${(pIntensity * 0.55).toFixed(2)}`}
                                        dur={`${dur}s`}
                                        repeatCount="indefinite"
                                    />
                                </circle>
                            );
                        })}
                    </g>
                    );
                })()}

                {/* FRAME rendering removed — frames now wrap profile pictures via ProfileFrame component */}

                {/* TRAIL: unique visual per trail ID. Each trail has distinct path shapes, wisp behaviors, and particle patterns. */}
                {activeTrail && (() => {
                    const cosmeticColor = activeTrail.color;
                    const ci = activeTrail.intensity;
                    const sc = activeTrail.secondaryColor || cosmeticColor;
                    const trailId = activeTrail.id;

                    // Lightning Trail: jagged electric bolts crackling outward
                    if (trailId === 'trail_lightning') return (
                        <g>
                            <g filter={`url(#${uid}-bloom)`}>
                                <path d="M75 195 L60 210 L72 220 L50 245 L68 250 L40 290" fill="none" stroke={cosmeticColor} strokeWidth="3" strokeLinecap="round" strokeOpacity={(ci * 0.6).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.6).toFixed(2)};${(ci * 0.05).toFixed(2)};${(ci * 0.6).toFixed(2)}`} dur="0.8s" repeatCount="indefinite" />
                                </path>
                                <path d="M125 195 L140 210 L128 220 L150 245 L132 250 L160 290" fill="none" stroke={cosmeticColor} strokeWidth="3" strokeLinecap="round" strokeOpacity={(ci * 0.6).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.05).toFixed(2)};${(ci * 0.6).toFixed(2)};${(ci * 0.05).toFixed(2)}`} dur="0.9s" repeatCount="indefinite" />
                                </path>
                                {/* Secondary forking bolts */}
                                <path d="M68 250 L55 260 L65 268 L48 300" fill="none" stroke={sc} strokeWidth="1.5" strokeLinecap="round" strokeOpacity={(ci * 0.4).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.4).toFixed(2)};0;${(ci * 0.4).toFixed(2)}`} dur="0.6s" repeatCount="indefinite" />
                                </path>
                                <path d="M132 250 L145 260 L135 268 L152 300" fill="none" stroke={sc} strokeWidth="1.5" strokeLinecap="round" strokeOpacity={(ci * 0.4).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`0;${(ci * 0.4).toFixed(2)};0`} dur="0.7s" repeatCount="indefinite" />
                                </path>
                                {/* Center bolt */}
                                <path d="M100 200 L95 220 L105 230 L98 255 L108 265 L100 300" fill="none" stroke={cosmeticColor} strokeWidth="2" strokeLinecap="round" strokeOpacity={(ci * 0.35).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.35).toFixed(2)};0;0;${(ci * 0.35).toFixed(2)}`} dur="1.2s" repeatCount="indefinite" />
                                </path>
                            </g>
                            {/* Electric sparkle flashes */}
                            <g filter={`url(#${uid}-glow)`}>
                                {[{cx:50,cy:245},{cx:160,cy:245},{cx:40,cy:290},{cx:160,cy:290},{cx:100,cy:255}].map((p, i) => (
                                    <circle key={`ls-${i}`} cx={p.cx} cy={p.cy} r="3" fill={i % 2 === 0 ? cosmeticColor : sc} fillOpacity="0">
                                        <animate attributeName="fillOpacity" values={`0;${(ci * 0.7).toFixed(2)};0`} dur={`${0.4 + i * 0.15}s`} repeatCount="indefinite" />
                                        <animate attributeName="r" values="1;4;1" dur={`${0.4 + i * 0.15}s`} repeatCount="indefinite" />
                                    </circle>
                                ))}
                            </g>
                        </g>
                    );

                    // Shadow Trail: dark smoky tendrils creeping downward
                    if (trailId === 'trail_shadow') return (
                        <g>
                            <g filter={`url(#${uid}-bloom)`}>
                                {/* Dark smoke clouds */}
                                {[
                                    { cx: 70, cy: 220, rx: 25, ry: 15 },
                                    { cx: 130, cy: 225, rx: 22, ry: 13 },
                                    { cx: 85, cy: 255, rx: 30, ry: 18 },
                                    { cx: 115, cy: 260, rx: 28, ry: 16 },
                                    { cx: 100, cy: 290, rx: 35, ry: 20 },
                                ].map((c, i) => (
                                    <ellipse key={`ss-${i}`} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry}
                                        fill={i % 2 === 0 ? cosmeticColor : sc} fillOpacity={(ci * 0.15).toFixed(2)}>
                                        <animate attributeName="ry" values={`${c.ry};${c.ry + 4};${c.ry}`} dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
                                        <animate attributeName="fillOpacity" values={`${(ci * 0.15).toFixed(2)};${(ci * 0.05).toFixed(2)};${(ci * 0.15).toFixed(2)}`} dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
                                    </ellipse>
                                ))}
                            </g>
                            <g filter={`url(#${uid}-soft)`}>
                                {/* Creeping shadow tendrils */}
                                {[
                                    'M75 200 Q55 230 45 270 Q38 295 30 330',
                                    'M85 205 Q70 240 60 280 Q52 310 48 340',
                                    'M125 200 Q145 230 155 270 Q162 295 170 330',
                                    'M115 205 Q130 240 140 280 Q148 310 152 340',
                                ].map((d, i) => (
                                    <path key={`st-${i}`} d={d} fill="none" stroke={i % 2 === 0 ? cosmeticColor : sc}
                                        strokeWidth={2.5 - i * 0.3} strokeLinecap="round" strokeOpacity={(ci * 0.4).toFixed(2)}>
                                        <animate attributeName="strokeOpacity" values={`${(ci * 0.4).toFixed(2)};${(ci * 0.1).toFixed(2)};${(ci * 0.4).toFixed(2)}`} dur={`${4 + i * 0.5}s`} repeatCount="indefinite" />
                                    </path>
                                ))}
                            </g>
                        </g>
                    );

                    // Plasma Trail: superheated arcs with bright core streaks
                    if (trailId === 'trail_plasma') return (
                        <g>
                            <g filter={`url(#${uid}-bloom)`}>
                                {/* Plasma glow */}
                                <path d="M75 195 Q35 235 22 300" fill="none" stroke={cosmeticColor} strokeWidth="12" strokeLinecap="round" strokeOpacity={(ci * 0.15).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.15).toFixed(2)};${(ci * 0.05).toFixed(2)};${(ci * 0.15).toFixed(2)}`} dur="2s" repeatCount="indefinite" />
                                </path>
                                <path d="M125 195 Q165 235 178 300" fill="none" stroke={cosmeticColor} strokeWidth="12" strokeLinecap="round" strokeOpacity={(ci * 0.15).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.05).toFixed(2)};${(ci * 0.15).toFixed(2)};${(ci * 0.05).toFixed(2)}`} dur="2s" repeatCount="indefinite" />
                                </path>
                            </g>
                            <g filter={`url(#${uid}-soft)`}>
                                {/* Spiraling plasma arcs */}
                                <path d="M80 195 Q55 210 65 235 Q75 260 55 280 Q40 295 30 320" fill="none" stroke={cosmeticColor} strokeWidth="2.5" strokeLinecap="round" strokeOpacity={(ci * 0.55).toFixed(2)} strokeDasharray="10 6">
                                    <animate attributeName="strokeDashoffset" values="0;-48" dur="1.5s" repeatCount="indefinite" />
                                </path>
                                <path d="M120 195 Q145 210 135 235 Q125 260 145 280 Q160 295 170 320" fill="none" stroke={cosmeticColor} strokeWidth="2.5" strokeLinecap="round" strokeOpacity={(ci * 0.55).toFixed(2)} strokeDasharray="10 6">
                                    <animate attributeName="strokeDashoffset" values="0;-48" dur="1.7s" repeatCount="indefinite" />
                                </path>
                                {/* Hot core streaks */}
                                <path d="M78 200 Q50 220 58 250 Q66 275 48 300" fill="none" stroke={sc} strokeWidth="1.5" strokeLinecap="round" strokeOpacity={(ci * 0.6).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.6).toFixed(2)};${(ci * 0.15).toFixed(2)};${(ci * 0.6).toFixed(2)}`} dur="1.8s" repeatCount="indefinite" />
                                </path>
                                <path d="M122 200 Q150 220 142 250 Q134 275 152 300" fill="none" stroke={sc} strokeWidth="1.5" strokeLinecap="round" strokeOpacity={(ci * 0.6).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.15).toFixed(2)};${(ci * 0.6).toFixed(2)};${(ci * 0.15).toFixed(2)}`} dur="1.8s" repeatCount="indefinite" />
                                </path>
                            </g>
                            {/* Plasma orbs along trails */}
                            <g filter={`url(#${uid}-glow)`}>
                                {[{cx:55,cy:280},{cx:145,cy:280},{cx:30,cy:315},{cx:170,cy:315}].map((p, i) => (
                                    <circle key={`po-${i}`} cx={p.cx} cy={p.cy} r="3" fill={i % 2 === 0 ? cosmeticColor : sc} fillOpacity={(ci * 0.5).toFixed(2)}>
                                        <animate attributeName="r" values="2;4.5;2" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
                                        <animate attributeName="fillOpacity" values={`${(ci * 0.5).toFixed(2)};0;${(ci * 0.5).toFixed(2)}`} dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
                                    </circle>
                                ))}
                            </g>
                        </g>
                    );

                    // Venom Trail: dripping toxic drops with splatter at base
                    if (trailId === 'trail_venom') return (
                        <g>
                            <g filter={`url(#${uid}-bloom)`}>
                                <ellipse cx="100" cy="310" rx="50" ry="10" fill={cosmeticColor} fillOpacity={(ci * 0.12).toFixed(2)}>
                                    <animate attributeName="rx" values="50;55;50" dur="3s" repeatCount="indefinite" />
                                </ellipse>
                            </g>
                            <g filter={`url(#${uid}-soft)`}>
                                {/* Dripping streams */}
                                {[65, 80, 100, 120, 135].map((x, i) => {
                                    const h = 60 + (i % 3) * 25;
                                    return <g key={`vd-${i}`}>
                                        <line x1={x} y1={200} x2={x} y2={200 + h} stroke={i % 2 === 0 ? cosmeticColor : sc}
                                            strokeWidth={2 + (i % 2)} strokeLinecap="round" strokeOpacity={(ci * 0.45).toFixed(2)}>
                                            <animate attributeName="y2" values={`${200};${200 + h};${200 + h + 15};${200}`} dur={`${1.8 + i * 0.3}s`} repeatCount="indefinite" />
                                            <animate attributeName="strokeOpacity" values={`0;${(ci * 0.45).toFixed(2)};${(ci * 0.45).toFixed(2)};0`} dur={`${1.8 + i * 0.3}s`} repeatCount="indefinite" />
                                        </line>
                                        {/* Drip drop at bottom */}
                                        <circle cx={x} cy={200 + h + 10} r={2 + (i % 2)} fill={i % 2 === 0 ? cosmeticColor : sc} fillOpacity="0">
                                            <animate attributeName="fillOpacity" values={`0;0;${(ci * 0.5).toFixed(2)};0`} dur={`${1.8 + i * 0.3}s`} repeatCount="indefinite" />
                                            <animate attributeName="r" values={`${2 + (i % 2)};${2 + (i % 2)};${4 + (i % 2)};0`} dur={`${1.8 + i * 0.3}s`} repeatCount="indefinite" />
                                        </circle>
                                    </g>;
                                })}
                                {/* Splatter puddle ripples at base */}
                                {[0, 1, 2].map(i => (
                                    <ellipse key={`vr-${i}`} cx="100" cy="310" rx={15 + i * 12} ry={3 + i * 1.5}
                                        fill="none" stroke={cosmeticColor} strokeWidth="1" strokeOpacity={(ci * (0.3 - i * 0.08)).toFixed(2)}>
                                        <animate attributeName="rx" values={`${15 + i * 12};${20 + i * 14};${15 + i * 12}`} dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                                        <animate attributeName="strokeOpacity" values={`${(ci * (0.3 - i * 0.08)).toFixed(2)};${(ci * 0.05).toFixed(2)};${(ci * (0.3 - i * 0.08)).toFixed(2)}`} dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                                    </ellipse>
                                ))}
                            </g>
                        </g>
                    );

                    // Inferno Trail: roaring flames with heat distortion
                    if (trailId === 'trail_inferno') return (
                        <g>
                            <g filter={`url(#${uid}-bloom)`}>
                                {/* Wide flame glow at base */}
                                <path d="M50 300 Q75 260 65 220 Q60 200 75 190" fill="none" stroke={cosmeticColor} strokeWidth="14" strokeLinecap="round" strokeOpacity={(ci * 0.12).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.12).toFixed(2)};${(ci * 0.04).toFixed(2)};${(ci * 0.12).toFixed(2)}`} dur="1.5s" repeatCount="indefinite" />
                                </path>
                                <path d="M150 300 Q125 260 135 220 Q140 200 125 190" fill="none" stroke={cosmeticColor} strokeWidth="14" strokeLinecap="round" strokeOpacity={(ci * 0.12).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.04).toFixed(2)};${(ci * 0.12).toFixed(2)};${(ci * 0.04).toFixed(2)}`} dur="1.5s" repeatCount="indefinite" />
                                </path>
                            </g>
                            <g filter={`url(#${uid}-soft)`}>
                                {/* Flame shapes (irregular, organic curves) */}
                                {[
                                    { d: 'M75 195 Q55 210 48 240 Q42 265 55 280 Q45 300 38 325', c: cosmeticColor, w: 3, dur: '1.3s' },
                                    { d: 'M70 200 Q45 225 52 255 Q58 275 42 295 Q35 315 30 340', c: sc, w: 2, dur: '1.5s' },
                                    { d: 'M82 200 Q65 220 60 250 Q55 275 65 295 Q58 310 55 330', c: cosmeticColor, w: 1.5, dur: '1.1s' },
                                    { d: 'M125 195 Q145 210 152 240 Q158 265 145 280 Q155 300 162 325', c: cosmeticColor, w: 3, dur: '1.4s' },
                                    { d: 'M130 200 Q155 225 148 255 Q142 275 158 295 Q165 315 170 340', c: sc, w: 2, dur: '1.6s' },
                                    { d: 'M118 200 Q135 220 140 250 Q145 275 135 295 Q142 310 145 330', c: cosmeticColor, w: 1.5, dur: '1.2s' },
                                ].map((f, i) => (
                                    <path key={`if-${i}`} d={f.d} fill="none" stroke={f.c} strokeWidth={f.w} strokeLinecap="round"
                                        strokeOpacity={(ci * 0.5).toFixed(2)}>
                                        <animate attributeName="strokeOpacity" values={`${(ci * 0.5).toFixed(2)};${(ci * 0.12).toFixed(2)};${(ci * 0.5).toFixed(2)}`} dur={f.dur} repeatCount="indefinite" />
                                        <animate attributeName="strokeWidth" values={`${f.w};${f.w + 1.5};${f.w}`} dur={f.dur} repeatCount="indefinite" />
                                    </path>
                                ))}
                            </g>
                            {/* Rising heat sparks */}
                            <g filter={`url(#${uid}-glow)`}>
                                {[0,1,2,3,4,5].map(i => {
                                    const cx = 50 + i * 20;
                                    const cy = 290 - (i % 3) * 15;
                                    return <circle key={`hs-${i}`} cx={cx} cy={cy} r={1.5} fill={i % 2 === 0 ? sc : cosmeticColor} fillOpacity={(ci * 0.5).toFixed(2)}>
                                        <animate attributeName="cy" values={`${cy};${cy - 35};${cy}`} dur={`${1.2 + i * 0.2}s`} repeatCount="indefinite" />
                                        <animate attributeName="fillOpacity" values={`${(ci * 0.5).toFixed(2)};0;${(ci * 0.5).toFixed(2)}`} dur={`${1.2 + i * 0.2}s`} repeatCount="indefinite" />
                                    </circle>;
                                })}
                            </g>
                        </g>
                    );

                    // Frost Wake Trail: crystalline ice forming and shattering
                    if (trailId === 'trail_ice') return (
                        <g>
                            <g filter={`url(#${uid}-bloom)`}>
                                {/* Frosty mist at base */}
                                <ellipse cx="100" cy="300" rx="60" ry="12" fill={sc} fillOpacity={(ci * 0.15).toFixed(2)} style={{ filter: 'blur(8px)' }}>
                                    <animate attributeName="rx" values="60;68;60" dur="3s" repeatCount="indefinite" />
                                </ellipse>
                            </g>
                            <g filter={`url(#${uid}-soft)`}>
                                {/* Ice crystal shards growing downward */}
                                {[
                                    { points: '70,200 62,230 70,225 58,260 68,255 55,290', dur: '2.5s' },
                                    { points: '85,205 78,235 86,230 75,265 84,260 72,295', dur: '2.8s' },
                                    { points: '130,200 138,230 130,225 142,260 132,255 145,290', dur: '2.6s' },
                                    { points: '115,205 122,235 114,230 125,265 116,260 128,295', dur: '2.9s' },
                                ].map((s, i) => (
                                    <polyline key={`ic-${i}`} points={s.points} fill="none"
                                        stroke={i % 2 === 0 ? cosmeticColor : sc}
                                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                        strokeOpacity={(ci * 0.5).toFixed(2)}>
                                        <animate attributeName="strokeOpacity" values={`${(ci * 0.5).toFixed(2)};${(ci * 0.15).toFixed(2)};${(ci * 0.5).toFixed(2)}`} dur={s.dur} repeatCount="indefinite" />
                                    </polyline>
                                ))}
                                {/* Hexagonal snowflake shapes */}
                                {[{cx:55,cy:275},{cx:145,cy:278},{cx:100,cy:295}].map((p, i) => {
                                    const r = 5 + i * 2;
                                    return <g key={`sf-${i}`}>
                                        {[0,60,120].map(a => {
                                            const rad = (a * Math.PI) / 180;
                                            return <line key={a} x1={p.cx - Math.cos(rad) * r} y1={p.cy - Math.sin(rad) * r}
                                                x2={p.cx + Math.cos(rad) * r} y2={p.cy + Math.sin(rad) * r}
                                                stroke={cosmeticColor} strokeWidth="1" strokeOpacity={(ci * 0.35).toFixed(2)}>
                                                <animate attributeName="strokeOpacity" values={`${(ci * 0.35).toFixed(2)};${(ci * 0.08).toFixed(2)};${(ci * 0.35).toFixed(2)}`} dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                                            </line>;
                                        })}
                                    </g>;
                                })}
                            </g>
                        </g>
                    );

                    // Spectral Trail: ghostly after-images with wispy echoes
                    if (trailId === 'trail_spectral') return (
                        <g>
                            <g filter={`url(#${uid}-bloom)`}>
                                {/* Ghostly silhouette echoes at offset positions */}
                                {[
                                    { x: -12, y: 15, opacity: 0.08, scale: 0.95 },
                                    { x: 12, y: 25, opacity: 0.05, scale: 0.9 },
                                    { x: -8, y: 40, opacity: 0.03, scale: 0.85 },
                                ].map((echo, i) => (
                                    <ellipse key={`ge-${i}`}
                                        cx={100 + echo.x} cy={150 + echo.y}
                                        rx={40 * echo.scale} ry={80 * echo.scale}
                                        fill={i % 2 === 0 ? cosmeticColor : sc}
                                        fillOpacity={(ci * echo.opacity).toFixed(3)}>
                                        <animate attributeName="fillOpacity"
                                            values={`${(ci * echo.opacity).toFixed(3)};${(ci * echo.opacity * 0.3).toFixed(3)};${(ci * echo.opacity).toFixed(3)}`}
                                            dur={`${3 + i * 0.8}s`} repeatCount="indefinite" />
                                        <animate attributeName="cx"
                                            values={`${100 + echo.x};${100 + echo.x * 1.5};${100 + echo.x}`}
                                            dur={`${3 + i * 0.8}s`} repeatCount="indefinite" />
                                    </ellipse>
                                ))}
                            </g>
                            <g filter={`url(#${uid}-soft)`}>
                                {/* Wispy spectral tendrils */}
                                {[
                                    'M78 200 Q60 225 55 260 Q52 285 58 310 Q50 320 45 340',
                                    'M72 190 Q48 215 42 250 Q38 280 45 305 Q38 315 32 335',
                                    'M122 200 Q140 225 145 260 Q148 285 142 310 Q150 320 155 340',
                                    'M128 190 Q152 215 158 250 Q162 280 155 305 Q162 315 168 335',
                                ].map((d, i) => (
                                    <path key={`sp-${i}`} d={d} fill="none"
                                        stroke={i % 2 === 0 ? cosmeticColor : sc}
                                        strokeWidth={1.8} strokeLinecap="round"
                                        strokeOpacity={(ci * 0.35).toFixed(2)}
                                        strokeDasharray="12 8">
                                        <animate attributeName="strokeDashoffset" values={`0;${i % 2 === 0 ? -40 : 40}`} dur={`${3 + i * 0.4}s`} repeatCount="indefinite" />
                                        <animate attributeName="strokeOpacity" values={`${(ci * 0.35).toFixed(2)};${(ci * 0.08).toFixed(2)};${(ci * 0.35).toFixed(2)}`} dur={`${3 + i * 0.4}s`} repeatCount="indefinite" />
                                    </path>
                                ))}
                            </g>
                            {/* Ghostly orbs fading in and out */}
                            <g filter={`url(#${uid}-glow)`}>
                                {[{cx:48,cy:270},{cx:152,cy:275},{cx:55,cy:310},{cx:145,cy:315},{cx:100,cy:330}].map((p, i) => (
                                    <circle key={`go-${i}`} cx={p.cx} cy={p.cy} r={2.5} fill={i % 2 === 0 ? cosmeticColor : sc} fillOpacity="0">
                                        <animate attributeName="fillOpacity" values={`0;${(ci * 0.45).toFixed(2)};0`} dur={`${2.5 + i * 0.5}s`} repeatCount="indefinite" />
                                        <animate attributeName="r" values="1.5;3.5;1.5" dur={`${2.5 + i * 0.5}s`} repeatCount="indefinite" />
                                    </circle>
                                ))}
                            </g>
                        </g>
                    );

                    // Fallback: generic wisp trail
                    return (
                        <g>
                            <g filter={`url(#${uid}-bloom)`}>
                                <path d="M75 195 Q35 235 22 300" fill="none" stroke={cosmeticColor} strokeWidth="10" strokeLinecap="round" strokeOpacity={(ci * 0.12).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.12).toFixed(2)};${(ci * 0.04).toFixed(2)};${(ci * 0.12).toFixed(2)}`} dur="3s" repeatCount="indefinite" />
                                </path>
                                <path d="M125 195 Q165 235 178 300" fill="none" stroke={cosmeticColor} strokeWidth="10" strokeLinecap="round" strokeOpacity={(ci * 0.12).toFixed(2)}>
                                    <animate attributeName="strokeOpacity" values={`${(ci * 0.04).toFixed(2)};${(ci * 0.12).toFixed(2)};${(ci * 0.04).toFixed(2)}`} dur="3s" repeatCount="indefinite" />
                                </path>
                            </g>
                            <g filter={`url(#${uid}-soft)`}>
                                <path d="M78 200 Q48 225 38 260 Q30 280 25 310" fill="none" stroke={cosmeticColor} strokeWidth="2.5" strokeLinecap="round" strokeOpacity={(ci * 0.55).toFixed(2)} strokeDasharray="8 12">
                                    <animate attributeName="strokeDashoffset" values="0;-40" dur="1.8s" repeatCount="indefinite" />
                                </path>
                                <path d="M122 200 Q152 225 162 260 Q170 280 175 310" fill="none" stroke={cosmeticColor} strokeWidth="2.5" strokeLinecap="round" strokeOpacity={(ci * 0.55).toFixed(2)} strokeDasharray="8 12">
                                    <animate attributeName="strokeDashoffset" values="0;-40" dur="2s" repeatCount="indefinite" />
                                </path>
                            </g>
                        </g>
                    );
                })()}
            </g>
        </svg>
    );
};

export default OperativeAvatar;

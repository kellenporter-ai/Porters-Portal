import React, { useMemo } from 'react';

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
];

interface OperativeAvatarProps {
    equipped: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
    appearance?: {
        bodyType?: 'A' | 'B' | 'C';
        hue?: number;
        skinTone?: number;
        hairStyle?: number;
        hairColor?: number;
    };
    evolutionLevel?: number;
    activeCosmetic?: string;
    cosmeticColor?: string;
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

const getHairPaths = (style: number, hw: number): { main: string; back?: string; accent?: string } => {
    const cx = 100;
    const L = cx - hw, R = cx + hw;
    switch (style) {
        case 0: // Buzz cut
            return { main: `M${L + 2} 40 Q${L} 30 ${cx} 26 Q${R} 30 ${R - 2} 40 Q${R - 4} 33 ${cx} 30 Q${L + 4} 33 ${L + 2} 40` };
        case 1: // Short crop
            return { main: `M${L} 44 Q${L - 1} 28 ${cx} 22 Q${R + 1} 28 ${R} 44 Q${R - 2} 32 ${cx} 28 Q${L + 2} 32 ${L} 44` };
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
        case 4: // Ponytail
            return {
                main: `M${L} 44 Q${L - 1} 26 ${cx} 22 Q${R + 1} 26 ${R} 44 Q${R - 2} 32 ${cx} 28 Q${L + 2} 32 ${L} 44`,
                back: `M${cx + 4} 32 Q${cx + 8} 30 ${cx + 10} 38 Q${cx + 14} 60 ${cx + 8} 82 Q${cx + 4} 86 ${cx + 2} 78 Q${cx + 6} 62 ${cx + 6} 42 Z`,
            };
        case 5: // Spiky
            return {
                main: `M${L} 44 Q${L - 1} 28 ${cx} 22 Q${R + 1} 28 ${R} 44 Q${R - 2} 32 ${cx} 28 Q${L + 2} 32 ${L} 44`,
                accent: `M${cx - 12} 32 L${cx - 16} 12 L${cx - 6} 26 L${cx - 4} 8 L${cx + 2} 24 L${cx + 6} 6 L${cx + 8} 26 L${cx + 16} 10 L${cx + 12} 32`,
            };
        default:
            return { main: `M${L} 44 Q${L - 1} 28 ${cx} 22 Q${R + 1} 28 ${R} 44 Q${R - 2} 32 ${cx} 28 Q${L + 2} 32 ${L} 44` };
    }
};

const OperativeAvatar: React.FC<OperativeAvatarProps> = ({ equipped, appearance, evolutionLevel = 1, activeCosmetic, cosmeticColor }) => {
    const hue = appearance?.hue || 0;
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
                <filter id="av-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
                </filter>
                <filter id="av-soft" x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur stdDeviation="1.5" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
                </filter>
                <filter id="av-bloom" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
                </filter>
                <linearGradient id="av-outfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`hsl(${hue + 240}, 20%, 20%)`} />
                    <stop offset="100%" stopColor={`hsl(${hue + 240}, 18%, 12%)`} />
                </linearGradient>
                <linearGradient id="av-hl" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={`hsla(${hue + 240}, 30%, 35%, 0.2)`} />
                    <stop offset="100%" stopColor="transparent" />
                </linearGradient>
                <linearGradient id="av-pants" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`hsl(${hue + 240}, 15%, 16%)`} />
                    <stop offset="100%" stopColor={`hsl(${hue + 240}, 12%, 10%)`} />
                </linearGradient>
                <radialGradient id="av-face" cx="45%" cy="40%" r="55%">
                    <stop offset="0%" stopColor={skin} /><stop offset="100%" stopColor={skinSh} />
                </radialGradient>
                <radialGradient id="av-energy" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={`hsl(${hue + 180}, 100%, 70%)`} stopOpacity={coreInt} />
                    <stop offset="60%" stopColor={`hsl(${hue + 200}, 80%, 50%)`} stopOpacity={coreInt * 0.3} />
                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="av-hair" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stopColor={hair} /><stop offset="100%" stopColor={hair + 'cc'} />
                </linearGradient>
            </defs>

            {/* Platform shadow */}
            <ellipse cx="100" cy="326" rx="42" ry="5" fill="rgba(0,0,0,0.3)">
                <animate attributeName="rx" values="42;39;42" dur="3.5s" repeatCount="indefinite" />
            </ellipse>

            {/* Body group with breathing */}
            <g>
                <animateTransform attributeName="transform" type="translate" values="0,0;0,-1.5;0,0" dur="3.5s" repeatCount="indefinite" />

                {/* === WINGS (Level 30+) === */}
                {evolutionLevel >= 30 && (
                    <g filter="url(#av-bloom)">
                        <path d={evolutionLevel >= 50
                            ? "M58 105 Q18 60 28 25 Q38 50 52 72 Q32 58 22 38 Q36 56 52 82 Z"
                            : "M60 115 Q32 82 40 55 Q47 72 56 88 Z"}
                              fill={evolutionLevel >= 50 ? 'rgba(251,191,36,0.12)' : 'rgba(139,92,246,0.1)'}
                              stroke={evolutionLevel >= 50 ? '#fbbf24' : '#a78bfa'} strokeWidth="0.5" strokeOpacity="0.4">
                            <animate attributeName="opacity" values="0.8;0.4;0.8" dur="3s" repeatCount="indefinite" />
                        </path>
                        <path d={evolutionLevel >= 50
                            ? "M142 105 Q182 60 172 25 Q162 50 148 72 Q168 58 178 38 Q164 56 148 82 Z"
                            : "M140 115 Q168 82 160 55 Q153 72 144 88 Z"}
                              fill={evolutionLevel >= 50 ? 'rgba(251,191,36,0.12)' : 'rgba(139,92,246,0.1)'}
                              stroke={evolutionLevel >= 50 ? '#fbbf24' : '#a78bfa'} strokeWidth="0.5" strokeOpacity="0.4">
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
                      fill="url(#av-pants)" stroke={`hsl(${hue + 240},15%,22%)`} strokeWidth="0.8" />
                <path d={isTypeC
                    ? "M106 200 L104 270 Q104 282 111 282 L118 282 Q122 282 121 276 L120 200"
                    : isTypeB
                    ? "M107 198 L105 272 Q105 282 112 282 L120 282 Q124 282 123 276 L121 198"
                    : "M106 198 L103 270 Q103 282 110 282 L118 282 Q123 282 122 276 L120 198"}
                      fill="url(#av-pants)" stroke={`hsl(${hue + 240},15%,22%)`} strokeWidth="0.8" />

                {/* === FEET === */}
                {feet ? (() => {
                    const s = getRarityStyle(feet)!;
                    return (
                        <g filter={s.intensity > 0.5 ? "url(#av-soft)" : undefined}>
                            <path d="M76 270 L74 282 Q72 292 82 292 L96 292 Q100 292 98 284 L96 270" fill={s.primary} stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.6" />
                            <path d="M102 270 L100 282 Q98 292 108 292 L122 292 Q126 292 124 284 L122 270" fill={s.primary} stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.6" />
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
                        <path d="M76 270 L74 282 Q72 290 82 290 L96 290 Q100 290 98 282 L96 270" fill={`hsl(${hue + 240},12%,14%)`} stroke={`hsl(${hue + 240},10%,20%)`} strokeWidth="0.5" />
                        <path d="M102 270 L100 282 Q98 290 108 290 L122 290 Q126 290 124 282 L122 270" fill={`hsl(${hue + 240},12%,14%)`} stroke={`hsl(${hue + 240},10%,20%)`} strokeWidth="0.5" />
                    </g>
                )}

                {/* === TORSO === */}
                <path d={isTypeC
                    ? "M70 88 Q100 82 130 88 L122 140 L128 200 Q100 208 72 200 L78 140 Z"
                    : isTypeB
                    ? "M64 88 Q100 82 136 88 L128 200 Q100 206 72 200 Z"
                    : "M68 88 Q100 82 132 88 L126 200 Q100 206 74 200 Z"}
                      fill="url(#av-outfit)" stroke={`hsl(${hue + 240},18%,25%)`} strokeWidth="1" />
                <path d={isTypeC
                    ? "M70 88 Q100 82 100 88 L100 200 Q86 204 72 200 L78 140 Z"
                    : isTypeB
                    ? "M64 88 Q100 82 100 88 L100 200 Q86 203 72 200 Z"
                    : "M68 88 Q100 82 100 88 L100 200 Q86 204 74 200 Z"}
                      fill="url(#av-hl)" />
                {/* Collar V showing skin */}
                <path d="M88 88 L100 105 L112 88" fill={skin} />
                <path d="M86 87 L100 106 L114 87" fill="none" stroke={`hsl(${hue + 240},20%,28%)`} strokeWidth="1.2" />
                <line x1="100" y1="106" x2="100" y2="195" stroke={`hsla(${hue + 180},30%,40%,0.08)`} strokeWidth="0.5" />

                {/* === CHEST GEAR === */}
                {chest && (() => {
                    const s = getRarityStyle(chest)!;
                    return (
                        <g filter={s.intensity > 0.5 ? "url(#av-soft)" : undefined}>
                            <path d={isTypeC
                                ? "M72 92 Q100 86 128 92 L122 175 Q100 180 78 175 Z"
                                : isTypeB
                                ? "M70 92 Q100 86 130 92 L126 175 Q100 180 74 175 Z"
                                : "M72 92 Q100 86 128 92 L124 175 Q100 180 76 175 Z"}
                                  fill={s.primary} fillOpacity="0.3" stroke={s.primary} strokeWidth="1" strokeOpacity="0.6" />
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
                    return (
                        <g>
                            <rect x="72" y="188" width="56" height="14" rx="3" fill={s.primary} fillOpacity="0.55" stroke={s.primary} strokeWidth="0.8" />
                            <rect x="94" y="189" width="12" height="12" rx="2" fill={s.particle} fillOpacity="0.4" />
                            <rect x="74" y="190" width="8" height="10" rx="2" fill={s.primary} fillOpacity="0.3" stroke={s.particle} strokeWidth="0.3" />
                            <rect x="118" y="190" width="8" height="10" rx="2" fill={s.primary} fillOpacity="0.3" stroke={s.particle} strokeWidth="0.3" />
                        </g>
                    );
                })() : <line x1="74" y1="195" x2="126" y2="195" stroke={`hsl(${hue + 240},15%,25%)`} strokeWidth="1.5" />}

                {/* === ARMS === */}
                <path d={isTypeC
                    ? "M70 90 L52 94 Q46 96 46 103 L45 155 Q45 160 49 160 L59 160 L66 155 Z"
                    : isTypeB
                    ? "M64 90 L46 94 Q40 96 40 103 L40 155 Q40 160 44 160 L56 160 L64 155 Z"
                    : "M68 90 L50 94 Q44 96 43 103 L42 155 Q42 160 46 160 L58 160 L66 155 Z"}
                      fill="url(#av-outfit)" stroke={`hsl(${hue + 240},18%,25%)`} strokeWidth="0.8" />
                <path d={isTypeC
                    ? "M130 90 L148 94 Q154 96 154 103 L155 155 Q155 160 151 160 L141 160 L134 155 Z"
                    : isTypeB
                    ? "M136 90 L154 94 Q160 96 160 103 L160 155 Q160 160 156 160 L144 160 L136 155 Z"
                    : "M132 90 L150 94 Q156 96 157 103 L158 155 Q158 160 154 160 L142 160 L134 155 Z"}
                      fill="url(#av-outfit)" stroke={`hsl(${hue + 240},18%,25%)`} strokeWidth="0.8" />

                {/* === HANDS === */}
                {hands ? (() => {
                    const s = getRarityStyle(hands)!;
                    return (
                        <g filter={s.intensity > 0.5 ? "url(#av-soft)" : undefined}>
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
                    <g filter="url(#av-bloom)">
                        <circle cx="100" cy="130" r="6" fill="url(#av-energy)">
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
                        <g filter="url(#av-glow)">
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
                    {hairPaths.back && <path d={hairPaths.back} fill="url(#av-hair)" opacity="0.8" />}

                    {/* Head shape */}
                    <ellipse cx="100" cy="50" rx={headW} ry="28" fill="url(#av-face)" stroke={skinSh} strokeWidth="0.5" />

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
                    <path d={hairPaths.main} fill="url(#av-hair)" />
                    {hairPaths.accent && <path d={hairPaths.accent} fill="url(#av-hair)" opacity="0.9" />}

                    {/* === HEAD GEAR === */}
                    {head && (() => {
                        const s = getRarityStyle(head)!;
                        const vid = head.visualId || '';
                        return (
                            <g filter={s.intensity > 0.5 ? "url(#av-glow)" : "url(#av-soft)"}>
                                {vid.includes('helm') ? <>
                                    <path d={`M${100 - headW - 2} 28 Q100 10 ${100 + headW + 2} 28 L${100 + headW + 4} 62 Q100 72 ${100 - headW - 4} 62 Z`}
                                          fill={s.primary} fillOpacity="0.55" stroke={s.primary} strokeWidth="1.2" />
                                    <rect x="80" y="44" width="40" height="8" rx="4" fill={`hsl(${hue + 180},90%,55%)`} fillOpacity="0.85">
                                        <animate attributeName="fillOpacity" values="0.85;0.5;0.85" dur="3s" repeatCount="indefinite" />
                                    </rect>
                                </> : vid.includes('visor') ? <>
                                    <rect x="80" y="42" width="40" height="12" rx="6" fill={`hsla(${hue + 180},80%,50%,0.7)`} stroke={s.primary} strokeWidth="1">
                                        <animate attributeName="fillOpacity" values="0.7;0.4;0.7" dur="2.5s" repeatCount="indefinite" />
                                    </rect>
                                    <line x1="76" y1="48" x2="80" y2="48" stroke={s.primary} strokeWidth="1.5" />
                                    <line x1="120" y1="48" x2="124" y2="48" stroke={s.primary} strokeWidth="1.5" />
                                </> : <>
                                    <rect x="78" y="36" width="44" height="6" rx="3" fill={s.primary} fillOpacity="0.7" stroke={s.particle} strokeWidth="0.5" />
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

                {/* === CIRCLET / HALO (Level 15+) === */}
                {evolutionLevel >= 15 && (
                    <g filter="url(#av-glow)">
                        <ellipse cx="100" cy="22" rx="18" ry="4" fill="none"
                                 stroke={evolutionLevel >= 50 ? '#fbbf24' : evolutionLevel >= 30 ? '#a78bfa' : '#60a5fa'}
                                 strokeWidth="1.5" strokeOpacity="0.7">
                            <animate attributeName="strokeOpacity" values="0.7;0.35;0.7" dur="2s" repeatCount="indefinite" />
                        </ellipse>
                        {evolutionLevel >= 30 && (
                            <ellipse cx="100" cy="18" rx="22" ry="5" fill="none"
                                     stroke={evolutionLevel >= 50 ? '#fbbf24' : '#a78bfa'}
                                     strokeWidth="0.8" strokeOpacity="0.35" strokeDasharray="3 3">
                                <animate attributeName="strokeDashoffset" values="0;-12" dur="3s" repeatCount="indefinite" />
                            </ellipse>
                        )}
                        {evolutionLevel >= 50 && [-12, 0, 12].map((x, i) => (
                            <polygon key={i} points={`${100 + x},16 ${97 + x},22 ${103 + x},22`} fill="#fbbf24" fillOpacity="0.6">
                                <animate attributeName="fillOpacity" values="0.6;0.25;0.6" dur={`${1.5 + i * 0.2}s`} repeatCount="indefinite" />
                            </polygon>
                        ))}
                    </g>
                )}

                {/* Unique item aura */}
                {hasUnique && (
                    <g filter="url(#av-bloom)">
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

                {/* Evolution shoulder accents (5+) */}
                {evolutionLevel >= 5 && <>
                    <line x1="56" y1="90" x2="48" y2="97" stroke={`hsl(${hue + 180},70%,50%)`} strokeWidth="1" strokeOpacity={0.12 + evolutionLevel * 0.004} />
                    <line x1="144" y1="90" x2="152" y2="97" stroke={`hsl(${hue + 180},70%,50%)`} strokeWidth="1" strokeOpacity={0.12 + evolutionLevel * 0.004} />
                </>}

                {/* Evolution particles (5+) */}
                {evolutionLevel >= 5 && (
                    <g filter="url(#av-soft)">
                        {Array.from({ length: Math.min(8, Math.floor(evolutionLevel / 6)) }).map((_, i) => {
                            const a = (i * 360 / Math.min(8, Math.floor(evolutionLevel / 6))) * (Math.PI / 180);
                            const px = 100 + Math.cos(a) * (38 + i * 3);
                            const py = 140 + Math.sin(a) * (55 + i * 2);
                            const c = evolutionLevel >= 50 ? '#fbbf24' : evolutionLevel >= 30 ? '#a78bfa' : evolutionLevel >= 15 ? '#60a5fa' : `hsl(${hue + 180},70%,60%)`;
                            return (
                                <circle key={i} cx={px} cy={py} r="1" fill={c} fillOpacity="0.35">
                                    <animate attributeName="cy" values={`${py};${py - 12};${py}`} dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                                    <animate attributeName="fillOpacity" values="0.35;0;0.35" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                                </circle>
                            );
                        })}
                    </g>
                )}

                {/* Seasonal cosmetic particles */}
                {activeCosmetic && cosmeticColor && (
                    <g filter="url(#av-soft)">
                        {Array.from({ length: 8 }).map((_, i) => {
                            const px = 60 + Math.random() * 80;
                            const py = 20 + Math.random() * 260;
                            return (
                                <circle key={`c-${i}`} cx={px} cy={py} r={1 + Math.random()} fill={cosmeticColor} fillOpacity="0.45">
                                    <animate attributeName="cy" values={`${py};${py - 25};${py}`} dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
                                    <animate attributeName="fillOpacity" values="0.45;0;0.45" dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
                                </circle>
                            );
                        })}
                    </g>
                )}
            </g>
        </svg>
    );
};

export default OperativeAvatar;

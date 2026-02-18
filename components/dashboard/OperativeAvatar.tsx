import React, { useMemo } from 'react';

interface OperativeAvatarProps {
    equipped: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
    appearance?: { bodyType?: 'A' | 'B'; hue?: number };
}

const RARITY_COLORS: Record<string, { primary: string; glow: string; particle: string }> = {
    COMMON:   { primary: '#64748b', glow: 'rgba(100,116,139,0.4)', particle: '#94a3b8' },
    UNCOMMON: { primary: '#22c55e', glow: 'rgba(34,197,94,0.5)',   particle: '#4ade80' },
    RARE:     { primary: '#3b82f6', glow: 'rgba(59,130,246,0.6)',  particle: '#60a5fa' },
    UNIQUE:   { primary: '#f59e0b', glow: 'rgba(245,158,11,0.7)',  particle: '#fbbf24' },
};

const getRarityStyle = (item: { rarity?: string } | null | undefined) => {
    if (!item) return null;
    return RARITY_COLORS[item.rarity as keyof typeof RARITY_COLORS] || RARITY_COLORS.COMMON;
};

const OperativeAvatar: React.FC<OperativeAvatarProps> = ({ equipped, appearance }) => {
    const hue = appearance?.hue || 0;
    const isTypeB = appearance?.bodyType === 'B';

    const head = equipped?.HEAD;
    const chest = equipped?.CHEST;
    const hands = equipped?.HANDS;
    const feet = equipped?.FEET;
    const belt = equipped?.BELT;
    const amulet = equipped?.AMULET;

    const equippedCount = useMemo(() => 
        [head, chest, hands, feet, belt, amulet].filter(Boolean).length
    , [head, chest, hands, feet, belt, amulet]);

    const hasUniqueItem = useMemo(() =>
        [head, chest, hands, feet, belt, amulet].some(i => i?.rarity === 'UNIQUE')
    , [head, chest, hands, feet, belt, amulet]);

    const coreIntensity = Math.min(1, 0.3 + equippedCount * 0.12);

    return (
        <svg viewBox="0 0 200 340" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 20px rgba(147,51,234,0.15))' }}>
            <defs>
                {/* Glow filter */}
                <filter id="av-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="av-soft" x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="av-bloom" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>

                {/* Suit gradient */}
                <linearGradient id="av-suit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`hsl(${hue + 240}, 30%, 22%)`} />
                    <stop offset="100%" stopColor={`hsl(${hue + 240}, 25%, 12%)`} />
                </linearGradient>
                <linearGradient id="av-suit-highlight" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={`hsla(${hue + 240}, 40%, 40%, 0.3)`} />
                    <stop offset="100%" stopColor="transparent" />
                </linearGradient>

                {/* Core energy gradient */}
                <radialGradient id="av-core-energy" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={`hsl(${hue + 180}, 100%, 70%)`} stopOpacity={coreIntensity} />
                    <stop offset="60%" stopColor={`hsl(${hue + 200}, 80%, 50%)`} stopOpacity={coreIntensity * 0.4} />
                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>

                {/* Helmet visor gradient */}
                <linearGradient id="av-visor" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={`hsl(${hue + 180}, 90%, 55%)`} />
                    <stop offset="100%" stopColor={`hsl(${hue + 200}, 80%, 45%)`} />
                </linearGradient>
            </defs>

            {/* === PLATFORM SHADOW === */}
            <ellipse cx="100" cy="328" rx="45" ry="6" fill="rgba(0,0,0,0.4)">
                <animate attributeName="rx" values="45;42;45" dur="3.5s" repeatCount="indefinite" />
            </ellipse>

            {/* === BODY GROUP (breathing animation) === */}
            <g id="av-body">
                <animateTransform
                    attributeName="transform"
                    type="translate"
                    values="0,0; 0,-1.5; 0,0"
                    dur="3.5s"
                    repeatCount="indefinite"
                />

                {/* === LEGS === */}
                <g>
                    <path 
                        d={isTypeB 
                            ? "M79 200 L77 272 Q77 280 82 280 L90 280 Q94 280 94 276 L92 200" 
                            : "M78 200 L75 270 Q75 280 82 280 L92 280 Q97 280 96 275 L93 200"
                        }
                        fill="url(#av-suit)" stroke={`hsl(${hue + 240}, 30%, 30%)`} strokeWidth="1"
                    />
                    <path 
                        d={isTypeB 
                            ? "M108 200 L106 272 Q106 280 111 280 L119 280 Q123 280 123 276 L121 200"
                            : "M107 200 L104 270 Q104 280 111 280 L121 280 Q126 280 125 275 L122 200"
                        }
                        fill="url(#av-suit)" stroke={`hsl(${hue + 240}, 30%, 30%)`} strokeWidth="1"
                    />
                    {/* Knee accents */}
                    <ellipse cx="85" cy="235" rx="6" ry="3" fill={`hsla(${hue + 180}, 60%, 50%, 0.15)`} />
                    <ellipse cx="115" cy="235" rx="6" ry="3" fill={`hsla(${hue + 180}, 60%, 50%, 0.15)`} />
                </g>

                {/* === FEET EQUIPMENT === */}
                {feet && (() => {
                    const s = getRarityStyle(feet)!;
                    return (
                        <g filter="url(#av-soft)">
                            <path d="M74 268 L72 280 Q70 290 80 290 L92 290 Q98 290 96 282 L94 268" 
                                  fill={s.primary} stroke="white" strokeWidth="0.5" strokeOpacity="0.4" />
                            <path d="M104 268 L102 280 Q100 290 110 290 L122 290 Q128 290 126 282 L124 268" 
                                  fill={s.primary} stroke="white" strokeWidth="0.5" strokeOpacity="0.4" />
                            <line x1="78" y1="278" x2="92" y2="278" stroke={s.particle} strokeWidth="1" strokeOpacity="0.6" />
                            <line x1="108" y1="278" x2="122" y2="278" stroke={s.particle} strokeWidth="1" strokeOpacity="0.6" />
                        </g>
                    );
                })()}

                {/* === TORSO === */}
                <path 
                    d={isTypeB 
                        ? "M66 90 Q100 85 134 90 L128 200 Q100 205 72 200 Z"
                        : "M68 90 Q100 82 132 90 L126 200 Q100 206 74 200 Z"
                    }
                    fill="url(#av-suit)" stroke={`hsl(${hue + 240}, 25%, 28%)`} strokeWidth="1.5"
                />
                {/* Suit highlight */}
                <path 
                    d={isTypeB 
                        ? "M66 90 Q100 85 100 90 L100 200 Q86 202 72 200 Z"
                        : "M68 90 Q100 82 100 90 L100 200 Q86 204 74 200 Z"
                    }
                    fill="url(#av-suit-highlight)"
                />
                {/* Panel lines */}
                <line x1="100" y1="92" x2="100" y2="195" stroke={`hsla(${hue + 180}, 40%, 50%, 0.1)`} strokeWidth="0.5" />
                <line x1="82" y1="100" x2="82" y2="190" stroke={`hsla(${hue + 180}, 40%, 50%, 0.06)`} strokeWidth="0.5" />
                <line x1="118" y1="100" x2="118" y2="190" stroke={`hsla(${hue + 180}, 40%, 50%, 0.06)`} strokeWidth="0.5" />

                {/* === CHEST EQUIPMENT === */}
                {chest && (() => {
                    const s = getRarityStyle(chest)!;
                    return (
                        <g filter="url(#av-soft)">
                            <path 
                                d={isTypeB 
                                    ? "M72 95 Q100 90 128 95 L125 170 Q100 175 75 170 Z"
                                    : "M74 95 Q100 88 126 95 L123 170 Q100 176 77 170 Z"
                                }
                                fill={s.primary} fillOpacity="0.35" stroke={s.primary} strokeWidth="1" strokeOpacity="0.6"
                            />
                            <path d="M80 110 L120 110" stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.3" />
                            <path d="M82 130 L118 130" stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.3" />
                            <path d="M84 150 L116 150" stroke={s.particle} strokeWidth="0.8" strokeOpacity="0.3" />
                            <circle cx="100" cy="120" r="6" fill="none" stroke={s.primary} strokeWidth="1.5" strokeOpacity="0.7" />
                            <circle cx="100" cy="120" r="2" fill={s.particle} fillOpacity="0.8">
                                <animate attributeName="fillOpacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
                            </circle>
                        </g>
                    );
                })()}

                {/* === BELT EQUIPMENT === */}
                {belt && (() => {
                    const s = getRarityStyle(belt)!;
                    return (
                        <g filter="url(#av-soft)">
                            <rect x="72" y="188" width="56" height="12" rx="3" fill={s.primary} fillOpacity="0.6" stroke={s.primary} strokeWidth="0.8" />
                            <rect x="94" y="189" width="12" height="10" rx="2" fill={s.particle} fillOpacity="0.5" />
                            <circle cx="82" cy="194" r="3" fill={s.primary} stroke={s.particle} strokeWidth="0.5" />
                            <circle cx="118" cy="194" r="3" fill={s.primary} stroke={s.particle} strokeWidth="0.5" />
                        </g>
                    );
                })()}

                {/* === ARMS === */}
                <g>
                    <path 
                        d={isTypeB 
                            ? "M66 92 L48 95 Q42 96 42 102 L42 160 Q42 166 48 167 L56 168 L66 160 L66 92"
                            : "M68 92 L52 95 Q45 97 44 103 L42 158 Q42 165 48 167 L58 168 L68 160 L68 92"
                        }
                        fill="url(#av-suit)" stroke={`hsl(${hue + 240}, 30%, 30%)`} strokeWidth="1"
                    />
                    <path 
                        d={isTypeB 
                            ? "M134 92 L152 95 Q158 96 158 102 L158 160 Q158 166 152 167 L144 168 L134 160 L134 92"
                            : "M132 92 L148 95 Q155 97 156 103 L158 158 Q158 165 152 167 L142 168 L132 160 L132 92"
                        }
                        fill="url(#av-suit)" stroke={`hsl(${hue + 240}, 30%, 30%)`} strokeWidth="1"
                    />
                    {/* Shoulder pads */}
                    <ellipse cx="62" cy="94" rx="10" ry="6" fill={`hsl(${hue + 240}, 28%, 20%)`} stroke={`hsla(${hue + 180}, 50%, 50%, 0.2)`} strokeWidth="1" />
                    <ellipse cx="138" cy="94" rx="10" ry="6" fill={`hsl(${hue + 240}, 28%, 20%)`} stroke={`hsla(${hue + 180}, 50%, 50%, 0.2)`} strokeWidth="1" />
                </g>

                {/* === HANDS EQUIPMENT === */}
                {hands && (() => {
                    const s = getRarityStyle(hands)!;
                    return (
                        <g filter="url(#av-soft)">
                            <path d="M40 148 L40 170 Q40 175 46 175 L58 175 Q62 175 62 170 L62 148" 
                                  fill={s.primary} fillOpacity="0.5" stroke={s.primary} strokeWidth="1" strokeOpacity="0.7" />
                            <path d="M138 148 L138 170 Q138 175 144 175 L156 175 Q160 175 160 170 L160 148" 
                                  fill={s.primary} fillOpacity="0.5" stroke={s.primary} strokeWidth="1" strokeOpacity="0.7" />
                            <circle cx="48" cy="170" r="2" fill={s.particle} fillOpacity="0.7">
                                <animate attributeName="fillOpacity" values="0.7;0.3;0.7" dur="1.5s" repeatCount="indefinite" />
                            </circle>
                            <circle cx="152" cy="170" r="2" fill={s.particle} fillOpacity="0.7">
                                <animate attributeName="fillOpacity" values="0.3;0.7;0.3" dur="1.5s" repeatCount="indefinite" />
                            </circle>
                        </g>
                    );
                })()}

                {/* === ENERGY CORE === */}
                <g filter="url(#av-bloom)">
                    <circle cx="100" cy="130" r="8" fill="url(#av-core-energy)">
                        <animate attributeName="r" values="8;10;8" dur="3s" repeatCount="indefinite" />
                    </circle>
                </g>
                <circle cx="100" cy="130" r="3" fill={`hsl(${hue + 180}, 100%, 75%)`} fillOpacity={coreIntensity * 0.8}>
                    <animate attributeName="fillOpacity" values={`${coreIntensity * 0.8};${coreIntensity * 0.4};${coreIntensity * 0.8}`} dur="2s" repeatCount="indefinite" />
                </circle>

                {/* === NECK === */}
                <rect x="92" y="74" width="16" height="18" rx="4" fill={`hsl(${hue + 240}, 25%, 18%)`} />

                {/* === HEAD === */}
                <g>
                    <ellipse cx="100" cy="52" rx={isTypeB ? 22 : 20} ry="28" fill={`hsl(${hue + 240}, 22%, 24%)`} stroke={`hsl(${hue + 240}, 20%, 30%)`} strokeWidth="1.5" />
                    <ellipse cx="100" cy="55" rx="15" ry="16" fill={`hsl(${hue + 240}, 18%, 15%)`} />
                    
                    {/* Default eyes when no helmet */}
                    {!head && (
                        <g>
                            <ellipse cx="91" cy="50" rx="5" ry="3" fill={`hsl(${hue + 180}, 80%, 60%)`} fillOpacity="0.8">
                                <animate attributeName="fillOpacity" values="0.8;0.6;0.8" dur="4s" repeatCount="indefinite" />
                            </ellipse>
                            <ellipse cx="109" cy="50" rx="5" ry="3" fill={`hsl(${hue + 180}, 80%, 60%)`} fillOpacity="0.8">
                                <animate attributeName="fillOpacity" values="0.8;0.6;0.8" dur="4s" repeatCount="indefinite" />
                            </ellipse>
                            <line x1="93" y1="64" x2="107" y2="64" stroke={`hsla(${hue + 180}, 40%, 50%, 0.2)`} strokeWidth="1" strokeLinecap="round" />
                        </g>
                    )}
                </g>

                {/* === HEAD EQUIPMENT === */}
                {head && (() => {
                    const s = getRarityStyle(head)!;
                    const vid = head.visualId || '';
                    return (
                        <g filter="url(#av-glow)">
                            {vid.includes('helm') ? (
                                <>
                                    <path d="M76 25 Q100 8 124 25 L126 65 Q100 75 74 65 Z" 
                                          fill={s.primary} fillOpacity="0.5" stroke={s.primary} strokeWidth="1.5" />
                                    <rect x="80" y="45" width="40" height="8" rx="4" fill="url(#av-visor)" fillOpacity="0.9">
                                        <animate attributeName="fillOpacity" values="0.9;0.6;0.9" dur="3s" repeatCount="indefinite" />
                                    </rect>
                                </>
                            ) : vid.includes('visor') ? (
                                <rect x="78" y="44" width="44" height="12" rx="6" fill="url(#av-visor)" fillOpacity="0.85" stroke={s.primary} strokeWidth="1">
                                    <animate attributeName="fillOpacity" values="0.85;0.55;0.85" dur="2.5s" repeatCount="indefinite" />
                                </rect>
                            ) : (
                                <>
                                    <circle cx="89" cy="48" r="9" fill="none" stroke={s.primary} strokeWidth="2" />
                                    <circle cx="111" cy="48" r="9" fill="none" stroke={s.primary} strokeWidth="2" />
                                    <circle cx="89" cy="48" r="6" fill={s.particle} fillOpacity="0.5">
                                        <animate attributeName="fillOpacity" values="0.5;0.3;0.5" dur="2s" repeatCount="indefinite" />
                                    </circle>
                                    <circle cx="111" cy="48" r="6" fill={s.particle} fillOpacity="0.5">
                                        <animate attributeName="fillOpacity" values="0.3;0.5;0.3" dur="2s" repeatCount="indefinite" />
                                    </circle>
                                    <line x1="98" y1="48" x2="102" y2="48" stroke={s.primary} strokeWidth="2" />
                                </>
                            )}
                        </g>
                    );
                })()}

                {/* === AMULET EQUIPMENT === */}
                {amulet && (() => {
                    const s = getRarityStyle(amulet)!;
                    return (
                        <g filter="url(#av-glow)">
                            <path d="M90 78 Q100 100 110 78" stroke={s.particle} strokeWidth="0.8" fill="none" strokeOpacity="0.5" />
                            <polygon points="100,92 94,100 100,106 106,100" fill={s.primary} stroke={s.particle} strokeWidth="1">
                                <animate attributeName="opacity" values="1;0.7;1" dur="2.5s" repeatCount="indefinite" />
                            </polygon>
                            <circle cx="100" cy="99" r="2.5" fill={s.particle}>
                                <animate attributeName="r" values="2.5;3;2.5" dur="2s" repeatCount="indefinite" />
                            </circle>
                        </g>
                    );
                })()}

                {/* === UNIQUE ITEM PARTICLE AURA === */}
                {hasUniqueItem && (
                    <g filter="url(#av-bloom)">
                        {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                            const rad = (angle * Math.PI) / 180;
                            const cx = 100 + Math.cos(rad) * 55;
                            const cy = 150 + Math.sin(rad) * 80;
                            return (
                                <circle key={i} cx={cx} cy={cy} r="1.5" fill="#fbbf24" fillOpacity="0.6">
                                    <animate attributeName="cy" values={`${cy};${cy - 20};${cy}`} dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
                                    <animate attributeName="fillOpacity" values="0.6;0;0.6" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
                                </circle>
                            );
                        })}
                    </g>
                )}

                {/* === SUIT ENERGY LINES (3+ items equipped) === */}
                {equippedCount >= 3 && (
                    <g>
                        <line x1="100" y1="92" x2="100" y2="195" 
                              stroke={`hsl(${hue + 180}, 80%, 55%)`} strokeWidth="0.6" strokeOpacity="0.2" strokeDasharray="4 6">
                            <animate attributeName="strokeDashoffset" values="0;-20" dur="2s" repeatCount="indefinite" />
                        </line>
                        <line x1="62" y1="94" x2="48" y2="165" 
                              stroke={`hsl(${hue + 180}, 80%, 55%)`} strokeWidth="0.5" strokeOpacity="0.15" strokeDasharray="3 5">
                            <animate attributeName="strokeDashoffset" values="0;-16" dur="1.8s" repeatCount="indefinite" />
                        </line>
                        <line x1="138" y1="94" x2="152" y2="165" 
                              stroke={`hsl(${hue + 180}, 80%, 55%)`} strokeWidth="0.5" strokeOpacity="0.15" strokeDasharray="3 5">
                            <animate attributeName="strokeDashoffset" values="0;-16" dur="1.8s" repeatCount="indefinite" />
                        </line>
                    </g>
                )}
            </g>
        </svg>
    );
};

export default OperativeAvatar;

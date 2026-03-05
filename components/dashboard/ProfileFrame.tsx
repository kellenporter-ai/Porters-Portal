import React, { useMemo } from 'react';

/**
 * ProfileFrame — wraps a profile picture (or initials fallback) with a decorative
 * SVG frame. Each of the 7 frame variants has a unique visual design:
 *   circuit, thorns, diamond, hex, glitch, rune, neon
 *
 * Usage:
 *   <ProfileFrame photoUrl={user.avatarUrl} initials="KP" frameId="frame_circuit" size={64} />
 *
 * The SVG viewBox is always 100x100. The profile picture is clipped to a circle
 * centered at (50,50) with radius 38. The frame ornament is drawn in the remaining
 * border area.
 */

interface ProfileFrameProps {
    photoUrl?: string;
    initials: string;
    frameId?: string;
    size?: number;
    className?: string;
}

// Frame definitions: each has a unique SVG render function
interface FrameDef {
    id: string;
    color: string;
    secondary: string;
    render: (color: string, secondary: string, intensity: number) => React.ReactNode;
}

const FRAME_DEFS: Record<string, FrameDef> = {
    frame_circuit: {
        id: 'frame_circuit',
        color: '#22d3ee',
        secondary: '#0e7490',
        render: (c, s, i) => (
            <g opacity={i}>
                {/* PCB trace ring */}
                <circle cx="50" cy="50" r="45" fill="none" stroke={s} strokeWidth="2" strokeOpacity="0.4" />
                <circle cx="50" cy="50" r="45" fill="none" stroke={c} strokeWidth="1.5"
                    strokeDasharray="8 4 2 4" strokeLinecap="round">
                    <animate attributeName="stroke-dashoffset" values="0;-36" dur="4s" repeatCount="indefinite" />
                </circle>
                {/* Node dots at cardinal + diagonal positions */}
                {[[50,5],[95,50],[50,95],[5,50],[18,18],[82,18],[82,82],[18,82]].map(([x,y],i) => (
                    <g key={i}>
                        <circle cx={x} cy={y} r="2.5" fill={c}>
                            <animate attributeName="opacity" values="1;0.3;1" dur={`${1.5+i*0.2}s`} repeatCount="indefinite" />
                        </circle>
                        <circle cx={x} cy={y} r="1" fill="#fff" opacity="0.8" />
                    </g>
                ))}
                {/* Right-angle trace paths connecting nodes */}
                <path d="M50 5 L50 2 L82 2 L82 18" fill="none" stroke={c} strokeWidth="1" opacity="0.6" />
                <path d="M95 50 L98 50 L98 82 L82 82" fill="none" stroke={c} strokeWidth="1" opacity="0.6" />
                <path d="M50 95 L50 98 L18 98 L18 82" fill="none" stroke={c} strokeWidth="1" opacity="0.6" />
                <path d="M5 50 L2 50 L2 18 L18 18" fill="none" stroke={c} strokeWidth="1" opacity="0.6" />
                {/* Outer glow ring */}
                <circle cx="50" cy="50" r="48" fill="none" stroke={c} strokeWidth="0.5" opacity="0.2" />
            </g>
        ),
    },

    frame_thorns: {
        id: 'frame_thorns',
        color: '#dc2626',
        secondary: '#7f1d1d',
        render: (c, s, i) => (
            <g opacity={i}>
                {/* Vine base ring */}
                <circle cx="50" cy="50" r="44" fill="none" stroke={s} strokeWidth="3" strokeOpacity="0.5" />
                {/* Thorny vine path — organic, wrapping clockwise */}
                <path
                    d="M50 6 Q65 8 72 15 Q78 10 82 18 Q88 22 85 32 Q92 35 90 45
                       Q96 50 90 55 Q92 65 85 68 Q88 78 82 82 Q78 90 72 85
                       Q65 92 50 94 Q35 92 28 85 Q22 90 18 82 Q12 78 15 68
                       Q8 65 10 55 Q4 50 10 45 Q8 35 15 32 Q12 22 18 18
                       Q22 10 28 15 Q35 8 50 6"
                    fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round"
                />
                {/* Spike thorns protruding outward at various angles */}
                {[0,40,80,120,160,200,240,280,320].map((angle, idx) => {
                    const rad = (angle * Math.PI) / 180;
                    const bx = 50 + 44 * Math.cos(rad);
                    const by = 50 + 44 * Math.sin(rad);
                    const tx = 50 + 52 * Math.cos(rad + 0.15);
                    const ty = 50 + 52 * Math.sin(rad + 0.15);
                    const rx = 50 + 44 * Math.cos(rad + 0.3);
                    const ry = 50 + 44 * Math.sin(rad + 0.3);
                    return (
                        <path key={idx} d={`M${bx} ${by} L${tx} ${ty} L${rx} ${ry}`}
                            fill={c} fillOpacity="0.7" stroke={c} strokeWidth="0.5">
                            <animate attributeName="fill-opacity" values="0.7;0.3;0.7"
                                dur={`${2+idx*0.15}s`} repeatCount="indefinite" />
                        </path>
                    );
                })}
                {/* Inner vine accent */}
                <circle cx="50" cy="50" r="42" fill="none" stroke={c} strokeWidth="0.5" opacity="0.3"
                    strokeDasharray="3 5" />
            </g>
        ),
    },

    frame_diamond: {
        id: 'frame_diamond',
        color: '#a78bfa',
        secondary: '#f5f3ff',
        render: (c, s, i) => (
            <g opacity={i}>
                {/* Faceted outer ring — octagonal with prismatic segments */}
                <polygon
                    points="50,3 73,13 90,30 97,50 90,70 73,87 50,97 27,87 10,70 3,50 10,30 27,13"
                    fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="bevel"
                />
                {/* Inner facet lines creating gem-cut appearance */}
                {[[50,3],[73,13],[90,30],[97,50],[90,70],[73,87],
                  [50,97],[27,87],[10,70],[3,50],[10,30],[27,13]].map(([x1,y1],idx) => (
                    <line key={idx} x1={x1} y1={y1} x2="50" y2="50"
                        stroke={s} strokeWidth="0.5" opacity="0.15" />
                ))}
                {/* Prismatic shimmer — rotating highlight */}
                <polygon
                    points="50,3 73,13 90,30 97,50 90,70 73,87 50,97 27,87 10,70 3,50 10,30 27,13"
                    fill="none" stroke={s} strokeWidth="2" strokeOpacity="0"
                    strokeDasharray="25 120">
                    <animate attributeName="stroke-dashoffset" values="0;-145" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0;0.8;0" dur="3s" repeatCount="indefinite" />
                </polygon>
                {/* Corner gems */}
                {[[50,3],[97,50],[50,97],[3,50]].map(([x,y],idx) => (
                    <g key={idx}>
                        <polygon
                            points={`${x},${y-3} ${x+2},${y} ${x},${y+3} ${x-2},${y}`}
                            fill={c} opacity="0.8">
                            <animate attributeName="opacity" values="0.8;0.4;0.8"
                                dur={`${1.8+idx*0.3}s`} repeatCount="indefinite" />
                        </polygon>
                    </g>
                ))}
            </g>
        ),
    },

    frame_hex: {
        id: 'frame_hex',
        color: '#f59e0b',
        secondary: '#78350f',
        render: (c, s, i) => {
            // Generate hexagonal grid cells in a ring pattern
            const hexes: { cx: number; cy: number; r: number; delay: number }[] = [];
            const ringRadius = 45;
            const hexR = 7;
            for (let a = 0; a < 12; a++) {
                const rad = (a * 30 * Math.PI) / 180;
                hexes.push({
                    cx: 50 + ringRadius * Math.cos(rad),
                    cy: 50 + ringRadius * Math.sin(rad),
                    r: hexR,
                    delay: a * 0.25,
                });
            }
            const hexPath = (cx: number, cy: number, r: number) => {
                const pts = Array.from({ length: 6 }, (_, k) => {
                    const angle = (k * 60 - 30) * Math.PI / 180;
                    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
                });
                return `M${pts.join('L')}Z`;
            };
            return (
                <g opacity={i}>
                    {/* Connecting ring */}
                    <circle cx="50" cy="50" r={ringRadius} fill="none" stroke={s} strokeWidth="1" opacity="0.3" />
                    {/* Hex cells */}
                    {hexes.map((h, idx) => (
                        <g key={idx}>
                            <path d={hexPath(h.cx, h.cy, h.r)} fill="none" stroke={c}
                                strokeWidth="1" opacity="0.6" />
                            <path d={hexPath(h.cx, h.cy, h.r * 0.6)} fill={c} opacity="0">
                                <animate attributeName="opacity" values="0;0.4;0"
                                    dur="3s" begin={`${h.delay}s`} repeatCount="indefinite" />
                            </path>
                        </g>
                    ))}
                    {/* Outer hex ring (large) */}
                    <path d={hexPath(50, 50, 49)} fill="none" stroke={c} strokeWidth="0.8" opacity="0.25" />
                </g>
            );
        },
    },

    frame_glitch: {
        id: 'frame_glitch',
        color: '#f43f5e',
        secondary: '#22d3ee',
        render: (c, s, i) => (
            <g opacity={i}>
                {/* Base ring */}
                <circle cx="50" cy="50" r="45" fill="none" stroke={c} strokeWidth="1.5" opacity="0.5" />
                {/* Offset RGB channel rings — displaced horizontally */}
                <circle cx="48" cy="50" r="45" fill="none" stroke={c} strokeWidth="1"
                    opacity="0.3" strokeDasharray="12 8">
                    <animate attributeName="cx" values="48;52;48" dur="0.15s" repeatCount="indefinite" />
                </circle>
                <circle cx="52" cy="50" r="45" fill="none" stroke={s} strokeWidth="1"
                    opacity="0.3" strokeDasharray="12 8">
                    <animate attributeName="cx" values="52;48;52" dur="0.15s" repeatCount="indefinite" />
                </circle>
                {/* Scan lines — horizontal displaced segments */}
                {[20, 35, 50, 65, 80].map((y, idx) => (
                    <rect key={idx} x="5" y={y} width="90" height="1" fill={c} opacity="0">
                        <animate attributeName="opacity" values="0;0.3;0" dur="0.8s"
                            begin={`${idx * 0.4}s`} repeatCount="indefinite" />
                        <animate attributeName="x" values="5;8;3;5" dur="0.2s"
                            begin={`${idx * 0.4}s`} repeatCount="indefinite" />
                    </rect>
                ))}
                {/* Glitch block artifacts */}
                {[[10,15,20,4],[70,25,18,3],[15,75,22,3],[65,80,15,4]].map(([x,y,w,h],idx) => (
                    <rect key={`b${idx}`} x={x} y={y} width={w} height={h}
                        fill={idx % 2 === 0 ? c : s} opacity="0">
                        <animate attributeName="opacity" values="0;0.5;0" dur="0.3s"
                            begin={`${idx * 0.7 + 0.1}s`} repeatCount="indefinite" />
                    </rect>
                ))}
                {/* Static noise dots */}
                {Array.from({length: 8}, (_, k) => {
                    const angle = (k * 45) * Math.PI / 180;
                    return (
                        <circle key={`n${k}`} cx={50 + 46 * Math.cos(angle)} cy={50 + 46 * Math.sin(angle)}
                            r="1.5" fill={k % 2 === 0 ? c : s}>
                            <animate attributeName="opacity" values="0;1;0" dur="0.5s"
                                begin={`${k * 0.12}s`} repeatCount="indefinite" />
                        </circle>
                    );
                })}
            </g>
        ),
    },

    frame_rune: {
        id: 'frame_rune',
        color: '#c084fc',
        secondary: '#e9d5ff',
        render: (c, s, i) => (
            <g opacity={i}>
                {/* Outer ward circle */}
                <circle cx="50" cy="50" r="47" fill="none" stroke={c} strokeWidth="1" opacity="0.4" />
                {/* Inner ward circle */}
                <circle cx="50" cy="50" r="43" fill="none" stroke={c} strokeWidth="0.8" opacity="0.3" />
                {/* Rune glyphs inscribed between the two circles — 8 unique symbols */}
                {[
                    // Each glyph: angle, path relative to center of glyph cell
                    [0, 'M-2,-3 L0,-1 L2,-3 M0,-1 L0,3 M-2,1 L2,1'],
                    [45, 'M-2,-3 L-2,3 L2,0 Z'],
                    [90, 'M-2,-2 Q0,-4 2,-2 L2,2 Q0,4 -2,2 Z'],
                    [135, 'M0,-3 L0,3 M-2,-1 L2,1 M-2,1 L2,-1'],
                    [180, 'M-2,-3 L2,-3 L0,0 L2,3 L-2,3'],
                    [225, 'M-2,0 L0,-3 L2,0 L0,3 Z'],
                    [270, 'M-1,-3 L-1,3 M1,-3 L1,3 M-2,0 L2,0'],
                    [315, 'M0,-3 Q3,0 0,3 Q-3,0 0,-3 M0,-1 L0,1'],
                ].map(([angle, path], idx) => {
                    const rad = ((angle as number) * Math.PI) / 180;
                    const gx = 50 + 45 * Math.cos(rad);
                    const gy = 50 + 45 * Math.sin(rad);
                    return (
                        <g key={idx} transform={`translate(${gx},${gy}) rotate(${angle as number})`}>
                            <path d={path as string} fill="none" stroke={s} strokeWidth="0.8"
                                strokeLinecap="round">
                                <animate attributeName="stroke-opacity" values="0.6;1;0.6"
                                    dur={`${2.5 + idx * 0.2}s`} repeatCount="indefinite" />
                            </path>
                        </g>
                    );
                })}
                {/* Rotating energy ring */}
                <circle cx="50" cy="50" r="45" fill="none" stroke={c} strokeWidth="2"
                    strokeDasharray="4 16" strokeLinecap="round" opacity="0.5">
                    <animateTransform attributeName="transform" type="rotate"
                        from="0 50 50" to="360 50 50" dur="12s" repeatCount="indefinite" />
                </circle>
                {/* Center ward pulse */}
                <circle cx="50" cy="50" r="45" fill="none" stroke={s} strokeWidth="0.5" opacity="0">
                    <animate attributeName="r" values="43;47;43" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0;0.3;0" dur="3s" repeatCount="indefinite" />
                </circle>
            </g>
        ),
    },

    frame_neon: {
        id: 'frame_neon',
        color: '#a3e635',
        secondary: '#ecfccb',
        render: (c, s, i) => (
            <g opacity={i}>
                {/* Neon tube — thick glowing ring */}
                <circle cx="50" cy="50" r="45" fill="none" stroke={c} strokeWidth="3" opacity="0.7">
                    {/* Flicker effect */}
                    <animate attributeName="opacity" values="0.7;0.5;0.7;0.65;0.7;0.3;0.7"
                        dur="4s" repeatCount="indefinite" />
                </circle>
                {/* Inner glow (bloom simulation) */}
                <circle cx="50" cy="50" r="45" fill="none" stroke={s} strokeWidth="6" opacity="0.15">
                    <animate attributeName="opacity" values="0.15;0.08;0.15;0.1;0.15;0.05;0.15"
                        dur="4s" repeatCount="indefinite" />
                </circle>
                {/* Outer bloom */}
                <circle cx="50" cy="50" r="45" fill="none" stroke={c} strokeWidth="8" opacity="0.06">
                    <animate attributeName="opacity" values="0.06;0.03;0.06;0.04;0.06;0.02;0.06"
                        dur="4s" repeatCount="indefinite" />
                </circle>
                {/* Bright highlight spot traveling around the tube */}
                <circle cx="50" cy="5" r="3" fill={s} opacity="0.6">
                    <animateTransform attributeName="transform" type="rotate"
                        from="0 50 50" to="360 50 50" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.9;0.6" dur="1s" repeatCount="indefinite" />
                </circle>
                {/* Connection cap at top (where the tube "plugs in") */}
                <rect x="44" y="2" width="12" height="4" rx="1" fill={c} opacity="0.4" />
                <rect x="46" y="3" width="8" height="2" rx="0.5" fill={s} opacity="0.6" />
            </g>
        ),
    },
};

const ProfileFrame: React.FC<ProfileFrameProps> = ({
    photoUrl,
    initials,
    frameId,
    size = 48,
    className = '',
}) => {
    const frameDef = useMemo(() => frameId ? FRAME_DEFS[frameId] : null, [frameId]);

    // Compute initials display (max 2 chars)
    const displayInitials = useMemo(() => {
        const parts = initials.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return initials.slice(0, 2).toUpperCase();
    }, [initials]);

    return (
        <div className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
            <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <clipPath id={`pf-clip-${frameId || 'none'}-${size}`}>
                        <circle cx="50" cy="50" r="38" />
                    </clipPath>
                    {frameDef && (
                        <filter id={`pf-glow-${frameId}`}>
                            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
                        </filter>
                    )}
                </defs>

                {/* Profile picture or initials fallback */}
                <g clipPath={`url(#pf-clip-${frameId || 'none'}-${size})`}>
                    {photoUrl ? (
                        <image href={photoUrl} x="12" y="12" width="76" height="76" preserveAspectRatio="xMidYMid slice" />
                    ) : (
                        <>
                            <circle cx="50" cy="50" r="38" fill="#374151" />
                            <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
                                fill="#9ca3af" fontSize="24" fontWeight="700" fontFamily="system-ui, sans-serif">
                                {displayInitials}
                            </text>
                        </>
                    )}
                </g>

                {/* Fallback ring when no frame is equipped */}
                {!frameDef && (
                    <circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
                )}

                {/* Frame overlay */}
                {frameDef && (
                    <g filter={`url(#pf-glow-${frameId})`}>
                        {frameDef.render(frameDef.color, frameDef.secondary, 0.85)}
                    </g>
                )}
            </svg>
        </div>
    );
};

export default ProfileFrame;

import React from 'react';
import { BossType } from '../../types';

interface BossAvatarProps {
    bossType: BossType;
    hue: number; // 0-360
    size?: number; // rendered height in px (default 120)
}

// ─── Brute: Horned hulking beast ───────────────────────────────────────────
const BruteSVG: React.FC<{ hue: number }> = ({ hue }) => (
    <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.5))' }}>
        <defs>
            <radialGradient id="b-eye" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor={`hsl(${hue}, 100%, 70%)`} />
                <stop offset="100%" stopColor={`hsl(${hue}, 80%, 40%)`} />
            </radialGradient>
            <linearGradient id="b-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue + 20}, 30%, 22%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 20}, 25%, 12%)`} />
            </linearGradient>
            <linearGradient id="b-armor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue}, 40%, 30%)`} />
                <stop offset="100%" stopColor={`hsl(${hue}, 35%, 16%)`} />
            </linearGradient>
            <filter id="b-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
            </filter>
        </defs>

        <g>
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-2;0,0" dur="3s" repeatCount="indefinite" />

            {/* Shadow */}
            <ellipse cx="100" cy="250" rx="50" ry="6" fill="rgba(0,0,0,0.35)">
                <animate attributeName="rx" values="50;46;50" dur="3s" repeatCount="indefinite" />
            </ellipse>

            {/* Horns */}
            <path d="M60 65 Q45 20 30 5 Q50 30 65 55" fill={`hsl(${hue + 20}, 15%, 30%)`} stroke={`hsl(${hue + 20}, 10%, 40%)`} strokeWidth="1" />
            <path d="M140 65 Q155 20 170 5 Q150 30 135 55" fill={`hsl(${hue + 20}, 15%, 30%)`} stroke={`hsl(${hue + 20}, 10%, 40%)`} strokeWidth="1" />

            {/* Head */}
            <ellipse cx="100" cy="70" rx="38" ry="30" fill="url(#b-body)" stroke={`hsl(${hue + 20}, 20%, 28%)`} strokeWidth="1.5" />

            {/* Brow ridge */}
            <path d="M68 60 Q100 50 132 60" fill={`hsl(${hue + 20}, 25%, 18%)`} />

            {/* Eyes - glowing */}
            <g filter="url(#b-glow)">
                <ellipse cx="82" cy="68" rx="8" ry="5" fill="url(#b-eye)">
                    <animate attributeName="ry" values="5;5;0.5;5;5" dur="6s" repeatCount="indefinite" />
                </ellipse>
                <ellipse cx="118" cy="68" rx="8" ry="5" fill="url(#b-eye)">
                    <animate attributeName="ry" values="5;5;0.5;5;5" dur="6s" repeatCount="indefinite" />
                </ellipse>
            </g>
            {/* Pupils */}
            <ellipse cx="84" cy="68" rx="3" ry="3" fill={`hsl(${hue}, 100%, 85%)`} fillOpacity="0.9" />
            <ellipse cx="120" cy="68" rx="3" ry="3" fill={`hsl(${hue}, 100%, 85%)`} fillOpacity="0.9" />

            {/* Jaw / mouth */}
            <path d="M78 85 Q100 96 122 85" stroke={`hsl(${hue + 20}, 15%, 35%)`} strokeWidth="2" fill="none" />
            {/* Fangs */}
            <polygon points="86,85 89,95 92,85" fill={`hsl(0, 0%, 85%)`} />
            <polygon points="108,85 111,95 114,85" fill={`hsl(0, 0%, 85%)`} />

            {/* Neck */}
            <rect x="85" y="96" width="30" height="14" rx="6" fill="url(#b-body)" />

            {/* Torso — massive */}
            <path d="M52 110 Q100 100 148 110 L142 200 Q100 210 58 200 Z" fill="url(#b-armor)" stroke={`hsl(${hue}, 30%, 22%)`} strokeWidth="1.5" />
            {/* Armor plates */}
            <line x1="75" y1="130" x2="125" y2="130" stroke={`hsl(${hue}, 50%, 40%)`} strokeWidth="1" strokeOpacity="0.5" />
            <line x1="78" y1="155" x2="122" y2="155" stroke={`hsl(${hue}, 50%, 40%)`} strokeWidth="0.8" strokeOpacity="0.3" />
            {/* Core emblem */}
            <circle cx="100" cy="145" r="8" fill="none" stroke={`hsl(${hue}, 60%, 50%)`} strokeWidth="1.5" strokeOpacity="0.6">
                <animate attributeName="strokeOpacity" values="0.6;0.2;0.6" dur="2.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="100" cy="145" r="3" fill={`hsl(${hue}, 80%, 60%)`} fillOpacity="0.7">
                <animate attributeName="fillOpacity" values="0.7;0.3;0.7" dur="2.5s" repeatCount="indefinite" />
            </circle>

            {/* Arms */}
            <path d="M52 112 L30 120 Q22 124 22 132 L22 180 Q22 188 30 188 L42 186 L52 165 Z" fill="url(#b-body)" stroke={`hsl(${hue + 20}, 20%, 28%)`} strokeWidth="1" />
            <path d="M148 112 L170 120 Q178 124 178 132 L178 180 Q178 188 170 188 L158 186 L148 165 Z" fill="url(#b-body)" stroke={`hsl(${hue + 20}, 20%, 28%)`} strokeWidth="1" />
            {/* Claws */}
            <path d="M26 184 L18 196 M30 186 L24 198 M34 186 L30 196" stroke={`hsl(0, 0%, 75%)`} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M174 184 L182 196 M170 186 L176 198 M166 186 L170 196" stroke={`hsl(0, 0%, 75%)`} strokeWidth="1.5" strokeLinecap="round" />

            {/* Legs */}
            <path d="M65 198 L60 240 Q58 248 68 248 L82 248 Q86 248 84 242 L78 198" fill="url(#b-body)" stroke={`hsl(${hue + 20}, 20%, 28%)`} strokeWidth="1" />
            <path d="M122 198 L118 240 Q116 248 126 248 L140 248 Q144 248 142 242 L136 198" fill="url(#b-body)" stroke={`hsl(${hue + 20}, 20%, 28%)`} strokeWidth="1" />

            {/* Ambient particles */}
            {[0, 1, 2, 3].map(i => (
                <circle key={i} cx={70 + i * 22} cy={110 + i * 15} r="1.5" fill={`hsl(${hue}, 80%, 60%)`} fillOpacity="0.4">
                    <animate attributeName="cy" values={`${110 + i * 15};${90 + i * 15};${110 + i * 15}`} dur={`${2.5 + i * 0.5}s`} repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="0.4;0;0.4" dur={`${2.5 + i * 0.5}s`} repeatCount="indefinite" />
                </circle>
            ))}
        </g>
    </svg>
);

// ─── Phantom: Ghostly wraith ───────────────────────────────────────────────
const PhantomSVG: React.FC<{ hue: number }> = ({ hue }) => (
    <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 16px rgba(0,0,0,0.5))' }}>
        <defs>
            <radialGradient id="p-eye" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={`hsl(${hue}, 100%, 80%)`} />
                <stop offset="80%" stopColor={`hsl(${hue}, 90%, 50%)`} />
                <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id="p-cloak" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue + 240}, 30%, 18%)`} />
                <stop offset="60%" stopColor={`hsl(${hue + 240}, 25%, 10%)`} />
                <stop offset="100%" stopColor="transparent" />
            </linearGradient>
            <filter id="p-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
            </filter>
            <filter id="p-wisp" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" />
            </filter>
        </defs>

        <g>
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="4s" repeatCount="indefinite" />

            {/* Ethereal wisps trailing below */}
            <g filter="url(#p-wisp)">
                {[0, 1, 2, 3, 4].map(i => (
                    <ellipse key={i} cx={72 + i * 16} cy={230 + i * 4} rx={4 + i} ry={12 + i * 2}
                        fill={`hsl(${hue + 240}, 40%, 25%)`} fillOpacity={0.3 - i * 0.05}>
                        <animate attributeName="cy" values={`${230 + i * 4};${240 + i * 4};${230 + i * 4}`} dur={`${3 + i * 0.3}s`} repeatCount="indefinite" />
                        <animate attributeName="fillOpacity" values={`${0.3 - i * 0.05};${0.1};${0.3 - i * 0.05}`} dur={`${3 + i * 0.3}s`} repeatCount="indefinite" />
                    </ellipse>
                ))}
            </g>

            {/* Body / cloak — tapers to nothing */}
            <path d="M55 75 Q100 65 145 75 L155 180 Q150 230 130 250 Q115 240 100 245 Q85 240 70 250 Q50 230 45 180 Z"
                  fill="url(#p-cloak)" stroke={`hsl(${hue + 240}, 20%, 25%)`} strokeWidth="1" />
            {/* Cloak interior folds */}
            <path d="M70 100 Q100 95 130 100 L128 180 Q100 190 72 180 Z"
                  fill={`hsl(${hue + 240}, 20%, 8%)`} fillOpacity="0.5" />

            {/* Hood */}
            <path d="M55 75 Q50 40 65 25 Q100 10 135 25 Q150 40 145 75 Q100 65 55 75 Z"
                  fill={`hsl(${hue + 240}, 28%, 16%)`} stroke={`hsl(${hue + 240}, 20%, 25%)`} strokeWidth="1.2" />
            {/* Hood shadow */}
            <path d="M65 65 Q100 55 135 65 Q100 60 65 65 Z" fill={`hsl(${hue + 240}, 25%, 10%)`} />

            {/* Eyes — floating in the dark hood */}
            <g filter="url(#p-glow)">
                <ellipse cx="85" cy="55" rx="7" ry="4" fill="url(#p-eye)">
                    <animate attributeName="ry" values="4;4;0.5;4;4;4" dur="7s" repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="1;0.7;1" dur="3s" repeatCount="indefinite" />
                </ellipse>
                <ellipse cx="115" cy="55" rx="7" ry="4" fill="url(#p-eye)">
                    <animate attributeName="ry" values="4;4;0.5;4;4;4" dur="7s" repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="0.7;1;0.7" dur="3s" repeatCount="indefinite" />
                </ellipse>
            </g>

            {/* Arms — skeletal, reaching */}
            <path d="M55 100 L30 130 Q22 140 28 148 L35 155" fill="none" stroke={`hsl(${hue + 240}, 20%, 22%)`} strokeWidth="5" strokeLinecap="round" />
            <path d="M145 100 L170 130 Q178 140 172 148 L165 155" fill="none" stroke={`hsl(${hue + 240}, 20%, 22%)`} strokeWidth="5" strokeLinecap="round" />
            {/* Bony fingers */}
            <path d="M32 152 L22 165 M35 155 L28 170 M38 155 L35 168" stroke={`hsl(${hue + 240}, 15%, 35%)`} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M168 152 L178 165 M165 155 L172 170 M162 155 L165 168" stroke={`hsl(${hue + 240}, 15%, 35%)`} strokeWidth="1.5" strokeLinecap="round" />

            {/* Chest rune */}
            <circle cx="100" cy="120" r="10" fill="none" stroke={`hsl(${hue}, 70%, 50%)`} strokeWidth="1" strokeOpacity="0.5" strokeDasharray="4 3">
                <animate attributeName="strokeDashoffset" values="0;-14" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="100" cy="120" r="3" fill={`hsl(${hue}, 80%, 60%)`} fillOpacity="0.6">
                <animate attributeName="fillOpacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
                <animate attributeName="r" values="3;4;3" dur="2s" repeatCount="indefinite" />
            </circle>

            {/* Floating particles */}
            {[0, 1, 2, 3, 4, 5].map(i => {
                const angle = (i * 60) * Math.PI / 180;
                const cx = 100 + Math.cos(angle) * 55;
                const cy = 130 + Math.sin(angle) * 60;
                return (
                    <circle key={i} cx={cx} cy={cy} r="1.5" fill={`hsl(${hue}, 80%, 65%)`} fillOpacity="0.3">
                        <animate attributeName="cy" values={`${cy};${cy - 15};${cy}`} dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                        <animate attributeName="fillOpacity" values="0.3;0;0.3" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
                    </circle>
                );
            })}
        </g>
    </svg>
);

// ─── Serpent: Dragon / Wyrm ────────────────────────────────────────────────
const SerpentSVG: React.FC<{ hue: number }> = ({ hue }) => (
    <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 14px rgba(0,0,0,0.5))' }}>
        <defs>
            <radialGradient id="s-eye" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor={`hsl(${hue + 60}, 100%, 65%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 60}, 80%, 35%)`} />
            </radialGradient>
            <linearGradient id="s-scale" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue + 140}, 40%, 25%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 140}, 35%, 14%)`} />
            </linearGradient>
            <linearGradient id="s-belly" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue + 140}, 25%, 30%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 140}, 20%, 18%)`} />
            </linearGradient>
            <filter id="s-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
            </filter>
        </defs>

        <g>
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-2;0,0" dur="3.5s" repeatCount="indefinite" />

            {/* Shadow */}
            <ellipse cx="100" cy="252" rx="55" ry="5" fill="rgba(0,0,0,0.3)">
                <animate attributeName="rx" values="55;50;55" dur="3.5s" repeatCount="indefinite" />
            </ellipse>

            {/* Wings */}
            <g>
                <path d="M55 100 Q20 60 10 30 Q25 55 40 70 Q15 50 5 25 Q30 60 50 85 Z"
                      fill={`hsl(${hue + 140}, 30%, 18%)`} stroke={`hsl(${hue + 140}, 25%, 30%)`} strokeWidth="0.8" fillOpacity="0.7">
                    <animate attributeName="opacity" values="0.7;0.5;0.7" dur="3s" repeatCount="indefinite" />
                </path>
                <path d="M145 100 Q180 60 190 30 Q175 55 160 70 Q185 50 195 25 Q170 60 150 85 Z"
                      fill={`hsl(${hue + 140}, 30%, 18%)`} stroke={`hsl(${hue + 140}, 25%, 30%)`} strokeWidth="0.8" fillOpacity="0.7">
                    <animate attributeName="opacity" values="0.5;0.7;0.5" dur="3s" repeatCount="indefinite" />
                </path>
                {/* Wing membrane lines */}
                <line x1="50" y1="90" x2="18" y2="40" stroke={`hsl(${hue + 140}, 20%, 25%)`} strokeWidth="0.5" />
                <line x1="50" y1="90" x2="12" y2="50" stroke={`hsl(${hue + 140}, 20%, 25%)`} strokeWidth="0.5" />
                <line x1="150" y1="90" x2="182" y2="40" stroke={`hsl(${hue + 140}, 20%, 25%)`} strokeWidth="0.5" />
                <line x1="150" y1="90" x2="188" y2="50" stroke={`hsl(${hue + 140}, 20%, 25%)`} strokeWidth="0.5" />
            </g>

            {/* Tail — curled at the base */}
            <path d="M80 210 Q60 230 55 245 Q52 255 60 252 Q70 248 80 235 Q85 225 85 215"
                  fill="url(#s-scale)" stroke={`hsl(${hue + 140}, 30%, 28%)`} strokeWidth="1" />

            {/* Horns */}
            <path d="M72 45 Q60 15 55 5 Q65 25 75 40" fill={`hsl(${hue + 140}, 20%, 28%)`} stroke={`hsl(${hue + 140}, 15%, 38%)`} strokeWidth="0.8" />
            <path d="M128 45 Q140 15 145 5 Q135 25 125 40" fill={`hsl(${hue + 140}, 20%, 28%)`} stroke={`hsl(${hue + 140}, 15%, 38%)`} strokeWidth="0.8" />

            {/* Head — angular, reptilian */}
            <path d="M68 40 Q100 30 132 40 L135 75 Q100 85 65 75 Z"
                  fill="url(#s-scale)" stroke={`hsl(${hue + 140}, 30%, 28%)`} strokeWidth="1.5" />
            {/* Snout ridge */}
            <path d="M85 70 Q100 78 115 70" fill={`hsl(${hue + 140}, 35%, 22%)`} />

            {/* Eyes — slitted, glowing */}
            <g filter="url(#s-glow)">
                <ellipse cx="84" cy="55" rx="8" ry="5" fill="url(#s-eye)">
                    <animate attributeName="ry" values="5;5;2;5;5" dur="5s" repeatCount="indefinite" />
                </ellipse>
                <ellipse cx="116" cy="55" rx="8" ry="5" fill="url(#s-eye)">
                    <animate attributeName="ry" values="5;5;2;5;5" dur="5s" repeatCount="indefinite" />
                </ellipse>
            </g>
            {/* Slitted pupils */}
            <ellipse cx="84" cy="55" rx="1.5" ry="4" fill="#111" />
            <ellipse cx="116" cy="55" rx="1.5" ry="4" fill="#111" />

            {/* Nostrils */}
            <circle cx="92" cy="68" r="2" fill={`hsl(${hue + 140}, 25%, 15%)`} />
            <circle cx="108" cy="68" r="2" fill={`hsl(${hue + 140}, 25%, 15%)`} />

            {/* Fangs */}
            <polygon points="90,78 92,90 94,78" fill={`hsl(0, 0%, 88%)`} />
            <polygon points="106,78 108,90 110,78" fill={`hsl(0, 0%, 88%)`} />

            {/* Neck */}
            <path d="M75 78 Q100 90 125 78 L120 105 Q100 112 80 105 Z" fill="url(#s-scale)" stroke={`hsl(${hue + 140}, 30%, 28%)`} strokeWidth="0.8" />
            {/* Neck scales */}
            <line x1="85" y1="85" x2="115" y2="85" stroke={`hsl(${hue + 140}, 25%, 32%)`} strokeWidth="0.6" />
            <line x1="87" y1="92" x2="113" y2="92" stroke={`hsl(${hue + 140}, 25%, 32%)`} strokeWidth="0.5" />
            <line x1="88" y1="98" x2="112" y2="98" stroke={`hsl(${hue + 140}, 25%, 32%)`} strokeWidth="0.4" />

            {/* Body */}
            <path d="M60 105 Q100 95 140 105 L135 200 Q100 215 65 200 Z"
                  fill="url(#s-scale)" stroke={`hsl(${hue + 140}, 30%, 28%)`} strokeWidth="1.2" />
            {/* Belly plate */}
            <path d="M80 110 Q100 105 120 110 L118 195 Q100 205 82 195 Z"
                  fill="url(#s-belly)" fillOpacity="0.5" />
            {/* Scale lines */}
            {[125, 145, 165, 185].map(y => (
                <line key={y} x1={76} y1={y} x2={124} y2={y} stroke={`hsl(${hue + 140}, 25%, 32%)`} strokeWidth="0.5" strokeOpacity="0.4" />
            ))}

            {/* Chest gem */}
            <polygon points="100,125 94,133 100,141 106,133" fill={`hsl(${hue + 60}, 70%, 50%)`} stroke={`hsl(${hue + 60}, 60%, 60%)`} strokeWidth="1">
                <animate attributeName="fillOpacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
            </polygon>

            {/* Arms/Claws */}
            <path d="M60 108 L38 118 Q28 124 30 135 L34 165 Q36 172 42 170 L52 160 L58 148 Z"
                  fill="url(#s-scale)" stroke={`hsl(${hue + 140}, 30%, 28%)`} strokeWidth="0.8" />
            <path d="M140 108 L162 118 Q172 124 170 135 L166 165 Q164 172 158 170 L148 160 L142 148 Z"
                  fill="url(#s-scale)" stroke={`hsl(${hue + 140}, 30%, 28%)`} strokeWidth="0.8" />
            {/* Claws */}
            <path d="M38 166 L30 180 M42 168 L36 182 M46 168 L42 180" stroke={`hsl(0, 0%, 80%)`} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M162 166 L170 180 M158 168 L164 182 M154 168 L158 180" stroke={`hsl(0, 0%, 80%)`} strokeWidth="1.5" strokeLinecap="round" />

            {/* Legs */}
            <path d="M72 198 L68 238 Q66 248 76 248 L88 248 Q92 248 90 242 L86 198" fill="url(#s-scale)" stroke={`hsl(${hue + 140}, 30%, 28%)`} strokeWidth="0.8" />
            <path d="M114 198 L110 238 Q108 248 118 248 L130 248 Q134 248 132 242 L128 198" fill="url(#s-scale)" stroke={`hsl(${hue + 140}, 30%, 28%)`} strokeWidth="0.8" />

            {/* Ambient fire/energy particles */}
            {[0, 1, 2].map(i => (
                <circle key={i} cx={85 + i * 15} cy={60} r="1.2" fill={`hsl(${hue + 60}, 90%, 60%)`} fillOpacity="0.4">
                    <animate attributeName="cy" values="60;45;60" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="0.4;0;0.4" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                </circle>
            ))}
        </g>
    </svg>
);

// ─── Skeleton: Bone warrior with ghostly flames ──────────────────────────
const SkeletonSVG: React.FC<{ hue: number }> = ({ hue }) => (
    <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.5))' }}>
        <defs>
            <radialGradient id="sk-eye" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={`hsl(${hue}, 100%, 75%)`} />
                <stop offset="80%" stopColor={`hsl(${hue}, 90%, 45%)`} />
                <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id="sk-bone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue + 40}, 10%, 55%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 40}, 8%, 35%)`} />
            </linearGradient>
            <linearGradient id="sk-armor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue}, 25%, 22%)`} />
                <stop offset="100%" stopColor={`hsl(${hue}, 20%, 12%)`} />
            </linearGradient>
            <filter id="sk-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
            </filter>
            <filter id="sk-flame" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" />
            </filter>
        </defs>
        <g>
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-2;0,0" dur="3.2s" repeatCount="indefinite" />
            {/* Shadow */}
            <ellipse cx="100" cy="250" rx="40" ry="5" fill="rgba(0,0,0,0.3)">
                <animate attributeName="rx" values="40;36;40" dur="3.2s" repeatCount="indefinite" />
            </ellipse>
            {/* Skull */}
            <ellipse cx="100" cy="55" rx="30" ry="28" fill="url(#sk-bone)" stroke={`hsl(${hue + 40}, 8%, 42%)`} strokeWidth="1.2" />
            {/* Jaw */}
            <path d="M76 68 Q100 90 124 68" fill={`hsl(${hue + 40}, 8%, 40%)`} stroke={`hsl(${hue + 40}, 8%, 32%)`} strokeWidth="1" />
            {/* Teeth */}
            {[82, 88, 94, 100, 106, 112, 118].map(x => (
                <rect key={x} x={x - 2} y={66} width={4} height={6} rx={1} fill={`hsl(${hue + 40}, 6%, 60%)`} />
            ))}
            {/* Eye sockets — dark hollows */}
            <ellipse cx="85" cy="50" rx="10" ry="9" fill={`hsl(${hue}, 15%, 8%)`} />
            <ellipse cx="115" cy="50" rx="10" ry="9" fill={`hsl(${hue}, 15%, 8%)`} />
            {/* Eyes — ghostly flames */}
            <g filter="url(#sk-glow)">
                <ellipse cx="85" cy="49" rx="6" ry="5" fill="url(#sk-eye)">
                    <animate attributeName="ry" values="5;5;1;5;5" dur="5s" repeatCount="indefinite" />
                </ellipse>
                <ellipse cx="115" cy="49" rx="6" ry="5" fill="url(#sk-eye)">
                    <animate attributeName="ry" values="5;5;1;5;5" dur="5s" repeatCount="indefinite" />
                </ellipse>
            </g>
            {/* Nose hole */}
            <path d="M97 58 L100 64 L103 58" fill={`hsl(${hue}, 10%, 12%)`} />
            {/* Spine/Neck */}
            {[82, 90, 98].map(y => (
                <rect key={y} x={94} y={y} width={12} height={6} rx={3} fill="url(#sk-bone)" stroke={`hsl(${hue + 40}, 8%, 42%)`} strokeWidth="0.5" />
            ))}
            {/* Ribcage */}
            <path d="M65 108 Q100 100 135 108 L130 175 Q100 185 70 175 Z" fill="url(#sk-armor)" stroke={`hsl(${hue}, 20%, 28%)`} strokeWidth="1" />
            {/* Ribs */}
            {[115, 128, 141, 154].map(y => (
                <path key={y} d={`M75 ${y} Q100 ${y - 4} 125 ${y}`} fill="none" stroke={`hsl(${hue + 40}, 10%, 48%)`} strokeWidth="2" strokeLinecap="round" />
            ))}
            {/* Sternum */}
            <line x1="100" y1="108" x2="100" y2="170" stroke={`hsl(${hue + 40}, 10%, 48%)`} strokeWidth="2" />
            {/* Soul gem in chest */}
            <circle cx="100" cy="135" r="8" fill="none" stroke={`hsl(${hue}, 70%, 55%)`} strokeWidth="1.5">
                <animate attributeName="strokeOpacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="100" cy="135" r="3" fill={`hsl(${hue}, 80%, 60%)`}>
                <animate attributeName="fillOpacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
            {/* Arms — bony */}
            <path d="M65 110 L42 130 L38 165" fill="none" stroke="url(#sk-bone)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M135 110 L158 130 L162 165" fill="none" stroke="url(#sk-bone)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            {/* Bony hands */}
            <path d="M35 162 L28 175 M38 165 L32 178 M40 165 L38 176" stroke={`hsl(${hue + 40}, 10%, 50%)`} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M165 162 L172 175 M162 165 L168 178 M160 165 L162 176" stroke={`hsl(${hue + 40}, 10%, 50%)`} strokeWidth="1.5" strokeLinecap="round" />
            {/* Pelvis */}
            <path d="M75 175 Q100 168 125 175 L120 195 Q100 200 80 195 Z" fill="url(#sk-bone)" stroke={`hsl(${hue + 40}, 8%, 42%)`} strokeWidth="0.8" />
            {/* Legs */}
            <path d="M82 195 L78 240 Q76 248 86 248 L92 248" fill="none" stroke="url(#sk-bone)" strokeWidth="6" strokeLinecap="round" />
            <path d="M118 195 L122 240 Q124 248 114 248 L108 248" fill="none" stroke="url(#sk-bone)" strokeWidth="6" strokeLinecap="round" />
            {/* Ghostly flame from skull */}
            <g filter="url(#sk-flame)">
                {[0, 1, 2].map(i => (
                    <ellipse key={i} cx={92 + i * 8} cy={25} rx={3 + i} ry={8 + i * 2}
                        fill={`hsl(${hue}, 70%, 55%)`} fillOpacity={0.3 - i * 0.08}>
                        <animate attributeName="cy" values={`${25};${15};${25}`} dur={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
                        <animate attributeName="fillOpacity" values={`${0.3 - i * 0.08};0;${0.3 - i * 0.08}`} dur={`${1.5 + i * 0.4}s`} repeatCount="indefinite" />
                    </ellipse>
                ))}
            </g>
        </g>
    </svg>
);

// ─── Golem: Massive crystal/stone construct ──────────────────────────────
const GolemSVG: React.FC<{ hue: number }> = ({ hue }) => (
    <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 14px rgba(0,0,0,0.5))' }}>
        <defs>
            <radialGradient id="g-eye" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor={`hsl(${hue}, 100%, 70%)`} />
                <stop offset="100%" stopColor={`hsl(${hue}, 80%, 35%)`} />
            </radialGradient>
            <linearGradient id="g-stone" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue + 30}, 15%, 28%)`} />
                <stop offset="50%" stopColor={`hsl(${hue + 30}, 12%, 20%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 30}, 10%, 15%)`} />
            </linearGradient>
            <linearGradient id="g-crystal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue}, 60%, 50%)`} />
                <stop offset="100%" stopColor={`hsl(${hue}, 50%, 25%)`} />
            </linearGradient>
            <filter id="g-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="5" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
            </filter>
        </defs>
        <g>
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-1;0,0" dur="4s" repeatCount="indefinite" />
            {/* Shadow — wider for massive creature */}
            <ellipse cx="100" cy="252" rx="60" ry="7" fill="rgba(0,0,0,0.4)">
                <animate attributeName="rx" values="60;55;60" dur="4s" repeatCount="indefinite" />
            </ellipse>
            {/* Head — angular stone block */}
            <path d="M70 35 L80 20 L120 20 L130 35 L135 70 L65 70 Z" fill="url(#g-stone)" stroke={`hsl(${hue + 30}, 12%, 30%)`} strokeWidth="1.5" />
            {/* Brow — heavy overhang */}
            <path d="M65 50 L135 50 L132 58 L68 58 Z" fill={`hsl(${hue + 30}, 10%, 16%)`} />
            {/* Eyes — deep set, glowing */}
            <g filter="url(#g-glow)">
                <rect x="76" y="52" width="12" height="6" rx="1" fill="url(#g-eye)">
                    <animate attributeName="height" values="6;6;1;6;6" dur="8s" repeatCount="indefinite" />
                </rect>
                <rect x="112" y="52" width="12" height="6" rx="1" fill="url(#g-eye)">
                    <animate attributeName="height" values="6;6;1;6;6" dur="8s" repeatCount="indefinite" />
                </rect>
            </g>
            {/* Jaw — blocky */}
            <path d="M72 68 L128 68 L124 82 Q100 88 76 82 Z" fill={`hsl(${hue + 30}, 12%, 22%)`} stroke={`hsl(${hue + 30}, 10%, 30%)`} strokeWidth="1" />
            {/* Neck — thick stone pillar */}
            <rect x="80" y="82" width="40" height="20" rx="4" fill="url(#g-stone)" stroke={`hsl(${hue + 30}, 12%, 28%)`} strokeWidth="0.8" />
            {/* Torso — massive boulder */}
            <path d="M40 102 L55 92 L145 92 L160 102 L165 195 Q155 210 100 215 Q45 210 35 195 Z"
                  fill="url(#g-stone)" stroke={`hsl(${hue + 30}, 12%, 28%)`} strokeWidth="1.5" />
            {/* Stone cracks */}
            <path d="M80 110 L75 140 L82 160" fill="none" stroke={`hsl(${hue + 30}, 8%, 35%)`} strokeWidth="0.8" />
            <path d="M120 115 L125 145 L118 165" fill="none" stroke={`hsl(${hue + 30}, 8%, 35%)`} strokeWidth="0.8" />
            <path d="M95 130 L105 155" fill="none" stroke={`hsl(${hue + 30}, 8%, 35%)`} strokeWidth="0.6" />
            {/* Crystal formations on shoulders */}
            <polygon points="50,95 42,68 55,75 60,92" fill="url(#g-crystal)" stroke={`hsl(${hue}, 50%, 40%)`} strokeWidth="0.8">
                <animate attributeName="fillOpacity" values="0.9;0.5;0.9" dur="3s" repeatCount="indefinite" />
            </polygon>
            <polygon points="45,100 35,78 48,82 52,98" fill="url(#g-crystal)" fillOpacity="0.7" stroke={`hsl(${hue}, 50%, 40%)`} strokeWidth="0.5" />
            <polygon points="150,95 158,68 145,75 140,92" fill="url(#g-crystal)" stroke={`hsl(${hue}, 50%, 40%)`} strokeWidth="0.8">
                <animate attributeName="fillOpacity" values="0.5;0.9;0.5" dur="3s" repeatCount="indefinite" />
            </polygon>
            <polygon points="155,100 165,78 152,82 148,98" fill="url(#g-crystal)" fillOpacity="0.7" stroke={`hsl(${hue}, 50%, 40%)`} strokeWidth="0.5" />
            {/* Core — glowing crystal in chest */}
            <polygon points="100,130 90,148 100,166 110,148" fill={`hsl(${hue}, 70%, 50%)`} stroke={`hsl(${hue}, 60%, 60%)`} strokeWidth="1.5" filter="url(#g-glow)">
                <animate attributeName="fillOpacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
            </polygon>
            {/* Arms — massive stone pillars */}
            <path d="M40 105 L20 120 Q10 130 12 145 L15 190 Q16 200 26 198 L38 192 L42 170 Z"
                  fill="url(#g-stone)" stroke={`hsl(${hue + 30}, 12%, 28%)`} strokeWidth="1.2" />
            <path d="M160 105 L180 120 Q190 130 188 145 L185 190 Q184 200 174 198 L162 192 L158 170 Z"
                  fill="url(#g-stone)" stroke={`hsl(${hue + 30}, 12%, 28%)`} strokeWidth="1.2" />
            {/* Stone fists */}
            <rect x="10" y="186" width="22" height="16" rx="4" fill={`hsl(${hue + 30}, 12%, 22%)`} stroke={`hsl(${hue + 30}, 10%, 30%)`} strokeWidth="1" />
            <rect x="168" y="186" width="22" height="16" rx="4" fill={`hsl(${hue + 30}, 12%, 22%)`} stroke={`hsl(${hue + 30}, 10%, 30%)`} strokeWidth="1" />
            {/* Legs — short, wide pillars */}
            <path d="M60 210 L55 240 Q52 252 68 252 L88 252 Q92 252 90 244 L82 210" fill="url(#g-stone)" stroke={`hsl(${hue + 30}, 12%, 28%)`} strokeWidth="1" />
            <path d="M140 210 L145 240 Q148 252 132 252 L112 252 Q108 252 110 244 L118 210" fill="url(#g-stone)" stroke={`hsl(${hue + 30}, 12%, 28%)`} strokeWidth="1" />
            {/* Crystal glow particles */}
            {[0, 1, 2, 3].map(i => (
                <circle key={i} cx={80 + i * 15} cy={100 + i * 20} r="2" fill={`hsl(${hue}, 80%, 60%)`} fillOpacity="0.3">
                    <animate attributeName="fillOpacity" values="0.3;0;0.3" dur={`${2 + i * 0.6}s`} repeatCount="indefinite" />
                    <animate attributeName="r" values="2;3;2" dur={`${2 + i * 0.6}s`} repeatCount="indefinite" />
                </circle>
            ))}
        </g>
    </svg>
);

// ─── Slime: Amorphous blob creature ──────────────────────────────────────
const SlimeSVG: React.FC<{ hue: number }> = ({ hue }) => (
    <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.4))' }}>
        <defs>
            <radialGradient id="sl-body" cx="45%" cy="40%" r="55%">
                <stop offset="0%" stopColor={`hsl(${hue + 120}, 55%, 45%)`} />
                <stop offset="70%" stopColor={`hsl(${hue + 120}, 50%, 28%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 120}, 45%, 18%)`} />
            </radialGradient>
            <radialGradient id="sl-eye" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor={`hsl(${hue}, 100%, 80%)`} />
                <stop offset="100%" stopColor={`hsl(${hue}, 80%, 45%)`} />
            </radialGradient>
            <radialGradient id="sl-highlight" cx="35%" cy="30%" r="40%">
                <stop offset="0%" stopColor={`hsl(${hue + 120}, 60%, 60%)`} stopOpacity="0.4" />
                <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <filter id="sl-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
            </filter>
            <filter id="sl-drip" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" />
            </filter>
        </defs>
        <g>
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-3;0,0" dur="2.5s" repeatCount="indefinite" />
            {/* Shadow — pulsing */}
            <ellipse cx="100" cy="245" rx="55" ry="8" fill="rgba(0,0,0,0.3)">
                <animate attributeName="rx" values="55;60;55" dur="2.5s" repeatCount="indefinite" />
            </ellipse>
            {/* Main body — wobbly blob */}
            <path d="M40 140 Q35 90 55 65 Q70 45 100 40 Q130 45 145 65 Q165 90 160 140 Q162 190 145 210 Q130 230 100 235 Q70 230 55 210 Q38 190 40 140 Z"
                  fill="url(#sl-body)" stroke={`hsl(${hue + 120}, 40%, 22%)`} strokeWidth="1.5">
                <animate attributeName="d"
                    values="M40 140 Q35 90 55 65 Q70 45 100 40 Q130 45 145 65 Q165 90 160 140 Q162 190 145 210 Q130 230 100 235 Q70 230 55 210 Q38 190 40 140 Z;M42 138 Q38 92 58 68 Q72 48 100 43 Q128 48 142 68 Q162 92 158 138 Q160 188 142 208 Q128 228 100 232 Q72 228 58 208 Q40 188 42 138 Z;M40 140 Q35 90 55 65 Q70 45 100 40 Q130 45 145 65 Q165 90 160 140 Q162 190 145 210 Q130 230 100 235 Q70 230 55 210 Q38 190 40 140 Z"
                    dur="2.5s" repeatCount="indefinite" />
            </path>
            {/* Highlight/sheen */}
            <ellipse cx="85" cy="90" rx="30" ry="25" fill="url(#sl-highlight)" />
            {/* Eyes — big, expressive */}
            <g filter="url(#sl-glow)">
                <ellipse cx="80" cy="110" rx="14" ry="12" fill={`hsl(${hue + 120}, 30%, 12%)`} />
                <ellipse cx="120" cy="110" rx="14" ry="12" fill={`hsl(${hue + 120}, 30%, 12%)`} />
                <ellipse cx="80" cy="108" rx="9" ry="8" fill="url(#sl-eye)">
                    <animate attributeName="ry" values="8;8;2;8;8" dur="4s" repeatCount="indefinite" />
                </ellipse>
                <ellipse cx="120" cy="108" rx="9" ry="8" fill="url(#sl-eye)">
                    <animate attributeName="ry" values="8;8;2;8;8" dur="4s" repeatCount="indefinite" />
                </ellipse>
            </g>
            {/* Pupils */}
            <ellipse cx="83" cy="108" rx="4" ry="4" fill={`hsl(${hue}, 100%, 90%)`} />
            <ellipse cx="123" cy="108" rx="4" ry="4" fill={`hsl(${hue}, 100%, 90%)`} />
            {/* Mouth — wide grin */}
            <path d="M72 138 Q100 158 128 138" stroke={`hsl(${hue + 120}, 35%, 14%)`} strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* Inner glow/core */}
            <circle cx="100" cy="155" r="12" fill={`hsl(${hue}, 60%, 50%)`} fillOpacity="0.15">
                <animate attributeName="r" values="12;16;12" dur="2s" repeatCount="indefinite" />
                <animate attributeName="fillOpacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" />
            </circle>
            {/* Dripping tendrils */}
            <g filter="url(#sl-drip)">
                <ellipse cx="55" cy="215" rx="6" ry="12" fill={`hsl(${hue + 120}, 50%, 30%)`} fillOpacity="0.5">
                    <animate attributeName="cy" values="215;230;215" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="0.5;0.1;0.5" dur="3s" repeatCount="indefinite" />
                </ellipse>
                <ellipse cx="145" cy="218" rx="5" ry="10" fill={`hsl(${hue + 120}, 50%, 30%)`} fillOpacity="0.4">
                    <animate attributeName="cy" values="218;232;218" dur="3.5s" repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="0.4;0.1;0.4" dur="3.5s" repeatCount="indefinite" />
                </ellipse>
                <ellipse cx="100" cy="235" rx="8" ry="10" fill={`hsl(${hue + 120}, 50%, 30%)`} fillOpacity="0.3">
                    <animate attributeName="cy" values="235;248;235" dur="4s" repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="0.3;0.05;0.3" dur="4s" repeatCount="indefinite" />
                </ellipse>
            </g>
            {/* Floating bubble particles */}
            {[0, 1, 2, 3, 4].map(i => (
                <circle key={i} cx={65 + i * 18} cy={80 + i * 25} r={2 + i * 0.3} fill={`hsl(${hue + 120}, 60%, 55%)`} fillOpacity="0.25" stroke={`hsl(${hue + 120}, 50%, 45%)`} strokeWidth="0.5" strokeOpacity="0.3">
                    <animate attributeName="cy" values={`${80 + i * 25};${65 + i * 25};${80 + i * 25}`} dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="0.25;0;0.25" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                </circle>
            ))}
        </g>
    </svg>
);

// ─── Orc: Hulking tusked warrior ─────────────────────────────────────────
const OrcSVG: React.FC<{ hue: number }> = ({ hue }) => (
    <svg viewBox="0 0 200 260" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.5))' }}>
        <defs>
            <radialGradient id="o-eye" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor={`hsl(${hue + 30}, 100%, 65%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 30}, 80%, 35%)`} />
            </radialGradient>
            <linearGradient id="o-skin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue + 100}, 35%, 28%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 100}, 30%, 18%)`} />
            </linearGradient>
            <linearGradient id="o-armor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`hsl(${hue + 20}, 20%, 25%)`} />
                <stop offset="100%" stopColor={`hsl(${hue + 20}, 18%, 14%)`} />
            </linearGradient>
            <filter id="o-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" />
            </filter>
        </defs>
        <g>
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-1.5;0,0" dur="3s" repeatCount="indefinite" />
            {/* Shadow */}
            <ellipse cx="100" cy="252" rx="52" ry="6" fill="rgba(0,0,0,0.35)">
                <animate attributeName="rx" values="52;48;52" dur="3s" repeatCount="indefinite" />
            </ellipse>
            {/* Ears — pointed, wide */}
            <path d="M55 55 L25 40 Q30 55 50 62" fill="url(#o-skin)" stroke={`hsl(${hue + 100}, 25%, 22%)`} strokeWidth="1" />
            <path d="M145 55 L175 40 Q170 55 150 62" fill="url(#o-skin)" stroke={`hsl(${hue + 100}, 25%, 22%)`} strokeWidth="1" />
            {/* Head — wider, brutish */}
            <ellipse cx="100" cy="55" rx="42" ry="32" fill="url(#o-skin)" stroke={`hsl(${hue + 100}, 25%, 24%)`} strokeWidth="1.5" />
            {/* Heavy brow */}
            <path d="M62 48 Q100 38 138 48 L136 56 Q100 50 64 56 Z" fill={`hsl(${hue + 100}, 30%, 20%)`} />
            {/* Eyes — fierce, glowing */}
            <g filter="url(#o-glow)">
                <ellipse cx="80" cy="54" rx="8" ry="5" fill="url(#o-eye)">
                    <animate attributeName="ry" values="5;5;1;5;5" dur="5s" repeatCount="indefinite" />
                </ellipse>
                <ellipse cx="120" cy="54" rx="8" ry="5" fill="url(#o-eye)">
                    <animate attributeName="ry" values="5;5;1;5;5" dur="5s" repeatCount="indefinite" />
                </ellipse>
            </g>
            {/* Pupils */}
            <ellipse cx="82" cy="54" rx="3" ry="3" fill={`hsl(${hue + 30}, 100%, 80%)`} />
            <ellipse cx="122" cy="54" rx="3" ry="3" fill={`hsl(${hue + 30}, 100%, 80%)`} />
            {/* Nose — broad, flat */}
            <path d="M93 62 Q100 70 107 62" fill={`hsl(${hue + 100}, 28%, 22%)`} />
            <circle cx="94" cy="65" r="2.5" fill={`hsl(${hue + 100}, 25%, 16%)`} />
            <circle cx="106" cy="65" r="2.5" fill={`hsl(${hue + 100}, 25%, 16%)`} />
            {/* Lower jaw — underbite */}
            <path d="M70 72 Q100 82 130 72 L128 80 Q100 90 72 80 Z" fill={`hsl(${hue + 100}, 30%, 22%)`} stroke={`hsl(${hue + 100}, 25%, 18%)`} strokeWidth="1" />
            {/* Tusks — upward from jaw */}
            <path d="M78 76 L74 60 Q75 58 78 62" fill={`hsl(40, 20%, 75%)`} stroke={`hsl(40, 15%, 60%)`} strokeWidth="0.8" />
            <path d="M122 76 L126 60 Q125 58 122 62" fill={`hsl(40, 20%, 75%)`} stroke={`hsl(40, 15%, 60%)`} strokeWidth="0.8" />
            {/* Neck — thick */}
            <rect x="78" y="84" width="44" height="18" rx="8" fill="url(#o-skin)" />
            {/* Torso — barrel-chested with armor */}
            <path d="M45 102 Q100 92 155 102 L148 205 Q100 218 52 205 Z" fill="url(#o-armor)" stroke={`hsl(${hue + 20}, 18%, 28%)`} strokeWidth="1.5" />
            {/* Shoulder armor */}
            <path d="M45 102 Q35 98 30 108 Q28 118 40 122 L52 115 Z" fill={`hsl(${hue + 20}, 22%, 28%)`} stroke={`hsl(${hue + 20}, 18%, 35%)`} strokeWidth="1" />
            <path d="M155 102 Q165 98 170 108 Q172 118 160 122 L148 115 Z" fill={`hsl(${hue + 20}, 22%, 28%)`} stroke={`hsl(${hue + 20}, 18%, 35%)`} strokeWidth="1" />
            {/* Shoulder spikes */}
            <path d="M34 108 L22 95 L38 105" fill={`hsl(${hue + 20}, 15%, 32%)`} />
            <path d="M166 108 L178 95 L162 105" fill={`hsl(${hue + 20}, 15%, 32%)`} />
            {/* Belt / waist armor */}
            <rect x="58" y="185" width="84" height="14" rx="3" fill={`hsl(${hue + 20}, 18%, 20%)`} stroke={`hsl(${hue + 20}, 15%, 30%)`} strokeWidth="1" />
            <circle cx="100" cy="192" r="5" fill={`hsl(${hue + 30}, 60%, 45%)`} stroke={`hsl(${hue + 30}, 50%, 55%)`} strokeWidth="1">
                <animate attributeName="fillOpacity" values="0.8;0.4;0.8" dur="2.5s" repeatCount="indefinite" />
            </circle>
            {/* War paint / chest marking */}
            <path d="M85 130 L100 120 L115 130 L100 145 Z" fill="none" stroke={`hsl(${hue}, 60%, 50%)`} strokeWidth="1.5" strokeOpacity="0.5">
                <animate attributeName="strokeOpacity" values="0.5;0.2;0.5" dur="3s" repeatCount="indefinite" />
            </path>
            {/* Arms — massive, muscular */}
            <path d="M45 105 L22 120 Q12 128 14 140 L18 185 Q20 195 30 192 L42 186 L48 160 Z"
                  fill="url(#o-skin)" stroke={`hsl(${hue + 100}, 25%, 24%)`} strokeWidth="1" />
            <path d="M155 105 L178 120 Q188 128 186 140 L182 185 Q180 195 170 192 L158 186 L152 160 Z"
                  fill="url(#o-skin)" stroke={`hsl(${hue + 100}, 25%, 24%)`} strokeWidth="1" />
            {/* Fists */}
            <ellipse cx="24" cy="190" rx="10" ry="8" fill={`hsl(${hue + 100}, 30%, 24%)`} stroke={`hsl(${hue + 100}, 25%, 18%)`} strokeWidth="1" />
            <ellipse cx="176" cy="190" rx="10" ry="8" fill={`hsl(${hue + 100}, 30%, 24%)`} stroke={`hsl(${hue + 100}, 25%, 18%)`} strokeWidth="1" />
            {/* Legs */}
            <path d="M62 205 L58 240 Q56 250 66 250 L82 250 Q86 250 84 244 L78 205" fill="url(#o-skin)" stroke={`hsl(${hue + 100}, 25%, 24%)`} strokeWidth="1" />
            <path d="M138 205 L142 240 Q144 250 134 250 L118 250 Q114 250 116 244 L122 205" fill="url(#o-skin)" stroke={`hsl(${hue + 100}, 25%, 24%)`} strokeWidth="1" />
            {/* Ambient rage particles */}
            {[0, 1, 2].map(i => (
                <circle key={i} cx={75 + i * 25} cy={105 + i * 18} r="1.5" fill={`hsl(${hue + 30}, 80%, 55%)`} fillOpacity="0.35">
                    <animate attributeName="cy" values={`${105 + i * 18};${90 + i * 18};${105 + i * 18}`} dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                    <animate attributeName="fillOpacity" values="0.35;0;0.35" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
                </circle>
            ))}
        </g>
    </svg>
);

const BOSS_RENDERERS: Record<BossType, React.FC<{ hue: number }>> = {
    BRUTE: BruteSVG,
    PHANTOM: PhantomSVG,
    SERPENT: SerpentSVG,
    SKELETON: SkeletonSVG,
    GOLEM: GolemSVG,
    SLIME: SlimeSVG,
    ORC: OrcSVG,
};

const BossAvatar: React.FC<BossAvatarProps> = ({ bossType, hue, size }) => {
    const Renderer = BOSS_RENDERERS[bossType] || BruteSVG;
    return (
        <div style={size ? { height: size, width: size * 0.77 } : undefined} className="flex items-center justify-center">
            <Renderer hue={hue} />
        </div>
    );
};

export default BossAvatar;

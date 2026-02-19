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

const BOSS_RENDERERS: Record<BossType, React.FC<{ hue: number }>> = {
    BRUTE: BruteSVG,
    PHANTOM: PhantomSVG,
    SERPENT: SerpentSVG,
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

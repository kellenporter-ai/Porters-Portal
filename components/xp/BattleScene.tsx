import React, { useEffect, useState } from 'react';
import OperativeAvatar from '../dashboard/OperativeAvatar';
import BossAvatar from './BossAvatar';
import { BossAppearance } from '../../types';

interface BattleSceneProps {
    playerAppearance?: {
        bodyType?: 'A' | 'B' | 'C';
        hue?: number;
        skinTone?: number;
        hairStyle?: number;
        hairColor?: number;
    };
    playerEquipped: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
    playerEvolutionLevel?: number;
    bossAppearance?: BossAppearance;
    /** Set briefly to trigger an attack animation */
    attackState: 'idle' | 'player-attack' | 'boss-attack';
    damage?: number;
    playerHpPercent: number;
    bossHpPercent: number;
}

const BattleScene: React.FC<BattleSceneProps> = ({
    playerAppearance,
    playerEquipped,
    playerEvolutionLevel = 1,
    bossAppearance,
    attackState,
    damage,
    playerHpPercent,
    bossHpPercent,
}) => {
    const [showSlash, setShowSlash] = useState(false);
    const [showImpact, setShowImpact] = useState(false);
    const [floatingDmg, setFloatingDmg] = useState<{ value: number; side: 'left' | 'right' } | null>(null);

    const bossType = bossAppearance?.bossType || 'BRUTE';
    const bossHue = bossAppearance?.hue ?? 0;

    useEffect(() => {
        if (attackState === 'player-attack' && damage) {
            setShowSlash(true);
            setFloatingDmg({ value: damage, side: 'right' });
            const t1 = setTimeout(() => setShowSlash(false), 500);
            const t2 = setTimeout(() => setFloatingDmg(null), 1200);
            return () => { clearTimeout(t1); clearTimeout(t2); };
        } else if (attackState === 'boss-attack' && damage) {
            setShowImpact(true);
            setFloatingDmg({ value: damage, side: 'left' });
            const t1 = setTimeout(() => setShowImpact(false), 500);
            const t2 = setTimeout(() => setFloatingDmg(null), 1200);
            return () => { clearTimeout(t1); clearTimeout(t2); };
        }
    }, [attackState, damage]);

    return (
        <div className="relative w-full h-32 flex items-end justify-between px-2 overflow-hidden select-none">
            {/* Ground line */}
            <div className="absolute bottom-2 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Player avatar */}
            <div
                className={`relative w-16 h-24 flex-shrink-0 transition-transform duration-300 ${
                    attackState === 'player-attack' ? 'translate-x-8 scale-110' : ''
                } ${showImpact ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
                style={{ transform: attackState === 'player-attack' ? 'translateX(2rem) scale(1.1)' : undefined }}
            >
                <OperativeAvatar
                    equipped={playerEquipped}
                    appearance={playerAppearance}
                    evolutionLevel={playerEvolutionLevel}
                />
                {/* Player HP micro-bar */}
                <div className="absolute -bottom-1 left-0 right-0 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${
                            playerHpPercent > 50 ? 'bg-emerald-500' : playerHpPercent > 25 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${playerHpPercent}%` }}
                    />
                </div>
            </div>

            {/* Center effects area */}
            <div className="flex-1 relative flex items-center justify-center">
                {/* VS text */}
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest opacity-60">vs</span>

                {/* Slash effect (player → boss) */}
                {showSlash && (
                    <svg className="absolute inset-0 pointer-events-none animate-[fadeIn_0.1s]" viewBox="0 0 100 80">
                        <line x1="20" y1="60" x2="80" y2="20"
                              stroke="url(#slash-grad)" strokeWidth="3" strokeLinecap="round"
                              className="animate-[slashDraw_0.3s_ease-out]" />
                        <line x1="25" y1="50" x2="75" y2="30"
                              stroke="url(#slash-grad)" strokeWidth="2" strokeLinecap="round" opacity="0.5"
                              className="animate-[slashDraw_0.3s_0.1s_ease-out]" />
                        <defs>
                            <linearGradient id="slash-grad" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="white" stopOpacity="0" />
                                <stop offset="50%" stopColor="#fbbf24" />
                                <stop offset="100%" stopColor="white" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                    </svg>
                )}

                {/* Impact effect (boss → player) */}
                {showImpact && (
                    <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 100 80">
                        <circle cx="25" cy="40" r="12" fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.8"
                                className="animate-[expandRing_0.5s_ease-out_forwards]" />
                        <circle cx="25" cy="40" r="6" fill="#ef4444" opacity="0.3"
                                className="animate-[expandRing_0.4s_0.1s_ease-out_forwards]" />
                    </svg>
                )}

                {/* Floating damage number */}
                {floatingDmg && (
                    <div
                        className={`absolute text-lg font-black animate-[floatUp_1.2s_ease-out_forwards] ${
                            floatingDmg.side === 'right' ? 'right-4 text-amber-400' : 'left-4 text-red-400'
                        }`}
                        style={{ top: '10%' }}
                    >
                        -{floatingDmg.value}
                    </div>
                )}
            </div>

            {/* Boss avatar */}
            <div
                className={`relative w-20 h-28 flex-shrink-0 transition-transform duration-300 ${
                    attackState === 'boss-attack' ? '-translate-x-8 scale-110' : ''
                } ${showSlash ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
                style={{
                    transform: attackState === 'boss-attack' ? 'translateX(-2rem) scale(1.1)' :
                               showSlash ? undefined : 'scaleX(-1)',
                    ...(showSlash ? {} : { filter: undefined }),
                }}
            >
                {/* Mirror boss to face left (toward player) */}
                <div style={{ transform: attackState === 'boss-attack' ? 'scaleX(-1)' : undefined }}>
                    <BossAvatar bossType={bossType} hue={bossHue} />
                </div>
                {/* Boss HP micro-bar */}
                <div className="absolute -bottom-1 left-0 right-0 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${
                            bossHpPercent > 50 ? 'bg-red-500' : bossHpPercent > 25 ? 'bg-orange-500' : 'bg-yellow-500'
                        }`}
                        style={{ width: `${bossHpPercent}%` }}
                    />
                </div>
            </div>

            {/* Keyframe animations injected via style tag */}
            <style>{`
                @keyframes floatUp {
                    0% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-40px); }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-4px); }
                    40% { transform: translateX(4px); }
                    60% { transform: translateX(-3px); }
                    80% { transform: translateX(2px); }
                }
                @keyframes expandRing {
                    0% { r: 4; opacity: 0.8; }
                    100% { r: 20; opacity: 0; }
                }
                @keyframes slashDraw {
                    0% { stroke-dasharray: 100; stroke-dashoffset: 100; opacity: 0; }
                    50% { opacity: 1; }
                    100% { stroke-dashoffset: 0; opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default BattleScene;

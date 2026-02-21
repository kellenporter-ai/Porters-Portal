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
    isCrit?: boolean;
    healAmount?: number;
    shieldBlocked?: boolean;
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
    isCrit,
    healAmount,
    shieldBlocked,
}) => {
    const [showSlash, setShowSlash] = useState(false);
    const [showImpact, setShowImpact] = useState(false);
    const [floatingDmg, setFloatingDmg] = useState<{ value: number; side: 'left' | 'right'; isCrit?: boolean } | null>(null);
    const [showCritFlash, setShowCritFlash] = useState(false);
    const [showHeal, setShowHeal] = useState<number | null>(null);
    const [showShield, setShowShield] = useState(false);
    const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; px: number; py: number }[]>([]);
    const [screenShake, setScreenShake] = useState(false);

    const bossType = bossAppearance?.bossType || 'BRUTE';
    const bossHue = bossAppearance?.hue ?? 0;

    // Spawn particles at a position with random scatter directions
    const spawnParticles = (side: 'left' | 'right', color: string, count: number) => {
        const baseX = side === 'right' ? 75 : 25;
        const newParticles = Array.from({ length: count }, (_, i) => ({
            id: Date.now() + i,
            x: baseX + (Math.random() - 0.5) * 20,
            y: 30 + (Math.random() - 0.5) * 15,
            color,
            // Random scatter direction for each particle
            px: (Math.random() - 0.5) * 60,
            py: -(Math.random() * 40 + 10),
        }));
        setParticles(prev => [...prev, ...newParticles]);
        setTimeout(() => setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id))), 1000);
    };

    useEffect(() => {
        if (attackState === 'player-attack' && damage) {
            setShowSlash(true);
            setFloatingDmg({ value: damage, side: 'right', isCrit });
            spawnParticles('right', isCrit ? '#fbbf24' : '#f59e0b', isCrit ? 12 : 6);

            if (isCrit) {
                setShowCritFlash(true);
                setScreenShake(true);
                setTimeout(() => setShowCritFlash(false), 400);
                setTimeout(() => setScreenShake(false), 400);
            }

            const t1 = setTimeout(() => setShowSlash(false), 500);
            const t2 = setTimeout(() => setFloatingDmg(null), 1200);

            // Show heal if applicable
            if (healAmount && healAmount > 0) {
                setTimeout(() => {
                    setShowHeal(healAmount);
                    setTimeout(() => setShowHeal(null), 1200);
                }, 400);
            }

            return () => { clearTimeout(t1); clearTimeout(t2); };
        } else if (attackState === 'boss-attack') {
            if (shieldBlocked) {
                // Shield absorbed the hit — show shield effect, no damage
                setShowShield(true);
                spawnParticles('left', '#22d3ee', 6); // Cyan shield particles
                setTimeout(() => setShowShield(false), 800);
                return;
            }
            if (damage && damage > 0) {
                // Boss actually hit the player
                setShowImpact(true);
                setScreenShake(true);
                spawnParticles('left', '#ef4444', 8);
                setFloatingDmg({ value: damage, side: 'left' });
                setTimeout(() => setScreenShake(false), 300);
                const t1 = setTimeout(() => setShowImpact(false), 500);
                const t2 = setTimeout(() => setFloatingDmg(null), 1200);
                return () => { clearTimeout(t1); clearTimeout(t2); };
            }
        }
    }, [attackState, damage, isCrit, healAmount, shieldBlocked]);

    return (
        <div className={`relative w-full h-48 flex items-end justify-between px-4 overflow-hidden select-none ${screenShake ? 'animate-[battleShake_0.3s_ease-in-out]' : ''}`}>
            {/* Crit flash overlay */}
            {showCritFlash && (
                <div className="absolute inset-0 bg-amber-400/20 animate-[critFlash_0.4s_ease-out_forwards] z-10 pointer-events-none" />
            )}

            {/* Shield block effect */}
            {showShield && (
                <div className="absolute left-10 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                    <div className="w-16 h-16 rounded-full border-4 border-cyan-400/60 bg-cyan-400/10 animate-[shieldPulse_0.8s_ease-out_forwards] flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-cyan-400 fill-current"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                    </div>
                </div>
            )}

            {/* Particles */}
            {particles.map(p => (
                <div
                    key={p.id}
                    className="absolute w-2 h-2 rounded-full pointer-events-none animate-[particleBurst_1s_ease-out_forwards]"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        backgroundColor: p.color,
                        '--px': `${p.px}px`,
                        '--py': `${p.py}px`,
                    } as React.CSSProperties}
                />
            ))}

            {/* Heal effect */}
            {showHeal !== null && (
                <div className="absolute left-8 bottom-12 text-base font-black text-emerald-400 animate-[floatUp_1.2s_ease-out_forwards] z-10 pointer-events-none">
                    +{showHeal} HP
                </div>
            )}

            {/* Ground line */}
            <div className="absolute bottom-2 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Player avatar */}
            <div
                className={`relative w-24 h-36 flex-shrink-0 transition-transform duration-300 ${
                    attackState === 'player-attack' ? 'translate-x-10 scale-110' : ''
                } ${showImpact ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
                style={{ transform: attackState === 'player-attack' ? 'translateX(2.5rem) scale(1.1)' : undefined }}
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
                        className={`absolute font-black animate-[floatUp_1.2s_ease-out_forwards] ${
                            floatingDmg.isCrit ? 'text-2xl' : 'text-xl'
                        } ${
                            floatingDmg.side === 'right'
                                ? `right-4 ${floatingDmg.isCrit ? 'text-yellow-300' : 'text-amber-400'}`
                                : 'left-4 text-red-400'
                        }`}
                        style={{ top: '10%' }}
                    >
                        {floatingDmg.isCrit && <span className="text-[10px] block text-center text-yellow-300 font-black tracking-widest animate-pulse">CRIT!</span>}
                        -{floatingDmg.value}
                    </div>
                )}
            </div>

            {/* Boss avatar */}
            <div
                className={`relative w-28 h-40 flex-shrink-0 transition-transform duration-300 ${
                    attackState === 'boss-attack' ? '-translate-x-10 scale-110' : ''
                } ${showSlash ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
                style={{
                    transform: attackState === 'boss-attack' ? 'translateX(-2.5rem) scale(1.1)' :
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
                @keyframes battleShake {
                    0%, 100% { transform: translate(0, 0); }
                    10% { transform: translate(-3px, -2px); }
                    20% { transform: translate(4px, 1px); }
                    30% { transform: translate(-2px, 3px); }
                    40% { transform: translate(3px, -1px); }
                    50% { transform: translate(-4px, 2px); }
                    60% { transform: translate(2px, -3px); }
                    70% { transform: translate(-1px, 2px); }
                    80% { transform: translate(3px, -2px); }
                    90% { transform: translate(-2px, 1px); }
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
                @keyframes critFlash {
                    0% { opacity: 0.3; }
                    50% { opacity: 0.15; }
                    100% { opacity: 0; }
                }
                @keyframes shieldPulse {
                    0% { transform: scale(0.5); opacity: 0.9; }
                    50% { transform: scale(1.2); opacity: 0.6; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
                @keyframes particleBurst {
                    0% { opacity: 1; transform: translate(0, 0) scale(1); }
                    100% { opacity: 0; transform: translate(var(--px, 20px), var(--py, -30px)) scale(0); }
                }
            `}</style>
        </div>
    );
};

export default BattleScene;

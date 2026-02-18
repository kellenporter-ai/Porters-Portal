
import React, { useState, useEffect } from 'react';
import { RPGItem } from '../../types';
import { getAssetColors } from '../../lib/gamification';
import { sfx } from '../../lib/sfx';

interface LootDropAnimationProps {
  item: RPGItem;
  onClose: () => void;
}

const LootDropAnimation: React.FC<LootDropAnimationProps> = ({ item, onClose }) => {
  const [phase, setPhase] = useState<'chest' | 'opening' | 'reveal'>('chest');
  const colors = getAssetColors(item.rarity);

  useEffect(() => {
    sfx.chestOpen();
    // Chest appears
    const t1 = setTimeout(() => setPhase('opening'), 800);
    // Open animation
    const t2 = setTimeout(() => setPhase('reveal'), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const rarityGlow: Record<string, string> = {
    COMMON: 'shadow-gray-500/30',
    UNCOMMON: 'shadow-green-500/40',
    RARE: 'shadow-blue-500/50',
    UNIQUE: 'shadow-yellow-500/60',
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center"
      onClick={phase === 'reveal' ? onClose : undefined}
    >
      <div className="text-center space-y-6">
        {/* Chest phase */}
        {phase === 'chest' && (
          <div className="animate-in zoom-in duration-500">
            <svg viewBox="0 0 100 100" className="w-32 h-32 mx-auto">
              {/* Chest body */}
              <rect x="15" y="40" width="70" height="45" rx="5" fill="#8B4513" stroke="#654321" strokeWidth="2" />
              {/* Chest lid */}
              <path d="M12 40 Q50 20 88 40 L85 45 Q50 28 15 45 Z" fill="#A0522D" stroke="#654321" strokeWidth="1.5" />
              {/* Lock */}
              <circle cx="50" cy="55" r="6" fill="#DAA520" stroke="#B8860B" strokeWidth="1.5" />
              <rect x="47" y="55" width="6" height="10" rx="1" fill="#DAA520" stroke="#B8860B" strokeWidth="1" />
              {/* Glow */}
              <circle cx="50" cy="55" r="15" fill="rgba(255,215,0,0.15)">
                <animate attributeName="r" values="15;20;15" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.15;0.3;0.15" dur="1.5s" repeatCount="indefinite" />
              </circle>
            </svg>
            <p className="text-sm text-gray-400 mt-4 animate-pulse">Opening...</p>
          </div>
        )}

        {/* Opening phase */}
        {phase === 'opening' && (
          <div className="animate-in zoom-in duration-300">
            <svg viewBox="0 0 100 100" className="w-32 h-32 mx-auto">
              {/* Chest body */}
              <rect x="15" y="45" width="70" height="40" rx="5" fill="#8B4513" stroke="#654321" strokeWidth="2" />
              {/* Open lid */}
              <path d="M12 45 Q50 5 88 45 L85 48 Q50 12 15 48 Z" fill="#A0522D" stroke="#654321" strokeWidth="1.5" />
              {/* Light burst */}
              <ellipse cx="50" cy="45" rx="25" ry="15" fill="rgba(255,255,255,0.3)">
                <animate attributeName="ry" values="15;40;60" dur="0.8s" fill="freeze" />
                <animate attributeName="opacity" values="0.3;0.8;0" dur="0.8s" fill="freeze" />
              </ellipse>
              {/* Particles */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                <circle
                  key={i}
                  cx="50" cy="45" r="2"
                  fill={item.rarity === 'UNIQUE' ? '#fbbf24' : item.rarity === 'RARE' ? '#3b82f6' : '#22c55e'}
                >
                  <animate
                    attributeName="cx"
                    values={`50;${50 + Math.cos(angle * Math.PI / 180) * 40}`}
                    dur="0.8s" fill="freeze"
                  />
                  <animate
                    attributeName="cy"
                    values={`45;${45 + Math.sin(angle * Math.PI / 180) * 40}`}
                    dur="0.8s" fill="freeze"
                  />
                  <animate attributeName="opacity" values="1;0" dur="0.8s" fill="freeze" />
                </circle>
              ))}
            </svg>
          </div>
        )}

        {/* Reveal phase */}
        {phase === 'reveal' && (
          <div className="animate-in zoom-in fade-in duration-500 space-y-4">
            {/* Item card */}
            <div className={`mx-auto w-64 p-6 rounded-2xl border ${colors.border} ${colors.bg} shadow-2xl ${rarityGlow[item.rarity]}`}>
              <div className={`text-[10px] font-mono uppercase tracking-widest ${colors.text} mb-2`}>
                {item.rarity}
              </div>
              <h3 className={`text-lg font-black ${colors.text}`}>{item.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{item.slot}</p>

              {/* Stats */}
              <div className="mt-3 space-y-1">
                {Object.entries(item.stats)
                  .filter(([, v]) => v && v > 0)
                  .map(([stat, value]) => (
                    <div key={stat} className="flex justify-between text-xs">
                      <span className="text-gray-400 capitalize">{stat}</span>
                      <span className={`font-bold ${colors.text}`}>+{value}</span>
                    </div>
                  ))
                }
              </div>

              {/* Affixes */}
              {item.affixes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  {item.affixes.map((affix, i) => (
                    <div key={i} className="text-[10px] text-gray-400">
                      {affix.name}: +{affix.value} {affix.stat} (T{affix.tier})
                    </div>
                  ))}
                </div>
              )}

              {/* Set indicator */}
              {item.setId && (
                <div className="mt-2 text-[10px] text-purple-400 font-bold">
                  Part of a set
                </div>
              )}

              {/* Sockets */}
              {(item.sockets || 0) > 0 && (
                <div className="mt-2 flex gap-1">
                  {Array.from({ length: item.sockets || 0 }).map((_, i) => (
                    <div key={i} className="w-3 h-3 rounded-full border border-white/20 bg-black/30" />
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 animate-pulse">Click anywhere to close</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LootDropAnimation;

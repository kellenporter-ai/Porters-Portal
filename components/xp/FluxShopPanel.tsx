
import React, { useState, useMemo } from 'react';
import { Hexagon, Clock, Sparkles, Palette, RotateCcw, ShoppingCart, Check, User } from 'lucide-react';
import { FLUX_SHOP_ITEMS, AGENT_COSMETICS } from '../../lib/gamification';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { ActiveBoost, FluxShopItem } from '../../types';

interface FluxShopPanelProps {
  currency: number;
  activeBoosts: ActiveBoost[];
  nameColor?: string;
  rerollTokens: number;
  consumablePurchases: Record<string, number>;
  ownedCosmetics: string[];
  activeCosmetic?: string;
  onEquipCosmetic: (cosmeticId: string | null) => Promise<unknown>;
}

const FluxShopPanel: React.FC<FluxShopPanelProps> = ({
  currency,
  activeBoosts,
  nameColor,
  rerollTokens,
  consumablePurchases,
  ownedCosmetics,
  activeCosmetic,
  onEquipCosmetic,
}) => {
  const toast = useToast();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  // Track in-flight equip calls to prevent double-clicks
  const [equipping, setEquipping] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  // Filter out expired boosts
  const currentBoosts = useMemo(() =>
    activeBoosts.filter(b => new Date(b.expiresAt) > new Date()),
    [activeBoosts]
  );

  const getDailyCount = (itemId: string) => consumablePurchases[`${today}_${itemId}`] || 0;

  const canPurchase = (item: FluxShopItem) => {
    if (currency < item.cost) return false;
    if (item.dailyLimit > 0 && getDailyCount(item.id) >= item.dailyLimit) return false;
    return true;
  };

  const handlePurchase = async (item: FluxShopItem) => {
    if (!canPurchase(item) || purchasing) return;
    setPurchasing(item.id);
    try {
      const result = await dataService.purchaseFluxItem(item.id);
      if (result.success) {
        toast.success(`Purchased ${item.name}!`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Purchase failed';
      toast.error(message.includes('Insufficient') ? 'Not enough Cyber-Flux!' :
                  message.includes('limit') ? 'Daily limit reached!' : message);
    } finally {
      setPurchasing(null);
    }
  };

  const handleEquipCosmetic = async (cosmeticId: string) => {
    if (equipping) return;
    setEquipping(cosmeticId);
    try {
      const newValue = activeCosmetic === cosmeticId ? null : cosmeticId;
      await onEquipCosmetic(newValue);
      toast.success(newValue ? 'Cosmetic equipped!' : 'Cosmetic unequipped.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to equip cosmetic';
      toast.error(message.includes('do not own') ? 'You don\'t own this cosmetic!' : message);
    } finally {
      setEquipping(null);
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  };

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'XP_BOOST': return <Sparkles className="w-5 h-5" />;
      case 'REROLL_TOKEN': return <RotateCcw className="w-5 h-5" />;
      case 'NAME_COLOR': return <Palette className="w-5 h-5" />;
      // User silhouette icon conveys "agent cosmetic" without needing a label prefix
      case 'AGENT_COSMETIC': return <User className="w-5 h-5" />;
      default: return <ShoppingCart className="w-5 h-5" />;
    }
  };

  const getCategoryLabel = (type: string) => {
    switch (type) {
      case 'XP_BOOST': return 'XP Boosts';
      case 'REROLL_TOKEN': return 'Utility';
      case 'NAME_COLOR': return 'Cosmetics';
      case 'AGENT_COSMETIC': return 'Agent Cosmetics';
      default: return 'Items';
    }
  };

  const getCategoryColor = (type: string) => {
    switch (type) {
      case 'XP_BOOST': return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', glow: 'shadow-yellow-500/10' };
      case 'REROLL_TOKEN': return { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', glow: 'shadow-blue-500/10' };
      case 'NAME_COLOR': return { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', glow: 'shadow-purple-500/10' };
      // Teal/cyan for agent cosmetics — visually distinct from NAME_COLOR (purple)
      case 'AGENT_COSMETIC': return { bg: 'bg-teal-500/10', border: 'border-teal-500/20', text: 'text-teal-400', glow: 'shadow-teal-500/10' };
      default: return { bg: 'bg-gray-500/10', border: 'border-gray-500/20', text: 'text-gray-400', glow: 'shadow-gray-500/10' };
    }
  };

  // Group items by type
  const grouped = useMemo(() => {
    const groups: Record<string, FluxShopItem[]> = {};
    for (const item of FLUX_SHOP_ITEMS.filter(i => i.isAvailable)) {
      (groups[item.type] ??= []).push(item);
    }
    return groups;
  }, []);

  // Build a quick lookup map from cosmetic ID to its definition
  const cosmeticDefMap = useMemo(() => {
    const map: Record<string, typeof AGENT_COSMETICS[0]> = {};
    for (const def of AGENT_COSMETICS) {
      map[def.id] = def;
    }
    return map;
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Flux Shop</h2>
            <p className="text-sm text-gray-400 mt-1">Spend your Cyber-Flux on boosts, tokens, and cosmetics</p>
          </div>
          <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-xl border border-cyan-500/20">
            <Hexagon className="w-5 h-5 text-cyan-400" />
            <span className="text-lg font-black text-white">{currency.toLocaleString()}</span>
          </div>
        </div>

        {/* Active Boosts Banner */}
        {currentBoosts.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {currentBoosts.map((boost, i) => (
              <div key={i} className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-bold text-yellow-300">
                  +{Math.round((boost.value - 1) * 100)}% XP — {getTimeRemaining(boost.expiresAt)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Reroll Tokens, Name Color, and Active Cosmetic status */}
        <div className="mt-4 flex flex-wrap gap-3">
          {rerollTokens > 0 && (
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg">
              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-bold text-blue-300">{rerollTokens} Reroll Token{rerollTokens !== 1 ? 's' : ''}</span>
            </div>
          )}
          {nameColor && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              {/* Color swatch: paired with text so color is never the sole indicator */}
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: nameColor }} aria-hidden="true" />
              <span className="text-xs font-bold text-gray-300">Active Name Color</span>
            </div>
          )}
          {activeCosmetic && cosmeticDefMap[activeCosmetic] && (
            <div className="flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-lg">
              {/* Primary color swatch — decorative, text carries the meaning */}
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: cosmeticDefMap[activeCosmetic].color }}
                aria-hidden="true"
              />
              <span className="text-xs font-bold text-teal-300">
                {cosmeticDefMap[activeCosmetic].name} equipped
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Item Categories */}
      {Object.entries(grouped).map(([type, items]) => {
        const colors = getCategoryColor(type);
        return (
          <div key={type} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className={colors.text} aria-hidden="true">{getCategoryIcon(type)}</span>
              {/* Section heading — not body text, uppercase tracking is appropriate here */}
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">{getCategoryLabel(type)}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(item => {
                const affordable = currency >= item.cost;
                const dailyCount = getDailyCount(item.id);
                const atLimit = item.dailyLimit > 0 && dailyCount >= item.dailyLimit;
                const isPurchasing = purchasing === item.id;

                // --- AGENT COSMETIC: owned items show equip controls instead of purchase ---
                if (type === 'AGENT_COSMETIC' && ownedCosmetics.includes(item.id)) {
                  const isEquipped = activeCosmetic === item.id;
                  const isEquipping = equipping === item.id;
                  const def = cosmeticDefMap[item.id];

                  return (
                    <div
                      key={item.id}
                      className={`relative ${colors.bg} border ${isEquipped ? 'border-teal-400/50' : colors.border} rounded-xl p-4 transition-all hover:scale-[1.02] hover:shadow-lg focus-within:scale-[1.02] focus-within:shadow-lg ${colors.glow}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Color swatch for cosmetic preview */}
                        <div
                          className="flex-shrink-0 w-10 h-10 rounded-lg border border-white/10 overflow-hidden"
                          aria-hidden="true"
                        >
                          {def ? (
                            <div
                              className="w-full h-full"
                              style={{
                                background: def.secondaryColor
                                  ? `radial-gradient(circle at 40% 40%, ${def.color}, ${def.secondaryColor})`
                                  : def.color,
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-teal-500/20 flex items-center justify-center">
                              <span className="text-lg">{item.icon}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-white text-sm">{item.name}</h4>
                            {/* "Owned" badge — uses both color and text so never color-only */}
                            <span className="text-[10px] font-bold text-teal-300 bg-teal-500/15 border border-teal-500/30 px-1.5 py-0.5 rounded">
                              Owned
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                        </div>
                      </div>

                      {/* Equip / Unequip toggle */}
                      <button
                        type="button"
                        onClick={() => handleEquipCosmetic(item.id)}
                        disabled={isEquipping}
                        aria-label={
                          isEquipped
                            ? `Unequip ${item.name}`
                            : `Equip ${item.name}`
                        }
                        aria-pressed={isEquipped}
                        className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent ${
                          isEquipped
                            ? 'bg-teal-500/30 text-teal-200 hover:bg-red-500/20 hover:text-red-300'
                            : isEquipping
                            ? 'bg-teal-500/20 text-teal-300 cursor-wait'
                            : 'bg-teal-500/15 hover:bg-teal-500/30 text-teal-300 hover:text-white active:scale-95'
                        }`}
                      >
                        {isEquipped ? (
                          <>
                            {/* Checkmark conveys "equipped" state — paired with text, not color alone */}
                            <Check className="w-4 h-4" aria-hidden="true" />
                            Equipped — tap to unequip
                          </>
                        ) : isEquipping ? (
                          <span className="animate-pulse">Equipping...</span>
                        ) : (
                          'Equip'
                        )}
                      </button>
                    </div>
                  );
                }

                // --- All other items (including unowned AGENT_COSMETIC) use purchase flow ---
                const disabled = !affordable || atLimit || isPurchasing;

                return (
                  <div
                    key={item.id}
                    className={`relative ${colors.bg} border ${colors.border} rounded-xl p-4 transition-all ${
                      disabled ? 'opacity-60' : 'hover:scale-[1.02] hover:shadow-lg focus-within:scale-[1.02] focus-within:shadow-lg'
                    } ${colors.glow}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`text-2xl flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg ${colors.bg}`}>
                        {item.type === 'NAME_COLOR' ? (
                          // Color swatch paired with text label above for accessibility
                          <div
                            className="w-6 h-6 rounded-full border-2 border-white/20"
                            style={{ backgroundColor: '#' + (item.value || 0).toString(16).padStart(6, '0') }}
                            aria-hidden="true"
                          />
                        ) : item.type === 'AGENT_COSMETIC' ? (
                          // Small gradient preview for unowned cosmetics
                          (() => {
                            const def = cosmeticDefMap[item.id];
                            return def ? (
                              <div
                                className="w-6 h-6 rounded-full border border-white/20"
                                style={{
                                  background: def.secondaryColor
                                    ? `radial-gradient(circle at 40% 40%, ${def.color}, ${def.secondaryColor})`
                                    : def.color,
                                }}
                                aria-hidden="true"
                              />
                            ) : (
                              <span>{item.icon}</span>
                            );
                          })()
                        ) : (
                          <span>{item.icon}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-white text-sm">{item.name}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                        {item.dailyLimit > 0 && (
                          <p className="text-xs text-gray-400 mt-1 font-mono">
                            {dailyCount}/{item.dailyLimit} today
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePurchase(item)}
                      disabled={disabled}
                      aria-label={atLimit ? `${item.name}: daily limit reached` : `Purchase ${item.name} for ${item.cost} Flux`}
                      className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent ${
                        atLimit
                          ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                          : !affordable
                          ? 'bg-red-500/10 text-red-400/60 cursor-not-allowed'
                          : isPurchasing
                          ? 'bg-cyan-500/20 text-cyan-300 cursor-wait'
                          : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 hover:text-white active:scale-95'
                      }`}
                    >
                      {atLimit ? (
                        <>
                          <Check className="w-4 h-4" aria-hidden="true" />
                          Limit Reached
                        </>
                      ) : isPurchasing ? (
                        <span className="animate-pulse">Processing...</span>
                      ) : (
                        <>
                          <Hexagon className="w-4 h-4" aria-hidden="true" />
                          {item.cost} Flux
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default FluxShopPanel;

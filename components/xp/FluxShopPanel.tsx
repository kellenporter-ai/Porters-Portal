
import React, { useState, useMemo, useCallback } from 'react';
import { Hexagon, Clock, Sparkles, Palette, RotateCcw, ShoppingCart, Check, User, Snowflake, Box, Wind, Eye, EyeOff } from 'lucide-react';
import { FLUX_SHOP_ITEMS, AGENT_COSMETICS } from '../../lib/gamification';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import { sfx } from '../../lib/sfx';
import { ActiveBoost, FluxShopItem, CosmeticVisualType, ActiveCosmetics } from '../../types';
import OperativeAvatar from '../dashboard/OperativeAvatar';

/** Helper: derive the cosmetic slot from its ID prefix */
const getCosmeticSlot = (id: string): keyof ActiveCosmetics | null =>
  id.startsWith('aura_') ? 'aura'
    : id.startsWith('particle_') ? 'particle'
    : id.startsWith('frame_') ? 'frame'
    : id.startsWith('trail_') ? 'trail' : null;

interface FluxShopPanelProps {
  currency: number;
  activeBoosts: ActiveBoost[];
  nameColor?: string;
  rerollTokens: number;
  consumablePurchases: Record<string, number>;
  ownedCosmetics: string[];
  activeCosmetics?: ActiveCosmetics;
  onEquipCosmetic: (cosmeticId: string | null, slot?: string) => Promise<unknown>;
  // Avatar props for preview system
  playerEquipped?: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
  playerAppearance?: { bodyType?: 'A' | 'B' | 'C'; hue?: number; skinTone?: number; hairStyle?: number; hairColor?: number };
  playerEvolutionLevel?: number;
}

const FluxShopPanel: React.FC<FluxShopPanelProps> = ({
  currency,
  activeBoosts,
  nameColor,
  rerollTokens,
  consumablePurchases,
  ownedCosmetics,
  activeCosmetics,
  onEquipCosmetic,
  playerEquipped,
  playerAppearance,
  playerEvolutionLevel,
}) => {
  const toast = useToast();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  // Track in-flight equip calls to prevent double-clicks
  const [equipping, setEquipping] = useState<string | null>(null);
  // Cosmetic preview: null = show currently equipped, string = preview that cosmetic ID
  const [previewCosmeticId, setPreviewCosmeticId] = useState<string | null>(null);

  // Build a merged activeCosmetics for preview: preview overrides only its slot
  const displayedCosmetics: ActiveCosmetics = useMemo(() => {
    const base = { ...activeCosmetics };
    if (previewCosmeticId) {
      const slot = getCosmeticSlot(previewCosmeticId);
      if (slot) base[slot] = previewCosmeticId;
    }
    return base;
  }, [activeCosmetics, previewCosmeticId]);

  const previewCosmeticDef = useMemo(() =>
    previewCosmeticId ? AGENT_COSMETICS.find(c => c.id === previewCosmeticId) : undefined,
    [previewCosmeticId]
  );

  const handlePreview = useCallback((cosmeticId: string) => {
    setPreviewCosmeticId(prev => prev === cosmeticId ? null : cosmeticId);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewCosmeticId(null);
  }, []);

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
        sfx.purchase();
        toast.success(`Purchased ${item.name}!`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Purchase failed';
      sfx.error();
      toast.error(message.includes('Insufficient') ? 'Not enough Cyber-Flux!' :
                  message.includes('limit') ? 'Daily limit reached!' : message);
    } finally {
      setPurchasing(null);
    }
  };

  /** Check if a specific cosmetic is currently equipped in its slot */
  const isCosmeticEquipped = (cosmeticId: string): boolean => {
    const slot = getCosmeticSlot(cosmeticId);
    return slot ? activeCosmetics?.[slot] === cosmeticId : false;
  };

  const handleEquipCosmetic = async (cosmeticId: string) => {
    if (equipping) return;
    setEquipping(cosmeticId);
    try {
      const slot = getCosmeticSlot(cosmeticId);
      const isCurrentlyEquipped = isCosmeticEquipped(cosmeticId);
      const newValue = isCurrentlyEquipped ? null : cosmeticId;
      await onEquipCosmetic(newValue, slot || undefined);
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
      case 'AGENT_COSMETIC': return <User className="w-5 h-5" />;
      default: return <ShoppingCart className="w-5 h-5" />;
    }
  };

  const getCosmeticSubIcon = (visualType: CosmeticVisualType) => {
    switch (visualType) {
      case 'AURA': return <Sparkles className="w-4 h-4" />;
      case 'PARTICLE': return <Snowflake className="w-4 h-4" />;
      case 'FRAME': return <Box className="w-4 h-4" />;
      case 'TRAIL': return <Wind className="w-4 h-4" />;
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

  const getCosmeticSubLabel = (visualType: CosmeticVisualType) => {
    switch (visualType) {
      case 'AURA': return 'Auras';
      case 'PARTICLE': return 'Particles';
      case 'FRAME': return 'Frames';
      case 'TRAIL': return 'Trails';
    }
  };

  const getCosmeticSubColor = (visualType: CosmeticVisualType) => {
    switch (visualType) {
      case 'AURA': return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', glow: 'shadow-amber-500/10', price: '150' };
      case 'PARTICLE': return { bg: 'bg-pink-500/10', border: 'border-pink-500/20', text: 'text-pink-400', glow: 'shadow-pink-500/10', price: '200' };
      case 'FRAME': return { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-400', glow: 'shadow-indigo-500/10', price: '250' };
      case 'TRAIL': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'shadow-emerald-500/10', price: '300' };
    }
  };

  const getCategoryColor = (type: string) => {
    switch (type) {
      case 'XP_BOOST': return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', glow: 'shadow-yellow-500/10' };
      case 'REROLL_TOKEN': return { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', glow: 'shadow-blue-500/10' };
      case 'NAME_COLOR': return { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', glow: 'shadow-purple-500/10' };
      case 'AGENT_COSMETIC': return { bg: 'bg-teal-500/10', border: 'border-teal-500/20', text: 'text-teal-400', glow: 'shadow-teal-500/10' };
      default: return { bg: 'bg-gray-500/10', border: 'border-gray-500/20', text: 'text-gray-400', glow: 'shadow-gray-500/10' };
    }
  };

  // Group non-cosmetic items by type; cosmetics go into subcategories
  const grouped = useMemo(() => {
    const groups: Record<string, FluxShopItem[]> = {};
    for (const item of FLUX_SHOP_ITEMS.filter(i => i.isAvailable && i.type !== 'AGENT_COSMETIC')) {
      (groups[item.type] ??= []).push(item);
    }
    return groups;
  }, []);

  // Group agent cosmetics by visual type (AURA, PARTICLE, FRAME, TRAIL)
  const cosmeticSubGroups = useMemo(() => {
    const subs: Record<CosmeticVisualType, FluxShopItem[]> = { AURA: [], PARTICLE: [], FRAME: [], TRAIL: [] };
    for (const item of FLUX_SHOP_ITEMS.filter(i => i.isAvailable && i.type === 'AGENT_COSMETIC')) {
      const def = AGENT_COSMETICS.find(c => c.id === item.id);
      if (def) (subs[def.visualType] ??= []).push(item);
    }
    return subs;
  }, []);

  const cosmeticSubOrder: CosmeticVisualType[] = ['AURA', 'PARTICLE', 'FRAME', 'TRAIL'];

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
          {/* Show all equipped cosmetics (one per slot) */}
          {activeCosmetics && (['aura', 'particle', 'frame', 'trail'] as const).map(slot => {
            const id = activeCosmetics[slot];
            if (!id || !cosmeticDefMap[id]) return null;
            const def = cosmeticDefMap[id];
            return (
              <div key={slot} className="flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-lg">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: def.color }}
                  aria-hidden="true"
                />
                <span className="text-xs font-bold text-teal-300">
                  {def.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Preview Panel */}
      {playerEquipped && (
        <div className="bg-black/30 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-teal-400" aria-hidden="true" />
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Agent Preview</h3>
            {previewCosmeticId && (
              <button
                type="button"
                onClick={clearPreview}
                className="ml-auto flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-teal-400"
                aria-label="Clear preview and show equipped cosmetic"
              >
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                Clear Preview
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="w-28 h-44 flex-shrink-0 bg-black/40 rounded-xl border border-white/10 overflow-hidden relative"
                 style={{ background: `radial-gradient(ellipse at 50% 60%, hsla(${(playerAppearance?.hue || 0) + 200}, 60%, 25%, 0.3) 0%, rgba(0,0,0,0.4) 70%)` }}>
              <OperativeAvatar
                equipped={playerEquipped}
                appearance={playerAppearance}
                evolutionLevel={playerEvolutionLevel}
                activeCosmetics={displayedCosmetics}
              />
            </div>
            <div className="flex-1 min-w-0">
              {previewCosmeticDef ? (
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">{previewCosmeticDef.name}</span>
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      Preview
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{previewCosmeticDef.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: previewCosmeticDef.color }} aria-hidden="true" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">{previewCosmeticDef.visualType}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-sm font-bold text-gray-300">Equipped Cosmetics</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(['aura', 'particle', 'frame', 'trail'] as const).map(slot => {
                      const id = activeCosmetics?.[slot];
                      const def = id ? cosmeticDefMap[id] : null;
                      return def ? (
                        <span key={slot} className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
                          {def.name}
                        </span>
                      ) : null;
                    })}
                    {!activeCosmetics?.aura && !activeCosmetics?.particle && !activeCosmetics?.frame && !activeCosmetics?.trail && (
                      <p className="text-xs text-gray-500">Tap the eye icon on any cosmetic to preview it.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Non-cosmetic Item Categories (XP Boosts, Utility, Name Colors) */}
      {Object.entries(grouped).map(([type, items]) => {
        const colors = getCategoryColor(type);
        return (
          <div key={type} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className={colors.text} aria-hidden="true">{getCategoryIcon(type)}</span>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">{getCategoryLabel(type)}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(item => {
                const affordable = currency >= item.cost;
                const dailyCount = getDailyCount(item.id);
                const atLimit = item.dailyLimit > 0 && dailyCount >= item.dailyLimit;
                const isPurchasing = purchasing === item.id;
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
                        {type === 'NAME_COLOR' ? (
                          <div
                            className="w-6 h-6 rounded-full border-2 border-white/20"
                            style={{ backgroundColor: '#' + (item.value || 0).toString(16).padStart(6, '0') }}
                            aria-hidden="true"
                          />
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

      {/* Agent Cosmetics — organized by subcategory */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className="text-teal-400" aria-hidden="true"><User className="w-5 h-5" /></span>
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Agent Cosmetics</h3>
        </div>
        <p className="text-xs text-gray-500 px-1">Customize your operative with auras, particles, frames, and trails. Equip one of each type simultaneously.</p>
      </div>

      {cosmeticSubOrder.map(visualType => {
        const subItems = cosmeticSubGroups[visualType];
        if (!subItems || subItems.length === 0) return null;
        const subColors = getCosmeticSubColor(visualType);

        return (
          <div key={visualType} className="space-y-3">
            <div className="flex items-center gap-2 px-1 ml-2">
              <span className={subColors.text} aria-hidden="true">{getCosmeticSubIcon(visualType)}</span>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{getCosmeticSubLabel(visualType)}</h4>
              <span className="text-[10px] text-gray-500 font-mono ml-auto">{subColors.price} Flux each</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {subItems.map(item => {
                const affordable = currency >= item.cost;
                const isPurchasing = purchasing === item.id;
                const def = cosmeticDefMap[item.id];
                const isOwned = ownedCosmetics.includes(item.id);

                // --- Owned cosmetics show equip controls ---
                if (isOwned) {
                  const isEquipped = isCosmeticEquipped(item.id);
                  const isEquipping = equipping === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`relative ${subColors.bg} border ${isEquipped ? `${subColors.text.replace('text-', 'border-')}/50` : subColors.border} rounded-xl p-4 transition-all hover:scale-[1.02] hover:shadow-lg focus-within:scale-[1.02] focus-within:shadow-lg ${subColors.glow}`}
                    >
                      <div className="flex items-start gap-3">
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
                            <div className={`w-full h-full ${subColors.bg} flex items-center justify-center`}>
                              <span className="text-lg">{item.icon}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-white text-sm">{item.name}</h4>
                            <span className={`text-[10px] font-bold ${subColors.text} ${subColors.bg} border ${subColors.border} px-1.5 py-0.5 rounded`}>
                              Owned
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                        </div>
                        {/* Preview toggle */}
                        {playerEquipped && (
                          <button
                            type="button"
                            onClick={() => handlePreview(item.id)}
                            aria-label={previewCosmeticId === item.id ? `Stop previewing ${item.name}` : `Preview ${item.name} on agent`}
                            aria-pressed={previewCosmeticId === item.id}
                            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-teal-400 ${
                              previewCosmeticId === item.id
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                            }`}
                          >
                            {previewCosmeticId === item.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleEquipCosmetic(item.id)}
                        disabled={isEquipping}
                        aria-label={isEquipped ? `Unequip ${item.name}` : `Equip ${item.name}`}
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

                // --- Unowned cosmetics show purchase flow ---
                const disabled = !affordable || isPurchasing;

                return (
                  <div
                    key={item.id}
                    className={`relative ${subColors.bg} border ${subColors.border} rounded-xl p-4 transition-all ${
                      disabled ? 'opacity-60' : 'hover:scale-[1.02] hover:shadow-lg focus-within:scale-[1.02] focus-within:shadow-lg'
                    } ${subColors.glow}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg ${subColors.bg}`}>
                        {def ? (
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
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-white text-sm">{item.name}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                      </div>
                      {/* Preview toggle */}
                      {playerEquipped && (
                        <button
                          type="button"
                          onClick={() => handlePreview(item.id)}
                          aria-label={previewCosmeticId === item.id ? `Stop previewing ${item.name}` : `Preview ${item.name} on agent`}
                          aria-pressed={previewCosmeticId === item.id}
                          className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-teal-400 ${
                            previewCosmeticId === item.id
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                          }`}
                        >
                          {previewCosmeticId === item.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePurchase(item)}
                      disabled={disabled}
                      aria-label={`Purchase ${item.name} for ${item.cost} Flux`}
                      className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent ${
                        !affordable
                          ? 'bg-red-500/10 text-red-400/60 cursor-not-allowed'
                          : isPurchasing
                          ? 'bg-cyan-500/20 text-cyan-300 cursor-wait'
                          : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 hover:text-white active:scale-95'
                      }`}
                    >
                      {isPurchasing ? (
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


import React from 'react';
import { RPGItem, EquipmentSlot, ItemGem } from '../../types';
import { Trash2, Hexagon } from 'lucide-react';
import { getAssetColors, getRunewordForItem, getUnsocketCost, getDisenchantValue, FLUX_COSTS } from '../../lib/gamification';
import { RUNEWORD_DEFINITIONS } from '../../lib/runewords';
import Modal from '../Modal';
import ItemIcon from '../ItemIcon';

interface InspectItemModalProps {
  inspectItem: RPGItem | null;
  onClose: () => void;
  isProcessing: boolean;
  currency: number;
  equipped: Partial<Record<EquipmentSlot, RPGItem>>;
  gemsInventory: ItemGem[];
  onEquip: (item: RPGItem) => void;
  onUnequip: (slot: string) => void;
  onDisenchant: () => void;
  onCraft: (action: 'RECALIBRATE' | 'REFORGE' | 'OPTIMIZE') => void;
  onAddSocket: () => void;
  onSocketGem: (gemId: string) => void;
  onUnsocketGem: (gemIndex: number) => void;
}

const InspectItemModal: React.FC<InspectItemModalProps> = ({
  inspectItem, onClose, isProcessing, currency, equipped, gemsInventory,
  onEquip, onUnequip, onDisenchant, onCraft, onAddSocket, onSocketGem, onUnsocketGem,
}) => {
  if (!inspectItem) return <Modal isOpen={false} onClose={onClose} title=""><></></Modal>;

  const colors = getAssetColors(inspectItem.rarity);
  const runeword = getRunewordForItem(inspectItem);

  return (
    <Modal isOpen={!!inspectItem} onClose={onClose} title="Nano-Fabricator Terminal" maxWidth="max-w-xl">
      <div className="space-y-6 text-gray-100">
        {/* Item Header */}
        <div className={`p-5 rounded-xl border ${inspectItem.runewordActive ? 'border-amber-500/40 runeword-active' : colors.border} ${colors.bg} ${colors.shimmer} relative overflow-hidden`}>
          <div className="flex items-start gap-4 relative z-10">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 border ${inspectItem.runewordActive ? 'border-amber-500/50' : colors.border} ${colors.bg}`} style={{ boxShadow: inspectItem.runewordActive ? '0 0 20px rgba(245,158,11,0.3)' : inspectItem.rarity === 'UNIQUE' ? '0 0 20px rgba(249,115,22,0.3)' : inspectItem.rarity === 'RARE' ? '0 0 15px rgba(234,179,8,0.2)' : 'none' }}>
              <ItemIcon visualId={inspectItem.visualId} slot={inspectItem.slot} rarity={inspectItem.rarity} size="w-9 h-9" />
            </div>
            <div className="flex-1">
              <div className={`text-lg font-bold ${inspectItem.runewordActive ? 'text-amber-300' : colors.text}`}>{inspectItem.name}</div>
              <div className="text-xs text-gray-300 font-mono uppercase">{inspectItem.rarity} {inspectItem.slot}</div>
              {inspectItem.runewordActive && (
                <div className="text-[10px] font-bold text-amber-400 mt-0.5">{runeword?.name}</div>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-1">
            {Object.entries(inspectItem.stats).map(([stat, val]) => (
              <div key={stat} className="flex justify-between text-sm text-gray-200 border-b border-white/5 pb-1">
                <span className="uppercase text-xs text-gray-400 font-bold">{stat}</span>
                <span className="font-mono font-bold">+{val}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {inspectItem.affixes.map((aff, i) => (
              <span key={i} className="text-[9px] bg-black/40 px-2 py-1 rounded border border-white/10 text-gray-400">
                {aff.name} (T{aff.tier})
              </span>
            ))}
          </div>
        </div>

        {/* Gem Sockets & Runeword */}
        {(inspectItem.sockets || 0) > 0 && (() => {
          const sockets = inspectItem.sockets || 0;
          const gems = inspectItem.gems || [];
          const emptySlots = sockets - gems.length;

          return (
            <div className={`p-4 rounded-xl border ${runeword ? 'border-amber-500/40 bg-gradient-to-br from-amber-950/30 to-black/50' : 'border-white/10 bg-black/20'}`}>
              {/* Runeword banner */}
              {runeword && (
                <div className="mb-3 text-center">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-widest">Runeword Active</div>
                  <div className="text-lg font-black text-amber-300 mt-1">{runeword.name}</div>
                  <p className="text-[10px] text-amber-500/70 italic mt-1">{runeword.lore}</p>
                  <div className="flex justify-center gap-3 mt-2">
                    {Object.entries(runeword.bonusStats).map(([stat, val]) => (
                      <span key={stat} className="text-[10px] font-mono font-bold text-amber-400">
                        +{val} {stat.slice(0, 3).toUpperCase()}
                      </span>
                    ))}
                  </div>
                  {runeword.bonusEffects && runeword.bonusEffects.length > 0 && (
                    <div className="mt-1">
                      {runeword.bonusEffects.map(eff => (
                        <span key={eff.id} className="text-[10px] text-purple-400 font-bold">{eff.description}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Socket visualization */}
              <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">
                <Hexagon className="w-3 h-3" /> Gem Sockets ({gems.length}/{sockets})
              </div>
              <div className="flex gap-2">
                {gems.map((gem, i) => {
                  const unsocketFlux = getUnsocketCost(inspectItem.rarity, gem.tier, inspectItem.unsocketCount || 0);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 group/gem">
                      <div
                        className="w-8 h-8 rounded-lg border-2 flex items-center justify-center relative"
                        style={{ borderColor: gem.color, backgroundColor: `${gem.color}20`, boxShadow: `0 0 8px ${gem.color}40` }}
                      >
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: gem.color }} />
                      </div>
                      <span className="text-[9px] text-gray-400">{gem.name}</span>
                      <button
                        onClick={() => onUnsocketGem(i)}
                        disabled={isProcessing || currency < unsocketFlux}
                        className="text-[8px] text-red-400/60 hover:text-red-400 font-bold transition disabled:opacity-30"
                        title={`Unsocket for ${unsocketFlux} Flux`}
                      >
                        Remove ({unsocketFlux} F)
                      </button>
                    </div>
                  );
                })}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="w-8 h-8 rounded-lg border-2 border-dashed border-white/20 bg-black/30 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white/10" />
                  </div>
                ))}
              </div>

              {/* Gem socketing UI */}
              {emptySlots > 0 && gemsInventory.length > 0 && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Socket a Gem ({FLUX_COSTS.ENCHANT} Flux)</div>
                  <div className="flex flex-wrap gap-2">
                    {gemsInventory.map((gem: ItemGem & { id?: string }) => (
                      <button
                        key={(gem as any).id}
                        onClick={() => onSocketGem((gem as any).id)}
                        disabled={isProcessing || currency < FLUX_COSTS.ENCHANT}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/10 bg-black/30 hover:bg-white/10 transition text-xs disabled:opacity-50"
                      >
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: gem.color }} />
                        <span className="text-gray-300">{gem.name}</span>
                        <span className="text-gray-600 font-mono">+{gem.value}</span>
                      </button>
                    ))}
                  </div>

                  {/* Runeword hints */}
                  {gems.length > 0 && !runeword && (() => {
                    const currentPattern = gems.map((g) => g.name);
                    const possibleRws = RUNEWORD_DEFINITIONS.filter(rw =>
                      rw.requiredSockets === sockets &&
                      rw.pattern.slice(0, currentPattern.length).every((p, i) => p === currentPattern[i])
                    );
                    if (possibleRws.length === 0) return null;
                    return (
                      <div className="mt-2 text-[9px] text-amber-500/60">
                        {possibleRws.map(rw => (
                          <div key={rw.id}>Possible: <span className="font-bold text-amber-400/80">{rw.name}</span> — needs [{rw.pattern.join(' → ')}]</div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}

        {/* Add Socket button */}
        {(inspectItem.sockets || 0) < 3 && (
          <button
            onClick={onAddSocket}
            disabled={isProcessing || currency < FLUX_COSTS.SOCKET}
            className="w-full py-2 bg-black/20 hover:bg-purple-900/20 border border-white/10 hover:border-purple-500/50 rounded-xl text-sm text-gray-300 hover:text-purple-300 font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Hexagon className="w-4 h-4" />
            Add Socket ({FLUX_COSTS.SOCKET} Flux) — {inspectItem.sockets || 0}/3
          </button>
        )}

        {/* Actions Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Comparison vs currently equipped */}
          {(() => {
            const slotKey = (inspectItem.slot === 'RING' ? 'RING1' : inspectItem.slot) as string;
            const currentlyEquipped = equipped[slotKey as keyof typeof equipped] || (inspectItem.slot === 'RING' ? equipped['RING2'] : null);
            if (!currentlyEquipped || currentlyEquipped.id === inspectItem.id) return null;

            const ceColors = getAssetColors(currentlyEquipped.rarity);
            const allStats = new Set([...Object.keys(inspectItem.stats), ...Object.keys(currentlyEquipped.stats)]);

            return (
              <div className="col-span-2 bg-black/30 border border-white/10 rounded-xl p-3 mb-1">
                <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-2">Replacing Currently Equipped</div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold ${ceColors.text}`}>{currentlyEquipped.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{currentlyEquipped.rarity}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {Array.from(allStats).map(stat => {
                    const newVal = (inspectItem.stats as Record<string, number>)[stat] || 0;
                    const oldVal = (currentlyEquipped.stats as Record<string, number>)[stat] || 0;
                    const diff = newVal - oldVal;
                    if (diff === 0) return <span key={stat} className="text-[10px] text-gray-600 font-mono">{stat.slice(0, 3).toUpperCase()}: ±0</span>;
                    return (
                      <span key={stat} className={`text-[10px] font-mono font-bold ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stat.slice(0, 3).toUpperCase()}: {diff > 0 ? '▲' : '▼'}{Math.abs(diff)}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {(() => {
            const equippedSlot = Object.entries(equipped).find(([, item]) => item && item.id === inspectItem.id)?.[0];
            return equippedSlot ? (
              <button
                onClick={() => onUnequip(equippedSlot)}
                className="col-span-2 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition shadow-lg shadow-orange-900/20"
                disabled={isProcessing}
              >
                Unequip Gear
              </button>
            ) : (
              <button
                onClick={() => onEquip(inspectItem)}
                className="col-span-2 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition shadow-lg shadow-green-900/20"
                disabled={isProcessing}
              >
                Equip Gear
              </button>
            );
          })()}

          <div className="col-span-2 border-t border-white/10 my-2"></div>
          <div className="col-span-2 text-center text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Fabrication Protocols</div>

          {/* Crafting Options */}
          <button
            onClick={() => onCraft('RECALIBRATE')}
            disabled={isProcessing || currency < FLUX_COSTS.RECALIBRATE}
            className="bg-black/20 hover:bg-purple-900/20 border border-white/10 hover:border-purple-500/50 p-3 rounded-xl text-left transition group disabled:opacity-50"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-gray-300 group-hover:text-purple-300">Recalibrate</span>
              <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-1.5 rounded">{FLUX_COSTS.RECALIBRATE} Flux</span>
            </div>
            <p className="text-[9px] text-gray-500">Reroll numeric values within current tier.</p>
          </button>

          <button
            onClick={() => onCraft('REFORGE')}
            disabled={isProcessing || currency < FLUX_COSTS.REFORGE || inspectItem.rarity === 'UNIQUE'}
            className="bg-black/20 hover:bg-red-900/20 border border-white/10 hover:border-red-500/50 p-3 rounded-xl text-left transition group disabled:opacity-50"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-gray-300 group-hover:text-red-300">Reforge</span>
              <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-1.5 rounded">{FLUX_COSTS.REFORGE} Flux</span>
            </div>
            <p className="text-[9px] text-gray-500">Reroll all affixes. Keeps Rarity.</p>
          </button>

          <button
            onClick={() => onCraft('OPTIMIZE')}
            disabled={isProcessing || currency < FLUX_COSTS.OPTIMIZE}
            className="col-span-2 bg-black/20 hover:bg-yellow-900/20 border border-white/10 hover:border-yellow-500/50 p-3 rounded-xl text-left transition group disabled:opacity-50"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-gray-300 group-hover:text-yellow-300">Optimize Tier</span>
              <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-1.5 rounded">{FLUX_COSTS.OPTIMIZE} Flux</span>
            </div>
            <p className="text-[9px] text-gray-500">Upgrade affix tiers to match current operative level.</p>
          </button>

          <div className="col-span-2 border-t border-white/10 my-2"></div>

          <button
            onClick={onDisenchant}
            disabled={isProcessing}
            className="col-span-2 py-3 bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-400 font-bold rounded-xl transition flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Salvage for {getDisenchantValue(inspectItem)} Flux
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default InspectItemModal;

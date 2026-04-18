import React, { useState, useMemo } from 'react';
import { User, RPGItem, EquipmentSlot, ItemSlot } from '../../types';
import { User as UserIcon, GripVertical, Diamond, ChevronDown, ChevronUp } from 'lucide-react';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors, DragStartEvent, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { dataService } from '../../services/dataService';
import { getAssetColors, getDisenchantValue, FLUX_COSTS, getUnsocketCost, deriveCombatStats } from '../../lib/gamification';
import { getClassProfile } from '../../lib/classProfile';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';
import { useConfirm } from '../ConfirmDialog';
import OperativeAvatar from './OperativeAvatar';
import Avatar3D from './Avatar3D';
import CustomizeModal from './CustomizeModal';
import InspectItemModal from './InspectItemModal';
import ItemIcon from '../ItemIcon';
import { RUNEWORD_DEFINITIONS } from '../../lib/runewords';

type RightPanelTab = 'agent' | 'loadout' | 'gems';

// Inline modifier: snaps the drag overlay center to the cursor position.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snapCenterToCursor(args: any) {
  const { activatorEvent, draggingNodeRect, transform } = args;
  if (draggingNodeRect && activatorEvent) {
    const coords = getEventCoordinates(activatorEvent);
    if (!coords) return transform;
    return {
      ...transform,
      x: transform.x + coords.x - (draggingNodeRect.left + draggingNodeRect.width / 2),
      y: transform.y + coords.y - (draggingNodeRect.top + draggingNodeRect.height / 2),
    };
  }
  return transform;
}

interface AgentLoadoutTabProps {
  user: User;
  activeClass: string;
  level: number;
}

/** All equipment slots for the loadout grid */
const ALL_EQUIP_SLOTS: EquipmentSlot[] = ['HEAD', 'CHEST', 'HANDS', 'BELT', 'FEET', 'RING1', 'RING2', 'AMULET', 'WEAPON1', 'WEAPON2'];

const AgentLoadoutTab: React.FC<AgentLoadoutTabProps> = ({ user, activeClass, level }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [inspectItem, setInspectItem] = useState<RPGItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [draggedItem, setDraggedItem] = useState<RPGItem | null>(null);
  const [rightTab, setRightTab] = useState<RightPanelTab>('agent');

  const classProfile = useMemo(() => getClassProfile(user, activeClass), [user, activeClass]);
  const equipped = classProfile.equipped;
  const inventory = classProfile.inventory;
  const currency = user.gamification?.currency || 0;
  const gemsInventory = user.gamification?.gemsInventory || [];

  const playerStats = useMemo(() => {
    const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
    const items: RPGItem[] = Object.values(equipped).filter(Boolean) as RPGItem[];
    items.forEach(item => {
      if (item.stats) Object.entries(item.stats).forEach(([key, val]) => { base[key as keyof typeof base] += (val as number); });
    });
    return base;
  }, [equipped]);

  // --- DnD sensors ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const slotAccepts = (equipSlot: EquipmentSlot): ItemSlot[] => {
    if (equipSlot === 'RING1' || equipSlot === 'RING2') return ['RING'];
    if (equipSlot === 'WEAPON1' || equipSlot === 'WEAPON2') return ['WEAPON'];
    return [equipSlot as ItemSlot];
  };

  // --- Equipment handlers ---
  const handleEquip = async (item: RPGItem) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await dataService.equipItem(user.id, item, activeClass);
      setInspectItem(null);
      sfx.equip();
      toast.success(`${item.name} equipped.`);
    } catch {
      toast.error('Could not equip this item. You may not meet the requirements.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnequip = async (slot: string) => {
    setIsProcessing(true);
    try {
      await dataService.unequipItem(user.id, slot, activeClass);
      setInspectItem(null);
      toast.success('Item unequipped.');
    } catch {
      toast.error('Could not unequip this item. Try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisenchant = async () => {
    if (!inspectItem) return;
    const isEquipped = Object.values(equipped).some(e => e && (e as RPGItem).id === inspectItem.id);
    if (isEquipped) {
      toast.error('Unequip this item before salvaging.');
      return;
    }
    const val = getDisenchantValue(inspectItem);
    if (await confirm({ message: `Salvage ${inspectItem.name} for ${val} Cyber-Flux? This item will be destroyed.`, confirmLabel: "Salvage" })) {
      setIsProcessing(true);
      try {
        await dataService.disenchantItem(user.id, inspectItem, activeClass);
        setInspectItem(null);
        sfx.salvage();
        toast.success(`Salvaged for ${val} Cyber-Flux.`);
      } catch {
        toast.error('Could not salvage this item. It may be currently equipped.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleCraft = async (action: 'RECALIBRATE' | 'REFORGE' | 'OPTIMIZE') => {
    if (!inspectItem) return;
    const cost = FLUX_COSTS[action];
    if (currency < cost) return toast.error('Insufficient Cyber-Flux.');
    setIsProcessing(true);
    try {
      await dataService.craftItem(user.id, inspectItem, action, activeClass);
      setInspectItem(null);
      sfx.craft();
      toast.success(`${action.charAt(0) + action.slice(1).toLowerCase()} complete.`);
    } catch (e: any) {
      const msg = e?.message || e?.code || 'Unknown error';
      toast.error(`Fabrication failed: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddSocket = async () => {
    if (!inspectItem || isProcessing) return;
    if (currency < FLUX_COSTS.SOCKET) return toast.error('Insufficient Cyber-Flux.');
    if ((inspectItem.sockets || 0) >= 3) return toast.error('Maximum sockets reached.');
    setIsProcessing(true);
    try {
      const result = await dataService.addSocket(inspectItem.id, activeClass);
      setInspectItem(result.item);
      sfx.craft();
      toast.success('Socket added!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add socket.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSocketGem = async (gemId: string) => {
    if (!inspectItem || isProcessing) return;
    if (currency < FLUX_COSTS.ENCHANT) return toast.error('Insufficient Cyber-Flux.');
    setIsProcessing(true);
    try {
      const result = await dataService.socketGem(inspectItem.id, gemId, activeClass);
      setInspectItem(result.item);
      sfx.craft();
      if (result.runewordActivated) {
        sfx.levelUp();
        toast.success(`RUNEWORD ACTIVATED: ${result.runewordActivated.name}!`);
      } else {
        toast.success('Gem socketed!');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to socket gem.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnsocketGem = async (gemIndex: number) => {
    if (!inspectItem || isProcessing) return;
    const gem = inspectItem.gems?.[gemIndex];
    if (!gem) return;
    const cost = getUnsocketCost(inspectItem.rarity, gem.tier, inspectItem.unsocketCount || 0);
    if (currency < cost) return toast.error(`Insufficient Cyber-Flux. Need ${cost}.`);
    setIsProcessing(true);
    try {
      const result = await dataService.unsocketGem(inspectItem.id, gemIndex, activeClass);
      setInspectItem(result.item);
      sfx.craft();
      toast.success(`Gem removed! -${result.cost} Flux`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to unsocket gem.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCustomizeSave = async (appearance: { hue: number; suitHue: number; bodyType: 'A' | 'B' | 'C'; skinTone: number; hairStyle: number; hairColor: number }) => {
    try {
      await dataService.updateUserAppearance(user.id, appearance, activeClass);
      toast.success('Profile updated!');
      setShowCustomize(false);
    } catch {
      toast.error('Could not save appearance. Check your connection.');
    }
  };

  // --- DnD handlers ---
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = inventory.find(i => i.id === active.id) ||
                 Object.values(equipped).find(i => i && i.id === active.id) as RPGItem | undefined;
    setDraggedItem(item || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedItem(null);
    if (!over) return;

    const dragId = active.id as string;
    const dropId = over.id as string;

    if (dropId.startsWith('slot-')) {
      const targetSlot = dropId.replace('slot-', '') as EquipmentSlot;
      const item = inventory.find(i => i.id === dragId);
      if (!item) return;
      const accepted = slotAccepts(targetSlot);
      if (!accepted.includes(item.slot)) return;
      handleEquip(item);
    }

    if (dragId.startsWith('equipped-') && (dropId === 'inventory-zone' || dropId.startsWith('storage-cell-'))) {
      const slot = dragId.replace('equipped-', '');
      handleUnequip(slot);
    }
  };

  // --- Droppable Equipment Slot ---
  const SlotRender: React.FC<{ slot: EquipmentSlot }> = ({ slot }) => {
    const item = equipped[slot];
    const colors = item ? getAssetColors(item.rarity) : { border: 'border-[var(--border)]', bg: 'bg-[var(--panel-bg)]', text: 'text-[var(--text-muted)]', glow: '', shimmer: '' };

    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot-${slot}` });
    const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
      id: item ? `equipped-${slot}` : `empty-slot-${slot}`,
      disabled: !item,
    });

    const isCompatible = draggedItem && slotAccepts(slot).includes(draggedItem.slot);
    const highlightClass = isOver && isCompatible ? 'ring-2 ring-purple-500 scale-110' :
                           draggedItem && isCompatible ? 'ring-1 ring-purple-500/40 animate-pulse' : '';

    return (
      <div ref={setDropRef} className="relative w-full h-full hover:z-50">
        <div
          ref={setDragRef}
          {...attributes}
          {...listeners}
          className={`w-full h-full min-w-[64px] min-h-[64px] rounded-xl border-2 flex flex-col items-center justify-center relative group transition-all duration-200 ${
            isDragging ? 'opacity-30 scale-90 border-dashed' : 'hover:scale-105 cursor-grab active:cursor-grabbing'
          } ${colors.border} ${colors.bg} ${colors.shimmer} ${colors.glow} ${highlightClass}`}
          onClick={() => !isDragging && item && setInspectItem(item)}
        >
          {item ? (
            <>
              <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-10 h-10" />
              <span className={`text-[8px] font-bold mt-1 truncate w-full text-center px-1 ${colors.text}`}>{item.baseName || item.name.split(' ').slice(-1)[0]}</span>
              {!isDragging && (
                <div className="absolute -top-[4.5rem] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 rounded-lg whitespace-nowrap shadow-xl backdrop-blur-sm">
                  <div className={`text-[11.5px] font-bold ${colors.text}`}>{item.name}</div>
                  <div className="text-[11.5px] text-gray-600 dark:text-gray-400 font-mono">{item.rarity} {slot}</div>
                  <div className="text-[11.5px] text-[var(--text-tertiary)] mt-0.5">{Object.entries(item.stats || {}).map(([k,v]) => `+${v} ${k.slice(0,3).toUpperCase()}`).join('  ')}</div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95 border-b border-r border-white/15 rotate-45"></div>
                </div>
              )}
            </>
          ) : (
            <span className="text-[11.5px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">{
              { HEAD: 'HEAD', HANDS: 'HANDS', RING1: 'RING', RING2: 'RING', AMULET: 'AMUL.', CHEST: 'CHEST', BELT: 'BELT', FEET: 'FEET', WEAPON1: 'WPN 1', WEAPON2: 'WPN 2' }[slot] || slot.slice(0, 4)
            }</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[snapCenterToCursor]} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div key="loadout" className="flex flex-col h-full" style={{ animation: 'tabEnter 0.3s ease-out both' }}>

          {/* TWO-COLUMN: Gear Storage (left) | Avatar + Slots (right) */}
          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">

            {/* LEFT: GEAR STORAGE */}
            <div className="order-2 lg:order-1 lg:w-[45%] flex-shrink-0">
              <InventoryGrid
                inventory={inventory}
                equipped={equipped}
                draggedItem={draggedItem}
                onInspect={setInspectItem}
              />
            </div>

            {/* RIGHT: AVATAR + EQUIPMENT SLOTS */}
            <div className="order-1 lg:order-2 flex-1 bg-[var(--surface-sunken)] rounded-2xl border border-[var(--border)] relative flex flex-col items-center p-4 min-h-[340px] lg:min-h-0">
              <div className="absolute inset-0 rounded-2xl overflow-hidden loadout-hex-bg pointer-events-none"></div>
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 60%, hsla(${(classProfile.appearance?.hue || 0) + 200}, 60%, 25%, 0.3) 0%, transparent 70%)` }}></div>

              {/* Tab switcher */}
              <div className="relative z-10 flex gap-1 bg-black/30 rounded-xl p-1 mb-2 self-center">
                <button
                  type="button"
                  onClick={() => setRightTab('agent')}
                  className={`px-4 py-1.5 rounded-lg text-[11.5px] font-bold uppercase tracking-wider transition-all ${
                    rightTab === 'agent'
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Agent
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('loadout')}
                  className={`px-4 py-1.5 rounded-lg text-[11.5px] font-bold uppercase tracking-wider transition-all ${
                    rightTab === 'loadout'
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Loadout
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('gems')}
                  className={`px-4 py-1.5 rounded-lg text-[11.5px] font-bold uppercase tracking-wider transition-all ${
                    rightTab === 'gems'
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Diamond className="w-3 h-3 inline-block mr-1 -mt-px" />
                  Gems
                </button>
              </div>

              {rightTab === 'agent' ? (
                <>
                  {/* AGENT VIEW — avatar fills the space */}
                  <div className="flex-1 w-full max-w-[280px] relative z-10">
                    {user.gamification?.selectedCharacterModel ? (
                      <Avatar3D
                        characterModelId={user.gamification.selectedCharacterModel}
                        appearance={classProfile.appearance}
                        activeCosmetics={user.gamification?.activeCosmetics}
                        evolutionLevel={level}
                        equipped={equipped}
                      />
                    ) : (
                      <OperativeAvatar
                        equipped={equipped}
                        appearance={classProfile.appearance}
                        evolutionLevel={level}
                        activeCosmetics={user.gamification?.activeCosmetics}
                      />
                    )}
                  </div>
                </>
              ) : rightTab === 'loadout' ? (
                <>
                  {/* LOADOUT VIEW — equipment grid, no avatar */}
                  <div className="flex-1 w-full relative z-10 grid gap-2 p-2" style={{
                    gridTemplateColumns: '1fr 1.2fr 1fr',
                    gridTemplateRows: '1fr 1fr 0.8fr 0.8fr',
                    gridTemplateAreas: `
                      "weapon1  head    weapon2"
                      "weapon1  chest   weapon2"
                      "ring1    ring2   amulet"
                      "hands    belt    feet"
                    `,
                  }}>
                    {ALL_EQUIP_SLOTS.map(slot => (
                      <div key={slot} style={{ gridArea: slot.toLowerCase() }}>
                        <SlotRender slot={slot} />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <GemsPanel gemsInventory={gemsInventory} equipped={equipped} />
              )}

              {rightTab === 'agent' && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCustomize(true);
                  }}
                  className="absolute bottom-6 bg-purple-600/20 hover:bg-purple-600 text-purple-600 dark:text-purple-400 hover:text-white px-4 py-2 rounded-xl text-[11.5px] font-black uppercase tracking-[0.2em] border border-purple-500/30 transition shadow-lg z-[40] flex items-center gap-2"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  Edit DNA Profile
                </button>
              )}
            </div>
          </div>

          {/* COMPACT STATS STRIP — full width below both columns */}
          <div className="mt-3">
            {(() => {
              const combat = deriveCombatStats(playerStats);
              return (
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 bg-[var(--surface-sunken)] rounded-xl px-4 py-2.5 border border-[var(--border)]">
                  <div className="flex items-center gap-1.5 group relative cursor-help">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span className="text-[11.5px] text-[var(--text-tertiary)]">Tech</span>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">{playerStats.tech}</span>
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-44 p-2 bg-black/95 border border-white/10 rounded-lg text-[11.5px] text-gray-300 shadow-xl">
                      <span className="font-bold text-blue-600 dark:text-blue-400">Attack Power</span><br/>Increases damage dealt to bosses.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 group relative cursor-help">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[11.5px] text-[var(--text-tertiary)]">Focus</span>
                    <span className="text-[11px] text-green-600 dark:text-green-400 font-bold">{playerStats.focus}</span>
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-48 p-2 bg-black/95 border border-white/10 rounded-lg text-[11.5px] text-gray-300 shadow-xl">
                      <span className="font-bold text-green-600 dark:text-green-400">Critical Strikes</span><br/>Crit chance: {(combat.critChance * 100).toFixed(0)}% · Crit damage: {combat.critMultiplier.toFixed(2)}x
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 group relative cursor-help">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    <span className="text-[11.5px] text-[var(--text-tertiary)]">Analysis</span>
                    <span className="text-[11px] text-yellow-600 dark:text-yellow-400 font-bold">{playerStats.analysis}</span>
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-44 p-2 bg-black/95 border border-white/10 rounded-lg text-[11.5px] text-gray-300 shadow-xl">
                      <span className="font-bold text-yellow-600 dark:text-yellow-400">Armor</span><br/>Reduces boss damage by {combat.armorPercent.toFixed(0)}%.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 group relative cursor-help">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span className="text-[11.5px] text-[var(--text-tertiary)]">Charisma</span>
                    <span className="text-[11px] text-purple-600 dark:text-purple-400 font-bold">{playerStats.charisma}</span>
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-44 p-2 bg-black/95 border border-white/10 rounded-lg text-[11.5px] text-gray-300 shadow-xl">
                      <span className="font-bold text-purple-600 dark:text-purple-400">Health</span><br/>Max HP: {combat.maxHp}
                    </div>
                  </div>
                  <div className="w-px h-4 bg-[var(--border)] hidden sm:block" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11.5px] text-[var(--text-tertiary)]">HP</span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">{combat.maxHp}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11.5px] text-[var(--text-tertiary)]">Armor</span>
                    <span className="text-[11px] text-yellow-600 dark:text-yellow-400 font-bold">{combat.armorPercent.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11.5px] text-[var(--text-tertiary)]">Crit</span>
                    <span className="text-[11px] text-green-600 dark:text-green-400 font-bold">{(combat.critChance * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }} zIndex={9999}>
          {draggedItem && (() => {
            const colors = getAssetColors(draggedItem.rarity);
            return (
              <div className="drag-overlay-tile rounded-xl pointer-events-none" style={{ willChange: 'transform, box-shadow' }}>
                <div
                  className={`w-[68px] h-[68px] rounded-xl border-2 flex flex-col items-center justify-center backdrop-blur-sm ${colors.bg} ${colors.border} ${colors.glow}`}
                  style={{ filter: 'brightness(1.3) saturate(1.2)' }}
                >
                  <ItemIcon visualId={draggedItem.visualId} slot={draggedItem.slot} rarity={draggedItem.rarity} size="w-9 h-9" />
                  <span className={`text-[8px] font-bold mt-0.5 ${colors.text} drop-shadow-lg`}>{draggedItem.baseName || draggedItem.name.split(' ').slice(-1)[0]}</span>
                </div>
              </div>
            );
          })()}
        </DragOverlay>
      </DndContext>

      {/* Modals */}
      <CustomizeModal
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        equipped={equipped}
        appearance={classProfile.appearance}
        onSave={handleCustomizeSave}
        selectedCharacterModel={user.gamification?.selectedCharacterModel}
        ownedCharacterModels={user.gamification?.ownedCharacterModels}
        onSelectCharacterModel={async (modelId) => {
          try {
            await dataService.selectCharacterModel(user.id, modelId);
          } catch { /* toast handled by dataService */ }
        }}
        activeCosmetics={user.gamification?.activeCosmetics}
      />

      <InspectItemModal
        inspectItem={inspectItem}
        onClose={() => setInspectItem(null)}
        isProcessing={isProcessing}
        currency={currency}
        equipped={equipped}
        gemsInventory={gemsInventory}
        onEquip={handleEquip}
        onUnequip={handleUnequip}
        onDisenchant={handleDisenchant}
        onCraft={handleCraft}
        onAddSocket={handleAddSocket}
        onSocketGem={handleSocketGem}
        onUnsocketGem={handleUnsocketGem}
      />
    </>
  );
};

// ============================================================
// GEMS PANEL
// ============================================================

const GEM_LEGEND: { name: string; stat: string; desc: string; color: string }[] = [
  { name: 'Ruby', stat: 'Tech', desc: 'Attack power', color: '#ef4444' },
  { name: 'Emerald', stat: 'Focus', desc: 'Crit chance & damage', color: '#22c55e' },
  { name: 'Sapphire', stat: 'Analysis', desc: 'Armor rating', color: '#3b82f6' },
  { name: 'Amethyst', stat: 'Charisma', desc: 'Max HP', color: '#a855f7' },
];

interface GemsPanelProps {
  gemsInventory: { id: string; name: string; stat: string; value: number; tier: number; color: string }[];
  equipped: Partial<Record<EquipmentSlot, RPGItem>>;
}

const GemsPanel: React.FC<GemsPanelProps> = ({ gemsInventory, equipped }) => {
  const [codexOpen, setCodexOpen] = useState(false);

  // Active runeword IDs from equipped items
  const activeRunewordIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(equipped).filter(Boolean).forEach(item => {
      const rw = (item as RPGItem).runewordActive;
      if (rw) ids.add(rw);
    });
    return ids;
  }, [equipped]);

  // Group gems by base name (strip tier info)
  const gemGroups = useMemo(() => {
    const groups: Record<string, typeof gemsInventory> = {};
    for (const gem of gemsInventory) {
      const baseName = gem.name.replace(/\s*\(T\d+\)/, '');
      if (!groups[baseName]) groups[baseName] = [];
      groups[baseName].push(gem);
    }
    // Sort each group by tier
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.tier - b.tier);
    }
    return groups;
  }, [gemsInventory]);

  if (gemsInventory.length === 0) {
    return (
      <div className="flex-1 w-full relative z-10 flex flex-col items-center justify-center gap-3 text-center px-6">
        <Diamond className="w-10 h-10 text-gray-700" />
        <p className="text-[11px] text-gray-600 leading-relaxed">
          No gems yet. Earn gems from fortune wheel spins, boss victories, and daily login rewards.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full relative z-10 overflow-y-auto custom-scrollbar px-2 pb-2">
      {/* Gem Purpose Legend */}
      <div className="mb-3 bg-black/20 rounded-lg px-3 py-2 border border-[var(--border)]">
        {GEM_LEGEND.map(g => (
          <div key={g.name} className="flex items-center gap-2 py-0.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
            <span className="text-[11.5px] font-bold" style={{ color: g.color }}>{g.name}</span>
            <span className="text-[11.5px] text-[var(--text-tertiary)] mx-0.5">&rarr;</span>
            <span className="text-[11.5px] text-[var(--text-tertiary)]">{g.stat}</span>
            <span className="text-[11.5px] text-[var(--text-tertiary)] mx-0.5">&mdash;</span>
            <span className="text-[11.5px] text-[var(--text-tertiary)]">{g.desc}</span>
          </div>
        ))}
      </div>

      {/* Gem Collection Grid */}
      <div className="space-y-2 mb-3">
        {Object.entries(gemGroups).map(([baseName, gems]) => {
          const color = gems[0].color;
          // Tier breakdown
          const tierCounts: Record<number, number> = {};
          gems.forEach(g => { tierCounts[g.tier] = (tierCounts[g.tier] || 0) + 1; });

          return (
            <div key={baseName} className="bg-black/20 rounded-lg px-3 py-2 border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }} />
                <span className="text-[11px] font-bold" style={{ color }}>{baseName}</span>
                <span className="text-[11.5px] text-[var(--text-tertiary)] ml-auto">{gems.length} owned</span>
              </div>
              {Object.keys(tierCounts).length > 1 && (
                <div className="flex gap-2 mb-1.5">
                  {Object.entries(tierCounts).sort(([a],[b]) => Number(a) - Number(b)).map(([tier, count]) => (
                    <span key={tier} className="text-[11.5px] text-[var(--text-tertiary)]">T{tier}: {count}</span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {gems.map(gem => (
                  <div key={gem.id} className="flex items-center gap-1 bg-black/30 rounded-md px-2 py-1 border border-[var(--border)]">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: gem.color }} />
                    <span className="text-[11.5px] text-gray-600 dark:text-gray-400">{gem.name}</span>
                    <span className="text-[11.5px] font-bold" style={{ color: gem.color }}>+{gem.value} {gem.stat.slice(0, 3).toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Runeword Codex */}
      <div className="bg-black/20 rounded-lg border border-[var(--border)]">
        <button
          type="button"
          onClick={() => setCodexOpen(!codexOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors"
        >
          Runeword Codex
          {codexOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {codexOpen && (
          <div className="px-3 pb-3 space-y-2">
            {RUNEWORD_DEFINITIONS.map(rw => {
              const isActive = activeRunewordIds.has(rw.id);
              return (
                <div
                  key={rw.id}
                  className={`rounded-lg px-3 py-2 border ${
                    isActive
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-[var(--border)] bg-black/20'
                  }`}
                  style={isActive ? { boxShadow: '0 0 12px rgba(245,158,11,0.15)' } : undefined}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[11px] font-bold ${isActive ? 'text-amber-300' : 'text-gray-300'}`}>{rw.name}</span>
                    {isActive && (
                      <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">ACTIVE</span>
                    )}
                    <span className="text-[11.5px] text-[var(--text-tertiary)] ml-auto">{rw.requiredSockets}s</span>
                  </div>
                  {/* Pattern as colored dots */}
                  <div className="flex items-center gap-1 mb-1">
                    {rw.pattern.map((gemName, i) => {
                      const legend = GEM_LEGEND.find(g => g.name === gemName);
                      return (
                        <div key={i} className="flex items-center gap-0.5">
                          {i > 0 && <span className="text-[8px] text-gray-700">+</span>}
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: legend?.color || '#666' }} />
                          <span className="text-[8px] text-gray-500">{gemName}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Bonus stats */}
                  <div className="flex gap-2 mb-1">
                    {Object.entries(rw.bonusStats).filter(([,v]) => v).map(([stat, val]) => {
                      const legend = GEM_LEGEND.find(g => g.stat.toLowerCase() === stat);
                      return (
                        <span key={stat} className="text-[11.5px] font-bold" style={{ color: legend?.color || '#999' }}>
                          +{val} {stat.slice(0, 3).toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                  {/* Lore */}
                  <p className="text-[11.5px] text-[var(--text-tertiary)] italic leading-relaxed">{rw.lore}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// INVENTORY GRID
// ============================================================

type GearTab = 'ALL' | 'ARMOR' | 'HANDS' | 'JEWELRY' | 'WEAPONS';

const GEAR_TAB_SLOTS: Record<GearTab, ItemSlot[] | null> = {
  ALL: null,
  ARMOR: ['HEAD', 'CHEST', 'BELT', 'FEET'],
  HANDS: ['HANDS'],
  JEWELRY: ['RING', 'AMULET'],
  WEAPONS: ['WEAPON'],
};

interface InventoryGridProps {
  inventory: RPGItem[];
  equipped: Partial<Record<EquipmentSlot, RPGItem>>;
  draggedItem: RPGItem | null;
  onInspect: (item: RPGItem) => void;
}

const InventoryGrid: React.FC<InventoryGridProps> = ({ inventory, equipped, draggedItem, onInspect }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'inventory-zone' });
  const isDroppingEquipped = draggedItem && Object.values(equipped).some(e => (e as RPGItem | null)?.id === draggedItem.id);
  const [activeTab, setActiveTab] = useState<GearTab>('ALL');

  const filteredInventory = activeTab === 'ALL'
    ? inventory
    : inventory.filter(item => GEAR_TAB_SLOTS[activeTab]?.includes(item.slot));

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-[180px] bg-[var(--surface-sunken)] border-2 rounded-2xl p-4 overflow-hidden flex flex-col transition-all duration-200 ${
        isDroppingEquipped ? 'border-purple-500/40 bg-purple-900/5' : isOver ? 'border-purple-500/50 bg-purple-900/10' : 'border-[var(--border)]'
      }`}
    >
      {/* Header row: title + drag hint */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest">
          Gear Storage ({filteredInventory.length})
        </h4>
        <span className="text-[11.5px] text-[var(--text-tertiary)] flex items-center gap-1">
          <GripVertical className="w-3 h-3" /> Drag to equip
        </span>
      </div>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {(['ALL', 'ARMOR', 'HANDS', 'JEWELRY', 'WEAPONS'] as GearTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                : 'text-gray-600 hover:text-gray-400 hover:bg-[var(--surface-glass)] border border-transparent'
            }`}
          >
            {tab === 'ALL' ? 'All' : tab === 'ARMOR' ? 'Armor' : tab === 'HANDS' ? 'Hands' : tab === 'JEWELRY' ? 'Jewelry' : 'Weapons'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-2 md:gap-3 content-start">
        {filteredInventory.map((item) => (
          <DraggableInventoryItem
            key={item.id}
            item={item}
            equipped={equipped}
            onInspect={onInspect}
          />
        ))}
        {Array.from({ length: Math.max(0, 16 - filteredInventory.length) }).map((_, i) => (
          <DroppableEmptyCell key={`empty-${i}`} index={i} isDroppingEquipped={!!isDroppingEquipped} />
        ))}
      </div>
    </div>
  );
};

const DroppableEmptyCell: React.FC<{ index: number; isDroppingEquipped: boolean }> = ({ index, isDroppingEquipped }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `storage-cell-${index}` });
  return (
    <div
      ref={setNodeRef}
      className={`aspect-square rounded-xl border transition-all duration-200 ${
        isOver
          ? 'border-purple-500/60 bg-purple-500/15 scale-105 shadow-lg shadow-purple-500/20'
          : isDroppingEquipped
            ? 'border-purple-500/20 bg-purple-500/5'
            : 'border-[var(--border)] bg-[var(--surface-glass)]'
      }`}
    />
  );
};

interface DraggableInventoryItemProps {
  item: RPGItem;
  equipped: Partial<Record<EquipmentSlot, RPGItem>>;
  onInspect: (item: RPGItem) => void;
}

const DraggableInventoryItem: React.FC<DraggableInventoryItemProps> = ({ item, equipped, onInspect }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  const isEquipped = Object.values(equipped).some((e) => (e as RPGItem | null)?.id === item.id);
  const colors = getAssetColors(item.rarity);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onInspect(item)}
      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center relative group transition-all duration-200 ${
        isDragging ? 'opacity-30 scale-90 border-dashed' : 'cursor-grab active:cursor-grabbing opacity-80 hover:opacity-100 hover:scale-105'
      } ${isEquipped ? 'ring-2 ring-white/50 opacity-100' : ''} ${colors.bg} ${colors.border} ${colors.shimmer} ${isEquipped ? colors.glow : ''}`}
    >
      <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-8 h-8" />
      {isEquipped && (
        <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full shadow-lg"></div>
      )}
      {!isDragging && (
        <div className="absolute -top-[4.5rem] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 rounded-lg whitespace-nowrap shadow-xl backdrop-blur-sm">
          <div className={`text-[11.5px] font-bold ${colors.text}`}>{item.name}</div>
          <div className="text-[11.5px] text-gray-600 dark:text-gray-400 font-mono">{item.rarity} {item.slot}{isEquipped ? ' · EQUIPPED' : ''}</div>
          <div className="text-[11.5px] text-[var(--text-tertiary)] mt-0.5">{Object.entries(item.stats || {}).map(([k,v]) => `+${v} ${k.slice(0,3).toUpperCase()}`).join('  ')}</div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95 border-b border-r border-white/15 rotate-45"></div>
        </div>
      )}
    </div>
  );
};

export default AgentLoadoutTab;

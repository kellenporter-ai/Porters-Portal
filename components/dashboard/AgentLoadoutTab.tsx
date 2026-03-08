import React, { useState, useMemo } from 'react';
import { User, RPGItem, EquipmentSlot, ItemSlot } from '../../types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { User as UserIcon, GripVertical } from 'lucide-react';
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

const LEFT_SLOTS: EquipmentSlot[] = ['HEAD', 'HANDS', 'RING1', 'AMULET'];
const RIGHT_SLOTS: EquipmentSlot[] = ['CHEST', 'BELT', 'FEET', 'RING2'];

const AgentLoadoutTab: React.FC<AgentLoadoutTabProps> = ({ user, activeClass, level }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [inspectItem, setInspectItem] = useState<RPGItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [draggedItem, setDraggedItem] = useState<RPGItem | null>(null);

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

  const radarData = [
    { subject: 'Tech', A: playerStats.tech, fullMark: 100 },
    { subject: 'Focus', A: playerStats.focus, fullMark: 100 },
    { subject: 'Analysis', A: playerStats.analysis, fullMark: 100 },
    { subject: 'Charisma', A: playerStats.charisma, fullMark: 100 },
  ];

  // --- DnD sensors ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const slotAccepts = (equipSlot: EquipmentSlot): ItemSlot[] => {
    if (equipSlot === 'RING1' || equipSlot === 'RING2') return ['RING'];
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
      toast.error('Failed to equip item.');
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
      toast.error('Failed to unequip item.');
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
        toast.error('Failed to salvage item.');
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
      toast.error('Failed to save — try again');
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
    const colors = item ? getAssetColors(item.rarity) : { border: 'border-white/10', bg: 'bg-black/20', text: 'text-gray-600', glow: '', shimmer: '' };

    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot-${slot}` });
    const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
      id: item ? `equipped-${slot}` : `empty-slot-${slot}`,
      disabled: !item,
    });

    const isCompatible = draggedItem && slotAccepts(slot).includes(draggedItem.slot);
    const highlightClass = isOver && isCompatible ? 'ring-2 ring-purple-500 scale-110' :
                           draggedItem && isCompatible ? 'ring-1 ring-purple-500/40 animate-pulse' : '';

    return (
      <div ref={setDropRef} className="relative">
        <div
          ref={setDragRef}
          {...attributes}
          {...listeners}
          className={`w-16 h-16 rounded-xl border-2 flex flex-col items-center justify-center relative group transition-all duration-200 ${
            isDragging ? 'opacity-30 scale-90 border-dashed' : 'hover:scale-110 cursor-grab active:cursor-grabbing'
          } ${colors.border} ${colors.bg} ${colors.shimmer} ${colors.glow} ${highlightClass}`}
          onClick={() => !isDragging && item && setInspectItem(item)}
        >
          {item ? (
            <>
              <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-8 h-8" />
              <span className={`text-[7px] font-bold mt-0.5 truncate w-full text-center px-0.5 ${colors.text}`}>{item.baseName || item.name.split(' ').slice(-1)[0]}</span>
              {!isDragging && (
                <div className="absolute -top-[4.5rem] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 bg-black/95 border border-white/15 px-3 py-2 rounded-lg whitespace-nowrap shadow-xl backdrop-blur-sm">
                  <div className={`text-[10px] font-bold ${colors.text}`}>{item.name}</div>
                  <div className="text-[9px] text-gray-400 font-mono">{item.rarity} {slot}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{Object.entries(item.stats).map(([k,v]) => `+${v} ${k.slice(0,3).toUpperCase()}`).join('  ')}</div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95 border-b border-r border-white/15 rotate-45"></div>
                </div>
              )}
            </>
          ) : (
            <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">{slot.slice(0, 4)}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[snapCenterToCursor]} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div key="loadout" className="flex flex-col h-full" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">

            {/* LEFT: CHARACTER VISUALIZER WITH SLOTS */}
            <div className="bg-black/30 rounded-2xl border border-white/10 relative flex flex-col items-center justify-center p-4 min-h-[400px]">
              <div className="absolute inset-0 rounded-2xl overflow-hidden loadout-hex-bg pointer-events-none"></div>
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 60%, hsla(${(classProfile.appearance?.hue || 0) + 200}, 60%, 25%, 0.3) 0%, transparent 70%)` }}></div>

              <div className="flex w-full h-full relative z-10 justify-between items-center px-4">
                <div className="flex flex-col gap-4">
                  {LEFT_SLOTS.map(slot => <SlotRender key={slot} slot={slot} />)}
                </div>
                <div className="w-40 h-full relative">
                  {user.gamification?.selectedCharacterModel ? (
                    <Avatar3D
                      characterModelId={user.gamification.selectedCharacterModel}
                      activeCosmetics={user.gamification?.activeCosmetics}
                      evolutionLevel={level}
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
                <div className="flex flex-col gap-4">
                  {RIGHT_SLOTS.map(slot => <SlotRender key={slot} slot={slot} />)}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowCustomize(true);
                }}
                className="absolute bottom-6 bg-purple-600/20 hover:bg-purple-600 text-purple-400 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-purple-500/30 transition shadow-lg z-[40] flex items-center gap-2"
              >
                <UserIcon className="w-3.5 h-3.5" />
                Edit DNA Profile
              </button>
            </div>

            {/* RIGHT: STATS */}
            <div className="flex flex-col gap-4">
              <div className="bg-black/20 rounded-2xl p-4 border border-white/5 flex-1 min-h-[200px]">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Performance Radar</h4>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <defs>
                        <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                      <Radar name="Stats" dataKey="A" stroke="#a855f7" strokeWidth={2} fill="url(#radarGradient)" fillOpacity={0.5} animationDuration={800} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Stats Summary */}
              {(() => {
                const combat = deriveCombatStats(playerStats);
                return (
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="group relative flex items-center gap-2 cursor-help">
                        <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                        <span className="text-gray-500">Tech</span>
                        <span className="text-blue-400 font-bold ml-auto">{playerStats.tech}</span>
                        <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-44 p-2 bg-black/95 border border-white/10 rounded-lg text-[10px] text-gray-300 shadow-xl">
                          <span className="font-bold text-blue-400">Attack Power</span><br/>Increases damage dealt to bosses.
                        </div>
                      </div>
                      <div className="group relative flex items-center gap-2 cursor-help">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span className="text-gray-500">Focus</span>
                        <span className="text-green-400 font-bold ml-auto">{playerStats.focus}</span>
                        <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-48 p-2 bg-black/95 border border-white/10 rounded-lg text-[10px] text-gray-300 shadow-xl">
                          <span className="font-bold text-green-400">Critical Strikes</span><br/>Crit chance: {(combat.critChance * 100).toFixed(0)}% &middot; Crit damage: {combat.critMultiplier.toFixed(2)}x
                        </div>
                      </div>
                      <div className="group relative flex items-center gap-2 cursor-help">
                        <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                        <span className="text-gray-500">Analysis</span>
                        <span className="text-yellow-400 font-bold ml-auto">{playerStats.analysis}</span>
                        <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-44 p-2 bg-black/95 border border-white/10 rounded-lg text-[10px] text-gray-300 shadow-xl">
                          <span className="font-bold text-yellow-400">Armor</span><br/>Reduces boss damage by {combat.armorPercent.toFixed(0)}%.
                        </div>
                      </div>
                      <div className="group relative flex items-center gap-2 cursor-help">
                        <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                        <span className="text-gray-500">Charisma</span>
                        <span className="text-purple-400 font-bold ml-auto">{playerStats.charisma}</span>
                        <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-20 w-44 p-2 bg-black/95 border border-white/10 rounded-lg text-[10px] text-gray-300 shadow-xl">
                          <span className="font-bold text-purple-400">Health</span><br/>Max HP: {combat.maxHp}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px] pt-2 border-t border-white/5">
                      <div className="text-center"><span className="text-gray-600 block">HP</span><span className="text-emerald-400 font-bold">{combat.maxHp}</span></div>
                      <div className="text-center"><span className="text-gray-600 block">Armor</span><span className="text-yellow-400 font-bold">{combat.armorPercent.toFixed(0)}%</span></div>
                      <div className="text-center"><span className="text-gray-600 block">Crit</span><span className="text-green-400 font-bold">{(combat.critChance * 100).toFixed(0)}%</span></div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* BOTTOM: INVENTORY GRID */}
          <InventoryGrid
            inventory={inventory}
            equipped={equipped}
            draggedItem={draggedItem}
            onInspect={setInspectItem}
          />
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
// INVENTORY GRID
// ============================================================

interface InventoryGridProps {
  inventory: RPGItem[];
  equipped: Partial<Record<EquipmentSlot, RPGItem>>;
  draggedItem: RPGItem | null;
  onInspect: (item: RPGItem) => void;
}

const InventoryGrid: React.FC<InventoryGridProps> = ({ inventory, equipped, draggedItem, onInspect }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'inventory-zone' });
  const isDroppingEquipped = draggedItem && Object.values(equipped).some(e => (e as RPGItem | null)?.id === draggedItem.id);

  return (
    <div
      ref={setNodeRef}
      className={`mt-6 flex-1 min-h-[250px] bg-black/40 border-2 rounded-2xl p-4 overflow-hidden flex flex-col transition-all duration-200 ${
        isDroppingEquipped ? 'border-purple-500/40 bg-purple-900/5' : isOver ? 'border-purple-500/50 bg-purple-900/10' : 'border-white/10'
      }`}
    >
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
        <span>Gear Storage ({inventory.length})</span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <GripVertical className="w-3 h-3" /> Drag to equip
        </span>
      </h4>
      <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 content-start">
        {inventory.map((item) => (
          <DraggableInventoryItem
            key={item.id}
            item={item}
            equipped={equipped}
            onInspect={onInspect}
          />
        ))}
        {Array.from({ length: Math.max(0, 16 - inventory.length) }).map((_, i) => (
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
            : 'border-white/5 bg-white/5'
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
        <div className="absolute -top-[4.5rem] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 bg-black/95 border border-white/15 px-3 py-2 rounded-lg whitespace-nowrap shadow-xl backdrop-blur-sm">
          <div className={`text-[10px] font-bold ${colors.text}`}>{item.name}</div>
          <div className="text-[9px] text-gray-400 font-mono">{item.rarity} {item.slot}{isEquipped ? ' · EQUIPPED' : ''}</div>
          <div className="text-[9px] text-gray-500 mt-0.5">{Object.entries(item.stats).map(([k,v]) => `+${v} ${k.slice(0,3).toUpperCase()}`).join('  ')}</div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95 border-b border-r border-white/15 rotate-45"></div>
        </div>
      )}
    </div>
  );
};

export default AgentLoadoutTab;

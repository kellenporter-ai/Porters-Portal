import React, { useState, useMemo, useCallback } from 'react';
import { User, RPGItem, EquipmentSlot, ItemRarity, ItemSlot, ItemAffix, ItemEffect, CustomItem } from '../../types';
import { Plus, X, Trash2, Edit3, Package, Sparkles, Copy, Wand2, Save } from 'lucide-react';
import { getAssetColors, calculatePlayerStats, calculateGearScore, getRankDetails, getLevelProgress } from '../../lib/gamification';
import { getClassProfile } from '../../lib/classProfile';
import OperativeAvatar from '../dashboard/OperativeAvatar';
import Avatar3D from '../dashboard/Avatar3D';
import Modal from '../Modal';
import ItemIcon from '../ItemIcon';

// ── Constants ──────────────────────────────────────────────────────────────

const EQUIPMENT_SLOTS: EquipmentSlot[] = ['HEAD', 'CHEST', 'HANDS', 'FEET', 'BELT', 'AMULET', 'RING1', 'RING2'];
const ITEM_SLOTS: ItemSlot[] = ['HEAD', 'CHEST', 'HANDS', 'FEET', 'BELT', 'AMULET', 'RING'];
const RARITIES: ItemRarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'UNIQUE'];
const STAT_KEYS = ['tech', 'focus', 'analysis', 'charisma'] as const;

const STAT_COLORS: Record<string, { bar: string; text: string }> = {
    tech: { bar: 'bg-cyan-500', text: 'text-cyan-400' },
    focus: { bar: 'bg-purple-500', text: 'text-purple-400' },
    analysis: { bar: 'bg-yellow-500', text: 'text-yellow-400' },
    charisma: { bar: 'bg-rose-500', text: 'text-rose-400' },
};

const VISUAL_IDS: Record<string, string[]> = {
    HEAD: ['visor', 'helm', 'band'],
    CHEST: ['vest', 'coat', 'plate'],
    HANDS: ['gloves', 'gauntlets', 'grips'],
    FEET: ['boots', 'treads', 'stabs'],
    BELT: ['belt', 'sash'],
    AMULET: ['chip', 'core'],
    RING: ['ring', 'band'],
};

// ── Blank item template ────────────────────────────────────────────────────

const blankItem = (): RPGItem => ({
    id: Math.random().toString(36).substring(2, 9),
    name: '',
    baseName: '',
    rarity: 'COMMON',
    slot: 'CHEST',
    visualId: 'vest',
    stats: {},
    affixes: [],
    description: '',
    obtainedAt: new Date().toISOString(),
});

// ── Props ──────────────────────────────────────────────────────────────────

interface InspectInventoryModalProps {
    user: User | null;
    onClose: () => void;
    onDeleteItem: (user: User, item: RPGItem, classType?: string) => void;
    onUnequipItem: (user: User, slot: EquipmentSlot, classType?: string) => void;
    onGrantFlux: (user: User, amount: number) => void;
    onGrantItem?: (user: User, item: RPGItem, classType?: string) => void;
    onEditItem?: (user: User, itemId: string, updates: Partial<RPGItem>, classType?: string) => void;
    customItems?: CustomItem[];
}

// ── Component ──────────────────────────────────────────────────────────────

const InspectInventoryModal: React.FC<InspectInventoryModalProps> = ({
    user, onClose, onDeleteItem, onUnequipItem, onGrantFlux, onGrantItem, onEditItem, customItems = []
}) => {
    const [activeClassTab, setActiveClassTab] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<RPGItem | null>(null);
    const [showCreator, setShowCreator] = useState(false);
    const [editingItem, setEditingItem] = useState<RPGItem | null>(null);
    const [showLibrary, setShowLibrary] = useState(false);
    const [fluxInput, setFluxInput] = useState('');

    // ── Class tabs ─────────────────────────────────────────────────────────

    const classTabs = useMemo(() => {
        if (!user) return [];
        const profileKeys = Object.keys(user.gamification?.classProfiles || {});
        if (profileKeys.length > 0) return profileKeys;
        return ['_legacy'];
    }, [user]);

    const selectedClass = activeClassTab && classTabs.includes(activeClassTab) ? activeClassTab : classTabs[0] || '_legacy';

    const profile = useMemo(() => {
        if (!user) return { inventory: [] as RPGItem[], equipped: {} as Partial<Record<EquipmentSlot, RPGItem>>, appearance: { bodyType: 'A' as const, hue: 0 } };
        if (selectedClass === '_legacy') {
            return {
                inventory: user.gamification?.inventory || [],
                equipped: user.gamification?.equipped || {},
                appearance: user.gamification?.appearance || { bodyType: 'A' as const, hue: 0 },
            };
        }
        const cp = getClassProfile(user, selectedClass);
        return { inventory: cp.inventory, equipped: cp.equipped, appearance: cp.appearance };
    }, [user, selectedClass]);

    // ── Computed stats ─────────────────────────────────────────────────────

    const stats = useMemo(() => calculatePlayerStats({ gamification: { ...user?.gamification, equipped: profile.equipped } } as any), [user, profile.equipped]);
    const gearScore = useMemo(() => calculateGearScore(profile.equipped), [profile.equipped]);
    const level = user?.gamification?.level || 1;
    const xp = user?.gamification?.xp || 0;
    const progress = getLevelProgress(xp, level);
    const rank = getRankDetails(level);
    const maxStat = Math.max(...STAT_KEYS.map(k => stats[k]), 50);

    // ── Handlers ───────────────────────────────────────────────────────────

    const handleGrantFluxCustom = useCallback(() => {
        if (!user || !fluxInput) return;
        const amount = parseInt(fluxInput);
        if (isNaN(amount) || amount === 0) return;
        onGrantFlux(user, amount);
        setFluxInput('');
    }, [user, fluxInput, onGrantFlux]);

    const classTypeForApi = selectedClass === '_legacy' ? undefined : selectedClass;

    if (!user) return null;

    return (
        <Modal isOpen={!!user} onClose={onClose} title="Inventory Inspector" maxWidth="max-w-5xl">
            <div className="space-y-4 text-gray-100">

                {/* ═══ TOP: Character Preview + Stats ═══ */}
                <div className="flex gap-4">
                    {/* Avatar */}
                    <div className="w-40 shrink-0">
                        <div className="bg-gradient-to-b from-purple-900/20 to-black/40 rounded-2xl border border-white/5 p-3 flex flex-col items-center">
                            <div className="w-28 h-36">
                                {user.gamification?.selectedCharacterModel ? (
                                    <Avatar3D
                                        characterModelId={user.gamification.selectedCharacterModel}
                                        appearance={profile.appearance}
                                        activeCosmetics={user.gamification?.activeCosmetics}
                                        evolutionLevel={level}
                                    />
                                ) : (
                                    <OperativeAvatar
                                        equipped={profile.equipped as Record<string, { rarity?: string; visualId?: string }>}
                                        appearance={profile.appearance}
                                        evolutionLevel={level}
                                    />
                                )}
                            </div>
                            <div className="text-center mt-2">
                                <div className="text-xs font-black text-white truncate max-w-[140px]">{user.name}</div>
                                <div className="text-[9px] font-bold mt-0.5" style={{ color: rank.tierColor }}>{rank.rankName}</div>
                                <div className="text-[10px] font-black text-purple-400 mt-1">Level {level}</div>
                                <div className="w-full h-1.5 bg-black/40 rounded-full mt-1 overflow-hidden">
                                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                                </div>
                                <div className="text-[8px] text-gray-600 mt-0.5">{xp.toLocaleString()} XP</div>
                            </div>
                        </div>
                    </div>

                    {/* Stats + Info */}
                    <div className="flex-1 space-y-3">
                        {/* Economy row */}
                        <div className="flex gap-3">
                            <div className="flex-1 bg-black/30 rounded-xl border border-white/5 p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Cyber-Flux</div>
                                        <div className="text-2xl font-black text-cyan-400">{(user.gamification?.currency || 0).toLocaleString()}</div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <input
                                            value={fluxInput}
                                            onChange={e => setFluxInput(e.target.value)}
                                            placeholder="±amt"
                                            className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-cyan-500/50"
                                            onKeyDown={e => e.key === 'Enter' && handleGrantFluxCustom()}
                                        />
                                        <button onClick={handleGrantFluxCustom} className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg hover:bg-cyan-500/20 transition" title="Apply"><Plus className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-black/30 rounded-xl border border-white/5 p-3 text-center min-w-[90px]">
                                <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Gear Score</div>
                                <div className="text-2xl font-black text-amber-400">{gearScore}</div>
                            </div>
                            <div className="bg-black/30 rounded-xl border border-white/5 p-3 text-center min-w-[70px]">
                                <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Skill Pts</div>
                                <div className="text-2xl font-black text-emerald-400">{user.gamification?.skillPoints || 0}</div>
                            </div>
                        </div>

                        {/* Combat Stats */}
                        <div className="bg-black/30 rounded-xl border border-white/5 p-3">
                            <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-2">Combat Stats</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                {STAT_KEYS.map(key => (
                                    <div key={key} className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold uppercase w-16 ${STAT_COLORS[key].text}`}>{key}</span>
                                        <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${STAT_COLORS[key].bar}`} style={{ width: `${Math.min(100, (stats[key] / maxStat) * 100)}%` }} />
                                        </div>
                                        <span className="text-[10px] font-mono text-white/80 w-8 text-right">{stats[key]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══ CLASS TABS ═══ */}
                {classTabs.length > 1 && (
                    <div className="flex gap-1.5 bg-black/30 p-1.5 rounded-xl border border-white/5">
                        {classTabs.map(cls => (
                            <button key={cls} onClick={() => { setActiveClassTab(cls); setSelectedItem(null); }}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition cursor-pointer ${selectedClass === cls ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                {cls === '_legacy' ? 'Global' : cls}
                            </button>
                        ))}
                    </div>
                )}

                {/* ═══ ACTIVE LOADOUT ═══ */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            Active Loadout {selectedClass !== '_legacy' && <span className="text-purple-400 ml-1">({selectedClass})</span>}
                        </h4>
                        <span className="text-[9px] text-gray-600 font-mono">{Object.values(profile.equipped).filter(Boolean).length}/8 slots</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {EQUIPMENT_SLOTS.map(slot => {
                            const item = profile.equipped?.[slot];
                            const colors = item ? getAssetColors(item.rarity) : null;
                            const isSelected = selectedItem?.id === item?.id;
                            return (
                                <button
                                    key={slot}
                                    onClick={() => item && setSelectedItem(isSelected ? null : item)}
                                    className={`w-[72px] h-[72px] rounded-xl border-2 flex flex-col items-center justify-center relative group transition cursor-pointer ${
                                        isSelected ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-[#0f0720]' : ''
                                    } ${colors ? colors.border + ' ' + colors.bg : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
                                >
                                    {item ? (
                                        <>
                                            <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-8 h-8" />
                                            <div className={`text-[7px] text-center px-1 font-bold truncate w-full ${colors!.text}`}>{item.name}</div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onUnequipItem(user, slot, classTypeForApi); }}
                                                className="absolute top-[-4px] right-[-4px] bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition shadow-md cursor-pointer"
                                            ><X className="w-2.5 h-2.5" /></button>
                                        </>
                                    ) : (
                                        <span className="text-[8px] text-gray-600">{slot}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ═══ STORED GEAR ═══ */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Stored Gear</h4>
                        <div className="flex gap-1.5">
                            {customItems.length > 0 && (
                                <button onClick={() => { setShowLibrary(!showLibrary); setShowCreator(false); setEditingItem(null); }}
                                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide transition flex items-center gap-1 cursor-pointer ${
                                        showLibrary ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'
                                    }`}><Package className="w-3 h-3" /> Library</button>
                            )}
                            <button onClick={() => { setShowCreator(!showCreator); setShowLibrary(false); setEditingItem(null); }}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide transition flex items-center gap-1 cursor-pointer ${
                                    showCreator ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'
                                }`}><Wand2 className="w-3 h-3" /> Create Item</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-8 gap-1.5">
                        {profile.inventory.map((item) => {
                            const colors = getAssetColors(item.rarity);
                            const isSelected = selectedItem?.id === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedItem(isSelected ? null : item)}
                                    className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center p-1 bg-white/5 transition cursor-pointer ${colors.border} ${
                                        isSelected ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-[#0f0720]' : 'hover:bg-white/10'
                                    }`}
                                >
                                    <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-7 h-7" />
                                    <div className={`text-[7px] font-bold ${colors.text} text-center truncate w-full leading-tight`}>{item.name}</div>
                                </button>
                            );
                        })}
                        {profile.inventory.length === 0 && (
                            <div className="col-span-8 text-center py-6 text-gray-600 text-[10px] italic">Inventory Empty</div>
                        )}
                    </div>
                </div>

                {/* ═══ SELECTED ITEM DETAIL ═══ */}
                {selectedItem && !editingItem && (
                    <ItemDetailPanel
                        item={selectedItem}
                        onEdit={() => setEditingItem({ ...selectedItem })}
                        onDelete={() => { onDeleteItem(user, selectedItem, classTypeForApi); setSelectedItem(null); }}
                        onDuplicate={onGrantItem ? () => {
                            const dupe = { ...selectedItem, id: Math.random().toString(36).substring(2, 9), obtainedAt: new Date().toISOString() };
                            onGrantItem(user, dupe, classTypeForApi);
                        } : undefined}
                    />
                )}

                {/* ═══ ITEM EDITOR ═══ */}
                {editingItem && (
                    <ItemEditorPanel
                        item={editingItem}
                        onChange={setEditingItem}
                        onSave={() => {
                            if (onEditItem) {
                                const { id, ...updates } = editingItem;
                                onEditItem(user, id, updates, classTypeForApi);
                            }
                            setEditingItem(null);
                            setSelectedItem(null);
                        }}
                        onCancel={() => setEditingItem(null)}
                        title="Edit Item"
                    />
                )}

                {/* ═══ ITEM CREATOR ═══ */}
                {showCreator && !editingItem && (
                    <ItemCreatorPanel
                        onGrant={(item) => {
                            if (onGrantItem) onGrantItem(user, item, classTypeForApi);
                            setShowCreator(false);
                        }}
                        onCancel={() => setShowCreator(false)}
                    />
                )}

                {/* ═══ CUSTOM ITEM LIBRARY ═══ */}
                {showLibrary && !editingItem && (
                    <CustomItemLibraryPanel
                        items={customItems}
                        onGrant={(item) => {
                            if (onGrantItem) {
                                const granted: RPGItem = {
                                    ...item,
                                    id: Math.random().toString(36).substring(2, 9),
                                    obtainedAt: new Date().toISOString(),
                                };
                                onGrantItem(user, granted, classTypeForApi);
                            }
                        }}
                    />
                )}
            </div>
        </Modal>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

// ── Item Detail Panel ──────────────────────────────────────────────────────

const ItemDetailPanel: React.FC<{
    item: RPGItem;
    onEdit: () => void;
    onDelete: () => void;
    onDuplicate?: () => void;
}> = ({ item, onEdit, onDelete, onDuplicate }) => {
    const colors = getAssetColors(item.rarity);
    return (
        <div className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-4 space-y-3`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                    <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-10 h-10" />
                    <div>
                        <div className={`text-sm font-black ${colors.text}`}>{item.name}</div>
                        <div className="text-[10px] text-gray-500">{item.rarity} {item.slot} &middot; {item.baseName}</div>
                        {item.description && <div className="text-[10px] text-gray-400 italic mt-1">{item.description}</div>}
                    </div>
                </div>
                <div className="flex gap-1 shrink-0">
                    {onDuplicate && (
                        <button onClick={onDuplicate} className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition cursor-pointer" title="Duplicate to inventory"><Copy className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={onEdit} className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 transition cursor-pointer" title="Edit item"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={onDelete} className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition cursor-pointer" title="Delete item"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
            </div>

            {/* Stats */}
            {Object.keys(item.stats).length > 0 && (
                <div className="flex gap-3">
                    {Object.entries(item.stats).filter(([, v]) => v).map(([key, val]) => (
                        <div key={key} className={`text-[10px] font-bold ${STAT_COLORS[key]?.text || 'text-gray-300'}`}>
                            +{val} {key}
                        </div>
                    ))}
                </div>
            )}

            {/* Affixes */}
            {item.affixes.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Affixes</div>
                    {item.affixes.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px]">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${a.type === 'PREFIX' ? 'bg-blue-500/10 text-blue-400' : a.type === 'SUFFIX' ? 'bg-purple-500/10 text-purple-400' : 'bg-orange-500/10 text-orange-400'}`}>
                                {a.type}
                            </span>
                            <span className="text-white font-bold">{a.name}</span>
                            <span className="text-gray-500">T{a.tier}</span>
                            <span className={`${STAT_COLORS[a.stat]?.text || 'text-gray-300'}`}>+{a.value} {a.stat}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Effects */}
            {item.effects && item.effects.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Special Effects</div>
                    {item.effects.map(eff => (
                        <div key={eff.id} className="flex items-center gap-2 text-[10px]">
                            <Sparkles className="w-3 h-3 text-orange-400" />
                            <span className="text-orange-300 font-bold">{eff.name}</span>
                            <span className="text-gray-400">{eff.description}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Sockets & Gems */}
            {(item.sockets ?? 0) > 0 && (
                <div className="flex items-center gap-2">
                    <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Sockets</div>
                    <div className="flex gap-1">
                        {Array.from({ length: item.sockets || 0 }).map((_, i) => {
                            const gem = item.gems?.[i];
                            return (
                                <div key={i} className={`w-5 h-5 rounded-full border ${gem ? 'border-white/20' : 'border-white/10 bg-black/30'}`}
                                     style={gem ? { backgroundColor: gem.color } : undefined}
                                     title={gem ? `${gem.name} (+${gem.value} ${gem.stat})` : 'Empty socket'} />
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="text-[8px] text-gray-600">
                ID: {item.id} &middot; Obtained: {new Date(item.obtainedAt).toLocaleDateString()} &middot; Visual: {item.visualId}
            </div>
        </div>
    );
};

// ── Item Editor Panel ──────────────────────────────────────────────────────

const ItemEditorPanel: React.FC<{
    item: RPGItem;
    onChange: (item: RPGItem) => void;
    onSave: () => void;
    onCancel: () => void;
    title: string;
}> = ({ item, onChange, onSave, onCancel, title }) => {
    const update = (patch: Partial<RPGItem>) => onChange({ ...item, ...patch });
    const updateStat = (key: string, val: number) => onChange({ ...item, stats: { ...item.stats, [key]: val || undefined } });
    const updateAffix = (idx: number, patch: Partial<ItemAffix>) => {
        const newAffixes = [...item.affixes];
        newAffixes[idx] = { ...newAffixes[idx], ...patch };
        onChange({ ...item, affixes: newAffixes });
    };
    const removeAffix = (idx: number) => onChange({ ...item, affixes: item.affixes.filter((_, i) => i !== idx) });
    const addAffix = () => onChange({ ...item, affixes: [...item.affixes, { name: '', type: 'PREFIX', stat: 'tech', value: 10, tier: 1 }] });
    const updateEffect = (idx: number, patch: Partial<ItemEffect>) => {
        const newEffects = [...(item.effects || [])];
        newEffects[idx] = { ...newEffects[idx], ...patch };
        onChange({ ...item, effects: newEffects });
    };
    const removeEffect = (idx: number) => onChange({ ...item, effects: (item.effects || []).filter((_, i) => i !== idx) });
    const addEffect = () => onChange({ ...item, effects: [...(item.effects || []), { id: Math.random().toString(36).substring(2, 6), name: '', description: '', type: 'SPECIAL' as const }] });

    const colors = getAssetColors(item.rarity);

    return (
        <div className={`rounded-xl border-2 ${colors.border} bg-black/40 p-4 space-y-3`}>
            <div className="flex items-center justify-between">
                <h4 className={`text-xs font-bold ${colors.text} uppercase tracking-widest`}>{title}</h4>
                <div className="flex gap-1.5">
                    <button onClick={onCancel} className="px-3 py-1 text-[10px] text-gray-400 hover:text-white transition cursor-pointer">Cancel</button>
                    <button onClick={onSave} className="px-3 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-500 transition flex items-center gap-1 cursor-pointer"><Save className="w-3 h-3" /> Save</button>
                </div>
            </div>

            {/* Basic Fields */}
            <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                    <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Item Name</label>
                    <input value={item.name} onChange={e => update({ name: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                    <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Base Name</label>
                    <input value={item.baseName} onChange={e => update({ baseName: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
                <div>
                    <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Rarity</label>
                    <select value={item.rarity} onChange={e => update({ rarity: e.target.value as ItemRarity })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none cursor-pointer">
                        {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Slot</label>
                    <select value={item.slot} onChange={e => update({ slot: e.target.value as ItemSlot, visualId: VISUAL_IDS[e.target.value]?.[0] || item.visualId })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none cursor-pointer">
                        {ITEM_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Visual</label>
                    <select value={item.visualId} onChange={e => update({ visualId: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none cursor-pointer">
                        {(VISUAL_IDS[item.slot] || []).map(v => <option key={v} value={v}>{v}</option>)}
                        {!VISUAL_IDS[item.slot]?.includes(item.visualId) && <option value={item.visualId}>{item.visualId}</option>}
                    </select>
                </div>
                <div>
                    <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Sockets</label>
                    <input type="number" min={0} max={3} value={item.sockets || 0} onChange={e => update({ sockets: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none" />
                </div>
            </div>

            {/* Stats */}
            <div>
                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-1">Stats</label>
                <div className="grid grid-cols-4 gap-2">
                    {STAT_KEYS.map(key => (
                        <div key={key}>
                            <label className={`block text-[8px] uppercase font-bold mb-0.5 ${STAT_COLORS[key].text}`}>{key}</label>
                            <input type="number" value={item.stats[key] || ''} onChange={e => updateStat(key, parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Description */}
            <div>
                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Description</label>
                <input value={item.description} onChange={e => update({ description: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50" placeholder="A custom forged item..." />
            </div>

            {/* Affixes */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] text-gray-500 uppercase font-bold">Affixes</label>
                    <button onClick={addAffix} className="text-[9px] text-emerald-400 hover:text-emerald-300 transition flex items-center gap-0.5 cursor-pointer"><Plus className="w-3 h-3" /> Add</button>
                </div>
                {item.affixes.map((a, i) => (
                    <div key={i} className="flex items-center gap-1.5 mb-1">
                        <select value={a.type} onChange={e => updateAffix(i, { type: e.target.value as 'PREFIX' | 'SUFFIX' | 'UNIQUE' })} className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white cursor-pointer">
                            <option value="PREFIX">PREFIX</option>
                            <option value="SUFFIX">SUFFIX</option>
                            <option value="UNIQUE">UNIQUE</option>
                        </select>
                        <input value={a.name} onChange={e => updateAffix(i, { name: e.target.value })} placeholder="Name" className="flex-1 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white focus:outline-none" />
                        <select value={a.stat} onChange={e => updateAffix(i, { stat: e.target.value })} className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white cursor-pointer">
                            {STAT_KEYS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input type="number" value={a.value} onChange={e => updateAffix(i, { value: parseInt(e.target.value) || 0 })} className="w-12 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white text-center focus:outline-none" />
                        <input type="number" value={a.tier} onChange={e => updateAffix(i, { tier: parseInt(e.target.value) || 1 })} className="w-10 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white text-center focus:outline-none" placeholder="T" />
                        <button onClick={() => removeAffix(i)} className="p-0.5 text-red-400 hover:text-red-300 cursor-pointer"><X className="w-3 h-3" /></button>
                    </div>
                ))}
            </div>

            {/* Effects */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] text-gray-500 uppercase font-bold">Effects</label>
                    <button onClick={addEffect} className="text-[9px] text-orange-400 hover:text-orange-300 transition flex items-center gap-0.5 cursor-pointer"><Plus className="w-3 h-3" /> Add</button>
                </div>
                {(item.effects || []).map((eff, i) => (
                    <div key={i} className="flex items-center gap-1.5 mb-1">
                        <input value={eff.name} onChange={e => updateEffect(i, { name: e.target.value })} placeholder="Effect name" className="w-32 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white focus:outline-none" />
                        <input value={eff.description} onChange={e => updateEffect(i, { description: e.target.value })} placeholder="Description" className="flex-1 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white focus:outline-none" />
                        <select value={eff.type} onChange={e => updateEffect(i, { type: e.target.value as 'XP_BOOST' | 'STAT_BOOST' | 'SPECIAL' })} className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white cursor-pointer">
                            <option value="SPECIAL">SPECIAL</option>
                            <option value="XP_BOOST">XP_BOOST</option>
                            <option value="STAT_BOOST">STAT_BOOST</option>
                        </select>
                        <button onClick={() => removeEffect(i)} className="p-0.5 text-red-400 hover:text-red-300 cursor-pointer"><X className="w-3 h-3" /></button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Item Creator Panel ─────────────────────────────────────────────────────

const ItemCreatorPanel: React.FC<{
    onGrant: (item: RPGItem) => void;
    onCancel: () => void;
}> = ({ onGrant, onCancel }) => {
    const [item, setItem] = useState<RPGItem>(blankItem);

    return (
        <ItemEditorPanel
            item={item}
            onChange={setItem}
            onSave={() => {
                const finalItem = {
                    ...item,
                    name: item.name || `${item.baseName || 'Custom Item'}`,
                    obtainedAt: new Date().toISOString(),
                };
                onGrant(finalItem);
                setItem(blankItem());
            }}
            onCancel={onCancel}
            title="Create & Grant New Item"
        />
    );
};

// ── Custom Item Library Panel ──────────────────────────────────────────────

const CustomItemLibraryPanel: React.FC<{
    items: CustomItem[];
    onGrant: (item: CustomItem) => void;
}> = ({ items, onGrant }) => {
    const [search, setSearch] = useState('');
    const filtered = useMemo(() => {
        const lower = search.toLowerCase();
        return items.filter(i => !search || i.name.toLowerCase().includes(lower) || i.rarity.toLowerCase().includes(lower) || i.slot.toLowerCase().includes(lower));
    }, [items, search]);

    return (
        <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Custom Item Library</h4>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-40 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-amber-500/50" />
            </div>
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                {filtered.map(item => {
                    const colors = getAssetColors(item.rarity);
                    return (
                        <div key={item.id} className={`rounded-lg border ${colors.border} ${colors.bg} p-2 flex flex-col gap-1 items-center`}>
                            <ItemIcon visualId={item.visualId} slot={item.slot} rarity={item.rarity} size="w-8 h-8" />
                            <div className={`text-[9px] font-bold ${colors.text} truncate w-full text-center`}>{item.name}</div>
                            <div className="text-[8px] text-gray-500">{item.rarity} {item.slot}</div>
                            {Object.entries(item.stats).filter(([, v]) => v).map(([k, v]) => (
                                <div key={k} className={`text-[8px] ${STAT_COLORS[k]?.text || 'text-gray-400'}`}>+{v} {k}</div>
                            ))}
                            <button onClick={() => onGrant(item)} className="mt-auto text-[8px] font-bold text-emerald-400 bg-emerald-500/10 rounded px-2 py-1 hover:bg-emerald-500/20 transition cursor-pointer">
                                Grant
                            </button>
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <div className="col-span-4 text-center py-4 text-gray-500 text-[10px] italic">
                        {items.length === 0 ? 'No custom items yet. Create items in the Item Library tab.' : 'No items match search.'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default InspectInventoryModal;

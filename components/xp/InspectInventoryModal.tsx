import React from 'react';
import { User, RPGItem, EquipmentSlot } from '../../types';
import { Plus, X, Trash2 } from 'lucide-react';
import { getAssetColors } from '../../lib/gamification';
import Modal from '../Modal';

interface InspectInventoryModalProps {
    user: User | null;
    onClose: () => void;
    onDeleteItem: (user: User, item: RPGItem) => void;
    onUnequipItem: (user: User, slot: EquipmentSlot) => void;
    onGrantFlux: (user: User, amount: number) => void;
}

const EQUIPMENT_SLOTS: EquipmentSlot[] = ['HEAD', 'CHEST', 'HANDS', 'FEET', 'BELT', 'AMULET', 'RING1', 'RING2'];

const InspectInventoryModal: React.FC<InspectInventoryModalProps> = ({ user, onClose, onDeleteItem, onUnequipItem, onGrantFlux }) => {
    if (!user) return null;
    
    return (
        <Modal isOpen={!!user} onClose={onClose} title="Inventory Inspection" maxWidth="max-w-2xl">
            <div className="space-y-6 text-gray-100 p-2">
                <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-4">
                        <img src={user.avatarUrl} className="w-14 h-14 rounded-2xl border border-white/10" alt={user.name} />
                        <div>
                            <h3 className="font-bold text-white text-lg">{user.name}</h3>
                            <div className="text-[10px] font-black text-purple-400 mt-1 uppercase tracking-tighter">Level {user.gamification?.level || 1}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Cyber-Flux</div>
                            <div className="text-xl font-black text-cyan-400">{user.gamification?.currency || 0}</div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => onGrantFlux(user, 100)} className="p-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20" title="+100 Flux"><Plus className="w-4 h-4"/></button>
                            <button onClick={() => onGrantFlux(user, -100)} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20" title="-100 Flux"><X className="w-4 h-4"/></button>
                        </div>
                    </div>
                </div>

                {/* EQUIPPED SECTION */}
                <div className="border-b border-white/5 pb-6">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Active Loadout</h4>
                    <div className="flex gap-2 flex-wrap">
                        {EQUIPMENT_SLOTS.map(slot => {
                            const item = user.gamification?.equipped?.[slot];
                            return (
                                <div key={slot} className={`w-16 h-16 rounded-xl border flex items-center justify-center relative group ${item ? getAssetColors(item.rarity).border + ' ' + getAssetColors(item.rarity).bg : 'border-white/10 bg-black/20'}`}>
                                    {item ? (
                                        <>
                                          <div className="text-[8px] text-center px-1 font-bold truncate w-full text-white/90">{item.name}</div>
                                          <button onClick={() => onUnequipItem(user, slot)} className="absolute top-[-5px] right-[-5px] bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-md"><X className="w-3 h-3" /></button>
                                        </>
                                    ) : <span className="text-[8px] text-gray-600">{slot}</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Stored Gear</h4>
                    <div className="grid grid-cols-6 gap-2">
                        {user.gamification?.inventory?.map((item, i) => (
                            <div key={i} className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center relative group p-1 bg-white/5 ${getAssetColors(item.rarity).border}`}>
                                <div className={`text-[8px] font-bold ${getAssetColors(item.rarity).text} text-center truncate w-full`}>{item.name}</div>
                                <div className="text-[8px] text-gray-500">{item.slot}</div>
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-xl">
                                    <button onClick={() => onDeleteItem(user, item)} className="p-2 text-red-400 hover:text-red-200">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {(user.gamification?.inventory?.length || 0) === 0 && (
                            <div className="col-span-6 text-center py-8 text-gray-500 italic">Inventory Empty</div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default InspectInventoryModal;

import React from 'react';
import { ItemRarity } from '../../types';
import Modal from '../Modal';

export interface MissionFormState {
    title: string;
    description: string;
    xpReward: number;
    fluxReward: number;
    type: string;
    lootRarity: ItemRarity | '';
    startsAt: string;
    durationHours: number;
    techReq: number;
    focusReq: number;
    analysisReq: number;
    charismaReq: number;
    dieSides: number;
    consequence: string;
    isGroup: boolean;
}

export const INITIAL_MISSION_STATE: MissionFormState = {
    title: '',
    description: '',
    xpReward: 250,
    fluxReward: 50,
    type: 'ENGAGEMENT',
    lootRarity: '' as ItemRarity | '',
    startsAt: '',
    durationHours: 0,
    techReq: 0,
    focusReq: 0,
    analysisReq: 0,
    charismaReq: 0,
    dieSides: 20,
    consequence: '',
    isGroup: false
};

interface MissionFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    form: MissionFormState;
    setForm: (form: MissionFormState) => void;
    onSubmit: (e: React.FormEvent) => void;
    isSubmitting: boolean;
}

const MissionFormModal: React.FC<MissionFormModalProps> = ({ isOpen, onClose, form, setForm, onSubmit, isSubmitting }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Issue New Mission Objective">
            <form onSubmit={onSubmit} className="space-y-4 text-gray-200 p-2">
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Mission Codename</label>
                    <input 
                        value={form.title} 
                        onChange={e => setForm({...form, title: e.target.value})}
                        required 
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold placeholder-gray-600 focus:border-purple-500 focus:outline-none" 
                        placeholder="e.g. Operation Lab Rat" 
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Objective Briefing</label>
                    <textarea 
                        value={form.description} 
                        onChange={e => setForm({...form, description: e.target.value})}
                        required 
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-gray-600 resize-none h-20 focus:border-purple-500 focus:outline-none" 
                        placeholder="Brief the operatives on their goal..." 
                    />
                </div>
                
                {/* Rewards Section */}
                <div className="grid grid-cols-3 gap-3 bg-green-900/20 p-3 rounded-xl border border-green-500/30">
                    <div className="col-span-3 text-[10px] font-bold text-green-400 uppercase">Mission Bounties</div>
                    <div>
                        <label className="block text-[9px] text-gray-500 uppercase font-bold">XP</label>
                        <input 
                            type="number" 
                            value={form.xpReward} 
                            onChange={e => setForm({...form, xpReward: parseInt(e.target.value)})}
                            className="w-full p-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm" 
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] text-gray-500 uppercase font-bold">Flux</label>
                        <input 
                            type="number" 
                            value={form.fluxReward} 
                            onChange={e => setForm({...form, fluxReward: parseInt(e.target.value)})}
                            className="w-full p-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm" 
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] text-gray-500 uppercase font-bold">Loot Drop</label>
                        <select 
                            value={form.lootRarity} 
                            onChange={e => setForm({...form, lootRarity: e.target.value as ItemRarity})}
                            className="w-full p-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm appearance-none"
                        >
                            <option value="">None</option>
                            <option value="COMMON">Common</option>
                            <option value="UNCOMMON">Uncommon</option>
                            <option value="RARE">Rare</option>
                            <option value="UNIQUE">Unique</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Objective Category</label>
                        <select 
                            value={form.type} 
                            onChange={e => setForm({...form, type: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold focus:border-purple-500 focus:outline-none"
                        >
                            <option value="REVIEW_QUESTIONS">Answer Review Questions</option>
                            <option value="ENGAGEMENT">Resource Engagement Time</option>
                            <option value="STUDY_MATERIAL">Study Material Reading</option>
                            <option value="SKILL_CHECK">Agent Skill Check</option>
                            <option value="CUSTOM">Manual Verification</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Starts At</label>
                        <input 
                            type="datetime-local" 
                            value={form.startsAt} 
                            onChange={e => setForm({...form, startsAt: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold focus:border-purple-500 focus:outline-none" 
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Duration (Hours)</label>
                        <input 
                            type="number" 
                            value={form.durationHours} 
                            onChange={e => setForm({...form, durationHours: parseInt(e.target.value)})}
                            placeholder="0 (Infinite)" 
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold focus:border-purple-500 focus:outline-none" 
                        />
                    </div>
                </div>
                
                <div className="border-t border-white/10 pt-4">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-3 px-1">Skill Check Parameters (Optional)</label>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                        <div><input type="number" placeholder="Tech" value={form.techReq || ''} onChange={e => setForm({...form, techReq: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" /></div>
                        <div><input type="number" placeholder="Focus" value={form.focusReq || ''} onChange={e => setForm({...form, focusReq: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" /></div>
                        <div><input type="number" placeholder="Analysis" value={form.analysisReq || ''} onChange={e => setForm({...form, analysisReq: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" /></div>
                        <div><input type="number" placeholder="Charisma" value={form.charismaReq || ''} onChange={e => setForm({...form, charismaReq: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[9px] text-gray-500 uppercase font-bold">Failure Die (D-X)</label>
                            <input type="number" value={form.dieSides} onChange={e => setForm({...form, dieSides: parseInt(e.target.value)})} className="w-full p-2 bg-black/40 border border-white/10 rounded-lg text-white" />
                        </div>
                        <div>
                            <label className="text-[9px] text-gray-500 uppercase font-bold">Consequence Text</label>
                            <input type="text" value={form.consequence} onChange={e => setForm({...form, consequence: e.target.value})} placeholder="e.g. detention" className="w-full p-2 bg-black/40 border border-white/10 rounded-lg text-white" />
                        </div>
                    </div>
                    <div className="mt-3">
                        <label className="flex items-center gap-2 text-sm text-gray-400">
                            <input type="checkbox" checked={form.isGroup} onChange={e => setForm({...form, isGroup: e.target.checked})} className="rounded bg-black/40 border-white/10 text-purple-600" /> Group Mission (Requires multiple agents)
                        </label>
                    </div>
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full bg-purple-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:bg-purple-700 disabled:opacity-50">
                    {isSubmitting ? 'Transmitting...' : 'Broadcast Mission'}
                </button>
            </form>
        </Modal>
    );
};

export default MissionFormModal;

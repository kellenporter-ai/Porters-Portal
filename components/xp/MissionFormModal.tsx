import React from 'react';
import { ItemRarity, DefaultClassTypes } from '../../types';
import Modal from '../Modal';
import SectionPicker from '../SectionPicker';

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
    targetClass: string;
    targetSections: string[];
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
    isGroup: false,
    targetClass: '',
    targetSections: []
};

interface MissionFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    form: MissionFormState;
    setForm: (form: MissionFormState) => void;
    onSubmit: (e: React.FormEvent) => void;
    onSaveDraft?: () => void;
    isSubmitting: boolean;
    availableSections?: string[];
}

const MissionFormModal: React.FC<MissionFormModalProps> = ({ isOpen, onClose, form, setForm, onSubmit, onSaveDraft, isSubmitting, availableSections = [] }) => {
    const isSkillCheck = form.type === 'SKILL_CHECK';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Issue New Mission Objective">
            <form onSubmit={onSubmit} className="space-y-4 text-gray-200 p-2">
                {/* Identity */}
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

                {/* Configuration: Type, Class, Timing */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Category</label>
                        <select
                            value={form.type}
                            onChange={e => setForm({...form, type: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold focus:border-purple-500 focus:outline-none"
                        >
                            <option value="ENGAGEMENT">Resource Engagement</option>
                            <option value="REVIEW_QUESTIONS">Review Questions</option>
                            <option value="STUDY_MATERIAL">Study Material</option>
                            <option value="SKILL_CHECK">Skill Check</option>
                            <option value="CUSTOM">Manual Verification</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Target Class</label>
                        <select
                            value={form.targetClass}
                            onChange={e => setForm({...form, targetClass: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold focus:border-purple-500 focus:outline-none"
                        >
                            <option value="">All Classes</option>
                            {Object.values(DefaultClassTypes).filter(c => c !== 'Uncategorized').map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <SectionPicker availableSections={availableSections} selectedSections={form.targetSections} onChange={s => setForm({...form, targetSections: s})} />

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Starts At <span className="text-gray-600 normal-case">(optional)</span></label>
                        <input
                            type="datetime-local"
                            value={form.startsAt}
                            onChange={e => setForm({...form, startsAt: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Duration <span className="text-gray-600 normal-case">(hours, 0 = no limit)</span></label>
                        <input
                            type="number"
                            value={form.durationHours || ''}
                            onChange={e => setForm({...form, durationHours: parseInt(e.target.value) || 0})}
                            placeholder="No time limit"
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Rewards */}
                <div className="grid grid-cols-3 gap-3 bg-green-900/20 p-3 rounded-xl border border-green-500/30">
                    <div className="col-span-3 text-[10px] font-bold text-green-400 uppercase">Rewards</div>
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

                {/* Options */}
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                        <input type="checkbox" checked={form.isGroup} onChange={e => setForm({...form, isGroup: e.target.checked})} className="rounded bg-black/40 border-white/10 text-purple-600" />
                        Group Mission
                    </label>
                </div>

                {/* Skill Check Parameters — only shown when type is SKILL_CHECK */}
                {isSkillCheck && (
                    <div className="border border-orange-500/30 bg-orange-900/10 rounded-xl p-4 space-y-3">
                        <div className="text-[10px] font-bold text-orange-400 uppercase">Skill Check Parameters</div>
                        <div className="grid grid-cols-4 gap-2">
                            <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold text-center mb-1">Tech</label>
                                <input type="number" value={form.techReq || ''} onChange={e => setForm({...form, techReq: parseInt(e.target.value) || 0})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" />
                            </div>
                            <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold text-center mb-1">Focus</label>
                                <input type="number" value={form.focusReq || ''} onChange={e => setForm({...form, focusReq: parseInt(e.target.value) || 0})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" />
                            </div>
                            <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold text-center mb-1">Analysis</label>
                                <input type="number" value={form.analysisReq || ''} onChange={e => setForm({...form, analysisReq: parseInt(e.target.value) || 0})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" />
                            </div>
                            <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold text-center mb-1">Charisma</label>
                                <input type="number" value={form.charismaReq || ''} onChange={e => setForm({...form, charismaReq: parseInt(e.target.value) || 0})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-1">Salvation Die (D-X)</label>
                                <input type="number" value={form.dieSides} onChange={e => setForm({...form, dieSides: parseInt(e.target.value)})} className="w-full p-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-1">Failure Consequence</label>
                                <input type="text" value={form.consequence} onChange={e => setForm({...form, consequence: e.target.value})} placeholder="e.g. detention" className="w-full p-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm" />
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    {onSaveDraft && (
                        <button type="button" disabled={isSubmitting} onClick={onSaveDraft} className="flex-1 bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-50">Save Draft</button>
                    )}
                    <button type="submit" disabled={isSubmitting} className="flex-[2] bg-purple-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:bg-purple-700 disabled:opacity-50">
                        {isSubmitting ? 'Transmitting...' : 'Broadcast Mission'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default MissionFormModal;

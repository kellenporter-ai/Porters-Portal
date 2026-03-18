import React, { useMemo, useState, useEffect } from 'react';
import { ItemRarity, CustomItem } from '../../types';
import { getAssetColors } from '../../lib/gamification';
import { dataService } from '../../services/dataService';
import { useClassConfig } from '../../lib/AppDataContext';
import Modal from '../Modal';
import SectionPicker from '../SectionPicker';
import { Save, FolderOpen, Copy, Trash2 } from 'lucide-react';

export interface MissionFormState {
    title: string;
    description: string;
    xpReward: number;
    fluxReward: number;
    type: string;
    lootRarity: ItemRarity | '';
    customItemRewardId: string;
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
    customItemRewardId: '',
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

interface QuestTemplate {
    id: string;
    name: string;
    form: MissionFormState;
    createdAt: string;
}

interface MissionFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    form: MissionFormState;
    setForm: (form: MissionFormState) => void;
    onSubmit: (e: React.FormEvent) => void;
    onSaveDraft?: () => void;
    isSubmitting: boolean;
    availableSections?: string[];
    customItems?: CustomItem[];
}

const MissionFormModal: React.FC<MissionFormModalProps> = ({ isOpen, onClose, form, setForm, onSubmit, onSaveDraft, isSubmitting, availableSections = [], customItems = [] }) => {
    const { classConfigs } = useClassConfig();
    const classOptions = classConfigs.length > 0 ? classConfigs.map(c => c.className) : ['AP Physics', 'Honors Physics', 'Forensic Science'];
    const isSkillCheck = form.type === 'SKILL_CHECK';
    const [templates, setTemplates] = useState<QuestTemplate[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const unsub = dataService.subscribeToQuestTemplates((docs: any[]) => {
            setTemplates(docs.map(d => ({ id: d.id, name: d.name, form: d.form, createdAt: d.createdAt })));
        });
        return () => unsub();
    }, [isOpen]);

    const handleSaveAsTemplate = async () => {
        if (!templateName.trim()) return;
        await dataService.saveQuestTemplate({
            id: Math.random().toString(36).substring(2, 9),
            name: templateName.trim(),
            form: { ...form, startsAt: '', targetSections: [] },
            createdAt: new Date().toISOString(),
        });
        setTemplateName('');
        setShowSaveTemplate(false);
    };

    const handleLoadTemplate = (template: QuestTemplate) => {
        setForm({ ...template.form, startsAt: '', targetSections: [] });
        setShowTemplates(false);
    };

    const handleDeleteTemplate = async (id: string) => {
        await dataService.deleteQuestTemplate(id);
    };

    const selectedCustomItem = useMemo(() => customItems.find(i => i.id === form.customItemRewardId), [customItems, form.customItemRewardId]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Issue New Mission Objective">
            <form onSubmit={onSubmit} className="space-y-4 text-[var(--text-secondary)] p-2">
                {/* Template Actions Bar */}
                <div className="flex gap-2 items-center">
                    <button
                        type="button"
                        onClick={() => { setShowTemplates(!showTemplates); setShowSaveTemplate(false); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg text-[10px] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition"
                    >
                        <FolderOpen className="w-3 h-3" /> Load Template
                        {templates.length > 0 && <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-[9px]">{templates.length}</span>}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowSaveTemplate(!showSaveTemplate); setShowTemplates(false); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg text-[10px] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition"
                    >
                        <Save className="w-3 h-3" /> Save as Template
                    </button>
                </div>

                {/* Template browser */}
                {showTemplates && (
                    <div className="border border-purple-500/20 bg-purple-900/10 rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
                        <div className="text-[10px] font-bold text-purple-400 uppercase">Mission Templates</div>
                        {templates.length === 0 && <p className="text-[10px] text-[var(--text-muted)] italic">No templates saved yet. Create a mission and save it as a template.</p>}
                        {templates.map(t => (
                            <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--panel-bg)] border border-[var(--border)] hover:border-purple-500/20 transition">
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleLoadTemplate(t)}>
                                    <div className="text-xs font-bold text-[var(--text-primary)] truncate">{t.name}</div>
                                    <div className="text-[9px] text-[var(--text-muted)]">{t.form.type} — +{t.form.xpReward} XP — {t.form.targetClass || 'All Classes'}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleLoadTemplate(t)}
                                    className="p-1 text-purple-400 hover:text-purple-300 transition"
                                    title="Load template"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteTemplate(t.id)}
                                    className="p-1 text-[var(--text-muted)] hover:text-red-400 transition"
                                    title="Delete template"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Save template form */}
                {showSaveTemplate && (
                    <div className="border border-green-500/20 bg-green-900/10 rounded-xl p-3 flex gap-2 items-end">
                        <div className="flex-1">
                            <label className="block text-[9px] text-green-400 uppercase font-bold mb-1">Template Name</label>
                            <input
                                type="text"
                                value={templateName}
                                onChange={e => setTemplateName(e.target.value)}
                                placeholder="e.g. Weekly Engagement"
                                className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg p-2 text-[var(--text-primary)] text-sm focus:border-green-500 focus:outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleSaveAsTemplate}
                            disabled={!templateName.trim()}
                            className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-500 transition disabled:opacity-50"
                        >
                            Save
                        </button>
                    </div>
                )}

                {/* Identity */}
                <div>
                    <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1 px-1">Mission Codename</label>
                    <input
                        value={form.title}
                        onChange={e => setForm({...form, title: e.target.value})}
                        required
                        className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] font-bold placeholder-[var(--text-muted)] focus:border-purple-500 focus:outline-none"
                        placeholder="e.g. Operation Lab Rat"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1 px-1">Objective Briefing</label>
                    <textarea
                        value={form.description}
                        onChange={e => setForm({...form, description: e.target.value})}
                        required
                        className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none h-20 focus:border-purple-500 focus:outline-none"
                        placeholder="Brief the operatives on their goal..."
                    />
                </div>

                {/* Configuration: Type, Class, Timing */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1 px-1">Category</label>
                        <select
                            value={form.type}
                            onChange={e => setForm({...form, type: e.target.value})}
                            className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] font-bold focus:border-purple-500 focus:outline-none"
                        >
                            <option value="ENGAGEMENT">Resource Engagement</option>
                            <option value="REVIEW_QUESTIONS">Review Questions</option>
                            <option value="STUDY_MATERIAL">Study Material</option>
                            <option value="SKILL_CHECK">Skill Check</option>
                            <option value="CUSTOM">Manual Verification</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1 px-1">Target Class</label>
                        <select
                            value={form.targetClass}
                            onChange={e => setForm({...form, targetClass: e.target.value, targetSections: []})}
                            className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] font-bold focus:border-purple-500 focus:outline-none"
                        >
                            <option value="">All Classes</option>
                            {classOptions.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <SectionPicker availableSections={availableSections} selectedSections={form.targetSections} onChange={s => setForm({...form, targetSections: s})} />

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1 px-1">Starts At <span className="text-[var(--text-muted)] normal-case">(optional)</span></label>
                        <input
                            type="datetime-local"
                            value={form.startsAt}
                            onChange={e => setForm({...form, startsAt: e.target.value})}
                            className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] font-bold focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase mb-1 px-1">Duration <span className="text-[var(--text-muted)] normal-case">(hours, 0 = no limit)</span></label>
                        <input
                            type="number"
                            value={form.durationHours || ''}
                            onChange={e => setForm({...form, durationHours: parseInt(e.target.value) || 0})}
                            placeholder="No time limit"
                            className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] font-bold focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Rewards */}
                <div className="space-y-3 bg-green-900/20 p-3 rounded-xl border border-green-500/30">
                    <div className="text-[10px] font-bold text-green-400 uppercase">Rewards</div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold">XP</label>
                            <input
                                type="number"
                                value={form.xpReward}
                                onChange={e => setForm({...form, xpReward: parseInt(e.target.value)})}
                                className="w-full p-2 rounded-lg bg-[var(--panel-bg)] border border-[var(--border)] text-[var(--text-primary)] text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold">Flux</label>
                            <input
                                type="number"
                                value={form.fluxReward}
                                onChange={e => setForm({...form, fluxReward: parseInt(e.target.value)})}
                                className="w-full p-2 rounded-lg bg-[var(--panel-bg)] border border-[var(--border)] text-[var(--text-primary)] text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold">Loot Drop</label>
                            <select
                                value={form.lootRarity}
                                onChange={e => setForm({...form, lootRarity: e.target.value as ItemRarity})}
                                className="w-full p-2 rounded-lg bg-[var(--panel-bg)] border border-[var(--border)] text-[var(--text-primary)] text-sm appearance-none"
                            >
                                <option value="">None</option>
                                <option value="COMMON">Common</option>
                                <option value="UNCOMMON">Uncommon</option>
                                <option value="RARE">Rare</option>
                                <option value="UNIQUE">Unique</option>
                            </select>
                        </div>
                    </div>

                    {/* Custom Item Reward */}
                    {customItems.length > 0 && (
                        <div>
                            <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold mb-1">Custom Item Reward <span className="normal-case text-gray-600">(from library)</span></label>
                            <select
                                value={form.customItemRewardId}
                                onChange={e => setForm({...form, customItemRewardId: e.target.value})}
                                className="w-full p-2 rounded-lg bg-[var(--panel-bg)] border border-[var(--border)] text-[var(--text-primary)] text-sm"
                            >
                                <option value="">None</option>
                                {customItems.map(ci => (
                                    <option key={ci.id} value={ci.id}>{ci.name} ({ci.rarity} {ci.slot})</option>
                                ))}
                            </select>
                            {selectedCustomItem && (
                                <div className={`mt-1.5 flex items-center gap-2 px-2 py-1.5 rounded-lg border ${getAssetColors(selectedCustomItem.rarity).border} ${getAssetColors(selectedCustomItem.rarity).bg}`}>
                                    <span className={`text-[10px] font-bold ${getAssetColors(selectedCustomItem.rarity).text}`}>{selectedCustomItem.name}</span>
                                    <span className="text-[9px] text-[var(--text-muted)]">{selectedCustomItem.rarity} {selectedCustomItem.slot}</span>
                                    {Object.entries(selectedCustomItem.stats).filter(([, v]) => v).map(([k, v]) => (
                                        <span key={k} className="text-[9px] text-[var(--text-tertiary)]">+{v} {k}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Options */}
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] cursor-pointer">
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
                                <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold text-center mb-1">Tech</label>
                                <input type="number" value={form.techReq || ''} onChange={e => setForm({...form, techReq: parseInt(e.target.value) || 0})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" />
                            </div>
                            <div>
                                <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold text-center mb-1">Focus</label>
                                <input type="number" value={form.focusReq || ''} onChange={e => setForm({...form, focusReq: parseInt(e.target.value) || 0})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" />
                            </div>
                            <div>
                                <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold text-center mb-1">Analysis</label>
                                <input type="number" value={form.analysisReq || ''} onChange={e => setForm({...form, analysisReq: parseInt(e.target.value) || 0})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" />
                            </div>
                            <div>
                                <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold text-center mb-1">Charisma</label>
                                <input type="number" value={form.charismaReq || ''} onChange={e => setForm({...form, charismaReq: parseInt(e.target.value) || 0})} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm text-white" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold mb-1">Salvation Die (D-X)</label>
                                <input type="number" value={form.dieSides} onChange={e => setForm({...form, dieSides: parseInt(e.target.value)})} className="w-full p-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm" />
                            </div>
                            <div>
                                <label className="block text-[9px] text-[var(--text-muted)] uppercase font-bold mb-1">Failure Consequence</label>
                                <input type="text" value={form.consequence} onChange={e => setForm({...form, consequence: e.target.value})} placeholder="e.g. detention" className="w-full p-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm" />
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    {onSaveDraft && (
                        <button type="button" disabled={isSubmitting} onClick={onSaveDraft} className="flex-1 bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-50">Save Draft</button>
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

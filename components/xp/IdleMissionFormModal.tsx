import React, { useState, useEffect } from 'react';
import { IdleMission, ItemRarity, DefaultClassTypes } from '../../types';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';

interface IdleMissionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingMission: IdleMission | null;
}

type StatKey = 'tech' | 'focus' | 'analysis' | 'charisma';

interface FormState {
  name: string;
  description: string;
  classType: string;
  duration: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  rewardXp: number;
  rewardFlux: number;
  rewardItemRarity: string;
  minLevel: number;
  isActive: boolean;
  statBonuses: { stat: StatKey; threshold: number; bonusMultiplier: number; description: string }[];
}

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  classType: DefaultClassTypes.AP_PHYSICS,
  duration: 60,
  difficulty: 'MEDIUM',
  rewardXp: 100,
  rewardFlux: 50,
  rewardItemRarity: '',
  minLevel: 0,
  isActive: true,
  statBonuses: [],
});

const CLASS_OPTIONS = [
  DefaultClassTypes.AP_PHYSICS,
  DefaultClassTypes.HONORS_PHYSICS,
  DefaultClassTypes.FORENSICS,
  DefaultClassTypes.UNCATEGORIZED,
];

const DURATION_OPTIONS = [
  { label: '30 minutes', value: 30 },
  { label: '1 hour',     value: 60 },
  { label: '2 hours',    value: 120 },
  { label: '4 hours',    value: 240 },
];

const RARITY_OPTIONS: { label: string; value: string }[] = [
  { label: 'None',     value: '' },
  { label: 'Common',   value: 'COMMON' },
  { label: 'Uncommon', value: 'UNCOMMON' },
  { label: 'Rare',     value: 'RARE' },
  { label: 'Unique',   value: 'UNIQUE' },
];

const STAT_OPTIONS: { label: string; value: StatKey }[] = [
  { label: 'Tech',     value: 'tech' },
  { label: 'Focus',    value: 'focus' },
  { label: 'Analysis', value: 'analysis' },
  { label: 'Charisma', value: 'charisma' },
];

function formToMission(form: FormState, id: string): IdleMission {
  return {
    id,
    name: form.name.trim(),
    description: form.description.trim(),
    classType: form.classType,
    duration: form.duration,
    difficulty: form.difficulty,
    isActive: form.isActive,
    rewards: {
      xp: form.rewardXp,
      flux: form.rewardFlux,
      ...(form.rewardItemRarity ? { itemRarity: form.rewardItemRarity as ItemRarity } : {}),
    },
    statBonuses: form.statBonuses.length > 0 ? form.statBonuses : undefined,
    minLevel: form.minLevel > 0 ? form.minLevel : undefined,
    createdAt: new Date().toISOString(),
  };
}

const IdleMissionFormModal: React.FC<IdleMissionFormModalProps> = ({ isOpen, onClose, editingMission }) => {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingMission) {
      setForm({
        name:              editingMission.name,
        description:       editingMission.description,
        classType:         editingMission.classType,
        duration:          editingMission.duration,
        difficulty:        editingMission.difficulty,
        rewardXp:          editingMission.rewards.xp,
        rewardFlux:        editingMission.rewards.flux,
        rewardItemRarity:  editingMission.rewards.itemRarity || '',
        minLevel:          editingMission.minLevel || 0,
        isActive:          editingMission.isActive,
        statBonuses:       editingMission.statBonuses?.map(b => ({ ...b })) || [],
      });
    } else {
      setForm(emptyForm());
    }
  }, [isOpen, editingMission]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const addStatBonus = () => {
    setForm(prev => ({
      ...prev,
      statBonuses: [...prev.statBonuses, { stat: 'tech', threshold: 30, bonusMultiplier: 1.5, description: 'High Tech: +50% Rewards' }],
    }));
  };

  const removeStatBonus = (idx: number) => {
    setForm(prev => ({ ...prev, statBonuses: prev.statBonuses.filter((_, i) => i !== idx) }));
  };

  const updateStatBonus = (idx: number, field: string, value: unknown) => {
    setForm(prev => {
      const updated = [...prev.statBonuses];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, statBonuses: updated };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Mission name is required.'); return; }
    setSaving(true);
    try {
      const id = editingMission?.id || Math.random().toString(36).substring(2, 9);
      await dataService.saveIdleMission(formToMission(form, id));
      toast.success(editingMission ? 'Mission updated.' : 'Mission created.');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save mission.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500/50';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingMission ? 'Edit Idle Mission' : 'Create Idle Mission'}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

        {/* Name */}
        <div>
          <label className={labelCls}>Mission Name</label>
          <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g., Data Recovery" />
        </div>

        {/* Description */}
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={`${inputCls} resize-none h-16`} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief mission briefing..." />
        </div>

        {/* Class + Difficulty row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Class</label>
            <select className={inputCls} value={form.classType} onChange={e => set('classType', e.target.value)}>
              {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Difficulty</label>
            <select className={inputCls} value={form.difficulty} onChange={e => set('difficulty', e.target.value as FormState['difficulty'])}>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
        </div>

        {/* Duration + Min Level row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Duration</label>
            <select className={inputCls} value={form.duration} onChange={e => set('duration', Number(e.target.value))}>
              {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Min Level (0 = none)</label>
            <input type="number" className={inputCls} min={0} max={500} value={form.minLevel} onChange={e => set('minLevel', Number(e.target.value))} />
          </div>
        </div>

        {/* Rewards */}
        <div className="rounded-xl border border-white/5 bg-white/2 p-3 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Rewards</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>XP</label>
              <input type="number" className={inputCls} min={0} value={form.rewardXp} onChange={e => set('rewardXp', Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Flux</label>
              <input type="number" className={inputCls} min={0} value={form.rewardFlux} onChange={e => set('rewardFlux', Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Item Rarity</label>
              <select className={inputCls} value={form.rewardItemRarity} onChange={e => set('rewardItemRarity', e.target.value)}>
                {RARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Stat Bonuses */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={labelCls}>Stat Bonuses</span>
            <button onClick={addStatBonus} className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300">
              <Plus className="w-3 h-3" /> Add Bonus
            </button>
          </div>
          {form.statBonuses.map((bonus, idx) => (
            <div key={idx} className="rounded-xl border border-white/5 bg-black/30 p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Stat</label>
                  <select className={inputCls} value={bonus.stat} onChange={e => updateStatBonus(idx, 'stat', e.target.value)}>
                    {STAT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Threshold</label>
                  <input type="number" className={inputCls} min={1} value={bonus.threshold} onChange={e => updateStatBonus(idx, 'threshold', Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Multiplier</label>
                  <input type="number" className={inputCls} min={1} step={0.1} value={bonus.bonusMultiplier} onChange={e => updateStatBonus(idx, 'bonusMultiplier', Number(e.target.value))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input className={`${inputCls} flex-1`} value={bonus.description} onChange={e => updateStatBonus(idx, 'description', e.target.value)} placeholder='e.g., "High Tech: +50% Flux"' />
                <button onClick={() => removeStatBonus(idx)} className="text-red-500 hover:text-red-400 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => set('isActive', !form.isActive)}
            className={`w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-purple-500' : 'bg-white/10'} relative`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-gray-300">Active (visible to students)</span>
        </label>

      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : editingMission ? 'Save Changes' : 'Create Mission'}
        </button>
      </div>
    </Modal>
  );
};

export default IdleMissionFormModal;

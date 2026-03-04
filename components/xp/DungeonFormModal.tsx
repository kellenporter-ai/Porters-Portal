import React, { useState, useEffect } from 'react';
import { Dungeon, DungeonRoomType, BossQuizQuestion, ItemRarity, DefaultClassTypes } from '../../types';
import { Plus, Trash2, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { useToast } from '../ToastProvider';
import Modal from '../Modal';

interface DungeonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingDungeon: Dungeon | null;
}

interface DungeonFormRoom {
  id: string;
  name: string;
  description: string;
  type: DungeonRoomType;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  enemyHp: number;
  enemyDamage: number;
  enemyName: string;
  healAmount: number;
  questions: BossQuizQuestion[];
}

interface DungeonFormState {
  name: string;
  description: string;
  classType: string;
  targetSections: string;
  rooms: DungeonFormRoom[];
  rewardXp: number;
  rewardFlux: number;
  rewardItemRarity: string;
  minLevel: number;
  minGearScore: number;
  resetsAt: '' | 'DAILY' | 'WEEKLY';
  isActive: boolean;
}

const CLASS_OPTIONS = [...Object.values(DefaultClassTypes).filter(c => c !== 'Uncategorized'), 'GLOBAL'];
const ROOM_TYPES: DungeonRoomType[] = ['COMBAT', 'PUZZLE', 'BOSS', 'REST', 'TREASURE'];
const RARITIES: Array<ItemRarity | ''> = ['', 'COMMON', 'UNCOMMON', 'RARE', 'UNIQUE'];

const emptyRoom = (): DungeonFormRoom => ({
  id: Math.random().toString(36).substring(2, 10),
  name: '',
  description: '',
  type: 'COMBAT',
  difficulty: 'MEDIUM',
  enemyHp: 200,
  enemyDamage: 20,
  enemyName: '',
  healAmount: 30,
  questions: [],
});

const emptyForm = (): DungeonFormState => ({
  name: '',
  description: '',
  classType: DefaultClassTypes.AP_PHYSICS,
  targetSections: '',
  rooms: [emptyRoom()],
  rewardXp: 500,
  rewardFlux: 100,
  rewardItemRarity: '',
  minLevel: 0,
  minGearScore: 0,
  resetsAt: 'WEEKLY',
  isActive: true,
});

const emptyQuestion = (): BossQuizQuestion => ({
  id: Math.random().toString(36).substring(2, 10),
  stem: '',
  options: ['', '', '', ''],
  correctAnswer: 0,
  difficulty: 'MEDIUM',
  damageBonus: 25,
});

// Inline question editor — same pattern as QuizBossFormModal
const QuestionEditor: React.FC<{
  questions: BossQuizQuestion[];
  onChange: (questions: BossQuizQuestion[]) => void;
}> = ({ questions, onChange }) => {
  const add = () => onChange([...questions, emptyQuestion()]);
  const remove = (idx: number) => onChange(questions.filter((_, i) => i !== idx));
  const update = (idx: number, field: string, value: unknown) => {
    onChange(questions.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };
  const updateOption = (qIdx: number, oIdx: number, value: string) => {
    onChange(questions.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...q.options];
      opts[oIdx] = value;
      return { ...q, options: opts };
    }));
  };

  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={q.id} className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Q{qi + 1}</span>
            <button onClick={() => remove(qi)} className="text-gray-700 hover:text-red-400 transition">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={q.stem}
            onChange={e => update(qi, 'stem', e.target.value)}
            placeholder="Question text..."
            rows={2}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((opt, oi) => (
              <input
                key={oi}
                value={opt}
                onChange={e => updateOption(qi, oi, e.target.value)}
                placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                className={`bg-black/30 border rounded-lg px-2 py-1.5 text-sm text-white placeholder-gray-600 ${
                  q.correctAnswer === oi ? 'border-green-500/40' : 'border-white/10'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Correct:</span>
              <select
                value={q.correctAnswer}
                onChange={e => update(qi, 'correctAnswer', Number(e.target.value))}
                className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-white text-xs"
              >
                {[0, 1, 2, 3].map(i => <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Diff:</span>
              <select
                value={q.difficulty}
                onChange={e => update(qi, 'difficulty', e.target.value)}
                className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-white text-xs"
              >
                <option>EASY</option>
                <option>MEDIUM</option>
                <option>HARD</option>
              </select>
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={add}
        className="w-full py-2 rounded-xl border border-dashed border-white/10 text-xs text-gray-500 hover:text-gray-300 hover:border-white/20 transition flex items-center justify-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> Add Question
      </button>
    </div>
  );
};

// Single room editor row
const RoomEditor: React.FC<{
  room: DungeonFormRoom;
  index: number;
  total: number;
  onChange: (room: DungeonFormRoom) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}> = ({ room, index, total, onChange, onRemove, onMove }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const needsQuestions = room.type !== 'REST' && room.type !== 'TREASURE';
  const needsEnemy = room.type === 'COMBAT' || room.type === 'BOSS';

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
      {/* Room header row */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-white/5 transition"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-[10px] font-black text-gray-600 w-5 text-center">{index + 1}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
          room.type === 'COMBAT' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
          room.type === 'BOSS'   ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
          room.type === 'PUZZLE' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
          room.type === 'REST'   ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                   'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
        }`}>{room.type}</span>
        <span className="text-sm text-white flex-1 truncate">{room.name || 'Unnamed Room'}</span>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button disabled={index === 0} onClick={() => onMove(-1)} className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-30 transition">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button disabled={index === total - 1} onClick={() => onMove(1)} className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-30 transition">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} className="p-1 text-gray-600 hover:text-red-400 transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Room detail editor */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5">
          <div className="grid grid-cols-2 gap-2 pt-3">
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Name</label>
              <input
                value={room.name}
                onChange={e => onChange({ ...room, name: e.target.value })}
                placeholder="Room name"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder-gray-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Type</label>
              <select
                value={room.type}
                onChange={e => onChange({ ...room, type: e.target.value as DungeonRoomType })}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
              >
                {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Difficulty</label>
              <select
                value={room.difficulty}
                onChange={e => onChange({ ...room, difficulty: e.target.value as 'EASY' | 'MEDIUM' | 'HARD' })}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
              >
                <option>EASY</option><option>MEDIUM</option><option>HARD</option>
              </select>
            </div>
            {room.type === 'REST' ? (
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Heal Amount</label>
                <input
                  type="number" min={0} value={room.healAmount}
                  onChange={e => onChange({ ...room, healAmount: Number(e.target.value) })}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                />
              </div>
            ) : needsEnemy ? (
              <>
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Enemy HP</label>
                  <input
                    type="number" min={0} value={room.enemyHp}
                    onChange={e => onChange({ ...room, enemyHp: Number(e.target.value) })}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                  />
                </div>
              </>
            ) : null}
          </div>

          {needsEnemy && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Enemy Name</label>
                <input
                  value={room.enemyName}
                  onChange={e => onChange({ ...room, enemyName: e.target.value })}
                  placeholder="e.g. Dark Golem"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder-gray-600"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Enemy Damage</label>
                <input
                  type="number" min={0} value={room.enemyDamage}
                  onChange={e => onChange({ ...room, enemyDamage: Number(e.target.value) })}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                />
              </div>
            </div>
          )}

          {/* Questions */}
          {needsQuestions && (
            <div>
              <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">
                Questions ({room.questions.length})
              </div>
              <QuestionEditor
                questions={room.questions}
                onChange={questions => onChange({ ...room, questions })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------
// Main modal
// -------------------------------------------------------
const DungeonFormModal: React.FC<DungeonFormModalProps> = ({ isOpen, onClose, editingDungeon }) => {
  const toast = useToast();
  const [form, setForm] = useState<DungeonFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const dungeonConfigFileRef = React.useRef<HTMLInputElement>(null);

  // Populate form when opening
  useEffect(() => {
    if (!isOpen) return;
    if (editingDungeon) {
      setForm({
        name: editingDungeon.name,
        description: editingDungeon.description,
        classType: editingDungeon.classType,
        targetSections: (editingDungeon.targetSections || []).join(', '),
        rooms: editingDungeon.rooms.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description,
          type: r.type,
          difficulty: r.difficulty,
          enemyHp: r.enemyHp || 200,
          enemyDamage: r.enemyDamage || 20,
          enemyName: r.enemyName || '',
          healAmount: r.healAmount || 30,
          questions: r.questions || [],
        })),
        rewardXp: editingDungeon.rewards.xp,
        rewardFlux: editingDungeon.rewards.flux,
        rewardItemRarity: editingDungeon.rewards.itemRarity || '',
        minLevel: editingDungeon.minLevel || 0,
        minGearScore: editingDungeon.minGearScore || 0,
        resetsAt: editingDungeon.resetsAt || '',
        isActive: editingDungeon.isActive,
      });
    } else {
      setForm(emptyForm());
    }
  }, [isOpen, editingDungeon]);

  const updateRoom = (idx: number, room: DungeonFormRoom) => {
    setForm(prev => ({ ...prev, rooms: prev.rooms.map((r, i) => i === idx ? room : r) }));
  };

  const removeRoom = (idx: number) => {
    setForm(prev => ({ ...prev, rooms: prev.rooms.filter((_, i) => i !== idx) }));
  };

  const moveRoom = (idx: number, dir: -1 | 1) => {
    setForm(prev => {
      const rooms = [...prev.rooms];
      const swap = idx + dir;
      if (swap < 0 || swap >= rooms.length) return prev;
      [rooms[idx], rooms[swap]] = [rooms[swap], rooms[idx]];
      return { ...prev, rooms };
    });
  };

  const addRoom = () => {
    setForm(prev => ({ ...prev, rooms: [...prev.rooms, emptyRoom()] }));
  };

  // --- Import Full Dungeon Config JSON (from /generate-questions skill) ---
  const handleImportDungeonConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) cleaned = objMatch[0];
      const dungeon = JSON.parse(cleaned) as Record<string, unknown>;

      if (!dungeon.name || !dungeon.rooms) throw new Error('Missing name or rooms — not a valid dungeon config.');

      setForm({
        name: (dungeon.name as string) || '',
        description: (dungeon.description as string) || '',
        classType: (dungeon.classType as string) || DefaultClassTypes.AP_PHYSICS,
        targetSections: '',
        rooms: ((dungeon.rooms as Array<Record<string, unknown>>) || []).map(r => ({
          id: (r.id as string) || Math.random().toString(36).substring(2, 10),
          name: (r.name as string) || 'Room',
          description: (r.description as string) || '',
          type: (ROOM_TYPES.includes(r.type as DungeonRoomType) ? r.type : 'COMBAT') as DungeonRoomType,
          difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(r.difficulty as string) ? r.difficulty : 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD',
          enemyHp: (r.enemyHp as number) || 200,
          enemyDamage: (r.enemyDamage as number) || 20,
          enemyName: (r.enemyName as string) || '',
          healAmount: (r.healAmount as number) || 30,
          questions: ((r.questions as Array<Record<string, unknown>>) || []).map(q => ({
            id: (q.id as string) || Math.random().toString(36).substring(2, 10),
            stem: (q.stem as string) || '',
            options: ((q.options as string[]) || ['', '', '', '']).slice(0, 4),
            correctAnswer: (q.correctAnswer as number) ?? 0,
            difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty as string) ? q.difficulty : 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD',
            damageBonus: (q.damageBonus as number) || 0,
          })),
        })),
        rewardXp: (dungeon.rewards as Record<string, unknown>)?.xp as number || 500,
        rewardFlux: (dungeon.rewards as Record<string, unknown>)?.flux as number || 100,
        rewardItemRarity: ((dungeon.rewards as Record<string, unknown>)?.itemRarity as string) || '',
        minLevel: (dungeon.minLevel as number) || 0,
        minGearScore: (dungeon.minGearScore as number) || 0,
        resetsAt: (dungeon.resetsAt as '' | 'DAILY' | 'WEEKLY') || 'WEEKLY',
        isActive: true,
      });

      const roomCount = ((dungeon.rooms as unknown[]) || []).length;
      toast.success(`Imported dungeon "${dungeon.name}" with ${roomCount} rooms!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import dungeon config.');
    }
    if (dungeonConfigFileRef.current) dungeonConfigFileRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Dungeon name is required'); return; }
    if (form.rooms.length === 0) { toast.error('At least one room is required'); return; }

    setSaving(true);
    try {
      const dungeon: Dungeon = {
        id: editingDungeon?.id || Math.random().toString(36).substring(2, 14),
        name: form.name.trim(),
        description: form.description.trim(),
        classType: form.classType,
        targetSections: form.targetSections.trim()
          ? form.targetSections.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
        rooms: form.rooms.map(r => ({
          id: r.id,
          name: r.name.trim() || 'Room',
          description: r.description.trim(),
          type: r.type,
          difficulty: r.difficulty,
          questions: r.questions.length > 0 ? r.questions : undefined,
          enemyHp: r.enemyHp || undefined,
          enemyDamage: r.enemyDamage || undefined,
          enemyName: r.enemyName.trim() || undefined,
          healAmount: r.type === 'REST' ? r.healAmount : undefined,
        })),
        rewards: {
          xp: form.rewardXp,
          flux: form.rewardFlux,
          itemRarity: form.rewardItemRarity ? form.rewardItemRarity as ItemRarity : undefined,
        },
        isActive: form.isActive,
        resetsAt: form.resetsAt || undefined,
        minLevel: form.minLevel > 0 ? form.minLevel : undefined,
        minGearScore: form.minGearScore > 0 ? form.minGearScore : undefined,
        createdAt: editingDungeon?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await dataService.saveDungeon(dungeon);
      toast.success(editingDungeon ? 'Dungeon updated!' : 'Dungeon created!');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save dungeon');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingDungeon ? 'Edit Dungeon' : 'New Dungeon'} maxWidth="max-w-2xl">
      <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">

        {/* Import Full Dungeon Config (from /generate-questions skill) */}
        {!editingDungeon && (
          <div className="border border-purple-500/20 rounded-xl bg-purple-500/5 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-purple-300">Import Dungeon Config</div>
              <div className="text-[10px] text-purple-500">Import a complete dungeon JSON from <code className="text-purple-400">/generate-questions</code> — includes rooms, monsters, questions & rewards</div>
            </div>
            <label className="flex-shrink-0 px-4 py-2 bg-purple-600/20 text-purple-400 rounded-xl text-xs font-bold hover:bg-purple-600/30 transition cursor-pointer flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Import JSON
              <input ref={dungeonConfigFileRef} type="file" accept=".json" onChange={handleImportDungeonConfig} className="hidden" />
            </label>
          </div>
        )}

        {/* Basic info */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-gray-500 uppercase">Dungeon Info</div>
          <input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Dungeon name *"
            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600"
          />
          <textarea
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Description..."
            rows={2}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Class</label>
              <select
                value={form.classType}
                onChange={e => setForm(prev => ({ ...prev, classType: e.target.value }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              >
                {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Target Sections (comma-sep)</label>
              <input
                value={form.targetSections}
                onChange={e => setForm(prev => ({ ...prev, targetSections: e.target.value }))}
                placeholder="e.g. A1, B2"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600"
              />
            </div>
          </div>
        </div>

        {/* Requirements & schedule */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-gray-500 uppercase">Requirements</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Min Level</label>
              <input
                type="number" min={0} value={form.minLevel}
                onChange={e => setForm(prev => ({ ...prev, minLevel: Number(e.target.value) }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Min Gear Score</label>
              <input
                type="number" min={0} value={form.minGearScore}
                onChange={e => setForm(prev => ({ ...prev, minGearScore: Number(e.target.value) }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Reset Schedule</label>
              <select
                value={form.resetsAt}
                onChange={e => setForm(prev => ({ ...prev, resetsAt: e.target.value as '' | 'DAILY' | 'WEEKLY' }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="">Unlimited</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
          </div>
        </div>

        {/* Rewards */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-gray-500 uppercase">Completion Rewards</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">XP</label>
              <input
                type="number" min={0} value={form.rewardXp}
                onChange={e => setForm(prev => ({ ...prev, rewardXp: Number(e.target.value) }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Flux</label>
              <input
                type="number" min={0} value={form.rewardFlux}
                onChange={e => setForm(prev => ({ ...prev, rewardFlux: Number(e.target.value) }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Item Rarity</label>
              <select
                value={form.rewardItemRarity}
                onChange={e => setForm(prev => ({ ...prev, rewardItemRarity: e.target.value }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              >
                {RARITIES.map(r => <option key={r} value={r}>{r || 'None'}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Rooms */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-gray-500 uppercase">Rooms ({form.rooms.length})</div>
            <button
              onClick={addRoom}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Add Room
            </button>
          </div>
          {form.rooms.map((room, idx) => (
            <RoomEditor
              key={room.id}
              room={room}
              index={idx}
              total={form.rooms.length}
              onChange={r => updateRoom(idx, r)}
              onRemove={() => removeRoom(idx)}
              onMove={dir => moveRoom(idx, dir)}
            />
          ))}
        </div>

        {/* Active toggle + save */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <button
            onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
            className="flex items-center gap-2 text-sm"
          >
            <div className={`w-10 h-5 rounded-full relative transition-colors ${form.isActive ? 'bg-amber-600' : 'bg-gray-700'}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.isActive ? 'translate-x-5' : ''}`} />
            </div>
            <span className={`text-xs font-bold ${form.isActive ? 'text-amber-400' : 'text-gray-500'}`}>
              {form.isActive ? 'Active' : 'Inactive'}
            </span>
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 text-gray-400 hover:bg-white/10 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingDungeon ? 'Update Dungeon' : 'Create Dungeon'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DungeonFormModal;


import React, { useState, useEffect, useMemo } from 'react';
import { User, XPEvent, RPGItem, EquipmentSlot, BossQuizEvent, BossQuestionBank, BossQuizProgress, getSectionsForClass, CustomItem } from '../types';
import { useClassConfig } from '../lib/AppDataContext';
import { Zap, Plus, Trash2, Brain } from 'lucide-react';
import EndgameStatsModal from './xp/EndgameStatsModal';
import { dataService } from '../services/dataService';
import SectionPicker from './SectionPicker';
import { getClassProfile } from '../lib/classProfile';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import Modal from './Modal';
import InspectInventoryModal from './xp/InspectInventoryModal';
import AdjustXPModal from './xp/AdjustXPModal';
import OperativesTab from './xp/OperativesTab';
import BossOpsTab from './xp/BossOpsTab';
import QuizBossFormModal from './xp/QuizBossFormModal';
import QuestionBankFormModal from './xp/QuestionBankFormModal';
import GamificationAnalyticsTab from './xp/GamificationAnalyticsTab';

type XPTab = 'OPERATIVES' | 'PROTOCOLS' | 'BOSS_OPS' | 'ANALYTICS';

const TAB_NAME_MAP: Record<string, XPTab> = {
  'Operatives': 'OPERATIVES',
  'XP Protocols': 'PROTOCOLS',
  'Boss Ops': 'BOSS_OPS',
  'Analytics': 'ANALYTICS',
};

interface XPManagementProps {
  users: User[];
  initialTab?: string;
}

const XPManagement: React.FC<XPManagementProps> = ({ users, initialTab }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { classConfigs } = useClassConfig();
  const classOptions = classConfigs.length > 0 ? classConfigs.map(c => c.className) : ['AP Physics', 'Honors Physics', 'Forensic Science'];
  const activeTab: XPTab = (initialTab && TAB_NAME_MAP[initialTab]) || 'OPERATIVES';

  const [events, setEvents] = useState<XPEvent[]>([]);
  const [adjustingUser, setAdjustingUser] = useState<User | null>(null);
  const [inspectingUser, setInspectingUser] = useState<User | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventData, setNewEventData] = useState({
      title: '', multiplier: 2, type: 'GLOBAL' as 'GLOBAL' | 'CLASS_SPECIFIC', targetClass: (classOptions[0] || 'AP Physics'), targetSections: [] as string[]
  });

  // Quiz Boss / Question Bank modal state (form state managed inside modals)
  const [quizBosses, setQuizBosses] = useState<BossQuizEvent[]>([]);
  const [isQuizBossModalOpen, setIsQuizBossModalOpen] = useState(false);
  const [editingQuizBoss, setEditingQuizBoss] = useState<BossQuizEvent | null>(null);
  const [questionBanks, setQuestionBanks] = useState<BossQuestionBank[]>([]);
  const [isQuestionBankModalOpen, setIsQuestionBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BossQuestionBank | null>(null);

  // Admin endgame view state
  const [endgameQuiz, setEndgameQuiz] = useState<BossQuizEvent | null>(null);
  const [endgameProgress, setEndgameProgress] = useState<BossQuizProgress[]>([]);
  const [loadingEndgame, setLoadingEndgame] = useState(false);

  const [customItems, setCustomItems] = useState<CustomItem[]>([]);

  useEffect(() => {
    const unsubEvents = dataService.subscribeToXPEvents(setEvents);
    const unsubQuizBosses = dataService.subscribeToAllBossQuizzes(setQuizBosses);
    const unsubBanks = dataService.subscribeToBossQuestionBanks(setQuestionBanks);
    const unsubCustomItems = dataService.subscribeToCustomItems(setCustomItems);
    return () => { unsubEvents(); unsubQuizBosses(); unsubBanks(); unsubCustomItems(); };
  }, []);

  const students = useMemo(() => users.filter(u => u.role === 'STUDENT'), [users]);
  const availableSections = useMemo(() => {
    const sections = new Set<string>();
    students.forEach(s => {
      if (s.classSections) Object.values(s.classSections).forEach(v => { if (v) sections.add(v); });
      else if (s.section) sections.add(s.section);
    });
    return Array.from(sections).sort();
  }, [students]);

  const protocolSections = useMemo(() => {
    if (newEventData.type !== 'CLASS_SPECIFIC' || !newEventData.targetClass) return availableSections;
    const cs = getSectionsForClass(students, newEventData.targetClass);
    return cs.length > 0 ? cs : availableSections;
  }, [newEventData.type, newEventData.targetClass, students, availableSections]);

  // --- Handlers ---
  const handleAdjustXP = async (user: User, amount: number) => {
    try {
        await dataService.adjustUserXP(user.id, amount, user.classType || 'Uncategorized');
        toast.success(`${amount > 0 ? '+' : ''}${amount} XP applied to ${user.name}.`);
    } catch (e) { toast.error('Failed to adjust XP.'); }
    setAdjustingUser(null);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      const event: XPEvent = {
          id: Math.random().toString(36).substring(2, 9),
          title: newEventData.title,
          multiplier: newEventData.multiplier,
          isActive: true,
          type: newEventData.type,
      };
      if (newEventData.type === 'CLASS_SPECIFIC') event.targetClass = newEventData.targetClass;
      if (newEventData.targetSections.length > 0) event.targetSections = newEventData.targetSections;
      await dataService.saveXPEvent(event);
      setIsEventModalOpen(false);
      setNewEventData({ title: '', multiplier: 2, type: 'GLOBAL', targetClass: (classOptions[0] || 'AP Physics'), targetSections: [] });
  };

  const handleToggleEvent = async (event: XPEvent) => { await dataService.saveXPEvent({ ...event, isActive: !event.isActive }); };

  const handleDeleteItem = async (user: User, item: RPGItem, classType?: string) => {
      if(!await confirm({ message: `Confiscate ${item.name} from ${user.name}? This cannot be undone.`, confirmLabel: "Confiscate" })) return;
      const profile = classType ? getClassProfile(user, classType) : { inventory: user.gamification?.inventory || [] };
      const newInventory = profile.inventory.filter(i => i.id !== item.id);
      await dataService.adminUpdateInventory(user.id, newInventory, user.gamification?.currency || 0, classType);
      setInspectingUser(prev => {
          if (!prev) return null;
          if (classType && prev.gamification?.classProfiles?.[classType]) {
              return {...prev, gamification: {...prev.gamification, classProfiles: {...prev.gamification.classProfiles, [classType]: {...prev.gamification.classProfiles[classType], inventory: newInventory}}}} as User;
          }
          return {...prev, gamification: {...prev.gamification, inventory: newInventory}} as User;
      });
  };

  const handleUnequipItem = async (user: User, slot: EquipmentSlot, classType?: string) => {
      if(!await confirm({ message: `Force unequip ${slot} from ${user.name}?`, confirmLabel: "Unequip", variant: "warning" })) return;
      const profile = classType ? getClassProfile(user, classType) : { equipped: { ...user.gamification?.equipped } };
      const newEquipped = { ...profile.equipped };
      delete newEquipped[slot];
      await dataService.adminUpdateEquipped(user.id, newEquipped, classType);
      setInspectingUser(prev => {
          if (!prev) return null;
          if (classType && prev.gamification?.classProfiles?.[classType]) {
              return {...prev, gamification: {...prev.gamification, classProfiles: {...prev.gamification.classProfiles, [classType]: {...prev.gamification.classProfiles[classType], equipped: newEquipped}}}} as User;
          }
          return {...prev, gamification: {...prev.gamification, equipped: newEquipped}} as User;
      });
  };

  const handleGrantFlux = async (user: User, amount: number) => {
      const newAmount = Math.max(0, (user.gamification?.currency || 0) + amount);
      await dataService.adminUpdateInventory(user.id, user.gamification?.inventory || [], newAmount);
      setInspectingUser(prev => prev ? ({...prev, gamification: {...prev.gamification, currency: newAmount}} as User) : null);
  };

  const handleGrantItem = async (user: User, item: RPGItem, classType?: string) => {
      try {
          await dataService.adminGrantItem(user.id, item, classType);
          setInspectingUser(prev => {
              if (!prev) return null;
              if (classType && prev.gamification?.classProfiles?.[classType]) {
                  const oldInv = prev.gamification.classProfiles[classType].inventory || [];
                  return {...prev, gamification: {...prev.gamification, classProfiles: {...prev.gamification.classProfiles, [classType]: {...prev.gamification.classProfiles[classType], inventory: [...oldInv, item]}}}} as User;
              }
              const oldInv = prev.gamification?.inventory || [];
              return {...prev, gamification: {...prev.gamification, inventory: [...oldInv, item]}} as User;
          });
          toast.success(`Granted "${item.name}" to ${user.name}.`);
      } catch { toast.error('Failed to grant item.'); }
  };

  const handleEditItem = async (user: User, itemId: string, updates: Partial<RPGItem>, classType?: string) => {
      try {
          await dataService.adminEditItem(user.id, itemId, updates, classType);
          setInspectingUser(prev => {
              if (!prev) return null;
              const patchItem = (inv: RPGItem[]) => inv.map(i => i.id === itemId ? { ...i, ...updates, id: itemId } : i);
              if (classType && prev.gamification?.classProfiles?.[classType]) {
                  const oldInv = prev.gamification.classProfiles[classType].inventory || [];
                  return {...prev, gamification: {...prev.gamification, classProfiles: {...prev.gamification.classProfiles, [classType]: {...prev.gamification.classProfiles[classType], inventory: patchItem(oldInv)}}}} as User;
              }
              const oldInv = prev.gamification?.inventory || [];
              return {...prev, gamification: {...prev.gamification, inventory: patchItem(oldInv)}} as User;
          });
          toast.success('Item updated.');
      } catch { toast.error('Failed to edit item.'); }
  };

  const handleSaveCodename = async (userId: string, codename: string) => {
      try {
          await dataService.updateCodename(userId, codename);
          toast.success('Code name updated.');
      } catch { toast.error('Failed to update code name.'); }
  };

  const handleSaveCodenameLocked = async (userId: string, locked: boolean) => {
      try {
          await dataService.toggleCodenameLock(userId, locked);
          toast.success(locked ? 'Codename locked.' : 'Codename unlocked.');
      } catch { toast.error('Failed to update lock.'); }
  };

  const handleToggleQuizBoss = async (quiz: BossQuizEvent) => {
      await dataService.toggleBossQuizActive(quiz.id, !quiz.isActive);
  };

  const handleDeleteQuizBoss = async (quiz: BossQuizEvent) => {
      if (!await confirm({ message: `Delete quiz boss "${quiz.bossName}"? This cannot be undone.`, confirmLabel: "Delete" })) return;
      await dataService.deleteBossQuiz(quiz.id);
      toast.success('Quiz boss deleted.');
  };

  const handleDeleteBank = async (bank: BossQuestionBank) => {
      if (!await confirm({ message: `Delete question bank "${bank.name}"? This cannot be undone.`, confirmLabel: 'Delete' })) return;
      await dataService.deleteBossQuestionBank(bank.id);
      toast.success('Question bank deleted.');
  };

  const openEndgameView = async (quiz: BossQuizEvent) => {
      setEndgameQuiz(quiz);
      setLoadingEndgame(true);
      try {
          const progress = await dataService.getBossQuizAllProgress(quiz.id);
          setEndgameProgress(progress);
      } catch { toast.error('Failed to load endgame data.'); }
      setLoadingEndgame(false);
  };

  const TAB_TITLES: Record<XPTab, string> = {
    OPERATIVES: 'Operatives',
    PROTOCOLS: 'XP Protocols',
    BOSS_OPS: 'Boss Ops',
    ANALYTICS: 'Analytics',
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">{TAB_TITLES[activeTab]}</h1>
          <p className="text-gray-400">Manage operative progression, rewards, and active engagement boosters.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'PROTOCOLS' && <button onClick={() => setIsEventModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-blue-900/20"><Zap className="w-4 h-4" /> Deploy Protocol</button>}
          {activeTab === 'BOSS_OPS' && <button onClick={() => { setEditingQuizBoss(null); setIsQuizBossModalOpen(true); }} className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-amber-900/20"><Brain className="w-4 h-4" /> Deploy Quiz Boss</button>}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
        <div className="p-6" role="tabpanel" aria-label={`${TAB_TITLES[activeTab]} panel`}>
          {activeTab === 'OPERATIVES' && (
            <OperativesTab
              students={students}
              onAdjustXP={(user) => setAdjustingUser(user)}
              onInspect={(user) => setInspectingUser(user)}
              onSaveCodename={handleSaveCodename}
              onSaveCodenameLocked={handleSaveCodenameLocked}
            />
          )}

          {activeTab === 'PROTOCOLS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map(event => (
                <div key={event.id} className={`p-6 rounded-3xl border transition-all relative overflow-hidden ${event.isActive ? 'bg-blue-600/10 border-blue-500/30 ring-1 ring-blue-500/20 shadow-lg shadow-blue-900/10' : 'bg-black/20 border-white/10 opacity-60'}`}>
                  {event.isActive && <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest animate-pulse"><div className="w-1.5 h-1.5 rounded-full bg-white"></div>LIVE</div>}
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${event.isActive ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400'}`}><Zap className="w-6 h-6" /></div>
                    <button onClick={() => dataService.deleteXPEvent(event.id)} className="p-2 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">{event.title}</h3>
                  <div className="flex items-center gap-2 mb-4"><span className="text-3xl font-black text-blue-400">{event.multiplier}x</span><span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Multiplier</span></div>
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{event.type === 'GLOBAL' ? 'Global Uplink' : event.targetClass}</span>
                    <button onClick={() => handleToggleEvent(event)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${event.isActive ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'}`}>{event.isActive ? 'Active' : 'Offline'}</button>
                  </div>
                </div>
              ))}
              <button onClick={() => setIsEventModalOpen(true)} className="p-6 rounded-3xl border-2 border-dashed border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-blue-400 min-h-[220px]">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><Plus className="w-6 h-6" /></div>
                <span className="font-bold uppercase tracking-widest text-xs">Initialize Protocol</span>
              </button>
            </div>
          )}

          {activeTab === 'BOSS_OPS' && (
            <BossOpsTab
              quizBosses={quizBosses}
              questionBanks={questionBanks}
              onEditQuizBoss={(quiz) => { setEditingQuizBoss(quiz); setIsQuizBossModalOpen(true); }}
              onCloneQuizBoss={(clonedQuiz) => { setEditingQuizBoss(clonedQuiz); setIsQuizBossModalOpen(true); }}
              onToggleQuizBoss={handleToggleQuizBoss}
              onDeleteQuizBoss={handleDeleteQuizBoss}
              onEditBank={(bank) => { setEditingBank(bank); setIsQuestionBankModalOpen(true); }}
              onDeleteBank={handleDeleteBank}
              onCreateBank={() => { setEditingBank(null); setIsQuestionBankModalOpen(true); }}
              onOpenEndgameView={openEndgameView}
            />
          )}

          {activeTab === 'ANALYTICS' && (
            <GamificationAnalyticsTab
              students={students}
              events={events}
              quizBosses={quizBosses}
            />
          )}

        </div>
      </div>

      {/* Modals */}
      <InspectInventoryModal user={inspectingUser} onClose={() => setInspectingUser(null)} onDeleteItem={handleDeleteItem} onUnequipItem={handleUnequipItem} onGrantFlux={handleGrantFlux} onGrantItem={handleGrantItem} onEditItem={handleEditItem} customItems={customItems} />
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title="New XP Protocol Deployment">
        <form onSubmit={handleCreateEvent} className="space-y-4 text-gray-100 p-2">
          <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Protocol Title</label><input value={newEventData.title} onChange={e => setNewEventData({...newEventData, title: e.target.value})} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" placeholder="e.g. Double XP Weekend" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Multiplier</label><input type="number" step="0.5" value={newEventData.multiplier} onChange={e => setNewEventData({...newEventData, multiplier: parseFloat(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" /></div>
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Uplink Type</label><select value={newEventData.type} onChange={e => setNewEventData({...newEventData, type: e.target.value as 'GLOBAL' | 'CLASS_SPECIFIC', targetSections: []})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold"><option value="GLOBAL">Global Node</option><option value="CLASS_SPECIFIC">Class Sub-Node</option></select></div>
          </div>
          {newEventData.type === 'CLASS_SPECIFIC' && <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Target Sub-Node</label><select value={newEventData.targetClass} onChange={e => setNewEventData({...newEventData, targetClass: e.target.value, targetSections: []})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold">{classOptions.map(c => <option key={c} value={c}>{c}</option>)}</select></div>}
          <SectionPicker availableSections={protocolSections} selectedSections={newEventData.targetSections} onChange={s => setNewEventData({...newEventData, targetSections: s})} />
          <div className="flex gap-3">
            <button type="button" onClick={async () => { const event: XPEvent = { id: Math.random().toString(36).substring(2, 9), title: newEventData.title, multiplier: newEventData.multiplier, isActive: false, type: newEventData.type, ...(newEventData.type === 'CLASS_SPECIFIC' ? { targetClass: newEventData.targetClass } : {}), ...(newEventData.targetSections.length > 0 ? { targetSections: newEventData.targetSections } : {}) }; await dataService.saveXPEvent(event); setIsEventModalOpen(false); setNewEventData({ title: '', multiplier: 2, type: 'GLOBAL', targetClass: (classOptions[0] || 'AP Physics'), targetSections: [] }); toast.success('Protocol saved as draft (standby).'); }} className="flex-1 bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition">Save Draft</button>
            <button type="submit" className="flex-[2] bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:bg-blue-700">Initiate Uplink</button>
          </div>
        </form>
      </Modal>

      <AdjustXPModal user={adjustingUser} onClose={() => setAdjustingUser(null)} onAdjust={handleAdjustXP} allStudents={students} />

      <QuizBossFormModal
        isOpen={isQuizBossModalOpen}
        onClose={() => setIsQuizBossModalOpen(false)}
        editingQuizBoss={editingQuizBoss}
        questionBanks={questionBanks}
        availableSections={availableSections}
      />

      <QuestionBankFormModal
        isOpen={isQuestionBankModalOpen}
        onClose={() => setIsQuestionBankModalOpen(false)}
        editingBank={editingBank}
      />

      <EndgameStatsModal
        quiz={endgameQuiz}
        progress={endgameProgress}
        loading={loadingEndgame}
        users={users}
        onClose={() => { setEndgameQuiz(null); setEndgameProgress([]); }}
      />

    </div>
  );
};

export default XPManagement;

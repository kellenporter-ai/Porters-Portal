
import React, { useState, useEffect, useMemo } from 'react';
import { User, XPEvent, Quest, RPGItem, EquipmentSlot, ItemRarity, BossQuizEvent, BossQuestionBank, BossQuizProgress, getSectionsForClass, CustomItem, Dungeon, IdleMission } from '../types';
import { useClassConfig } from '../lib/AppDataContext';
import { Trophy, Zap, Plus, Trash2, Award, Rocket, Brain, Copy } from 'lucide-react';
import EndgameStatsModal from './xp/EndgameStatsModal';
import { dataService } from '../services/dataService';
import { reportError } from '../lib/errorReporting';
import SectionPicker from './SectionPicker';
import { getClassProfile } from '../lib/classProfile';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import Modal from './Modal';
import InspectInventoryModal from './xp/InspectInventoryModal';
import AdjustXPModal from './xp/AdjustXPModal';
import MissionControlTab from './xp/MissionControlTab';
import MissionFormModal, { INITIAL_MISSION_STATE } from './xp/MissionFormModal';
import OperativesTab from './xp/OperativesTab';
import BossOpsTab from './xp/BossOpsTab';
import XPTutoringTab from './xp/XPTutoringTab';
import QuizBossFormModal from './xp/QuizBossFormModal';
import QuestionBankFormModal from './xp/QuestionBankFormModal';
import GamificationAnalyticsTab from './xp/GamificationAnalyticsTab';
import DungeonFormModal from './xp/DungeonFormModal';
import IdleMissionFormModal from './xp/IdleMissionFormModal';

type XPTab = 'OPERATIVES' | 'PROTOCOLS' | 'MISSIONS' | 'MISSION_CONTROL' | 'BOSS_OPS' | 'TUTORING' | 'ANALYTICS' | 'DUNGEON_OPS' | 'IDLE_MISSIONS';

const TAB_NAME_MAP: Record<string, XPTab> = {
  'Operatives': 'OPERATIVES',
  'XP Protocols': 'PROTOCOLS',
  'Missions': 'MISSIONS',
  'Mission Control': 'MISSION_CONTROL',
  'Boss Ops': 'BOSS_OPS',
  'Tutoring': 'TUTORING',
  'Analytics': 'ANALYTICS',
  'Dungeon Ops': 'DUNGEON_OPS',
  'Idle Missions': 'IDLE_MISSIONS',
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
  const [quests, setQuests] = useState<Quest[]>([]);
  const [adjustingUser, setAdjustingUser] = useState<User | null>(null);
  const [inspectingUser, setInspectingUser] = useState<User | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [missionForm, setMissionForm] = useState(INITIAL_MISSION_STATE);
  const [isSubmittingQuest, setIsSubmittingQuest] = useState(false);
  const [activeDeployments, setActiveDeployments] = useState<{ user: User; quest: Quest; status: string; roll?: number; acceptedAt?: string }[]>([]);
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

  // Admin tutoring
  const [allTutoringSessions, setAllTutoringSessions] = useState<import('../types').TutoringSession[]>([]);
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);

  // Dungeon Ops state
  const [dungeons, setDungeons] = useState<Dungeon[]>([]);
  const [isDungeonModalOpen, setIsDungeonModalOpen] = useState(false);
  const [editingDungeon, setEditingDungeon] = useState<Dungeon | null>(null);

  // Idle Missions state
  const [idleMissions, setIdleMissions] = useState<IdleMission[]>([]);
  const [isIdleMissionModalOpen, setIsIdleMissionModalOpen] = useState(false);
  const [editingIdleMission, setEditingIdleMission] = useState<IdleMission | null>(null);

  useEffect(() => {
    const unsubEvents = dataService.subscribeToXPEvents(setEvents);
    const unsubQuests = dataService.subscribeToQuests(setQuests);
    const unsubQuizBosses = dataService.subscribeToAllBossQuizzes(setQuizBosses);
    const unsubTutoring = dataService.subscribeToAllTutoringSessions(setAllTutoringSessions);
    const unsubBanks = dataService.subscribeToBossQuestionBanks(setQuestionBanks);
    const unsubCustomItems = dataService.subscribeToCustomItems(setCustomItems);
    const unsubDungeons = dataService.subscribeToAllDungeons(setDungeons);
    const unsubIdleMissions = dataService.subscribeToAllIdleMissions(setIdleMissions);
    return () => { unsubEvents(); unsubQuests(); unsubQuizBosses(); unsubTutoring(); unsubBanks(); unsubCustomItems(); unsubDungeons(); unsubIdleMissions(); };
  }, []);

  useEffect(() => {
      const deployments: { user: User; quest: Quest; status: string; roll?: number; acceptedAt?: string }[] = [];
      users.forEach(u => {
          u.gamification?.activeQuests?.forEach(aq => {
              const quest = quests.find(q => q.id === aq.questId);
              if (quest && (aq.status === 'DEPLOYED' || aq.status === 'ACCEPTED')) {
                  deployments.push({ user: u, quest, status: aq.status, roll: aq.deploymentRoll, acceptedAt: aq.acceptedAt });
              }
          });
      });
      setActiveDeployments(deployments);
  }, [users, quests, activeTab]);

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

  const missionSections = useMemo(() => {
    if (!missionForm.targetClass) return availableSections;
    const cs = getSectionsForClass(students, missionForm.targetClass);
    return cs.length > 0 ? cs : availableSections;
  }, [missionForm.targetClass, students, availableSections]);

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

  const handleIssueMission = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingQuest(true);
      try {
          const statRequirements: Record<string, number> = {};
          if (missionForm.techReq > 0) statRequirements.tech = missionForm.techReq;
          if (missionForm.focusReq > 0) statRequirements.focus = missionForm.focusReq;
          if (missionForm.analysisReq > 0) statRequirements.analysis = missionForm.analysisReq;
          if (missionForm.charismaReq > 0) statRequirements.charisma = missionForm.charismaReq;
          const expiryDate = new Date();
          expiryDate.setHours(expiryDate.getHours() + (missionForm.durationHours || 0));
          const newQuest: Quest = {
              id: Math.random().toString(36).substring(2, 9), title: missionForm.title,
              description: missionForm.description, xpReward: missionForm.xpReward, fluxReward: missionForm.fluxReward,
              isActive: true, type: missionForm.type as Quest['type'], statRequirements,
              startsAt: missionForm.startsAt ? new Date(missionForm.startsAt).toISOString() : null,
              expiresAt: missionForm.durationHours > 0 ? expiryDate.toISOString() : null,
              itemRewardRarity: (missionForm.lootRarity as ItemRarity) || null,
              customItemRewardId: missionForm.customItemRewardId || null,
              rollDieSides: missionForm.dieSides || 20, consequenceText: missionForm.consequence || null, isGroupQuest: missionForm.isGroup,
              targetClass: missionForm.targetClass || undefined,
              targetSections: missionForm.targetSections.length > 0 ? missionForm.targetSections : undefined
          };
          await dataService.saveQuest(newQuest);
          toast.success(`Mission "${newQuest.title}" deployed.`);
          setMissionForm(INITIAL_MISSION_STATE);
          setIsQuestModalOpen(false);
      } catch (err) { reportError(err, { component: 'XPManagement' }); toast.error("Failed to issue mission."); }
      finally { setIsSubmittingQuest(false); }
  };

  const handleToggleEvent = async (event: XPEvent) => { await dataService.saveXPEvent({ ...event, isActive: !event.isActive }); };
  const handleToggleQuest = async (quest: Quest) => {
      const updated = { ...quest, isActive: !quest.isActive };
      if (updated.isActive) updated.expiresAt = null;
      await dataService.saveQuest(updated);
  };

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

  const handleResolveQuest = async (userId: string, quest: Quest, success: boolean, classType?: string) => {
      try { await dataService.resolveQuest(userId, quest, success, classType); toast.success(success ? `Mission "${quest.title}" approved.` : `Mission "${quest.title}" rejected.`); }
      catch (e) { toast.error('Failed to resolve mission.'); }
  };

  const handleRollForSalvation = async (deployment: { user: User; quest: Quest; status: string; roll?: number }) => {
      const sides = deployment.quest.rollDieSides || 20;
      const roll = Math.floor(Math.random() * sides) + 1;
      toast.info(`Rolled a ${roll} on a D${sides}. ${roll === sides ? "CRITICAL SUCCESS!" : "Failure confirmed."}`);
      await handleResolveQuest(deployment.user.id, deployment.quest, roll === sides, deployment.user.classType);
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

  const handleAdminVerifyTutoring = async (sessionId: string, tutorId: string) => {
      try {
          const result = await dataService.completeTutoring(sessionId, tutorId);
          toast.success(`Verified! Tutor earned ${result.xpAwarded} XP and ${result.fluxAwarded} Flux`);
      } catch (err) { toast.error('Failed to verify session'); }
  };

  const handleAdminCancelTutoring = async (sessionId: string) => {
      if (!await confirm({ message: 'Cancel this tutoring session?', confirmLabel: 'Cancel Session' })) return;
      try {
          await dataService.cancelTutoringSession(sessionId);
          toast.success('Session cancelled.');
      } catch (err) { toast.error('Failed to cancel session'); }
  };

  const TAB_TITLES: Record<XPTab, string> = {
    OPERATIVES: 'Operatives',
    PROTOCOLS: 'XP Protocols',
    MISSIONS: 'Missions',
    MISSION_CONTROL: 'Mission Control',
    BOSS_OPS: 'Boss Ops',
    TUTORING: 'Tutoring',
    ANALYTICS: 'Analytics',
    DUNGEON_OPS: 'Dungeon Ops',
    IDLE_MISSIONS: 'Idle Missions',
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{TAB_TITLES[activeTab]}</h1>
          <p className="text-gray-400">Manage operative progression, rewards, and active engagement boosters.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'PROTOCOLS' && <button onClick={() => setIsEventModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-blue-900/20"><Rocket className="w-4 h-4" /> Deploy Protocol</button>}
          {activeTab === 'MISSIONS' && <button onClick={() => setIsQuestModalOpen(true)} className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-purple-900/20"><Award className="w-4 h-4" /> Issue Mission</button>}
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

          {activeTab === 'MISSIONS' && (
            <div className="space-y-4">
              {quests.map(quest => (
                <div key={quest.id} className={`p-5 rounded-2xl border flex items-center justify-between transition-all ${quest.isActive ? 'bg-purple-600/10 border-purple-500/30' : 'bg-black/20 border-white/10 opacity-60'}`}>
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${quest.isActive ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'bg-gray-800 text-gray-400'}`}><Trophy className="w-7 h-7" /></div>
                    <div>
                      <h4 className="font-bold text-lg text-white">{quest.title}</h4>
                      <p className="text-sm text-gray-500">{quest.description}</p>
                      {quest.statRequirements && <div className="flex gap-2 mt-2">{Object.entries(quest.statRequirements).map(([stat, val]) => <span key={stat} className="text-[9px] bg-white/10 px-2 py-0.5 rounded text-gray-300 uppercase font-mono border border-white/10">{val} {stat}</span>)}</div>}
                      <div className="flex gap-3 mt-2">
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">{quest.type}</span>
                        <span className="text-[10px] font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20">+{quest.xpReward} XP</span>
                        {quest.itemRewardRarity && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-500/20">LOOT DROP</span>}
                        <span className="text-[10px] font-bold text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">{quest.targetClass || 'All Classes'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        setMissionForm({
                          title: quest.title, description: quest.description,
                          xpReward: quest.xpReward, fluxReward: quest.fluxReward || 0,
                          type: quest.type, lootRarity: quest.itemRewardRarity || '',
                          customItemRewardId: quest.customItemRewardId || '',
                          startsAt: '', durationHours: 0,
                          techReq: quest.statRequirements?.tech || 0, focusReq: quest.statRequirements?.focus || 0,
                          analysisReq: quest.statRequirements?.analysis || 0, charismaReq: quest.statRequirements?.charisma || 0,
                          dieSides: quest.rollDieSides || 20, consequence: quest.consequenceText || '',
                          isGroup: quest.isGroupQuest || false,
                          targetClass: quest.targetClass || '', targetSections: [],
                        });
                        setIsQuestModalOpen(true);
                      }}
                      className="p-2 text-gray-600 hover:text-purple-400 transition" title="Clone mission"
                    ><Copy className="w-4 h-4" /></button>
                    <div className="text-right">
                      <button onClick={() => handleToggleQuest(quest)} className={`w-12 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${quest.isActive ? 'bg-purple-600' : 'bg-gray-700'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${quest.isActive ? 'translate-x-6' : ''}`} />
                      </button>
                      <span className="block text-[8px] font-bold text-gray-600 uppercase mt-1 tracking-widest">{quest.isActive ? 'Active' : 'Standby'}</span>
                    </div>
                    <button onClick={() => dataService.deleteQuest(quest.id)} className="p-2 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'MISSION_CONTROL' && <MissionControlTab deployments={activeDeployments} onResolveQuest={handleResolveQuest} onRollForSalvation={handleRollForSalvation} />}

          {activeTab === 'BOSS_OPS' && (
            <BossOpsTab
              quizBosses={quizBosses}
              questionBanks={questionBanks}
              onEditQuizBoss={(quiz) => { setEditingQuizBoss(quiz); setIsQuizBossModalOpen(true); }}
              onToggleQuizBoss={handleToggleQuizBoss}
              onDeleteQuizBoss={handleDeleteQuizBoss}
              onEditBank={(bank) => { setEditingBank(bank); setIsQuestionBankModalOpen(true); }}
              onDeleteBank={handleDeleteBank}
              onCreateBank={() => { setEditingBank(null); setIsQuestionBankModalOpen(true); }}
              onOpenEndgameView={openEndgameView}
            />
          )}

          {activeTab === 'TUTORING' && (
            <XPTutoringTab
              allSessions={allTutoringSessions}
              onVerify={handleAdminVerifyTutoring}
              onCancel={handleAdminCancelTutoring}
            />
          )}

          {activeTab === 'ANALYTICS' && (
            <GamificationAnalyticsTab
              students={students}
              quests={quests}
              events={events}
              quizBosses={quizBosses}
            />
          )}

          {activeTab === 'DUNGEON_OPS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Create and manage dungeon expeditions for students.</p>
                <button
                  onClick={() => { setEditingDungeon(null); setIsDungeonModalOpen(true); }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition text-xs"
                >
                  <Plus className="w-3 h-3" /> New Dungeon
                </button>
              </div>
              {dungeons.length === 0 && (
                <div className="text-center py-14 text-gray-500">
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-bold">No dungeons created yet.</p>
                  <p className="text-sm mt-1">Create dungeon expeditions for students to explore.</p>
                </div>
              )}
              {dungeons.map((dungeon) => (
                <div key={dungeon.id} className={`p-4 rounded-2xl border flex items-center gap-4 mb-3 ${dungeon.isActive ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-black/20 border-white/10 opacity-60'}`}>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-sm truncate">{dungeon.name}</h4>
                    <p className="text-xs text-gray-500 truncate">{dungeon.description}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-[10px] font-bold text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-500/20">{dungeon.rooms.length} Rooms</span>
                      <span className="text-[10px] font-bold text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">{dungeon.classType}</span>
                      {dungeon.resetsAt && <span className="text-[10px] font-bold text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">{dungeon.resetsAt}</span>}
                      <span className="text-[10px] font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20">{dungeon.rewards.xp} XP / {dungeon.rewards.flux} Flux</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => { setEditingDungeon(dungeon); setIsDungeonModalOpen(true); }} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[10px] font-bold uppercase">Edit</button>
                    <button
                      onClick={async () => { await dataService.saveDungeon({ ...dungeon, isActive: !dungeon.isActive }); }}
                      className={`w-12 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${dungeon.isActive ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${dungeon.isActive ? 'translate-x-6' : ''}`} />
                    </button>
                    <button onClick={() => dataService.deleteDungeon(dungeon.id)} className="p-2 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'IDLE_MISSIONS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Create idle agent missions students can deploy on timed runs.</p>
                <button
                  onClick={() => { setEditingIdleMission(null); setIsIdleMissionModalOpen(true); }}
                  className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition text-xs"
                >
                  <Plus className="w-3 h-3" /> New Idle Mission
                </button>
              </div>
              {idleMissions.length === 0 && (
                <div className="text-center py-14 text-gray-500">
                  <Rocket className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-bold">No idle missions created yet.</p>
                  <p className="text-sm mt-1">Create timed missions students can deploy agents on.</p>
                </div>
              )}
              {idleMissions.map((mission) => (
                <div key={mission.id} className={`p-4 rounded-2xl border flex items-center gap-4 mb-3 ${mission.isActive ? 'bg-orange-600/10 border-orange-500/30' : 'bg-black/20 border-white/10 opacity-60'}`}>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-sm truncate">{mission.name}</h4>
                    <p className="text-xs text-gray-500 truncate">{mission.description}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-[10px] font-bold text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded border border-orange-500/20">{mission.duration}m duration</span>
                      <span className="text-[10px] font-bold text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">{mission.classType}</span>
                      <span className="text-[10px] font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20">{mission.rewards.xp} XP / {mission.rewards.flux} Flux</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => { setEditingIdleMission(mission); setIsIdleMissionModalOpen(true); }} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[10px] font-bold uppercase">Edit</button>
                    <button
                      onClick={async () => { await dataService.saveIdleMission({ ...mission, isActive: !mission.isActive }); }}
                      className={`w-12 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${mission.isActive ? 'bg-orange-600' : 'bg-gray-700'}`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${mission.isActive ? 'translate-x-6' : ''}`} />
                    </button>
                    <button onClick={() => dataService.deleteIdleMission(mission.id)} className="p-2 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <InspectInventoryModal user={inspectingUser} onClose={() => setInspectingUser(null)} onDeleteItem={handleDeleteItem} onUnequipItem={handleUnequipItem} onGrantFlux={handleGrantFlux} onGrantItem={handleGrantItem} onEditItem={handleEditItem} customItems={customItems} />
      <MissionFormModal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} form={missionForm} setForm={setMissionForm} onSubmit={handleIssueMission} customItems={customItems} onSaveDraft={async () => {
        const statRequirements: Record<string, number> = {};
        if (missionForm.techReq > 0) statRequirements.tech = missionForm.techReq;
        if (missionForm.focusReq > 0) statRequirements.focus = missionForm.focusReq;
        if (missionForm.analysisReq > 0) statRequirements.analysis = missionForm.analysisReq;
        if (missionForm.charismaReq > 0) statRequirements.charisma = missionForm.charismaReq;
        const draft: Quest = {
          id: Math.random().toString(36).substring(2, 9), title: missionForm.title,
          description: missionForm.description, xpReward: missionForm.xpReward, fluxReward: missionForm.fluxReward,
          isActive: false, type: missionForm.type as Quest['type'], statRequirements,
          startsAt: missionForm.startsAt ? new Date(missionForm.startsAt).toISOString() : null,
          expiresAt: null, itemRewardRarity: (missionForm.lootRarity as ItemRarity) || null,
          customItemRewardId: missionForm.customItemRewardId || null,
          rollDieSides: missionForm.dieSides || 20, consequenceText: missionForm.consequence || null, isGroupQuest: missionForm.isGroup,
          targetClass: missionForm.targetClass || undefined,
          targetSections: missionForm.targetSections.length > 0 ? missionForm.targetSections : undefined
        };
        await dataService.saveQuest(draft);
        toast.success('Mission saved as draft (standby).');
        setMissionForm(INITIAL_MISSION_STATE);
        setIsQuestModalOpen(false);
      }} isSubmitting={isSubmittingQuest} availableSections={missionSections} />

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

      <DungeonFormModal
        isOpen={isDungeonModalOpen}
        onClose={() => { setIsDungeonModalOpen(false); setEditingDungeon(null); }}
        editingDungeon={editingDungeon}
      />

      <IdleMissionFormModal
        isOpen={isIdleMissionModalOpen}
        onClose={() => { setIsIdleMissionModalOpen(false); setEditingIdleMission(null); }}
        editingMission={editingIdleMission}
      />
    </div>
  );
};

export default XPManagement;

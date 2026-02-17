
import React, { useState, useEffect, useMemo } from 'react';
import { User, XPEvent, Quest, DefaultClassTypes, RPGItem, EquipmentSlot } from '../types';
import { Search, Trophy, Target, Zap, Shield, Plus, Trash2, ChevronDown, Award, Rocket, Filter, Briefcase } from 'lucide-react';
import { dataService } from '../services/dataService';
import { calculateGearScore } from '../lib/gamification';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import Modal from './Modal';
import InspectInventoryModal from './xp/InspectInventoryModal';
import AdjustXPModal from './xp/AdjustXPModal';
import MissionControlTab from './xp/MissionControlTab';
import MissionFormModal, { INITIAL_MISSION_STATE } from './xp/MissionFormModal';

interface XPManagementProps {
  users: User[];
}

const XPManagement: React.FC<XPManagementProps> = ({ users }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'OPERATIVES' | 'PROTOCOLS' | 'MISSIONS' | 'MISSION_CONTROL'>('OPERATIVES');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('All Classes');
  const [filterSection, setFilterSection] = useState('All Sections');
  const [sortOrder, setSortOrder] = useState<'XP_DESC' | 'XP_ASC' | 'NAME'>('XP_DESC');
  const [events, setEvents] = useState<XPEvent[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [adjustingUser, setAdjustingUser] = useState<User | null>(null);
  const [inspectingUser, setInspectingUser] = useState<User | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [missionForm, setMissionForm] = useState(INITIAL_MISSION_STATE);
  const [isSubmittingQuest, setIsSubmittingQuest] = useState(false);
  const [activeDeployments, setActiveDeployments] = useState<any[]>([]);
  const [newEventData, setNewEventData] = useState({
      title: '', multiplier: 2, type: 'GLOBAL' as 'GLOBAL' | 'CLASS_SPECIFIC', targetClass: DefaultClassTypes.AP_PHYSICS
  });

  useEffect(() => {
    const unsubEvents = dataService.subscribeToXPEvents(setEvents);
    const unsubQuests = dataService.subscribeToQuests(setQuests);
    return () => { unsubEvents(); unsubQuests(); };
  }, []);

  useEffect(() => {
      const deployments: any[] = [];
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
    students.forEach(s => { if (s.section) sections.add(s.section); });
    return Array.from(sections).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = filterClass === 'All Classes' || s.classType === filterClass || s.enrolledClasses?.includes(filterClass);
        const matchesSection = filterSection === 'All Sections' || s.section === filterSection;
        return matchesSearch && matchesClass && matchesSection;
      })
      .sort((a, b) => {
        if (sortOrder === 'XP_DESC') return (b.gamification?.xp || 0) - (a.gamification?.xp || 0);
        if (sortOrder === 'XP_ASC') return (a.gamification?.xp || 0) - (b.gamification?.xp || 0);
        return a.name.localeCompare(b.name);
      });
  }, [students, searchTerm, filterClass, filterSection, sortOrder]);

  const handleAdjustXP = async (user: User, amount: number) => {
    try {
        await dataService.adjustUserXP(user.id, amount, user.classType || DefaultClassTypes.UNCATEGORIZED);
        toast.success(`${amount > 0 ? '+' : ''}${amount} XP applied to ${user.name}.`);
    } catch (e) { toast.error('Failed to adjust XP.'); }
    setAdjustingUser(null);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      await dataService.saveXPEvent({
          id: Math.random().toString(36).substring(2, 9), title: newEventData.title,
          multiplier: newEventData.multiplier, isActive: true, type: newEventData.type,
          targetClass: newEventData.type === 'CLASS_SPECIFIC' ? newEventData.targetClass : undefined
      });
      setIsEventModalOpen(false);
      setNewEventData({ title: '', multiplier: 2, type: 'GLOBAL', targetClass: DefaultClassTypes.AP_PHYSICS });
  };

  const handleIssueMission = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingQuest(true);
      try {
          const statRequirements: any = {};
          if (missionForm.techReq > 0) statRequirements.tech = missionForm.techReq;
          if (missionForm.focusReq > 0) statRequirements.focus = missionForm.focusReq;
          if (missionForm.analysisReq > 0) statRequirements.analysis = missionForm.analysisReq;
          if (missionForm.charismaReq > 0) statRequirements.charisma = missionForm.charismaReq;
          const expiryDate = new Date();
          expiryDate.setHours(expiryDate.getHours() + (missionForm.durationHours || 0));
          const newQuest: Quest = {
              id: Math.random().toString(36).substring(2, 9), title: missionForm.title,
              description: missionForm.description, xpReward: missionForm.xpReward, fluxReward: missionForm.fluxReward,
              isActive: true, type: missionForm.type as any, statRequirements,
              startsAt: missionForm.startsAt ? new Date(missionForm.startsAt).toISOString() : null,
              expiresAt: missionForm.durationHours > 0 ? expiryDate.toISOString() : null,
              itemRewardRarity: (missionForm.lootRarity as any) || null,
              rollDieSides: missionForm.dieSides || 20, consequenceText: missionForm.consequence || null, isGroupQuest: missionForm.isGroup
          };
          await dataService.saveQuest(newQuest);
          toast.success(`Mission "${newQuest.title}" deployed.`);
          setMissionForm(INITIAL_MISSION_STATE);
          setIsQuestModalOpen(false);
      } catch (err) { console.error("Failed to issue mission:", err); toast.error("Failed to issue mission."); }
      finally { setIsSubmittingQuest(false); }
  };

  const handleToggleEvent = async (event: XPEvent) => { await dataService.saveXPEvent({ ...event, isActive: !event.isActive }); };
  const handleToggleQuest = async (quest: Quest) => { await dataService.saveQuest({ ...quest, isActive: !quest.isActive }); };

  const handleDeleteItem = async (user: User, item: RPGItem) => {
      if(!await confirm({ message: `Confiscate ${item.name} from ${user.name}? This cannot be undone.`, confirmLabel: "Confiscate" })) return;
      const newInventory = (user.gamification?.inventory || []).filter(i => i.id !== item.id);
      await dataService.adminUpdateInventory(user.id, newInventory, user.gamification?.currency || 0);
      setInspectingUser(prev => prev ? ({...prev, gamification: {...prev.gamification, inventory: newInventory}} as any) : null);
  };

  const handleUnequipItem = async (user: User, slot: EquipmentSlot) => {
      if(!await confirm({ message: `Force unequip ${slot} from ${user.name}?`, confirmLabel: "Unequip", variant: "warning" })) return;
      const currentEquipped = { ...user.gamification?.equipped };
      delete currentEquipped[slot];
      await dataService.adminUpdateEquipped(user.id, currentEquipped);
      setInspectingUser(prev => prev ? ({...prev, gamification: {...prev.gamification, equipped: currentEquipped}} as any) : null);
  };

  const handleGrantFlux = async (user: User, amount: number) => {
      const newAmount = Math.max(0, (user.gamification?.currency || 0) + amount);
      await dataService.adminUpdateInventory(user.id, user.gamification?.inventory || [], newAmount);
      setInspectingUser(prev => prev ? ({...prev, gamification: {...prev.gamification, currency: newAmount}} as any) : null);
  };

  const handleResolveQuest = async (userId: string, quest: Quest, success: boolean, classType?: string) => {
      try { await dataService.resolveQuest(userId, quest, success, classType); toast.success(success ? `Mission "${quest.title}" approved.` : `Mission "${quest.title}" rejected.`); }
      catch (e) { toast.error('Failed to resolve mission.'); }
  };

  const handleRollForSalvation = async (deployment: any) => {
      const sides = deployment.quest.rollDieSides || 20;
      const roll = Math.floor(Math.random() * sides) + 1;
      toast.info(`Rolled a ${roll} on a D${sides}. ${roll === sides ? "CRITICAL SUCCESS!" : "Failure confirmed."}`);
      await handleResolveQuest(deployment.user.id, deployment.quest, roll === sides, deployment.user.classType);
  };

  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button onClick={() => setActiveTab(id)} className={`px-6 py-4 flex items-center gap-2 border-b-2 font-bold transition-all ${activeTab === id ? 'border-purple-500 text-purple-400 bg-purple-500/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
      <Icon className="w-4 h-4" />{label}
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Gamification Command</h1>
          <p className="text-gray-400">Manage operative progression, rewards, and active engagement boosters.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'PROTOCOLS' && <button onClick={() => setIsEventModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-blue-900/20"><Rocket className="w-4 h-4" /> Deploy Protocol</button>}
          {activeTab === 'MISSIONS' && <button onClick={() => setIsQuestModalOpen(true)} className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-purple-900/20"><Award className="w-4 h-4" /> Issue Mission</button>}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
        <div className="flex bg-black/20 border-b border-white/5 overflow-x-auto custom-scrollbar">
          <TabButton id="OPERATIVES" label="Operatives" icon={Shield} />
          <TabButton id="PROTOCOLS" label="XP Protocols" icon={Zap} />
          <TabButton id="MISSIONS" label="Missions" icon={Target} />
          <TabButton id="MISSION_CONTROL" label="Mission Control" icon={Briefcase} />
        </div>
        <div className="p-6">
          {activeTab === 'OPERATIVES' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" placeholder="Search name, operative ID or email..." className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-purple-500/50 transition" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white text-sm font-bold appearance-none focus:outline-none focus:border-purple-500/50">
                      <option>All Classes</option>
                      {Object.values(DefaultClassTypes).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                  {availableSections.length > 0 && (
                  <div className="relative">
                    <select value={filterSection} onChange={(e) => setFilterSection(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-bold appearance-none focus:outline-none focus:border-purple-500/50">
                      <option>All Sections</option>
                      {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>)}
                  <div className="relative">
                    <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-bold appearance-none focus:outline-none focus:border-purple-500/50">
                      <option value="XP_DESC">Highest XP</option><option value="XP_ASC">Lowest XP</option><option value="NAME">Alphabetical</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-white/5">
                    <th className="pb-4 pl-4">Operative</th><th className="pb-4">Status</th><th className="pb-4 text-center">XP Points</th><th className="pb-4 text-center">Gear Score</th><th className="pb-4 text-right pr-4">Action</th>
                  </tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredStudents.map(student => (
                      <tr key={student.id} className="group hover:bg-white/5 transition-colors">
                        <td className="py-4 pl-4"><div className="flex items-center gap-3"><img src={student.avatarUrl} className="w-10 h-10 rounded-xl border border-white/10" alt={student.name} /><div><div className="font-bold text-gray-200">{student.name}</div><div className="text-[10px] font-mono text-gray-500 uppercase">{student.gamification?.codename || 'UNASSIGNED'}</div></div></div></td>
                        <td className="py-4"><span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-1 rounded border border-purple-500/20 font-bold uppercase">{student.classType}</span></td>
                        <td className="py-4 text-center"><div className="text-xl font-black text-white">{student.gamification?.xp?.toLocaleString() || 0}</div><div className="text-[8px] text-gray-500 font-bold uppercase tracking-tighter">Accumulated XP</div></td>
                        <td className="py-4 text-center"><span className="text-sm font-bold text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded border border-yellow-500/20">{calculateGearScore(student.gamification?.equipped)}</span></td>
                        <td className="py-4 text-right pr-4"><div className="flex justify-end gap-2">
                          <button onClick={() => setInspectingUser(student)} className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20" title="Inspect Inventory"><Briefcase className="w-4 h-4" /></button>
                          <button onClick={() => setAdjustingUser(student)} className="p-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition border border-green-500/20" title="Adjust XP"><Plus className="w-4 h-4" /></button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
                        {quest.itemRewardRarity && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-purple-500/20">LOOT DROP</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
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
        </div>
      </div>

      <InspectInventoryModal user={inspectingUser} onClose={() => setInspectingUser(null)} onDeleteItem={handleDeleteItem} onUnequipItem={handleUnequipItem} onGrantFlux={handleGrantFlux} />
      <MissionFormModal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} form={missionForm} setForm={setMissionForm} onSubmit={handleIssueMission} isSubmitting={isSubmittingQuest} />
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title="New XP Protocol Deployment">
        <form onSubmit={handleCreateEvent} className="space-y-4 text-gray-100 p-2">
          <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Protocol Title</label><input value={newEventData.title} onChange={e => setNewEventData({...newEventData, title: e.target.value})} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" placeholder="e.g. Double XP Weekend" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Multiplier</label><input type="number" step="0.5" value={newEventData.multiplier} onChange={e => setNewEventData({...newEventData, multiplier: parseFloat(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" /></div>
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Uplink Type</label><select value={newEventData.type} onChange={e => setNewEventData({...newEventData, type: e.target.value as any})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold"><option value="GLOBAL">Global Node</option><option value="CLASS_SPECIFIC">Class Sub-Node</option></select></div>
          </div>
          {newEventData.type === 'CLASS_SPECIFIC' && <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Target Sub-Node</label><select value={newEventData.targetClass} onChange={e => setNewEventData({...newEventData, targetClass: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold">{Object.values(DefaultClassTypes).map(c => <option key={c} value={c}>{c}</option>)}</select></div>}
          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:bg-blue-700">Initiate Uplink</button>
        </form>
      </Modal>
      <AdjustXPModal user={adjustingUser} onClose={() => setAdjustingUser(null)} onAdjust={handleAdjustXP} />
    </div>
  );
};

export default XPManagement;

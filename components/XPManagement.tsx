
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, XPEvent, Quest, DefaultClassTypes, RPGItem, EquipmentSlot, ItemRarity, BossQuizEvent } from '../types';
import { Search, Trophy, Target, Zap, Shield, Plus, Trash2, ChevronDown, ChevronUp, Award, Rocket, Filter, Briefcase, Pencil, Check, X, Lock, Unlock, Brain, Copy, Upload, FileJson, GraduationCap, MessageCircle, CheckCircle2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import SectionPicker from './SectionPicker';
import { calculateGearScore } from '../lib/gamification';
import { getClassProfile } from '../lib/classProfile';
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
  const [activeTab, setActiveTab] = useState<'OPERATIVES' | 'PROTOCOLS' | 'MISSIONS' | 'MISSION_CONTROL' | 'BOSS_OPS' | 'TUTORING'>('OPERATIVES');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('All Classes');
  const [filterSection, setFilterSection] = useState('All Sections');
  const [sortCol, setSortCol] = useState<string>('xp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleOperativesSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const OpSortHeader = ({ label, col, className }: { label: string; col: string; className?: string }) => (
    <th className={`cursor-pointer select-none group pb-4 ${className ?? ''}`} onClick={() => handleOperativesSort(col)}>
      <div className={`flex items-center gap-1 ${className?.includes('text-center') ? 'justify-center' : className?.includes('text-right') ? 'justify-end' : 'justify-start'}`}>
        <span>{label}</span>
        <span className="flex flex-col gap-px">
          <ChevronUp  className={`w-2.5 h-2.5 -mb-0.5 ${sortCol === col && sortDir === 'asc'  ? 'text-purple-400' : 'text-gray-600 group-hover:text-gray-400'} transition`} />
          <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortCol === col && sortDir === 'desc' ? 'text-purple-400' : 'text-gray-600 group-hover:text-gray-400'} transition`} />
        </span>
      </div>
    </th>
  );
  const [events, setEvents] = useState<XPEvent[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [adjustingUser, setAdjustingUser] = useState<User | null>(null);
  const [inspectingUser, setInspectingUser] = useState<User | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [missionForm, setMissionForm] = useState(INITIAL_MISSION_STATE);
  const [isSubmittingQuest, setIsSubmittingQuest] = useState(false);
  const [activeDeployments, setActiveDeployments] = useState<{ user: User; quest: Quest; status: string; roll?: number; acceptedAt?: string }[]>([]);
  const [editingCodename, setEditingCodename] = useState<string | null>(null);
  const [codenameValue, setCodenameValue] = useState('');
  const [newEventData, setNewEventData] = useState({
      title: '', multiplier: 2, type: 'GLOBAL' as 'GLOBAL' | 'CLASS_SPECIFIC', targetClass: DefaultClassTypes.AP_PHYSICS, targetSections: [] as string[]
  });

  // Quiz Boss management state
  const [quizBosses, setQuizBosses] = useState<BossQuizEvent[]>([]);
  const [isQuizBossModalOpen, setIsQuizBossModalOpen] = useState(false);
  const [editingQuizBoss, setEditingQuizBoss] = useState<BossQuizEvent | null>(null);
  const [quizBossForm, setQuizBossForm] = useState({
      bossName: '', description: '', maxHp: 1000, classType: 'GLOBAL',
      damagePerCorrect: 50, rewardXp: 500, rewardFlux: 100,
      rewardItemRarity: '' as string, deadline: '',
      questions: [] as { id: string; stem: string; options: string[]; correctAnswer: number; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; damageBonus: number }[],
      targetSections: [] as string[],
  });
  const [promptCopied, setPromptCopied] = useState(false);
  const quizFileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Admin tutoring oversight
  const [tutoringActiveTab, setTutoringActiveTab] = useState<'all' | 'pending'>('pending');
  const [allTutoringSessions, setAllTutoringSessions] = useState<import('../types').TutoringSession[]>([]);

  useEffect(() => {
    const unsubEvents = dataService.subscribeToXPEvents(setEvents);
    const unsubQuests = dataService.subscribeToQuests(setQuests);
    const unsubQuizBosses = dataService.subscribeToAllBossQuizzes(setQuizBosses);
    const unsubTutoring = dataService.subscribeToAllTutoringSessions(setAllTutoringSessions);
    return () => { unsubEvents(); unsubQuests(); unsubQuizBosses(); unsubTutoring(); };
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
    students.forEach(s => { if (s.section) sections.add(s.section); });
    return Array.from(sections).sort();
  }, [students]);

  const getAggregateGearScore = (student: User): number => {
      const profiles = student.gamification?.classProfiles;
      if (profiles && Object.keys(profiles).length > 0) {
          return Object.values(profiles).reduce((sum, p) => sum + calculateGearScore(p.equipped), 0);
      }
      return calculateGearScore(student.gamification?.equipped);
  };

  const filteredStudents = useMemo(() => {
    return students
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = filterClass === 'All Classes' || s.classType === filterClass || s.enrolledClasses?.includes(filterClass);
        const matchesSection = filterSection === 'All Sections' || s.section === filterSection;
        return matchesSearch && matchesClass && matchesSection;
      })
      .sort((a, b) => {
        switch (sortCol) {
          case 'name':  return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
          case 'class': return sortDir === 'asc' ? (a.classType||'').localeCompare(b.classType||'') : (b.classType||'').localeCompare(a.classType||'');
          case 'level': { const av = a.gamification?.level || 1; const bv = b.gamification?.level || 1; return sortDir === 'asc' ? av - bv : bv - av; }
          case 'flux':  { const av = a.gamification?.currency || 0; const bv = b.gamification?.currency || 0; return sortDir === 'asc' ? av - bv : bv - av; }
          case 'gear':  { const av = getAggregateGearScore(a); const bv = getAggregateGearScore(b); return sortDir === 'asc' ? av - bv : bv - av; }
          case 'xp': default: { const av = a.gamification?.xp || 0; const bv = b.gamification?.xp || 0; return sortDir === 'asc' ? av - bv : bv - av; }
        }
      });
  }, [students, searchTerm, filterClass, filterSection, sortCol, sortDir]);

  const handleAdjustXP = async (user: User, amount: number) => {
    try {
        await dataService.adjustUserXP(user.id, amount, user.classType || DefaultClassTypes.UNCATEGORIZED);
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
      if (newEventData.type === 'CLASS_SPECIFIC') {
          event.targetClass = newEventData.targetClass;
      }
      if (newEventData.targetSections.length > 0) {
          event.targetSections = newEventData.targetSections;
      }
      await dataService.saveXPEvent(event);
      setIsEventModalOpen(false);
      setNewEventData({ title: '', multiplier: 2, type: 'GLOBAL', targetClass: DefaultClassTypes.AP_PHYSICS, targetSections: [] });
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
              rollDieSides: missionForm.dieSides || 20, consequenceText: missionForm.consequence || null, isGroupQuest: missionForm.isGroup,
              targetClass: missionForm.targetClass || undefined,
              targetSections: missionForm.targetSections.length > 0 ? missionForm.targetSections : undefined
          };
          await dataService.saveQuest(newQuest);
          toast.success(`Mission "${newQuest.title}" deployed.`);
          setMissionForm(INITIAL_MISSION_STATE);
          setIsQuestModalOpen(false);
      } catch (err) { console.error("Failed to issue mission:", err); toast.error("Failed to issue mission."); }
      finally { setIsSubmittingQuest(false); }
  };

  const handleToggleEvent = async (event: XPEvent) => { await dataService.saveXPEvent({ ...event, isActive: !event.isActive }); };
  const handleToggleQuest = async (quest: Quest) => {
      const updated = { ...quest, isActive: !quest.isActive };
      // When re-enabling, clear stale expiry so the mission isn't immediately filtered out
      if (updated.isActive) {
          updated.expiresAt = null;
      }
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

  const handleSaveCodename = async (userId: string) => {
      try {
          await dataService.updateCodename(userId, codenameValue.trim().slice(0, 24));
          toast.success('Code name updated.');
      } catch { toast.error('Failed to update code name.'); }
      setEditingCodename(null);
  };

  const handleSaveCodenameLocked = async (userId: string, locked: boolean) => {
      try {
          await dataService.toggleCodenameLock(userId, locked);
          toast.success(locked ? 'Codename locked.' : 'Codename unlocked.');
      } catch { toast.error('Failed to update lock.'); }
  };

  // --- Quiz Boss handlers ---
  const openQuizBossForm = (quiz?: BossQuizEvent) => {
      if (quiz) {
          setEditingQuizBoss(quiz);
          setQuizBossForm({
              bossName: quiz.bossName, description: quiz.description, maxHp: quiz.maxHp,
              classType: quiz.classType || 'GLOBAL', damagePerCorrect: quiz.damagePerCorrect || 50,
              rewardXp: quiz.rewards?.xp || 500, rewardFlux: quiz.rewards?.flux || 100,
              rewardItemRarity: quiz.rewards?.itemRarity || '',
              deadline: quiz.deadline ? quiz.deadline.slice(0, 16) : '',
              questions: quiz.questions.map(q => ({ ...q, damageBonus: q.damageBonus || 0 })),
              targetSections: quiz.targetSections || [],
          });
      } else {
          setEditingQuizBoss(null);
          const defaultDeadline = new Date();
          defaultDeadline.setDate(defaultDeadline.getDate() + 7);
          setQuizBossForm({
              bossName: '', description: '', maxHp: 1000, classType: 'GLOBAL',
              damagePerCorrect: 50, rewardXp: 500, rewardFlux: 100, rewardItemRarity: '',
              deadline: defaultDeadline.toISOString().slice(0, 16), questions: [],
              targetSections: [],
          });
      }
      setIsQuizBossModalOpen(true);
  };

  const addQuizQuestion = () => {
      setQuizBossForm(prev => ({
          ...prev,
          questions: [...prev.questions, {
              id: Math.random().toString(36).substring(2, 10),
              stem: '', options: ['', '', '', ''], correctAnswer: 0,
              difficulty: 'MEDIUM' as const, damageBonus: 0,
          }],
      }));
  };

  const updateQuizQuestion = (idx: number, field: string, value: unknown) => {
      setQuizBossForm(prev => {
          const questions = [...prev.questions];
          questions[idx] = { ...questions[idx], [field]: value };
          return { ...prev, questions };
      });
  };

  const updateQuizOption = (qIdx: number, optIdx: number, value: string) => {
      setQuizBossForm(prev => {
          const questions = [...prev.questions];
          const options = [...questions[qIdx].options];
          options[optIdx] = value;
          questions[qIdx] = { ...questions[qIdx], options };
          return { ...prev, questions };
      });
  };

  const removeQuizQuestion = (idx: number) => {
      setQuizBossForm(prev => ({
          ...prev,
          questions: prev.questions.filter((_, i) => i !== idx),
      }));
  };

  const handleSaveQuizBoss = async (e: React.FormEvent) => {
      e.preventDefault();
      if (quizBossForm.questions.length === 0) {
          toast.error('Add at least one question.');
          return;
      }
      try {
          const quizData: Record<string, unknown> = {
              id: editingQuizBoss?.id || Math.random().toString(36).substring(2, 12),
              bossName: quizBossForm.bossName,
              description: quizBossForm.description,
              maxHp: quizBossForm.maxHp,
              currentHp: editingQuizBoss?.currentHp ?? quizBossForm.maxHp,
              classType: quizBossForm.classType,
              isActive: editingQuizBoss?.isActive ?? true,
              deadline: new Date(quizBossForm.deadline).toISOString(),
              damagePerCorrect: quizBossForm.damagePerCorrect,
              questions: quizBossForm.questions.map(q => ({
                  id: q.id,
                  stem: q.stem,
                  options: q.options.filter(o => o.trim()),
                  correctAnswer: q.correctAnswer,
                  difficulty: q.difficulty,
                  ...(q.damageBonus > 0 ? { damageBonus: q.damageBonus } : {}),
              })),
              rewards: {
                  xp: quizBossForm.rewardXp,
                  flux: quizBossForm.rewardFlux,
                  ...(quizBossForm.rewardItemRarity ? { itemRarity: quizBossForm.rewardItemRarity } : {}),
              },
              ...(quizBossForm.targetSections.length > 0 ? { targetSections: quizBossForm.targetSections } : {}),
          };
          await dataService.saveBossQuiz(quizData as unknown as BossQuizEvent);
          toast.success(editingQuizBoss ? 'Quiz boss updated.' : 'Quiz boss deployed!');
          setIsQuizBossModalOpen(false);
      } catch (err) { toast.error('Failed to save quiz boss.'); }
  };

  const handleToggleQuizBoss = async (quiz: BossQuizEvent) => {
      await dataService.toggleBossQuizActive(quiz.id, !quiz.isActive);
  };

  const handleDeleteQuizBoss = async (quiz: BossQuizEvent) => {
      if (!await confirm({ message: `Delete quiz boss "${quiz.bossName}"? This cannot be undone.`, confirmLabel: "Delete" })) return;
      await dataService.deleteBossQuiz(quiz.id);
      toast.success('Quiz boss deleted.');
  };

  // --- LLM Prompt for quiz boss question generation ---
  const QUIZ_BOSS_PROMPT = (bossName: string, classType: string) =>
`You are an expert educational assessment designer. Generate quiz boss questions for a gamified LMS.

BOSS: "${bossName || 'Quiz Boss'}"
CLASS: ${classType || 'General'}

Generate 15-30 multiple choice questions across 3 difficulty tiers.

TIER DISTRIBUTION:
- EASY (5-10 questions): Recall and basic comprehension
- MEDIUM (5-10 questions): Application and analysis
- HARD (5-10 questions): Evaluation and synthesis

OUTPUT FORMAT — Respond with ONLY a valid JSON array:
[
  {
    "id": "q001",
    "stem": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "difficulty": "EASY",
    "damageBonus": 0
  }
]

RULES:
- "correctAnswer" is the 0-based INDEX of the correct option (0=A, 1=B, 2=C, 3=D)
- "damageBonus" should be 0 for EASY, 25 for MEDIUM, 50 for HARD
- Each question must have exactly 4 options
- Distractors must be plausible and educational
- Questions must be specific to the class material
- Output ONLY the JSON array — no markdown fences, no commentary`;

  const handleCopyQuizPrompt = () => {
      const prompt = QUIZ_BOSS_PROMPT(quizBossForm.bossName, quizBossForm.classType);
      navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
      toast.success('Prompt copied to clipboard!');
  };

  // --- JSON Import for quiz boss questions ---
  const handleImportQuizQuestions = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImportError(null);
      try {
          const text = await file.text();
          let cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
          cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ch => ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : '');

          let parsed;
          try { parsed = JSON.parse(cleaned); } catch {
              const match = cleaned.match(/\[[\s\S]*\]/);
              if (match) {
                  try { parsed = JSON.parse(match[0]); } catch {
                      let lastValid = null;
                      for (let i = match[0].length - 1; i > 0; i--) {
                          if (match[0][i] === '}') {
                              try { lastValid = JSON.parse(match[0].slice(0, i + 1) + ']'); break; } catch { /* keep searching */ }
                          }
                      }
                      if (lastValid) parsed = lastValid;
                      else throw new Error('Could not parse JSON. Make sure the file contains a valid JSON array.');
                  }
              } else { throw new Error('No JSON array found in file.'); }
          }

          if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Must be a non-empty JSON array.');

          const valid = parsed.filter((q: Record<string, unknown>) => q.stem && q.options && q.correctAnswer !== undefined);
          if (valid.length === 0) throw new Error('No valid questions found (need stem, options, correctAnswer).');

          const imported = valid.map((q: Record<string, unknown>) => ({
              id: (q.id as string) || Math.random().toString(36).substring(2, 10),
              stem: q.stem as string,
              options: (q.options as string[]).slice(0, 4),
              correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
              difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty as string) ? q.difficulty : 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD',
              damageBonus: typeof q.damageBonus === 'number' ? q.damageBonus : 0,
          }));

          const skipped = parsed.length - valid.length;
          setQuizBossForm(prev => ({ ...prev, questions: [...prev.questions, ...imported] }));
          toast.success(`Imported ${imported.length} questions${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
      } catch (err) {
          setImportError(err instanceof Error ? err.message : 'Import failed.');
          toast.error('Failed to import questions.');
      }
      if (quizFileRef.current) quizFileRef.current.value = '';
  };

  // --- Admin tutoring handlers ---
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

  const pendingTutoringSessions = allTutoringSessions.filter(s => ['OPEN', 'MATCHED', 'IN_PROGRESS', 'COMPLETED'].includes(s.status));

  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: React.ElementType }) => (
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
          {activeTab === 'BOSS_OPS' && <button onClick={() => openQuizBossForm()} className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-amber-900/20"><Brain className="w-4 h-4" /> Deploy Quiz Boss</button>}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
        <div className="flex bg-black/20 border-b border-white/5 overflow-x-auto custom-scrollbar">
          <TabButton id="OPERATIVES" label="Operatives" icon={Shield} />
          <TabButton id="PROTOCOLS" label="XP Protocols" icon={Zap} />
          <TabButton id="MISSIONS" label="Missions" icon={Target} />
          <TabButton id="MISSION_CONTROL" label="Mission Control" icon={Briefcase} />
          <TabButton id="BOSS_OPS" label="Boss Ops" icon={Brain} />
          <TabButton id="TUTORING" label="Tutoring" icon={GraduationCap} />
        </div>
        <div className="p-6">
          {activeTab === 'OPERATIVES' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" placeholder="Search by name or email..." className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-purple-500/50 transition" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">{filteredStudents.length} operatives</span>
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
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-white/5">
                    <OpSortHeader label="Operative" col="name"  className="pl-4" />
                    <OpSortHeader label="Class"     col="class" />
                    <OpSortHeader label="Level"     col="level" className="text-center" />
                    <OpSortHeader label="XP"        col="xp"   className="text-center" />
                    <OpSortHeader label="Flux"      col="flux"  className="text-center" />
                    <OpSortHeader label="Gear"      col="gear"  className="text-center" />
                    <th className="pb-4 text-right pr-4">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredStudents.map(student => {
                      const level = student.gamification?.level || 1;
                      const flux = student.gamification?.currency || 0;
                      const classes = student.enrolledClasses || (student.classType ? [student.classType] : []);
                      return (
                      <tr key={student.id} className="group hover:bg-white/5 transition-colors">
                        <td className="py-3 pl-4">
                          <div className="flex items-center gap-3">
                            <img src={student.avatarUrl} className="w-9 h-9 rounded-lg border border-white/10" alt={student.name} />
                            <div>
                              <div className="font-bold text-sm text-gray-200">{student.name}</div>
                              {editingCodename === student.id ? (
                                <div className="flex items-center gap-1">
                                  <input autoFocus value={codenameValue} onChange={e => setCodenameValue(e.target.value)} maxLength={24} onKeyDown={e => { if (e.key === 'Enter') handleSaveCodename(student.id); if (e.key === 'Escape') setEditingCodename(null); }}
                                    className="bg-black/60 border border-purple-500/30 rounded px-1.5 py-0.5 text-[10px] text-white font-mono w-28 focus:outline-none focus:border-purple-500" />
                                  <button onClick={() => handleSaveCodename(student.id)} className="text-green-400 hover:text-green-300" title="Save"><Check className="w-3 h-3" /></button>
                                  <button onClick={() => setEditingCodename(null)} className="text-gray-500 hover:text-gray-300" title="Cancel"><X className="w-3 h-3" /></button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => { setEditingCodename(student.id); setCodenameValue(student.gamification?.codename || ''); }} className="text-[10px] font-mono text-gray-500 uppercase hover:text-purple-400 transition flex items-center gap-1 group/cn">
                                    {student.gamification?.codename || 'UNASSIGNED'}
                                    <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/cn:opacity-100 transition" />
                                  </button>
                                  <button
                                    onClick={() => handleSaveCodenameLocked(student.id, !student.gamification?.codenameLocked)}
                                    className={`transition ${student.gamification?.codenameLocked ? 'text-red-400 hover:text-red-300' : 'text-gray-600 hover:text-gray-400'}`}
                                    title={student.gamification?.codenameLocked ? 'Codename locked — click to unlock' : 'Click to lock codename'}
                                  >
                                    {student.gamification?.codenameLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {classes.map(c => <span key={c} className="text-[9px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20 font-bold">{c}</span>)}
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <span className="text-lg font-black text-white">{level}</span>
                        </td>
                        <td className="py-3 text-center">
                          <span className="text-sm font-bold text-gray-300">{student.gamification?.xp?.toLocaleString() || 0}</span>
                        </td>
                        <td className="py-3 text-center">
                          <span className="text-sm font-bold text-cyan-400">{flux}</span>
                        </td>
                        <td className="py-3 text-center">
                          <span className="text-sm font-bold text-yellow-400">{getAggregateGearScore(student)}</span>
                        </td>
                        <td className="py-3 text-right pr-4">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => setInspectingUser(student)} className="px-2.5 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"><Briefcase className="w-3 h-3" /> Inventory</button>
                            <button onClick={() => setAdjustingUser(student)} className="px-2.5 py-1.5 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition border border-green-500/20 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"><Plus className="w-3 h-3" /> XP</button>
                          </div>
                        </td>
                      </tr>
                    );})}
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
                        {quest.itemRewardRarity && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-500/20">LOOT DROP</span>}
                        <span className="text-[10px] font-bold text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">{quest.targetClass || 'All Classes'}</span>
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

          {activeTab === 'BOSS_OPS' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Students deal damage by answering questions correctly. Deploy quiz bosses that require mastery of class material to defeat.</p>

              {quizBosses.length === 0 && (
                <div className="text-center py-14 text-gray-500">
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-bold">No quiz bosses deployed.</p>
                  <p className="text-sm mt-1">Deploy a quiz boss to challenge students with educational content.</p>
                </div>
              )}

              {quizBosses.map(quiz => {
                const hpPercent = quiz.maxHp > 0 ? Math.max(0, (quiz.currentHp || quiz.maxHp) / quiz.maxHp * 100) : 0;
                const isExpired = new Date(quiz.deadline) < new Date();
                return (
                <div key={quiz.id} className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center gap-4 transition-all mb-3 ${quiz.isActive && !isExpired ? 'bg-amber-600/10 border-amber-500/30' : 'bg-black/20 border-white/10 opacity-60'}`}>
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${quiz.isActive && !isExpired ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40' : 'bg-gray-800 text-gray-400'}`}>
                      <Brain className="w-7 h-7" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-lg text-white truncate">{quiz.bossName}</h4>
                      <p className="text-sm text-gray-500 truncate">{quiz.description}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/20">{quiz.questions.length} Questions</span>
                        <span className="text-[10px] font-bold text-red-400 bg-red-900/30 px-2 py-0.5 rounded border border-red-500/20">HP: {(quiz.currentHp || quiz.maxHp).toLocaleString()}/{quiz.maxHp.toLocaleString()}</span>
                        <span className="text-[10px] font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20">{quiz.damagePerCorrect} dmg/correct</span>
                        <span className="text-[10px] font-bold text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/20">{quiz.classType}</span>
                        {quiz.targetSections?.length ? <span className="text-[10px] font-bold text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/20">{quiz.targetSections.join(', ')}</span> : null}
                        {isExpired && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-500/20">EXPIRED</span>}
                      </div>
                      <div className="mt-2 w-full max-w-xs h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                        <div className={`h-full rounded-full transition-all ${hpPercent > 50 ? 'bg-amber-500' : hpPercent > 20 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${hpPercent}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openQuizBossForm(quiz)} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20 text-[10px] font-bold uppercase tracking-wide"><Pencil className="w-3 h-3 inline mr-1" />Edit</button>
                    <button onClick={() => handleToggleQuizBoss(quiz)} className={`w-12 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${quiz.isActive ? 'bg-amber-600' : 'bg-gray-700'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${quiz.isActive ? 'translate-x-6' : ''}`} />
                    </button>
                    <button onClick={() => handleDeleteQuizBoss(quiz)} className="p-2 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Admin Tutoring Oversight */}
          {activeTab === 'TUTORING' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 mb-2">Monitor peer tutoring sessions. Verify completed sessions to award XP and Flux to tutors.</p>

              <div className="flex gap-2 mb-4">
                <button onClick={() => setTutoringActiveTab('pending')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${tutoringActiveTab === 'pending' ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                  Pending ({pendingTutoringSessions.length})
                </button>
                <button onClick={() => setTutoringActiveTab('all')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${tutoringActiveTab === 'all' ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                  All Sessions ({allTutoringSessions.length})
                </button>
              </div>

              {(tutoringActiveTab === 'pending' ? pendingTutoringSessions : allTutoringSessions).length === 0 && (
                <div className="text-center py-14 text-gray-500">
                  <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-bold">{tutoringActiveTab === 'pending' ? 'No pending sessions.' : 'No tutoring sessions yet.'}</p>
                </div>
              )}

              {(tutoringActiveTab === 'pending' ? pendingTutoringSessions : allTutoringSessions).map(session => (
                <div key={session.id} className={`p-5 rounded-2xl border transition-all ${
                  session.status === 'VERIFIED' ? 'bg-green-600/5 border-green-500/20' :
                  session.status === 'MATCHED' || session.status === 'IN_PROGRESS' ? 'bg-purple-600/5 border-purple-500/20' :
                  session.status === 'OPEN' ? 'bg-blue-600/5 border-blue-500/20' : 'bg-black/20 border-white/10'
                }`}>
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageCircle className="w-4 h-4 text-gray-500" />
                        <h4 className="font-bold text-white text-sm truncate">{session.topic}</h4>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${
                          session.status === 'OPEN' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          session.status === 'MATCHED' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                          session.status === 'IN_PROGRESS' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                          session.status === 'VERIFIED' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                          'bg-orange-500/10 text-orange-400 border-orange-500/20'
                        }`}>{session.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[10px] text-gray-500">
                        <span>Requester: <span className="text-gray-300 font-bold">{session.requesterName}</span></span>
                        {session.tutorName && <span>Tutor: <span className="text-green-400 font-bold">{session.tutorName}</span></span>}
                        <span>Class: <span className="text-purple-400">{session.classType}</span></span>
                        <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                        {session.completedAt && <span>Completed: {new Date(session.completedAt).toLocaleDateString()}</span>}
                      </div>
                      {/* Feedback display */}
                      {(session.requesterFeedback || session.tutorFeedback) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                          {session.requesterFeedback && (
                            <div className="p-2 bg-black/20 rounded-lg border border-white/5">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-bold text-cyan-400 uppercase">Student Feedback</span>
                                <span className="text-[9px] text-yellow-400">{'★'.repeat(session.requesterFeedback.rating)}{'☆'.repeat(5 - session.requesterFeedback.rating)}</span>
                                <span className="text-[9px] text-gray-500">Comm: {session.requesterFeedback.communicationRating}/5</span>
                              </div>
                              <p className="text-[10px] text-gray-400 leading-relaxed">{session.requesterFeedback.response}</p>
                            </div>
                          )}
                          {session.tutorFeedback && (
                            <div className="p-2 bg-black/20 rounded-lg border border-white/5">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-bold text-green-400 uppercase">Tutor Feedback</span>
                                <span className="text-[9px] text-yellow-400">{'★'.repeat(session.tutorFeedback.rating)}{'☆'.repeat(5 - session.tutorFeedback.rating)}</span>
                                <span className="text-[9px] text-gray-500">Engage: {session.tutorFeedback.communicationRating}/5</span>
                              </div>
                              <p className="text-[10px] text-gray-400 leading-relaxed">{session.tutorFeedback.response}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {session.tutorId && session.status === 'COMPLETED' && (
                        <button onClick={() => handleAdminVerifyTutoring(session.id, session.tutorId!)}
                          className="px-3 py-1.5 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 transition border border-green-500/20 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Verify & Award
                        </button>
                      )}
                      {session.status !== 'VERIFIED' && (
                        <button onClick={() => handleAdminCancelTutoring(session.id)}
                          className="px-3 py-1.5 bg-red-600/10 text-red-400 rounded-lg hover:bg-red-600/20 transition border border-red-500/20 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      )}
                      {session.status === 'VERIFIED' && (
                        <span className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> +{session.xpReward} XP, +{session.fluxReward || 25} Flux
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <InspectInventoryModal user={inspectingUser} onClose={() => setInspectingUser(null)} onDeleteItem={handleDeleteItem} onUnequipItem={handleUnequipItem} onGrantFlux={handleGrantFlux} />
      <MissionFormModal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} form={missionForm} setForm={setMissionForm} onSubmit={handleIssueMission} isSubmitting={isSubmittingQuest} availableSections={availableSections} />
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title="New XP Protocol Deployment">
        <form onSubmit={handleCreateEvent} className="space-y-4 text-gray-100 p-2">
          <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Protocol Title</label><input value={newEventData.title} onChange={e => setNewEventData({...newEventData, title: e.target.value})} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" placeholder="e.g. Double XP Weekend" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Multiplier</label><input type="number" step="0.5" value={newEventData.multiplier} onChange={e => setNewEventData({...newEventData, multiplier: parseFloat(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" /></div>
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Uplink Type</label><select value={newEventData.type} onChange={e => setNewEventData({...newEventData, type: e.target.value as 'GLOBAL' | 'CLASS_SPECIFIC'})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold"><option value="GLOBAL">Global Node</option><option value="CLASS_SPECIFIC">Class Sub-Node</option></select></div>
          </div>
          {newEventData.type === 'CLASS_SPECIFIC' && <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Target Sub-Node</label><select value={newEventData.targetClass} onChange={e => setNewEventData({...newEventData, targetClass: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold">{Object.values(DefaultClassTypes).map(c => <option key={c} value={c}>{c}</option>)}</select></div>}
          <SectionPicker availableSections={availableSections} selectedSections={newEventData.targetSections} onChange={s => setNewEventData({...newEventData, targetSections: s})} />
          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:bg-blue-700">Initiate Uplink</button>
        </form>
      </Modal>
      <AdjustXPModal user={adjustingUser} onClose={() => setAdjustingUser(null)} onAdjust={handleAdjustXP} />

      {/* Quiz Boss Create/Edit Modal */}
      <Modal isOpen={isQuizBossModalOpen} onClose={() => setIsQuizBossModalOpen(false)} title={editingQuizBoss ? 'Edit Quiz Boss' : 'Deploy Quiz Boss'} maxWidth="max-w-2xl">
        <form onSubmit={handleSaveQuizBoss} className="space-y-4 text-gray-100 p-2 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Boss Name</label>
            <input value={quizBossForm.bossName} onChange={e => setQuizBossForm({ ...quizBossForm, bossName: e.target.value })} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold" placeholder="e.g. The Knowledge Sphinx" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Description</label>
            <textarea value={quizBossForm.description} onChange={e => setQuizBossForm({ ...quizBossForm, description: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white resize-none h-16" placeholder="A mythical beast that can only be defeated by knowledge..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Max HP</label>
              <input type="number" value={quizBossForm.maxHp} onChange={e => setQuizBossForm({ ...quizBossForm, maxHp: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-bold text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Dmg Per Correct</label>
              <input type="number" value={quizBossForm.damagePerCorrect} onChange={e => setQuizBossForm({ ...quizBossForm, damagePerCorrect: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-bold text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Target Class</label>
              <select value={quizBossForm.classType} onChange={e => setQuizBossForm({ ...quizBossForm, classType: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-bold text-sm">
                <option value="GLOBAL">All Classes</option>
                {Object.values(DefaultClassTypes).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <SectionPicker availableSections={availableSections} selectedSections={quizBossForm.targetSections} onChange={s => setQuizBossForm({ ...quizBossForm, targetSections: s })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Deadline</label>
              <input type="datetime-local" value={quizBossForm.deadline} onChange={e => setQuizBossForm({ ...quizBossForm, deadline: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-bold text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9px] text-gray-500 mb-1 px-1">Reward XP</label>
                <input type="number" value={quizBossForm.rewardXp} onChange={e => setQuizBossForm({ ...quizBossForm, rewardXp: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 mb-1 px-1">Flux</label>
                <input type="number" value={quizBossForm.rewardFlux} onChange={e => setQuizBossForm({ ...quizBossForm, rewardFlux: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 mb-1 px-1">Loot</label>
                <select value={quizBossForm.rewardItemRarity} onChange={e => setQuizBossForm({ ...quizBossForm, rewardItemRarity: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-xs font-bold">
                  <option value="">None</option>
                  <option value="UNCOMMON">Uncommon</option>
                  <option value="RARE">Rare</option>
                  <option value="UNIQUE">Unique</option>
                </select>
              </div>
            </div>
          </div>

          {/* Questions */}
          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <label className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Questions ({quizBossForm.questions.length})</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleCopyQuizPrompt} className={`text-xs px-3 py-1 rounded-lg transition font-bold flex items-center gap-1 ${promptCopied ? 'bg-green-600/20 text-green-400' : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'}`}>
                  {promptCopied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy AI Prompt</>}
                </button>
                <label className="text-xs bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg hover:bg-blue-600/30 transition font-bold flex items-center gap-1 cursor-pointer">
                  <Upload className="w-3 h-3" /> Import JSON
                  <input ref={quizFileRef} type="file" accept=".json,.txt" onChange={handleImportQuizQuestions} className="hidden" />
                </label>
                <button type="button" onClick={addQuizQuestion} className="text-xs bg-amber-600/20 text-amber-400 px-3 py-1 rounded-lg hover:bg-amber-600/30 transition font-bold flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Manual
                </button>
              </div>
            </div>

            {importError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400 flex items-center gap-2">
                <X className="w-4 h-4 flex-shrink-0" />
                {importError}
                <button type="button" onClick={() => setImportError(null)} className="ml-auto text-red-500 hover:text-red-300"><X className="w-3 h-3" /></button>
              </div>
            )}

            {quizBossForm.questions.length === 0 && (
              <div className="text-center py-6 space-y-2">
                <FileJson className="w-8 h-8 mx-auto text-gray-600 opacity-30" />
                <p className="text-xs text-gray-600">No questions yet.</p>
                <p className="text-[10px] text-gray-700">Use <span className="text-purple-400">Copy AI Prompt</span> → paste into ChatGPT/Claude → save JSON → <span className="text-blue-400">Import JSON</span></p>
              </div>
            )}

            {quizBossForm.questions.map((q, qIdx) => (
              <div key={q.id} className="bg-black/30 rounded-xl border border-white/5 p-4 mb-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-[9px] text-gray-500 mb-1">Question #{qIdx + 1}</label>
                    <textarea
                      value={q.stem}
                      onChange={e => updateQuizQuestion(qIdx, 'stem', e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-sm resize-none h-14"
                      placeholder="e.g. What is the acceleration due to gravity on Earth?"
                      required
                    />
                  </div>
                  <button type="button" onClick={() => removeQuizQuestion(qIdx)} className="text-gray-600 hover:text-red-400 mt-4"><Trash2 className="w-4 h-4" /></button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {q.options.map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuizQuestion(qIdx, 'correctAnswer', optIdx)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                          q.correctAnswer === optIdx ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-gray-600 text-transparent hover:border-gray-400'
                        }`}
                        title="Mark as correct answer"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <input
                        value={opt}
                        onChange={e => updateQuizOption(qIdx, optIdx, e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg p-1.5 text-white text-xs"
                        placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                        required
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={q.difficulty}
                    onChange={e => updateQuizQuestion(qIdx, 'difficulty', e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg p-1.5 text-white text-xs font-bold"
                  >
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-gray-500">Bonus Dmg:</label>
                    <input
                      type="number"
                      value={q.damageBonus}
                      onChange={e => updateQuizQuestion(qIdx, 'damageBonus', parseInt(e.target.value) || 0)}
                      className="w-16 bg-black/40 border border-white/10 rounded-lg p-1.5 text-white text-xs font-bold"
                      min={0}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="w-full bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:bg-amber-700">
            {editingQuizBoss ? 'Update Quiz Boss' : 'Deploy Quiz Boss'}
          </button>
        </form>
      </Modal>
    </div>
  );
};

export default XPManagement;


import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { User, Assignment, Submission, RPGItem, Quest, ClassConfig } from '../types';
import { ChevronRight, Microscope, ChevronDown, Zap, Hexagon, Megaphone, X as XIcon, Flame, Sparkles, Eye } from 'lucide-react';

import { FeatureErrorBoundary } from './ErrorBoundary';
import { dataService } from '../services/dataService';
import { getRankDetails, getAssetColors, calculateGearScore, getLevelProgress, xpForLevel, MAX_LEVEL } from '../lib/gamification';
import { getClassProfile } from '../lib/classProfile';
import { useAnimatedCounter } from '../lib/useAnimatedCounter';
import { sfx } from '../lib/sfx';
import { getSessionState } from '../lib/useStudentSession';
import { reportError } from '../lib/errorReporting';
import { useIsMounted } from '../lib/useIsMounted';
import { useGameData } from '../lib/AppDataContext';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import Modal from './Modal';
import { Announcement } from '../types';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { useReducedMotion } from '../lib/useReducedMotion';
import GamificationSkeleton from './GamificationSkeleton';
import LootDropAnimation from './xp/LootDropAnimation';
import ProfileShowcase from './ProfileShowcase';
import { getStreakMultiplier } from '../lib/achievements';
import IntelDossier from './IntelDossier';
const HomeTab = lazyWithRetry(() => import('./dashboard/HomeTab'));
const MissionsTab = lazyWithRetry(() => import('./dashboard/MissionsTab'));
const ResourcesTab = lazyWithRetry(() => import('./dashboard/ResourcesTab'));
const AgentLoadoutTab = lazyWithRetry(() => import('./dashboard/AgentLoadoutTab'));
const BadgesTab = lazyWithRetry(() => import('./dashboard/BadgesTab'));
const ProgressDashboard = lazyWithRetry(() => import('./dashboard/ProgressDashboard'));
const CalendarView = lazyWithRetry(() => import('./dashboard/CalendarView'));
const SkillTreePanel = lazyWithRetry(() => import('./xp/SkillTreePanel'));
const FortuneWheel = lazyWithRetry(() => import('./xp/FortuneWheel'));
const BossEncounterPanel = lazyWithRetry(() => import('./xp/BossEncounterPanel'));
const BossQuizPanel = lazyWithRetry(() => import('./xp/BossQuizPanel'));
const TutoringPanel = lazyWithRetry(() => import('./xp/TutoringPanel'));
const DungeonPanel = lazyWithRetry(() => import('./xp/DungeonPanel'));
const ArenaPanel = lazyWithRetry(() => import('./xp/ArenaPanel'));
const IdleMissionsPanel = lazyWithRetry(() => import('./xp/IdleMissionsPanel'));
const FluxShopPanel = lazyWithRetry(() => import('./xp/FluxShopPanel'));

type StudentTab = 'HOME' | 'RESOURCES' | 'LOADOUT' | 'MISSIONS' | 'ACHIEVEMENTS' | 'SKILLS' | 'FORTUNE' | 'FLUX_SHOP' | 'TUTORING' | 'INTEL' | 'PROGRESS' | 'CALENDAR' | 'DUNGEONS' | 'ARENA' | 'DEPLOY';

interface StudentDashboardProps {
  user: User;
  assignments: Assignment[];
  submissions: Submission[];
  classConfigs?: ClassConfig[];
  enabledFeatures: {
    evidenceLocker: boolean;
    leaderboard: boolean;
    physicsTools: boolean;
    communications: boolean;
    dungeons: boolean;
    pvpArena: boolean;
    bossFights: boolean;
  };
  onNavigate: (tab: string) => void;
  onStartAssignment?: (id: string) => void;
  studentTab?: StudentTab;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, assignments, submissions, classConfigs, enabledFeatures, onNavigate, onStartAssignment, studentTab = 'RESOURCES' }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const isMounted = useIsMounted();
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  // Initialize activeClass from user, but DON'T snap back on every classType change.
  // For multi-class students, activeClass is the local view selector.
  const [activeClass, setActiveClass] = useState<string>(user.classType || user.enrolledClasses?.[0] || 'Unassigned');
  const { xpEvents, quests: allQuests } = useGameData();
  const reducedMotion = useReducedMotion();

  // Preload heavy gamification chunks during idle time
  useEffect(() => {
    const safeImport = (loader: () => Promise<unknown>) => loader().catch(() => {});
    const preload = () => {
      safeImport(() => import('./dashboard/HomeTab'));
      safeImport(() => import('./dashboard/MissionsTab'));
      safeImport(() => import('./dashboard/ResourcesTab'));
      safeImport(() => import('./dashboard/AgentLoadoutTab'));
      safeImport(() => import('./dashboard/BadgesTab'));
      safeImport(() => import('./dashboard/ProgressDashboard'));
      safeImport(() => import('./dashboard/CalendarView'));
      safeImport(() => import('./xp/SkillTreePanel'));
      safeImport(() => import('./xp/FortuneWheel'));
      safeImport(() => import('./xp/DungeonPanel'));
      safeImport(() => import('./xp/ArenaPanel'));
      safeImport(() => import('./xp/FluxShopPanel'));
      safeImport(() => import('./xp/BossEncounterPanel'));
      safeImport(() => import('./xp/BossQuizPanel'));
      safeImport(() => import('./xp/TutoringPanel'));
      safeImport(() => import('./xp/IdleMissionsPanel'));
    };
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(preload, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(preload, 3000);
      return () => clearTimeout(id);
    }
  }, []);

  // Practice progress (completion badges)
  const [practiceCompletion, setPracticeCompletion] = useState<Record<string, { completed: boolean; totalCompletions: number; bestScore: number | null; completedAt: string | null }>>({});

  // RPG State — session state survives ErrorBoundary remounts via per-user store (#19)
  const session = getSessionState(user.id, user.gamification?.lastLevelSeen || 1);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [newlyAcquiredItem, setNewlyAcquiredItem] = useState<RPGItem | null>(null);
  // Tab transition: displayTab lags behind studentTab by 150ms to allow exit animation
  const [displayTab, setDisplayTab] = useState<StudentTab>(studentTab);
  const [tabExiting, setTabExiting] = useState(false);
  const tabExitRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (studentTab !== displayTab && !tabExiting) {
      setTabExiting(true);
      tabExitRef.current = setTimeout(() => {
        setDisplayTab(studentTab);
        setTabExiting(false);
      }, 150);
      return () => { if (tabExitRef.current) clearTimeout(tabExitRef.current); };
    }
    // If studentTab changed while already exiting, update target
    if (studentTab !== displayTab && tabExiting) {
      if (tabExitRef.current) clearTimeout(tabExitRef.current);
      tabExitRef.current = setTimeout(() => {
        setDisplayTab(studentTab);
        setTabExiting(false);
      }, 150);
      return () => { if (tabExitRef.current) clearTimeout(tabExitRef.current); };
    }
  }, [studentTab]);
  const activeTab = displayTab;
  const [xpFloatAmount, setXpFloatAmount] = useState<number | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [lootDropItem, setLootDropItem] = useState<RPGItem | null>(null);
  const [dailyLoginClaimed, setDailyLoginClaimed] = useState(false);
  const [questActionLoading, setQuestActionLoading] = useState<string | null>(null);

  // Guard against duplicate level-up triggers from rapid re-renders
  const levelUpTriggeredRef = React.useRef(false);
  useEffect(() => {
      const currentLevel = user.gamification?.level || 1;
      const lastSeen = Math.max(user.gamification?.lastLevelSeen || 1, session.acknowledgedLevel);

      if (currentLevel > lastSeen && !levelUpTriggeredRef.current) {
          levelUpTriggeredRef.current = true;
          session.acknowledgedLevel = currentLevel;
          const inventory = user.gamification?.inventory || [];
          const latestItem = inventory.length > 0 ? inventory[inventory.length - 1] : null;
          setNewlyAcquiredItem(latestItem);
          setShowLevelUp(true);
          sfx.levelUp();
      } else if (currentLevel <= lastSeen) {
          // Reset guard when level is acknowledged
          levelUpTriggeredRef.current = false;
      }
  }, [user.gamification?.level, user.gamification?.lastLevelSeen]);

  // Derived from AppDataContext — no per-component subscription needed
  const activeEvent = useMemo(() => {
    return xpEvents.find(e => {
      if (!e.isActive) return false;
      if (e.type !== 'GLOBAL' && e.targetClass !== activeClass) return false;
      if (e.scheduledAt && new Date(e.scheduledAt) > new Date()) return false;
      if (e.targetSections?.length) {
        const evtClass = e.type !== 'GLOBAL' && e.targetClass ? e.targetClass : activeClass;
        const sec = user.classSections?.[evtClass] || user.classSections?.[activeClass] || user.section || '';
        if (!e.targetSections.includes(sec)) return false;
      }
      return true;
    }) || null;
  }, [xpEvents, activeClass, user.classSections, user.section]);

  const availableQuests = useMemo(() => {
    const myClasses = user.enrolledClasses || (user.classType ? [user.classType] : []);
    return allQuests.filter(q => {
      if (!q.isActive) return false;
      const now = new Date();
      if (q.startsAt && new Date(q.startsAt) > now) return false;
      if (q.expiresAt && new Date(q.expiresAt) < now) return false;
      if (q.targetClass && !myClasses.includes(q.targetClass)) return false;
      if (q.targetSections?.length) {
        const questSection = user.classSections?.[q.targetClass || activeClass] || user.section || '';
        if (!q.targetSections.includes(questSection)) return false;
      }
      return true;
    });
  }, [allQuests, user.enrolledClasses, user.classType, user.classSections, user.section, activeClass]);

  useEffect(() => {
    try {
      const unsub = dataService.subscribeToStudentPracticeProgress(user.id, setPracticeCompletion);
      return () => unsub();
    } catch (e) { reportError(e, { subscription: 'practiceProgress' }); }
  }, [user.id]);

  // Detect XP changes and show floating animation
  const classXp = user.gamification?.classXp?.[activeClass] || 0;
  const prevXpRef = React.useRef(classXp);
  const prevClassRef = React.useRef(activeClass);
  useEffect(() => {
      // Reset ref when switching classes to avoid spurious animations
      if (prevClassRef.current !== activeClass) {
          prevClassRef.current = activeClass;
          prevXpRef.current = classXp;
          return;
      }
      if (classXp > prevXpRef.current && prevXpRef.current >= 0) {
          const gained = classXp - prevXpRef.current;
          if (gained > 0 && gained < 500) {
              setXpFloatAmount(gained);
              sfx.xpGain();
              const timer = setTimeout(() => setXpFloatAmount(null), 2000);
              return () => clearTimeout(timer);
          }
      }
      prevXpRef.current = classXp;
  }, [classXp]);

  // Daily login reward — single attempt on mount, no retry
  useEffect(() => {
    if (session.dailyLoginAttempted) return;
    session.dailyLoginAttempted = true;
    const today = new Date().toISOString().split('T')[0];
    const lastClaim = user.gamification?.lastLoginRewardDate;
    if (lastClaim !== today && !dailyLoginClaimed) {
      dataService.claimDailyLogin().then(result => {
        if (!isMounted()) return;
        if (!result.alreadyClaimed) {
          setDailyLoginClaimed(true);
          sfx.dailyReward();
          toast.success(`Daily login: +${result.xpReward} XP, +${result.fluxReward} Flux (${result.streak}-day streak!)`);
        }
      }).catch(err => reportError(err, { context: 'claimDailyLogin' }));
    }
  }, []); // Run once on mount

  // Update engagement streak — single attempt, no retry
  useEffect(() => {
    if (session.streakAttempted) return;
    session.streakAttempted = true;
    dataService.updateEngagementStreak().catch(err => reportError(err, { context: 'updateEngagementStreak' }));
  }, []);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  useEffect(() => {
    try {
      const unsub = dataService.subscribeToAnnouncements(setAnnouncements);
      return () => unsub();
    } catch (e) { reportError(e, { subscription: 'announcements' }); }
  }, []);

  const visibleAnnouncements = useMemo(() => {
    const dismissed = user.gamification?.dismissedAnnouncements || [];
    return announcements.filter(a => {
      if (dismissed.includes(a.id)) return false;
      if (a.classType !== 'GLOBAL' && a.classType !== activeClass) return false;
      if (a.targetSections?.length) {
        const annClass = a.classType !== 'GLOBAL' ? a.classType : activeClass;
        const sec = user.classSections?.[annClass] || user.classSections?.[activeClass] || user.section || '';
        if (!a.targetSections.includes(sec)) return false;
      }
      if (a.targetStudentIds?.length && !a.targetStudentIds.includes(user.id)) return false;
      return true;
    });
  }, [announcements, user.gamification?.dismissedAnnouncements, activeClass, user.classSections, user.section, user.id]);

  const handleDismissAnnouncement = useCallback(async (id: string) => {
    await dataService.dismissAnnouncement(user.id, id);
  }, [user.id]);

  const handleLevelUpAck = useCallback(() => {
      const currentLevel = user.gamification?.level || 1;
      session.acknowledgedLevel = currentLevel;
      levelUpTriggeredRef.current = false;
      setShowLevelUp(false);
      setNewlyAcquiredItem(null);
      dataService.updateUserLastLevelSeen(user.id, currentLevel).catch(err => reportError(err, { method: 'updateUserLastLevelSeen' }));
  }, [user.id, user.gamification?.level]);

  const enrolledClasses = user.enrolledClasses || (user.classType ? [user.classType] : []);
  const classProfile = useMemo(() => getClassProfile(user, activeClass), [user, activeClass]);
  const equipped = classProfile.equipped;
  const playerStats = useMemo(() => {
      const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
      const items: RPGItem[] = Object.values(equipped).filter(Boolean) as RPGItem[];
      items.forEach(item => {
          if (item.stats) Object.entries(item.stats).forEach(([key, val]) => { base[key as keyof typeof base] += (val as number); });
      });
      return base;
  }, [equipped]);
  const gearScore = useMemo(() => calculateGearScore(equipped), [equipped]);

  const unitGroups = useMemo(() => {
    const groups: Record<string, (Assignment & { lastEngagement: string | null; engagementTime: number })[]> = {};
    assignments
      .filter(a => {
        if (a.classType !== activeClass) return false;
        if (a.status === 'DRAFT' || a.status === 'ARCHIVED') return false;
        // Hide future-scheduled resources
        if (a.scheduledAt && new Date(a.scheduledAt) > new Date()) return false;
        // Section filtering: check classSections first, fall back to legacy section
        if (a.targetSections?.length) {
          const studentSection = user.classSections?.[activeClass] || user.section || '';
          if (!a.targetSections.includes(studentSection)) return false;
        }
        return true;
      })
      .forEach(a => {
        const log = submissions.find(s => s.assignmentId === a.id);
        const unit = a.unit || 'General Resources';
        if (!groups[unit]) groups[unit] = [];
        groups[unit].push({ ...a, lastEngagement: log ? log.submittedAt || null : null, engagementTime: log?.metrics?.engagementTime || 0 });
      });
    // Sort resources within each unit: newest first
    Object.values(groups).forEach(items => {
      items.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // newest first
      });
    });
    return groups;
  }, [assignments, submissions, activeClass]);

  const toggleUnit = useCallback((unit: string) => {
    setExpandedUnits(prev => {
      const newSet = new Set(prev);
      if (newSet.has(unit)) newSet.delete(unit);
      else newSet.add(unit);
      return newSet;
    });
  }, []);

  const level = user.gamification?.level || 1;
  const currency = user.gamification?.currency || 0;
  const xp = classXp;
  const progress = useMemo(() => getLevelProgress(user.gamification?.xp || 0, level), [user.gamification?.xp, level]);
  const displayXp = useAnimatedCounter(xp);
  const displayCurrency = useAnimatedCounter(currency);
  const rankDetails = useMemo(() => getRankDetails(level), [level]);

  const handleClassChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newClass = e.target.value;
      const previousClass = activeClass;
      setActiveClass(newClass);
      try {
          await dataService.switchUserView(user.id, newClass);
      } catch {
          setActiveClass(previousClass);
          toast.error('Failed to switch class.');
      }
  }, [user.id, activeClass, toast]);

  // --- QUEST LOGIC ---
  const activeQuests = user.gamification?.activeQuests || [];
  const completedQuests = user.gamification?.completedQuests || [];

  const myAcceptedQuests = useMemo(() =>
    availableQuests.filter(q => activeQuests.some(aq => aq.questId === q.id)),
    [availableQuests, activeQuests]
  );
  const newQuests = useMemo(() =>
    availableQuests.filter(q =>
      !activeQuests.some(aq => aq.questId === q.id) &&
      !completedQuests.includes(q.id)
    ),
    [availableQuests, activeQuests, completedQuests]
  );

  const handleAcceptQuest = useCallback(async (quest: Quest) => {
      if (questActionLoading) return;
      setQuestActionLoading(quest.id);
      try {
          await dataService.acceptQuest(user.id, quest.id);
          sfx.questAccept();
          toast.success(`Contract accepted: ${quest.title}`);
      } catch {
          toast.error('Failed to accept contract.');
      } finally {
          setQuestActionLoading(null);
      }
  }, [user.id, toast, questActionLoading]);

  const handleDeployQuest = useCallback(async (quest: Quest) => {
      if (questActionLoading) return;
      const isManual = quest.type === 'CUSTOM';
      if(!await confirm({ message: isManual ? "Submit quest for manual HQ verification?" : "Deploy agent for skill check? This will calculate your success probability based on current gear.", confirmLabel: isManual ? "Submit" : "Deploy", variant: "info" })) return;
      setQuestActionLoading(quest.id);
      try {
          await dataService.deployMission(user.id, quest);
          sfx.questDeploy();
          toast.info('Mission deployed. Awaiting verification.');
      } catch {
          toast.error('Deployment failed.');
      } finally {
          setQuestActionLoading(null);
      }
  }, [user.id, confirm, toast, questActionLoading]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 lg:gap-8 h-full pb-6 lg:pb-12">

      {/* ANNOUNCEMENTS BANNER */}
      {visibleAnnouncements.length > 0 && (
        <div className="lg:col-span-12 space-y-2">
          {visibleAnnouncements.map(a => {
            const styles = {
              INFO: 'bg-blue-600/10 border-blue-500/30 text-blue-300',
              WARNING: 'bg-yellow-600/10 border-yellow-500/30 text-yellow-300',
              URGENT: 'bg-red-600/10 border-red-500/30 text-red-300 animate-pulse',
            };
            return (
              <div key={a.id} className={`border rounded-2xl p-4 flex items-start gap-3 ${styles[a.priority]}`}>
                <Megaphone className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-white">{a.title}</div>
                  <div className="text-xs mt-0.5 opacity-80">{a.content}</div>
                </div>
                <button onClick={() => handleDismissAnnouncement(a.id)} className="p-1 text-gray-500 hover:text-white transition shrink-0" aria-label="Dismiss announcement">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ACTIVE EVENT BANNER */}
      {activeEvent && (
        <div className="lg:col-span-12">
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/50 rounded-2xl p-4 flex items-center justify-between shadow-[0_0_20px_rgba(59,130,246,0.3)] animate-pulse">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500 text-white p-2 rounded-lg">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg uppercase tracking-wider">{activeEvent.title} ACTIVE</h3>
                <p className="text-blue-300 text-xs font-mono">Protocol engaged. Gaining {activeEvent.multiplier}x XP on all tasks.</p>
              </div>
            </div>
            <div className="text-3xl font-black text-white/90 font-mono tracking-tighter">
              {activeEvent.multiplier}x
            </div>
          </div>
        </div>
      )}

      {/* --- LEFT COLUMN: OPERATIVE STATUS --- */}
      <div className="lg:col-span-3 space-y-6">
        <div className={`bg-white/5 border rounded-3xl p-6 backdrop-blur-md relative overflow-hidden group ${rankDetails.tierColor.split(' ')[0]} border-opacity-30`}>
            <div className="absolute inset-0 bg-gradient-to-br from-black/40 to-transparent"></div>
            <div className="relative z-10 flex flex-col items-center">
                <div className={`w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-white/10 to-white/5 mb-4 ${rankDetails.tierGlow} shadow-xl`}>
                    <img
                      src={user.avatarUrl}
                      alt="Avatar"
                      className={`w-full h-full rounded-full border-4 object-cover ${rankDetails.tierColor.split(' ')[0]}`}
                    />
                </div>
                <h2 className="text-xl font-bold tracking-tight" style={user.gamification?.nameColor ? { color: user.gamification.nameColor } : { color: 'white' }}>{user.gamification?.codename || user.name}</h2>
                <div className="flex flex-col items-center gap-1">
                    <span className={`font-mono text-xs uppercase tracking-[0.2em] mt-1 font-bold ${rankDetails.tierColor.split(' ')[1]}`}>
                    {rankDetails.rankName} (Lvl {level})
                    </span>
                    <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/20 font-bold uppercase tracking-widest">
                        Gear Score: {gearScore}
                    </span>
                </div>

                {enrolledClasses.length > 1 && (
                    <div className="mt-4 relative w-full">
                        <select
                            value={activeClass}
                            onChange={handleClassChange}
                            className="w-full bg-black/40 border border-white/20 text-white text-xs font-bold py-2 px-4 rounded-xl appearance-none focus:outline-none focus:border-purple-500 transition"
                        >
                            {enrolledClasses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                )}

                <div className="w-full h-2 bg-black/60 rounded-full mt-6 overflow-hidden border border-white/5 relative" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={`XP progress: ${Math.round(progress)}% to next level`}>
                    <div className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex justify-between w-full text-[9px] text-gray-500 mt-2 font-mono font-bold relative">
                    <span>{displayXp.toLocaleString()} XP ({activeClass})</span>
                    <span>{level >= MAX_LEVEL ? 'MAX LEVEL' : `${xpForLevel(level + 1).toLocaleString()} XP`}</span>
                    {xpFloatAmount && (
                        <span className={`${reducedMotion ? '' : 'xp-float-anim'} absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 whitespace-nowrap`} aria-live="polite" role="status">
                            +{xpFloatAmount} XP
                        </span>
                    )}
                </div>
            </div>
        </div>

        <div className="bg-black/20 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Hexagon className="w-6 h-6" />
                </div>
                <div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Cyber-Flux</div>
                    <div className="text-xl font-black text-white leading-none">{displayCurrency}</div>
                </div>
            </div>
        </div>

        {/* Engagement Streak + Multiplier */}
        {(user.gamification?.engagementStreak || 0) > 0 && (() => {
            const streak = user.gamification?.engagementStreak || 0;
            const multiplier = getStreakMultiplier(streak);
            return (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center">
                            <Flame className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Streak</div>
                            <div className="text-xl font-black text-orange-400 leading-none">{streak}w</div>
                        </div>
                        {multiplier > 1 && (
                            <div className="text-right">
                                <div className="text-[9px] text-gray-500 uppercase">XP Bonus</div>
                                <div className="text-sm font-black text-yellow-400">+{Math.round((multiplier - 1) * 100)}%</div>
                            </div>
                        )}
                    </div>
                </div>
            );
        })()}

        {/* Login Streak */}
        {(user.gamification?.loginStreak || 0) > 1 && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-3 flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Daily Login</div>
                    <div className="text-sm font-black text-purple-400">{user.gamification?.loginStreak || 0} day streak</div>
                </div>
            </div>
        )}

        {/* Profile Showcase Button */}
        <button
            onClick={() => setShowProfile(true)}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 p-3 rounded-2xl flex items-center justify-center gap-2 transition text-gray-400 hover:text-white text-sm font-bold"
        >
            <Eye className="w-4 h-4" /> View Profile
        </button>

        <div className="space-y-2">
             <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">Access Nodes</label>
             {enabledFeatures.evidenceLocker && (
                 <button onClick={() => onNavigate('Forensics')} className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 p-4 rounded-2xl flex items-center justify-between transition group">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shadow-inner"><Microscope className="w-5 h-5" /></div>
                        <div className="text-left">
                            <div className="font-bold text-gray-200 text-sm">Evidence Log</div>
                            <div className="text-[10px] text-emerald-300/70 uppercase font-bold tracking-tight">Weekly Portfolio</div>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-emerald-500 group-hover:translate-x-1 transition" />
                 </button>
             )}
        </div>
      </div>

      {/* --- MIDDLE: CONTENT --- */}
      <div className="lg:col-span-9 space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md min-h-[600px] flex flex-col" role="tabpanel" aria-label={`${activeTab.charAt(0) + activeTab.slice(1).toLowerCase()} content`}>
           <div className={`flex-1 transition-all ${reducedMotion ? 'duration-0' : 'duration-150'} ease-in-out ${tabExiting ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>

             {activeTab === 'HOME' && (
                 <FeatureErrorBoundary feature="Home">
                   <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                   <HomeTab
                       assignments={assignments}
                       submissions={submissions}
                       activeClass={activeClass}
                       practiceCompletion={practiceCompletion}
                       availableQuests={availableQuests}
                       activeQuests={activeQuests}
                       completedQuests={completedQuests}
                       activeEvent={activeEvent}
                       onNavigate={onNavigate}
                       onStartAssignment={onStartAssignment}
                       userSection={user.section}
                       userClassSections={user.classSections}
                   />
                   </React.Suspense>
                 </FeatureErrorBoundary>
             )}

             {activeTab === 'MISSIONS' && (
                 <FeatureErrorBoundary feature="Missions">
                   <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                   <MissionsTab
                       newQuests={newQuests}
                       myAcceptedQuests={myAcceptedQuests}
                       activeQuests={activeQuests}
                       onAcceptQuest={handleAcceptQuest}
                       onDeployQuest={handleDeployQuest}
                       questActionLoading={questActionLoading}
                   />
                   </React.Suspense>
                 </FeatureErrorBoundary>
             )}

             {activeTab === 'RESOURCES' && (
                 <FeatureErrorBoundary feature="Resources">
                   <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                   <ResourcesTab
                       unitGroups={unitGroups}
                       expandedUnits={expandedUnits}
                       onToggleUnit={toggleUnit}
                       practiceCompletion={practiceCompletion}
                       onStartAssignment={onStartAssignment}
                       classConfigs={classConfigs}
                       activeClass={activeClass}
                       submissions={submissions}
                   />
                   </React.Suspense>
                 </FeatureErrorBoundary>
             )}

             {activeTab === 'LOADOUT' && (
               <FeatureErrorBoundary feature="Agent Loadout">
                 <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                 <AgentLoadoutTab user={user} activeClass={activeClass} level={level} />
                 </React.Suspense>
               </FeatureErrorBoundary>
             )}

             {activeTab === 'ACHIEVEMENTS' && (
               <FeatureErrorBoundary feature="Badges">
                 <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                 <BadgesTab user={user} activeClass={activeClass} />
                 </React.Suspense>
               </FeatureErrorBoundary>
             )}

             {activeTab === 'SKILLS' && (
                 <div key="skills" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FeatureErrorBoundary feature="Skill Tree">
                       <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                       <SkillTreePanel
                           specialization={user.gamification?.specialization}
                           skillPoints={user.gamification?.skillPoints || 0}
                           unlockedSkills={user.gamification?.unlockedSkills || []}
                       />
                       </React.Suspense>
                     </FeatureErrorBoundary>
                 </div>
             )}

             {activeTab === 'FORTUNE' && (
                 <div key="fortune" className="space-y-8" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FeatureErrorBoundary feature="Fortune Wheel">
                       <React.Suspense fallback={<GamificationSkeleton />}>
                       <FortuneWheel
                           currency={currency}
                           lastSpin={user.gamification?.lastWheelSpin}
                           classType={activeClass}
                       />
                       </React.Suspense>
                     </FeatureErrorBoundary>
                 </div>
             )}

             {activeTab === 'FLUX_SHOP' && (
                 <div key="flux-shop" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FeatureErrorBoundary feature="Flux Shop">
                       <React.Suspense fallback={<GamificationSkeleton />}>
                       <FluxShopPanel
                           currency={currency}
                           activeBoosts={user.gamification?.activeBoosts || []}
                           nameColor={user.gamification?.nameColor}
                           rerollTokens={user.gamification?.rerollTokens || 0}
                           consumablePurchases={user.gamification?.consumablePurchases || {}}
                           ownedCosmetics={user.gamification?.ownedCosmetics || []}
                           activeCosmetics={user.gamification?.activeCosmetics}
                           onEquipCosmetic={(cosmeticId, slot) => dataService.equipCosmetic(user.id, cosmeticId, slot)}
                           playerEquipped={equipped}
                           playerAppearance={classProfile.appearance}
                           playerEvolutionLevel={level}
                           selectedCharacterModel={user.gamification?.selectedCharacterModel}
                           ownedCharacterModels={user.gamification?.ownedCharacterModels || []}
                           onSelectCharacterModel={async (modelId) => {
                             try { await dataService.selectCharacterModel(user.id, modelId); } catch (err) { reportError(err, { context: 'selectCharacterModel' }); }
                           }}
                       />
                       </React.Suspense>
                     </FeatureErrorBoundary>
                 </div>
             )}

             {activeTab === 'TUTORING' && (
                 <div key="tutoring" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FeatureErrorBoundary feature="Tutoring">
                       <React.Suspense fallback={<GamificationSkeleton />}>
                       <TutoringPanel
                           userId={user.id}
                           userName={user.name}
                           classType={activeClass}
                       />
                       </React.Suspense>
                     </FeatureErrorBoundary>
                 </div>
             )}

             {activeTab === 'INTEL' && (
                 <div key="intel" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FeatureErrorBoundary feature="Intel Dossier">
                       <IntelDossier
                           user={user}
                           submissions={submissions}
                           assignments={assignments}
                           activeClass={activeClass}
                       />
                     </FeatureErrorBoundary>
                 </div>
             )}

             {activeTab === 'PROGRESS' && (
                 <FeatureErrorBoundary feature="Progress">
                   <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                   <ProgressDashboard
                       assignments={assignments}
                       submissions={submissions}
                       activeClass={activeClass}
                   />
                   </React.Suspense>
                 </FeatureErrorBoundary>
             )}

             {activeTab === 'CALENDAR' && (
                 <FeatureErrorBoundary feature="Calendar">
                   <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                   <CalendarView
                       assignments={assignments}
                       submissions={submissions}
                       activeClass={activeClass}
                       onStartAssignment={onStartAssignment}
                   />
                   </React.Suspense>
                 </FeatureErrorBoundary>
             )}

             {activeTab === 'DUNGEONS' && enabledFeatures.dungeons && (
                 <div key="dungeons" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FeatureErrorBoundary feature="Dungeons">
                       <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                       <DungeonPanel userId={user.id} classType={activeClass} playerAppearance={classProfile.appearance} playerEquipped={equipped} playerEvolutionLevel={level} selectedCharacterModel={user.gamification?.selectedCharacterModel} />
                       </React.Suspense>
                     </FeatureErrorBoundary>
                 </div>
             )}

             {activeTab === 'ARENA' && enabledFeatures.pvpArena && (
                 <div key="arena" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FeatureErrorBoundary feature="Arena">
                       <React.Suspense fallback={<GamificationSkeleton />}>
                       <ArenaPanel userId={user.id} classType={activeClass} />
                       </React.Suspense>
                     </FeatureErrorBoundary>
                 </div>
             )}

             {activeTab === 'DEPLOY' && (
                 <div key="deploy" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FeatureErrorBoundary feature="Idle Missions">
                       <React.Suspense fallback={<GamificationSkeleton />}>
                       <IdleMissionsPanel userId={user.id} classType={activeClass} />
                       </React.Suspense>
                     </FeatureErrorBoundary>
                 </div>
             )}
           </div>
          </div>
      </div>

      {/* BOSS ENCOUNTERS — Full-width panel */}
      {enabledFeatures.bossFights && (
      <div className="lg:col-span-12">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md space-y-6">
              <FeatureErrorBoundary feature="Boss Encounters">
                <React.Suspense fallback={<GamificationSkeleton />}>
                <BossEncounterPanel userId={user.id} userName={user.name} classType={activeClass} />
                </React.Suspense>
              </FeatureErrorBoundary>
              <FeatureErrorBoundary feature="Boss Quiz">
                <React.Suspense fallback={<GamificationSkeleton />}>
                <BossQuizPanel userId={user.id} classType={activeClass} userSection={user.classSections?.[activeClass] || user.section} userClassSections={user.classSections} playerStats={playerStats} playerAppearance={classProfile.appearance} playerEquipped={equipped} playerEvolutionLevel={level} />
                </React.Suspense>
              </FeatureErrorBoundary>
          </div>
      </div>
      )}

      {/* Profile Showcase */}
      {showProfile && (
          <ProfileShowcase user={user} classType={activeClass} onClose={() => setShowProfile(false)} />
      )}

      {/* Loot Drop Animation */}
      {lootDropItem && (
          <LootDropAnimation item={lootDropItem} onClose={() => setLootDropItem(null)} />
      )}

      <Modal isOpen={showLevelUp} onClose={handleLevelUpAck} title="PROMOTION GRANTED" maxWidth="max-w-md">
          <div className="text-center py-6 relative overflow-hidden">
              {/* CSS Confetti particles — skipped when reduced motion is preferred */}
              {!reducedMotion && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ contain: 'strict' }}>
                  {Array.from({ length: 20 }).map((_, i) => (
                      <div
                          key={i}
                          className="absolute w-2 h-2 rounded-full"
                          style={{
                              left: `${10 + Math.random() * 80}%`,
                              top: '-10px',
                              backgroundColor: ['#eab308', '#8b5cf6', '#06b6d4', '#f97316', '#22c55e', '#ec4899'][i % 6],
                              animation: `confettiDrift ${1.5 + Math.random() * 1.5}s ${Math.random() * 0.8}s ease-out forwards`,
                              opacity: 0.9,
                              willChange: 'transform, opacity',
                          }}
                      />
                  ))}
              </div>
              )}

              {/* Level Badge */}
              <div className="relative inline-block mb-6">
                  {/* Outer glow rings */}
                  <div className="absolute inset-[-12px] rounded-full border-2 border-yellow-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-[-6px] rounded-full border border-yellow-400/20 animate-pulse" />
                  {/* Main badge */}
                  <div className="level-up-burst w-28 h-28 mx-auto bg-gradient-to-tr from-yellow-400 via-amber-500 to-yellow-600 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(234,179,8,0.6)] relative">
                      <span className="text-5xl font-black text-white drop-shadow-lg">{level}</span>
                  </div>
              </div>

              {/* Rank reveal */}
              <div className="mb-2 overflow-hidden inline-block">
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight" style={{ animation: 'typeReveal 0.8s steps(20) 0.4s both', overflow: 'hidden', whiteSpace: 'nowrap', display: 'inline-block' }}>
                      {rankDetails.rankName}
                  </h2>
              </div>
              <p className="text-gray-400 mb-8 animate-in fade-in duration-500" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
                  Clearance Level Increased. New capabilities unlocked.
              </p>

              {newlyAcquiredItem && (
                  <div className={`${getAssetColors(newlyAcquiredItem.rarity).shimmer} bg-white/5 border rounded-xl p-5 mb-6 relative overflow-hidden ${getAssetColors(newlyAcquiredItem.rarity).border}`}
                       style={{ animation: 'levelUpBurst 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s both' }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-transparent opacity-50" />
                      <div className="relative z-10">
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mb-2">⚡ Supply Drop Received</div>
                          <div className={`text-xl font-bold ${getAssetColors(newlyAcquiredItem.rarity).text}`}>
                              {newlyAcquiredItem.name}
                          </div>
                          <div className="text-[10px] text-gray-500 uppercase font-mono mt-1">{newlyAcquiredItem.rarity} {newlyAcquiredItem.slot}</div>
                          <div className="flex justify-center gap-5 mt-3 text-[10px] font-mono">
                              {Object.entries(newlyAcquiredItem.stats).map(([key, val]) => (
                                  <span key={key} className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">+{val} {key.toUpperCase()}</span>
                              ))}
                          </div>
                      </div>
                  </div>
              )}

              {/* Delayed button */}
              <button
                  onClick={handleLevelUpAck}
                  className="w-full py-4 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black rounded-xl uppercase tracking-widest transition shadow-[0_0_30px_rgba(234,179,8,0.3)]"
                  style={{ animation: 'buttonFadeIn 0.4s ease-out 1.2s both' }}
              >
                  Accept Promotion
              </button>
          </div>
      </Modal>
    </div>
  );
};

export default StudentDashboard;

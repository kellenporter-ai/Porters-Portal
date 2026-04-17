
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { User, Assignment, Submission, RPGItem, ClassConfig } from '../types';
import { ChevronDown, Zap, Hexagon, Megaphone, X as XIcon, Flame, Sparkles, AlertTriangle, AlertCircle } from 'lucide-react';

import { FeatureErrorBoundary } from './ErrorBoundary';
import { dataService } from '../services/dataService';
import { getRankDetails, getAssetColors, getLevelProgress } from '../lib/gamification';
import { getClassProfile } from '../lib/classProfile';
import { useAnimatedCounter } from '../lib/useAnimatedCounter';
import { sfx } from '../lib/sfx';
import { getSessionState } from '../lib/useStudentSession';
import { reportError } from '../lib/errorReporting';
import { useIsMounted } from '../lib/useIsMounted';
import { useGameData } from '../lib/AppDataContext';
import { useToast } from './ToastProvider';
import Modal from './Modal';
import { Announcement } from '../types';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { useReducedMotion } from '../lib/useReducedMotion';
import GamificationSkeleton from './GamificationSkeleton';
import LootDropAnimation from './xp/LootDropAnimation';
import ProfileShowcase from './ProfileShowcase';
import { getStreakMultiplier } from '../lib/achievements';
import { STUDENT_TAB_MAP } from '../lib/routes';
import IntelDossier from './IntelDossier';
import { useTheme } from '../lib/ThemeContext';

// Reverse map: StudentTab key → nav name (for ARIA tabpanel IDs matching Layout's aria-controls)
const TAB_KEY_TO_NAV: Record<string, string> = Object.fromEntries(
  Object.entries(STUDENT_TAB_MAP).map(([navName, tabKey]) => [tabKey, navName])
);
const HomeTab = lazyWithRetry(() => import('./dashboard/HomeTab'));
const ResourcesTab = lazyWithRetry(() => import('./dashboard/ResourcesTab'));
const AgentLoadoutTab = lazyWithRetry(() => import('./dashboard/AgentLoadoutTab'));
const BadgesTab = lazyWithRetry(() => import('./dashboard/BadgesTab'));
const ProgressDashboard = lazyWithRetry(() => import('./dashboard/ProgressDashboard'));
const CalendarView = lazyWithRetry(() => import('./dashboard/CalendarView'));
const SkillTreePanel = lazyWithRetry(() => import('./xp/SkillTreePanel'));
const FortuneWheel = lazyWithRetry(() => import('./xp/FortuneWheel'));
const BossEncounterPanel = lazyWithRetry(() => import('./xp/BossEncounterPanel'));
const BossQuizPanel = lazyWithRetry(() => import('./xp/BossQuizPanel'));
const FluxShopPanel = lazyWithRetry(() => import('./xp/FluxShopPanel'));

type StudentTab = 'HOME' | 'RESOURCES' | 'LOADOUT' | 'ACHIEVEMENTS' | 'SKILLS' | 'FORTUNE' | 'FLUX_SHOP' | 'INTEL' | 'PROGRESS' | 'CALENDAR';

interface StudentDashboardProps {
  user: User;
  assignments: Assignment[];
  submissions: Submission[];
  classConfigs?: ClassConfig[];
  enabledFeatures: {
    evidenceLocker: boolean;
    leaderboard: boolean;
    bossFights: boolean;
  };
  onNavigate: (tab: string) => void;
  onStartAssignment?: (id: string) => void;
  studentTab?: StudentTab;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, assignments, submissions, classConfigs, enabledFeatures, onNavigate, onStartAssignment, studentTab = 'HOME' }) => {
  const toast = useToast();
  const isMounted = useIsMounted();
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  // Initialize activeClass from user, but DON'T snap back on every classType change.
  // For multi-class students, activeClass is the local view selector.
  const [activeClass, setActiveClass] = useState<string>(user.classType || user.enrolledClasses?.[0] || 'Unassigned');
  const { xpEvents } = useGameData();
  const reducedMotion = useReducedMotion();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Preload heavy gamification chunks during idle time
  useEffect(() => {
    const safeImport = (loader: () => Promise<unknown>) => loader().catch(() => {});
    const preload = () => {
      safeImport(() => import('./dashboard/HomeTab'));
      safeImport(() => import('./dashboard/ResourcesTab'));
      safeImport(() => import('./dashboard/AgentLoadoutTab'));
      safeImport(() => import('./dashboard/BadgesTab'));
      safeImport(() => import('./dashboard/ProgressDashboard'));
      safeImport(() => import('./dashboard/CalendarView'));
      safeImport(() => import('./xp/SkillTreePanel'));
      safeImport(() => import('./xp/FortuneWheel'));
      safeImport(() => import('./xp/FluxShopPanel'));
      safeImport(() => import('./xp/BossEncounterPanel'));
      safeImport(() => import('./xp/BossQuizPanel'));
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
  const tabpanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (studentTab !== displayTab && !tabExiting) {
      setTabExiting(true);
      tabExitRef.current = setTimeout(() => {
        setDisplayTab(studentTab);
        setTabExiting(false);
        tabpanelRef.current?.focus();
      }, 150);
      return () => { if (tabExitRef.current) clearTimeout(tabExitRef.current); };
    }
    // If studentTab changed while already exiting, update target
    if (studentTab !== displayTab && tabExiting) {
      if (tabExitRef.current) clearTimeout(tabExitRef.current);
      tabExitRef.current = setTimeout(() => {
        setDisplayTab(studentTab);
        setTabExiting(false);
        tabpanelRef.current?.focus();
      }, 150);
      return () => { if (tabExitRef.current) clearTimeout(tabExitRef.current); };
    }
  }, [studentTab]);
  const activeTab = displayTab;

  const [showProfile, setShowProfile] = useState(false);
  const [lootDropItem, setLootDropItem] = useState<RPGItem | null>(null);
  const [dailyLoginClaimed, setDailyLoginClaimed] = useState(false);

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
              sfx.xpGain();
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
  const progress = useMemo(() => getLevelProgress(user.gamification?.xp || 0, level), [user.gamification?.xp, level]);
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
          toast.error('Could not switch class. Check your connection and try again.');
      }
  }, [user.id, activeClass, toast]);

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 lg:gap-5 h-full pb-6 lg:pb-8">
      {/* Mobile class selector — visible below lg where the sidebar selector is hidden */}
      {enrolledClasses.length > 1 && (
        <div className="lg:hidden relative">
          <select
            value={activeClass}
            onChange={handleClassChange}
            aria-label="Switch active class"
            className="w-full bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-primary)] text-sm font-bold py-2.5 px-4 rounded-xl appearance-none focus:outline-none focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500 transition"
          >
            {enrolledClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
        </div>
      )}

      {/* ANNOUNCEMENTS BANNER */}
      {visibleAnnouncements.length > 0 && (
        <section aria-label="Announcements" className="space-y-2">
          {visibleAnnouncements.map(a => {
            const styles = {
              INFO: 'bg-blue-600/10 border-blue-500/30 text-blue-300',
              WARNING: 'bg-yellow-600/10 border-yellow-500/30 text-yellow-300',
              URGENT: 'bg-red-600/10 border-red-500/30 text-red-300',
            };
            const AnnouncementIcon = a.priority === 'URGENT' ? AlertCircle : a.priority === 'WARNING' ? AlertTriangle : Megaphone;
            return (
              <div key={a.id} className={`border rounded-2xl p-4 flex items-start gap-3 ${styles[a.priority]}`} {...(a.priority === 'URGENT' ? { role: 'alert' } : {})}>
                <AnnouncementIcon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-[var(--text-primary)]"><span className="sr-only">{a.priority === 'URGENT' ? 'Urgent: ' : a.priority === 'WARNING' ? 'Warning: ' : 'Info: '}</span>{a.title}</h3>
                  <div className="text-xs mt-0.5 text-[var(--text-primary)]">{a.content}</div>
                </div>
                <button onClick={() => handleDismissAnnouncement(a.id)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition shrink-0 focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg" aria-label="Dismiss announcement">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* ACTIVE EVENT BANNER */}
      {activeEvent && (
        <div>
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/50 rounded-2xl p-4 flex items-center justify-between shadow-[0_0_20px_rgba(59,130,246,0.3)]" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500 text-white p-2 rounded-lg">
                <Zap className="w-5 h-5 fill-current" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-[var(--text-primary)] font-bold text-lg uppercase tracking-wider">{activeEvent.title} ACTIVE</h3>
                <p className="text-blue-300 text-xs font-mono">Protocol engaged. Gaining {activeEvent.multiplier}x XP on all tasks.</p>
              </div>
            </div>
            <div className="text-3xl font-black text-[var(--text-primary)] font-mono tracking-tighter">
              {activeEvent.multiplier}x
            </div>
          </div>
        </div>
      )}

      {/* --- OPERATIVE STATUS: compact horizontal strip at all sizes --- */}
      <aside aria-label="Player status" className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 lg:gap-3">
        {/* Identity card — avatar, name, rank, XP */}
        <div className={`bg-[var(--surface-glass)] border rounded-xl lg:rounded-xl p-3 lg:py-2 lg:px-3 backdrop-blur-md relative overflow-hidden group lg:flex-1 ${rankDetails.tierColor.split(' ')[0]} border-opacity-30`}>
            <div className="absolute inset-0 bg-gradient-to-br from-black/40 to-transparent"></div>
            <div className="relative z-10 flex flex-col items-center lg:flex-row lg:items-center lg:gap-2">
                <div className={`lg:w-8 lg:h-8 rounded-full p-0.5 bg-gradient-to-tr from-white/10 to-white/5 mb-0 shrink-0 ${rankDetails.tierGlow} shadow-xl`}>
                    <img
                      src={user.avatarUrl}
                      alt={`${user.gamification?.codename || user.name}'s avatar`}
                      className={`w-full h-full rounded-full border-2 lg:border-2 object-cover ${rankDetails.tierColor.split(' ')[0]}`}
                    />
                </div>
                <div className="flex flex-col items-center lg:items-start lg:flex-1 lg:min-w-0">
                    <div className="flex flex-col items-center lg:flex-row lg:items-baseline lg:gap-2">
                        <h2
                          className={`lg:text-sm font-bold tracking-tight lg:truncate lg:max-w-full ${!user.gamification?.nameColor ? (isLight ? 'text-[var(--text-primary)]' : 'text-white') : ''}`}
                          style={user.gamification?.nameColor ? { color: user.gamification.nameColor } : undefined}
                        >{user.gamification?.codename || user.name}</h2>
                        <span className={`font-mono text-xs lg:text-[11.5px] uppercase tracking-[0.2em] mt-0 lg:mt-0 font-bold ${rankDetails.tierColor.split(' ').slice(1).join(' ')}`}>
                            {rankDetails.rankName} (Lvl {level})
                        </span>

                    {enrolledClasses.length > 1 && (
                        <div className="mt-3 hidden lg:block lg:mt-0 lg:ml-2 relative lg:w-auto">
                            <select
                                value={activeClass}
                                onChange={handleClassChange}
                                aria-label="Switch active class"
                                className="w-full lg:w-[160px] bg-[var(--surface-sunken)] border border-[var(--border)] text-[var(--text-primary)] text-xs lg:text-[11px] font-bold py-2 lg:py-1 px-4 lg:px-2 rounded-xl lg:rounded-lg appearance-none focus:outline-none focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500 transition"
                            >
                                {enrolledClasses.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 lg:right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-tertiary)] pointer-events-none" />
                        </div>
                    )}

                    <div className="w-full lg:w-[140px] h-2 lg:h-1.5 bg-black/60 rounded-full mt-1 lg:mt-1 overflow-hidden border border-[var(--border)] relative" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={`XP progress: ${Math.round(progress)}% to next level`}>
                        <div className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            </div>
        </div>
        </div>

        {/* Stat badges — compact inline */}
        <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-3 lg:py-2 lg:px-3 flex items-center gap-2">
            <div className="w-8 h-8 lg:w-6 lg:h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                <Hexagon className="w-5 h-5 lg:w-4 lg:h-4" aria-hidden="true" />
            </div>
            <div className="flex items-baseline gap-1.5 lg:gap-1">
                <div className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-widest lg:text-[11.5px]">Cyber-Flux</div>
                <div className="text-lg lg:text-base font-black text-[var(--text-primary)] leading-none">{displayCurrency}</div>
            </div>
        </div>

        {/* Engagement Streak + Multiplier */}
        {(user.gamification?.engagementStreak || 0) > 0 && (() => {
            const streak = user.gamification?.engagementStreak || 0;
            const multiplier = getStreakMultiplier(streak);
            return (
                <div className={`border rounded-2xl p-3 lg:py-2 lg:px-3 flex items-center gap-2 ${isLight ? 'bg-orange-50 border-orange-200' : 'bg-orange-500/10 border-orange-500/20'}`}>
                    <div className={`w-8 h-8 lg:w-6 lg:h-6 rounded-full flex items-center justify-center shrink-0 ${isLight ? 'bg-orange-100 text-orange-600' : 'bg-orange-500/20 text-orange-400'}`}>
                        <Flame className="w-5 h-5 lg:w-4 lg:h-4" aria-hidden="true" />
                    </div>
                    <div className="flex items-baseline gap-1.5 lg:gap-1 flex-1 min-w-0">
                        <div className="text-xs lg:text-[11.5px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest">Streak</div>
                        <div className={`text-lg lg:text-base font-black leading-none ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>{streak}w</div>
                    </div>
                    {multiplier > 1 && (
                        <div className="text-right shrink-0">
                            <div className="text-xs lg:text-[11.5px] text-[var(--text-tertiary)] uppercase">XP Bonus</div>
                            <div className={`text-sm lg:text-xs font-black ${isLight ? 'text-amber-700' : 'text-yellow-400'}`}>+{Math.round((multiplier - 1) * 100)}%</div>
                        </div>
                    )}
                </div>
            );
        })()}

        {/* Login Streak */}
        {(user.gamification?.loginStreak || 0) > 1 && (
            <div className={`border rounded-2xl p-3 lg:py-2 lg:px-3 flex items-center gap-2 ${isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-500/10 border-purple-500/20'}`}>
                <Sparkles className={`w-5 h-5 lg:w-4 lg:h-4 shrink-0 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} aria-hidden="true" />
                <div className="flex items-baseline gap-1.5 lg:gap-1">
                    <div className="text-xs lg:text-[11.5px] text-[var(--text-tertiary)] uppercase font-bold">Daily Login</div>
                    <div className={`text-sm lg:text-xs font-black ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>{user.gamification?.loginStreak || 0} day streak</div>
                </div>
            </div>
        )}

        {/* Profile + Access Nodes — hidden in compact horizontal strip */}
      </aside>

      {/* --- MIDDLE: CONTENT --- */}
      <main className="space-y-4">
          <div ref={tabpanelRef} tabIndex={-1} id={`tabpanel-${TAB_KEY_TO_NAV[activeTab] || activeTab}`} className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-4 backdrop-blur-md min-h-[400px] flex flex-col outline-none" role="tabpanel" aria-label={`${TAB_KEY_TO_NAV[activeTab] || activeTab} content`}>
           <div className={`flex-1 transition-all ${reducedMotion ? 'duration-0' : 'duration-150'} ease-in-out ${tabExiting ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>

             {activeTab === 'HOME' && (
                 <FeatureErrorBoundary feature="Home">
                   <React.Suspense fallback={<GamificationSkeleton lines={6} />}>
                   <HomeTab
                       assignments={assignments}
                       submissions={submissions}
                       activeClass={activeClass}
                       practiceCompletion={practiceCompletion}
                       activeEvent={activeEvent}
                       onNavigate={onNavigate}
                       onStartAssignment={onStartAssignment}
                       userSection={user.section}
                       userClassSections={user.classSections}
                       performanceMode={user.settings?.performanceMode}
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
                           ownedNameColors={user.gamification?.ownedNameColors || []}
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
                           codename={user.gamification?.codename || user.name}
                           avatarUrl={user.avatarUrl}
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

           </div>
          </div>
      </main>

      {/* BOSS ENCOUNTERS — Full-width panel */}
      {enabledFeatures.bossFights && (
      <div>
          <div className="bg-[var(--surface-glass)] border border-[var(--border)] rounded-3xl p-6 backdrop-blur-md space-y-6">
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
                  {!reducedMotion && <div className="absolute inset-[-12px] rounded-full border-2 border-yellow-400/30 animate-ping" style={{ animationDuration: '2s' }} />}
                  {!reducedMotion && <div className="absolute inset-[-6px] rounded-full border border-yellow-400/20 animate-pulse" />}
                  {/* Main badge */}
                  <div className="level-up-burst w-28 h-28 mx-auto bg-gradient-to-tr from-yellow-400 via-amber-500 to-yellow-600 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(234,179,8,0.6)] relative">
                      <span className="text-5xl font-black text-[var(--text-primary)] drop-shadow-lg">{level}</span>
                  </div>
              </div>

              {/* Rank reveal */}
              <div className="mb-2 overflow-hidden inline-block">
                  <h2 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight" style={reducedMotion ? { display: 'inline-block' } : { animation: 'typeReveal 0.8s steps(20) 0.4s both', overflow: 'hidden', whiteSpace: 'nowrap', display: 'inline-block' }}>
                      {rankDetails.rankName}
                  </h2>
              </div>
              <p className="text-[var(--text-tertiary)] mb-8 animate-in fade-in duration-500" style={reducedMotion ? {} : { animationDelay: '0.6s', animationFillMode: 'both' }}>
                  Clearance Level Increased. New capabilities unlocked.
              </p>

              {newlyAcquiredItem && (
                  <div className={`${getAssetColors(newlyAcquiredItem.rarity).shimmer} bg-[var(--surface-glass)] border rounded-xl p-5 mb-6 relative overflow-hidden ${getAssetColors(newlyAcquiredItem.rarity).border}`}
                       style={reducedMotion ? {} : { animation: 'levelUpBurst 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s both' }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-transparent opacity-50" />
                      <div className="relative z-10">
                          <div className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-[0.2em] mb-2">⚡ Supply Drop Received</div>
                          <div className={`text-xl font-bold ${getAssetColors(newlyAcquiredItem.rarity).text}`}>
                              {newlyAcquiredItem.name}
                          </div>
                          <div className="text-xs text-[var(--text-tertiary)] uppercase font-mono mt-1">{newlyAcquiredItem.rarity} {newlyAcquiredItem.slot}</div>
                          <div className="flex justify-center gap-5 mt-3 text-xs font-mono">
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
                  className="w-full py-4 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black rounded-xl uppercase tracking-widest transition shadow-[0_0_30px_rgba(234,179,8,0.3)] focus-visible:ring-2 focus-visible:ring-purple-500"
                  style={reducedMotion ? {} : { animation: 'buttonFadeIn 0.4s ease-out 1.2s both' }}
              >
                  Accept Promotion
              </button>
          </div>
      </Modal>
    </div>
  );
};

export default StudentDashboard;


import React, { useMemo, useState, useEffect } from 'react';
import { User, Assignment, Submission, XPEvent, RPGItem, EquipmentSlot, Quest } from '../types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { ChevronRight, Microscope, Play, BookOpen, FlaskConical, Target, Newspaper, Video, Layers, CheckCircle2, ChevronDown, Zap, Briefcase, User as UserIcon, Shield, Component, Gem, Hand, Trash2, Hexagon, Crosshair, Users, AlertTriangle, Radio, Megaphone, X as XIcon, Clock, Flame, Sparkles, Eye } from 'lucide-react';
import { dataService } from '../services/dataService';
import { getRankDetails, calculatePlayerStats, getAssetColors, getDisenchantValue, FLUX_COSTS, calculateGearScore } from '../lib/gamification';
import { getClassProfile } from '../lib/classProfile';
import { useAnimatedCounter } from '../lib/useAnimatedCounter';
import { sfx } from '../lib/sfx';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import Modal from './Modal';
import OperativeAvatar, { SKIN_TONES, HAIR_COLORS, HAIR_STYLE_NAMES } from './dashboard/OperativeAvatar';
import { Announcement } from '../types';
import AchievementPanel from './xp/AchievementPanel';
import SkillTreePanel from './xp/SkillTreePanel';
import FortuneWheel from './xp/FortuneWheel';
import BossEncounterPanel from './xp/BossEncounterPanel';
import BossQuizPanel from './xp/BossQuizPanel';
import DailyChallengesPanel from './xp/DailyChallengesPanel';
import TutoringPanel from './xp/TutoringPanel';
import LootDropAnimation from './xp/LootDropAnimation';
import ProfileShowcase from './ProfileShowcase';
import { getStreakMultiplier } from '../lib/achievements';

type StudentTab = 'RESOURCES' | 'LOADOUT' | 'MISSIONS' | 'ACHIEVEMENTS' | 'SKILLS' | 'FORTUNE' | 'TUTORING';

interface StudentDashboardProps {
  user: User;
  assignments: Assignment[];
  submissions: Submission[];
  enabledFeatures: {
    physicsLab: boolean;
    evidenceLocker: boolean;
    leaderboard: boolean;
    physicsTools: boolean;
    communications: boolean;
  };
  onNavigate: (tab: string) => void;
  onStartAssignment?: (id: string) => void;
  studentTab?: StudentTab;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Textbook': <BookOpen className="w-5 h-5" />,
  'Simulation': <Play className="w-5 h-5 fill-current" />,
  'Lab Guide': <FlaskConical className="w-5 h-5" />,
  'Practice Set': <Target className="w-5 h-5" />,
  'Article': <Newspaper className="w-5 h-5" />,
  'Video Lesson': <Video className="w-5 h-5" />,
  'Supplemental': <Layers className="w-5 h-5" />
};

// Module-level state: survives ErrorBoundary remounts that reset useRef/useState
let _acknowledgedLevel = 0;
let _dailyLoginAttempted = false;
let _streakAttempted = false;

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user, assignments, submissions, enabledFeatures, onNavigate, onStartAssignment, studentTab = 'RESOURCES' }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  // Initialize activeClass from user, but DON'T snap back on every classType change.
  // For multi-class students, activeClass is the local view selector.
  const [activeClass, setActiveClass] = useState<string>(user.classType || user.enrolledClasses?.[0] || 'Unassigned');
  const [activeEvent, setActiveEvent] = useState<XPEvent | null>(null);
  const [availableQuests, setAvailableQuests] = useState<Quest[]>([]);
  
  // RPG State
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [newlyAcquiredItem, setNewlyAcquiredItem] = useState<RPGItem | null>(null);
  // Initialize module-level acknowledged level on first render (but don't reset on remount)
  if (_acknowledgedLevel === 0) {
    _acknowledgedLevel = user.gamification?.lastLevelSeen || 1;
  }
  const activeTab = studentTab;
  const [showCustomize, setShowCustomize] = useState(false);
  const [inspectItem, setInspectItem] = useState<RPGItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewHue, setPreviewHue] = useState<number | null>(null);
  const [previewBodyType, setPreviewBodyType] = useState<'A' | 'B' | null>(null);
  const [previewSkinTone, setPreviewSkinTone] = useState<number | null>(null);
  const [previewHairStyle, setPreviewHairStyle] = useState<number | null>(null);
  const [previewHairColor, setPreviewHairColor] = useState<number | null>(null);
  const [xpFloatAmount, setXpFloatAmount] = useState<number | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [lootDropItem, setLootDropItem] = useState<RPGItem | null>(null);
  const [dailyLoginClaimed, setDailyLoginClaimed] = useState(false);

  useEffect(() => {
      const currentLevel = user.gamification?.level || 1;
      const lastSeen = Math.max(user.gamification?.lastLevelSeen || 1, _acknowledgedLevel);

      if (currentLevel > lastSeen) {
          _acknowledgedLevel = currentLevel;
          const inventory = user.gamification?.inventory || [];
          const latestItem = inventory.length > 0 ? inventory[inventory.length - 1] : null;
          setNewlyAcquiredItem(latestItem);
          setShowLevelUp(true);
          sfx.levelUp();
      }
  }, [user.gamification?.level, user.gamification?.lastLevelSeen, user.gamification?.inventory]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    try {
      unsubs.push(dataService.subscribeToXPEvents((events) => {
        const active = events.find(e =>
          e.isActive && (e.type === 'GLOBAL' || e.targetClass === activeClass)
        );
        setActiveEvent(active || null);
      }));
    } catch { /* permission error — not available */ }

    try {
      unsubs.push(dataService.subscribeToQuests((quests) => {
          setAvailableQuests(quests.filter(q => {
              if (!q.isActive) return false;
              const now = new Date();
              if (q.startsAt && new Date(q.startsAt) > now) return false;
              if (q.expiresAt && new Date(q.expiresAt) < now) return false;
              return true;
          }));
      }));
    } catch { /* permission error — not available */ }

    return () => unsubs.forEach(u => u());
  }, [activeClass]);

  // Detect XP changes and show floating animation
  const classXp = user.gamification?.classXp?.[activeClass] || 0;
  const prevXpRef = React.useRef(classXp);
  useEffect(() => {
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
    if (_dailyLoginAttempted) return;
    _dailyLoginAttempted = true;
    const today = new Date().toISOString().split('T')[0];
    const lastClaim = user.gamification?.lastLoginRewardDate;
    if (lastClaim !== today && !dailyLoginClaimed) {
      dataService.claimDailyLogin().then(result => {
        if (!result.alreadyClaimed) {
          setDailyLoginClaimed(true);
          sfx.dailyReward();
          toast.success(`Daily login: +${result.xpReward} XP, +${result.fluxReward} Flux (${result.streak}-day streak!)`);
        }
      }).catch(() => { /* Cloud function not deployed yet — silent */ });
    }
  }, []); // Run once on mount

  // Update engagement streak — single attempt, no retry
  useEffect(() => {
    if (_streakAttempted) return;
    _streakAttempted = true;
    dataService.updateEngagementStreak().catch(() => { /* silent */ });
  }, []);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = dataService.subscribeToAnnouncements(setAnnouncements);
    } catch { /* permission error — not available */ }
    return () => unsub?.();
  }, []);

  const visibleAnnouncements = useMemo(() => {
    const dismissed = user.gamification?.dismissedAnnouncements || [];
    return announcements.filter(a => 
      !dismissed.includes(a.id) && 
      (a.classType === 'GLOBAL' || a.classType === activeClass)
    );
  }, [announcements, user.gamification?.dismissedAnnouncements, activeClass]);

  const handleDismissAnnouncement = async (id: string) => {
    await dataService.dismissAnnouncement(user.id, id);
  };

  const handleLevelUpAck = () => {
      const currentLevel = user.gamification?.level || 1;
      _acknowledgedLevel = currentLevel;
      setShowLevelUp(false);
      setNewlyAcquiredItem(null);
      dataService.updateUserLastLevelSeen(user.id, currentLevel).catch(() => {});
  };

  const handleCustomizeSave = async (appearance: { hue: number; bodyType: 'A' | 'B'; skinTone: number; hairStyle: number; hairColor: number }) => {
      try {
          await dataService.updateUserAppearance(user.id, appearance, activeClass);
          toast.success('Profile updated!');
      } catch {
          toast.error('Failed to save — try again');
      }
      setShowCustomize(false);
  };

  const enrolledClasses = user.enrolledClasses || (user.classType ? [user.classType] : []);
  const playerStats = useMemo(() => calculatePlayerStats(user), [user]);
  const gearScore = useMemo(() => calculateGearScore(user.gamification?.equipped), [user.gamification?.equipped]);

  // Compute achievement progress client-side from available user data
  const computedProgress = useMemo(() => {
    const gam = user.gamification || {} as any;
    const serverProgress: Record<string, number> = gam.achievementProgress || {};
    const progress: Record<string, number> = { ...serverProgress };
    const totalXp = gam.xp || 0;
    const level = gam.level || 1;
    const inventory = gam.inventory || [];
    const completedQuests = gam.completedQuests || [];
    const streak = gam.engagementStreak || 0;
    const loginStreak = gam.loginStreak || 0;
    const tutoringDone = gam.tutoringSessionsCompleted || 0;
    const bossKills = gam.bossesDefeated || 0;
    const challengesDone = gam.challengesCompleted || 0;
    const craftCount = gam.itemsCrafted || 0;

    const setProgress = (id: string, val: number) => {
      // Only override if server doesn't have it or client value is higher
      if (!progress[id] || val > progress[id]) progress[id] = val;
    };

    // XP_TOTAL
    setProgress('first_steps', totalXp);
    setProgress('xp_5k', totalXp);
    setProgress('xp_25k', totalXp);

    // LEVEL_REACHED
    setProgress('rising_star', level);
    setProgress('veteran', level);
    setProgress('elite', level);
    setProgress('legend', level);

    // ITEMS_COLLECTED
    setProgress('collector_10', inventory.length);
    setProgress('collector_50', inventory.length);

    // GEAR_SCORE
    setProgress('gear_score_100', gearScore);
    setProgress('gear_score_500', gearScore);

    // QUESTS_COMPLETED
    setProgress('first_mission', completedQuests.length);
    setProgress('mission_5', completedQuests.length);
    setProgress('mission_20', completedQuests.length);

    // BOSS_KILLS
    setProgress('boss_slayer', bossKills);

    // STREAK_WEEKS
    setProgress('streak_3', streak);
    setProgress('streak_8', streak);
    setProgress('streak_16', streak);

    // LOGIN_STREAK
    setProgress('login_7', loginStreak);
    setProgress('login_30', loginStreak);

    // CHALLENGES_COMPLETED
    setProgress('challenges_10', challengesDone);

    // TUTORING_SESSIONS
    setProgress('tutor_1', tutoringDone);
    setProgress('tutor_10', tutoringDone);

    // STAT_THRESHOLD
    setProgress('tech_50', playerStats.tech);
    setProgress('focus_50', playerStats.focus);
    setProgress('analysis_50', playerStats.analysis);
    setProgress('charisma_50', playerStats.charisma);

    // ITEMS_CRAFTED
    setProgress('craft_10', craftCount);

    return progress;
  }, [user, gearScore, playerStats]);

  const radarData = [
      { subject: 'Tech', A: playerStats.tech, fullMark: 100 },
      { subject: 'Focus', A: playerStats.focus, fullMark: 100 },
      { subject: 'Analysis', A: playerStats.analysis, fullMark: 100 },
      { subject: 'Charisma', A: playerStats.charisma, fullMark: 100 },
  ];

  const unitGroups = useMemo(() => {
    const groups: Record<string, (Assignment & { lastEngagement: string | null; engagementTime: number })[]> = {};
    assignments
      .filter(a => a.classType === activeClass && a.status !== 'DRAFT')
      .forEach(a => {
        const log = submissions.find(s => s.assignmentId === a.id);
        const unit = a.unit || 'General Resources';
        if (!groups[unit]) groups[unit] = [];
        groups[unit].push({ ...a, lastEngagement: log ? log.submittedAt || null : null, engagementTime: log?.metrics?.engagementTime || 0 });
      });
    return groups;
  }, [assignments, submissions, activeClass]);

  const toggleUnit = (unit: string) => {
    const newSet = new Set(expandedUnits);
    if (newSet.has(unit)) newSet.delete(unit);
    else newSet.add(unit);
    setExpandedUnits(newSet);
  };

  const level = user.gamification?.level || 1;
  const currency = user.gamification?.currency || 0;
  const xp = classXp;
  const progress = (xp % 1000) / 1000 * 100;
  const displayXp = useAnimatedCounter(xp);
  const displayCurrency = useAnimatedCounter(currency);
  const rankDetails = getRankDetails(level);

  const handleClassChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newClass = e.target.value;
      setActiveClass(newClass);
      await dataService.switchUserView(user.id, newClass);
  };

  const handleEquip = async (item: RPGItem) => {
      try {
          await dataService.equipItem(user.id, item, activeClass);
          setInspectItem(null);
          sfx.equip();
          toast.success(`${item.name} equipped.`);
      } catch (e) {
          toast.error('Failed to equip item.');
      }
  };

  const handleDisenchant = async () => {
      if(!inspectItem) return;
      const val = getDisenchantValue(inspectItem);
      if(await confirm({ message: `Salvage ${inspectItem.name} for ${val} Cyber-Flux? This item will be destroyed.`, confirmLabel: "Salvage" })) {
          setIsProcessing(true);
          try {
              await dataService.disenchantItem(user.id, inspectItem, activeClass);
              setInspectItem(null);
              sfx.salvage();
              toast.success(`Salvaged for ${val} Cyber-Flux.`);
          } catch(e) {
              toast.error('Failed to salvage item.');
          } finally {
              setIsProcessing(false);
          }
      }
  };

  const handleCraft = async (action: 'RECALIBRATE' | 'REFORGE' | 'OPTIMIZE') => {
      if(!inspectItem) return;
      const cost = FLUX_COSTS[action];
      if(currency < cost) return toast.error('Insufficient Cyber-Flux.');
      
      setIsProcessing(true);
      try {
          await dataService.craftItem(user.id, inspectItem, action, activeClass);
          setInspectItem(null);
          sfx.craft();
          toast.success(`${action.charAt(0) + action.slice(1).toLowerCase()} complete.`);
      } catch(e) {
          toast.error('Fabrication protocol failed.');
      } finally {
          setIsProcessing(false);
      }
  };

  // --- QUEST LOGIC ---
  const activeQuests = user.gamification?.activeQuests || [];
  const completedQuests = user.gamification?.completedQuests || [];
  
  // Only show quests that aren't currently active AND haven't been completed permanently
  const myAcceptedQuests = availableQuests.filter(q => activeQuests.some(aq => aq.questId === q.id));
  const newQuests = availableQuests.filter(q => 
      !activeQuests.some(aq => aq.questId === q.id) && 
      !completedQuests.includes(q.id)
  );

  const handleAcceptQuest = async (quest: Quest) => {
      try {
          await dataService.acceptQuest(user.id, quest.id);
          sfx.questAccept();
          toast.success(`Contract accepted: ${quest.title}`);
      } catch (e) {
          toast.error('Failed to accept contract.');
      }
  };

  const handleDeployQuest = async (quest: Quest) => {
      const isManual = quest.type === 'CUSTOM';
      if(!await confirm({ message: isManual ? "Submit quest for manual HQ verification?" : "Deploy agent for skill check? This will calculate your success probability based on current gear.", confirmLabel: isManual ? "Submit" : "Deploy", variant: "info" })) return;
      try {
          await dataService.deployMission(user.id, quest);
          sfx.questDeploy();
          toast.info('Mission deployed. Awaiting verification.');
      } catch (e) {
          toast.error('Deployment failed.');
      }
  };

  const classProfile = useMemo(() => getClassProfile(user, activeClass), [user, activeClass]);
  const equipped = classProfile.equipped;
  const inventory = classProfile.inventory;

  // UI layout for slots
  const LEFT_SLOTS: EquipmentSlot[] = ['HEAD', 'HANDS', 'RING1', 'AMULET'];
  const RIGHT_SLOTS: EquipmentSlot[] = ['CHEST', 'BELT', 'FEET', 'RING2'];

  const SlotRender: React.FC<{ slot: EquipmentSlot }> = ({ slot }) => {
      const item = equipped[slot];
      const colors = item ? getAssetColors(item.rarity) : { border: 'border-white/10', bg: 'bg-black/20', text: 'text-gray-600', glow: '', shimmer: '' };
      
      const SlotIcon = () => {
          if (slot === 'HEAD') return <Zap className={`w-5 h-5 ${colors.text}`} />;
          if (slot === 'CHEST') return <Shield className={`w-5 h-5 ${colors.text}`} />;
          if (slot === 'HANDS') return <Hand className={`w-5 h-5 ${colors.text}`} />;
          if (slot === 'FEET') return <CheckCircle2 className={`w-5 h-5 ${colors.text}`} />;
          if (slot === 'BELT') return <Component className={`w-5 h-5 ${colors.text}`} />;
          if (slot === 'AMULET') return <Gem className={`w-5 h-5 ${colors.text}`} />;
          return <Briefcase className={`w-5 h-5 ${colors.text}`} />;
      };

      return (
          <button 
            className={`w-16 h-16 rounded-xl border-2 flex flex-col items-center justify-center relative group transition-all hover:scale-110 ${colors.border} ${colors.bg} ${colors.shimmer} ${colors.glow}`}
            onClick={() => item && setInspectItem(item)}
          >
              {item ? (
                  <>
                    {SlotIcon()}
                    <span className={`text-[7px] font-bold mt-0.5 truncate w-full text-center px-0.5 ${colors.text}`}>{item.baseName || item.name.split(' ').slice(-1)[0]}</span>
                    {/* Slot Hover Tooltip */}
                    <div className="absolute -top-[4.5rem] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 bg-black/95 border border-white/15 px-3 py-2 rounded-lg whitespace-nowrap shadow-xl backdrop-blur-sm">
                        <div className={`text-[10px] font-bold ${colors.text}`}>{item.name}</div>
                        <div className="text-[9px] text-gray-400 font-mono">{item.rarity} {slot}</div>
                        <div className="text-[9px] text-gray-500 mt-0.5">{Object.entries(item.stats).map(([k,v]) => `+${v} ${k.slice(0,3).toUpperCase()}`).join('  ')}</div>
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95 border-b border-r border-white/15 rotate-45"></div>
                    </div>
                  </>
              ) : (
                  <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">{slot.slice(0, 4)}</span>
              )}
          </button>
      );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full pb-12">
      
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
                <button onClick={() => handleDismissAnnouncement(a.id)} className="p-1 text-gray-500 hover:text-white transition shrink-0">
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
                <h2 className="text-xl font-bold text-white tracking-tight">{user.gamification?.codename || user.name}</h2>
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
                
                <div className="w-full h-2 bg-black/60 rounded-full mt-6 overflow-hidden border border-white/5 relative">
                    <div className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex justify-between w-full text-[9px] text-gray-500 mt-2 font-mono font-bold relative">
                    <span>{displayXp.toLocaleString()} XP ({activeClass})</span>
                    <span>Next Rank</span>
                    {xpFloatAmount && (
                        <span className="xp-float-anim absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 whitespace-nowrap">
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
             {enabledFeatures.physicsLab && (
                 <button onClick={() => onNavigate('Physics Lab')} className="w-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between transition group">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400 shadow-inner"><FlaskConical className="w-5 h-5" /></div>
                        <div className="text-left">
                            <div className="font-bold text-gray-200 text-sm">Physics Lab</div>
                            <div className="text-[10px] text-blue-300/70 uppercase font-bold tracking-tight">Active Simulations</div>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-blue-500 group-hover:translate-x-1 transition" />
                 </button>
             )}

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
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md min-h-[600px] flex flex-col">
             

             {activeTab === 'MISSIONS' && (
                 <div key="missions" className="space-y-6" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">Available Contracts</h3>
                     <div className="grid grid-cols-1 gap-4">
                         {newQuests.length === 0 && <div className="text-gray-500 italic px-4 py-10 text-center bg-black/10 rounded-xl border border-dashed border-white/5">No new contracts available. Check back later.</div>}
                         {newQuests.map(quest => (
                             <div key={quest.id} className="bg-black/20 border border-indigo-500/30 p-5 rounded-2xl relative overflow-hidden group hover:border-indigo-500/60 transition">
                                 <div className="flex justify-between items-start mb-2">
                                     <h4 className="text-lg font-bold text-white">{quest.title}</h4>
                                     <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{quest.type.replace('_', ' ')}</span>
                                 </div>
                                 <p className="text-sm text-gray-400 mb-4 pr-16">{quest.description}</p>
                                 <div className="flex items-center gap-4 text-xs font-mono text-gray-500 mb-4">
                                     {quest.statRequirements && (
                                         <div className="flex gap-2">
                                             {Object.entries(quest.statRequirements).map(([stat, val]) => (
                                                 <span key={stat} className="bg-white/5 px-2 py-1 rounded border border-white/10 uppercase">{val} {stat}</span>
                                             ))}
                                         </div>
                                     )}
                                     {quest.expiresAt && (
                                         <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Expires: {new Date(quest.expiresAt).toLocaleDateString()}</span>
                                     )}
                                 </div>
                                 <button 
                                    onClick={() => handleAcceptQuest(quest)}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-900/20 transition flex items-center gap-2"
                                 >
                                     <Crosshair className="w-4 h-4" /> Accept Contract
                                 </button>
                             </div>
                         ))}
                     </div>

                     <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2 pt-4 border-t border-white/10">Active Operations</h3>
                     <div className="grid grid-cols-1 gap-4">
                         {myAcceptedQuests.length === 0 && <div className="text-gray-500 italic px-4 py-10 text-center bg-black/10 rounded-xl border border-dashed border-white/5">No active operations. Accept a contract above to begin.</div>}
                         {myAcceptedQuests.map(quest => {
                             const status = activeQuests.find(q => q.questId === quest.id)?.status || 'ACCEPTED';
                             const myRoll = activeQuests.find(q => q.questId === quest.id)?.deploymentRoll;
                             const isManual = quest.type === 'CUSTOM';
                             
                             return (
                                 <div key={quest.id} className="bg-[#0f0720]/80 border border-purple-500/30 p-6 rounded-3xl relative group hover:border-purple-500/60 transition-all shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                                     <div className="flex justify-between items-start mb-4">
                                         <div className="flex items-center gap-4">
                                             <div className="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center border border-purple-500/20 shadow-inner">
                                                 <Target className="w-6 h-6" />
                                             </div>
                                             <div>
                                                 <h4 className="text-white font-bold text-lg leading-tight">{quest.title}</h4>
                                                 <div className="text-[10px] text-gray-500 uppercase font-black tracking-[0.1em]">{quest.type} MISSION</div>
                                             </div>
                                         </div>
                                         <span className={`text-[10px] font-black tracking-widest px-3 py-1 rounded-full border ${
                                             status === 'COMPLETED' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 
                                             status === 'FAILED' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 
                                             status === 'DEPLOYED' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-white/5 text-gray-400 border-white/10'
                                         }`}>
                                             {status}
                                         </span>
                                     </div>
                                     
                                     {status === 'ACCEPTED' ? (
                                         <>
                                            <p className="text-sm text-gray-400 mb-6 leading-relaxed bg-black/20 p-4 rounded-2xl border border-white/5">{quest.description}</p>
                                            <div className="flex gap-3">
                                                <button 
                                                    onClick={() => handleDeployQuest(quest)} 
                                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-3 group/btn"
                                                >
                                                    <Radio className="w-5 h-5 group-hover/btn:animate-pulse" />
                                                    {isManual ? "Broadcast Submission to HQ" : "Deploy for Skill Check"}
                                                </button>
                                                {quest.isGroupQuest && (
                                                    <button className="bg-white/5 hover:bg-white/10 text-white px-6 py-4 rounded-2xl text-sm font-black transition border border-white/10">
                                                        <Users className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                         </>
                                     ) : status === 'DEPLOYED' ? (
                                         <div className="bg-black/40 p-6 rounded-3xl border border-purple-500/20 flex flex-col gap-4 animate-in fade-in zoom-in-95">
                                             <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="relative">
                                                        <div className="w-3 h-3 bg-green-500 rounded-full animate-ping absolute -top-1 -right-1"></div>
                                                        <div className="w-3 h-3 bg-green-500 rounded-full absolute -top-1 -right-1 shadow-[0_0_10px_#22c55e]"></div>
                                                        <Zap className="w-6 h-6 text-purple-400" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Uplink Status</div>
                                                        <div className="text-sm font-black text-white font-mono uppercase tracking-tighter">
                                                            {isManual ? "AWAITING_HQ_SIG_VERIFICATION" : (myRoll === 100 ? "SUCCESS_VERIFIED" : "FAILURE_DETECTED")}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="h-10 w-px bg-white/5"></div>
                                                <div className="text-right">
                                                    <div className="text-[9px] text-gray-500 uppercase font-bold">Node</div>
                                                    <div className="text-xs font-bold text-purple-300">HQ_CENTRAL</div>
                                                </div>
                                             </div>
                                             
                                             <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                 <div className="h-full bg-indigo-500 animate-pulse w-3/4"></div>
                                             </div>

                                             <p className="text-[11px] text-gray-500 italic text-center font-mono">
                                                 {isManual 
                                                    ? "Encrypted transmission confirmed. HQ is currently reviewing your evidence data. Rewards will be issued upon manual signal confirmation."
                                                    : "Autonomous verification complete. Skill check results logged below."}
                                             </p>
                                         </div>
                                     ) : null}
                                 </div>
                             );
                         })}
                     </div>
                 </div>
             )}

             {activeTab === 'RESOURCES' && (
                 <div key="resources" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                    {Object.entries(unitGroups).length === 0 ? (
                        <div className="text-center py-20 text-gray-500 italic">No resources released for this class node.</div>
                    ) : (
                        <div className="space-y-4">
                            {(Object.entries(unitGroups) as [string, (Assignment & { lastEngagement: string | null; engagementTime: number })[]][]).sort().map(([unit, items]) => (
                                <div key={unit} className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                                    <button onClick={() => toggleUnit(unit)} className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition">
                                        <div className="flex items-center gap-3">
                                            {expandedUnits.has(unit) ? <ChevronDown className="w-4 h-4 text-purple-400" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                            <span className="font-bold text-sm text-gray-300 uppercase tracking-wider">{unit}</span>
                                        </div>
                                        <span className="text-[10px] bg-white/5 text-gray-500 px-2 py-0.5 rounded-full font-mono">{items.length} Files</span>
                                    </button>
                                    
                                    {expandedUnits.has(unit) && (
                                        <div className="grid grid-cols-1 gap-2 p-3 pt-0 animate-in slide-in-from-top-2 duration-300">
                                            {items.map(resource => {
                                                const hasDue = !!resource.dueDate;
                                                const dueDate = resource.dueDate ? new Date(resource.dueDate) : null;
                                                const now = new Date();
                                                const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000) : Infinity;
                                                const dueColor = daysUntilDue <= 0 ? 'text-red-400' : daysUntilDue <= 2 ? 'text-yellow-400' : 'text-gray-500';
                                                const engMin = Math.floor(resource.engagementTime / 60);
                                                const isSubstantial = engMin >= 5;
                                                
                                                return (
                                                <div 
                                                    key={resource.id} 
                                                    className="bg-white/5 border border-white/5 hover:border-purple-500/40 p-4 rounded-xl transition-all cursor-pointer group flex items-center gap-4"
                                                    onClick={() => onStartAssignment && onStartAssignment(resource.id)}
                                                >
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                                                        isSubstantial ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30' :
                                                        resource.lastEngagement ? 'bg-green-500/10 text-green-400' : 
                                                        'bg-purple-500/10 text-purple-400 group-hover:scale-110 shadow-lg group-hover:shadow-purple-500/20'
                                                    }`}>
                                                        {isSubstantial ? <CheckCircle2 className="w-6 h-6" /> : 
                                                         resource.lastEngagement ? <CheckCircle2 className="w-5 h-5 opacity-60" /> : 
                                                         CATEGORY_ICONS[resource.category || 'Supplemental']}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/40 text-gray-500 border border-white/5">{resource.category}</span>
                                                            <h4 className="font-bold text-white text-sm truncate">{resource.title}</h4>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <p className="text-xs text-gray-500 truncate">{resource.description}</p>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            {resource.lastEngagement && (
                                                                <span className="text-[9px] text-green-500 font-bold">{engMin}m engaged</span>
                                                            )}
                                                            {hasDue && (
                                                                <span className={`text-[9px] font-bold flex items-center gap-0.5 ${dueColor}`}>
                                                                    <Clock className="w-3 h-3" />
                                                                    {daysUntilDue <= 0 ? 'Overdue' : daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${daysUntilDue}d`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition">
                                                        <Play className="w-4 h-4 text-purple-400 fill-current" />
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                 </div>
             )}
             
             {activeTab === 'LOADOUT' && (
                 <div key="loadout" className="flex flex-col h-full" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
                         
                         {/* LEFT: CHARACTER VISUALIZER WITH SLOTS */}
                         <div className="bg-black/30 rounded-2xl border border-white/10 relative overflow-hidden flex flex-col items-center justify-center p-4 min-h-[400px]">
                             <div className="absolute inset-0 loadout-hex-bg pointer-events-none"></div>
                             <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 60%, hsla(${(classProfile.appearance?.hue || 0) + 200}, 60%, 25%, 0.3) 0%, transparent 70%)` }}></div>
                             
                             <div className="flex w-full h-full relative z-10 justify-between items-center px-4">
                                 {/* LEFT SLOTS */}
                                 <div className="flex flex-col gap-4">
                                     {LEFT_SLOTS.map(slot => <SlotRender key={slot} slot={slot} />)}
                                 </div>

                                 {/* AVATAR CENTER */}
                                 <div className="w-40 h-full relative">
                                     <OperativeAvatar equipped={equipped} appearance={classProfile.appearance} evolutionLevel={level} />
                                 </div>

                                 {/* RIGHT SLOTS */}
                                 <div className="flex flex-col gap-4">
                                     {RIGHT_SLOTS.map(slot => <SlotRender key={slot} slot={slot} />)}
                                 </div>
                             </div>

                             {/* CUSTOMIZE BUTTON - Moved and reinforced */}
                             <button 
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowCustomize(true);
                                }}
                                className="absolute bottom-6 bg-purple-600/20 hover:bg-purple-600 text-purple-400 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-purple-500/30 transition shadow-lg z-[40] flex items-center gap-2"
                             >
                                 <UserIcon className="w-3.5 h-3.5" />
                                 Edit DNA Profile
                             </button>
                         </div>

                         {/* RIGHT: STATS */}
                         <div className="flex flex-col gap-4">
                             <div className="bg-black/20 rounded-2xl p-4 border border-white/5 flex-1 min-h-[200px]">
                                 <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Performance Radar</h4>
                                 <div className="h-[200px]">
                                     <ResponsiveContainer width="100%" height="100%">
                                         <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                             <defs>
                                                 <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                                                     <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.6} />
                                                     <stop offset="100%" stopColor="#a855f7" stopOpacity={0.3} />
                                                 </linearGradient>
                                             </defs>
                                             <PolarGrid stroke="rgba(255,255,255,0.08)" />
                                             <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                                             <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                                             <Radar name="Stats" dataKey="A" stroke="#a855f7" strokeWidth={2} fill="url(#radarGradient)" fillOpacity={0.5} animationDuration={800} />
                                         </RadarChart>
                                     </ResponsiveContainer>
                                 </div>
                             </div>
                             
                             {/* Stats Summary */}
                             <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                                 <div className="grid grid-cols-2 gap-3 text-xs">
                                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400"></div><span className="text-gray-500">Tech</span> <span className="text-blue-400 font-bold ml-auto">{playerStats.tech}</span></div>
                                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-400"></div><span className="text-gray-500">Focus</span> <span className="text-green-400 font-bold ml-auto">{playerStats.focus}</span></div>
                                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-400"></div><span className="text-gray-500">Analysis</span> <span className="text-yellow-400 font-bold ml-auto">{playerStats.analysis}</span></div>
                                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-400"></div><span className="text-gray-500">Charisma</span> <span className="text-purple-400 font-bold ml-auto">{playerStats.charisma}</span></div>
                                 </div>
                             </div>
                         </div>
                     </div>

                     {/* BOTTOM: INVENTORY GRID */}
                     <div className="mt-6 flex-1 min-h-[250px] bg-black/40 border border-white/10 rounded-2xl p-4 overflow-hidden flex flex-col">
                         <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                             <span>Gear Storage ({inventory.length})</span>
                             <span className="text-[9px] text-gray-600">Click to Inspect</span>
                         </h4>
                         <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 content-start">
                             {inventory.map((item, idx) => {
                                 // Check equality loosely by ID
                                 const isEquipped = Object.values(equipped).some((e) => (e as RPGItem | null)?.id === item.id);
                                 const colors = getAssetColors(item.rarity);
                                 
                                 return (
                                     <button 
                                        key={idx} 
                                        onClick={() => setInspectItem(item)}
                                        className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center relative group transition-all hover:scale-105 ${
                                            isEquipped ? 'ring-2 ring-white/50 opacity-100' : 'opacity-80 hover:opacity-100'
                                        } ${colors.bg} ${colors.border} ${colors.shimmer} ${isEquipped ? colors.glow : ''}`}
                                     >
                                         {item.slot === 'HEAD' && <Zap className={`w-6 h-6 ${colors.text}`} />}
                                         {item.slot === 'CHEST' && <Shield className={`w-6 h-6 ${colors.text}`} />}
                                         {item.slot === 'HANDS' && <Hand className={`w-6 h-6 ${colors.text}`} />}
                                         {item.slot === 'FEET' && <CheckCircle2 className={`w-6 h-6 ${colors.text}`} />}
                                         {item.slot === 'BELT' && <Component className={`w-6 h-6 ${colors.text}`} />}
                                         {item.slot === 'AMULET' && <Gem className={`w-6 h-6 ${colors.text}`} />}
                                         {item.slot === 'RING' && <Briefcase className={`w-6 h-6 ${colors.text}`} />}
                                         
                                         {isEquipped && (
                                             <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full shadow-lg"></div>
                                         )}

                                         {/* Hover Tooltip */}
                                         <div className="absolute -top-[4.5rem] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 bg-black/95 border border-white/15 px-3 py-2 rounded-lg whitespace-nowrap shadow-xl backdrop-blur-sm">
                                             <div className={`text-[10px] font-bold ${colors.text}`}>{item.name}</div>
                                             <div className="text-[9px] text-gray-400 font-mono">{item.rarity} {item.slot}{isEquipped ? ' · EQUIPPED' : ''}</div>
                                             <div className="text-[9px] text-gray-500 mt-0.5">{Object.entries(item.stats).map(([k,v]) => `+${v} ${k.slice(0,3).toUpperCase()}`).join('  ')}</div>
                                             <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95 border-b border-r border-white/15 rotate-45"></div>
                                         </div>
                                     </button>
                                 );
                             })}
                             {/* Empty Slots Filler */}
                             {Array.from({ length: Math.max(0, 16 - inventory.length) }).map((_, i) => (
                                 <div key={`empty-${i}`} className="aspect-square rounded-xl border border-white/5 bg-white/5"></div>
                             ))}
                         </div>
                     </div>
                 </div>
             )}
             {activeTab === 'ACHIEVEMENTS' && (
                 <div key="achievements" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <AchievementPanel
                         unlockedAchievements={user.gamification?.unlockedAchievements || []}
                         achievementProgress={computedProgress}
                     />
                 </div>
             )}

             {activeTab === 'SKILLS' && (
                 <div key="skills" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <SkillTreePanel
                         specialization={user.gamification?.specialization}
                         skillPoints={user.gamification?.skillPoints || 0}
                         unlockedSkills={user.gamification?.unlockedSkills || []}
                     />
                 </div>
             )}

             {activeTab === 'FORTUNE' && (
                 <div key="fortune" className="space-y-8" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <FortuneWheel
                         currency={currency}
                         lastSpin={user.gamification?.lastWheelSpin}
                         classType={activeClass}
                     />
                 </div>
             )}

             {activeTab === 'TUTORING' && (
                 <div key="tutoring" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                     <TutoringPanel
                         userId={user.id}
                         userName={user.name}
                         classType={activeClass}
                     />
                 </div>
             )}
          </div>
      </div>

      {/* SIDEBAR PANELS - Boss Encounters & Daily Challenges */}
      <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
              <DailyChallengesPanel
                  userId={user.id}
                  activeChallenges={user.gamification?.activeDailyChallenges || []}
                  classType={activeClass}
              />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md space-y-6">
              <BossEncounterPanel userId={user.id} userName={user.name} classType={activeClass} />
              <BossQuizPanel classType={activeClass} />
          </div>
      </div>

      {/* MODALS RENDERED AT ROOT OF DASHBOARD FOR Z-INDEX CLARITY */}
      <Modal isOpen={showCustomize} onClose={() => { setShowCustomize(false); setPreviewHue(null); setPreviewBodyType(null); setPreviewSkinTone(null); setPreviewHairStyle(null); setPreviewHairColor(null); }} title="Customize Your Agent" maxWidth="max-w-lg">
          <div className="p-4 space-y-6">
              {/* Live preview */}
              <div className="flex justify-center">
                  <div className="w-44 h-64 bg-black/40 rounded-3xl p-3 border border-purple-500/20 shadow-inner loadout-hex-bg">
                      <OperativeAvatar equipped={equipped} appearance={{
                          ...classProfile.appearance,
                          hue: previewHue ?? classProfile.appearance?.hue ?? 0,
                          bodyType: previewBodyType ?? classProfile.appearance?.bodyType ?? 'A',
                          skinTone: previewSkinTone ?? classProfile.appearance?.skinTone ?? 0,
                          hairStyle: previewHairStyle ?? classProfile.appearance?.hairStyle ?? 1,
                          hairColor: previewHairColor ?? classProfile.appearance?.hairColor ?? 0,
                      }} />
                  </div>
              </div>

              {/* Skin Tone */}
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Skin Tone</label>
                  <div className="flex justify-center gap-2">
                      {SKIN_TONES.map((tone, i) => {
                          const isActive = (previewSkinTone ?? classProfile.appearance?.skinTone ?? 0) === i;
                          return (
                              <button key={i} onClick={() => setPreviewSkinTone(i)}
                                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${isActive ? 'border-white scale-110 ring-2 ring-white/30' : 'border-white/10'}`}
                                  style={{ backgroundColor: tone }} />
                          );
                      })}
                  </div>
              </div>

              {/* Hair Style */}
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Hair Style</label>
                  <div className="grid grid-cols-3 gap-2">
                      {HAIR_STYLE_NAMES.map((name, i) => {
                          const isActive = (previewHairStyle ?? classProfile.appearance?.hairStyle ?? 1) === i;
                          return (
                              <button key={i} onClick={() => setPreviewHairStyle(i)}
                                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-purple-500/30 border-purple-500 text-white border-2' : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}>
                                  {name}
                              </button>
                          );
                      })}
                  </div>
              </div>

              {/* Hair Color */}
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Hair Color</label>
                  <div className="flex justify-center gap-2">
                      {HAIR_COLORS.map((color, i) => {
                          const isActive = (previewHairColor ?? classProfile.appearance?.hairColor ?? 0) === i;
                          return (
                              <button key={i} onClick={() => setPreviewHairColor(i)}
                                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${isActive ? 'border-white scale-110 ring-2 ring-white/30' : 'border-white/10'}`}
                                  style={{ backgroundColor: color }} />
                          );
                      })}
                  </div>
              </div>

              {/* Body Type + Hue row */}
              <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Body Frame</label>
                      <div className="flex justify-center gap-2">
                          {(['A', 'B'] as const).map(type => {
                              const isActive = (previewBodyType ?? classProfile.appearance?.bodyType ?? 'A') === type;
                              return (
                                  <button key={type} onClick={() => setPreviewBodyType(type)}
                                      className={`px-4 py-2 rounded-xl border-2 transition-all font-bold text-xs ${isActive ? 'border-purple-500 bg-purple-500/20 text-white' : 'border-white/10 text-gray-500 hover:border-white/20'}`}>
                                      {type === 'A' ? 'Alpha' : 'Beta'}
                                  </button>
                              );
                          })}
                      </div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Energy Color</label>
                      <div className="grid grid-cols-4 gap-1.5">
                          {[0, 30, 60, 90, 120, 180, 240, 300].map(hue => {
                              const isActive = (previewHue ?? classProfile.appearance?.hue ?? 0) === hue;
                              return (
                                  <button key={hue} onClick={() => setPreviewHue(hue)}
                                      className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 mx-auto ${isActive ? 'border-white scale-110 ring-1 ring-white/30' : 'border-transparent'}`}
                                      style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }} />
                              );
                          })}
                      </div>
                  </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                  <button onClick={() => { setShowCustomize(false); setPreviewHue(null); setPreviewBodyType(null); setPreviewSkinTone(null); setPreviewHairStyle(null); setPreviewHairColor(null); }}
                      className="flex-1 py-3 bg-white/5 border border-white/10 text-gray-400 font-bold rounded-xl hover:bg-white/10 transition">
                      Cancel
                  </button>
                  <button onClick={() => {
                      handleCustomizeSave({
                          hue: previewHue ?? classProfile.appearance?.hue ?? 0,
                          bodyType: previewBodyType ?? classProfile.appearance?.bodyType ?? 'A',
                          skinTone: previewSkinTone ?? classProfile.appearance?.skinTone ?? 0,
                          hairStyle: previewHairStyle ?? classProfile.appearance?.hairStyle ?? 1,
                          hairColor: previewHairColor ?? classProfile.appearance?.hairColor ?? 0,
                      });
                      setPreviewHue(null); setPreviewBodyType(null); setPreviewSkinTone(null); setPreviewHairStyle(null); setPreviewHairColor(null);
                  }}
                      className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition shadow-lg shadow-purple-900/20">
                      Save Profile
                  </button>
              </div>
          </div>
      </Modal>

      <Modal isOpen={!!inspectItem} onClose={() => setInspectItem(null)} title="Nano-Fabricator Terminal" maxWidth="max-w-xl">
          {inspectItem && (
              <div className="space-y-6 text-gray-100">
                  {/* Item Header */}
                  <div className={`p-5 rounded-xl border ${getAssetColors(inspectItem.rarity).bg} ${getAssetColors(inspectItem.rarity).border} ${getAssetColors(inspectItem.rarity).shimmer} relative overflow-hidden`}>
                      <div className="flex items-start gap-4 relative z-10">
                          {/* Slot Icon */}
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 border ${getAssetColors(inspectItem.rarity).border} ${getAssetColors(inspectItem.rarity).bg}`} style={{ boxShadow: inspectItem.rarity === 'UNIQUE' ? '0 0 20px rgba(249,115,22,0.3)' : inspectItem.rarity === 'RARE' ? '0 0 15px rgba(234,179,8,0.2)' : 'none' }}>
                              {inspectItem.slot === 'HEAD' && <Zap className={`w-7 h-7 ${getAssetColors(inspectItem.rarity).text}`} />}
                              {inspectItem.slot === 'CHEST' && <Shield className={`w-7 h-7 ${getAssetColors(inspectItem.rarity).text}`} />}
                              {inspectItem.slot === 'HANDS' && <Hand className={`w-7 h-7 ${getAssetColors(inspectItem.rarity).text}`} />}
                              {inspectItem.slot === 'FEET' && <CheckCircle2 className={`w-7 h-7 ${getAssetColors(inspectItem.rarity).text}`} />}
                              {inspectItem.slot === 'BELT' && <Component className={`w-7 h-7 ${getAssetColors(inspectItem.rarity).text}`} />}
                              {inspectItem.slot === 'AMULET' && <Gem className={`w-7 h-7 ${getAssetColors(inspectItem.rarity).text}`} />}
                              {inspectItem.slot === 'RING' && <Briefcase className={`w-7 h-7 ${getAssetColors(inspectItem.rarity).text}`} />}
                          </div>
                          <div className="flex-1">
                              <div className={`text-lg font-bold ${getAssetColors(inspectItem.rarity).text}`}>{inspectItem.name}</div>
                              <div className="text-xs text-gray-300 font-mono uppercase">{inspectItem.rarity} {inspectItem.slot}</div>
                          </div>
                      </div>
                      
                      <div className="mt-4 space-y-1">
                          {Object.entries(inspectItem.stats).map(([stat, val]) => (
                              <div key={stat} className="flex justify-between text-sm text-gray-200 border-b border-white/5 pb-1">
                                  <span className="uppercase text-xs text-gray-400 font-bold">{stat}</span>
                                  <span className="font-mono font-bold">+{val}</span>
                              </div>
                          ))}
                      </div>

                      <div className="mt-4 flex gap-2 flex-wrap">
                          {inspectItem.affixes.map((aff, i) => (
                              <span key={i} className="text-[9px] bg-black/40 px-2 py-1 rounded border border-white/10 text-gray-400">
                                  {aff.name} (T{aff.tier})
                              </span>
                          ))}
                      </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="grid grid-cols-2 gap-3">
                      {/* Comparison vs currently equipped */}
                      {(() => {
                          // Find what's in this slot — handle RING→RING1/RING2
                          const slotKey = (inspectItem.slot === 'RING' ? 'RING1' : inspectItem.slot) as string;
                          const currentlyEquipped = equipped[slotKey as keyof typeof equipped] || (inspectItem.slot === 'RING' ? equipped['RING2'] : null);
                          if (!currentlyEquipped || currentlyEquipped.id === inspectItem.id) return null;
                          
                          const ceColors = getAssetColors(currentlyEquipped.rarity);
                          // Collect all stat keys from both items
                          const allStats = new Set([...Object.keys(inspectItem.stats), ...Object.keys(currentlyEquipped.stats)]);
                          
                          return (
                              <div className="col-span-2 bg-black/30 border border-white/10 rounded-xl p-3 mb-1">
                                  <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-2">Replacing Currently Equipped</div>
                                  <div className="flex items-center justify-between mb-2">
                                      <span className={`text-xs font-bold ${ceColors.text}`}>{currentlyEquipped.name}</span>
                                      <span className="text-[10px] text-gray-500 font-mono">{currentlyEquipped.rarity}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                                      {Array.from(allStats).map(stat => {
                                          const newVal = (inspectItem.stats as Record<string, number>)[stat] || 0;
                                          const oldVal = (currentlyEquipped.stats as Record<string, number>)[stat] || 0;
                                          const diff = newVal - oldVal;
                                          if (diff === 0) return <span key={stat} className="text-[10px] text-gray-600 font-mono">{stat.slice(0,3).toUpperCase()}: ±0</span>;
                                          return (
                                              <span key={stat} className={`text-[10px] font-mono font-bold ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                  {stat.slice(0,3).toUpperCase()}: {diff > 0 ? '▲' : '▼'}{Math.abs(diff)}
                                              </span>
                                          );
                                      })}
                                  </div>
                              </div>
                          );
                      })()}

                      <button 
                          onClick={() => handleEquip(inspectItem)} 
                          className="col-span-2 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition shadow-lg shadow-green-900/20"
                          disabled={isProcessing}
                      >
                          Equip Gear
                      </button>

                      <div className="col-span-2 border-t border-white/10 my-2"></div>
                      <div className="col-span-2 text-center text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Fabrication Protocols</div>

                      {/* Crafting Options */}
                      <button 
                          onClick={() => handleCraft('RECALIBRATE')}
                          disabled={isProcessing || currency < FLUX_COSTS.RECALIBRATE}
                          className="bg-black/20 hover:bg-purple-900/20 border border-white/10 hover:border-purple-500/50 p-3 rounded-xl text-left transition group disabled:opacity-50"
                      >
                          <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-bold text-gray-300 group-hover:text-purple-300">Recalibrate</span>
                              <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-1.5 rounded">{FLUX_COSTS.RECALIBRATE} Flux</span>
                          </div>
                          <p className="text-[9px] text-gray-500">Reroll numeric values within current tier.</p>
                      </button>

                      <button 
                          onClick={() => handleCraft('REFORGE')}
                          disabled={isProcessing || currency < FLUX_COSTS.REFORGE || inspectItem.rarity === 'UNIQUE'}
                          className="bg-black/20 hover:bg-red-900/20 border border-white/10 hover:border-red-500/50 p-3 rounded-xl text-left transition group disabled:opacity-50"
                      >
                          <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-bold text-gray-300 group-hover:text-red-300">Reforge</span>
                              <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-1.5 rounded">{FLUX_COSTS.REFORGE} Flux</span>
                          </div>
                          <p className="text-[9px] text-gray-500">Reroll all affixes. Keeps Rarity.</p>
                      </button>

                      <button 
                          onClick={() => handleCraft('OPTIMIZE')}
                          disabled={isProcessing || currency < FLUX_COSTS.OPTIMIZE}
                          className="col-span-2 bg-black/20 hover:bg-yellow-900/20 border border-white/10 hover:border-yellow-500/50 p-3 rounded-xl text-left transition group disabled:opacity-50"
                      >
                          <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-bold text-gray-300 group-hover:text-yellow-300">Optimize Tier</span>
                              <span className="text-[10px] bg-cyan-900/30 text-cyan-400 px-1.5 rounded">{FLUX_COSTS.OPTIMIZE} Flux</span>
                          </div>
                          <p className="text-[9px] text-gray-500">Upgrade affix tiers to match current operative level.</p>
                      </button>

                      <div className="col-span-2 border-t border-white/10 my-2"></div>

                      <button 
                          onClick={handleDisenchant} 
                          disabled={isProcessing}
                          className="col-span-2 py-3 bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-400 font-bold rounded-xl transition flex items-center justify-center gap-2"
                      >
                          <Trash2 className="w-4 h-4" />
                          Salvage for {getDisenchantValue(inspectItem)} Flux
                      </button>
                  </div>
              </div>
          )}
      </Modal>

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
              {/* CSS Confetti particles */}
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


import React, { useMemo, useState, useEffect } from 'react';
import { User, Assignment, Submission, XPEvent, RPGItem, EquipmentSlot, ItemSlot, Quest } from '../types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { ChevronRight, Microscope, Play, BookOpen, FlaskConical, Target, Newspaper, Video, Layers, CheckCircle2, ChevronDown, Zap, Briefcase, User as UserIcon, Trash2, Hexagon, Crosshair, Users, AlertTriangle, Radio, Megaphone, X as XIcon, Clock, Flame, Sparkles, Eye, GripVertical } from 'lucide-react';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors, DragStartEvent, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';

// Inline modifier: snaps the drag overlay center to the cursor position.
// Replicates @dnd-kit/modifiers snapCenterToCursor without the extra package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snapCenterToCursor(args: any) {
  const { activatorEvent, draggingNodeRect, transform } = args;
  if (draggingNodeRect && activatorEvent) {
    const coords = getEventCoordinates(activatorEvent);
    if (!coords) return transform;
    return {
      ...transform,
      x: transform.x + coords.x - (draggingNodeRect.left + draggingNodeRect.width / 2),
      y: transform.y + coords.y - (draggingNodeRect.top + draggingNodeRect.height / 2),
    };
  }
  return transform;
}
import { dataService } from '../services/dataService';
import { getRankDetails, getAssetColors, getDisenchantValue, FLUX_COSTS, calculateGearScore, getRunewordForItem } from '../lib/gamification';
import { RUNEWORD_DEFINITIONS } from '../lib/runewords';
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
let _lastSessionUserId = '';

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
  // Reset module-level flags when user identity changes (logout/login)
  if (_lastSessionUserId !== user.id) {
    _lastSessionUserId = user.id;
    _acknowledgedLevel = user.gamification?.lastLevelSeen || 1;
    _dailyLoginAttempted = false;
    _streakAttempted = false;
  }
  // Initialize on first render (but don't reset on remount for same user)
  if (_acknowledgedLevel === 0) {
    _acknowledgedLevel = user.gamification?.lastLevelSeen || 1;
  }
  const activeTab = studentTab;
  const [showCustomize, setShowCustomize] = useState(false);
  const [inspectItem, setInspectItem] = useState<RPGItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewHue, setPreviewHue] = useState<number | null>(null);
  const [previewBodyType, setPreviewBodyType] = useState<'A' | 'B' | 'C' | null>(null);
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
          const myClasses = user.enrolledClasses || (user.classType ? [user.classType] : []);
          setAvailableQuests(quests.filter(q => {
              if (!q.isActive) return false;
              const now = new Date();
              if (q.startsAt && new Date(q.startsAt) > now) return false;
              if (q.expiresAt && new Date(q.expiresAt) < now) return false;
              // If quest targets a specific class, only show to students in that class
              if (q.targetClass && !myClasses.includes(q.targetClass)) return false;
              return true;
          }));
      }));
    } catch { /* permission error — not available */ }

    return () => unsubs.forEach(u => u());
  }, [activeClass]);

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

  const handleCustomizeSave = async (appearance: { hue: number; bodyType: 'A' | 'B' | 'C'; skinTone: number; hairStyle: number; hairColor: number }) => {
      try {
          await dataService.updateUserAppearance(user.id, appearance, activeClass);
          toast.success('Profile updated!');
          setShowCustomize(false);
          setPreviewHue(null); setPreviewBodyType(null); setPreviewSkinTone(null); setPreviewHairStyle(null); setPreviewHairColor(null);
      } catch {
          toast.error('Failed to save — try again');
      }
  };

  const enrolledClasses = user.enrolledClasses || (user.classType ? [user.classType] : []);
  const classProfile = useMemo(() => getClassProfile(user, activeClass), [user, activeClass]);
  const equipped = classProfile.equipped;
  const inventory = classProfile.inventory;
  const playerStats = useMemo(() => {
      const base = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
      const items: RPGItem[] = Object.values(equipped).filter(Boolean) as RPGItem[];
      items.forEach(item => {
          if (item.stats) Object.entries(item.stats).forEach(([key, val]) => { base[key as keyof typeof base] += (val as number); });
      });
      return base;
  }, [equipped]);
  const gearScore = useMemo(() => calculateGearScore(equipped), [equipped]);

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
      if (isProcessing) return;
      setIsProcessing(true);
      try {
          await dataService.equipItem(user.id, item, activeClass);
          setInspectItem(null);
          sfx.equip();
          toast.success(`${item.name} equipped.`);
      } catch (e) {
          toast.error('Failed to equip item.');
      } finally {
          setIsProcessing(false);
      }
  };

  const handleUnequip = async (slot: string) => {
      setIsProcessing(true);
      try {
          await dataService.unequipItem(user.id, slot, activeClass);
          setInspectItem(null);
          toast.success('Item unequipped.');
      } catch (e) {
          toast.error('Failed to unequip item.');
      } finally {
          setIsProcessing(false);
      }
  };

  const handleDisenchant = async () => {
      if(!inspectItem) return;
      // Prevent salvaging currently equipped items
      const isEquipped = Object.values(equipped).some(e => e && (e as RPGItem).id === inspectItem.id);
      if (isEquipped) {
          toast.error('Unequip this item before salvaging.');
          return;
      }
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
      } catch(e: any) {
          const msg = e?.message || e?.code || 'Unknown error';
          toast.error(`Fabrication failed: ${msg}`);
      } finally {
          setIsProcessing(false);
      }
  };

  // --- GEM SOCKETING ---
  const gemsInventory = user.gamification?.gemsInventory || [];

  const handleAddSocket = async () => {
      if (!inspectItem || isProcessing) return;
      if (currency < FLUX_COSTS.SOCKET) return toast.error('Insufficient Cyber-Flux.');
      if ((inspectItem.sockets || 0) >= 3) return toast.error('Maximum sockets reached.');
      setIsProcessing(true);
      try {
          const result = await dataService.addSocket(inspectItem.id, activeClass);
          setInspectItem(result.item);
          sfx.craft();
          toast.success('Socket added!');
      } catch (e: any) {
          toast.error(e?.message || 'Failed to add socket.');
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSocketGem = async (gemId: string) => {
      if (!inspectItem || isProcessing) return;
      if (currency < FLUX_COSTS.ENCHANT) return toast.error('Insufficient Cyber-Flux.');
      setIsProcessing(true);
      try {
          const result = await dataService.socketGem(inspectItem.id, gemId, activeClass);
          setInspectItem(result.item);
          sfx.craft();
          if (result.runewordActivated) {
              sfx.levelUp();
              toast.success(`RUNEWORD ACTIVATED: ${result.runewordActivated.name}!`);
          } else {
              toast.success('Gem socketed!');
          }
      } catch (e: any) {
          toast.error(e?.message || 'Failed to socket gem.');
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

  // UI layout for slots
  const LEFT_SLOTS: EquipmentSlot[] = ['HEAD', 'HANDS', 'RING1', 'AMULET'];
  const RIGHT_SLOTS: EquipmentSlot[] = ['CHEST', 'BELT', 'FEET', 'RING2'];

  // --- DnD state & sensors ---
  const [draggedItem, setDraggedItem] = useState<RPGItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  /** Map an EquipmentSlot key to the ItemSlot values that can be dropped on it */
  const slotAccepts = (equipSlot: EquipmentSlot): ItemSlot[] => {
    if (equipSlot === 'RING1' || equipSlot === 'RING2') return ['RING'];
    return [equipSlot as ItemSlot];
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = inventory.find(i => i.id === active.id) ||
                 Object.values(equipped).find(i => i && i.id === active.id) as RPGItem | undefined;
    setDraggedItem(item || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedItem(null);
    if (!over) return;

    const dragId = active.id as string;
    const dropId = over.id as string;

    // Case 1: Dragging from inventory to an equipment slot
    if (dropId.startsWith('slot-')) {
      const targetSlot = dropId.replace('slot-', '') as EquipmentSlot;
      const item = inventory.find(i => i.id === dragId);
      if (!item) return;
      const accepted = slotAccepts(targetSlot);
      if (!accepted.includes(item.slot)) return;
      handleEquip(item);
    }

    // Case 2: Dragging from equipment slot to storage (zone OR any cell)
    if (dragId.startsWith('equipped-') && (dropId === 'inventory-zone' || dropId.startsWith('storage-cell-'))) {
      const slot = dragId.replace('equipped-', '');
      handleUnequip(slot);
    }
  };

  // Slot icon helper — proper gear silhouettes for each equipment type
  const getSlotIcon = (slot: string, colorClass: string, size = 'w-5 h-5') => {
    const cn = `${size} ${colorClass}`;
    const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (slot) {
      case 'HEAD': // Helmet / visor
        return <svg className={cn} {...svgProps}><path d="M12 2C8 2 5 5 5 9v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9c0-4-3-7-7-7z"/><path d="M5 11v2h14v-2"/><path d="M8 6h8" strokeWidth={1.5} opacity={0.6}/></svg>;
      case 'CHEST': // Chestplate / body armor
        return <svg className={cn} {...svgProps}><path d="M6 4l-2 3v5a2 2 0 0 0 2 2h2l1 3h6l1-3h2a2 2 0 0 0 2-2V7l-2-3"/><path d="M6 4h12"/><path d="M12 4v5"/><path d="M9 9h6"/></svg>;
      case 'HANDS': // Gauntlet / glove
        return <svg className={cn} {...svgProps}><path d="M7 14V8a2 2 0 0 1 4 0v1"/><path d="M11 9V7a2 2 0 0 1 4 0v3"/><path d="M15 10V9a2 2 0 0 1 3 1v4c0 3-2 6-5 7H9c-3-1-5-4-5-7v-2a2 2 0 0 1 3-1"/></svg>;
      case 'FEET': // Boot
        return <svg className={cn} {...svgProps}><path d="M7 3v10l-3 4v2h16v-2l-2-2V7a4 4 0 0 0-4-4H7z"/><path d="M4 19h16"/><path d="M11 3v4"/></svg>;
      case 'BELT': // Belt with buckle
        return <svg className={cn} {...svgProps}><rect x="2" y="9" width="20" height="6" rx="1"/><rect x="9" y="8" width="6" height="8" rx="1" strokeWidth={1.5}/><line x1="9" y1="12" x2="15" y2="12"/></svg>;
      case 'AMULET': // Pendant / necklace
        return <svg className={cn} {...svgProps}><path d="M6 3a14 14 0 0 0 12 0"/><path d="M12 7v3"/><path d="M12 10l-3 3 3 5 3-5-3-3z" fill="currentColor" fillOpacity={0.2}/></svg>;
      case 'RING': // Ring
        return <svg className={cn} {...svgProps}><ellipse cx="12" cy="14" rx="6" ry="5"/><path d="M12 9V6"/><path d="M10 6h4l-2-3-2 3z" fill="currentColor" fillOpacity={0.3}/></svg>;
      default:
        return <Briefcase className={cn} />;
    }
  };

  // --- Droppable Equipment Slot ---
  const SlotRender: React.FC<{ slot: EquipmentSlot }> = ({ slot }) => {
      const item = equipped[slot];
      const colors = item ? getAssetColors(item.rarity) : { border: 'border-white/10', bg: 'bg-black/20', text: 'text-gray-600', glow: '', shimmer: '' };

      // Make the slot a drop target
      const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot-${slot}` });

      // If there's an item equipped, make it draggable OUT of the slot
      const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
        id: item ? `equipped-${slot}` : `empty-slot-${slot}`,
        disabled: !item,
      });

      // Highlight when a compatible item is being dragged over
      const isCompatible = draggedItem && slotAccepts(slot).includes(draggedItem.slot);
      const highlightClass = isOver && isCompatible ? 'ring-2 ring-purple-500 scale-110' :
                             draggedItem && isCompatible ? 'ring-1 ring-purple-500/40 animate-pulse' : '';

      return (
          <div ref={setDropRef} className="relative">
            <div
              ref={setDragRef}
              {...attributes}
              {...listeners}
              className={`w-16 h-16 rounded-xl border-2 flex flex-col items-center justify-center relative group transition-all duration-200 ${
                isDragging ? 'opacity-30 scale-90 border-dashed' : 'hover:scale-110 cursor-grab active:cursor-grabbing'
              } ${colors.border} ${colors.bg} ${colors.shimmer} ${colors.glow} ${highlightClass}`}
              onClick={() => !isDragging && item && setInspectItem(item)}
            >
                {item ? (
                    <>
                      {getSlotIcon(slot.replace(/\d/, ''), colors.text)}
                      <span className={`text-[7px] font-bold mt-0.5 truncate w-full text-center px-0.5 ${colors.text}`}>{item.baseName || item.name.split(' ').slice(-1)[0]}</span>
                      {/* Slot Hover Tooltip */}
                      {!isDragging && (
                        <div className="absolute -top-[4.5rem] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 bg-black/95 border border-white/15 px-3 py-2 rounded-lg whitespace-nowrap shadow-xl backdrop-blur-sm">
                            <div className={`text-[10px] font-bold ${colors.text}`}>{item.name}</div>
                            <div className="text-[9px] text-gray-400 font-mono">{item.rarity} {slot}</div>
                            <div className="text-[9px] text-gray-500 mt-0.5">{Object.entries(item.stats).map(([k,v]) => `+${v} ${k.slice(0,3).toUpperCase()}`).join('  ')}</div>
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95 border-b border-r border-white/15 rotate-45"></div>
                        </div>
                      )}
                    </>
                ) : (
                    <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">{slot.slice(0, 4)}</span>
                )}
            </div>
          </div>
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
               <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[snapCenterToCursor]} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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

                             {/* CUSTOMIZE BUTTON */}
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

                     {/* BOTTOM: INVENTORY GRID (Droppable zone for unequipping) */}
                     <InventoryGrid
                       inventory={inventory}
                       equipped={equipped}
                       draggedItem={draggedItem}
                       onInspect={setInspectItem}
                       getSlotIcon={getSlotIcon}
                     />
                 </div>

                 {/* Drag Overlay — floating tile that follows cursor */}
                 <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }} zIndex={9999}>
                   {draggedItem && (() => {
                     const colors = getAssetColors(draggedItem.rarity);
                     return (
                       <div className="drag-overlay-tile rounded-xl pointer-events-none" style={{ willChange: 'transform, box-shadow' }}>
                         <div
                           className={`w-[68px] h-[68px] rounded-xl border-2 flex flex-col items-center justify-center backdrop-blur-sm ${colors.bg} ${colors.border} ${colors.glow}`}
                           style={{ filter: 'brightness(1.3) saturate(1.2)' }}
                         >
                           {getSlotIcon(draggedItem.slot, colors.text, 'w-7 h-7')}
                           <span className={`text-[8px] font-bold mt-0.5 ${colors.text} drop-shadow-lg`}>{draggedItem.baseName || draggedItem.name.split(' ').slice(-1)[0]}</span>
                         </div>
                       </div>
                     );
                   })()}
                 </DragOverlay>
               </DndContext>
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
                          {(['A', 'B', 'C'] as const).map(type => {
                              const isActive = (previewBodyType ?? classProfile.appearance?.bodyType ?? 'A') === type;
                              return (
                                  <button key={type} onClick={() => setPreviewBodyType(type)}
                                      className={`px-3 py-2 rounded-xl border-2 transition-all font-bold text-xs ${isActive ? 'border-purple-500 bg-purple-500/20 text-white' : 'border-white/10 text-gray-500 hover:border-white/20'}`}>
                                      {type === 'A' ? 'Alpha' : type === 'B' ? 'Beta' : 'Femme'}
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
                  <button onClick={() => handleCustomizeSave({
                          hue: previewHue ?? classProfile.appearance?.hue ?? 0,
                          bodyType: previewBodyType ?? classProfile.appearance?.bodyType ?? 'A',
                          skinTone: previewSkinTone ?? classProfile.appearance?.skinTone ?? 0,
                          hairStyle: previewHairStyle ?? classProfile.appearance?.hairStyle ?? 1,
                          hairColor: previewHairColor ?? classProfile.appearance?.hairColor ?? 0,
                      })}
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
                  <div className={`p-5 rounded-xl border ${inspectItem.runewordActive ? 'border-amber-500/40 runeword-active' : getAssetColors(inspectItem.rarity).border} ${getAssetColors(inspectItem.rarity).bg} ${getAssetColors(inspectItem.rarity).shimmer} relative overflow-hidden`}>
                      <div className="flex items-start gap-4 relative z-10">
                          {/* Slot Icon */}
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 border ${inspectItem.runewordActive ? 'border-amber-500/50' : getAssetColors(inspectItem.rarity).border} ${getAssetColors(inspectItem.rarity).bg}`} style={{ boxShadow: inspectItem.runewordActive ? '0 0 20px rgba(245,158,11,0.3)' : inspectItem.rarity === 'UNIQUE' ? '0 0 20px rgba(249,115,22,0.3)' : inspectItem.rarity === 'RARE' ? '0 0 15px rgba(234,179,8,0.2)' : 'none' }}>
                              {getSlotIcon(inspectItem.slot, inspectItem.runewordActive ? 'text-amber-400' : getAssetColors(inspectItem.rarity).text, 'w-7 h-7')}
                          </div>
                          <div className="flex-1">
                              <div className={`text-lg font-bold ${inspectItem.runewordActive ? 'text-amber-300' : getAssetColors(inspectItem.rarity).text}`}>{inspectItem.name}</div>
                              <div className="text-xs text-gray-300 font-mono uppercase">{inspectItem.rarity} {inspectItem.slot}</div>
                              {inspectItem.runewordActive && (
                                  <div className="text-[10px] font-bold text-amber-400 mt-0.5">{getRunewordForItem(inspectItem)?.name}</div>
                              )}
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

                  {/* Gem Sockets & Runeword */}
                  {(inspectItem.sockets || 0) > 0 && (() => {
                      const sockets = inspectItem.sockets || 0;
                      const gems = inspectItem.gems || [];
                      const emptySlots = sockets - gems.length;
                      const runeword = getRunewordForItem(inspectItem);

                      return (
                          <div className={`p-4 rounded-xl border ${runeword ? 'border-amber-500/40 bg-gradient-to-br from-amber-950/30 to-black/50' : 'border-white/10 bg-black/20'}`}>
                              {/* Runeword banner */}
                              {runeword && (
                                  <div className="mb-3 text-center">
                                      <div className="text-xs font-bold text-amber-400 uppercase tracking-widest">Runeword Active</div>
                                      <div className="text-lg font-black text-amber-300 mt-1">{runeword.name}</div>
                                      <p className="text-[10px] text-amber-500/70 italic mt-1">{runeword.lore}</p>
                                      <div className="flex justify-center gap-3 mt-2">
                                          {Object.entries(runeword.bonusStats).map(([stat, val]) => (
                                              <span key={stat} className="text-[10px] font-mono font-bold text-amber-400">
                                                  +{val} {stat.slice(0,3).toUpperCase()}
                                              </span>
                                          ))}
                                      </div>
                                      {runeword.bonusEffects && runeword.bonusEffects.length > 0 && (
                                          <div className="mt-1">
                                              {runeword.bonusEffects.map(eff => (
                                                  <span key={eff.id} className="text-[10px] text-purple-400 font-bold">{eff.description}</span>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              )}

                              {/* Socket visualization */}
                              <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">
                                  <Hexagon className="w-3 h-3" /> Gem Sockets ({gems.length}/{sockets})
                              </div>
                              <div className="flex gap-2">
                                  {gems.map((gem, i) => (
                                      <div key={i} className="flex flex-col items-center gap-1">
                                          <div
                                              className="w-8 h-8 rounded-lg border-2 flex items-center justify-center"
                                              style={{ borderColor: gem.color, backgroundColor: `${gem.color}20`, boxShadow: `0 0 8px ${gem.color}40` }}
                                          >
                                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: gem.color }} />
                                          </div>
                                          <span className="text-[9px] text-gray-400">{gem.name}</span>
                                      </div>
                                  ))}
                                  {Array.from({ length: emptySlots }).map((_, i) => (
                                      <div key={`empty-${i}`} className="w-8 h-8 rounded-lg border-2 border-dashed border-white/20 bg-black/30 flex items-center justify-center">
                                          <div className="w-2 h-2 rounded-full bg-white/10" />
                                      </div>
                                  ))}
                              </div>

                              {/* Gem socketing UI (only if empty sockets remain and no runeword yet) */}
                              {emptySlots > 0 && gemsInventory.length > 0 && (
                                  <div className="mt-3 border-t border-white/10 pt-3">
                                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Socket a Gem ({FLUX_COSTS.ENCHANT} Flux)</div>
                                      <div className="flex flex-wrap gap-2">
                                          {gemsInventory.map((gem: any) => (
                                              <button
                                                  key={gem.id}
                                                  onClick={() => handleSocketGem(gem.id)}
                                                  disabled={isProcessing || currency < FLUX_COSTS.ENCHANT}
                                                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/10 bg-black/30 hover:bg-white/10 transition text-xs disabled:opacity-50"
                                              >
                                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: gem.color }} />
                                                  <span className="text-gray-300">{gem.name}</span>
                                                  <span className="text-gray-600 font-mono">+{gem.value}</span>
                                              </button>
                                          ))}
                                      </div>

                                      {/* Runeword hints */}
                                      {gems.length > 0 && !runeword && (() => {
                                          const currentPattern = gems.map((g: any) => g.name);
                                          const possibleRws = RUNEWORD_DEFINITIONS.filter(rw =>
                                              rw.requiredSockets === sockets &&
                                              rw.pattern.slice(0, currentPattern.length).every((p, i) => p === currentPattern[i])
                                          );
                                          if (possibleRws.length === 0) return null;
                                          return (
                                              <div className="mt-2 text-[9px] text-amber-500/60">
                                                  {possibleRws.map(rw => (
                                                      <div key={rw.id}>Possible: <span className="font-bold text-amber-400/80">{rw.name}</span> — needs [{rw.pattern.join(' → ')}]</div>
                                                  ))}
                                              </div>
                                          );
                                      })()}
                                  </div>
                              )}
                          </div>
                      );
                  })()}

                  {/* Add Socket button (if item has <3 sockets) */}
                  {(inspectItem.sockets || 0) < 3 && (
                      <button
                          onClick={handleAddSocket}
                          disabled={isProcessing || currency < FLUX_COSTS.SOCKET}
                          className="w-full py-2 bg-black/20 hover:bg-purple-900/20 border border-white/10 hover:border-purple-500/50 rounded-xl text-sm text-gray-300 hover:text-purple-300 font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                          <Hexagon className="w-4 h-4" />
                          Add Socket ({FLUX_COSTS.SOCKET} Flux) — {inspectItem.sockets || 0}/3
                      </button>
                  )}

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

                      {(() => {
                          const equippedSlot = Object.entries(equipped).find(([, item]) => item && item.id === inspectItem.id)?.[0];
                          return equippedSlot ? (
                              <button
                                  onClick={() => handleUnequip(equippedSlot)}
                                  className="col-span-2 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition shadow-lg shadow-orange-900/20"
                                  disabled={isProcessing}
                              >
                                  Unequip Gear
                              </button>
                          ) : (
                              <button
                                  onClick={() => handleEquip(inspectItem)}
                                  className="col-span-2 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition shadow-lg shadow-green-900/20"
                                  disabled={isProcessing}
                              >
                                  Equip Gear
                              </button>
                          );
                      })()}

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

// ============================================================
// INVENTORY GRID — extracted for DnD integration
// ============================================================

interface InventoryGridProps {
  inventory: RPGItem[];
  equipped: Partial<Record<EquipmentSlot, RPGItem>>;
  draggedItem: RPGItem | null;
  onInspect: (item: RPGItem) => void;
  getSlotIcon: (slot: string, colorClass: string, size?: string) => React.ReactNode;
}

const InventoryGrid: React.FC<InventoryGridProps> = ({ inventory, equipped, draggedItem, onInspect, getSlotIcon }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'inventory-zone' });
  const isDroppingEquipped = draggedItem && Object.values(equipped).some(e => (e as RPGItem | null)?.id === draggedItem.id);

  return (
    <div
      ref={setNodeRef}
      className={`mt-6 flex-1 min-h-[250px] bg-black/40 border-2 rounded-2xl p-4 overflow-hidden flex flex-col transition-all duration-200 ${
        isDroppingEquipped ? 'border-purple-500/40 bg-purple-900/5' : isOver ? 'border-purple-500/50 bg-purple-900/10' : 'border-white/10'
      }`}
    >
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
        <span>Gear Storage ({inventory.length})</span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <GripVertical className="w-3 h-3" /> Drag to equip
        </span>
      </h4>
      <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 content-start">
        {inventory.map((item) => (
          <DraggableInventoryItem
            key={item.id}
            item={item}
            equipped={equipped}
            onInspect={onInspect}
            getSlotIcon={getSlotIcon}
          />
        ))}
        {/* Empty Slots — each is a droppable cell for precision placement */}
        {Array.from({ length: Math.max(0, 16 - inventory.length) }).map((_, i) => (
          <DroppableEmptyCell key={`empty-${i}`} index={i} isDroppingEquipped={!!isDroppingEquipped} />
        ))}
      </div>
    </div>
  );
};

// Empty storage cell that can receive equipped items
const DroppableEmptyCell: React.FC<{ index: number; isDroppingEquipped: boolean }> = ({ index, isDroppingEquipped }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `storage-cell-${index}` });

  return (
    <div
      ref={setNodeRef}
      className={`aspect-square rounded-xl border transition-all duration-200 ${
        isOver
          ? 'border-purple-500/60 bg-purple-500/15 scale-105 shadow-lg shadow-purple-500/20'
          : isDroppingEquipped
            ? 'border-purple-500/20 bg-purple-500/5'
            : 'border-white/5 bg-white/5'
      }`}
    />
  );
};

interface DraggableInventoryItemProps {
  item: RPGItem;
  equipped: Partial<Record<EquipmentSlot, RPGItem>>;
  onInspect: (item: RPGItem) => void;
  getSlotIcon: (slot: string, colorClass: string, size?: string) => React.ReactNode;
}

const DraggableInventoryItem: React.FC<DraggableInventoryItemProps> = ({ item, equipped, onInspect, getSlotIcon }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
  });
  const isEquipped = Object.values(equipped).some((e) => (e as RPGItem | null)?.id === item.id);
  const colors = getAssetColors(item.rarity);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onInspect(item)}
      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center relative group transition-all duration-200 ${
        isDragging ? 'opacity-30 scale-90 border-dashed' : 'cursor-grab active:cursor-grabbing opacity-80 hover:opacity-100 hover:scale-105'
      } ${isEquipped ? 'ring-2 ring-white/50 opacity-100' : ''} ${colors.bg} ${colors.border} ${colors.shimmer} ${isEquipped ? colors.glow : ''}`}
    >
      {getSlotIcon(item.slot, colors.text, 'w-6 h-6')}

      {isEquipped && (
        <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full shadow-lg"></div>
      )}

      {/* Hover Tooltip */}
      {!isDragging && (
        <div className="absolute -top-[4.5rem] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 bg-black/95 border border-white/15 px-3 py-2 rounded-lg whitespace-nowrap shadow-xl backdrop-blur-sm">
          <div className={`text-[10px] font-bold ${colors.text}`}>{item.name}</div>
          <div className="text-[9px] text-gray-400 font-mono">{item.rarity} {item.slot}{isEquipped ? ' · EQUIPPED' : ''}</div>
          <div className="text-[9px] text-gray-500 mt-0.5">{Object.entries(item.stats).map(([k,v]) => `+${v} ${k.slice(0,3).toUpperCase()}`).join('  ')}</div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95 border-b border-r border-white/15 rotate-45"></div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;

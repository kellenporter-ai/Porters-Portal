
export enum UserRole {
  ADMIN = 'ADMIN',
  STUDENT = 'STUDENT'
}

export type ClassType = string;

export const DefaultClassTypes = {
  AP_PHYSICS: 'AP Physics',
  HONORS_PHYSICS: 'Honors Physics',
  FORENSICS: 'Forensic Science',
  UNCATEGORIZED: 'Uncategorized'
};

export interface UserSettings {
  liveBackground: boolean;
  performanceMode: boolean;
  privacyMode: boolean;
  compactView: boolean;
  soundEffects?: boolean;
}

export interface ClassConfig {
  id: string;
  className: string;
  unitOrder?: string[]; 
  features: {
    physicsLab: boolean;
    evidenceLocker: boolean;
    leaderboard: boolean;
    physicsTools: boolean;
    communications: boolean;
  };
  // Admin-configurable telemetry thresholds (optional — falls back to defaults)
  telemetryThresholds?: {
    flagPasteCount?: number;
    flagMinEngagement?: number;
    supportKeystrokes?: number;
    supportMinEngagement?: number;
    successMinKeystrokes?: number;
  };
  // XP awarded per minute of engagement (default: 10)
  xpPerMinute?: number;
}

export enum AssignmentStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DRAFT = 'DRAFT'
}

export interface Resource {
  id: string;
  title: string;
  url: string;
  type: 'LINK' | 'PDF' | 'DOC' | 'VIDEO';
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  isAdmin: boolean;
}

export interface TelemetryMetrics {
  pasteCount: number;
  engagementTime: number;
  keystrokes: number;
  clickCount: number;
  startTime: number;
  lastActive: number;
}

// RPG TYPES
export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'UNIQUE';
// Unified RING slot for items, though equipped record still uses RING1/RING2 keys
export type ItemSlot = 'HEAD' | 'CHEST' | 'HANDS' | 'FEET' | 'BELT' | 'AMULET' | 'RING';
// Internal keys for the equipped object
export type EquipmentSlot = 'HEAD' | 'CHEST' | 'HANDS' | 'FEET' | 'BELT' | 'AMULET' | 'RING1' | 'RING2';

export interface ItemAffix {
  name: string; // e.g., "of the Owl"
  type: 'PREFIX' | 'SUFFIX' | 'UNIQUE';
  stat: string; // e.g., "focus"
  value: number;
  tier: number; // 1-10
}

export interface ItemEffect {
  id: string;
  name: string;
  description: string;
  value?: number; // e.g. 0.10 for 10%
  type: 'XP_BOOST' | 'STAT_BOOST' | 'SPECIAL';
}

export interface RPGItem {
  id: string;
  name: string; // Constructed name: "Prefix Base Suffix"
  baseName: string; // e.g., "Leather Boots"
  rarity: ItemRarity;
  slot: ItemSlot;
  visualId: string; // ID for the SVG renderer
  stats: {
    tech?: number;
    focus?: number;
    analysis?: number;
    charisma?: number;
  };
  affixes: ItemAffix[]; // Store the rolls
  effects?: ItemEffect[]; // For Uniques
  description: string;
  obtainedAt: string;
}

export interface PlayerStats {
  tech: number;     // For simulations/tools
  focus: number;    // For long reading/videos
  analysis: number; // For math/lab reports
  charisma: number; // For group work/chat
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  classType?: ClassType; 
  enrolledClasses?: ClassType[]; 
  section?: string; // Class period / section (e.g. "Period 3", "Block A")
  isWhitelisted: boolean;
  avatarUrl?: string;
  settings?: UserSettings;
  mutedUntil?: string; 
  lastLoginAt?: string; 
  createdAt?: string;
  stats?: {
    problemsCompleted: number;
    avgScore: number;
    rawAccuracy: number;
    totalTime: number;
  };
  gamification?: {
    xp: number; 
    classXp?: { [key: string]: number }; 
    level: number;
    currency: number; // Cyber-Flux (GLOBAL — shared across classes)
    badges: string[];
    codename?: string;
    privacyMode: boolean;
    // === PER-CLASS PROFILES (new) ===
    // Each class gets its own inventory, equipment, and appearance
    classProfiles?: {
      [classType: string]: {
        inventory: RPGItem[];
        equipped: Partial<Record<EquipmentSlot, RPGItem>>;
        appearance?: { bodyType: 'A' | 'B'; hue: number };
      };
    };
    // === LEGACY GLOBAL FIELDS (deprecated — kept for migration) ===
    inventory?: RPGItem[];
    equipped?: Partial<Record<EquipmentSlot, RPGItem>>;
    appearance?: {
        bodyType: 'A' | 'B';
        hue: number; // 0-360
    };
    lastLevelSeen?: number; // To trigger level up modal
    engagementStreak?: number; // Consecutive weeks of engagement
    lastStreakWeek?: string; // ISO week ID of last engagement
    dismissedAnnouncements?: string[]; // IDs of dismissed announcements
    activeQuests?: {
        questId: string;
        status: 'ACCEPTED' | 'DEPLOYED' | 'COMPLETED' | 'FAILED';
        acceptedAt: string;
        deploymentRoll?: number; // The result of their skill check
    }[];
    completedQuests?: string[]; // Permanent record of completed mission IDs
  };
}

export interface WhitelistedUser {
  email: string;
  classType: ClassType; // Primary/latest class (backward compat)
  classTypes?: ClassType[]; // All enrolled classes
}

export type ResourceCategory = 'Textbook' | 'Supplemental' | 'Lab Guide' | 'Practice Set' | 'Simulation' | 'Article' | 'Video Lesson';

export interface Assignment {
  id: string;
  title: string;
  description: string;
  classType: ClassType;
  status: AssignmentStatus;
  unit?: string; 
  category?: ResourceCategory;
  htmlContent?: string;
  contentUrl?: string | null;
  resources: Resource[];
  publicComments: Comment[];
  dueDate?: string;
}

export interface Submission {
  id: string;
  userId: string;
  userName: string;
  assignmentId: string;
  assignmentTitle: string;
  metrics: TelemetryMetrics;
  submittedAt?: string; 
  status: 'FLAGGED' | 'SUCCESS' | 'SUPPORT_NEEDED' | 'NORMAL' | 'STARTED';
  score: number;
  privateComments: Comment[];
  hasUnreadAdmin?: boolean; 
  hasUnreadStudent?: boolean; 
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  isFlagged?: boolean;
  systemNote?: string;
  channelId?: string;
  reactions?: { [emoji: string]: string[] }; 
  pinnedBy?: string[]; 
  isGlobalPinned?: boolean; 
}

// Conversation interface for messaging services
export interface Conversation {
  id: string;
  lastMessage: string;
  lastMessageAt: string;
  adminDisabled?: boolean;
}

// Gamification Engine Types
export interface XPEvent {
  id: string;
  title: string;
  multiplier: number;
  isActive: boolean;
  type: 'GLOBAL' | 'CLASS_SPECIFIC';
  targetClass?: string;
  expiresAt?: string | null;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  isActive: boolean;
  type: 'ENGAGEMENT' | 'REVIEW_QUESTIONS' | 'STUDY_MATERIAL' | 'SKILL_CHECK' | 'CUSTOM';
  startsAt?: string | null; // ISO String — quest hidden until this time
  expiresAt?: string | null; // ISO String
  
  // Advanced Rewards
  fluxReward?: number;
  itemRewardRarity?: ItemRarity | null; // Guarantees 1 item of this rarity + 1 random

  // Skill Check Mechanics
  statRequirements?: {
    tech?: number;
    focus?: number;
    analysis?: number;
    charisma?: number;
  };
  rollDieSides?: number; // e.g. 20 for D20. If 0, generic fail.
  
  // Flavor
  consequenceText?: string | null;
  
  // Multi-user
  isGroupQuest?: boolean;
  minPlayers?: number;
}

export interface EvidenceLog {
  id: string;
  studentId: string;
  classType?: string; 
  weekId: string; 
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  imageUrl: string;
  timestamp: string; 
  exifDate: string | null; 
  reflection: string; 
}

export interface LabReport {
  id: string;
  studentId: string;
  labTitle: string;
  content: string;
  dataPoints: { x: number; y: number }[];
  simScreenshotUrl?: string;
  timestamp: string;
}

export interface ChatFlag {
  id: string;
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  classType: string;
  isResolved: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  classType: string | 'GLOBAL';
  priority: 'INFO' | 'WARNING' | 'URGENT';
  createdAt: string;
  expiresAt?: string | null;
  createdBy: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'QUEST_APPROVED' | 'QUEST_REJECTED' | 'LOOT_DROP' | 'NEW_MISSION' | 'NEW_RESOURCE' | 'LEVEL_UP' | 'ANNOUNCEMENT' | 'XP_EVENT';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  meta?: Record<string, any>;
}

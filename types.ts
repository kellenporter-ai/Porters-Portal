
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
  pushNotifications?: boolean; // Browser push notification permission granted
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

export interface ItemGem {
  id: string;
  name: string;
  stat: 'tech' | 'focus' | 'analysis' | 'charisma';
  value: number;
  tier: number; // 1-5
  color: string; // hex color for display
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
  setId?: string; // If part of an item set
  sockets?: number; // Number of gem sockets (0-3)
  gems?: ItemGem[]; // Socketed gems
  runewordActive?: string; // ID of activated runeword (set by server when gem pattern matches)
  unsocketCount?: number; // Number of times gems have been unsocketed from this item
}

// ========================================
// RUNEWORD SYSTEM
// ========================================

export interface RunewordDefinition {
  id: string;
  name: string;
  description: string;
  pattern: string[]; // Ordered gem names, e.g. ["Ruby", "Sapphire", "Ruby"]
  requiredSockets: number; // Must match pattern.length
  bonusStats: {
    tech?: number;
    focus?: number;
    analysis?: number;
    charisma?: number;
  };
  bonusEffects?: ItemEffect[];
  lore: string; // Flavor text shown when activated
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
    codenameLocked?: boolean; // If true, student cannot change their own codename
    privacyMode: boolean;
    // === PER-CLASS PROFILES (new) ===
    // Each class gets its own inventory, equipment, and appearance
    classProfiles?: {
      [classType: string]: {
        inventory: RPGItem[];
        equipped: Partial<Record<EquipmentSlot, RPGItem>>;
        appearance?: { bodyType: 'A' | 'B' | 'C'; hue: number; skinTone?: number; hairStyle?: number; hairColor?: number };
      };
    };
    // === LEGACY GLOBAL FIELDS (deprecated — kept for migration) ===
    inventory?: RPGItem[];
    equipped?: Partial<Record<EquipmentSlot, RPGItem>>;
    appearance?: {
        bodyType: 'A' | 'B' | 'C';
        hue: number; // 0-360
        skinTone?: number; // 0-7 index into SKIN_TONES palette
        hairStyle?: number; // 0-5 index into hair styles
        hairColor?: number; // 0-7 index into HAIR_COLORS palette
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

    // === GEM INVENTORY ===
    gemsInventory?: ItemGem[]; // Unslotted gems available for socketing

    // === ACHIEVEMENTS ===
    unlockedAchievements?: string[]; // Achievement IDs
    achievementProgress?: { [achievementId: string]: number }; // Progress tracking

    // === DAILY ENGAGEMENT ===
    lastLoginRewardDate?: string; // ISO date of last daily login reward
    loginStreak?: number; // Consecutive days logged in
    lastWheelSpin?: string; // ISO date of last fortune wheel spin
    activeDailyChallenges?: DailyChallengeProgress[];

    // === SKILL TREE ===
    specialization?: SpecializationType;
    skillPoints?: number;
    unlockedSkills?: string[]; // Skill node IDs

    // === SEASONAL ===
    ownedCosmetics?: string[]; // Cosmetic IDs
    activeCosmetic?: string; // Currently displayed cosmetic

    // === GROUP QUESTS ===
    partyId?: string; // Current quest party

    // === BOSS ENCOUNTERS ===
    bossDamageDealt?: { [bossId: string]: number };

    // === PEER TUTORING ===
    tutoringXpEarned?: number;
    tutoringSessionsCompleted?: number;
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
  targetSections?: string[]; // e.g. ["Period 1", "Period 3"] — empty/undefined = all sections
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

export interface StudentGroup {
  id: string;
  name: string;
  classType: string;
  members: { userId: string; userName: string }[];
  createdAt: string;
  createdBy: string;
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
  targetSections?: string[];
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
  maxPlayers?: number;
  targetClass?: string; // Class restriction for quest
  targetSections?: string[];
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
  targetSections?: string[];
}

export type NotificationType =
  | 'QUEST_APPROVED' | 'QUEST_REJECTED' | 'LOOT_DROP' | 'NEW_MISSION'
  | 'NEW_RESOURCE' | 'LEVEL_UP' | 'ANNOUNCEMENT' | 'XP_EVENT'
  | 'ACHIEVEMENT_UNLOCKED' | 'DAILY_REWARD' | 'STREAK_MILESTONE'
  | 'BOSS_DEFEATED' | 'PARTY_INVITE' | 'WHEEL_PRIZE' | 'SKILL_UNLOCKED'
  | 'SET_BONUS_ACTIVE' | 'TUTORING_REWARD' | 'BOSS_QUIZ_START';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  meta?: Record<string, unknown>;
}

// ========================================
// ACHIEVEMENTS / BADGES
// ========================================

export type AchievementCategory = 'PROGRESSION' | 'COMBAT' | 'SOCIAL' | 'COLLECTION' | 'DEDICATION' | 'MASTERY';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string; // Emoji or icon key
  category: AchievementCategory;
  condition: {
    type: 'XP_TOTAL' | 'LEVEL_REACHED' | 'ITEMS_COLLECTED' | 'QUESTS_COMPLETED' | 'STREAK_WEEKS'
      | 'GEAR_SCORE' | 'STAT_THRESHOLD' | 'LOGIN_STREAK' | 'BOSS_KILLS' | 'TUTORING_SESSIONS'
      | 'ITEMS_CRAFTED' | 'WHEEL_SPINS' | 'CHALLENGES_COMPLETED';
    target: number;
    stat?: string; // For STAT_THRESHOLD: which stat
  };
  xpReward: number;
  fluxReward?: number;
  isSecret?: boolean; // Hidden until unlocked
}

// ========================================
// DAILY / WEEKLY CHALLENGES
// ========================================

export type ChallengeType = 'EARN_XP' | 'COMPLETE_RESOURCE' | 'ANSWER_QUESTIONS' | 'ENGAGE_MINUTES' | 'CRAFT_ITEM' | 'EQUIP_GEAR' | 'WIN_QUIZ';

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  type: ChallengeType;
  target: number; // e.g., earn 200 XP, answer 5 questions
  xpReward: number;
  fluxReward?: number;
  date: string; // ISO date this challenge is for
  isWeekly?: boolean;
}

export interface DailyChallengeProgress {
  challengeId: string;
  progress: number;
  completed: boolean;
  claimedAt?: string;
}

// ========================================
// FORTUNE WHEEL / MYSTERY BOX
// ========================================

export type WheelPrizeType = 'XP' | 'FLUX' | 'ITEM' | 'GEM' | 'SKILL_POINT' | 'NOTHING';

export interface FortuneWheelPrize {
  id: string;
  label: string;
  type: WheelPrizeType;
  value: number; // XP amount, Flux amount, etc.
  rarity?: ItemRarity; // For ITEM prizes
  weight: number; // Probability weight (higher = more common)
  color: string; // Segment color
}

// ========================================
// SKILL TREES / SPECIALIZATIONS
// ========================================

export type SpecializationType = 'THEORIST' | 'EXPERIMENTALIST' | 'ANALYST' | 'DIPLOMAT';

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  specialization: SpecializationType;
  tier: number; // 1-4 (depth in tree)
  cost: number; // Skill points required
  prerequisites: string[]; // Skill node IDs that must be unlocked first
  effect: {
    type: 'STAT_BOOST' | 'XP_MULTIPLIER' | 'FLUX_DISCOUNT' | 'CRAFT_BONUS' | 'STREAK_BONUS' | 'QUEST_BONUS';
    stat?: string;
    value: number;
  };
  icon: string;
}

// ========================================
// SET BONUSES
// ========================================

export interface ItemSet {
  id: string;
  name: string;
  description: string;
  itemIds: string[]; // Base item names that belong to this set
  bonuses: {
    count: number; // Number of pieces needed
    label: string; // e.g., "2-Piece Bonus"
    effects: { stat: string; value: number }[];
  }[];
}

// ========================================
// BOSS ENCOUNTERS
// ========================================

export interface BossEncounter {
  id: string;
  name: string;
  description: string;
  maxHp: number;
  currentHp: number;
  classType?: string; // Class-specific or GLOBAL
  xpRewardPerHit: number; // XP for contributing
  completionRewards: {
    xp: number;
    flux: number;
    itemRarity?: ItemRarity;
  };
  deadline: string; // ISO date — boss despawns
  isActive: boolean;
  imageUrl?: string; // Boss visual
  damageLog: { userId: string; userName: string; damage: number; timestamp: string }[];
}

// ========================================
// BOSS QUIZ EVENTS
// ========================================

export type BossType = 'BRUTE' | 'PHANTOM' | 'SERPENT';

export interface BossAppearance {
  bossType: BossType;
  hue: number; // 0-360 colour wheel
}

export interface BossQuizEvent {
  id: string;
  bossName: string;
  description: string;
  maxHp: number;
  currentHp: number;
  classType: string;
  isActive: boolean;
  deadline: string;
  questions: BossQuizQuestion[];
  damagePerCorrect: number; // HP damage per correct answer
  rewards: {
    xp: number;
    flux: number;
    itemRarity?: ItemRarity;
  };
  targetSections?: string[];
  bossAppearance?: BossAppearance;
  modifiers?: BossModifier[];
  questionBankIds?: string[]; // IDs of banks this boss pulled from
}

export interface BossQuizQuestion {
  id: string;
  stem: string;
  options: string[];
  correctAnswer: number; // Index
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  damageBonus?: number; // Extra damage for hard questions
  bankId?: string; // Source question bank (if imported)
}

// ========================================
// BOSS QUESTION BANKS
// ========================================

export interface BossQuestionBank {
  id: string;
  name: string;
  classType: string;
  description?: string;
  questions: BossQuizQuestion[];
  createdAt: string;
  updatedAt: string;
}

// ========================================
// BOSS MODIFIERS
// ========================================

export type BossModifierType =
  | 'PLAYER_DAMAGE_BOOST'   // Students deal +X extra damage
  | 'BOSS_DAMAGE_BOOST'     // Boss deals +Y extra damage
  | 'HARD_ONLY'             // Only hard questions
  | 'DOUBLE_OR_NOTHING'     // 2x damage both ways
  | 'CRIT_SURGE'            // +X% crit chance
  | 'ARMOR_BREAK'           // Boss ignores armor
  | 'HEALING_WAVE'          // Heal X HP on correct answer
  | 'SHIELD_WALL'           // First N wrong answers blocked per student
  | 'STREAK_BONUS'          // +X damage per consecutive correct
  | 'GLASS_CANNON'          // 2x player damage, 0 armor
  | 'LAST_STAND'            // +50% damage when below 25% HP
  | 'TIME_PRESSURE';        // Lose HP each question (attrition)

export interface BossModifier {
  type: BossModifierType;
  value?: number; // Configurable amount (meaning depends on type)
  label?: string; // Human-readable override shown to students
}

export const BOSS_MODIFIER_DEFS: Record<BossModifierType, { name: string; description: string; hasValue: boolean; defaultValue: number; unit: string }> = {
  PLAYER_DAMAGE_BOOST:  { name: 'Damage Boost',     description: 'Students deal extra damage per correct answer',       hasValue: true,  defaultValue: 25,  unit: '+dmg' },
  BOSS_DAMAGE_BOOST:    { name: 'Boss Rage',         description: 'Boss deals extra damage per wrong answer',            hasValue: true,  defaultValue: 15,  unit: '+dmg' },
  HARD_ONLY:            { name: 'Hard Only!',        description: 'Only hard questions appear',                          hasValue: false, defaultValue: 0,   unit: '' },
  DOUBLE_OR_NOTHING:    { name: 'Double or Nothing', description: '2x damage both ways — correct and wrong',            hasValue: false, defaultValue: 0,   unit: '' },
  CRIT_SURGE:           { name: 'Critical Surge',    description: 'All students get bonus crit chance',                  hasValue: true,  defaultValue: 20,  unit: '%' },
  ARMOR_BREAK:          { name: 'Armor Break',       description: 'Boss ignores all armor — damage reduction disabled',  hasValue: false, defaultValue: 0,   unit: '' },
  HEALING_WAVE:         { name: 'Healing Wave',      description: 'Restore HP on each correct answer',                   hasValue: true,  defaultValue: 10,  unit: 'HP' },
  SHIELD_WALL:          { name: 'Shield Wall',       description: 'First N wrong answers blocked per student',           hasValue: true,  defaultValue: 2,   unit: 'blocks' },
  STREAK_BONUS:         { name: 'Streak Bonus',      description: 'Bonus damage per consecutive correct answer',         hasValue: true,  defaultValue: 10,  unit: '+dmg/streak' },
  GLASS_CANNON:         { name: 'Glass Cannon',      description: '2x player damage but armor is disabled',              hasValue: false, defaultValue: 0,   unit: '' },
  LAST_STAND:           { name: 'Last Stand',        description: '+50% damage when below 25% HP',                       hasValue: false, defaultValue: 0,   unit: '' },
  TIME_PRESSURE:        { name: 'Time Pressure',     description: 'Lose HP each question regardless of answer',          hasValue: true,  defaultValue: 5,   unit: 'HP/question' },
};

// ========================================
// BOSS QUIZ COMBAT STATS (per-student)
// ========================================

export interface BossQuizCombatStats {
  totalDamageDealt: number;
  criticalHits: number;
  damageReduced: number;      // Total mitigated by armor
  bossDamageTaken: number;    // Total raw damage taken
  correctByDifficulty: { EASY: number; MEDIUM: number; HARD: number };
  incorrectByDifficulty: { EASY: number; MEDIUM: number; HARD: number };
  longestStreak: number;
  currentStreak: number;
  shieldBlocksUsed: number;
  healingReceived: number;
  questionsAttempted: number;
  questionsCorrect: number;
}

export interface BossQuizProgress {
  userId: string;
  quizId: string;
  answeredQuestions: string[];
  currentHp: number;
  maxHp: number;
  lastUpdated: string;
  combatStats: BossQuizCombatStats;
}

// Tiered reward multipliers for top 5 damage dealers
export const BOSS_REWARD_TIERS = [1.5, 1.4, 1.3, 1.2, 1.1] as const;
export const BOSS_PARTICIPATION_MIN_ATTEMPTS = 5;
export const BOSS_PARTICIPATION_MIN_CORRECT = 1;

// ========================================
// KNOWLEDGE-GATED LOOT
// ========================================

export interface KnowledgeGate {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  requiredScore: number; // Minimum quiz score % (e.g., 85)
  requiredQuestions: number; // Minimum questions answered correctly
  rewards: {
    itemRarity: ItemRarity;
    xpBonus: number;
    fluxBonus?: number;
  };
  isActive: boolean;
  classType?: string;
}

// ========================================
// PEER TUTORING
// ========================================

export type TutoringStatus = 'OPEN' | 'MATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED';

export interface TutoringFeedback {
  rating: number; // 1-5 overall experience
  communicationRating: number; // 1-5 communication quality
  response: string; // What they learned (student) or taught (tutor)
  submittedAt: string;
}

export interface TutoringSession {
  id: string;
  requesterId: string;
  requesterName: string;
  tutorId?: string;
  tutorName?: string;
  topic: string;
  classType: string;
  status: TutoringStatus;
  createdAt: string;
  completedAt?: string;
  verifiedBy?: string; // Admin who verified
  xpReward: number; // XP for the tutor
  fluxReward?: number;
  requesterFeedback?: TutoringFeedback;
  tutorFeedback?: TutoringFeedback;
}

// ========================================
// QUEST PARTY (GROUP QUESTS)
// ========================================

export interface QuestParty {
  id: string;
  leaderId: string;
  leaderName: string;
  members: { userId: string; userName: string; joinedAt: string }[];
  questId: string;
  status: 'FORMING' | 'READY' | 'DEPLOYED' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  maxSize: number;
}

// ========================================
// SEASONAL COSMETICS
// ========================================

export type SeasonType = 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER' | 'HALLOWEEN' | 'HOLIDAY' | 'EXAM_SEASON';

export interface SeasonalCosmetic {
  id: string;
  name: string;
  description: string;
  season: SeasonType;
  type: 'AURA' | 'PARTICLE' | 'FRAME' | 'TRAIL';
  hueOverride?: number;
  particleColor?: string;
  isAvailable: boolean;
  cost: number; // Flux cost
  expiresAt?: string;
}

// ========================================
// AVATAR EVOLUTION
// ========================================

export interface EvolutionTier {
  level: number; // Minimum level for this tier
  name: string;
  description: string;
  visualEffects: {
    glowIntensity: number; // 0-1
    particleCount: number;
    armorDetail: 'BASIC' | 'ENHANCED' | 'ADVANCED' | 'LEGENDARY' | 'MYTHIC';
    wingType?: 'NONE' | 'ENERGY' | 'CRYSTAL' | 'PHOENIX';
    crownType?: 'NONE' | 'CIRCLET' | 'HALO' | 'CROWN';
  };
}

// ========================================
// EARLY WARNING SYSTEM (EWS)
// ========================================

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type AlertReason =
  | 'LOW_ENGAGEMENT'       // ES well below class mean
  | 'DECLINING_TREND'      // ES dropping over consecutive days
  | 'NO_ACTIVITY'          // Zero submissions in analysis window
  | 'HIGH_PASTE_RATE'      // Consistently high paste counts
  | 'STRUGGLING';          // High effort, low XP yield

export interface StudentAlert {
  id: string;
  studentId: string;
  studentName: string;
  classType: string;
  riskLevel: RiskLevel;
  reason: AlertReason;
  message: string;                    // Human-readable summary
  engagementScore: number;            // The student's ES at time of alert
  classMean: number;                  // Class mean ES for context
  classStdDev: number;                // Standard deviation for context
  bucket?: TelemetryBucket;           // Behavioral bucket at time of alert
  createdAt: string;                  // ISO timestamp
  isDismissed: boolean;
  dismissedBy?: string;               // Admin who dismissed
  dismissedAt?: string;
}

// ========================================
// TELEMETRY BUCKETING (EWS Enhancement)
// ========================================

/** Behavioral engagement buckets derived from telemetry signals */
export type TelemetryBucket =
  | 'THRIVING'       // High engagement, steady progress, strong original work
  | 'ON_TRACK'       // Solid engagement, meeting expectations
  | 'COASTING'       // Minimum viable effort, low but present activity
  | 'SPRINTING'      // Inconsistent bursts — high peaks with gaps
  | 'STRUGGLING'     // High effort but low results/XP yield
  | 'DISENGAGING'    // Was active, now declining
  | 'INACTIVE'       // Zero or near-zero activity
  | 'COPYING';       // High paste rate relative to keystrokes

/** Resource categories the system recommends based on bucket */
export interface BucketRecommendation {
  categories: ResourceCategory[];    // Priority resource types for this student
  action: string;                    // Teacher-facing action advice
  studentTip: string;                // Student-facing encouragement message
}

/** Per-student bucket profile computed daily alongside EWS */
export interface StudentBucketProfile {
  id: string;
  studentId: string;
  studentName: string;
  classType: string;
  bucket: TelemetryBucket;
  engagementScore: number;
  metrics: {
    totalTime: number;               // Total seconds of engagement in window
    submissionCount: number;          // Number of submissions in window
    totalClicks: number;              // Total click events
    totalPastes: number;              // Total paste events
    totalKeystrokes: number;          // Total keystroke events
    avgPasteRatio: number;            // pastes / (keystrokes + pastes), 0-1
    activityDays: number;             // Number of distinct days with activity (0-7)
  };
  recommendation: BucketRecommendation;
  createdAt: string;                  // ISO timestamp
}


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
  performanceMode: boolean;
  privacyMode: boolean;
  compactView: boolean;
  soundEffects?: boolean;
  soundVolume?: number; // 0.0–1.0 master volume (default 0.5)
  pushNotifications?: boolean; // Browser push notification permission granted
  themeMode?: 'light' | 'dark';
}

export interface ClassConfig {
  id: string;
  className: string;
  unitOrder?: string[];
  resourceOrder?: Record<string, string[]>;
  features: {
    evidenceLocker: boolean;
    leaderboard: boolean;
    bossFights: boolean;
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

// ========================================
// LESSON BLOCKS
// ========================================

export type BlockType =
  | 'TEXT' | 'MC' | 'SHORT_ANSWER' | 'VOCABULARY' | 'CHECKLIST' | 'INFO_BOX'
  | 'SECTION_HEADER' | 'IMAGE' | 'VIDEO' | 'OBJECTIVES' | 'DIVIDER'
  | 'EXTERNAL_LINK' | 'EMBED' | 'VOCAB_LIST' | 'ACTIVITY'
  | 'SORTING' | 'DATA_TABLE' | 'BAR_CHART' | 'RANKING' | 'LINKED'
  | 'DRAWING' | 'MATH_RESPONSE';

export interface LessonBlock {
  id: string;
  type: BlockType;
  content: string;
  // MC-specific
  options?: string[];
  correctAnswer?: number;
  explanation?: string;
  // Short answer
  acceptedAnswers?: string[];
  // Vocabulary
  term?: string;
  definition?: string;
  // Checklist / Objectives / Ranking
  items?: string[];
  // Info box
  variant?: 'tip' | 'warning' | 'note';
  // Section Header / Activity / External Link
  icon?: string;
  title?: string;
  subtitle?: string;
  // Image / Video / External Link / Embed
  url?: string;
  caption?: string;
  alt?: string;
  // External Link
  buttonLabel?: string;
  openInNewTab?: boolean;
  // Embed / Bar Chart
  height?: number;
  // Vocab List
  terms?: { term: string; definition: string }[];
  // Activity / Sorting
  instructions?: string;
  // Sorting
  leftLabel?: string;
  rightLabel?: string;
  sortItems?: { text: string; correct: 'left' | 'right' }[];
  // Data Table
  columns?: { key: string; label: string; unit?: string; editable?: boolean }[];
  trials?: number;
  rowLabels?: string[];
  rows?: Record<string, string>[];
  // Bar Chart
  barCount?: number;
  initialLabel?: string;
  finalLabel?: string;
  deltaLabel?: string;
  // Linked
  linkedBlockId?: string;
  // Drawing
  drawingMode?: 'free' | 'point_model' | 'extended_body';
  canvasHeight?: number;
  backgroundImage?: string;
  // Math Response
  stepLabels?: string[];
  maxSteps?: number;
  showLatexHelp?: boolean;
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
  // Assessment-specific telemetry
  tabSwitchCount?: number;
  perBlockTiming?: Record<string, number>;  // blockId -> seconds spent
  typingCadence?: {
    avgIntervalMs?: number;
    burstCount?: number;
  };
  wordCount?: number;
  wordsPerSecond?: number;
}

// RPG TYPES
export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'UNIQUE';
// Unified RING slot for items, though equipped record still uses RING1/RING2 keys
export type ItemSlot = 'HEAD' | 'CHEST' | 'HANDS' | 'FEET' | 'BELT' | 'AMULET' | 'RING' | 'WEAPON';
// Internal keys for the equipped object
export type EquipmentSlot = 'HEAD' | 'CHEST' | 'HANDS' | 'FEET' | 'BELT' | 'AMULET' | 'RING1' | 'RING2' | 'WEAPON1' | 'WEAPON2';

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
// CUSTOM ITEM LIBRARY (Admin-created items)
// ========================================

export interface CustomItem extends RPGItem {
  createdBy: string;      // admin UID
  createdAt: string;      // ISO date
  tags?: string[];         // for filtering / categorization
  canDropInLoot: boolean;  // whether this can appear as a random loot drop
  dropWeight?: number;     // relative weight in the loot pool (default 1)
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
  section?: string; // LEGACY — single section (kept for backward compat)
  classSections?: Record<string, string>; // Per-class sections, e.g. { "AP Physics": "Period 3", "Forensic Science": "Period 5" }
  isWhitelisted: boolean;
  avatarUrl?: string;
  settings?: UserSettings;
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
        appearance?: { bodyType: 'A' | 'B' | 'C'; hue: number; suitHue?: number; skinTone?: number; hairStyle?: number; hairColor?: number };
      };
    };
    // === LEGACY GLOBAL FIELDS (deprecated — kept for migration) ===
    inventory?: RPGItem[];
    equipped?: Partial<Record<EquipmentSlot, RPGItem>>;
    appearance?: {
        bodyType: 'A' | 'B' | 'C';
        hue: number; // 0-360 — energy color (eyes, core, effects)
        suitHue?: number; // 0-360 — clothing/suit color (torso, arms, legs, feet)
        skinTone?: number; // 0-7 index into SKIN_TONES palette
        hairStyle?: number; // 0-11 index into hair styles
        hairColor?: number; // 0-7 index into HAIR_COLORS palette
    };
    lastLevelSeen?: number; // To trigger level up modal
    engagementStreak?: number; // Consecutive weeks of engagement
    lastStreakWeek?: string; // ISO week ID of last engagement
    dismissedAnnouncements?: string[]; // IDs of dismissed announcements
    // === GEM INVENTORY ===
    gemsInventory?: ItemGem[]; // Unslotted gems available for socketing

    // === ACHIEVEMENTS ===
    unlockedAchievements?: string[]; // Achievement IDs
    achievementProgress?: { [achievementId: string]: number }; // Progress tracking
    // Server-authoritative counters for achievement tracking
    bossesDefeated?: number; // Incremented each time a boss is killed while student contributed
    wheelSpins?: number; // Incremented each successful spinFortuneWheel call
    itemsCrafted?: number; // Incremented each successful craftItem call

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
    activeCosmetic?: string; // DEPRECATED: single cosmetic (kept for backward compat migration)
    activeCosmetics?: ActiveCosmetics; // Per-slot equipped cosmetics (aura, particle, frame, trail)

    // === 3D CHARACTER MODELS ===
    selectedCharacterModel?: string; // Currently selected character model ID
    ownedCharacterModels?: string[]; // Character model IDs the student owns

    // === FLUX SHOP ===
    activeBoosts?: ActiveBoost[]; // Currently active temporary boosts
    nameColor?: string; // Hex color for codename display
    ownedNameColors?: string[]; // Name color item IDs the student has purchased
    rerollTokens?: number; // Free reforge tokens
    consumablePurchases?: { [dateItemKey: string]: number }; // "2026-03-04_xp_boost_1h" → count

    // === BOSS ENCOUNTERS ===
    bossDamageDealt?: { [bossId: string]: number };

  };
}

export interface WhitelistedUser {
  email: string;
  classType: ClassType; // Primary/latest class (backward compat)
  classTypes?: ClassType[]; // All enrolled classes
}

export type ResourceCategory = 'Lesson' | 'Lab' | 'Simulation' | 'Practice' | 'Supplemental';

/** Map legacy Firestore category values to the current ResourceCategory set. */
export function migrateResourceCategory(raw: string | undefined): ResourceCategory {
  const map: Record<string, ResourceCategory> = {
    'Textbook': 'Lesson',
    'Article': 'Lesson',
    'Video Lesson': 'Lesson',
    'Lab Guide': 'Lab',
    'Practice Set': 'Practice',
    'Lesson': 'Lesson',
    'Lab': 'Lab',
    'Simulation': 'Simulation',
    'Practice': 'Practice',
    'Supplemental': 'Supplemental',
  };
  return map[raw ?? ''] ?? 'Lesson';
}

// Rubric types
export type RubricTierLabel = 'Missing' | 'Emerging' | 'Approaching' | 'Developing' | 'Refining';

export interface RubricTier {
  label: RubricTierLabel;
  percentage: number;
  descriptor: string;
}

export interface RubricSkill {
  id: string;
  skillText: string;
  tiers: RubricTier[];
}

export interface RubricQuestion {
  id: string;
  questionLabel: string;
  skills: RubricSkill[];
}

export interface Rubric {
  title: string;
  questions: RubricQuestion[];
  rawMarkdown: string;
}

export interface RubricSkillGrade {
  selectedTier: number;
  percentage: number;
}

export interface RubricGrade {
  grades: Record<string, Record<string, RubricSkillGrade>>;
  overallPercentage: number;
  gradedAt: string;
  gradedBy: string;
  teacherFeedback?: string;
}

// AI Grading Assistant types
export interface AISuggestedSkillGrade {
  suggestedTier: number;
  percentage: number;
  confidence: number; // 0-1
  rationale: string;
}

export interface AISuggestedGrade {
  grades: Record<string, Record<string, AISuggestedSkillGrade>>;
  overallPercentage: number;
  suggestedAt: string;
  model: string;
  status: 'pending_review' | 'accepted' | 'partially_accepted' | 'rejected';
}

// AI Grading feedback loop — stores teacher corrections to improve future suggestions
export interface GradingCorrection {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  submissionId: string;
  rubricQuestionId: string;
  skillId: string;
  skillText: string;
  aiSuggestedTier: number;
  teacherSelectedTier: number;
  aiRationale: string;
  studentAnswer: string; // truncated context for the few-shot example
  correctedAt: string;
  model: string;
}

export const RUBRIC_TIER_COLORS: Record<RubricTierLabel, { bg: string; text: string; border: string; solid: string }> = {
  Missing:     { bg: 'bg-red-500/10 dark:bg-red-500/20',       text: 'text-red-700 dark:text-red-400',       border: 'border-red-500/30 dark:border-red-500/40',       solid: 'bg-red-600' },
  Emerging:    { bg: 'bg-orange-500/10 dark:bg-orange-500/20',  text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-500/30 dark:border-orange-500/40', solid: 'bg-orange-600' },
  Approaching: { bg: 'bg-yellow-500/10 dark:bg-yellow-500/20',  text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-500/30 dark:border-yellow-500/40', solid: 'bg-yellow-600' },
  Developing:  { bg: 'bg-green-500/10 dark:bg-green-500/20',    text: 'text-green-700 dark:text-green-400',   border: 'border-green-500/30 dark:border-green-500/40',  solid: 'bg-green-600' },
  Refining:    { bg: 'bg-blue-500/10 dark:bg-blue-500/20',      text: 'text-blue-700 dark:text-blue-400',     border: 'border-blue-500/30 dark:border-blue-500/40',    solid: 'bg-blue-600' },
};

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
  scheduledAt?: string; // ISO date — if set & future, hidden from students until this time
  createdAt?: string; // ISO date — set once on creation
  updatedAt?: string; // ISO date — updated on every save
  targetSections?: string[]; // e.g. ["Period 1", "Period 3"] — empty/undefined = all sections
  lessonBlocks?: LessonBlock[];
  // Assessment mode
  isAssessment?: boolean;
  assessmentConfig?: {
    allowResubmission?: boolean;    // default true
    maxAttempts?: number;           // 0 = unlimited
    showScoreOnSubmit?: boolean;    // default true
    showReviewAfterSubmit?: boolean; // default true — let students review submitted answers
    lockNavigation?: boolean;       // default true for assessments
  };
  rubric?: Rubric;
  // Google Classroom grade sync
  classroomLink?: ClassroomLink;
  classroomLinks?: ClassroomLinkEntry[];
}

export interface ClassroomLink {
  courseId: string;
  courseName: string;
  courseWorkId: string;
  courseWorkTitle: string;
  maxPoints: number;
  linkedAt: string;
  linkedBy: string;
}

/** One link per Google Classroom course-section (supports 1:N Portal→GC mapping) */
export interface ClassroomLinkEntry {
  courseId: string;
  courseName: string;
  courseSection?: string;      // GC's section field (e.g., "Period 5")
  portalSection?: string;      // Portal section this maps to
  courseWorkId: string;
  courseWorkTitle: string;
  maxPoints: number;
  linkedAt: string;
  linkedBy: string;
}

export interface Submission {
  id: string;
  userId: string;
  userName: string;
  assignmentId: string;
  assignmentTitle: string;
  metrics: TelemetryMetrics;
  submittedAt?: string; 
  status: 'FLAGGED' | 'SUCCESS' | 'SUPPORT_NEEDED' | 'NORMAL' | 'STARTED' | 'RETURNED';
  score: number;
  privateComments: Comment[];
  hasUnreadAdmin?: boolean;
  hasUnreadStudent?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  // Assessment-specific fields
  isAssessment?: boolean;
  attemptNumber?: number;
  assessmentScore?: {
    correct: number;
    total: number;
    percentage: number;
    perBlock: Record<string, { correct: boolean; answer: unknown; needsReview?: boolean }>;
  };
  blockResponses?: Record<string, unknown>;
  rubricGrade?: RubricGrade;
  aiSuggestedGrade?: AISuggestedGrade;
  userSection?: string;
  flaggedAsAI?: boolean;
  flaggedAsAIBy?: string;
  flaggedAsAIAt?: string;
  // Return/unsubmit fields
  returnedAt?: string;
  returnedBy?: string;
  submittedOnBehalfBy?: string;
  // Feedback read tracking — set client-side when student first views teacher feedback
  feedbackReadAt?: string; // ISO timestamp
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
  scheduledAt?: string | null; // ISO date — deploy at this time; null/undefined = immediate
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
  targetStudentIds?: string[];
}

export type NotificationType =
  | 'QUEST_APPROVED' | 'QUEST_REJECTED' | 'LOOT_DROP' | 'NEW_MISSION'
  | 'NEW_RESOURCE' | 'LEVEL_UP' | 'ANNOUNCEMENT' | 'XP_EVENT'
  | 'ACHIEVEMENT_UNLOCKED' | 'DAILY_REWARD' | 'STREAK_MILESTONE'
  | 'BOSS_DEFEATED' | 'PARTY_INVITE' | 'WHEEL_PRIZE' | 'SKILL_UNLOCKED'
  | 'SET_BONUS_ACTIVE' | 'TUTORING_REWARD' | 'BOSS_QUIZ_START'
  | 'AI_FLAGGED' | 'ASSESSMENT_GRADED';

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

export type BossType = 'BRUTE' | 'PHANTOM' | 'SERPENT' | 'SKELETON' | 'GOLEM' | 'SLIME' | 'ORC';

export interface BossAppearance {
  bossType: BossType;
  hue: number; // 0-360 colour wheel
}

// --- Difficulty Scaling ---
export type DifficultyTier = 'NORMAL' | 'HARD' | 'NIGHTMARE' | 'APOCALYPSE';

export const DIFFICULTY_TIER_DEFS: Record<DifficultyTier, { name: string; description: string; hpMultiplier: number; color: string; forcedModifiers: BossModifierType[] }> = {
  NORMAL:     { name: 'Normal',     description: 'Standard difficulty',                                        hpMultiplier: 1,   color: 'gray',   forcedModifiers: [] },
  HARD:       { name: 'Hard',       description: '1.5x HP, boss rage enabled',                                 hpMultiplier: 1.5, color: 'amber',  forcedModifiers: ['BOSS_DAMAGE_BOOST'] },
  NIGHTMARE:  { name: 'Nightmare',  description: '2.5x HP, boss rage + time pressure + armor break',           hpMultiplier: 2.5, color: 'red',    forcedModifiers: ['BOSS_DAMAGE_BOOST', 'TIME_PRESSURE', 'ARMOR_BREAK'] },
  APOCALYPSE: { name: 'Apocalypse', description: '4x HP, all nightmare mods + double or nothing',              hpMultiplier: 4,   color: 'purple', forcedModifiers: ['BOSS_DAMAGE_BOOST', 'TIME_PRESSURE', 'ARMOR_BREAK', 'DOUBLE_OR_NOTHING'] },
};

export interface AutoScaleConfig {
  enabled: boolean;
  factors: ('CLASS_SIZE' | 'AVG_GEAR_SCORE' | 'AVG_LEVEL')[];
}

// --- Multi-Phase Bosses ---
export interface BossPhase {
  name: string;                    // e.g., "Enraged Form"
  hpThreshold: number;             // Triggers at this % of maxHp (e.g., 75, 50, 25)
  modifiers: BossModifier[];       // New modifiers that activate for this phase
  bossAppearance?: BossAppearance; // Visual change on phase transition
  dialogue?: string;               // Boss says something dramatic
  damagePerCorrect?: number;       // Override base damage for this phase
}

// --- Boss Abilities ---
export type BossAbilityTrigger = 'ON_PHASE' | 'EVERY_N_QUESTIONS' | 'HP_THRESHOLD' | 'RANDOM_CHANCE';
export type BossAbilityEffect = 'AOE_DAMAGE' | 'HEAL_BOSS' | 'ENRAGE' | 'SILENCE' | 'FOCUS_FIRE';

export interface BossAbility {
  id: string;
  name: string;                    // e.g., "Seismic Slam"
  description: string;
  trigger: BossAbilityTrigger;
  triggerValue: number;            // Phase #, N questions, HP %, or % chance (0-100)
  effect: BossAbilityEffect;
  value: number;                   // Damage amount, heal %, damage boost %, etc.
  duration?: number;               // How many questions the effect lasts (0 = instant)
}

export const BOSS_ABILITY_EFFECT_DEFS: Record<BossAbilityEffect, { name: string; description: string; unit: string }> = {
  AOE_DAMAGE:  { name: 'Seismic Slam',  description: 'All active students lose HP',                    unit: 'HP' },
  HEAL_BOSS:   { name: 'Regeneration',   description: 'Boss regains % of max HP',                      unit: '%' },
  ENRAGE:      { name: 'Enrage',         description: 'Boss damage increased for N questions',          unit: '%' },
  SILENCE:     { name: 'Silence',        description: 'Students cannot crit for N questions',           unit: 'questions' },
  FOCUS_FIRE:  { name: 'Focus Fire',     description: 'Top damage dealer takes double boss damage',     unit: 'questions' },
};

// --- Team Roles ---
export type PlayerRole = 'VANGUARD' | 'STRIKER' | 'SENTINEL' | 'COMMANDER';

export const PLAYER_ROLE_DEFS: Record<PlayerRole, { name: string; description: string; stat: string; color: string; icon: string }> = {
  VANGUARD:  { name: 'Vanguard',  description: '+15% base damage',                                stat: 'tech',     color: 'blue',   icon: 'Sword' },
  STRIKER:   { name: 'Striker',   description: '+10% crit chance, +0.5 crit multiplier',           stat: 'focus',    color: 'green',  icon: 'Zap' },
  SENTINEL:  { name: 'Sentinel',  description: '+10% armor, absorbs 20% AoE for team',            stat: 'analysis', color: 'yellow', icon: 'Shield' },
  COMMANDER: { name: 'Commander', description: 'Heals 5 HP to 2 allies on correct, +10% XP',      stat: 'charisma', color: 'purple', icon: 'Crown' },
};

// --- Boss Loot Tables ---
export interface BossLootEntry {
  id: string;
  itemName: string;                // Display name
  slot: EquipmentSlot;
  rarity: ItemRarity;
  stats: Partial<Record<'tech' | 'focus' | 'analysis' | 'charisma', number>>;
  dropChance: number;              // 0-100%
  isExclusive: boolean;            // Only drops from this boss (shown as unique tag)
  maxDrops?: number;               // How many can drop total across all students
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
  scheduledAt?: string | null; // ISO date — boss hidden until this time
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

  // Phase 1 additions
  difficultyTier?: DifficultyTier;
  autoScale?: AutoScaleConfig;
  scaledMaxHp?: number;            // HP after auto-scale calculation (original maxHp preserved)
  phases?: BossPhase[];
  currentPhase?: number;           // 0-indexed, tracks current active phase
  bossAbilities?: BossAbility[];
  activeAbilities?: { abilityId: string; effect: BossAbilityEffect; value: number; remainingQuestions: number }[];
  lootTable?: BossLootEntry[];
  totalQuestionsAnswered?: number; // Global counter for ability triggers
  triggeredAbilityIds?: string[];  // HP_THRESHOLD abilities that already fired (prevent re-trigger)
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
  // Phase 1 additions
  role?: PlayerRole;           // Derived role for this fight
  roleHealingGiven?: number;   // Commander: total HP healed to allies
  aoeDamageAbsorbed?: number;  // Sentinel: AoE damage absorbed for team
  abilitiesSurvived?: number;  // Number of boss abilities weathered
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
// FLUX SHOP CONSUMABLES
// ========================================

export type ConsumableType = 'XP_BOOST' | 'REROLL_TOKEN' | 'NAME_COLOR' | 'AGENT_COSMETIC' | 'CHARACTER_MODEL';

export type CosmeticVisualType = 'AURA' | 'PARTICLE' | 'FRAME' | 'TRAIL';

export interface AgentCosmeticDef {
  id: string;
  name: string;
  description: string;
  visualType: CosmeticVisualType;
  color: string; // primary hex color
  secondaryColor?: string; // optional secondary for gradients
  particleCount?: number; // for PARTICLE type
  intensity?: number; // 0-1, glow/effect strength
}

/** Per-slot equipped cosmetics — one of each type can be active simultaneously */
export interface ActiveCosmetics {
  aura?: string;    // aura cosmetic ID
  particle?: string; // particle cosmetic ID
  frame?: string;    // frame cosmetic ID
  trail?: string;    // trail cosmetic ID
}

export interface FluxShopItem {
  id: string;
  name: string;
  description: string;
  type: ConsumableType;
  cost: number; // Flux cost
  icon: string; // emoji or icon key
  /** For XP_BOOST: multiplier (e.g. 1.5 = +50%). For NAME_COLOR: hex color string stored in value field */
  value?: number;
  /** Duration in hours (XP_BOOST only) */
  duration?: number;
  /** Max purchases per day (0 = unlimited) */
  dailyLimit: number;
  isAvailable: boolean;
}

export interface ActiveBoost {
  itemId: string;
  type: ConsumableType;
  value: number;
  activatedAt: string; // ISO
  expiresAt: string; // ISO
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

// ========================================
// SECTION HELPERS
// ========================================

/** Get a student's section for a specific class, falling back to legacy `section` field */
export function getUserSectionForClass(user: User, classType: string): string | undefined {
  return user.classSections?.[classType] ?? (
    (user.classType === classType || user.enrolledClasses?.includes(classType)) ? user.section : undefined
  );
}

/** Compute available sections for a given class from student data */
export function getSectionsForClass(students: User[], classType: string): string[] {
  const sections = new Set<string>();
  students.forEach(s => {
    const sec = getUserSectionForClass(s, classType);
    if (sec) sections.add(sec);
  });
  return Array.from(sections).sort();
}

// ========================================
// CLASSROOM HELPERS
// ========================================

/**
 * Check whether an assignment has any Google Classroom links (new or legacy).
 * Note: classroomLinks:[] (empty array) returns false — same as undefined/never linked.
 * If you need to distinguish "all unlinked" from "never linked", check the field directly.
 */
export function hasClassroomLinks(a: Assignment): boolean {
  return !!(a.classroomLinks?.length || a.classroomLink);
}

// ========================================
// BUG REPORTS
// ========================================

export interface BugReport {
  id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  category: 'bug' | 'feature' | 'other';
  description: string;
  page: string;
  userAgent: string;
  timestamp: string;
  resolved?: boolean;
}

// ========================================
// SONG REQUESTS
// ========================================

export interface SongRequest {
  id?: string;
  userId: string;
  userName: string;
  song: string;
  artist: string;
  timestamp: string;
  status: 'pending' | 'played' | 'dismissed';
}

// ========================================
// ENROLLMENT CODES
// ========================================

export interface EnrollmentCode {
  id: string;
  code: string;
  classType: string;
  section?: string;
  createdAt: string;
  createdBy: string;
  usedCount: number;
  maxUses?: number;
  isActive: boolean;
}

// ========================================
// BEHAVIOR QUICK-AWARDS
// ========================================

export interface BehaviorCategory {
  id: string;
  name: string;
  icon: string;
  xpAmount: number;
  fluxAmount: number;
  color: string;
}

export interface BehaviorAward {
  id?: string;
  studentId: string;
  studentName: string;
  categoryId: string;
  categoryName: string;
  xpAmount: number;
  fluxAmount: number;
  classType: string;
  awardedBy: string;
  timestamp: string;
}

export const DEFAULT_BEHAVIOR_CATEGORIES: BehaviorCategory[] = [
  { id: 'participation', name: 'Participation', icon: '🙋', xpAmount: 25, fluxAmount: 5, color: 'blue' },
  { id: 'helping', name: 'Helping Others', icon: '🤝', xpAmount: 30, fluxAmount: 10, color: 'green' },
  { id: 'leadership', name: 'Leadership', icon: '⭐', xpAmount: 35, fluxAmount: 10, color: 'amber' },
  { id: 'focus', name: 'Great Focus', icon: '🎯', xpAmount: 20, fluxAmount: 5, color: 'purple' },
  { id: 'creativity', name: 'Creativity', icon: '💡', xpAmount: 30, fluxAmount: 8, color: 'pink' },
  { id: 'perseverance', name: 'Perseverance', icon: '💪', xpAmount: 25, fluxAmount: 5, color: 'orange' },
];

// ========================================
// STREAK SYSTEM
// ========================================

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  freezeTokens: number;
  maxFreezeTokens: number;
  streakHistory: string[];   // Last 30 active dates
  milestones: number[];       // Days reached (3, 7, 14, 21, 30)
}


// ========================================
// TYPE GUARDS — validate Firestore data at deserialization boundaries
// ========================================

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate that an unknown Firestore doc satisfies the minimum User shape. */
export function isValidUser(data: unknown): data is User {
  if (!isObject(data)) return false;
  return (
    typeof data.email === 'string' &&
    typeof data.name === 'string' &&
    (data.role === UserRole.ADMIN || data.role === UserRole.STUDENT) &&
    typeof data.isWhitelisted === 'boolean'
  );
}

/** Validate that an unknown Firestore doc satisfies the minimum Assignment shape. */
export function isValidAssignment(data: unknown): data is Assignment {
  if (!isObject(data)) return false;
  return (
    typeof data.id === 'string' &&
    typeof data.title === 'string' &&
    typeof data.classType === 'string' &&
    (data.status === AssignmentStatus.ACTIVE ||
     data.status === AssignmentStatus.ARCHIVED ||
     data.status === AssignmentStatus.DRAFT)
  );
}

/** Validate that an unknown Firestore doc satisfies the minimum Submission shape. */
export function isValidSubmission(data: unknown): data is Submission {
  if (!isObject(data)) return false;
  return (
    typeof data.userId === 'string' &&
    typeof data.assignmentId === 'string' &&
    typeof data.status === 'string'
  );
}

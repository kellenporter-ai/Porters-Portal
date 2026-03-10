/**
 * Route definitions — single source of truth for URL paths.
 * Maps old tab names to URL paths for backwards-compatible navigation.
 */

// Admin routes
export const ADMIN_ROUTES = {
  DASHBOARD: '/dashboard',
  ADMIN_PANEL: '/admin',
  RESOURCE_EDITOR: '/editor',
  USER_MANAGEMENT: '/users',
  STUDENT_GROUPS: '/groups',
  ENROLLMENT_CODES: '/enrollment',
  XP_COMMAND: '/xp',
  STUDENT_REPORTS: '/reports',
} as const;

// Student routes
export const STUDENT_ROUTES = {
  HOME: '/home',
  RESOURCES: '/resources',
  LOADOUT: '/loadout',
  MISSIONS: '/missions',
  BADGES: '/badges',
  SKILLS: '/skills',
  FORTUNE: '/fortune',
  FLUX_SHOP: '/flux-shop',
  TUTORING: '/tutoring',
  INTEL: '/intel',
  PROGRESS: '/progress',
  CALENDAR: '/calendar',
  DUNGEONS: '/dungeons',
  ARENA: '/arena',
  DEPLOY: '/deploy',
  FORENSICS: '/forensics',
  LEADERBOARD: '/leaderboard',
} as const;

// XP Command sub-routes (nested under /xp)
export const XP_SUB_ROUTES: Record<string, string> = {
  'Operatives': 'operatives',
  'XP Protocols': 'protocols',
  'Missions': 'missions',
  'Mission Control': 'mission-control',
  'Boss Ops': 'boss-ops',
  'Tutoring': 'tutoring',
  'Analytics': 'analytics',
  'Dungeon Ops': 'dungeon-ops',
  'Idle Missions': 'idle-missions',
};

/**
 * Map old tab names (used in Layout navigation) → URL paths.
 * Used during the transition to convert setActiveTab calls to navigate().
 */
export const TAB_TO_PATH: Record<string, string> = {
  // Admin
  'Dashboard': ADMIN_ROUTES.DASHBOARD,
  'Admin Panel': ADMIN_ROUTES.ADMIN_PANEL,
  'Resource Editor': ADMIN_ROUTES.RESOURCE_EDITOR,
  'User Management': ADMIN_ROUTES.USER_MANAGEMENT,
  'Student Groups': ADMIN_ROUTES.STUDENT_GROUPS,
  'Enrollment Codes': ADMIN_ROUTES.ENROLLMENT_CODES,
  'Student Reports': ADMIN_ROUTES.STUDENT_REPORTS,
  // XP Command children — stored as "XP Command:Operatives" in the old system
  'XP Command:Operatives': '/xp/operatives',
  'XP Command:XP Protocols': '/xp/protocols',
  'XP Command:Missions': '/xp/missions',
  'XP Command:Mission Control': '/xp/mission-control',
  'XP Command:Boss Ops': '/xp/boss-ops',
  'XP Command:Tutoring': '/xp/tutoring',
  'XP Command:Analytics': '/xp/analytics',
  'XP Command:Dungeon Ops': '/xp/dungeon-ops',
  'XP Command:Idle Missions': '/xp/idle-missions',
  // Student
  'Home': STUDENT_ROUTES.HOME,
  'Resources': STUDENT_ROUTES.RESOURCES,
  'Agent Loadout': STUDENT_ROUTES.LOADOUT,
  'Missions': STUDENT_ROUTES.MISSIONS,
  'Badges': STUDENT_ROUTES.BADGES,
  'Skills': STUDENT_ROUTES.SKILLS,
  'Fortune': STUDENT_ROUTES.FORTUNE,
  'Flux Shop': STUDENT_ROUTES.FLUX_SHOP,
  'Tutoring': STUDENT_ROUTES.TUTORING,
  'Intel Dossier': STUDENT_ROUTES.INTEL,
  'Progress': STUDENT_ROUTES.PROGRESS,
  'Calendar': STUDENT_ROUTES.CALENDAR,
  'Dungeons': STUDENT_ROUTES.DUNGEONS,
  'Arena': STUDENT_ROUTES.ARENA,
  'Deploy': STUDENT_ROUTES.DEPLOY,
  'Forensics': STUDENT_ROUTES.FORENSICS,
  'Leaderboard': STUDENT_ROUTES.LEADERBOARD,
};

/** Reverse lookup: URL path → old tab name (for Layout active state) */
export const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab])
);

/** Map student tab name → StudentDashboard tab prop */
export const STUDENT_TAB_MAP: Record<string, 'HOME' | 'RESOURCES' | 'LOADOUT' | 'MISSIONS' | 'ACHIEVEMENTS' | 'SKILLS' | 'FORTUNE' | 'FLUX_SHOP' | 'TUTORING' | 'INTEL' | 'PROGRESS' | 'CALENDAR' | 'DUNGEONS' | 'ARENA' | 'DEPLOY'> = {
  'Home': 'HOME',
  'Resources': 'RESOURCES',
  'Agent Loadout': 'LOADOUT',
  'Missions': 'MISSIONS',
  'Badges': 'ACHIEVEMENTS',
  'Skills': 'SKILLS',
  'Fortune': 'FORTUNE',
  'Flux Shop': 'FLUX_SHOP',
  'Tutoring': 'TUTORING',
  'Intel Dossier': 'INTEL',
  'Progress': 'PROGRESS',
  'Calendar': 'CALENDAR',
  'Dungeons': 'DUNGEONS',
  'Arena': 'ARENA',
  'Deploy': 'DEPLOY',
};

/** Student paths that render via StudentDashboard */
export const STUDENT_DASHBOARD_PATHS = new Set([
  STUDENT_ROUTES.HOME,
  STUDENT_ROUTES.RESOURCES,
  STUDENT_ROUTES.LOADOUT,
  STUDENT_ROUTES.MISSIONS,
  STUDENT_ROUTES.BADGES,
  STUDENT_ROUTES.SKILLS,
  STUDENT_ROUTES.FORTUNE,
  STUDENT_ROUTES.FLUX_SHOP,
  STUDENT_ROUTES.TUTORING,
  STUDENT_ROUTES.INTEL,
  STUDENT_ROUTES.PROGRESS,
  STUDENT_ROUTES.CALENDAR,
  STUDENT_ROUTES.DUNGEONS,
  STUDENT_ROUTES.ARENA,
  STUDENT_ROUTES.DEPLOY,
]);

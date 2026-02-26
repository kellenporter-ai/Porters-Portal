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
  TUTORING: '/tutoring',
  INTEL: '/intel',
  PROGRESS: '/progress',
  CALENDAR: '/calendar',
  FORENSICS: '/forensics',
  PHYSICS_LAB: '/physics-lab',
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
  // XP Command children — stored as "XP Command:Operatives" in the old system
  'XP Command:Operatives': '/xp/operatives',
  'XP Command:XP Protocols': '/xp/protocols',
  'XP Command:Missions': '/xp/missions',
  'XP Command:Mission Control': '/xp/mission-control',
  'XP Command:Boss Ops': '/xp/boss-ops',
  'XP Command:Tutoring': '/xp/tutoring',
  'XP Command:Analytics': '/xp/analytics',
  // Student
  'Home': STUDENT_ROUTES.HOME,
  'Resources': STUDENT_ROUTES.RESOURCES,
  'Agent Loadout': STUDENT_ROUTES.LOADOUT,
  'Missions': STUDENT_ROUTES.MISSIONS,
  'Badges': STUDENT_ROUTES.BADGES,
  'Skills': STUDENT_ROUTES.SKILLS,
  'Fortune': STUDENT_ROUTES.FORTUNE,
  'Tutoring': STUDENT_ROUTES.TUTORING,
  'Intel Dossier': STUDENT_ROUTES.INTEL,
  'Progress': STUDENT_ROUTES.PROGRESS,
  'Calendar': STUDENT_ROUTES.CALENDAR,
  'Forensics': STUDENT_ROUTES.FORENSICS,
  'Physics Lab': STUDENT_ROUTES.PHYSICS_LAB,
  'Leaderboard': STUDENT_ROUTES.LEADERBOARD,
};

/** Reverse lookup: URL path → old tab name (for Layout active state) */
export const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab])
);

/** Map student tab name → StudentDashboard tab prop */
export const STUDENT_TAB_MAP: Record<string, 'HOME' | 'RESOURCES' | 'LOADOUT' | 'MISSIONS' | 'ACHIEVEMENTS' | 'SKILLS' | 'FORTUNE' | 'TUTORING' | 'INTEL' | 'PROGRESS' | 'CALENDAR'> = {
  'Home': 'HOME',
  'Resources': 'RESOURCES',
  'Agent Loadout': 'LOADOUT',
  'Missions': 'MISSIONS',
  'Badges': 'ACHIEVEMENTS',
  'Skills': 'SKILLS',
  'Fortune': 'FORTUNE',
  'Tutoring': 'TUTORING',
  'Intel Dossier': 'INTEL',
  'Progress': 'PROGRESS',
  'Calendar': 'CALENDAR',
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
  STUDENT_ROUTES.TUTORING,
  STUDENT_ROUTES.INTEL,
  STUDENT_ROUTES.PROGRESS,
  STUDENT_ROUTES.CALENDAR,
]);

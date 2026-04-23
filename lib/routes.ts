/**
 * Route definitions — single source of truth for URL paths.
 * Maps old tab names to URL paths for backwards-compatible navigation.
 */

// Admin routes
export const ADMIN_ROUTES = {
  DASHBOARD: '/dashboard',
  GRADING: '/grading',
  RESOURCE_EDITOR: '/editor',
  USER_MANAGEMENT: '/users',
  ENROLLMENT_CODES: '/enrollment',
  XP_COMMAND: '/xp',
  STUDENT_REPORTS: '/reports',
} as const;

// Student routes
export const STUDENT_ROUTES = {
  HOME: '/home',
  RESOURCES: '/resources',
  LOADOUT: '/loadout',
  BADGES: '/badges',
  SKILLS: '/skills',
  FORTUNE: '/fortune',
  FLUX_SHOP: '/flux-shop',
  INTEL: '/intel',
  PROGRESS: '/progress',
  CALENDAR: '/calendar',
  FORENSICS: '/forensics',
  LEADERBOARD: '/leaderboard',
  FEEDBACK: '/feedback',
  BOSS: '/boss',
} as const;

// XP Command sub-routes (nested under /xp)
export const XP_SUB_ROUTES: Record<string, string> = {
  'Operatives': 'operatives',
  'XP Protocols': 'protocols',
  'Boss Ops': 'boss-ops',
  'Analytics': 'analytics',
};

/**
 * Map old tab names (used in Layout navigation) → URL paths.
 * Used during the transition to convert setActiveTab calls to navigate().
 */
export const TAB_TO_PATH: Record<string, string> = {
  // Admin
  'Dashboard': ADMIN_ROUTES.DASHBOARD,
  'Grading': ADMIN_ROUTES.GRADING,
  'Resource Editor': ADMIN_ROUTES.RESOURCE_EDITOR,
  'User Management': ADMIN_ROUTES.USER_MANAGEMENT,
  'Enrollment Codes': ADMIN_ROUTES.ENROLLMENT_CODES,
  'Student Reports': ADMIN_ROUTES.STUDENT_REPORTS,
  // XP Command children — stored as "XP Command:Operatives" in the old system
  'XP Command:Operatives': '/xp/operatives',
  'XP Command:XP Protocols': '/xp/protocols',
  'XP Command:Boss Ops': '/xp/boss-ops',
  'XP Command:Analytics': '/xp/analytics',
  // Student
  'Home': STUDENT_ROUTES.HOME,
  'Resources': STUDENT_ROUTES.RESOURCES,
  'Loadout': STUDENT_ROUTES.LOADOUT,
  'Badges': STUDENT_ROUTES.BADGES,
  'Skills': STUDENT_ROUTES.SKILLS,
  'Fortune': STUDENT_ROUTES.FORTUNE,
  'Flux Shop': STUDENT_ROUTES.FLUX_SHOP,
  'Intel Dossier': STUDENT_ROUTES.INTEL,
  'Progress': STUDENT_ROUTES.PROGRESS,
  'Calendar': STUDENT_ROUTES.CALENDAR,
  'Forensics': STUDENT_ROUTES.FORENSICS,
  'Leaderboard': STUDENT_ROUTES.LEADERBOARD,
  'Feedback': STUDENT_ROUTES.FEEDBACK,
  'Boss Encounters': STUDENT_ROUTES.BOSS,
};

/** Reverse lookup: URL path → old tab name (for Layout active state) */
export const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab])
);

/** Map student tab name → StudentDashboard tab prop */
export const STUDENT_TAB_MAP: Record<string, 'HOME' | 'RESOURCES' | 'LOADOUT' | 'ACHIEVEMENTS' | 'SKILLS' | 'FORTUNE' | 'FLUX_SHOP' | 'INTEL' | 'PROGRESS' | 'CALENDAR' | 'BOSS'> = {
  'Home': 'HOME',
  'Resources': 'RESOURCES',
  'Loadout': 'LOADOUT',
  'Badges': 'ACHIEVEMENTS',
  'Skills': 'SKILLS',
  'Fortune': 'FORTUNE',
  'Flux Shop': 'FLUX_SHOP',
  'Intel Dossier': 'INTEL',
  'Progress': 'PROGRESS',
  'Calendar': 'CALENDAR',
  'Boss Encounters': 'BOSS',
};

/** Student paths that render via StudentDashboard */
export const STUDENT_DASHBOARD_PATHS = new Set([
  STUDENT_ROUTES.HOME,
  STUDENT_ROUTES.RESOURCES,
  STUDENT_ROUTES.LOADOUT,
  STUDENT_ROUTES.BADGES,
  STUDENT_ROUTES.SKILLS,
  STUDENT_ROUTES.FORTUNE,
  STUDENT_ROUTES.FLUX_SHOP,
  STUDENT_ROUTES.INTEL,
  STUDENT_ROUTES.PROGRESS,
  STUDENT_ROUTES.CALENDAR,
  STUDENT_ROUTES.BOSS,
]);

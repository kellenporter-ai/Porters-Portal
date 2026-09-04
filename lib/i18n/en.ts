import type { Dictionary } from './index';

/**
 * English dictionary — app shell strings (Phase 4a).
 * Values MUST be byte-identical to the pre-i18n UI strings; this file is the
 * EN acceptance baseline. Namespaced by area; keys are flat dot-paths so the
 * Phase 4b student-screen migration is mechanical (just add more keys here).
 */
export const en: Dictionary = {
  // ── Nav item display names (NAV_DISPLAY_NAMES + canonical names) ──
  'nav.home': 'Home',
  'nav.resources': 'Resources',
  'nav.feedback': 'Feedback',
  'nav.calendar': 'Calendar',
  'nav.loadout': 'Gear',
  'nav.fortune': 'Fortune',
  'nav.fluxShop': 'Shop',
  'nav.badges': 'Badges',
  'nav.skills': 'Skills',
  'nav.bossEncounters': 'Boss Encounters',
  'nav.intelDossier': 'My Stats',
  'nav.progress': 'Progress',
  'nav.leaderboard': 'Leaderboard',
  'nav.dashboard': 'Dashboard',
  'nav.grading': 'Grading',
  'nav.studentReports': 'Student Reports',
  'nav.resourceEditor': 'Lesson Editor',
  'nav.userManagement': 'User Management',
  'nav.enrollmentCodes': 'Enrollment Codes',
  'nav.xpCommand': 'Gamification',
  'nav.operatives': 'Students',
  'nav.xpProtocols': 'Rewards',
  'nav.bossOps': 'Boss Battles',
  'nav.analytics': 'Analytics',

  // ── Nav group labels ──
  'navGroup.learning': 'Learning',
  'navGroup.operations': 'Operations',
  'navGroup.intel': 'Intel',
  'navGroup.admin_ops': 'Operations',
  'navGroup.classroom': 'Classroom',
  'navGroup.systems': 'Systems',

  // ── Nav flavor subtitles (constants.tsx NAVIGATION) ──
  'navFlavor.loadout': 'Gear',
  'navFlavor.fluxShop': 'Flux',
  'navFlavor.badges': 'Achievements',
  'navFlavor.bossEncounters': 'Encounters',
  'navFlavor.intelDossier': 'Dossier',

  // ── Sidebar chrome / footer actions ──
  'app.title': "Porter's Portal",
  'app.subtitle.admin': 'Admin System',
  'app.subtitle.student': 'Operative Terminal',
  'app.skipToContent': 'Skip to main content',
  'app.crosBanner.text': 'On a Chromebook? Enable Performance Mode for smoother scrolling.',
  'app.crosBanner.enable': 'Enable',
  'app.crosBanner.dismiss': 'Dismiss',
  'app.footer.settings': 'Settings',
  'app.footer.signOut': 'Sign Out',
  'app.footer.reportBug': 'Report a bug',
  'app.footer.requestSong': 'Request a song',
  'app.footer.expandSidebar': 'Expand sidebar',
  'app.footer.collapseSidebar': 'Collapse sidebar',
  'app.footer.openSettings': 'Open settings',
  'app.footer.level': 'Level {level}',
  'app.footer.agent': 'Agent',
  'app.nav.mainAria': 'Main navigation',
  'app.nav.mobileAria': 'Mobile navigation',
  'app.nav.quickAria': 'Quick navigation',
  'app.nav.openMenu': 'Open navigation menu',
  'app.nav.closeMenu': 'Close navigation menu',
  'app.bottomNav.progress': 'Progress',

  // ── Urgency dot (overdue assignments) ──
  'nav.urgencyDot.aria': 'Has assignments due soon',

  // ── Command palette ──
  'palette.ariaLabel': 'Command palette — search navigation',
  'palette.placeholder': 'Search tabs…',
  'palette.searchAria': 'Search navigation tabs',
  'palette.noResults': 'No matching tabs.',
  'palette.groupTag': 'group',

  // ── Settings modal ──
  'settings.title': 'User Control Center',
  'settings.section.visuals': 'Visuals & Performance',
  'settings.performance.title': 'Performance Mode',
  'settings.performance.description': 'Disable blurs and heavy animations for older hardware.',
  'settings.section.privacy': 'Privacy & Identity',
  'settings.privacy.title': 'Privacy Codename',
  'settings.privacy.description': 'Hide real name on leaderboards and use your operative codename.',
  'settings.codename.label': 'Operative Codename',
  'settings.codename.placeholder': 'Enter codename...',
  'settings.codename.chars': '{count}/24 characters',
  'settings.section.interface': 'Interface',
  'settings.language.label': 'Language',
  'settings.language.description': 'Choose the language for menus and buttons.',
  'settings.sound.title': 'Sound Effects',
  'settings.sound.description': 'Play audio feedback for XP gains, level ups, and actions.',
  'settings.volume.label': 'Master Volume',
  'settings.section.notifications': 'Notifications',
  'settings.push.title': 'Push Notifications',
  'settings.push.description': 'Get desktop alerts for quests, loot drops, and announcements when the tab is in the background.',
  'settings.push.denied': 'Blocked by your browser. Allow notifications in browser settings to enable.',
  'settings.push.unsupported': 'Push notifications are not supported in this browser.',
  'settings.push.enabledToast': 'Push notifications enabled!',
  'settings.push.deniedToast': 'Notifications blocked by browser. Check your browser settings.',
  'settings.section.appearance': 'Appearance',
  'settings.appearance.light': 'Light',
  'settings.appearance.dark': 'Dark',
  'settings.section.enrollment': 'Enrollment',
  'settings.enrollment.joinTitle': 'Join Another Class',
  'settings.enrollment.join': 'Join',
  'settings.enrollment.errorCode': 'Enter a valid code.',
  'settings.enrollment.errorRedeem': 'Failed to redeem code.',
  'settings.enrollment.errorGeneric': 'Something went wrong. Please try again.',
  'settings.enrollment.success': 'Enrolled in {className}!',
  'settings.enrollment.joinedToast': 'Joined {className}!',
  'settings.save': 'Apply Changes',
  'settings.saveError': 'Failed to save settings.',

  // ── Save status indicator ──
  'save.saving': 'Saving...',
  'save.saved': 'Saved',
  'save.retrying': 'Retrying save...',
  'save.error.session': 'Session expired — refresh to restore your work',
  'save.error.prolonged': "Can't save to server — DO NOT refresh or close this tab! Work is only in this tab.",
  'save.error.short': 'Save failed — work is safe in this tab only',
  'save.offline': 'Offline — work saved locally',
  'save.serverOnly': 'Saving to server only',
  'save.sessionExpiredChip': 'Session expired — refresh to restore work',

  // ── Proctor session chrome ──
  'proctor.session.active': 'Active Session',
  'proctor.session.paused': 'Away (Paused)',
  'proctor.session.tokenError': 'Unable to start assessment session. Please check your internet connection and refresh the page.',
};


import { Atom, Microscope, Zap } from 'lucide-react';
import { DefaultClassTypes } from './types';

export const ADMIN_EMAIL = 'kellporter2@paps.net';
export const TEACHER_DISPLAY_NAME = 'Mr. Porter';

export const CLASS_CONFIGS = {
  [DefaultClassTypes.AP_PHYSICS]: {
    icon: <Zap className="w-6 h-6" />,
    color: 'bg-blue-600',
    borderColor: 'border-blue-200'
  },
  [DefaultClassTypes.HONORS_PHYSICS]: {
    icon: <Atom className="w-6 h-6" />,
    color: 'bg-purple-600',
    borderColor: 'border-purple-200'
  },
  [DefaultClassTypes.FORENSICS]: {
    icon: <Microscope className="w-6 h-6" />,
    color: 'bg-emerald-600',
    borderColor: 'border-emerald-200'
  }
};

export type NavGroup = 'learning' | 'operations' | 'intel';

export interface NavItem {
  name: string;
  iconSrc: string;
  iconSize?: number;
  role: 'ADMIN' | 'STUDENT';
  group?: NavGroup;
  /** Optional small flavor label rendered beneath the primary name in the expanded sidebar (spy theme). */
  flavor?: string;
  children?: { name: string; iconSrc: string; iconSize?: number }[];
}

export const NAVIGATION: NavItem[] = [
  // Admin navigation
  { name: 'Dashboard', iconSrc: '/assets/icons/icon-dashboard.png', role: 'ADMIN' },
  { name: 'Grading', iconSrc: '/assets/icons/icon-grading.png', role: 'ADMIN' },
  { name: 'Resource Editor', iconSrc: '/assets/icons/icon-resource-editor.png', role: 'ADMIN' },
  { name: 'User Management', iconSrc: '/assets/icons/icon-user-management.png', role: 'ADMIN' },
  { name: 'Enrollment Codes', iconSrc: '/assets/icons/icon-enrollment-codes.png', role: 'ADMIN' },
  { name: 'Student Reports', iconSrc: '/assets/icons/icon-student-reports.png', role: 'ADMIN' },
  { name: 'XP Command', iconSrc: '/assets/icons/icon-xp-command.png', role: 'ADMIN', children: [
    { name: 'Operatives', iconSrc: '/assets/icons/icon-operatives.png' },
    { name: 'XP Protocols', iconSrc: '/assets/icons/icon-xp-protocols.png' },
    { name: 'Boss Ops', iconSrc: '/assets/icons/icon-boss-ops.png' },
    { name: 'Analytics', iconSrc: '/assets/icons/icon-analytics.png' },
  ]},
  // Student navigation — ungrouped
  { name: 'Home', iconSrc: '/assets/icons/icon-home.png', role: 'STUDENT' },
  // Learning group
  { name: 'Resources', iconSrc: '/assets/icons/icon-resources.png', role: 'STUDENT', group: 'learning' },
  { name: 'Feedback', iconSrc: '/assets/icons/icon-grading.png', role: 'STUDENT', group: 'learning' },
  { name: 'Calendar', iconSrc: '/assets/icons/icon-calendar.png', role: 'STUDENT', group: 'learning' },
  // Operations group
  { name: 'Agent Loadout', iconSrc: '/assets/icons/icon-agent-loadout.png', role: 'STUDENT', group: 'operations', flavor: 'Loadout' },
  { name: 'Fortune', iconSrc: '/assets/icons/icon-fortune.png', role: 'STUDENT', group: 'operations' },
  { name: 'Flux Shop', iconSrc: '/assets/icons/icon-flux-shop.png', role: 'STUDENT', group: 'operations', flavor: 'Flux' },
  { name: 'Badges', iconSrc: '/assets/icons/icon-badges.png', role: 'STUDENT', group: 'operations', iconSize: 35, flavor: 'Achievements' },
  { name: 'Skills', iconSrc: '/assets/icons/icon-skills.png', role: 'STUDENT', group: 'operations', iconSize: 35 },
  // Intel group
  { name: 'Intel Dossier', iconSrc: '/assets/icons/icon-intel-dossier.png', role: 'STUDENT', group: 'intel', flavor: 'Dossier' },
  { name: 'Progress', iconSrc: '/assets/icons/icon-progress.png', role: 'STUDENT', group: 'intel', iconSize: 48 },
  { name: 'Leaderboard', iconSrc: '/assets/icons/icon-leaderboard.png', role: 'STUDENT', group: 'intel', iconSize: 48 },
];

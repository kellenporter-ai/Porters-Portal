
import { Atom, Microscope, Zap, ShieldAlert, Users, LayoutDashboard, Target, Layers, Briefcase, Trophy, GitBranch, Dices, Shield, Brain, KeyRound, BarChart3, BookOpen, TrendingUp, Calendar, PieChart, Home, Store, FileBarChart, ClipboardCheck } from 'lucide-react';
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
  icon: React.ReactNode;
  role: 'ADMIN' | 'STUDENT';
  group?: NavGroup;
  children?: { name: string; icon: React.ReactNode }[];
}

export const NAVIGATION: NavItem[] = [
  // Admin navigation
  { name: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'Grading', icon: <ClipboardCheck className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'Admin Panel', icon: <ShieldAlert className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'Resource Editor', icon: <BookOpen className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'User Management', icon: <Users className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'Enrollment Codes', icon: <KeyRound className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'Student Reports', icon: <FileBarChart className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'XP Command', icon: <Target className="w-5 h-5" />, role: 'ADMIN', children: [
    { name: 'Operatives', icon: <Shield className="w-4 h-4" /> },
    { name: 'XP Protocols', icon: <Zap className="w-4 h-4" /> },
    { name: 'Boss Ops', icon: <Brain className="w-4 h-4" /> },
    { name: 'Analytics', icon: <PieChart className="w-4 h-4" /> },
  ]},
  // Student navigation — ungrouped
  { name: 'Home', icon: <Home className="w-5 h-5" />, role: 'STUDENT' },
  // Learning group
  { name: 'Resources', icon: <Layers className="w-5 h-5" />, role: 'STUDENT', group: 'learning' },
  { name: 'Calendar', icon: <Calendar className="w-5 h-5" />, role: 'STUDENT', group: 'learning' },
  // Operations group
  { name: 'Agent Loadout', icon: <Briefcase className="w-5 h-5" />, role: 'STUDENT', group: 'operations' },
  { name: 'Fortune', icon: <Dices className="w-5 h-5" />, role: 'STUDENT', group: 'operations' },
  { name: 'Flux Shop', icon: <Store className="w-5 h-5" />, role: 'STUDENT', group: 'operations' },
  { name: 'Badges', icon: <Trophy className="w-5 h-5" />, role: 'STUDENT', group: 'operations' },
  { name: 'Skills', icon: <GitBranch className="w-5 h-5" />, role: 'STUDENT', group: 'operations' },
  // Intel group
  { name: 'Intel Dossier', icon: <BarChart3 className="w-5 h-5" />, role: 'STUDENT', group: 'intel' },
  { name: 'Progress', icon: <TrendingUp className="w-5 h-5" />, role: 'STUDENT', group: 'intel' },
  { name: 'Leaderboard', icon: <Trophy className="w-5 h-5" />, role: 'STUDENT', group: 'intel' },
];

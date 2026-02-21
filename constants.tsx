
import { Atom, Microscope, Zap, ShieldAlert, Users, LayoutDashboard, Target, Layers, Briefcase, Trophy, GitBranch, Dices, GraduationCap, Shield, Brain, Award } from 'lucide-react';
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

export interface NavItem {
  name: string;
  icon: React.ReactNode;
  role: 'ADMIN' | 'STUDENT';
  children?: { name: string; icon: React.ReactNode }[];
}

export const NAVIGATION: NavItem[] = [
  // Admin navigation
  { name: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'Admin Panel', icon: <ShieldAlert className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'User Management', icon: <Users className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'Student Groups', icon: <Users className="w-5 h-5" />, role: 'ADMIN' },
  { name: 'XP Command', icon: <Target className="w-5 h-5" />, role: 'ADMIN', children: [
    { name: 'Operatives', icon: <Shield className="w-4 h-4" /> },
    { name: 'XP Protocols', icon: <Zap className="w-4 h-4" /> },
    { name: 'Missions', icon: <Award className="w-4 h-4" /> },
    { name: 'Mission Control', icon: <Briefcase className="w-4 h-4" /> },
    { name: 'Boss Ops', icon: <Brain className="w-4 h-4" /> },
    { name: 'Tutoring', icon: <GraduationCap className="w-4 h-4" /> },
  ]},
  // Student navigation
  { name: 'Resources', icon: <Layers className="w-5 h-5" />, role: 'STUDENT' },
  { name: 'Agent Loadout', icon: <Briefcase className="w-5 h-5" />, role: 'STUDENT' },
  { name: 'Missions', icon: <Target className="w-5 h-5" />, role: 'STUDENT' },
  { name: 'Badges', icon: <Trophy className="w-5 h-5" />, role: 'STUDENT' },
  { name: 'Skills', icon: <GitBranch className="w-5 h-5" />, role: 'STUDENT' },
  { name: 'Fortune', icon: <Dices className="w-5 h-5" />, role: 'STUDENT' },
  { name: 'Leaderboard', icon: <Trophy className="w-5 h-5" />, role: 'STUDENT' },
  { name: 'Tutoring', icon: <GraduationCap className="w-5 h-5" />, role: 'STUDENT' },
];

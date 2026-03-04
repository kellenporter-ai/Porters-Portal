import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Assignment, ClassConfig, User, UserRole, XPEvent, Quest } from '../types';
import { dataService } from '../services/dataService';
import { reportError } from './errorReporting';

interface AppData {
  assignments: Assignment[];
  classConfigs: ClassConfig[];
  xpEvents: XPEvent[];
  quests: Quest[];
  enabledFeatures: { evidenceLocker: boolean; leaderboard: boolean; physicsTools: boolean; communications: boolean; dungeons: boolean; pvpArena: boolean; bossFights: boolean };
}

const AppDataContext = createContext<AppData | null>(null);

export const useAppData = (): AppData => {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
};

export const AppDataProvider: React.FC<{ user: User; children: React.ReactNode }> = ({ user, children }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classConfigs, setClassConfigs] = useState<ClassConfig[]>([]);
  const [xpEvents, setXpEvents] = useState<XPEvent[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);

  useEffect(() => {
    if (!user.isWhitelisted && user.role !== UserRole.ADMIN) return;
    const unsubs = [
      dataService.subscribeToAssignments(setAssignments),
      dataService.subscribeToClassConfigs(setClassConfigs),
    ];

    // XP events & quests may fail for permission reasons — don't block other subscriptions.
    // Students only need active events/quests; admins get the full list for management.
    const isStudent = user.role === UserRole.STUDENT;
    try { unsubs.push(dataService.subscribeToXPEvents(setXpEvents, isStudent)); }
    catch (e) { reportError(e, { subscription: 'xpEvents' }); }

    try { unsubs.push(dataService.subscribeToQuests(setQuests, isStudent)); }
    catch (e) { reportError(e, { subscription: 'quests' }); }

    return () => unsubs.forEach(u => u());
  }, [user.id, user.isWhitelisted, user.role]);

  const enabledFeatures = useMemo(() => {
    const defaults = { evidenceLocker: true, leaderboard: true, physicsTools: true, communications: true, dungeons: true, pvpArena: true, bossFights: true };
    if (user.role === 'STUDENT' && user.classType) {
      const config = classConfigs.find(c => c.className === user.classType);
      if (config) return config.features;
    }
    return defaults;
  }, [user.role, user.classType, classConfigs]);

  const value = useMemo(() => ({ assignments, classConfigs, xpEvents, quests, enabledFeatures }), [assignments, classConfigs, xpEvents, quests, enabledFeatures]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

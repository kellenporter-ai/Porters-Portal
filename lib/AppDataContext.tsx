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
  loading: boolean;
}

const DEFAULT_FEATURES = { evidenceLocker: true, leaderboard: true, physicsTools: true, communications: true, dungeons: true, pvpArena: true, bossFights: true };

const EMPTY_APP_DATA: AppData = {
  assignments: [], classConfigs: [], xpEvents: [], quests: [],
  enabledFeatures: DEFAULT_FEATURES,
  loading: true,
};

const AppDataContext = createContext<AppData | null>(null);

export const useAppData = (): AppData => {
  const ctx = useContext(AppDataContext);
  return ctx ?? EMPTY_APP_DATA;
};

export const AppDataProvider: React.FC<{ user: User; children: React.ReactNode }> = ({ user, children }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classConfigs, setClassConfigs] = useState<ClassConfig[]>([]);
  const [xpEvents, setXpEvents] = useState<XPEvent[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user.isWhitelisted && user.role !== UserRole.ADMIN) return;
    const unsubs: (() => void)[] = [];

    try { unsubs.push(dataService.subscribeToAssignments((a) => { setAssignments(a); setLoading(false); })); }
    catch (e) { reportError(e, { subscription: 'assignments' }); setLoading(false); }

    try { unsubs.push(dataService.subscribeToClassConfigs(setClassConfigs)); }
    catch (e) { reportError(e, { subscription: 'classConfigs' }); }

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
    if (user.role === 'STUDENT' && user.classType) {
      const config = classConfigs.find(c => c.className === user.classType);
      if (config) return config.features;
    }
    return DEFAULT_FEATURES;
  }, [user.role, user.classType, classConfigs]);

  const value = useMemo(() => ({ assignments, classConfigs, xpEvents, quests, enabledFeatures, loading }), [assignments, classConfigs, xpEvents, quests, enabledFeatures, loading]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

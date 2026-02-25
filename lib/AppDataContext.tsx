import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Assignment, ClassConfig, User, UserRole } from '../types';
import { dataService } from '../services/dataService';

interface AppData {
  assignments: Assignment[];
  classConfigs: ClassConfig[];
  enabledFeatures: { physicsLab: boolean; evidenceLocker: boolean; leaderboard: boolean; physicsTools: boolean; communications: boolean };
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

  useEffect(() => {
    if (!user.isWhitelisted && user.role !== UserRole.ADMIN) return;
    const unsubs = [
      dataService.subscribeToAssignments(setAssignments),
      dataService.subscribeToClassConfigs(setClassConfigs),
    ];
    return () => unsubs.forEach(u => u());
  }, [user.id, user.isWhitelisted, user.role]);

  const enabledFeatures = useMemo(() => {
    const defaults = { physicsLab: true, evidenceLocker: true, leaderboard: true, physicsTools: true, communications: true };
    if (user.role === 'STUDENT' && user.classType) {
      const config = classConfigs.find(c => c.className === user.classType);
      if (config) return config.features;
    }
    return defaults;
  }, [user.role, user.classType, classConfigs]);

  const value = useMemo(() => ({ assignments, classConfigs, enabledFeatures }), [assignments, classConfigs, enabledFeatures]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

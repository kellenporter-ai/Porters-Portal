import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Assignment, ClassConfig, User, UserRole, XPEvent, Quest } from '../types';
import { dataService } from '../services/dataService';
import { reportError } from './errorReporting';

// ─── Types ───

export type EnabledFeatures = { evidenceLocker: boolean; leaderboard: boolean; physicsTools: boolean; communications: boolean; dungeons: boolean; pvpArena: boolean; bossFights: boolean };

interface AssignmentData {
  assignments: Assignment[];
  loading: boolean;
}

interface GameData {
  xpEvents: XPEvent[];
  quests: Quest[];
}

interface ClassConfigData {
  classConfigs: ClassConfig[];
  enabledFeatures: EnabledFeatures;
}

interface AppData extends AssignmentData, GameData, ClassConfigData {}

// ─── Defaults ───

const DEFAULT_FEATURES: EnabledFeatures = { evidenceLocker: true, leaderboard: true, physicsTools: true, communications: true, dungeons: true, pvpArena: true, bossFights: true };

const EMPTY_ASSIGNMENT_DATA: AssignmentData = { assignments: [], loading: true };
const EMPTY_GAME_DATA: GameData = { xpEvents: [], quests: [] };
const EMPTY_CLASS_CONFIG_DATA: ClassConfigData = { classConfigs: [], enabledFeatures: DEFAULT_FEATURES };

// ─── Contexts ───

const AssignmentContext = createContext<AssignmentData | null>(null);
const GameContext = createContext<GameData | null>(null);
const ClassConfigContext = createContext<ClassConfigData | null>(null);

// ─── Hooks ───

export const useAssignments = (): AssignmentData => {
  const ctx = useContext(AssignmentContext);
  return ctx ?? EMPTY_ASSIGNMENT_DATA;
};

export const useGameData = (): GameData => {
  const ctx = useContext(GameContext);
  return ctx ?? EMPTY_GAME_DATA;
};

export const useClassConfig = (): ClassConfigData => {
  const ctx = useContext(ClassConfigContext);
  return ctx ?? EMPTY_CLASS_CONFIG_DATA;
};

/** Composite hook — returns all slices. Prefer specific hooks when possible. */
export const useAppData = (): AppData => {
  const assignments = useAssignments();
  const game = useGameData();
  const config = useClassConfig();
  return { ...assignments, ...game, ...config };
};

// ─── Provider ───

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

  const assignmentValue = useMemo(() => ({ assignments, loading }), [assignments, loading]);
  const gameValue = useMemo(() => ({ xpEvents, quests }), [xpEvents, quests]);
  const configValue = useMemo(() => ({ classConfigs, enabledFeatures }), [classConfigs, enabledFeatures]);

  return (
    <AssignmentContext.Provider value={assignmentValue}>
      <GameContext.Provider value={gameValue}>
        <ClassConfigContext.Provider value={configValue}>
          {children}
        </ClassConfigContext.Provider>
      </GameContext.Provider>
    </AssignmentContext.Provider>
  );
};

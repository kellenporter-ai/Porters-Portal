import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { User, Submission, WhitelistedUser } from '../types';
import { dataService } from '../services/dataService';
import { reportError } from './errorReporting';

interface AdminData {
  rawUsers: User[];
  users: User[];
  submissions: Submission[];
  whitelistedEmails: WhitelistedUser[];
  availableSections: string[];
}

const AdminDataContext = createContext<AdminData | null>(null);

const EMPTY_ADMIN_DATA: AdminData = {
  rawUsers: [], users: [], submissions: [], whitelistedEmails: [], availableSections: [],
};

export const useAdminData = (): AdminData => {
  const ctx = useContext(AdminDataContext);
  return ctx ?? EMPTY_ADMIN_DATA;
};

export const AdminDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rawUsers, setRawUsers] = useState<User[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [whitelistedEmails, setWhitelistedEmails] = useState<WhitelistedUser[]>([]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    try { unsubs.push(dataService.subscribeToSubmissions(setSubmissions)); }
    catch (e) { reportError(e, { subscription: 'submissions' }); }

    try { unsubs.push(dataService.subscribeToUsers(setRawUsers)); }
    catch (e) { reportError(e, { subscription: 'users' }); }

    try { unsubs.push(dataService.subscribeToWhitelist(setWhitelistedEmails)); }
    catch (e) { reportError(e, { subscription: 'whitelist' }); }
    return () => unsubs.forEach(u => u());
  }, []);

  // Enrich users with submission stats
  const users = useMemo(() => {
    const subsByUser = new Map<string, Submission[]>();
    submissions.forEach(s => {
      const arr = subsByUser.get(s.userId) || [];
      arr.push(s);
      subsByUser.set(s.userId, arr);
    });

    return rawUsers.map(u => {
      const userSubs = subsByUser.get(u.id) || [];
      const resourcesAccessed = userSubs.length;
      const totalTimeMin = Math.round(userSubs.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0) / 60);

      return {
        ...u,
        stats: {
          problemsCompleted: resourcesAccessed,
          avgScore: 0,
          rawAccuracy: 0,
          totalTime: totalTimeMin
        }
      };
    });
  }, [rawUsers, submissions]);

  const availableSections = useMemo(() => {
    const sections = new Set<string>();
    rawUsers.forEach(u => { if (u.section) sections.add(u.section); });
    return Array.from(sections).sort();
  }, [rawUsers]);

  const value = useMemo(() => ({
    rawUsers,
    users,
    submissions,
    whitelistedEmails,
    availableSections,
  }), [rawUsers, users, submissions, whitelistedEmails, availableSections]);

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
};

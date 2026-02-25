import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User, UserRole } from '../types';
import { dataService } from '../services/dataService';

interface ChatState {
  unreadChannels: Set<string>;
  markChannelRead: (channelId: string) => void;
  isCommOpen: boolean;
  setIsCommOpen: (open: boolean) => void;
}

const ChatContext = createContext<ChatState | null>(null);

export const useChat = (): ChatState => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
};

export const ChatProvider: React.FC<{ user: User; children: React.ReactNode }> = ({ user, children }) => {
  const [unreadChannels, setUnreadChannels] = useState<Set<string>>(new Set());
  const [isCommOpen, setIsCommOpen] = useState(false);
  const channelLastSeenRef = useRef<Record<string, number>>(
    JSON.parse(localStorage.getItem('chatChannelLastSeen') || '{}')
  );
  const myGroupIdsRef = useRef<Set<string>>(new Set());

  // Track group memberships for unread filtering
  useEffect(() => {
    if (!user.id || user.role === UserRole.ADMIN) return;
    const unsub = dataService.subscribeToMyGroups(user.id, (groups) => {
      myGroupIdsRef.current = new Set(groups.map(g => g.id));
    });
    return () => unsub();
  }, [user.id, user.role]);

  const markChannelRead = useCallback((channelId: string) => {
    const now = Date.now();
    channelLastSeenRef.current[channelId] = now;
    localStorage.setItem('chatChannelLastSeen', JSON.stringify(channelLastSeenRef.current));
    setUnreadChannels(prev => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
  }, []);

  // Subscribe to recent messages for per-channel unread detection
  useEffect(() => {
    const unsub = dataService.subscribeToRecentMessages((msgs) => {
      const newUnread = new Set<string>();
      const lastSeen = channelLastSeenRef.current;

      const enrolledChannels = new Set(
        (user.enrolledClasses || []).map(c => `class_${c.replace(/\s+/g, '_').toLowerCase()}`)
      );

      for (const msg of msgs) {
        if (!msg.channelId || msg.senderId === user.id) continue;

        if (user.role !== UserRole.ADMIN) {
          if (msg.channelId.startsWith('group_')) {
            const groupId = msg.channelId.slice('group_'.length);
            if (!myGroupIdsRef.current.has(groupId)) continue;
          } else if (msg.channelId.startsWith('class_')) {
            if (!enrolledChannels.has(msg.channelId)) continue;
          }
        }

        const msgTime = new Date(msg.timestamp).getTime();
        const channelSeen = lastSeen[msg.channelId] || 0;
        if (msgTime > channelSeen) {
          newUnread.add(msg.channelId);
        }
      }
      setUnreadChannels(newUnread);
    });
    return () => unsub();
  }, [user.id, user.role, user.enrolledClasses]);

  const value = useMemo(() => ({
    unreadChannels,
    markChannelRead,
    isCommOpen,
    setIsCommOpen,
  }), [unreadChannels, markChannelRead, isCommOpen]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

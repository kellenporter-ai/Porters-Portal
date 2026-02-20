
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Notification, UserSettings } from '../types';
import { Bell, CheckCheck, Zap, Crosshair, Megaphone, Package, ArrowUp, Radio, BellRing } from 'lucide-react';
import { dataService } from '../services/dataService';
import { sfx } from '../lib/sfx';
import { isPushSupported, getPushPermission, requestPushPermission } from '../lib/usePushNotifications';

interface NotificationBellProps {
  userId: string;
  settings?: UserSettings;
  onUpdateSettings?: (settings: UserSettings) => Promise<void>;
  dropUp?: boolean;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'QUEST_APPROVED': <Crosshair className="w-4 h-4 text-green-400" />,
  'QUEST_REJECTED': <Crosshair className="w-4 h-4 text-red-400" />,
  'LOOT_DROP': <Package className="w-4 h-4 text-yellow-400" />,
  'NEW_MISSION': <Crosshair className="w-4 h-4 text-blue-400" />,
  'NEW_RESOURCE': <Radio className="w-4 h-4 text-purple-400" />,
  'LEVEL_UP': <ArrowUp className="w-4 h-4 text-amber-400" />,
  'ANNOUNCEMENT': <Megaphone className="w-4 h-4 text-orange-400" />,
  'XP_EVENT': <Zap className="w-4 h-4 text-cyan-400" />,
};

const NotificationBell: React.FC<NotificationBellProps> = ({ userId, settings, onUpdateSettings, dropUp }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const prevUnreadRef = useRef(0);

  // Calculate panel position from button rect
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const panelWidth = 320; // w-80 = 20rem = 320px
    if (dropUp) {
      // Desktop sidebar: open upward, align left edge so it doesn't overflow off-screen
      const left = Math.max(8, rect.left);
      // If it would overflow right edge, align to right instead
      const adjustedLeft = left + panelWidth > window.innerWidth - 8 ? undefined : left;
      const right = adjustedLeft == null ? 8 : undefined;
      setPanelPos({ bottom: window.innerHeight - rect.top + 8, left: adjustedLeft, right });
    } else {
      // Mobile header: open downward, align right edge to button
      setPanelPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
  }, [dropUp]);

  // Show the push prompt once when the panel opens if user hasn't decided yet
  useEffect(() => {
    if (isOpen && isPushSupported() && getPushPermission() === 'default' && settings?.pushNotifications === undefined) {
      setShowPushPrompt(true);
    }
  }, [isOpen, settings?.pushNotifications]);

  useEffect(() => {
    const unsub = dataService.subscribeToNotifications(userId, (notifs) => {
      const newUnread = notifs.filter(n => !n.isRead).length;
      if (newUnread > prevUnreadRef.current && prevUnreadRef.current >= 0) {
        sfx.notification();
      }
      prevUnreadRef.current = newUnread;
      setNotifications(notifs);
    });
    return () => unsub();
  }, [userId]);

  // Click outside to close — check both button and portal panel
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Recalculate position on scroll/resize while open
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAllRead = async () => {
    await dataService.markAllNotificationsRead(userId);
  };

  const handleClickNotification = async (n: Notification) => {
    if (!n.isRead) {
      await dataService.markNotificationRead(n.id);
    }
  };

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const handleToggle = () => {
    if (!isOpen) updatePosition();
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className={`fixed w-80 max-h-[420px] bg-[#1a1b26]/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in duration-200 ${
            dropUp ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2'
          }`}
          style={{
            ...(panelPos.top != null ? { top: panelPos.top } : {}),
            ...(panelPos.bottom != null ? { bottom: panelPos.bottom } : {}),
            ...(panelPos.left != null ? { left: panelPos.left } : {}),
            ...(panelPos.right != null ? { right: panelPos.right } : {}),
          }}
        >
          <div className="flex items-center justify-between p-3 border-b border-white/5">
            <h4 className="text-sm font-bold text-white">Notifications</h4>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 font-bold uppercase tracking-widest transition"
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          {/* Push notification opt-in prompt */}
          {showPushPrompt && (
            <div className="p-3 bg-purple-500/10 border-b border-purple-500/20">
              <div className="flex items-start gap-2">
                <BellRing className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-300 leading-tight">Get desktop alerts for quests, loot, and announcements?</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={async () => {
                        const perm = await requestPushPermission();
                        if (perm === 'granted' && onUpdateSettings && settings) {
                          await onUpdateSettings({ ...settings, pushNotifications: true });
                        }
                        setShowPushPrompt(false);
                      }}
                      className="px-2 py-1 bg-purple-600 text-white text-[10px] font-bold rounded-lg hover:bg-purple-500 transition"
                    >
                      Enable
                    </button>
                    <button
                      onClick={() => setShowPushPrompt(false)}
                      className="px-2 py-1 bg-white/5 text-gray-400 text-[10px] font-bold rounded-lg hover:bg-white/10 transition"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-y-auto max-h-[360px] custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 30).map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`flex gap-3 p-3 border-b border-white/5 cursor-pointer transition ${
                    n.isRead ? 'opacity-50 hover:opacity-70' : 'bg-purple-500/5 hover:bg-white/5'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {ICON_MAP[n.type] || <Bell className="w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{n.title}</p>
                    <p className="text-[11px] text-gray-400 leading-tight mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[9px] text-gray-600 mt-1">{formatTime(n.timestamp)}</p>
                  </div>
                  {!n.isRead && (
                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default NotificationBell;

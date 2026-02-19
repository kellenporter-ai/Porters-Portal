
import { useEffect, useRef, useCallback } from 'react';
import { Notification as AppNotification } from '../types';
import { dataService } from '../services/dataService';

/**
 * Browser Push Notification hook.
 *
 * Uses the Web Notifications API to show native desktop/mobile
 * notifications when:
 *   1. The user has granted permission
 *   2. The document is hidden (tab backgrounded)
 *   3. New unread in-app notifications arrive via Firestore
 *
 * This piggybacks on the existing real-time Firestore subscription —
 * no FCM service worker required.
 */

const NOTIFICATION_ICON = '/favicon.svg';

/** Check if the browser supports the Notifications API */
export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Current permission state */
export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/** Request permission — returns the new state */
export async function requestPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

/** Fire a browser notification */
function showBrowserNotification(title: string, body: string, tag?: string) {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon: NOTIFICATION_ICON,
      tag: tag || `pp-${Date.now()}`, // Deduplicate by tag
      silent: false,
    });
    // Auto-close after 6 seconds
    setTimeout(() => n.close(), 6000);
    // Focus the tab when clicked
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some browsers block Notification constructor in certain contexts
  }
}

/**
 * Hook: subscribe to user notifications and fire browser push for new ones.
 * Must be called once at the app level (e.g. in App.tsx or a layout wrapper).
 */
export function usePushNotifications(userId: string | null, enabled: boolean) {
  const prevIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  const handleNotifications = useCallback((notifications: AppNotification[]) => {
    // On the very first load, just seed the "seen" set — don't fire for existing ones
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      prevIdsRef.current = new Set(notifications.map(n => n.id));
      return;
    }

    if (!enabled || Notification.permission !== 'granted') return;

    // Only fire when tab is backgrounded
    if (!document.hidden) {
      // Still track IDs so we don't fire stale ones later
      prevIdsRef.current = new Set(notifications.map(n => n.id));
      return;
    }

    // Find new unread notifications we haven't seen yet
    const newNotifs = notifications.filter(
      n => !n.isRead && !prevIdsRef.current.has(n.id)
    );

    for (const notif of newNotifs.slice(0, 3)) { // Cap at 3 simultaneous
      showBrowserNotification(notif.title, notif.message, `pp-${notif.id}`);
    }

    prevIdsRef.current = new Set(notifications.map(n => n.id));
  }, [enabled]);

  useEffect(() => {
    if (!userId || !enabled || !isPushSupported()) return;

    // Reset on user change
    initialLoadRef.current = true;
    prevIdsRef.current = new Set();

    const unsub = dataService.subscribeToNotifications(userId, handleNotifications);
    return () => unsub();
  }, [userId, enabled, handleNotifications]);
}

import { useState, useEffect, useRef, useCallback } from 'react';

interface VersionInfo {
  commitHash: string;
  buildTime: string;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_DELAY_MS = 30 * 1000;      // 30 seconds after mount

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentVersionRef = useRef<VersionInfo | null>(null);
  const dismissedRef = useRef(false);

  const fetchVersion = useCallback(async (): Promise<VersionInfo | null> => {
    try {
      const res = await fetch(`/version.json?nocache=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const remote = await fetchVersion();
      if (!remote || cancelled) return;

      if (!currentVersionRef.current) {
        // First check — store baseline
        currentVersionRef.current = remote;
        return;
      }

      const current = currentVersionRef.current;
      if (
        remote.commitHash !== current.commitHash ||
        remote.buildTime !== current.buildTime
      ) {
        if (!dismissedRef.current) {
          setUpdateAvailable(true);
        }
      }
    };

    // Initial check after a short delay (let the app settle)
    const initialTimer = setTimeout(check, INITIAL_DELAY_MS);

    // Periodic polling
    const interval = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchVersion]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setUpdateAvailable(false);
  }, []);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, dismiss, reload };
}

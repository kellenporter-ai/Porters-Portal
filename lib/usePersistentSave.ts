import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import {
  WriteStatus,
  draftKey,
  readDraft,
  writeDraft,
  clearDraft,
  persistentWrite,
  syncDirtyDraft,
} from './persistentWrite';

const DEBOUNCE_MS = 1500;

interface UsePersistentSaveOptions {
  userId: string | undefined;
  assignmentId: string | undefined;
  collection?: string; // defaults to 'lesson_block_responses'
  /** Called whenever the internal response map changes (for parent state sync). */
  onResponsesChange?: (responses: Record<string, unknown>) => void;
  /** When true, skip all Firestore writes and localStorage drafts (admin preview mode). */
  disabled?: boolean;
}

interface UsePersistentSaveReturn {
  /** Current save status for UI display. */
  saveStatus: WriteStatus;
  /** Timestamp of the last successful save. */
  lastSavedAt: string | null;
  /** Update a single block/field response. Triggers debounced save. */
  updateResponse: (blockId: string, response: unknown) => void;
  /** Force an immediate save (e.g. before submit). Awaitable. */
  flushNow: () => Promise<WriteStatus> | undefined;
  /** Get current responses snapshot. */
  getResponses: () => Record<string, unknown>;
  /** Clear all responses (Firestore + localStorage + local state). */
  clearAll: () => void;
  /** Whether we're online. */
  isOnline: boolean;
  /** Timestamp (ms) when error state began, or null if not in error. */
  errorSince: number | null;
  /** Load initial responses (call once after fetching from Firestore on mount). */
  setInitialResponses: (responses: Record<string, unknown>, serverTimestamp?: string) => void;
}

export function usePersistentSave({
  userId,
  assignmentId,
  collection = 'lesson_block_responses',
  onResponsesChange,
  disabled,
}: UsePersistentSaveOptions): UsePersistentSaveReturn {
  const isOnline = useOnlineStatus();
  const [saveStatus, setSaveStatus] = useState<WriteStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [errorSince, setErrorSince] = useState<number | null>(null);

  const responsesRef = useRef<Record<string, unknown>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const saveGenRef = useRef(0); // Generation counter to discard stale retry callbacks
  const draftRestoredTimestampRef = useRef<string | null>(null); // Set when dirty draft restored on mount
  const errorSinceRef = useRef<number | null>(null); // Ref to avoid stale closure in setStatus
  const isInErrorRef = useRef(false);

  const docId = userId && assignmentId ? `${userId}_${assignmentId}_blocks` : null;
  const lsKey = userId && assignmentId ? draftKey('draft', userId, assignmentId) : null;

  // Safe status setter that respects unmount and tracks error onset
  const setStatus = useCallback((s: WriteStatus) => {
    if (!mountedRef.current) return;
    setSaveStatus(s);
    if (s === 'error' && !errorSinceRef.current) {
      const now = Date.now();
      errorSinceRef.current = now;
      setErrorSince(now);
    } else if (s === 'saved' || s === 'idle') {
      errorSinceRef.current = null;
      setErrorSince(null);
    }
  }, []);

  // Core save function — uses generation counter to ignore stale retry callbacks
  const doSave = useCallback((): Promise<WriteStatus> | undefined => {
    if (disabled || !docId || !userId || !assignmentId) return undefined;

    const gen = ++saveGenRef.current;
    const data = {
      userId,
      assignmentId,
      responses: responsesRef.current,
      lastUpdated: new Date().toISOString(),
    };

    return persistentWrite(collection, docId, data, lsKey, (status) => {
      // Only update UI status if this is still the latest save
      if (gen !== saveGenRef.current) return;
      setStatus(status);
      if (status === 'saved') {
        setLastSavedAt(new Date().toISOString());
      }
    });
  }, [disabled, docId, userId, assignmentId, collection, lsKey, setStatus]);

  // Debounced save trigger
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      doSave();
    }, DEBOUNCE_MS);
  }, [doSave]);

  // Public: update a response and schedule save
  const updateResponse = useCallback((blockId: string, response: unknown) => {
    responsesRef.current = { ...responsesRef.current, [blockId]: response };
    onResponsesChange?.(responsesRef.current);
    if (disabled) return; // Preview mode — update local state only, skip persistence
    // Immediate synchronous localStorage write — closes the debounce gap
    // where data only exists in JS memory
    if (lsKey && userId && assignmentId) {
      writeDraft(lsKey, {
        userId,
        assignmentId,
        responses: responsesRef.current,
        lastUpdated: new Date().toISOString(),
      }, true);
    }
    scheduleSave();
  }, [disabled, scheduleSave, onResponsesChange, lsKey, userId, assignmentId]);

  // Public: immediate flush (awaitable)
  const flushNow = useCallback((): Promise<WriteStatus> | undefined => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return doSave();
  }, [doSave]);

  // Public: get snapshot
  const getResponses = useCallback(() => responsesRef.current, []);

  // Public: clear everything
  const clearAll = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    responsesRef.current = {};
    onResponsesChange?.({});
    if (lsKey) clearDraft(lsKey);
  }, [lsKey, onResponsesChange]);

  // Public: set initial responses (after Firestore load)
  // If a dirty draft was restored on mount, only accept server data if it's newer
  const setInitialResponses = useCallback((responses: Record<string, unknown>, serverTimestamp?: string) => {
    const draftTs = draftRestoredTimestampRef.current;
    if (draftTs) {
      draftRestoredTimestampRef.current = null;
      if (serverTimestamp && serverTimestamp > draftTs) {
        // Server is newer — accept it
        responsesRef.current = responses;
        onResponsesChange?.(responses);
      } else {
        // Local draft is newer — reject stale server data, push local to Firestore
        onResponsesChange?.(responsesRef.current);
        scheduleSave();
      }
      return;
    }
    responsesRef.current = responses;
    onResponsesChange?.(responses);
  }, [onResponsesChange, scheduleSave]);

  // Listen for localStorage quota exhaustion events from persistentWrite
  useEffect(() => {
    const handleStorageFull = () => {
      setStatus('error');
    };
    window.addEventListener('portal-storage-full', handleStorageFull);
    return () => window.removeEventListener('portal-storage-full', handleStorageFull);
  }, [setStatus]);

  // Mount recovery: check for dirty localStorage drafts
  useEffect(() => {
    if (disabled || !lsKey || !docId) return;
    const draft = readDraft(lsKey);
    if (draft?.dirty) {
      // Restore dirty data into local state
      const draftData = draft.data as Record<string, unknown>;
      if (draftData?.responses) {
        responsesRef.current = draftData.responses as Record<string, unknown>;
        draftRestoredTimestampRef.current = draft.timestamp;
        onResponsesChange?.(responsesRef.current);
      }
      // Try to sync to Firestore
      syncDirtyDraft(lsKey, collection, docId, setStatus);
    }
  }, [disabled, lsKey, docId, collection, setStatus, onResponsesChange]);

  // Online recovery: sync dirty drafts when coming back online
  useEffect(() => {
    if (disabled || !isOnline || !lsKey || !docId) return;
    syncDirtyDraft(lsKey, collection, docId, setStatus);
  }, [disabled, isOnline, lsKey, docId, collection, setStatus]);

  // Background retry: periodically attempt re-sync when in error state
  // Uses a ref to avoid the interval being killed by intermediate status transitions (e.g., 'retrying')
  useEffect(() => {
    isInErrorRef.current = saveStatus === 'error';
  }, [saveStatus]);

  useEffect(() => {
    if (disabled || !lsKey || !docId) return;

    // Start interval — it self-checks isInErrorRef each tick
    const interval = setInterval(() => {
      if (!isInErrorRef.current) return;
      syncDirtyDraft(lsKey, collection, docId, (status) => {
        if (mountedRef.current) {
          setStatus(status);
          if (status === 'saved') setLastSavedAt(new Date().toISOString());
        }
      });
    }, 30_000);

    return () => clearInterval(interval);
  }, [disabled, lsKey, docId, collection, setStatus]);

  // Flush on visibilitychange (synchronous localStorage + async Firestore)
  useEffect(() => {
    if (disabled) return; // Preview mode — no persistence needed
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && userId && assignmentId) {
        // Cancel pending debounce
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        // Synchronous localStorage write (survives tab close)
        if (lsKey && Object.keys(responsesRef.current).length > 0) {
          writeDraft(lsKey, {
            userId,
            assignmentId,
            responses: responsesRef.current,
            lastUpdated: new Date().toISOString(),
          }, true);
        }
        // Best-effort async Firestore write
        doSave();
      }
    };

    const handleBeforeUnload = () => {
      // Synchronous localStorage write — beforeunload can't await
      if (lsKey && userId && assignmentId && Object.keys(responsesRef.current).length > 0) {
        writeDraft(lsKey, {
          userId,
          assignmentId,
          responses: responsesRef.current,
          lastUpdated: new Date().toISOString(),
        }, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [disabled, userId, assignmentId, lsKey, doSave]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Synchronous localStorage on unmount
      if (lsKey && userId && assignmentId && Object.keys(responsesRef.current).length > 0) {
        writeDraft(lsKey, {
          userId,
          assignmentId,
          responses: responsesRef.current,
          lastUpdated: new Date().toISOString(),
        }, true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    saveStatus,
    lastSavedAt,
    updateResponse,
    flushNow,
    getResponses,
    clearAll,
    isOnline,
    errorSince,
    setInitialResponses,
  };
}

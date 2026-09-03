import { useCallback, useEffect, useRef, useState } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { useOnlineStatus } from './useOnlineStatus';
import {
  WriteStatus,
  draftKey,
  readDraft,
  writeDraft,
  clearDraft,
  persistentWrite,
  syncDirtyDraft,
  isResponseTombstone,
} from './persistentWrite';
import { decideRestoredResponses } from './restoreReconciliation';

const DEBOUNCE_MS = 1500;

interface UsePersistentSaveOptions {
  userId: string | undefined;
  assignmentId: string | undefined;
  collection?: string; // defaults to 'lesson_block_responses'
  /** Assessment or resource session token — required by Firestore security rules. */
  sessionToken?: string | null;
  /** Called whenever the internal response map changes (for parent state sync). */
  onResponsesChange?: (responses: Record<string, unknown>) => void;
  /** When true, skip all Firestore writes and localStorage drafts (admin preview mode). */
  disabled?: boolean;
  /** When true and sessionToken is missing, fail fast with a clear error instead of silent retries. */
  isAssessment?: boolean;
}

interface UsePersistentSaveReturn {
  /** Current save status for UI display. */
  saveStatus: WriteStatus;
  /** Timestamp of the last successful save. */
  lastSavedAt: string | null;
  /** Update a single block/field response. Triggers debounced save. */
  updateResponse: (blockId: string, response: unknown) => void;
  /**
   * R10: Remove a single block/field response. The key is tombstoned so the
   * next Firestore write deletes it server-side (dot-notation merge alone
   * would leave it lingering forever). Triggers a debounced save.
   */
  removeResponse: (blockId: string) => void;
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
  /** True when the assessment session token is missing or invalid. */
  sessionInvalid: boolean;
  /** Load initial responses (call once after fetching from Firestore on mount). */
  setInitialResponses: (responses: Record<string, unknown>, serverTimestamp?: string) => void;
  /** R3: Re-fetch the server draft and reconcile, for reconnect recovery. */
  refetchServerDraft: () => void;
}

export function usePersistentSave({
  userId,
  assignmentId,
  collection = 'lesson_block_responses',
  sessionToken,
  onResponsesChange,
  disabled,
  isAssessment,
}: UsePersistentSaveOptions): UsePersistentSaveReturn {
  const isOnline = useOnlineStatus();
  const [saveStatus, setSaveStatus] = useState<WriteStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [errorSince, setErrorSince] = useState<number | null>(null);
  const [sessionInvalid, setSessionInvalid] = useState(false);

  const responsesRef = useRef<Record<string, unknown>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const saveGenRef = useRef(0); // Generation counter to discard stale retry callbacks
  const draftRestoredTimestampRef = useRef<string | null>(null); // Set when dirty draft restored on mount
  const errorSinceRef = useRef<number | null>(null); // Ref to avoid stale closure in setStatus
  const isInErrorRef = useRef(false);
  const sessionTokenRef = useRef(sessionToken);
  sessionTokenRef.current = sessionToken; // Always up-to-date, even for stale timers

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

    const token = sessionTokenRef.current;

    // CRITICAL FIX: For assessments, a missing session token means Firestore rules
    // will reject every write with permission-denied. Fail fast with a clear error
    // instead of burning through 3 retries and confusing the student.
    if (isAssessment && !token) {
      console.warn('[usePersistentSave] Assessment save blocked — no session token');
      setStatus('error');
      setSessionInvalid(true);
      window.dispatchEvent(new CustomEvent('portal-assessment-session-invalid'));
      return Promise.resolve('error');
    }

    setSessionInvalid(false);
    const gen = ++saveGenRef.current;
    const data: Record<string, unknown> = {
      userId,
      assignmentId,
      responses: responsesRef.current,
      lastUpdated: new Date().toISOString(),
    };
    if (token) data.sessionToken = token;

    console.log('[usePersistentSave] doSave', { docId, hasToken: !!token, tokenPrefix: token ? token.slice(0, 8) : null, dataKeys: Object.keys(data), responsesCount: Object.keys(data.responses as Record<string, unknown> || {}).length });

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
      const draftData: Record<string, unknown> = {
        userId,
        assignmentId,
        responses: responsesRef.current,
        lastUpdated: new Date().toISOString(),
      };
      const token = sessionTokenRef.current;
      if (token) draftData.sessionToken = token;
      writeDraft(lsKey, draftData, true);
    }
    scheduleSave();
  }, [disabled, scheduleSave, onResponsesChange, lsKey, userId, assignmentId]);

  // Public: remove a response — tombstones the key so the next Firestore
  // write deletes it via FieldValue.delete() instead of leaving it behind.
  const removeResponse = useCallback((blockId: string) => {
    responsesRef.current = { ...responsesRef.current, [blockId]: { __delete__: true, blockId } };
    onResponsesChange?.(responsesRef.current);
    if (disabled) return;
    // Synchronous dirty draft mirrors the tombstone (stripped on the next
    // successful save — persistentWrite strips tombstones from the clean draft).
    if (lsKey && userId && assignmentId) {
      const draftData: Record<string, unknown> = {
        userId,
        assignmentId,
        responses: responsesRef.current,
        lastUpdated: new Date().toISOString(),
      };
      const token = sessionTokenRef.current;
      if (token) draftData.sessionToken = token;
      writeDraft(lsKey, draftData, true);
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

  // Public: clear everything. R10: keys are tombstoned (not just dropped) so
  // the next Firestore write deletes them server-side — dot-notation merge
  // alone would leave cleared responses lingering in the doc forever. The
  // caller typically deletes the whole doc too; tombstones are the
  // defense-in-depth path for retries/queues that re-persist afterwards.
  const clearAll = useCallback(() => {
    if (saveTimerRef.current) {
      // Flush any in-flight save BEFORE clearing so its payload can't
      // resurrect the keys after the tombstone write lands.
      void flushNow();
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const tombstoned: Record<string, unknown> = {};
    for (const key of Object.keys(responsesRef.current)) {
      tombstoned[key] = { __delete__: true, blockId: key };
    }
    responsesRef.current = tombstoned;
    onResponsesChange?.(tombstoned);
    if (lsKey) clearDraft(lsKey);
  }, [lsKey, onResponsesChange, flushNow]);

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

  // R3: Re-fetch the server draft and reconcile it into local state. Used for
  // reconnect recovery: with the memory local cache an offline getDoc fails
  // instantly, leaving blocks empty; coming back online must re-read the
  // server doc. Never clobbers in-progress edits — the caller gates via
  // shouldRefetchOnReconnect (empty/clean local state only).
  const refetchServerDraft = useCallback(() => {
    if (disabled || !docId) return;
    void getDoc(doc(db, collection, docId)).then(snap => {
      if (!mountedRef.current) return;
      // Strip any pending tombstones — the server has no such keys.
      const serverResponses = snap.exists() ? (snap.data().responses || {}) : {};
      const hookResponses: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(responsesRef.current)) {
        if (!isResponseTombstone(v)) hookResponses[k] = v;
      }
      const serverTimestamp = snap.exists() ? snap.data().lastUpdated as string | undefined : undefined;
      const draft = readDraft(lsKey || '');
      const restored = decideRestoredResponses({
        serverResponses,
        serverTimestamp,
        hookResponses,
        draftRestoredTimestamp: draft?.dirty ? draft.timestamp : null,
      });
      if (restored !== responsesRef.current) {
        responsesRef.current = restored;
        onResponsesChange?.(restored);
      }
      if (snap.exists() && !draft?.dirty) {
        // Clean state re-hydrated from the server — mirror it locally.
        if (lsKey) writeDraft(lsKey, { ...snap.data(), responses: restored }, false);
      }
    }).catch(() => {
      // Offline / read failure — keep local state untouched.
    });
  }, [disabled, docId, collection, lsKey, onResponsesChange]);

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
    // R3: reconnect recovery — if local state is empty/clean, re-fetch the
    // server draft (offline getDoc failed instantly with the memory cache).
    if (Object.keys(responsesRef.current).length === 0 && !draftRestoredTimestampRef.current) {
      refetchServerDraft();
    }
  }, [disabled, isOnline, lsKey, docId, collection, setStatus, onResponsesChange, refetchServerDraft]);

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
    removeResponse,
    flushNow,
    getResponses,
    clearAll,
    isOnline,
    errorSince,
    sessionInvalid,
    setInitialResponses,
    refetchServerDraft,
  };
}

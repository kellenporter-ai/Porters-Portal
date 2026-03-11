import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { reportError } from './errorReporting';

export type WriteStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'error';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/** localStorage key for draft data. Scoped by prefix, userId, and assignmentId. */
export function draftKey(prefix: string, userId: string, assignmentId: string): string {
  return `${prefix}_${userId}_${assignmentId}`;
}

interface DraftEnvelope<T = unknown> {
  data: T;
  timestamp: string;
  dirty: boolean; // true = not yet confirmed in Firestore
}

/** Read a draft from localStorage (returns null if missing or unparseable). */
export function readDraft<T = unknown>(key: string): DraftEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as DraftEnvelope<T>;
  } catch {
    return null;
  }
}

/** Write a draft to localStorage (synchronous — safe for beforeunload). */
export function writeDraft<T = unknown>(key: string, data: T, dirty: boolean): void {
  try {
    const envelope: DraftEnvelope<T> = {
      data,
      timestamp: new Date().toISOString(),
      dirty,
    };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // localStorage full or unavailable — nothing we can do
  }
}

/** Remove a draft from localStorage. */
export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Write data to Firestore with exponential backoff retry and localStorage mirror.
 *
 * 1. Attempts setDoc with merge.
 * 2. On failure, retries up to MAX_RETRIES with exponential backoff.
 * 3. On each failure and final exhaustion, mirrors data to localStorage.
 * 4. Returns the final status.
 *
 * `onStatusChange` is called on every transition so callers can update UI.
 */
export async function persistentWrite(
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>,
  lsKey: string | null,
  onStatusChange?: (status: WriteStatus) => void,
): Promise<WriteStatus> {
  onStatusChange?.('saving');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await setDoc(doc(db, collectionPath, docId), data, { merge: true });
      // Success — mark localStorage clean
      if (lsKey) writeDraft(lsKey, data, false);
      onStatusChange?.('saved');
      return 'saved';
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        onStatusChange?.('retrying');
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      } else {
        // All retries exhausted — mirror to localStorage as dirty
        reportError(err, { method: 'persistentWrite', collectionPath, docId, attempt });
        if (lsKey) writeDraft(lsKey, data, true);
        onStatusChange?.('error');
        return 'error';
      }
    }
  }

  // Unreachable, but TypeScript needs it
  return 'error';
}

/**
 * Sync any dirty localStorage drafts back to Firestore.
 * Call on mount and on `online` events.
 * Returns true if a sync was performed.
 */
export async function syncDirtyDraft(
  lsKey: string,
  collectionPath: string,
  docId: string,
  onStatusChange?: (status: WriteStatus) => void,
): Promise<boolean> {
  const draft = readDraft(lsKey);
  if (!draft?.dirty) return false;

  // Compare timestamps — only sync if localStorage is newer
  try {
    const snap = await getDoc(doc(db, collectionPath, docId));
    if (snap.exists()) {
      const serverTs = snap.data().lastUpdated as string | undefined;
      if (serverTs && serverTs >= draft.timestamp) {
        // Server is newer or equal — discard dirty draft
        writeDraft(lsKey, draft.data, false);
        return false;
      }
    }
  } catch {
    // Can't read server — try writing anyway
  }

  return (await persistentWrite(
    collectionPath,
    docId,
    draft.data as Record<string, unknown>,
    lsKey,
    onStatusChange,
  )) === 'saved';
}

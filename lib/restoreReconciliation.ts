/**
 * Phase 1c (R2/R3) — testable seam for the block-responses restore decision.
 * Extracted from components/Proctor.tsx (~lines 440-590) so the restore /
 * re-fetch logic that previously lived inline in Proctor is unit-testable.
 *
 * R2: The non-assessment restore path used to set raw server responses (or
 * `{}` on a `getDoc` error) over the hook's reconciled draft responses,
 * clobbering dirty local drafts — blocks mount once via `useState` initializers
 * and never re-hydrate, so existing work rendered empty. The assessment path
 * was already correct (uses `setInitialResponses` + `getResponses()`). Both
 * paths now go through the same timestamp reconciliation.
 *
 * R3: On reconnect (offline → online) the server draft must be re-fetched when
 * local state is empty/clean (the Firestore read fails instantly offline with
 * the memory local cache, leaving the UI empty). A dirty local draft must NOT
 * be clobbered by the re-fetch — timestamp reconciliation decides.
 */

import { readDraft } from './persistentWrite';

export interface RestoreDecisionInput {
  /** Server responses from the Firestore read (`data.responses || {}`). */
  serverResponses: Record<string, unknown>;
  /** Server `lastUpdated` timestamp (ISO string), or undefined. */
  serverTimestamp?: string;
  /** The hook's reconciled current responses. */
  hookResponses: Record<string, unknown>;
  /**
   * Draft restored at mount (dirty envelope). When set, `draftTimestamp` is
   * the envelope timestamp and the local state IS the draft data — the hook
   * already timestamp-reconciled server vs draft via `setInitialResponses`.
   */
  draftRestoredTimestamp?: string | null;
}

/**
 * Decide what `savedBlockResponses` should become after a (re)store or
 * reconnect re-fetch. Never discards local work: a dirty draft always wins
 * over server data unless the server is demonstrably newer AND has data.
 */
export function decideRestoredResponses(input: RestoreDecisionInput): Record<string, unknown> {
  const { serverResponses, hookResponses, draftRestoredTimestamp } = input;

  // Dirty draft was restored at mount: the hook already reconciled server vs
  // draft (setInitialResponses), so hook state is authoritative.
  if (draftRestoredTimestamp) return hookResponses;

  // Clean (or empty) local state: trust the server snapshot — this is also the
  // R3 reconnect path, where the offline read failed and the server doc is
  // re-fetched to re-hydrate the blocks.
  return serverResponses;
}

/**
 * Whether the initial/mount server load "failed": the read errored, the doc
 * doesn't exist, or the hook still holds no responses at all. In these cases
 * the UI must NOT wipe to `{}` when a dirty draft exists — it must keep the
 * hook's (draft) responses.
 */
export function hasLoadedAnyResponses(
  hookResponses: Record<string, unknown>,
  serverHadData: boolean,
): boolean {
  return serverHadData || Object.keys(hookResponses).length > 0;
}

/** True when a reconnect re-fetch may proceed (R3). */
export function shouldRefetchOnReconnect(
  isOnlineNow: boolean,
  hookResponses: Record<string, unknown>,
  lsKey: string | null,
): boolean {
  if (!isOnlineNow || !lsKey) return false;
  const draft = readDraft(lsKey);
  // Never re-fetch over unsaved local changes (dirty draft = in-progress edits).
  if (draft?.dirty) return false;
  // Only re-fetch when local state is empty/clean — a reconnect can't add
  // anything when the blocks are already populated.
  return Object.keys(hookResponses).length === 0;
}

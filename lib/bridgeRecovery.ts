/**
 * Pure helpers for the Proctor ↔ portalBridge localStorage recovery channel.
 * Extracted verbatim from public/portalBridge.js (beforeunload/pagehide handlers)
 * and components/Proctor.tsx (portal-ready recovery consumer) so the key
 * computation and recovery-state extraction are unit-testable.
 *
 * PHASE 0 — behavior-preserving extraction. The recovery key is NOT
 * assignment-scoped; that is bug R1 and Phase 1 fixes it.
 */

/** R1 BUG: key is scoped by userId only — NOT by assignmentId. */
export function bridgeRecoveryKey(userId: string): string {
  return `portalBridge_${userId}_lastState`;
}

export interface BridgeRecoveryEnvelope {
  state: unknown;
  timestamp: string;
}

/** Build the envelope written by portalBridge.js on pagehide/beforeunload. */
export function buildBridgeRecoveryEnvelope(state: unknown): BridgeRecoveryEnvelope {
  return {
    state,
    timestamp: new Date().toISOString(),
  };
}

export interface PracticeProgressRecoveryData {
  userId: string;
  assignmentId: string;
  state: unknown;
  currentQuestion: number;
  lastUpdated: string;
}

/**
 * Extract the recovery payload Proctor.tsx writes to practice_progress when it
 * consumes a bridge recovery envelope. Mirrors Proctor.tsx portal-ready case.
 */
export function extractRecoveryData(
  userId: string,
  assignmentId: string,
  recovered: { state?: { state?: unknown; currentQuestion?: number } | unknown; timestamp?: string },
): PracticeProgressRecoveryData {
  const state = recovered.state as { state?: unknown; currentQuestion?: number } | undefined;
  return {
    userId,
    assignmentId,
    state: state?.state || recovered.state,
    currentQuestion: state?.currentQuestion ?? 0,
    lastUpdated: recovered.timestamp || new Date().toISOString(),
  };
}

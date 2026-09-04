/**
 * Shared WebGL Engine Budget
 *
 * Chromebooks (and browsers generally) cap WebGL contexts at 8-16 per page.
 * Each Avatar3D instance creates its own Babylon Engine (one WebGL context).
 * Mounting many instances — e.g. a leaderboard of N rows — can exhaust the
 * context limit and break rendering across the whole app.
 *
 * This module enforces a module-level budget: at most MAX_ENGINES Babylon
 * engines may be alive at once. Instances beyond the budget must fall back
 * to the lightweight 2D SVG OperativeAvatar (no WebGL context).
 *
 * Keep this module PURE — no DOM, no Babylon imports — so the budget logic
 * is unit-testable without WebGL (see lib/__tests__/engineBudget.test.ts).
 */

/** Max concurrent live Babylon engines. Browsers allow 8-16 WebGL contexts;
 * 4 leaves headroom for the rest of the app (maps, previews, etc.). */
export const MAX_ENGINES = 4;

/** Handle returned by acquireEngineSlot. Call dispose() when the engine is torn down. */
export interface EngineSlot {
    /** Release the slot back to the budget. Idempotent. */
    dispose: () => void;
}

let liveEngines = 0;

/**
 * Try to claim one engine slot.
 *
 * The returned slot MUST be disposed when the corresponding engine is
 * disposed — compact mode (small thumbnail canvases) counts against the
 * budget too, since compact mode still creates a full Engine today.
 *
 * @returns a slot on success, or null if the budget is exhausted
 */
export const acquireEngineSlot = (): EngineSlot | null => {
    if (liveEngines >= MAX_ENGINES) return null;
    liveEngines += 1;
    let disposed = false;
    return {
        dispose: () => {
            if (disposed) return;
            disposed = true;
            liveEngines = Math.max(0, liveEngines - 1);
        },
    };
};

/** Whether an engine slot is currently available (without claiming one). */
export const canAcquireEngine = (): boolean => liveEngines < MAX_ENGINES;

/** Current number of live engine slots. */
export const getLiveEngineCount = (): number => liveEngines;

/** Test-only: reset the module-level counter between cases. */
export const _resetEngineBudgetForTests = (): void => {
    liveEngines = 0;
};

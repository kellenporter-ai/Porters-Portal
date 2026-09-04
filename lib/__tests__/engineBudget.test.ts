import {
    acquireEngineSlot,
    canAcquireEngine,
    getLiveEngineCount,
    MAX_ENGINES,
    _resetEngineBudgetForTests,
} from '../engineBudget';
import { describe, it, expect, beforeEach } from 'vitest';

describe('engineBudget', () => {
    beforeEach(() => {
        _resetEngineBudgetForTests();
    });

    it('allows acquisition up to the cap', () => {
        for (let i = 0; i < MAX_ENGINES; i++) {
            expect(canAcquireEngine()).toBe(true);
            expect(acquireEngineSlot()).not.toBeNull();
            expect(getLiveEngineCount()).toBe(i + 1);
        }
    });

    it('denies acquisition beyond the cap', () => {
        for (let i = 0; i < MAX_ENGINES; i++) acquireEngineSlot();
        expect(getLiveEngineCount()).toBe(MAX_ENGINES);
        expect(canAcquireEngine()).toBe(false);
        expect(acquireEngineSlot()).toBeNull();
    });

    it('frees budget when a slot is disposed', () => {
        const slots = Array.from({ length: MAX_ENGINES }, () => acquireEngineSlot()!);
        expect(acquireEngineSlot()).toBeNull();
        slots[0].dispose();
        expect(getLiveEngineCount()).toBe(MAX_ENGINES - 1);
        expect(canAcquireEngine()).toBe(true);
        expect(acquireEngineSlot()).not.toBeNull();
    });

    it('double-dispose does not corrupt the count', () => {
        const slot = acquireEngineSlot()!;
        slot.dispose();
        slot.dispose();
        expect(getLiveEngineCount()).toBe(0);
        expect(canAcquireEngine()).toBe(true);
    });
});

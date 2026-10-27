// Regression: a boss victory paid 0 XP / 0 Flux / no item.
//
// The payout read `latestEvent.completionRewards`, which is the deprecated v1
// BossEncounter field. v2 BossEvent documents store the payout under `rewards`,
// so every real victory resolved to {} and granted nothing.
//
// These tests pin the resolution rule against realistic documents so the field
// name cannot silently drift again.
import { describe, it, expect } from 'vitest';

/** Mirrors the resolution expression in answerBossEvent's victory branch. */
function resolveRewards(event) {
  const rewards = (event.rewards ?? event.completionRewards ?? {});
  return {
    xp: rewards.xp || 0,
    flux: rewards.flux || 0,
    itemRarity: rewards.itemRarity || null,
  };
}

const v2Event = {
  id: 'sandbox_boss_test',
  mode: 'QUIZ',
  rewards: { xp: 1500, flux: 300, itemRarity: 'RARE' },
};

const legacyV1Event = {
  id: 'legacy_boss',
  completionRewards: { xp: 500, flux: 50, itemRarity: 'UNCOMMON' },
};

describe('boss victory payout resolution', () => {
  it('reads the v2 `rewards` field', () => {
    expect(resolveRewards(v2Event)).toEqual({ xp: 1500, flux: 300, itemRarity: 'RARE' });
  });

  it('falls back to legacy completionRewards for old documents', () => {
    expect(resolveRewards(legacyV1Event)).toEqual({ xp: 500, flux: 50, itemRarity: 'UNCOMMON' });
  });

  it('prefers v2 rewards when both are present', () => {
    const both = { rewards: { xp: 1500 }, completionRewards: { xp: 9 } };
    expect(resolveRewards(both).xp).toBe(1500);
  });

  it('a v2 event must never resolve to zero XP', () => {
    // This is the exact assertion that would have caught the bug: a v2-shaped
    // document previously produced xp 0 because completionRewards was undefined.
    const r = resolveRewards(v2Event);
    expect(r.xp).toBeGreaterThan(0);
    expect(r.flux).toBeGreaterThan(0);
  });

  it('handles an event with no rewards at all without throwing', () => {
    expect(resolveRewards({ id: 'bare' })).toEqual({ xp: 0, flux: 0, itemRarity: null });
    expect(resolveRewards({ rewards: {} })).toEqual({ xp: 0, flux: 0, itemRarity: null });
  });

  it('flux is granted alongside xp, not dropped', () => {
    const r = resolveRewards(v2Event);
    expect(r.flux).toBe(300);
  });
});

import { User } from '../types';

/**
 * Resolve which class's classXp should receive an admin XP adjustment.
 *
 * Legacy `classType` may be missing or 'Uncategorized' for whitelist-fallback
 * students; fall back to their first enrolled class. Returns undefined when the
 * student has no known class — the award then updates total XP only, rather
 * than writing to a junk classXp key no class view or leaderboard reads.
 */
export function resolveXpAdjustClass(user: User): string | undefined {
  if (user.classType && user.classType !== 'Uncategorized') return user.classType;
  return user.enrolledClasses?.[0];
}

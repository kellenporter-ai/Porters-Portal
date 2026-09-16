import { User } from '../types';

// Mirror of VALID_CLASS_TYPES in functions/src/core.ts — the awardXP callable
// rejects any classType outside this set with invalid-argument (400).
// 'Uncategorized' is a member of the server set but means "no class assigned",
// so it is never a valid adjustment target.
const VALID_CLASS_TYPES = [
  'AP Physics',
  'Honors Physics',
  'Forensic Science',
  'Uncategorized',
  'GLOBAL',
  'Sandbox Class',
];

/**
 * Resolve which class's classXp should receive an admin XP adjustment.
 *
 * Legacy `classType` may carry stale values (e.g. 'Physics') that the server
 * rejects with a 400 — validate against the server's class list and fall back
 * to the first valid enrolled class. Returns undefined when the student has
 * no known valid class — the award then updates total XP only, rather than
 * failing outright or writing to a junk classXp key no class view or
 * leaderboard reads.
 */
export function resolveXpAdjustClass(user: User): string | undefined {
  const candidates = [user.classType, user.enrolledClasses?.[0]];
  for (const candidate of candidates) {
    if (candidate && candidate !== 'Uncategorized' && VALID_CLASS_TYPES.includes(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

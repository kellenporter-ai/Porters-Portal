import { describe, it, expect } from 'vitest';
import { resolveXpAdjustClass } from '../xpAdjust';
import { User } from '../../types';

const baseUser = { id: 'u1', name: 'Test', email: 't@example.com' } as unknown as User;

describe('resolveXpAdjustClass', () => {
  it('uses the legacy classType when it is a real class', () => {
    const user = { ...baseUser, classType: 'AP Physics', enrolledClasses: ['AP Physics', 'Honors Physics'] } as User;
    expect(resolveXpAdjustClass(user)).toBe('AP Physics');
  });

  it('falls back to the first enrolled class when classType is Uncategorized', () => {
    const user = { ...baseUser, classType: 'Uncategorized', enrolledClasses: ['Forensic Science'] } as User;
    expect(resolveXpAdjustClass(user)).toBe('Forensic Science');
  });

  it('falls back to the first enrolled class when classType is missing', () => {
    const user = { ...baseUser, enrolledClasses: ['Honors Physics', 'AP Physics'] } as User;
    expect(resolveXpAdjustClass(user)).toBe('Honors Physics');
  });

  it('returns undefined when the student has no known class (XP-only award)', () => {
    const user = { ...baseUser, classType: 'Uncategorized' } as User;
    expect(resolveXpAdjustClass(user)).toBeUndefined();
  });

  it('uses the legacy classType when it is Physics', () => {
    const user = { ...baseUser, classType: 'Physics', enrolledClasses: ['AP Physics'] } as User;
    expect(resolveXpAdjustClass(user)).toBe('Physics');
  });

  it('prefers the legacy classType over the first enrolled class when both are valid', () => {
    const user = { ...baseUser, classType: 'Physics', enrolledClasses: ['Physics'] } as User;
    expect(resolveXpAdjustClass(user)).toBe('Physics');
  });

  it('ignores an unrecognized legacy classType and falls back to a valid enrolled class', () => {
    const user = { ...baseUser, classType: 'Chemistry', enrolledClasses: ['AP Physics'] } as User;
    expect(resolveXpAdjustClass(user)).toBe('AP Physics');
  });

  it('returns undefined when both classType and enrolled class are unrecognized values', () => {
    const user = { ...baseUser, classType: 'Chemistry', enrolledClasses: ['Chemistry'] } as User;
    expect(resolveXpAdjustClass(user)).toBeUndefined();
  });
});

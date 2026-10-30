import { describe, it, expect } from 'vitest';
import { shouldMirrorPublicProfile } from '../lib/public-profiles.js';

describe('shouldMirrorPublicProfile', () => {
  it('mirrors a student with no test-account flag', () => {
    expect(shouldMirrorPublicProfile({ role: 'STUDENT' })).toBe(true);
  });

  it('excludes a flagged student test account', () => {
    expect(shouldMirrorPublicProfile({ role: 'STUDENT', isTestAccount: true })).toBe(false);
  });

  it('mirrors a student with an explicit false flag', () => {
    expect(shouldMirrorPublicProfile({ role: 'STUDENT', isTestAccount: false })).toBe(true);
  });

  it('excludes non-students', () => {
    expect(shouldMirrorPublicProfile({ role: 'ADMIN' })).toBe(false);
  });

  it('excludes missing users', () => {
    expect(shouldMirrorPublicProfile(undefined)).toBe(false);
    expect(shouldMirrorPublicProfile(null)).toBe(false);
  });

  it('excludes a flagged non-student', () => {
    expect(shouldMirrorPublicProfile({ role: 'ADMIN', isTestAccount: true })).toBe(false);
  });

  it('treats only the literal boolean true as exclusion', () => {
    expect(shouldMirrorPublicProfile({ role: 'STUDENT', isTestAccount: 'yes' })).toBe(true);
    expect(shouldMirrorPublicProfile({ role: 'STUDENT', isTestAccount: 1 })).toBe(true);
  });
});

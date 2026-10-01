// Ownership-check mirror tests for classroomPushGrades (2026-09-30 bug).
// Bug: the check required teacherClasses (Portal ClassType strings) to contain
// the Google courseId, or an `ownedCourses` array that is never written —
// so it rejected every teacher. Fix: match link entry's `linkedBy` email
// against the teacher's user-doc email (linking is itself ownership proof,
// same identity/token that created the coursework), keeping ownedCourses.
import { describe, it, expect } from 'vitest';

// Mirror of the ownership gate in functions/src/classroom.ts (lines ~466-485)
function checkOwnership({ teacherEmail, ownedCourses, linkEntries }) {
  const email = (teacherEmail || '').toLowerCase();
  for (const entry of linkEntries) {
    const linkedBy = typeof entry.linkedBy === 'string' ? entry.linkedBy.toLowerCase() : '';
    const isOwner =
      ownedCourses.includes(entry.courseId) ||
      (linkedBy !== '' && linkedBy === email);
    if (!isOwner) {
      const err = new Error(`You do not own course ${entry.courseId}.`);
      err.code = 'permission-denied';
      throw err;
    }
  }
}

describe('classroomPushGrades ownership gate (2026-09-30 fix)', () => {
  it('allows the teacher who linked the course (linkedBy matches user doc email)', () => {
    expect(() => checkOwnership({
      teacherEmail: 'Teacher@School.org',
      ownedCourses: [],
      linkEntries: [{ courseId: '876234690433', linkedBy: 'teacher@school.org' }],
    })).not.toThrow();
  });

  it('allows via ownedCourses legacy array', () => {
    expect(() => checkOwnership({
      teacherEmail: 'teacher@school.org',
      ownedCourses: ['876234690433'],
      linkEntries: [{ courseId: '876234690433' }],
    })).not.toThrow();
  });

  it('REJECTS the old false-negative case: teacherClasses-held ClassType vs courseId (bug repro)', () => {
    // Before the fix this teacher was rejected even though teacherClasses
    // contained only Portal ClassType strings — not GC course IDs.
    let err;
    try {
      checkOwnership({
        teacherEmail: 'teacher@school.org',
        ownedCourses: [],
        linkEntries: [{ courseId: '876234690433' }],
      });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.code).toBe('permission-denied');
    expect(err.message).toMatch(/You do not own course 876234690433/);
  });

  it('rejects a different teacher who did not link and does not own', () => {
    let err;
    try {
      checkOwnership({
        teacherEmail: 'other@school.org',
        ownedCourses: [],
        linkEntries: [{ courseId: '876234690433', linkedBy: 'teacher@school.org' }],
      });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.code).toBe('permission-denied');
  });

  it('handles legacy link entries without linkedBy via ownedCourses', () => {
    expect(() => checkOwnership({
      teacherEmail: 'teacher@school.org',
      ownedCourses: ['123'],
      linkEntries: [{ courseId: '123' }],
    })).not.toThrow();
  });
});

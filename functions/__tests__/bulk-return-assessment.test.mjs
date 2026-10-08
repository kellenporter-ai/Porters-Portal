// returnOneSubmission helper unit tests — covers the refactor behind
// returnAssessment and the new bulkReturnAssessment bulk path.
// Emulator-free: stubs the Firestore surface the helper touches
// (submissions, assessment_sessions, lesson_block_responses, assignments,
// announcements, batches). Runs against compiled output (lib/).
import { describe, it, expect, vi } from 'vitest';
import {
  returnOneSubmission,
  SESSION_EXPIRY_GRACE_MS,
} from '../lib/assessment.js';

// Fixed reference must be anchored to the REAL clock — the implementation
// reads Date.now() internally, so timestamps are expressed relative to it.
const NOW = Date.now();
const ADMIN_UID = 'admin-1';

// Firestore Timestamp-like stub
const ts = (ms) => ({ toMillis: () => ms });

// ---------------------------------------------------------------------------
// Firestore stub builder
// ---------------------------------------------------------------------------
function makeDb({
  submissions = {},        // id -> data (absent key = doc does not exist)
  sessions = [],           // [{ id, data }] unused assessment_sessions
  assignments = {},        // assignmentId -> data
} = {}) {
  const writes = [];       // every committed write, for assertions
  const batchOps = [];     // ops queued on the current batch

  const record = (op) => { writes.push(op); batchOps.push(op); };

  const doc = (path) => ({
    path,
    get: vi.fn(async () => {
      const segments = path.split('/');
      const collection = segments[segments.length - 2];
      const id = segments[segments.length - 1];
      if (collection === 'submissions') {
        const data = submissions[id];
        return data
          ? { exists: true, data: () => data, ref: doc(path) }
          : { exists: false, data: () => undefined, ref: doc(path) };
      }
      if (collection === 'assignments') {
        const data = assignments[id];
        return data
          ? { exists: true, data: () => data, ref: doc(path) }
          : { exists: false, data: () => undefined, ref: doc(path) };
      }
      return { exists: false, data: () => undefined, ref: doc(path) };
    }),
    set: vi.fn(async (data) => record({ type: 'set', path, data })),
    update: vi.fn(async (data) => record({ type: 'update', path, data })),
  });

  // Chained where() filters accumulate; get() applies them so sessions for
  // other students/assignments don't leak across submissions in bulk tests.
  const makeQuery = (name, filters = []) => ({
    where: (field, op, value) => makeQuery(name, [...filters, { field, op, value }]),
    orderBy: () => ({ get: async () => {
      if (name !== 'assessment_sessions') return { empty: true, docs: [] };
      const docs = sessions
        .filter(({ data }) => filters.every(({ field, op, value }) => {
          if (op !== '==') return true;
          return data[field] === value;
        }))
        .map(({ id, data }) => ({ id, ...data, data: () => data }));
      return { empty: docs.length === 0, docs };
    } }),
  });

  const db = {
    doc,
    collection: (name) => ({
      doc: (id) => doc(`${name}/${id}`),
      where: (field, op, value) => makeQuery(name, [{ field, op, value }]),
      add: vi.fn(async (data) => record({ type: 'add', path: `${name}/auto`, data })),
    }),
    batch: () => ({
      set: (ref, data) => { batchOps.push({ type: 'set', path: ref.path, data }); },
      update: (ref, data) => { batchOps.push({ type: 'update', path: ref.path, data }); },
      commit: vi.fn(async () => { writes.push(...batchOps.splice(0)); }),
    }),
  };
  return { db, writes };
}

const assessmentSub = (overrides = {}) => ({
  userId: 'student-1',
  assignmentId: 'asg-1',
  assignmentTitle: 'Quiz 1',
  isAssessment: true,
  status: 'CLEAN',
  blockResponses: { b1: 'answer' },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Per-submission skip cases
// ---------------------------------------------------------------------------
describe('returnOneSubmission — skip cases', () => {
  it('returns { ok: false } for a missing submission', async () => {
    const { db } = makeDb({ submissions: {} });
    const result = await returnOneSubmission(db, 'nope', ADMIN_UID);
    expect(result).toEqual({ ok: false, reason: 'Submission not found' });
  });

  it('returns { ok: false } for a non-assessment submission', async () => {
    const { db } = makeDb({ submissions: { s1: assessmentSub({ isAssessment: false }) } });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: false, reason: 'Not an assessment submission' });
  });

  it('returns { ok: false } for an already-RETURNED submission', async () => {
    const { db } = makeDb({ submissions: { s1: assessmentSub({ status: 'RETURNED' }) } });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: false, reason: 'Already returned' });
  });

  it('returns { ok: false } when a live (unexpired) active session exists', async () => {
    const { db } = makeDb({
      submissions: { s1: assessmentSub() },
      sessions: [{ id: 'sess-1', data: { userId: 'student-1', assignmentId: 'asg-1', used: false, expiresAt: ts(NOW + 60_000) } }],
    });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: false, reason: 'Student has an active assessment session' });
  });

  it('returns { ok: false } when an unexpired session has a fresh heartbeat (idle bound)', async () => {
    const { db } = makeDb({
      submissions: { s1: assessmentSub() },
      sessions: [{ id: 'sess-1', data: { userId: 'student-1', assignmentId: 'asg-1', used: false, expiresAt: ts(NOW + 60 * 60_000), lastHeartbeatAt: ts(NOW - 10_000) } }],
    });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: false, reason: 'Student has an active assessment session' });
  });

  it('proceeds when an unexpired session is idle past MAX_SESSION_IDLE_MS (it gets claimed)', async () => {
    const { db, writes } = makeDb({
      submissions: { s1: assessmentSub() },
      sessions: [{ id: 'idle-1', data: { userId: 'student-1', assignmentId: 'asg-1', used: false, expiresAt: ts(NOW + 60 * 60_000), lastHeartbeatAt: ts(NOW - 31 * 60_000) } }],
      assignments: { 'asg-1': { classType: 'CSI' } },
    });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: true });
    expect(writes).toContainEqual({ type: 'update', path: 'assessment_sessions/idle-1', data: { used: true, usedAt: expect.any(Number) } });
  });

  it('proceeds when a session has no expiresAt (fail-closed stale claim)', async () => {
    const { db, writes } = makeDb({
      submissions: { s1: assessmentSub() },
      sessions: [{ id: 'noexp-1', data: { userId: 'student-1', assignmentId: 'asg-1', used: false } }],
      assignments: { 'asg-1': { classType: 'CSI' } },
    });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: true });
    expect(writes).toContainEqual({ type: 'update', path: 'assessment_sessions/noexp-1', data: { used: true, usedAt: expect.any(Number) } });
  });

  it('proceeds when only expired-past-grace sessions exist (they get claimed)', async () => {
    const { db, writes } = makeDb({
      submissions: { s1: assessmentSub() },
      sessions: [
        { id: 'stale-1', data: { userId: 'student-1', assignmentId: 'asg-1', used: false, expiresAt: ts(NOW - SESSION_EXPIRY_GRACE_MS - 1000) } },
      ],
      assignments: { 'asg-1': { classType: 'CSI' } },
    });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: true });
    // Stale session claimed, never deleted
    expect(writes).toContainEqual({ type: 'update', path: 'assessment_sessions/stale-1', data: { used: true, usedAt: expect.any(Number) } });
  });
});

// ---------------------------------------------------------------------------
// Happy path — identical behavior for direct (returnAssessment) and batched
// (bulkReturnAssessment) callers
// ---------------------------------------------------------------------------
describe('returnOneSubmission — happy path', () => {
  it('(direct) pre-fills draft, marks RETURNED preserving grades, announces', async () => {
    const { db, writes } = makeDb({
      submissions: { s1: assessmentSub({ rubricGrade: { score: 70 } }) },
      assignments: { 'asg-1': { classType: 'CSI' } },
    });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: true });

    // Draft pre-fill
    expect(writes).toContainEqual({
      type: 'set',
      path: 'lesson_block_responses/student-1_asg-1_blocks',
      data: expect.objectContaining({ userId: 'student-1', assignmentId: 'asg-1', retakePreFilled: true }),
    });
    // Submission marked RETURNED; grades untouched
    const subUpdate = writes.find(w => w.path === 'submissions/s1');
    expect(subUpdate.data.status).toBe('RETURNED');
    expect(subUpdate.data.returnedBy).toBe(ADMIN_UID);
    expect(subUpdate.data.rubricGrade).toBeUndefined();
    // Announcement targeted at the student
    const announcement = writes.find(w => w.path.startsWith('announcements/'));
    expect(announcement.data.classType).toBe('CSI');
    expect(announcement.data.targetStudentIds).toEqual(['student-1']);
  });

  it('(batched) queues identical ops on the batch; batch.commit flushes them', async () => {
    const { db, writes } = makeDb({
      submissions: { s1: assessmentSub() },
      assignments: { 'asg-1': { classType: 'CSI' } },
    });
    const batch = db.batch();
    const result = await returnOneSubmission(db, 's1', ADMIN_UID, batch);
    expect(result).toEqual({ ok: true });
    // Nothing committed until the caller commits the batch
    expect(writes).toEqual([]);
    await batch.commit();
    expect(writes.some(w => w.path === 'submissions/s1')).toBe(true);
    expect(writes.some(w => w.path.startsWith('announcements/'))).toBe(true);
  });

  it('skips draft pre-fill when blockResponses is empty', async () => {
    const { db, writes } = makeDb({
      submissions: { s1: assessmentSub({ blockResponses: {} }) },
      assignments: { 'asg-1': {} },
    });
    const result = await returnOneSubmission(db, 's1', ADMIN_UID);
    expect(result).toEqual({ ok: true });
    expect(writes.some(w => w.path.startsWith('lesson_block_responses/'))).toBe(false);
  });

  it('falls back to GLOBAL announcement classType when assignment missing', async () => {
    const { db, writes } = makeDb({ submissions: { s1: assessmentSub() } });
    await returnOneSubmission(db, 's1', ADMIN_UID);
    const announcement = writes.find(w => w.path.startsWith('announcements/'));
    expect(announcement.data.classType).toBe('GLOBAL');
  });
});

// ---------------------------------------------------------------------------
// Bulk path — mixed results never fail the whole batch
// ---------------------------------------------------------------------------
describe('returnOneSubmission — bulk path semantics', () => {
  it('returns valid submissions while collecting skips for RETURNED / live-session', async () => {
    const subs = {
      ok1: assessmentSub(),
      ok2: assessmentSub({ userId: 'student-2' }),
      alreadyReturned: assessmentSub({ userId: 'student-3', status: 'RETURNED' }),
      liveSession: assessmentSub({ userId: 'student-4' }),
      missing: undefined,
    };
    const { db } = makeDb({
      submissions: subs,
      sessions: [
        { id: 'sess-live', data: { userId: 'student-4', assignmentId: 'asg-1', used: false, expiresAt: ts(NOW + 60_000) } },
      ],
      assignments: { 'asg-1': { classType: 'CSI' } },
    });

    const ids = ['ok1', 'alreadyReturned', 'liveSession', 'missing', 'ok2'];
    const batch = db.batch();
    const results = await Promise.all(ids.map(id => returnOneSubmission(db, id, ADMIN_UID, batch)));
    await batch.commit();

    const returned = ids.filter((_, i) => results[i].ok);
    const skipped = ids
      .map((id, i) => ({ id, result: results[i] }))
      .filter(({ result }) => !result.ok)
      .map(({ id, result }) => ({ id, reason: result.reason }));
    expect(returned).toEqual(['ok1', 'ok2']);
    expect(skipped).toEqual([
      { id: 'alreadyReturned', reason: 'Already returned' },
      { id: 'liveSession', reason: 'Student has an active assessment session' },
      { id: 'missing', reason: 'Submission not found' },
    ]);
  });

  it('stale-session claims commit immediately even in batched mode', async () => {
    const { db, writes } = makeDb({
      submissions: { s1: assessmentSub() },
      sessions: [
        { id: 'stale-1', data: { userId: 'student-1', assignmentId: 'asg-1', used: false, expiresAt: ts(NOW - SESSION_EXPIRY_GRACE_MS - 1000) } },
      ],
      assignments: { 'asg-1': { classType: 'CSI' } },
    });
    const batch = db.batch();
    await returnOneSubmission(db, 's1', ADMIN_UID, batch);
    // Claim is immediate (not deferred to batch.commit)
    expect(writes).toContainEqual({ type: 'update', path: 'assessment_sessions/stale-1', data: { used: true, usedAt: expect.any(Number) } });
  });
});

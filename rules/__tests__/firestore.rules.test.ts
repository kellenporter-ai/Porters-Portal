/**
 * Phase 0 — Firestore security rules tests (run against the emulator via
 * `npm run test:rules`, which uses `firebase emulators:exec`).
 *
 * Coverage:
 *  - R8 BUG REPRODUCTION: student cannot write studentNotes.{blockId} on their
 *    own submission (asserts CURRENT denied behavior — Phase 1 flips it).
 *  - Baseline allow/deny for lesson_block_responses session gating.
 *  - Student delete of own draft doc.
 *  - submissions student-update whitelist (feedbackReadAt/feedbackReviewedAt).
 */
import { describe, it, beforeEach, beforeAll, afterAll, expect } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const PROJECT = 'porter-portal-rules-tests';

let testEnv: RulesTestEnvironment;

const STUDENT_A = 'student-a-uid';
const STUDENT_B = 'student-b-uid';
const ASSIGNMENT = 'assign-1';

function futureTimestamp() {
  return new Date(Date.now() + 60 * 60 * 1000);
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// R8 — Study notes silently lost (BUG REPRODUCTION)
// ---------------------------------------------------------------------------
describe('R8: studentNotes write on submissions (BUG REPRODUCTION)', () => {
  it('student is DENIED writing studentNotes on their own non-assessment submission', async () => {
    // Seed a student-owned submission doc as admin
    const submissionId = `${STUDENT_A}_${ASSIGNMENT}`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'submissions', submissionId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        metrics: { timeSpent: 100 },
        submittedAt: new Date().toISOString(),
        blockResponses: {},
      });
    });

    const student = testEnv.authenticatedContext(STUDENT_A).firestore();

    // saveStudentNote writes studentNotes.{blockId} — rules whitelist does not
    // include studentNotes → permission-denied. UI swallows the error (R8).
    // BUG: Phase 1 flips this to assertSucceeds.
    await assertFails(
      updateDoc(doc(student, 'submissions', submissionId), {
        'studentNotes.block1': 'my study note',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Baseline: submissions student-update whitelist
// ---------------------------------------------------------------------------
describe('submissions: student update whitelist', () => {
  const submissionId = `${STUDENT_A}_${ASSIGNMENT}`;

  async function seedSubmission(isAssessment = false) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'submissions', submissionId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        metrics: { timeSpent: 100 },
        submittedAt: new Date().toISOString(),
        blockResponses: {},
        ...(isAssessment ? { isAssessment: true, score: 0, status: 'pending' } : {}),
      });
    });
  }

  it('student can update feedbackReadAt on their own assessment submission', async () => {
    await seedSubmission(true);
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertSucceeds(
      updateDoc(doc(student, 'submissions', submissionId), {
        feedbackReadAt: new Date().toISOString(),
      }),
    );
  });

  it('student CANNOT update score on their own assessment submission', async () => {
    await seedSubmission(true);
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertFails(
      updateDoc(doc(student, 'submissions', submissionId), { score: 100 }),
    );
  });

  it('student CANNOT update another student submission', async () => {
    await seedSubmission(false);
    const studentB = testEnv.authenticatedContext(STUDENT_B).firestore();
    await assertFails(
      updateDoc(doc(studentB, 'submissions', submissionId), {
        feedbackReadAt: new Date().toISOString(),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Baseline: lesson_block_responses session gating
// ---------------------------------------------------------------------------
describe('lesson_block_responses: session gating', () => {
  const docId = `${STUDENT_A}_${ASSIGNMENT}_blocks`;

  async function seedResourceSession() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'resource_sessions', `${STUDENT_A}_${ASSIGNMENT}`), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        startedAt: new Date(),
      });
    });
  }

  async function seedAssessmentSession(token: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'assessment_sessions', token), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        expiresAt: futureTimestamp(),
        used: false,
      });
    });
  }

  it('student with an active resource session can CREATE their draft doc', async () => {
    await seedResourceSession();
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertSucceeds(
      setDoc(doc(student, 'lesson_block_responses', docId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        responses: { b1: 'x' },
        lastUpdated: new Date().toISOString(),
      }),
    );
  });

  it('student with an active assessment session token can CREATE their draft doc', async () => {
    await seedAssessmentSession('token-abc');
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertSucceeds(
      setDoc(doc(student, 'lesson_block_responses', docId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        sessionToken: 'token-abc',
        responses: { b1: 'x' },
        lastUpdated: new Date().toISOString(),
      }),
    );
  });

  it('student WITHOUT any session doc CANNOT create a draft doc', async () => {
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertFails(
      setDoc(doc(student, 'lesson_block_responses', docId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        responses: { b1: 'x' },
        lastUpdated: new Date().toISOString(),
      }),
    );
  });

  it('student with an active session can UPDATE their draft doc', async () => {
    await seedResourceSession();
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertSucceeds(
      setDoc(doc(student, 'lesson_block_responses', docId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        responses: { b1: 'x' },
        lastUpdated: new Date().toISOString(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(student, 'lesson_block_responses', docId), {
        'responses.b1': 'updated',
      }),
    );
  });

  it('student can DELETE their own draft doc', async () => {
    await seedResourceSession();
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertSucceeds(
      setDoc(doc(student, 'lesson_block_responses', docId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        responses: { b1: 'x' },
      }),
    );
    await assertSucceeds(deleteDoc(doc(student, 'lesson_block_responses', docId)));
  });

  it('student CANNOT write another student draft doc', async () => {
    await seedResourceSession();
    const studentB = testEnv.authenticatedContext(STUDENT_B).firestore();
    await assertFails(
      setDoc(doc(studentB, 'lesson_block_responses', docId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        responses: { b1: 'x' },
      }),
    );
  });
});

// Sanity check that the test env is wired to the emulator, not production.
describe('emulator wiring', () => {
  it('uses the emulator project id', () => {
    expect(testEnv.projectId).toBe(PROJECT);
  });
});

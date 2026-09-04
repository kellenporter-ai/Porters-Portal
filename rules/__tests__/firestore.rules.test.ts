/**
 * Phase 0 — Firestore security rules tests (run against the emulator via
 * `npm run test:rules`, which uses `firebase emulators:exec`).
 *
 * Coverage:
 *  - R8 FIXED: student CAN write studentNotes.{blockId} on their own submission
 *    (assessment and non-assessment); cannot write on others' docs or forge fields.
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
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
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
describe('R8: studentNotes write on submissions (FIXED — Phase 1)', () => {
  it('student is ALLOWED writing studentNotes on their own non-assessment submission', async () => {
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

    // R8 fix: studentNotes is now in the student-update allowlist.
    await assertSucceeds(
      updateDoc(doc(student, 'submissions', submissionId), {
        'studentNotes.block1': 'my study note',
      }),
    );
  });

  it('student is ALLOWED writing studentNotes on their own ASSESSMENT submission', async () => {
    const submissionId = `${STUDENT_A}_${ASSIGNMENT}`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'submissions', submissionId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        metrics: { timeSpent: 100 },
        submittedAt: new Date().toISOString(),
        blockResponses: {},
        isAssessment: true,
        score: 0,
        status: 'pending',
      });
    });

    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertSucceeds(
      updateDoc(doc(student, 'submissions', submissionId), {
        'studentNotes.block1': 'assessment study note',
      }),
    );
  });

  it('student CANNOT write studentNotes on another student\'s submission', async () => {
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

    const studentB = testEnv.authenticatedContext(STUDENT_B).firestore();
    await assertFails(
      updateDoc(doc(studentB, 'submissions', submissionId), {
        'studentNotes.block1': 'forgery attempt',
      }),
    );
  });

  it('student CANNOT update other fields while writing studentNotes', async () => {
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
    // Mixing studentNotes with a non-allowlisted field must still fail.
    await assertFails(
      updateDoc(doc(student, 'submissions', submissionId), {
        'studentNotes.block1': 'note',
        score: 100,
      }),
    );
  });

  // F2 — 4 KiB cap on studentNotes
  it('student is DENIED writing studentNotes over 4 KiB on non-assessment submission', async () => {
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
    // A single 4097-character note exceeds the cap
    await assertFails(
      updateDoc(doc(student, 'submissions', submissionId), {
        'studentNotes.big': 'x'.repeat(4097),
      }),
    );
  });

  it('student is ALLOWED writing studentNotes exactly 4 KiB on non-assessment submission', async () => {
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
    await assertSucceeds(
      updateDoc(doc(student, 'submissions', submissionId), {
        'studentNotes.big': 'x'.repeat(4090), // key 'big' (3) + 4090 = 4093 ≤ 4096
      }),
    );
  });

  it('student is DENIED writing studentNotes over 4 KiB on assessment submission', async () => {
    const submissionId = `${STUDENT_A}_${ASSIGNMENT}`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'submissions', submissionId), {
        userId: STUDENT_A,
        assignmentId: ASSIGNMENT,
        metrics: { timeSpent: 100 },
        submittedAt: new Date().toISOString(),
        blockResponses: {},
        isAssessment: true,
        score: 0,
        status: 'pending',
      });
    });
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertFails(
      updateDoc(doc(student, 'submissions', submissionId), {
        'studentNotes.big': 'x'.repeat(4097),
      }),
    );
  });

  it('student CANNOT write studentNotes over 4 KiB on another student\'s submission', async () => {
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
    const studentB = testEnv.authenticatedContext(STUDENT_B).firestore();
    await assertFails(
      updateDoc(doc(studentB, 'submissions', submissionId), {
        'studentNotes.block1': 'x'.repeat(4097),
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

// ---------------------------------------------------------------------------
// Phase 2a — assignment_content (heavy payload, same read access as assignments)
// ---------------------------------------------------------------------------
describe('assignment_content: content split from assignments', () => {
  const contentDoc = {
    htmlContent: '<p>hello</p>',
    lessonBlocks: [{ id: 'b1', type: 'text', content: 'hi' }],
    updatedAt: '2026-01-01T00:00:00Z',
  };

  async function seedContentDoc() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'assignment_content', ASSIGNMENT), contentDoc);
    });
  }

  it('student CAN read assignment_content (content not secret)', async () => {
    await seedContentDoc();
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertSucceeds(getDoc(doc(student, 'assignment_content', ASSIGNMENT)));
  });

  it('student CANNOT write assignment_content', async () => {
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertFails(
      setDoc(doc(student, 'assignment_content', ASSIGNMENT), contentDoc),
    );
    await seedContentDoc();
    await assertFails(
      updateDoc(doc(student, 'assignment_content', ASSIGNMENT), {
        htmlContent: '<p>tampered</p>',
      }),
    );
  });

  it('unauthenticated user CANNOT read assignment_content', async () => {
    await seedContentDoc();
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'assignment_content', ASSIGNMENT)));
  });

  it('admin CAN read and write assignment_content', async () => {
    const admin = testEnv.authenticatedContext('admin-uid', { admin: true }).firestore();
    await assertSucceeds(
      setDoc(doc(admin, 'assignment_content', ASSIGNMENT), contentDoc),
    );
    await assertSucceeds(getDoc(doc(admin, 'assignment_content', ASSIGNMENT)));
    await assertSucceeds(
      updateDoc(doc(admin, 'assignment_content', ASSIGNMENT), {
        htmlContent: '<p>updated</p>',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 1e — assignment_keys (answer keys, admin-only collection)
// ---------------------------------------------------------------------------
describe('assignment_keys: admin-only answer keys', () => {
  const keysDoc = { lessonBlocks: [{ id: 'b1', type: 'MC', correctAnswer: 1 }] };

  async function seedKeysDoc() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'assignment_keys', ASSIGNMENT), keysDoc);
    });
  }

  it('student CANNOT read assignment_keys', async () => {
    await seedKeysDoc();
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertFails(getDoc(doc(student, 'assignment_keys', ASSIGNMENT)));
  });

  it('student CANNOT write assignment_keys', async () => {
    const student = testEnv.authenticatedContext(STUDENT_A).firestore();
    await assertFails(
      setDoc(doc(student, 'assignment_keys', ASSIGNMENT), keysDoc),
    );
    await seedKeysDoc();
    await assertFails(
      updateDoc(doc(student, 'assignment_keys', ASSIGNMENT), {
        'lessonBlocks.b1.correctAnswer': 0,
      }),
    );
  });

  it('unauthenticated user CANNOT read assignment_keys', async () => {
    await seedKeysDoc();
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'assignment_keys', ASSIGNMENT)));
  });

  it('admin CAN read and write assignment_keys', async () => {
    const admin = testEnv.authenticatedContext('admin-uid', { admin: true }).firestore();
    await assertSucceeds(
      setDoc(doc(admin, 'assignment_keys', ASSIGNMENT), keysDoc),
    );
    await assertSucceeds(getDoc(doc(admin, 'assignment_keys', ASSIGNMENT)));
    await assertSucceeds(
      updateDoc(doc(admin, 'assignment_keys', ASSIGNMENT), {
        'lessonBlocks.b1.correctAnswer': 2,
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
